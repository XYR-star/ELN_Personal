<?php

declare(strict_types=1);

namespace Elabftw\Elabftw;

use Exception;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

require_once 'app/init.inc.php';

$Response = new Response();

const RECORDS_ROOT = '/elabftw/silverbullet-space';

function recordsJson(Response $Response, mixed $payload, int $status = 200): Response
{
    $Response->setStatusCode($status);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->headers->set('Cache-Control', 'no-store');
    $Response->setContent($status === 204 ? '' : json_encode($payload, JSON_THROW_ON_ERROR));
    return $Response;
}

function recordsBody(): array
{
    $raw = file_get_contents('php://input') ?: '{}';
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?: array();
}

function recordsNow(): string
{
    return (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))->format(\DateTimeInterface::ATOM);
}

function recordsToday(): string
{
    return (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))->format('Y-m-d');
}

function recordsExperimentId(mixed $value): int
{
    $id = (int) $value;
    if ($id < 1) {
        throw new Exception('Invalid experiment id');
    }
    return $id;
}

function recordsValidateId(string $id): string
{
    if (!preg_match('/^\d{8}-\d{3}$/', $id)) {
        throw new Exception('Invalid record id');
    }
    return $id;
}

function recordsValidateDate(?string $value): string
{
    $date = trim((string) $value);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : recordsToday();
}

function recordsCleanText(mixed $value, int $maxLen = 20000): string
{
    $text = trim((string) $value);
    if (mb_strlen($text) > $maxLen) {
        return mb_substr($text, 0, $maxLen);
    }
    return $text;
}

function recordsTitle(mixed $value): string
{
    $title = recordsCleanText($value, 180);
    return $title !== '' ? $title : 'Untitled record';
}

function recordsExperimentDir(int $experimentId): string
{
    return RECORDS_ROOT . '/ELN/Experiments/' . $experimentId . '/Records';
}

function recordsAssetsDir(int $experimentId, string $recordId): string
{
    return recordsExperimentDir($experimentId) . '/assets/' . $recordId;
}

function recordsPath(int $experimentId, string $recordId): string
{
    return recordsExperimentDir($experimentId) . '/' . $recordId . '.md';
}

function recordsEnsureDir(int $experimentId): void
{
    $dir = recordsExperimentDir($experimentId);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create records directory');
    }
}

function recordsNextId(int $experimentId, string $date): string
{
    recordsEnsureDir($experimentId);
    $prefix = str_replace('-', '', $date);
    $max = 0;
    foreach (glob(recordsExperimentDir($experimentId) . '/' . $prefix . '-*.md') ?: array() as $file) {
        if (preg_match('/-(\d{3})\.md$/', $file, $matches)) {
            $max = max($max, (int) $matches[1]);
        }
    }
    return $prefix . '-' . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
}

function recordsParseListValue(string $value): array
{
    $value = trim($value);
    if (!str_starts_with($value, '[') || !str_ends_with($value, ']')) {
        return array();
    }
    $inner = trim(substr($value, 1, -1));
    if ($inner === '') {
        return array();
    }
    return array_values(array_filter(array_map('trim', explode(',', $inner)), fn (string $item): bool => $item !== ''));
}

function recordsUniqueNumbers(array $values): array
{
    $ids = array_map('intval', $values);
    return array_values(array_unique(array_filter($ids, fn (int $id): bool => $id > 0)));
}

function recordsUniqueStrings(array $values): array
{
    $out = array();
    foreach ($values as $value) {
        $text = trim((string) $value);
        if ($text !== '' && !in_array($text, $out, true)) {
            $out[] = $text;
        }
    }
    return $out;
}

function recordsExtractLinkIds(string $markdown, string $kind): array
{
    preg_match_all('/\[\[\s*' . $kind . '\s*:\s*(\d+)\s*\]\]/i', $markdown, $matches);
    return recordsUniqueNumbers($matches[1] ?? array());
}

function recordsExtractLinkStrings(string $markdown, string $kind): array
{
    preg_match_all('/\[\[\s*' . $kind . '\s*:\s*([A-Za-z0-9_-]+(?:#[A-Za-z0-9_-]+)?)\s*\]\]/i', $markdown, $matches);
    return recordsUniqueStrings($matches[1] ?? array());
}

