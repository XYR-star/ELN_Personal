<?php

declare(strict_types=1);

namespace Elabftw\Elabftw;

use Exception;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

require_once 'app/init.inc.php';

$Response = new Response();

const LITERATURE_ROOT = '/elabftw/silverbullet-space';
const ZOTERO_API_BASE = 'https://api.zotero.org';
const ZOTERO_WEBDAV_DIR = '/elabftw/zotero-webdav';

function literatureJson(Response $Response, mixed $payload, int $status = 200): Response
{
    $Response->setStatusCode($status);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->headers->set('Cache-Control', 'no-store');
    $Response->setContent($status === 204 ? '' : json_encode($payload, JSON_THROW_ON_ERROR));
    return $Response;
}

function literatureBody(): array
{
    $raw = file_get_contents('php://input') ?: '{}';
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?: array();
}

function literatureCleanText(mixed $value, int $maxLen = 20000): string
{
    $text = trim((string) $value);
    if (mb_strlen($text) > $maxLen) {
        return mb_substr($text, 0, $maxLen);
    }
    return $text;
}

function literatureSafeKey(mixed $value): string
{
    return preg_replace('/[^A-Za-z0-9_-]/', '', (string) $value) ?: '';
}

function literaturePositiveIds(mixed $values): array
{
    if (!is_array($values)) {
        return array();
    }
    $ids = array_values(array_unique(array_filter(array_map('intval', $values), fn (int $id): bool => $id > 0)));
    return $ids;
}

function literatureDataDir(): string
{
    return LITERATURE_ROOT . '/Literature';
}

function literatureConfigPath(): string
{
    return literatureDataDir() . '/zotero-config.json';
}

function literatureEnsureDataDir(): void
{
    $dir = literatureDataDir();
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create literature data directory');
    }
}

function literatureCardsDir(): string
{
    return literatureDataDir() . '/cards';
}

function literaturePapersDir(): string
{
    return literatureDataDir() . '/papers';
}

function literatureEvidenceRootDir(): string
{
    return literatureDataDir() . '/evidence';
}

function literatureAnnotationRootDir(): string
{
    return literatureDataDir() . '/annotations';
}

function literatureEvidenceDir(string $paperKey): string
{
    return literatureEvidenceRootDir() . '/' . literatureSafeKey($paperKey);
}

function literatureAnnotationDir(string $paperKey): string
{
    return literatureAnnotationRootDir() . '/' . literatureSafeKey($paperKey);
}

function literatureEnsureCardsDir(): void
{
    literatureEnsureDataDir();
    $dir = literatureCardsDir();
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create literature card directory');
    }
}

function literatureEnsurePapersDir(): void
{
    literatureEnsureDataDir();
    $dir = literaturePapersDir();
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create literature paper directory');
    }
}

function literatureEnsureEvidenceDir(string $paperKey): void
{
    literatureEnsureDataDir();
    $dir = literatureEvidenceDir($paperKey);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create literature evidence directory');
    }
}

function literatureEnsureAnnotationDir(string $paperKey): void
{
    literatureEnsureDataDir();
    $dir = literatureAnnotationDir($paperKey);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create literature annotation directory');
    }
}

function literatureCardPath(string $itemKey): string
{
    return literatureCardsDir() . '/' . literatureSafeKey($itemKey) . '.json';
}

function literaturePaperPath(string $paperKey): string
{
    return literaturePapersDir() . '/' . literatureSafeKey($paperKey) . '.json';
}

function literatureEvidencePath(string $paperKey, string $evidenceId): string
{
    return literatureEvidenceDir($paperKey) . '/' . literatureSafeKey($evidenceId) . '.json';
}

function literatureAnnotationPath(string $paperKey, string $annotationId): string
{
    return literatureAnnotationDir($paperKey) . '/' . literatureSafeKey($annotationId) . '.json';
}

function literatureCleanTags(mixed $values): array
{
    if (!is_array($values)) {
        return array();
    }
    $tags = array();
    foreach ($values as $value) {
        $tag = strtolower(literatureSafeKey(ltrim((string) $value, '#')));
        if ($tag !== '') {
            $tags[] = $tag;
        }
    }
    return array_values(array_unique($tags));
}

function literatureEvidencePrefix(string $type): string
{
    return match ($type) {
        'figure' => 'fig',
        'finding' => 'finding',
        'protocol' => 'protocol',
        default => 'quote',
    };
}

