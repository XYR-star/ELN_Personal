<?php

declare(strict_types=1);

namespace Elabftw\Elabftw;

use Exception;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

require_once 'app/init.inc.php';

$Response = new Response();

const IDEAS_ROOT = '/elabftw/silverbullet-space';

function ideasJson(Response $Response, mixed $payload, int $status = 200): Response
{
    $Response->setStatusCode($status);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->headers->set('Cache-Control', 'no-store');
    $Response->setContent($status === 204 ? '' : json_encode($payload, JSON_THROW_ON_ERROR));
    return $Response;
}

function ideasBody(): array
{
    $raw = file_get_contents('php://input') ?: '{}';
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?: array();
}

function ideasDateFromId(string $id): string
{
    if (!preg_match('/^(\d{4})(\d{2})(\d{2})-\d{3}$/', $id, $matches)) {
        throw new Exception('Invalid idea id');
    }
    return "{$matches[1]}-{$matches[2]}-{$matches[3]}";
}

function ideasValidateDate(?string $date): ?string
{
    if ($date === null || $date === '') {
        return null;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        throw new Exception('Invalid date');
    }
    return $date;
}

function ideasDayDir(string $date): string
{
    return IDEAS_ROOT . '/Ideas/' . $date;
}

function ideasPath(string $date, string $id): string
{
    return ideasDayDir($date) . '/' . $id . '.md';
}

function ideasEnsureDir(string $date): void
{
    $dir = ideasDayDir($date);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create ideas directory');
    }
}

function ideasToday(): string
{
    return (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))->format('Y-m-d');
}

function ideasNow(): string
{
    return (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))->format(\DateTimeInterface::ATOM);
}

function ideasNextId(string $date): string
{
    ideasEnsureDir($date);
    $prefix = str_replace('-', '', $date);
    $max = 0;
    foreach (glob(ideasDayDir($date) . '/' . $prefix . '-*.md') ?: array() as $file) {
        if (preg_match('/-(\d{3})\.md$/', $file, $matches)) {
            $max = max($max, (int) $matches[1]);
        }
    }
    return $prefix . '-' . str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
}

function ideasExtractTags(string $markdown): array
{
    preg_match_all('/(^|\s)#([A-Za-z0-9_-]+)/', $markdown, $matches);
    return ideasCleanTags($matches[2] ?? array());
}

function ideasCleanTags(array $values): array
{
    $tags = array();
    foreach ($values as $value) {
        $tag = trim(ltrim((string) $value, '#'));
        if ($tag !== '' && !in_array($tag, $tags, true)) {
            $tags[] = $tag;
        }
    }
    return $tags;
}

function ideasMergeTags(array $manualTags, string $markdown): array
{
    return ideasCleanTags(array_merge($manualTags, ideasExtractTags($markdown)));
}

function ideasParseListValue(string $value): array
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

function ideasMergeIds(array $manualIds, array $markdownIds): array
{
    $ids = array_map('intval', array_merge($manualIds, $markdownIds));
    return array_values(array_unique(array_filter($ids, fn (int $id): bool => $id > 0)));
}

function ideasExtractLinks(string $markdown, string $kind): array
{
    preg_match_all('/\[\[\s*' . $kind . '\s*:\s*(\d+)\s*\]\]/i', $markdown, $matches);
    $ids = array_map('intval', $matches[1] ?? array());
    return array_values(array_unique(array_filter($ids, fn (int $id): bool => $id > 0)));
}

function ideasCleanText(mixed $value, int $maxLen = 20000): string
{
    $text = trim((string) $value);
    if (mb_strlen($text) > $maxLen) {
        return mb_substr($text, 0, $maxLen);
    }
    return $text;
}

function ideasFrontmatter(array $idea): string
{
    return "---\n"
        . "type: idea\n"
        . "id: {$idea['id']}\n"
        . "created_at: {$idea['created_at']}\n"
        . "updated_at: {$idea['updated_at']}\n"
        . 'tags: [' . implode(', ', $idea['tags']) . "]\n"
        . 'experiments: [' . implode(', ', $idea['linked_experiments']) . "]\n"
        . 'resources: [' . implode(', ', $idea['linked_resources']) . "]\n"
        . 'location: ' . ($idea['location'] ?? '') . "\n"
        . "---\n\n";
}