function recordsFrontmatter(array $record): string
{
    return "---\n"
        . "type: experiment_record\n"
        . "id: {$record['id']}\n"
        . "experiment_id: {$record['experiment_id']}\n"
        . "title: {$record['title']}\n"
        . "record_date: {$record['record_date']}\n"
        . "record_type: {$record['record_type']}\n"
        . "created_at: {$record['created_at']}\n"
        . "updated_at: {$record['updated_at']}\n"
        . 'resources: [' . implode(', ', $record['resources']) . "]\n"
        . 'experiments: [' . implode(', ', $record['experiments']) . "]\n"
        . 'ideas: [' . implode(', ', $record['ideas']) . "]\n"
        . 'evidence: [' . implode(', ', $record['evidence']) . "]\n"
        . 'annotations: [' . implode(', ', $record['annotations']) . "]\n"
        . "---\n\n";
}

function recordsParseFile(int $experimentId, string $file): array
{
    $raw = file_get_contents($file) ?: '';
    $frontmatter = array();
    $markdown = trim($raw);
    if (str_starts_with($raw, "---\n")) {
        $end = strpos($raw, "\n---", 4);
        if ($end !== false) {
            $front = substr($raw, 4, $end - 4);
            $markdown = trim(substr($raw, $end + 4));
            foreach (explode("\n", $front) as $line) {
                if (!str_contains($line, ':')) {
                    continue;
                }
                [$key, $value] = array_map('trim', explode(':', $line, 2));
                $frontmatter[$key] = $value;
            }
        }
    }
    $id = basename($file, '.md');
    $record = array(
        'id' => $id,
        'experiment_id' => $experimentId,
        'title' => $frontmatter['title'] ?? 'Untitled record',
        'record_date' => $frontmatter['record_date'] ?? recordsToday(),
        'record_type' => $frontmatter['record_type'] ?? 'other',
        'created_at' => $frontmatter['created_at'] ?? date(DATE_ATOM, filemtime($file) ?: time()),
        'updated_at' => $frontmatter['updated_at'] ?? date(DATE_ATOM, filemtime($file) ?: time()),
        'markdown' => $markdown,
    );
    return recordsNormalize($record);
}

function recordsNormalize(array $record): array
{
    $markdown = recordsCleanText($record['markdown'] ?? '');
    return array(
        'id' => recordsValidateId((string) ($record['id'] ?? '')),
        'experiment_id' => recordsExperimentId($record['experiment_id'] ?? 0),
        'title' => recordsTitle($record['title'] ?? ''),
        'record_date' => recordsValidateDate($record['record_date'] ?? null),
        'record_type' => recordsCleanText($record['record_type'] ?? 'other', 80) ?: 'other',
        'created_at' => (string) ($record['created_at'] ?? recordsNow()),
        'updated_at' => (string) ($record['updated_at'] ?? recordsNow()),
        'markdown' => $markdown,
        'resources' => recordsExtractLinkIds($markdown, 'Resource'),
        'experiments' => recordsExtractLinkIds($markdown, 'Experiment'),
        'ideas' => recordsExtractLinkStrings($markdown, 'Idea'),
        'evidence' => recordsExtractLinkStrings($markdown, 'Evidence'),
        'annotations' => recordsExtractLinkStrings($markdown, 'PaperAnnotation'),
    );
}

function recordsList(int $experimentId): array
{
    $files = glob(recordsExperimentDir($experimentId) . '/*.md') ?: array();
    $records = array_map(fn (string $file): array => recordsParseFile($experimentId, $file), $files);
    usort($records, function (array $a, array $b): int {
        $byDate = strcmp($b['record_date'], $a['record_date']);
        return $byDate !== 0 ? $byDate : strcmp($b['updated_at'], $a['updated_at']);
    });
    return $records;
}

function recordsWrite(array $record): void
{
    recordsEnsureDir($record['experiment_id']);
    file_put_contents(recordsPath($record['experiment_id'], $record['id']), recordsFrontmatter($record) . $record['markdown'] . "\n", LOCK_EX);
}

function recordsBuild(int $experimentId, array $body, ?array $existing = null): array
{
    $now = recordsNow();
    $recordDate = recordsValidateDate($body['record_date'] ?? ($existing['record_date'] ?? null));
    $id = $existing['id'] ?? recordsNextId($experimentId, $recordDate);
    return recordsNormalize(array(
        'id' => $id,
        'experiment_id' => $experimentId,
        'title' => $body['title'] ?? ($existing['title'] ?? ''),
        'record_date' => $recordDate,
        'record_type' => $body['record_type'] ?? ($existing['record_type'] ?? 'other'),
        'created_at' => $existing['created_at'] ?? $now,
        'updated_at' => $now,
        'markdown' => $body['markdown'] ?? ($existing['markdown'] ?? ''),
    ));
}

function recordsAssetName(string $name): string
{
    $base = preg_replace('/[^A-Za-z0-9._-]+/', '-', basename($name));
    $base = trim((string) $base, '.-');
    if ($base === '') {
        $base = 'attachment';
    }
    return date('His') . '-' . $base;
}

