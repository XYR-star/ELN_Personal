<?php

declare(strict_types=1);

namespace Elabftw\Elabftw;

use Exception;
use PDO;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

require_once 'app/init.inc.php';

$Response = new Response();
$Db = Db::getConnection();

function driveLinksJson(Response $Response, mixed $payload, int $status = 200): Response
{
    $Response->setStatusCode($status);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->headers->set('Cache-Control', 'no-store');
    $Response->setContent($status === 204 ? '' : json_encode($payload, JSON_THROW_ON_ERROR));
    return $Response;
}

function driveLinksBody(): array
{
    $raw = file_get_contents('php://input') ?: '{}';
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?: array();
}

function driveLinksEnsureSchema(Db $Db): void
{
    $Db->q('CREATE TABLE IF NOT EXISTS ricky_drive_links (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        team INT UNSIGNED NOT NULL,
        entity_type VARCHAR(32) NOT NULL,
        entity_id INT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        url VARCHAR(2048) NOT NULL,
        note TEXT NULL,
        created_by INT UNSIGNED NOT NULL,
        modified_by INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ricky_drive_links_entity (team, entity_type, entity_id),
        CONSTRAINT fk_ricky_drive_links_team FOREIGN KEY (team) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_drive_links_created_by FOREIGN KEY (created_by) REFERENCES users(userid) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_drive_links_modified_by FOREIGN KEY (modified_by) REFERENCES users(userid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci');
}

function driveLinksEntityType(mixed $value): string
{
    $entityType = (string) $value;
    if (!in_array($entityType, array('experiments', 'items'), true)) {
        throw new Exception('Unsupported Drive links entity');
    }
    return $entityType;
}

function driveLinksPositiveId(mixed $value, string $label): int
{
    $id = (int) $value;
    if ($id < 1) {
        throw new Exception("Invalid {$label}");
    }
    return $id;
}

function driveLinksValidateUrl(mixed $value): string
{
    $url = trim((string) $value);
    if ($url === '' || strlen($url) > 2048) {
        throw new Exception('Drive URL is required');
    }
    $parts = parse_url($url);
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    $host = strtolower((string) ($parts['host'] ?? ''));
    if (!in_array($scheme, array('http', 'https'), true)) {
        throw new Exception('Drive URL must start with http or https');
    }
    if (!in_array($host, array('drive.google.com', 'docs.google.com'), true)) {
        throw new Exception('Only Google Drive or Google Docs links are supported in this lightweight version');
    }
    return $url;
}

function driveLinksCleanText(mixed $value, int $maxLen): string
{
    $text = trim((string) $value);
    if (mb_strlen($text) > $maxLen) {
        return mb_substr($text, 0, $maxLen);
    }
    return $text;
}

try {
    $Response->prepare($Request);
    driveLinksEnsureSchema($Db);

    $team = (int) $App->Users->team;
    $userId = (int) $App->Users->userid;
    $entityType = driveLinksEntityType($Request->query->get('entity'));
    $entityId = driveLinksPositiveId($Request->query->get('id'), 'entity id');
    $method = $Request->getMethod();

    if ($method === 'GET') {
        $req = $Db->prepare('SELECT id, title, url, note, created_at, modified_at FROM ricky_drive_links WHERE team = :team AND entity_type = :entity_type AND entity_id = :entity_id ORDER BY modified_at DESC, id DESC');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':entity_type', $entityType);
        $req->bindValue(':entity_id', $entityId, PDO::PARAM_INT);
        $Db->execute($req);
        driveLinksJson($Response, array('links' => $req->fetchAll() ?: array()));
    } elseif ($method === 'POST') {
        $body = driveLinksBody();
        $url = driveLinksValidateUrl($body['url'] ?? '');
        $title = driveLinksCleanText($body['title'] ?? '', 255);
        $note = driveLinksCleanText($body['note'] ?? '', 1000);
        if ($title === '') {
            $title = 'Google Drive file';
        }

        $req = $Db->prepare('INSERT INTO ricky_drive_links(team, entity_type, entity_id, title, url, note, created_by, modified_by)
            VALUES(:team, :entity_type, :entity_id, :title, :url, :note, :created_by, :modified_by)');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':entity_type', $entityType);
        $req->bindValue(':entity_id', $entityId, PDO::PARAM_INT);
        $req->bindValue(':title', $title);
        $req->bindValue(':url', $url);
        $req->bindValue(':note', $note !== '' ? $note : null, $note !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
        $req->bindValue(':created_by', $userId, PDO::PARAM_INT);
        $req->bindValue(':modified_by', $userId, PDO::PARAM_INT);
        $Db->execute($req);

        $linkId = (int) $Db->lastInsertId();
        $fresh = $Db->prepare('SELECT id, title, url, note, created_at, modified_at FROM ricky_drive_links WHERE team = :team AND id = :id');
        $fresh->bindValue(':team', $team, PDO::PARAM_INT);
        $fresh->bindValue(':id', $linkId, PDO::PARAM_INT);
        $Db->execute($fresh);
        driveLinksJson($Response, $fresh->fetch(), 201);
    } elseif ($method === 'DELETE') {
        $linkId = driveLinksPositiveId($Request->query->get('link'), 'Drive link id');
        $req = $Db->prepare('DELETE FROM ricky_drive_links WHERE team = :team AND entity_type = :entity_type AND entity_id = :entity_id AND id = :id');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':entity_type', $entityType);
        $req->bindValue(':entity_id', $entityId, PDO::PARAM_INT);
        $req->bindValue(':id', $linkId, PDO::PARAM_INT);
        $Db->execute($req);
        driveLinksJson($Response, null, 204);
    } else {
        throw new Exception('Unsupported Drive links endpoint');
    }
} catch (Throwable $e) {
    driveLinksJson($Response, array(
        'error' => $e->getMessage() ?: 'Drive links API error',
        'type' => $e::class,
    ), 400);
} finally {
    $Response->send();
}
