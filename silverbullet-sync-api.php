<?php

declare(strict_types=1);

namespace Elabftw\Elabftw;

use Exception;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

require_once 'app/init.inc.php';

$Response = new Response();

const SILVERBULLET_ROOT = '/elabftw/silverbullet-space';

function silverbulletJson(Response $Response, mixed $payload, int $status = 200): Response
{
    $Response->setStatusCode($status);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->headers->set('Cache-Control', 'no-store');
    $Response->setContent(json_encode($payload, JSON_THROW_ON_ERROR));
    return $Response;
}

function silverbulletBody(): array
{
    $raw = file_get_contents('php://input') ?: '{}';
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?: array();
}

function silverbulletEntityType(mixed $value): string
{
    $entityType = (string) $value;
    if (!in_array($entityType, array('experiments', 'items'), true)) {
        throw new Exception('Unsupported SilverBullet entity');
    }
    return $entityType;
}

function silverbulletEntityId(mixed $value): int
{
    $id = (int) $value;
    if ($id < 1) {
        throw new Exception('Invalid entity id');
    }
    return $id;
}

function silverbulletRelativePath(string $entityType, int $id): string
{
    $folder = $entityType === 'experiments' ? 'Experiments' : 'Resources';
    return "ELN/{$folder}/{$id}.md";
}

function silverbulletPath(string $entityType, int $id): string
{
    return SILVERBULLET_ROOT . '/' . silverbulletRelativePath($entityType, $id);
}

function silverbulletEnsureDir(string $path): void
{
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new Exception('Could not create SilverBullet directory');
    }
}

function silverbulletCleanMarkdown(mixed $value): string
{
    $markdown = trim((string) $value);
    if (mb_strlen($markdown) > 500000) {
        throw new Exception('Markdown source is too large');
    }
    return $markdown;
}

function silverbulletFrontmatter(string $entityType, int $id, string $title): string
{
    $label = $entityType === 'experiments' ? 'experiments' : 'resources';
    $url = $entityType === 'experiments' ? "/experiments.php?mode=view&id={$id}" : "/database.php?mode=view&id={$id}";
    $safeTitle = str_replace(array("\r", "\n"), ' ', trim($title));
    return "---\n"
        . "elab_type: {$label}\n"
        . "elab_id: {$id}\n"
        . "elab_title: {$safeTitle}\n"
        . "elab_url: {$url}\n"
        . "updated_from: elabftw\n"
        . "---\n\n";
}

function silverbulletStripFrontmatter(string $raw): string
{
    if (!str_starts_with($raw, "---\n")) {
        return trim($raw);
    }
    $end = strpos($raw, "\n---", 4);
    if ($end === false) {
        return trim($raw);
    }
    return trim(substr($raw, $end + 4));
}

try {
    $Response->prepare($Request);
    $method = $Request->getMethod();
    $body = $method === 'GET' ? array() : silverbulletBody();
    $entityType = silverbulletEntityType($Request->query->get('entity_type') ?? $body['entity_type'] ?? '');
    $entityId = silverbulletEntityId($Request->query->get('id') ?? $body['id'] ?? 0);
    $path = silverbulletPath($entityType, $entityId);
    $relativePath = silverbulletRelativePath($entityType, $entityId);

    if ($method === 'GET') {
        $markdown = is_file($path) ? silverbulletStripFrontmatter(file_get_contents($path) ?: '') : null;
        silverbulletJson($Response, array(
            'markdown' => $markdown,
            'relative_path' => $relativePath,
            'modified_at' => is_file($path) ? date(DATE_ATOM, filemtime($path) ?: time()) : null,
        ));
    } elseif ($method === 'PUT' || $method === 'PATCH' || $method === 'POST') {
        $markdown = silverbulletCleanMarkdown($body['markdown'] ?? '');
        $title = (string) ($body['title'] ?? '');
        silverbulletEnsureDir($path);
        file_put_contents($path, silverbulletFrontmatter($entityType, $entityId, $title) . $markdown . "\n", LOCK_EX);
        silverbulletJson($Response, array(
            'markdown' => $markdown,
            'relative_path' => $relativePath,
            'modified_at' => date(DATE_ATOM, filemtime($path) ?: time()),
        ), 201);
    } else {
        throw new Exception('Unsupported SilverBullet endpoint');
    }
} catch (Throwable $e) {
    silverbulletJson($Response, array(
        'error' => $e->getMessage() ?: 'SilverBullet sync API error',
        'type' => $e::class,
    ), 400);
} finally {
    $Response->send();
}