function recordsSendAsset(Response $Response, int $experimentId, string $recordId, string $file): Response
{
    $safe = basename($file);
    $path = recordsAssetsDir($experimentId, $recordId) . '/' . $safe;
    if (!is_file($path)) {
        throw new Exception('Asset not found');
    }
    $mime = mime_content_type($path) ?: 'application/octet-stream';
    $Response->setStatusCode(200);
    $Response->headers->set('Content-Type', $mime);
    $Response->headers->set('Content-Disposition', 'inline; filename="' . addslashes($safe) . '"');
    $Response->setContent(file_get_contents($path) ?: '');
    return $Response;
}

function recordsUploadAsset(Response $Response, int $experimentId, string $recordId): Response
{
    recordsValidateId($recordId);
    if (!is_file(recordsPath($experimentId, $recordId))) {
        throw new Exception('Save the record before uploading assets');
    }
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        throw new Exception('Missing upload file');
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new Exception('Upload failed');
    }
    $dir = recordsAssetsDir($experimentId, $recordId);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create asset directory');
    }
    $name = recordsAssetName((string) ($file['name'] ?? 'attachment'));
    $target = $dir . '/' . $name;
    if (!move_uploaded_file((string) $file['tmp_name'], $target)) {
        throw new Exception('Could not save upload');
    }
    $url = '/experiment-records-api.php?action=asset&experiment_id=' . $experimentId . '&id=' . rawurlencode($recordId) . '&file=' . rawurlencode($name);
    return recordsJson($Response, array(
        'name' => $name,
        'url' => $url,
        'is_image' => str_starts_with((string) mime_content_type($target), 'image/'),
    ), 201);
}

function recordsDeleteRecord(int $experimentId, string $recordId): void
{
    $path = recordsPath($experimentId, $recordId);
    if (is_file($path) && !unlink($path)) {
        throw new Exception('Could not delete record');
    }
    $assetsDir = recordsAssetsDir($experimentId, $recordId);
    if (is_dir($assetsDir)) {
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($assetsDir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($iterator as $file) {
            $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
        }
        rmdir($assetsDir);
    }
}

try {
    $Response->prepare($Request);
    $method = $Request->getMethod();
    $action = (string) ($Request->query->get('action') ?? '');
    $experimentId = recordsExperimentId($Request->query->get('experiment_id') ?? ($_POST['experiment_id'] ?? 0));

    if ($method === 'GET' && $action === 'asset') {
        recordsSendAsset($Response, $experimentId, recordsValidateId((string) $Request->query->get('id')), (string) $Request->query->get('file'));
    } elseif ($method === 'GET') {
        $id = (string) ($Request->query->get('id') ?? '');
        if ($id !== '') {
            $path = recordsPath($experimentId, recordsValidateId($id));
            if (!is_file($path)) {
                throw new Exception('Record not found');
            }
            recordsJson($Response, recordsParseFile($experimentId, $path));
        } else {
            recordsJson($Response, array('records' => recordsList($experimentId)));
        }
    } elseif ($method === 'POST' && $action === 'upload') {
        recordsUploadAsset($Response, $experimentId, recordsValidateId((string) ($_POST['id'] ?? $Request->query->get('id') ?? '')));
    } elseif ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
        $body = recordsBody();
        $bodyAction = (string) ($body['action'] ?? '');
        if ($bodyAction === 'delete') {
            $id = recordsValidateId((string) ($body['id'] ?? ''));
            recordsDeleteRecord($experimentId, $id);
            recordsJson($Response, null, 204);
        } elseif (isset($body['id']) && (string) $body['id'] !== '') {
            $id = recordsValidateId((string) $body['id']);
            $path = recordsPath($experimentId, $id);
            if (!is_file($path)) {
                throw new Exception('Record not found');
            }
            $record = recordsBuild($experimentId, $body, recordsParseFile($experimentId, $path));
            recordsWrite($record);
            recordsJson($Response, $record);
        } else {
            $record = recordsBuild($experimentId, $body);
            recordsWrite($record);
            recordsJson($Response, $record, 201);
        }
    } elseif ($method === 'DELETE') {
        $id = recordsValidateId((string) $Request->query->get('id'));
        recordsDeleteRecord($experimentId, $id);
        recordsJson($Response, null, 204);
    } else {
        throw new Exception('Unsupported records endpoint');
    }
} catch (Throwable $e) {
    recordsJson($Response, array(
        'error' => $e->getMessage() ?: 'Experiment records API error',
        'type' => $e::class,
    ), 400);
} finally {
    $Response->send();
}