function ideasParseFile(string $file): array
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
    $date = ideasDateFromId($id);
    return array(
        'id' => $id,
        'date' => $date,
        'created_at' => $frontmatter['created_at'] ?? date(DATE_ATOM, filemtime($file) ?: time()),
        'updated_at' => $frontmatter['updated_at'] ?? date(DATE_ATOM, filemtime($file) ?: time()),
        'markdown' => $markdown,
        'tags' => ideasMergeTags(ideasParseListValue($frontmatter['tags'] ?? ''), $markdown),
        'linked_experiments' => ideasMergeIds(ideasParseListValue($frontmatter['experiments'] ?? ''), ideasExtractLinks($markdown, 'Experiment')),
        'linked_resources' => ideasMergeIds(ideasParseListValue($frontmatter['resources'] ?? ''), ideasExtractLinks($markdown, 'Resource')),
        'location' => $frontmatter['location'] ?? '',
    );
}

function ideasList(?string $date): array
{
    $files = array();
    if ($date) {
        $files = glob(ideasDayDir($date) . '/*.md') ?: array();
    } else {
        $files = glob(IDEAS_ROOT . '/Ideas/*/*.md') ?: array();
    }
    $ideas = array_map('Elabftw\Elabftw\ideasParseFile', $files);
    usort($ideas, fn (array $a, array $b): int => strcmp($b['created_at'], $a['created_at']));
    return $ideas;
}

function ideasWrite(array $idea): void
{
    ideasEnsureDir($idea['date']);
    file_put_contents(ideasPath($idea['date'], $idea['id']), ideasFrontmatter($idea) . $idea['markdown'] . "\n", LOCK_EX);
}

function ideasBuild(array $body, ?array $existing = null): array
{
    $markdown = ideasCleanText($body['markdown'] ?? ($existing['markdown'] ?? ''));
    if ($markdown === '') {
        throw new Exception('Idea text is required');
    }
    $date = $existing['date'] ?? ideasToday();
    $id = $existing['id'] ?? ideasNextId($date);
    $now = ideasNow();
    return array(
        'id' => $id,
        'date' => $date,
        'created_at' => $existing['created_at'] ?? $now,
        'updated_at' => $now,
        'markdown' => $markdown,
        'tags' => is_array($body['tags'] ?? null) ? ideasMergeTags($body['tags'], $markdown) : ideasExtractTags($markdown),
        'linked_experiments' => is_array($body['linked_experiments'] ?? null) ? array_map('intval', $body['linked_experiments']) : ideasExtractLinks($markdown, 'Experiment'),
        'linked_resources' => is_array($body['linked_resources'] ?? null) ? array_map('intval', $body['linked_resources']) : ideasExtractLinks($markdown, 'Resource'),
        'location' => ideasCleanText($body['location'] ?? ($existing['location'] ?? ''), 255),
    );
}

try {
    $Response->prepare($Request);
    $method = $Request->getMethod();

    if ($method === 'GET') {
        $date = ideasValidateDate($Request->query->get('date'));
        ideasJson($Response, array('ideas' => ideasList($date)));
    } elseif ($method === 'POST') {
        $body = ideasBody();
        $action = (string) ($body['action'] ?? '');
        if ($action === 'delete') {
            $id = (string) ($body['id'] ?? '');
            $date = ideasDateFromId($id);
            $path = ideasPath($date, $id);
            if (is_file($path) && !unlink($path)) {
                throw new Exception('Could not delete idea');
            }
            ideasJson($Response, null, 204);
        } elseif (isset($body['id']) && (string) $body['id'] !== '') {
            $id = (string) $body['id'];
            $date = ideasDateFromId($id);
            $path = ideasPath($date, $id);
            if (!is_file($path)) {
                throw new Exception('Idea not found');
            }
            $idea = ideasBuild($body, ideasParseFile($path));
            ideasWrite($idea);
            ideasJson($Response, $idea);
        } else {
            $idea = ideasBuild($body);
            ideasWrite($idea);
            ideasJson($Response, $idea, 201);
        }
    } elseif ($method === 'PUT' || $method === 'PATCH') {
        $body = ideasBody();
        $id = (string) ($body['id'] ?? $Request->query->get('id') ?? '');
        $date = ideasDateFromId($id);
        $path = ideasPath($date, $id);
        if (!is_file($path)) {
            throw new Exception('Idea not found');
        }
        $idea = ideasBuild($body, ideasParseFile($path));
        ideasWrite($idea);
        ideasJson($Response, $idea);
    } elseif ($method === 'DELETE') {
        $id = (string) ($Request->query->get('id') ?? '');
        $date = ideasDateFromId($id);
        $path = ideasPath($date, $id);
        if (is_file($path) && !unlink($path)) {
            throw new Exception('Could not delete idea');
        }
        ideasJson($Response, null, 204);
    } else {
        throw new Exception('Unsupported ideas endpoint');
    }
} catch (Throwable $e) {
    ideasJson($Response, array(
        'error' => $e->getMessage() ?: 'Ideas API error',
        'type' => $e::class,
    ), 400);
} finally {
    $Response->send();
}