function literatureClampUnit(mixed $value): float
{
    $number = (float) $value;
    if (!is_finite($number)) {
        return 0.0;
    }
    return min(1.0, max(0.0, $number));
}

function literatureNow(): string
{
    return (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))->format(\DateTimeInterface::ATOM);
}

function literatureReadCard(string $itemKey): ?array
{
    $path = literatureCardPath($itemKey);
    if (!is_file($path)) {
        return null;
    }
    $card = json_decode(file_get_contents($path) ?: '{}', true, 512, JSON_THROW_ON_ERROR);
    return literatureNormalizeCard($card);
}

function literatureListCards(): array
{
    $cards = array();
    foreach (glob(literatureCardsDir() . '/*.json') ?: array() as $file) {
        $cards[] = literatureNormalizeCard(json_decode(file_get_contents($file) ?: '{}', true, 512, JSON_THROW_ON_ERROR));
    }
    usort($cards, fn (array $a, array $b): int => strcmp($b['modified_at'], $a['modified_at']));
    return $cards;
}

function literatureNormalizeCard(array $body): array
{
    $itemKey = literatureSafeKey($body['itemKey'] ?? $body['item_key'] ?? '');
    if ($itemKey === '') {
        throw new Exception('itemKey is required');
    }
    $status = (string) ($body['status'] ?? 'unread');
    if (!in_array($status, array('unread', 'reading', 'read', 'important'), true)) {
        $status = 'unread';
    }
    return array(
        'itemKey' => $itemKey,
        'status' => $status,
        'summary' => literatureCleanText($body['summary'] ?? '', 4000),
        'note' => literatureCleanText($body['note'] ?? '', 12000),
        'linked_experiments' => literaturePositiveIds($body['linked_experiments'] ?? array()),
        'linked_resources' => literaturePositiveIds($body['linked_resources'] ?? array()),
        'modified_at' => $body['modified_at'] ?? literatureNow(),
    );
}

