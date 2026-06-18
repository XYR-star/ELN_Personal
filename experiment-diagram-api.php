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

function diagramJson(Response $Response, mixed $payload, int $status = 200): Response
{
    $Response->setStatusCode($status);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->headers->set('Cache-Control', 'no-store');
    $Response->setContent(json_encode($payload, JSON_THROW_ON_ERROR));
    return $Response;
}

function diagramBody(): array
{
    $raw = file_get_contents('php://input') ?: '{}';
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?: array();
}

function diagramEnsureSchema(Db $Db): void
{
    $Db->q('CREATE TABLE IF NOT EXISTS ricky_experiment_diagrams (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        team INT UNSIGNED NOT NULL,
        experiment_id INT UNSIGNED NOT NULL,
        scene_json MEDIUMTEXT NULL,
        preview_svg MEDIUMTEXT NULL,
        created_by INT UNSIGNED NOT NULL,
        modified_by INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_ricky_experiment_diagram (team, experiment_id),
        KEY idx_ricky_experiment_diagrams_experiment (experiment_id),
        CONSTRAINT fk_ricky_experiment_diagrams_team FOREIGN KEY (team) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_experiment_diagrams_created_by FOREIGN KEY (created_by) REFERENCES users(userid) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_experiment_diagrams_modified_by FOREIGN KEY (modified_by) REFERENCES users(userid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci');
}

function diagramExperimentId(mixed $value): int
{
    $id = (int) $value;
    if ($id < 1) {
        throw new Exception('Invalid experiment id');
    }
    return $id;
}

function diagramPayload(array $row = null): array
{
    if (!$row) {
        return array(
            'scene' => null,
            'preview_svg' => null,
            'modified_at' => null,
        );
    }
    return array(
        'scene' => $row['scene_json'] ? json_decode((string) $row['scene_json'], true, 512, JSON_THROW_ON_ERROR) : null,
        'preview_svg' => $row['preview_svg'],
        'modified_at' => $row['modified_at'],
    );
}

try {
    $Response->prepare($Request);
    diagramEnsureSchema($Db);

    $team = (int) $App->Users->team;
    $userId = (int) $App->Users->userid;
    $experimentId = diagramExperimentId($Request->query->get('id'));
    $method = $Request->getMethod();

    if ($method === 'GET') {
        $req = $Db->prepare('SELECT scene_json, preview_svg, modified_at FROM ricky_experiment_diagrams WHERE team = :team AND experiment_id = :experiment_id');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':experiment_id', $experimentId, PDO::PARAM_INT);
        $Db->execute($req);
        diagramJson($Response, diagramPayload($req->fetch() ?: null));
    } elseif ($method === 'POST' || $method === 'PATCH') {
        $body = diagramBody();
        $sceneJson = json_encode($body['scene'] ?? null, JSON_THROW_ON_ERROR);
        $previewSvg = (string) ($body['preview_svg'] ?? '');
        if (strlen($sceneJson) > 15000000 || strlen($previewSvg) > 15000000) {
            throw new Exception('Diagram is too large');
        }

        $req = $Db->prepare('INSERT INTO ricky_experiment_diagrams(team, experiment_id, scene_json, preview_svg, created_by, modified_by)
            VALUES(:team, :experiment_id, :scene_json, :preview_svg, :created_by, :modified_by)
            ON DUPLICATE KEY UPDATE scene_json = VALUES(scene_json), preview_svg = VALUES(preview_svg), modified_by = VALUES(modified_by)');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':experiment_id', $experimentId, PDO::PARAM_INT);
        $req->bindValue(':scene_json', $sceneJson);
        $req->bindValue(':preview_svg', $previewSvg !== '' ? $previewSvg : null, $previewSvg !== '' ? PDO::PARAM_STR : PDO::PARAM_NULL);
        $req->bindValue(':created_by', $userId, PDO::PARAM_INT);
        $req->bindValue(':modified_by', $userId, PDO::PARAM_INT);
        $Db->execute($req);

        $fresh = $Db->prepare('SELECT scene_json, preview_svg, modified_at FROM ricky_experiment_diagrams WHERE team = :team AND experiment_id = :experiment_id');
        $fresh->bindValue(':team', $team, PDO::PARAM_INT);
        $fresh->bindValue(':experiment_id', $experimentId, PDO::PARAM_INT);
        $Db->execute($fresh);
        diagramJson($Response, diagramPayload($fresh->fetch() ?: null), 201);
    } elseif ($method === 'DELETE') {
        $req = $Db->prepare('DELETE FROM ricky_experiment_diagrams WHERE team = :team AND experiment_id = :experiment_id');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':experiment_id', $experimentId, PDO::PARAM_INT);
        $Db->execute($req);
        diagramJson($Response, null, 204);
    } else {
        throw new Exception('Unsupported experiment diagram endpoint');
    }
} catch (Throwable $e) {
    diagramJson($Response, array(
        'error' => $e->getMessage() ?: 'Experiment diagram API error',
        'type' => $e::class,
    ), 400);
} finally {
    $Response->send();
}
