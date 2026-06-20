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

function literatureCardsDir(): string
{
    return literatureDataDir() . '/cards';
}

function literatureEnsureCardsDir(): void
{
    $dir = literatureCardsDir();
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create literature card directory');
    }
}

function literatureCardPath(string $itemKey): string
{
    return literatureCardsDir() . '/' . literatureSafeKey($itemKey) . '.json';
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
        'modified_at' => $body['modified_at'] ?? (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))->format(\DateTimeInterface::ATOM),
    );
}

function literatureWriteCard(array $body): array
{
    literatureEnsureCardsDir();
    $card = literatureNormalizeCard(array_merge($body, array(
        'modified_at' => (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))->format(\DateTimeInterface::ATOM),
    )));
    file_put_contents(literatureCardPath($card['itemKey']), json_encode($card, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n", LOCK_EX);
    return $card;
}

function literatureConfig(): array
{
    $config = array(
        'api_key' => getenv('ZOTERO_API_KEY') ?: '',
        'library_id' => getenv('ZOTERO_LIBRARY_ID') ?: '',
        'library_type' => strtolower(getenv('ZOTERO_LIBRARY_TYPE') ?: 'user'),
    );
    $file = literatureDataDir() . '/zotero-config.json';
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

try {
    $Response->prepare($Request);
    $method = $Request->getMethod();
    $config = literatureConfig();

    if ($method === 'GET') {
        literatureEnsureCardsDir();
        $cards = literatureListCards();
        $cardMap = array();
        foreach ($cards as $card) {
            $cardMap[$card['itemKey']] = $card;
        }

        if (!$config['configured']) {
            literatureJson($Response, array(
                'configured' => false,
                'setup' => array(
                    'config_path' => literatureDataDir() . '/zotero-config.json',
                    'env' => array('ZOTERO_API_KEY', 'ZOTERO_LIBRARY_ID', 'ZOTERO_LIBRARY_TYPE'),
                ),
                'items' => array(),
                'collections' => array(),
                'tags' => array(),
                'cards' => $cardMap,
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
            $collections = literatureZoteroRequest($config, "{$prefix}/collections", array('format' => 'json', 'limit' => 100));
            $tags = literatureZoteroRequest($config, "{$prefix}/tags", array('format' => 'json', 'limit' => 100));
            literatureJson($Response, array(
                'configured' => true,
                'library' => array('id' => $config['library_id'], 'type' => $config['library_type']),
                'items' => $items,
                'collections' => $collections,
                'tags' => $tags,
                'cards' => $cardMap,
            ));
        }
    } elseif ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
        $body = literatureBody();
        $card = literatureWriteCard($body);
        literatureJson($Response, $card, $method === 'POST' ? 201 : 200);
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