function literatureWriteCard(array $body): array
{
    literatureEnsureCardsDir();
    $card = literatureNormalizeCard(array_merge($body, array(
        'modified_at' => literatureNow(),
    )));
    file_put_contents(literatureCardPath($card['itemKey']), json_encode($card, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    return $card;
}

function literatureNormalizePaper(array $body): array
{
    $key = literatureSafeKey($body['key'] ?? $body['itemKey'] ?? $body['item_key'] ?? '');
    if ($key === '') {
        throw new Exception('paper key is required');
    }
    return array(
        'key' => $key,
        'version' => (int) ($body['version'] ?? 0),
        'itemType' => (string) ($body['itemType'] ?? 'localPaper'),
        'title' => literatureCleanText($body['title'] ?? 'Untitled paper', 500),
        'creators' => is_array($body['creators'] ?? null) ? array_values(array_filter(array_map(fn (mixed $creator): string => literatureCleanText($creator, 120), $body['creators']))) : array(),
        'year' => literatureCleanText($body['year'] ?? '', 16),
        'publicationTitle' => literatureCleanText($body['publicationTitle'] ?? $body['publication_title'] ?? '', 300),
        'date' => literatureCleanText($body['date'] ?? '', 80),
        'doi' => literatureCleanText($body['doi'] ?? $body['DOI'] ?? '', 255),
        'url' => literatureCleanText($body['url'] ?? '', 1000),
        'abstractNote' => literatureCleanText($body['abstractNote'] ?? '', 4000),
        'tags' => literatureCleanTags($body['tags'] ?? array()),
        'collections' => array(),
        'dateModified' => (string) ($body['modified_at'] ?? literatureNow()),
        'zoteroUrl' => '',
        'created_at' => (string) ($body['created_at'] ?? literatureNow()),
        'modified_at' => (string) ($body['modified_at'] ?? literatureNow()),
        'local' => true,
    );
}

function literatureReadPaper(string $paperKey): ?array
{
    $path = literaturePaperPath($paperKey);
    if (!is_file($path)) {
        return null;
    }
    return literatureNormalizePaper(json_decode(file_get_contents($path) ?: '{}', true, 512, JSON_THROW_ON_ERROR));
}

function literatureListPapers(): array
{
    $papers = array();
    foreach (glob(literaturePapersDir() . '/*.json') ?: array() as $file) {
        $papers[] = literatureNormalizePaper(json_decode(file_get_contents($file) ?: '{}', true, 512, JSON_THROW_ON_ERROR));
    }
    usort($papers, fn (array $a, array $b): int => strcmp($b['modified_at'], $a['modified_at']));
    return $papers;
}

function literatureWritePaper(array $body): array
{
    literatureEnsurePapersDir();
    $existing = literatureReadPaper((string) ($body['key'] ?? $body['itemKey'] ?? $body['item_key'] ?? '')) ?? array();
    $paper = literatureNormalizePaper(array_merge($existing, $body, array(
        'created_at' => $existing['created_at'] ?? literatureNow(),
        'modified_at' => literatureNow(),
    )));
    file_put_contents(literaturePaperPath($paper['key']), json_encode($paper, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    return $paper;
}

function literatureNormalizeEvidence(array $body): array
{
    $paperKey = literatureSafeKey($body['paperKey'] ?? $body['paper_key'] ?? '');
    if ($paperKey === '') {
        throw new Exception('paperKey is required');
    }
    $type = (string) ($body['type'] ?? 'quote');
    if (!in_array($type, array('quote', 'figure', 'finding', 'protocol'), true)) {
        $type = 'quote';
    }
    $createdAt = (string) ($body['created_at'] ?? literatureNow());
    $id = literatureSafeKey($body['id'] ?? '') ?: literatureEvidencePrefix($type) . '-' . substr(preg_replace('/[^0-9]/', '', $createdAt) ?: date('YmdHis'), 0, 14);
    return array(
        'id' => $id,
        'paperKey' => $paperKey,
        'type' => $type,
        'page' => literatureCleanText($body['page'] ?? '', 80),
        'section' => literatureCleanText($body['section'] ?? '', 200),
        'original_text' => literatureCleanText($body['original_text'] ?? '', 20000),
        'my_note' => literatureCleanText($body['my_note'] ?? '', 12000),
        'image_url' => literatureCleanText($body['image_url'] ?? '', 1000),
        'image_path' => literatureCleanText($body['image_path'] ?? '', 1000),
        'linked_experiments' => literaturePositiveIds($body['linked_experiments'] ?? array()),
        'linked_resources' => literaturePositiveIds($body['linked_resources'] ?? array()),
        'created_at' => $createdAt,
        'modified_at' => (string) ($body['modified_at'] ?? literatureNow()),
        'reference' => "[[Evidence:{$paperKey}#{$id}]]",
    );
}

function literatureNormalizeAnnotation(array $body): array
{
    $paperKey = literatureSafeKey($body['paperKey'] ?? $body['paper_key'] ?? '');
    if ($paperKey === '') {
        throw new Exception('paperKey is required');
    }
    $attachmentKey = literatureSafeKey($body['attachmentKey'] ?? $body['attachment_key'] ?? '');
    if ($attachmentKey === '') {
        throw new Exception('attachmentKey is required');
    }
    $tool = (string) ($body['tool'] ?? 'highlight');
    if (!in_array($tool, array('highlight', 'box', 'ellipse'), true)) {
        $tool = 'highlight';
    }
    $createdAt = (string) ($body['created_at'] ?? literatureNow());
    $id = literatureSafeKey($body['id'] ?? '') ?: 'ann-' . substr(preg_replace('/[^0-9]/', '', $createdAt) ?: date('YmdHis'), 0, 14);
    $rect = is_array($body['rect'] ?? null) ? $body['rect'] : array();
    return array(
        'id' => $id,
        'paperKey' => $paperKey,
        'attachmentKey' => $attachmentKey,
        'tool' => $tool,
        'page' => max(1, (int) ($body['page'] ?? 1)),
        'rect' => array(
            'x' => literatureClampUnit($rect['x'] ?? 0),
            'y' => literatureClampUnit($rect['y'] ?? 0),
            'width' => literatureClampUnit($rect['width'] ?? 0),
            'height' => literatureClampUnit($rect['height'] ?? 0),
        ),
        'color' => literatureCleanText($body['color'] ?? '#29aeb9', 32),
        'quote' => literatureCleanText($body['quote'] ?? '', 20000),
        'note' => literatureCleanText($body['note'] ?? '', 12000),
        'created_at' => $createdAt,
        'modified_at' => (string) ($body['modified_at'] ?? literatureNow()),
        'reference' => "[[PaperAnnotation:{$paperKey}#{$id}]]",
    );
}

function literatureListEvidence(string $paperKey): array
{
    $evidence = array();
    foreach (glob(literatureEvidenceDir($paperKey) . '/*.json') ?: array() as $file) {
        $evidence[] = literatureNormalizeEvidence(json_decode(file_get_contents($file) ?: '{}', true, 512, JSON_THROW_ON_ERROR));
    }
    usort($evidence, fn (array $a, array $b): int => strcmp($b['modified_at'], $a['modified_at']));
    return $evidence;
}

function literatureWriteEvidence(array $body): array
{
    $paperKey = literatureSafeKey($body['paperKey'] ?? $body['paper_key'] ?? '');
    literatureEnsureEvidenceDir($paperKey);
    if (!literatureReadPaper($paperKey) && !empty($body['paper'])) {
        literatureWritePaper(array_merge($body['paper'], array('key' => $paperKey)));
    }
    $evidence = literatureNormalizeEvidence(array_merge($body, array(
        'created_at' => $body['created_at'] ?? literatureNow(),
        'modified_at' => literatureNow(),
    )));
    file_put_contents(literatureEvidencePath($evidence['paperKey'], $evidence['id']), json_encode($evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    return $evidence;
}

function literatureDeleteEvidence(string $paperKey, string $evidenceId): void
{
    $path = literatureEvidencePath($paperKey, $evidenceId);
    if (is_file($path)) {
        unlink($path);
    }
}

function literatureListAnnotations(string $paperKey): array
{
    $annotations = array();
    foreach (glob(literatureAnnotationDir($paperKey) . '/*.json') ?: array() as $file) {
        $annotations[] = literatureNormalizeAnnotation(json_decode(file_get_contents($file) ?: '{}', true, 512, JSON_THROW_ON_ERROR));
    }
    usort($annotations, fn (array $a, array $b): int => strcmp($b['modified_at'], $a['modified_at']));
    return $annotations;
}

function literatureWriteAnnotation(array $body): array
{
    $paperKey = literatureSafeKey($body['paperKey'] ?? $body['paper_key'] ?? '');
    literatureEnsureAnnotationDir($paperKey);
    $annotation = literatureNormalizeAnnotation(array_merge($body, array(
        'created_at' => $body['created_at'] ?? literatureNow(),
        'modified_at' => literatureNow(),
    )));
    file_put_contents(literatureAnnotationPath($annotation['paperKey'], $annotation['id']), json_encode($annotation, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    return $annotation;
}

function literatureDeleteAnnotation(string $paperKey, string $annotationId): void
{
    $path = literatureAnnotationPath($paperKey, $annotationId);
    if (is_file($path)) {
        unlink($path);
    }
}

function literatureDeletePaper(string $paperKey): void
{
    foreach (glob(literatureEvidenceDir($paperKey) . '/*.json') ?: array() as $file) {
        unlink($file);
    }
    $dir = literatureEvidenceDir($paperKey);
    if (is_dir($dir)) {
        rmdir($dir);
    }
    $path = literaturePaperPath($paperKey);
    if (is_file($path)) {
        unlink($path);
    }
}

function literatureConfig(): array
{
    $config = array(
        'api_key' => getenv('ZOTERO_API_KEY') ?: '',
        'library_id' => getenv('ZOTERO_LIBRARY_ID') ?: '',
        'library_type' => strtolower(getenv('ZOTERO_LIBRARY_TYPE') ?: 'user'),
    );
    $file = literatureConfigPath();
    if (is_file($file)) {
        $fromFile = json_decode(file_get_contents($file) ?: '{}', true, 512, JSON_THROW_ON_ERROR) ?: array();
        $config = array_merge($config, array_filter(array(
            'api_key' => $fromFile['api_key'] ?? '',
            'library_id' => $fromFile['library_id'] ?? '',
            'library_type' => strtolower((string) ($fromFile['library_type'] ?? '')),
        )));
    }
    $config['library_type'] = $config['library_type'] === 'group' ? 'group' : 'user';
    $config['configured'] = $config['api_key'] !== '' && preg_match('/^\d+$/', (string) $config['library_id']) === 1;
    return $config;
}

function literaturePublicConfig(array $config): array
{
    return array(
        'configured' => (bool) $config['configured'],
        'library_id' => (string) ($config['library_id'] ?? ''),
        'library_type' => $config['library_type'] === 'group' ? 'group' : 'user',
        'has_api_key' => (string) ($config['api_key'] ?? '') !== '',
        'config_path' => literatureConfigPath(),
    );
}

function literatureWriteConfig(array $body): array
{
    literatureEnsureDataDir();
    $apiKey = literatureCleanText($body['api_key'] ?? '', 255);
    $libraryId = literatureCleanText($body['library_id'] ?? '', 64);
    $libraryType = strtolower(literatureCleanText($body['library_type'] ?? 'user', 16));
    if ($apiKey === '') {
        throw new Exception('Zotero API key is required');
    }
    if (!preg_match('/^\d+$/', $libraryId)) {
        throw new Exception('Zotero library id must be numeric');
    }
    if (!in_array($libraryType, array('user', 'group'), true)) {
        throw new Exception('Zotero library type must be user or group');
    }
    $config = array(
        'api_key' => $apiKey,
        'library_id' => $libraryId,
        'library_type' => $libraryType,
        'updated_at' => (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))->format(\DateTimeInterface::ATOM),
    );
    file_put_contents(literatureConfigPath(), json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    chmod(literatureConfigPath(), 0640);
    return literaturePublicConfig(array_merge($config, array('configured' => true)));
}

function literaturePrefix(array $config): string
{
    return ($config['library_type'] === 'group' ? 'groups' : 'users') . '/' . $config['library_id'];
}

function literatureZoteroRequest(array $config, string $path, array $query = array()): array
{
    if (!$config['configured']) {
        throw new Exception('Zotero API is not configured');
    }
    $query = array_filter($query, fn (mixed $value): bool => $value !== null && $value !== '');
    $url = ZOTERO_API_BASE . '/' . ltrim($path, '/');
    if ($query) {
        $url .= '?' . http_build_query($query);
    }
    if (!function_exists('curl_init')) {
        throw new Exception('PHP cURL extension is required for Zotero API requests');
    }
    $curl = curl_init($url);
    curl_setopt_array($curl, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => array(
            'Zotero-API-Key: ' . $config['api_key'],
            'Zotero-API-Version: 3',
        ),
    ));
    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    if ($raw === false || $status >= 400) {
        throw new Exception($error !== '' ? $error : "Zotero request failed ({$status})");
    }
    return json_decode((string) $raw, true, 512, JSON_THROW_ON_ERROR) ?: array();
}

function literatureNormalizeAttachment(array $item): array
{
    $data = $item['data'] ?? $item;
    $key = literatureSafeKey($data['key'] ?? $item['key'] ?? '');
    $filename = (string) ($data['filename'] ?? $data['title'] ?? 'Attachment');
    $contentType = (string) ($data['contentType'] ?? '');
    $kind = literatureAttachmentKind($contentType, $filename);
    $zipPath = ZOTERO_WEBDAV_DIR . '/' . $key . '.zip';
    $fileUrl = $key !== '' ? '/literature-api.php?action=attachment&attachment_key=' . rawurlencode($key) : '';
    return array(
        'key' => $key,
        'title' => (string) ($data['title'] ?? $filename),
        'filename' => $filename,
        'contentType' => $contentType,
        'linkMode' => (string) ($data['linkMode'] ?? ''),
        'parentItemKey' => literatureSafeKey($data['parentItem'] ?? ''),
        'kind' => $kind,
        'is_pdf' => $kind === 'pdf',
        'is_image' => $kind === 'image',
        'annotatable' => in_array($kind, array('pdf', 'image', 'html'), true),
        'available' => $key !== '' && is_file($zipPath),
        'file_url' => $fileUrl,
        'preview_url' => in_array($kind, array('pdf', 'image', 'html'), true) ? $fileUrl : '',
        'pdf_url' => $kind === 'pdf' ? $fileUrl : '',
        'image_url' => $kind === 'image' ? $fileUrl : '',
    );
}

function literatureAttachmentKind(string $contentType, string $filename): string
{
    $type = strtolower($contentType);
    $name = strtolower($filename);
    if (str_contains($type, 'pdf') || str_ends_with($name, '.pdf')) {
        return 'pdf';
    }
    if (
        str_starts_with($type, 'image/png')
        || str_starts_with($type, 'image/jpeg')
        || str_starts_with($type, 'image/jpg')
        || str_starts_with($type, 'image/gif')
        || str_starts_with($type, 'image/webp')
        || str_starts_with($type, 'image/bmp')
        || preg_match('/\.(png|jpe?g|gif|webp|bmp)$/', $name) === 1
    ) {
        return 'image';
    }
    if (str_contains($type, 'html') || preg_match('/\.(html?|xhtml)$/', $name) === 1) {
        return 'html';
    }
    return 'other';
}

function literatureListAttachments(array $config, string $paperKey): array
{
    $paperKey = literatureSafeKey($paperKey);
    if ($paperKey === '') {
        return array();
    }
    $prefix = literaturePrefix($config);
    $children = literatureZoteroRequest($config, "{$prefix}/items/{$paperKey}/children", array(
        'format' => 'json',
        'include' => 'data',
        'limit' => 100,
    ));
    $attachments = array();
    foreach ($children as $child) {
        $data = $child['data'] ?? $child;
        if (($data['itemType'] ?? '') !== 'attachment') {
            continue;
        }
        $attachments[] = literatureNormalizeAttachment($child);
    }
    return $attachments;
}

function literatureContentTypeForFile(string $filename): string
{
    return match (strtolower(pathinfo($filename, PATHINFO_EXTENSION))) {
        'pdf' => 'application/pdf',
        'png' => 'image/png',
        'jpg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'bmp' => 'image/bmp',
        default => 'application/octet-stream',
    };
}

function literatureReadAttachmentArchive(string $attachmentKey, array $extensions = array()): array
{
    $attachmentKey = literatureSafeKey($attachmentKey);
    if ($attachmentKey === '') {
        throw new Exception('attachmentKey is required');
    }
    $zipPath = ZOTERO_WEBDAV_DIR . '/' . $attachmentKey . '.zip';
    if (!is_file($zipPath)) {
        throw new Exception('Attachment is not available in WebDAV yet');
    }
    $zip = new \ZipArchive();
    if ($zip->open($zipPath) !== true) {
        throw new Exception('Could not open Zotero attachment archive');
    }
    $fileName = '';
    $normalizedExtensions = array_map(fn (string $ext): string => strtolower(ltrim($ext, '.')), $extensions);
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string) $zip->getNameIndex($i);
        if (str_ends_with($name, '/')) {
            continue;
        }
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!$normalizedExtensions || in_array($ext, $normalizedExtensions, true)) {
            $fileName = $name;
            break;
        }
    }
    if ($fileName === '') {
        $zip->close();
        throw new Exception('No supported file found in Zotero attachment archive');
    }
    $content = $zip->getFromName($fileName);
    $zip->close();
    if ($content === false) {
        throw new Exception('Could not read file from Zotero attachment archive');
    }
    return array(
        'name' => $fileName,
        'content' => $content,
        'contentType' => literatureContentTypeForFile($fileName),
    );
}

function literatureAttachmentResponse(Response $Response, string $attachmentKey, array $extensions = array()): Response
{
    $file = literatureReadAttachmentArchive($attachmentKey, $extensions);
    $inline = str_starts_with($file['contentType'], 'image/') || $file['contentType'] === 'application/pdf';
    $Response->setStatusCode(200);
    $Response->headers->set('Content-Type', $file['contentType']);
    $Response->headers->set('Content-Disposition', ($inline ? 'inline' : 'attachment') . '; filename="' . addcslashes(basename($file['name']), '"\\') . '"');
    $Response->headers->set('Cache-Control', 'private, max-age=300');
    $Response->setContent($file['content']);
    return $Response;
}

function literatureCreatorName(array $creator): string
{
    if (!empty($creator['name'])) {
        return (string) $creator['name'];
    }
    return trim((string) ($creator['firstName'] ?? '') . ' ' . (string) ($creator['lastName'] ?? ''));
}

function literatureNormalizeItem(array $item): array
{
    $data = $item['data'] ?? $item;
    $date = (string) ($data['date'] ?? '');
    preg_match('/\b(18|19|20)\d{2}\b/', $date, $yearMatch);
    return array(
        'key' => (string) ($data['key'] ?? $item['key'] ?? ''),
        'version' => (int) ($data['version'] ?? $item['version'] ?? 0),
        'itemType' => (string) ($data['itemType'] ?? ''),
        'title' => (string) ($data['title'] ?? 'Untitled'),
        'creators' => array_values(array_filter(array_map('Elabftw\Elabftw\literatureCreatorName', is_array($data['creators'] ?? null) ? $data['creators'] : array()))),
        'year' => $yearMatch[0] ?? '',
        'publicationTitle' => (string) ($data['publicationTitle'] ?? $data['bookTitle'] ?? $data['websiteTitle'] ?? ''),
        'date' => $date,
        'doi' => (string) ($data['DOI'] ?? ''),
        'url' => (string) ($data['url'] ?? ''),
        'abstractNote' => (string) ($data['abstractNote'] ?? ''),
        'tags' => array_values(array_filter(array_map(fn (mixed $tag): string => is_array($tag) ? (string) ($tag['tag'] ?? '') : (string) $tag, is_array($data['tags'] ?? null) ? $data['tags'] : array()))),
        'collections' => is_array($data['collections'] ?? null) ? $data['collections'] : array(),
        'dateModified' => (string) ($data['dateModified'] ?? ''),
        'zoteroUrl' => (string) ($item['links']['alternate']['href'] ?? ''),
    );
}

function literatureEvidenceMapForItems(array $items): array
{
    $map = array();
    foreach ($items as $item) {
        $key = literatureSafeKey($item['key'] ?? '');
        if ($key !== '') {
            $map[$key] = literatureListEvidence($key);
        }
    }
    return $map;
}

function literatureAnnotationMapForItems(array $items): array
{
    $map = array();
    foreach ($items as $item) {
        $key = literatureSafeKey($item['key'] ?? '');
        if ($key !== '') {
            $map[$key] = literatureListAnnotations($key);
        }
    }
    return $map;
}

function literatureTagsFromItems(array $items): array
{
    $seen = array();
    $tags = array();
    foreach ($items as $item) {
        foreach (is_array($item['tags'] ?? null) ? $item['tags'] : array() as $tag) {
            $value = trim(is_array($tag) ? (string) ($tag['tag'] ?? '') : (string) $tag);
            $key = mb_strtolower($value);
            if ($value === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $tags[] = array('tag' => $value);
        }
    }
    return $tags;
}

try {
    $Response->prepare($Request);
    $method = $Request->getMethod();
    $config = literatureConfig();

    if ($method === 'GET') {
        if ((string) $Request->query->get('action') === 'config') {
            literatureJson($Response, array('config' => literaturePublicConfig($config)));
        } elseif ((string) $Request->query->get('action') === 'attachments') {
            $paperKey = literatureSafeKey($Request->query->get('paper_key') ?? $Request->query->get('paperKey'));
            literatureJson($Response, array(
                'attachments' => literatureListAttachments($config, $paperKey),
                'annotations' => literatureListAnnotations($paperKey),
            ));
        } elseif ((string) $Request->query->get('action') === 'annotations') {
            $paperKey = literatureSafeKey($Request->query->get('paper_key') ?? $Request->query->get('paperKey'));
            literatureJson($Response, array('annotations' => literatureListAnnotations($paperKey)));
        } elseif ((string) $Request->query->get('action') === 'attachment') {
            literatureAttachmentResponse($Response, (string) ($Request->query->get('attachment_key') ?? $Request->query->get('attachmentKey')));
        } elseif ((string) $Request->query->get('action') === 'pdf') {
            literatureAttachmentResponse($Response, (string) ($Request->query->get('attachment_key') ?? $Request->query->get('attachmentKey')), array('pdf'));
        } elseif ((string) $Request->query->get('action') === 'evidence') {
            $paperKey = literatureSafeKey($Request->query->get('paper_key') ?? $Request->query->get('paperKey'));
            literatureJson($Response, array('evidence' => literatureListEvidence($paperKey)));
        } else {
        literatureEnsureCardsDir();
        literatureEnsurePapersDir();
        $cards = literatureListCards();
        $cardMap = array();
        foreach ($cards as $card) {
            $cardMap[$card['itemKey']] = $card;
        }
        $localPapers = literatureListPapers();

        if (!$config['configured']) {
            literatureJson($Response, array(
                'configured' => false,
                'config' => literaturePublicConfig($config),
                'setup' => array(
                    'config_path' => literatureConfigPath(),
                    'env' => array('ZOTERO_API_KEY', 'ZOTERO_LIBRARY_ID', 'ZOTERO_LIBRARY_TYPE'),
                ),
                'items' => $localPapers,
                'collections' => array(),
                'tags' => array(),
                'cards' => $cardMap,
                'evidence' => literatureEvidenceMapForItems($localPapers),
                'annotations' => literatureAnnotationMapForItems($localPapers),
            ));
        } else {
            $prefix = literaturePrefix($config);
            $collection = literatureSafeKey($Request->query->get('collection'));
            $itemsPath = $collection !== '' ? "{$prefix}/collections/{$collection}/items/top" : "{$prefix}/items/top";
            $items = array_map('Elabftw\Elabftw\literatureNormalizeItem', literatureZoteroRequest($config, $itemsPath, array(
                'format' => 'json',
                'include' => 'data',
                'limit' => min(max((int) ($Request->query->get('limit') ?? 50), 1), 100),
                'sort' => 'dateModified',
                'direction' => 'desc',
                'q' => literatureCleanText($Request->query->get('q'), 255),
                'qmode' => $Request->query->get('q') ? 'everything' : '',
                'tag' => literatureCleanText($Request->query->get('tag'), 255),
            )));
            $existingKeys = array_flip(array_map(fn (array $item): string => literatureSafeKey($item['key'] ?? ''), $items));
            foreach ($localPapers as $paper) {
                if (!isset($existingKeys[$paper['key']])) {
                    $items[] = $paper;
                }
            }
            $collections = literatureZoteroRequest($config, "{$prefix}/collections", array('format' => 'json', 'limit' => 100));
            literatureJson($Response, array(
                'configured' => true,
                'config' => literaturePublicConfig($config),
                'library' => array('id' => $config['library_id'], 'type' => $config['library_type']),
                'items' => $items,
                'collections' => $collections,
                'tags' => literatureTagsFromItems($items),
                'cards' => $cardMap,
                'evidence' => literatureEvidenceMapForItems($items),
                'annotations' => literatureAnnotationMapForItems($items),
            ));
        }
        }
    } elseif ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
        $body = literatureBody();
        if (($body['action'] ?? '') === 'config') {
            literatureJson($Response, array('config' => literatureWriteConfig($body)));
        } elseif (($body['action'] ?? '') === 'paper') {
            literatureJson($Response, array('paper' => literatureWritePaper($body)), $method === 'POST' ? 201 : 200);
        } elseif (($body['action'] ?? '') === 'evidence') {
            literatureJson($Response, array('evidence' => literatureWriteEvidence($body)), $method === 'POST' ? 201 : 200);
        } elseif (($body['action'] ?? '') === 'annotation') {
            literatureJson($Response, array('annotation' => literatureWriteAnnotation($body)), $method === 'POST' ? 201 : 200);
        } elseif (($body['action'] ?? '') === 'annotation-delete') {
            literatureDeleteAnnotation(literatureSafeKey($body['paperKey'] ?? $body['paper_key'] ?? ''), literatureSafeKey($body['id'] ?? ''));
            literatureJson($Response, array('deleted' => true));
        } else {
            $card = literatureWriteCard($body);
            literatureJson($Response, $card, $method === 'POST' ? 201 : 200);
        }
    } elseif ($method === 'DELETE') {
        $action = (string) $Request->query->get('action');
        $paperKey = literatureSafeKey($Request->query->get('paper_key') ?? $Request->query->get('paperKey'));
        if ($action === 'evidence') {
            literatureDeleteEvidence($paperKey, literatureSafeKey($Request->query->get('id')));
            literatureJson($Response, null, 204);
        } elseif ($action === 'annotation') {
            literatureDeleteAnnotation($paperKey, literatureSafeKey($Request->query->get('id')));
            literatureJson($Response, null, 204);
        } elseif ($action === 'paper') {
            literatureDeletePaper($paperKey);
            literatureJson($Response, null, 204);
        } else {
            throw new Exception('Unsupported literature delete action');
        }
    } else {
        throw new Exception('Unsupported literature endpoint');
    }
} catch (Throwable $e) {
    literatureJson($Response, array(
        'error' => $e->getMessage() ?: 'Literature API error',
        'type' => $e::class,
    ), 400);
} finally {
    $Response->send();
}
