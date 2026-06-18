<?php

declare(strict_types=1);

namespace Elabftw\Elabftw;

use Elabftw\Exceptions\AppException;
use Exception;
use PDO;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

require_once 'app/init.inc.php';

$Response = new Response();
$Db = Db::getConnection();

function storageJson(Response $Response, mixed $payload, int $status = 200): Response
{
    $Response->setStatusCode($status);
    $Response->headers->set('Content-Type', 'application/json; charset=utf-8');
    $Response->headers->set('Cache-Control', 'no-store');
    $Response->setContent(json_encode($payload, JSON_THROW_ON_ERROR));
    return $Response;
}

function storageBody(): array
{
    $raw = file_get_contents('php://input') ?: '{}';
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR) ?: array();
}

function storageEnsureSchema(Db $Db): void
{
    $Db->q('CREATE TABLE IF NOT EXISTS ricky_storage_locations (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        team INT UNSIGNED NOT NULL,
        parent_id INT UNSIGNED NULL,
        name VARCHAR(255) NOT NULL,
        kind VARCHAR(32) NOT NULL DEFAULT "location",
        layout_type VARCHAR(32) NOT NULL DEFAULT "none",
        rows_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        columns_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        position_code VARCHAR(16) NULL,
        notes TEXT NULL,
        native_storage_unit_id INT UNSIGNED NULL,
        created_by INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ricky_storage_locations_team (team),
        KEY idx_ricky_storage_locations_parent (parent_id),
        KEY idx_ricky_storage_locations_native (native_storage_unit_id),
        CONSTRAINT fk_ricky_storage_locations_team FOREIGN KEY (team) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_storage_locations_parent FOREIGN KEY (parent_id) REFERENCES ricky_storage_locations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ricky_storage_locations_user FOREIGN KEY (created_by) REFERENCES users(userid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci');

    $Db->q('CREATE TABLE IF NOT EXISTS ricky_storage_assignments (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        team INT UNSIGNED NOT NULL,
        location_id INT UNSIGNED NOT NULL,
        slot_code VARCHAR(16) NOT NULL,
        item_id INT UNSIGNED NOT NULL,
        qty_stored DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 1.00,
        qty_unit VARCHAR(32) NOT NULL DEFAULT "tube",
        note TEXT NULL,
        native_storage_unit_id INT UNSIGNED NULL,
        native_container_id INT UNSIGNED NULL,
        created_by INT UNSIGNED NOT NULL,
        modified_by INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_ricky_storage_slot (location_id, slot_code),
        KEY idx_ricky_storage_assignments_team (team),
        KEY idx_ricky_storage_assignments_item (item_id),
        KEY idx_ricky_storage_assignments_native_unit (native_storage_unit_id),
        KEY idx_ricky_storage_assignments_native_container (native_container_id),
        CONSTRAINT fk_ricky_storage_assignments_team FOREIGN KEY (team) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_storage_assignments_location FOREIGN KEY (location_id) REFERENCES ricky_storage_locations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ricky_storage_assignments_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_storage_assignments_created_by FOREIGN KEY (created_by) REFERENCES users(userid) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_storage_assignments_modified_by FOREIGN KEY (modified_by) REFERENCES users(userid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci');

    $Db->q('CREATE TABLE IF NOT EXISTS ricky_storage_movements (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        team INT UNSIGNED NOT NULL,
        assignment_id INT UNSIGNED NULL,
        item_id INT UNSIGNED NULL,
        action VARCHAR(32) NOT NULL,
        from_location_id INT UNSIGNED NULL,
        from_slot_code VARCHAR(16) NULL,
        to_location_id INT UNSIGNED NULL,
        to_slot_code VARCHAR(16) NULL,
        qty_before DECIMAL(10,2) UNSIGNED NULL,
        qty_after DECIMAL(10,2) UNSIGNED NULL,
        note TEXT NULL,
        created_by INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ricky_storage_movements_team (team),
        KEY idx_ricky_storage_movements_item (item_id),
        CONSTRAINT fk_ricky_storage_movements_team FOREIGN KEY (team) REFERENCES teams(id) ON DELETE CASCADE,
        CONSTRAINT fk_ricky_storage_movements_assignment FOREIGN KEY (assignment_id) REFERENCES ricky_storage_assignments(id) ON DELETE SET NULL,
        CONSTRAINT fk_ricky_storage_movements_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
        CONSTRAINT fk_ricky_storage_movements_from_location FOREIGN KEY (from_location_id) REFERENCES ricky_storage_locations(id) ON DELETE SET NULL,
        CONSTRAINT fk_ricky_storage_movements_to_location FOREIGN KEY (to_location_id) REFERENCES ricky_storage_locations(id) ON DELETE SET NULL,
        CONSTRAINT fk_ricky_storage_movements_user FOREIGN KEY (created_by) REFERENCES users(userid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci');

    storageEnsureColumn($Db, 'ricky_storage_locations', 'native_storage_unit_id', 'INT UNSIGNED NULL');
    storageEnsureColumn($Db, 'ricky_storage_assignments', 'native_storage_unit_id', 'INT UNSIGNED NULL');
    storageEnsureColumn($Db, 'ricky_storage_assignments', 'native_container_id', 'INT UNSIGNED NULL');
}

function storageEnsureColumn(Db $Db, string $table, string $column, string $definition): void
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $table) || !preg_match('/^[a-zA-Z0-9_]+$/', $column)) {
        throw new Exception('Invalid schema identifier');
    }
    $req = $Db->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name');
    $req->bindValue(':table_name', $table);
    $req->bindValue(':column_name', $column);
    $Db->execute($req);
    if ((int) $req->fetchColumn() === 0) {
        $Db->q(sprintf('ALTER TABLE `%s` ADD COLUMN `%s` %s', $table, $column, $definition));
    }
}

function storageInt(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    return max(0, (int) $value);
}

function storageSlotCode(mixed $value): string
{
    $slot = strtoupper(trim((string) $value));
    if (!preg_match('/^[A-Z]+[0-9]+$/', $slot)) {
        throw new Exception('Invalid slot code');
    }
    return $slot;
}

function storageLocation(Db $Db, int $team, int $id): array
{
    $req = $Db->prepare('SELECT id, team, parent_id, name, kind, layout_type, rows_count AS row_count, columns_count AS column_count, position_code, notes, native_storage_unit_id, created_at, modified_at FROM ricky_storage_locations WHERE id = :id AND team = :team');
    $req->bindValue(':id', $id, PDO::PARAM_INT);
    $req->bindValue(':team', $team, PDO::PARAM_INT);
    $Db->execute($req);
    $row = $req->fetch();
    if (!$row) {
        throw new Exception('Location not found');
    }
    return $row;
}

function storageNativeUnitExists(Db $Db, ?int $id): bool
{
    if (!$id) {
        return false;
    }
    $req = $Db->prepare('SELECT id FROM storage_units WHERE id = :id');
    $req->bindValue(':id', $id, PDO::PARAM_INT);
    $Db->execute($req);
    return (bool) $req->fetch();
}

function storageCreateNativeUnit(Db $Db, string $name, ?int $parentId = null): int
{
    $req = $Db->prepare('INSERT INTO storage_units(parent_id, name) VALUES(:parent_id, :name)');
    $req->bindValue(':parent_id', $parentId, $parentId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $req->bindValue(':name', mb_substr($name, 0, 255));
    $Db->execute($req);
    return (int) $Db->lastInsertId();
}

function storageNativeUnitForLocation(Db $Db, int $team, int $locationId): int
{
    $location = storageLocation($Db, $team, $locationId);
    $nativeId = storageInt($location['native_storage_unit_id'] ?? null);
    $parentNativeId = null;
    if ($location['parent_id'] !== null) {
        $parentNativeId = storageNativeUnitForLocation($Db, $team, (int) $location['parent_id']);
    }

    if ($nativeId && storageNativeUnitExists($Db, $nativeId)) {
        $req = $Db->prepare('UPDATE storage_units SET parent_id = :parent_id, name = :name WHERE id = :id');
        $req->bindValue(':parent_id', $parentNativeId, $parentNativeId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $req->bindValue(':name', mb_substr((string) $location['name'], 0, 255));
        $req->bindValue(':id', $nativeId, PDO::PARAM_INT);
        $Db->execute($req);
        return $nativeId;
    }

    $nativeId = storageCreateNativeUnit($Db, (string) $location['name'], $parentNativeId);
    $req = $Db->prepare('UPDATE ricky_storage_locations SET native_storage_unit_id = :native_storage_unit_id WHERE id = :id AND team = :team');
    $req->bindValue(':native_storage_unit_id', $nativeId, PDO::PARAM_INT);
    $req->bindValue(':id', $locationId, PDO::PARAM_INT);
    $req->bindValue(':team', $team, PDO::PARAM_INT);
    $Db->execute($req);
    return $nativeId;
}

function storageNativeUnitForSlot(Db $Db, int $team, array $location, string $slot, ?int $existingNativeId = null): int
{
    $parentNativeId = storageNativeUnitForLocation($Db, $team, (int) $location['id']);
    if ($existingNativeId && storageNativeUnitExists($Db, $existingNativeId)) {
        $req = $Db->prepare('UPDATE storage_units SET parent_id = :parent_id, name = :name WHERE id = :id');
        $req->bindValue(':parent_id', $parentNativeId, PDO::PARAM_INT);
        $req->bindValue(':name', $slot);
        $req->bindValue(':id', $existingNativeId, PDO::PARAM_INT);
        $Db->execute($req);
        return $existingNativeId;
    }

    $lookup = $Db->prepare('SELECT id FROM storage_units WHERE parent_id = :parent_id AND name = :name ORDER BY id ASC LIMIT 1');
    $lookup->bindValue(':parent_id', $parentNativeId, PDO::PARAM_INT);
    $lookup->bindValue(':name', $slot);
    $Db->execute($lookup);
    $found = $lookup->fetch();
    if ($found) {
        return (int) $found['id'];
    }

    return storageCreateNativeUnit($Db, $slot, $parentNativeId);
}

function storageNativeContainerExists(Db $Db, ?int $id): bool
{
    if (!$id) {
        return false;
    }
    $req = $Db->prepare('SELECT id FROM containers2items WHERE id = :id');
    $req->bindValue(':id', $id, PDO::PARAM_INT);
    $Db->execute($req);
    return (bool) $req->fetch();
}

function storageDeleteNativeContainer(Db $Db, ?int $containerId, ?int $itemId = null, ?int $storageUnitId = null): void
{
    if ($containerId) {
        $req = $Db->prepare('DELETE FROM containers2items WHERE id = :id');
        $req->bindValue(':id', $containerId, PDO::PARAM_INT);
        $Db->execute($req);
        return;
    }
    if ($itemId && $storageUnitId) {
        $req = $Db->prepare('DELETE FROM containers2items WHERE item_id = :item_id AND storage_id = :storage_id');
        $req->bindValue(':item_id', $itemId, PDO::PARAM_INT);
        $req->bindValue(':storage_id', $storageUnitId, PDO::PARAM_INT);
        $Db->execute($req);
    }
}

function storageDeleteNativeUnitIfUnused(Db $Db, ?int $nativeStorageUnitId): void
{
    if (!$nativeStorageUnitId) {
        return;
    }
    $req = $Db->prepare('SELECT
        (SELECT COUNT(*) FROM storage_units WHERE parent_id = :id) +
        (SELECT COUNT(*) FROM containers2items WHERE storage_id = :id) +
        (SELECT COUNT(*) FROM containers2experiments WHERE storage_id = :id) +
        (SELECT COUNT(*) FROM containers2items_types WHERE storage_id = :id) +
        (SELECT COUNT(*) FROM containers2experiments_templates WHERE storage_id = :id) AS refs');
    $req->bindValue(':id', $nativeStorageUnitId, PDO::PARAM_INT);
    $Db->execute($req);
    if ((int) $req->fetchColumn() === 0) {
        $delete = $Db->prepare('DELETE FROM storage_units WHERE id = :id');
        $delete->bindValue(':id', $nativeStorageUnitId, PDO::PARAM_INT);
        $Db->execute($delete);
    }
}

function storageSyncNativeAssignment(Db $Db, int $team, array $location, string $slot, int $itemId, float $qty, string $unit, ?array $existing = null): array
{
    $nativeStorageUnitId = storageNativeUnitForSlot($Db, $team, $location, $slot, storageInt($existing['native_storage_unit_id'] ?? null));
    $nativeContainerId = storageInt($existing['native_container_id'] ?? null);

    if ($nativeContainerId && storageNativeContainerExists($Db, $nativeContainerId)) {
        $req = $Db->prepare('UPDATE containers2items SET item_id = :item_id, storage_id = :storage_id, qty_stored = :qty_stored, qty_unit = :qty_unit WHERE id = :id');
        $req->bindValue(':id', $nativeContainerId, PDO::PARAM_INT);
    } else {
        $lookup = $Db->prepare('SELECT id FROM containers2items WHERE item_id = :item_id AND storage_id = :storage_id ORDER BY id ASC LIMIT 1');
        $lookup->bindValue(':item_id', $itemId, PDO::PARAM_INT);
        $lookup->bindValue(':storage_id', $nativeStorageUnitId, PDO::PARAM_INT);
        $Db->execute($lookup);
        $found = $lookup->fetch();
        if ($found) {
            $nativeContainerId = (int) $found['id'];
            $req = $Db->prepare('UPDATE containers2items SET item_id = :item_id, storage_id = :storage_id, qty_stored = :qty_stored, qty_unit = :qty_unit WHERE id = :id');
            $req->bindValue(':id', $nativeContainerId, PDO::PARAM_INT);
        } else {
            $req = $Db->prepare('INSERT INTO containers2items(item_id, storage_id, qty_stored, qty_unit) VALUES(:item_id, :storage_id, :qty_stored, :qty_unit)');
        }
    }

    $req->bindValue(':item_id', $itemId, PDO::PARAM_INT);
    $req->bindValue(':storage_id', $nativeStorageUnitId, PDO::PARAM_INT);
    $req->bindValue(':qty_stored', $qty);
    $req->bindValue(':qty_unit', mb_substr($unit, 0, 10));
    $Db->execute($req);

    if (!$nativeContainerId) {
        $nativeContainerId = (int) $Db->lastInsertId();
    }

    return array(
        'native_storage_unit_id' => $nativeStorageUnitId,
        'native_container_id' => $nativeContainerId,
    );
}

function storageValidateSlot(array $location, string $slot): void
{
    $rows = max(1, (int) ($location['rows'] ?? $location['row_count'] ?? 0));
    $columns = max(1, (int) ($location['columns'] ?? $location['column_count'] ?? 0));
    if (!preg_match('/^([A-Z]+)([0-9]+)$/', $slot, $matches)) {
        throw new Exception('Invalid slot code');
    }
    $row = 0;
    foreach (str_split($matches[1]) as $letter) {
        $row = $row * 26 + (ord($letter) - 64);
    }
    $column = (int) $matches[2];
    if ($row < 1 || $row > $rows || $column < 1 || $column > $columns) {
        throw new Exception('Slot outside selected layout');
    }
}

function storageAssertItem(Db $Db, int $team, int $itemId): void
{
    $req = $Db->prepare('SELECT id FROM items WHERE id = :id AND team = :team AND state = 1');
    $req->bindValue(':id', $itemId, PDO::PARAM_INT);
    $req->bindValue(':team', $team, PDO::PARAM_INT);
    $Db->execute($req);
    if (!$req->fetch()) {
        throw new Exception('Resource not found');
    }
}

function storageCreateItem(Db $Db, int $team, int $userId, string $title): array
{
    $title = trim($title);
    if ($title === '') {
        throw new Exception('Resource title is required');
    }

    $emptyCan = '{"teams": [], "users": [], "teamgroups": []}';
    $req = $Db->prepare('INSERT INTO items(team, title, date, body, userid, category, elabid, canread_base, canwrite_base, canbook_base, canread, canwrite, canread_is_immutable, canwrite_is_immutable, canbook, metadata, custom_id, content_type, rating, hide_main_text, status)
        VALUES(:team, :title, :date, :body, :userid, :category, :elabid, :canread_base, :canwrite_base, :canbook_base, :canread, :canwrite, 0, 0, :canbook, :metadata, :custom_id, 1, 0, 0, :status)');
    $req->bindValue(':team', $team, PDO::PARAM_INT);
    $req->bindValue(':title', mb_substr($title, 0, 255));
    $req->bindValue(':date', date('Y-m-d'));
    $req->bindValue(':body', null, PDO::PARAM_NULL);
    $req->bindValue(':userid', $userId, PDO::PARAM_INT);
    $req->bindValue(':category', null, PDO::PARAM_NULL);
    $req->bindValue(':elabid', Tools::generateElabid());
    $req->bindValue(':canread_base', 30, PDO::PARAM_INT);
    $req->bindValue(':canwrite_base', 20, PDO::PARAM_INT);
    $req->bindValue(':canbook_base', 30, PDO::PARAM_INT);
    $req->bindValue(':canread', $emptyCan);
    $req->bindValue(':canwrite', $emptyCan);
    $req->bindValue(':canbook', $emptyCan);
    $req->bindValue(':metadata', null, PDO::PARAM_NULL);
    $req->bindValue(':custom_id', null, PDO::PARAM_NULL);
    $req->bindValue(':status', null, PDO::PARAM_NULL);
    $Db->execute($req);

    $id = (int) $Db->lastInsertId();
    return array('id' => $id, 'title' => mb_substr($title, 0, 255));
}

function storageMovement(Db $Db, int $team, int $userId, array $data): void
{
    $req = $Db->prepare('INSERT INTO ricky_storage_movements(team, assignment_id, item_id, action, from_location_id, from_slot_code, to_location_id, to_slot_code, qty_before, qty_after, note, created_by)
        VALUES(:team, :assignment_id, :item_id, :action, :from_location_id, :from_slot_code, :to_location_id, :to_slot_code, :qty_before, :qty_after, :note, :created_by)');
    $req->bindValue(':team', $team, PDO::PARAM_INT);
    $req->bindValue(':assignment_id', $data['assignment_id'] ?? null, ($data['assignment_id'] ?? null) === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $req->bindValue(':item_id', $data['item_id'] ?? null, ($data['item_id'] ?? null) === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $req->bindValue(':action', $data['action']);
    $req->bindValue(':from_location_id', $data['from_location_id'] ?? null, ($data['from_location_id'] ?? null) === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $req->bindValue(':from_slot_code', $data['from_slot_code'] ?? null);
    $req->bindValue(':to_location_id', $data['to_location_id'] ?? null, ($data['to_location_id'] ?? null) === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $req->bindValue(':to_slot_code', $data['to_slot_code'] ?? null);
    $req->bindValue(':qty_before', $data['qty_before'] ?? null);
    $req->bindValue(':qty_after', $data['qty_after'] ?? null);
    $req->bindValue(':note', $data['note'] ?? null);
    $req->bindValue(':created_by', $userId, PDO::PARAM_INT);
    $Db->execute($req);
}

try {
    $Response->prepare($Request);
    storageEnsureSchema($Db);

    $team = (int) $App->Users->team;
    $userId = (int) $App->Users->userid;
    $method = $Request->getMethod();
    $path = trim((string) $Request->query->get('path', 'locations'), '/');
    $parts = $path === '' ? array() : explode('/', $path);

    if ($method === 'GET' && $parts === array('locations')) {
        $req = $Db->prepare('SELECT id, parent_id, name, kind, layout_type, rows_count AS row_count, columns_count AS column_count, position_code, notes, native_storage_unit_id, created_at, modified_at FROM ricky_storage_locations WHERE team = :team ORDER BY created_at ASC, id ASC');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($req);
        storageJson($Response, $req->fetchAll());
    } elseif ($method === 'POST' && $parts === array('locations')) {
        $body = storageBody();
        $req = $Db->prepare('INSERT INTO ricky_storage_locations(team, parent_id, name, kind, layout_type, rows_count, columns_count, position_code, notes, created_by)
            VALUES(:team, :parent_id, :name, :kind, :layout_type, :rows, :columns, :position_code, :notes, :created_by)');
        $parentId = storageInt($body['parent_id'] ?? null);
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':parent_id', $parentId, $parentId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $req->bindValue(':name', trim((string) ($body['name'] ?? '')));
        $req->bindValue(':kind', (string) ($body['kind'] ?? 'location'));
        $req->bindValue(':layout_type', (string) ($body['layout_type'] ?? 'none'));
        $req->bindValue(':rows', max(0, min(26, (int) ($body['rows'] ?? 0))), PDO::PARAM_INT);
        $req->bindValue(':columns', max(0, min(48, (int) ($body['columns'] ?? 0))), PDO::PARAM_INT);
        $req->bindValue(':position_code', ($body['position_code'] ?? '') !== '' ? strtoupper(trim((string) $body['position_code'])) : null);
        $req->bindValue(':notes', $body['notes'] ?? null);
        $req->bindValue(':created_by', $userId, PDO::PARAM_INT);
        $Db->execute($req);
        storageJson($Response, storageLocation($Db, $team, $Db->lastInsertId()), 201);
    } elseif (($method === 'PUT' || $method === 'PATCH') && count($parts) === 2 && $parts[0] === 'locations') {
        $id = (int) $parts[1];
        storageLocation($Db, $team, $id);
        $body = storageBody();
        $parentId = storageInt($body['parent_id'] ?? null);
        $req = $Db->prepare('UPDATE ricky_storage_locations SET parent_id = :parent_id, name = :name, kind = :kind, layout_type = :layout_type, rows_count = :rows, columns_count = :columns, position_code = :position_code, notes = :notes WHERE id = :id AND team = :team');
        $req->bindValue(':id', $id, PDO::PARAM_INT);
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':parent_id', $parentId, $parentId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
        $req->bindValue(':name', trim((string) ($body['name'] ?? '')));
        $req->bindValue(':kind', (string) ($body['kind'] ?? 'location'));
        $req->bindValue(':layout_type', (string) ($body['layout_type'] ?? 'none'));
        $req->bindValue(':rows', max(0, min(26, (int) ($body['rows'] ?? 0))), PDO::PARAM_INT);
        $req->bindValue(':columns', max(0, min(48, (int) ($body['columns'] ?? 0))), PDO::PARAM_INT);
        $req->bindValue(':position_code', ($body['position_code'] ?? '') !== '' ? strtoupper(trim((string) $body['position_code'])) : null);
        $req->bindValue(':notes', $body['notes'] ?? null);
        $Db->execute($req);
        $updated = storageLocation($Db, $team, $id);
        if (storageInt($updated['native_storage_unit_id'] ?? null)) {
            storageNativeUnitForLocation($Db, $team, $id);
        }
        storageJson($Response, storageLocation($Db, $team, $id));
    } elseif ($method === 'DELETE' && count($parts) === 2 && $parts[0] === 'locations') {
        $id = (int) $parts[1];
        $location = storageLocation($Db, $team, $id);
        $check = $Db->prepare('SELECT (SELECT COUNT(*) FROM ricky_storage_locations WHERE parent_id = :id) AS children, (SELECT COUNT(*) FROM ricky_storage_assignments WHERE location_id = :id) AS assignments');
        $check->bindValue(':id', $id, PDO::PARAM_INT);
        $Db->execute($check);
        $counts = $check->fetch();
        if ((int) $counts['children'] > 0 || (int) $counts['assignments'] > 0) {
            throw new Exception('Clear child locations and slot assignments first');
        }
        $req = $Db->prepare('DELETE FROM ricky_storage_locations WHERE id = :id AND team = :team');
        $req->bindValue(':id', $id, PDO::PARAM_INT);
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($req);
        storageDeleteNativeUnitIfUnused($Db, storageInt($location['native_storage_unit_id'] ?? null));
        storageJson($Response, null, 204);
    } elseif ($method === 'GET' && count($parts) === 3 && $parts[0] === 'locations' && $parts[2] === 'view') {
        $location = storageLocation($Db, $team, (int) $parts[1]);
        $childrenReq = $Db->prepare('SELECT id, parent_id, name, kind, layout_type, rows_count AS row_count, columns_count AS column_count, position_code, notes, native_storage_unit_id FROM ricky_storage_locations WHERE parent_id = :id AND team = :team ORDER BY position_code ASC, id ASC');
        $childrenReq->bindValue(':id', $location['id'], PDO::PARAM_INT);
        $childrenReq->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($childrenReq);
        $assignReq = $Db->prepare('SELECT a.*, i.title AS item_title FROM ricky_storage_assignments a JOIN items i ON i.id = a.item_id WHERE a.location_id = :id AND a.team = :team ORDER BY a.slot_code ASC');
        $assignReq->bindValue(':id', $location['id'], PDO::PARAM_INT);
        $assignReq->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($assignReq);
        storageJson($Response, array('location' => $location, 'children' => $childrenReq->fetchAll(), 'assignments' => $assignReq->fetchAll()));
    } elseif ($method === 'GET' && $parts === array('items')) {
        $itemId = (int) $Request->query->get('item_id', 0);
        $q = '%' . trim((string) $Request->query->get('q', '')) . '%';
        $req = $Db->prepare('SELECT id, title, date FROM items WHERE team = :team AND state = 1 AND (:item_id = 0 OR id = :item_id) AND title LIKE :q ORDER BY modified_at DESC LIMIT 30');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':item_id', $itemId, PDO::PARAM_INT);
        $req->bindValue(':q', $q);
        $Db->execute($req);
        storageJson($Response, $req->fetchAll());
    } elseif ($method === 'POST' && $parts === array('items')) {
        $body = storageBody();
        storageJson($Response, storageCreateItem($Db, $team, $userId, (string) ($body['title'] ?? '')), 201);
    } elseif ($method === 'POST' && $parts === array('assignments')) {
        $body = storageBody();
        $location = storageLocation($Db, $team, (int) ($body['location_id'] ?? 0));
        $slot = storageSlotCode($body['slot_code'] ?? '');
        storageValidateSlot($location, $slot);
        $itemId = (int) ($body['item_id'] ?? 0);
        storageAssertItem($Db, $team, $itemId);
        $qty = max(0, (float) ($body['qty_stored'] ?? 1));

        $existingReq = $Db->prepare('SELECT * FROM ricky_storage_assignments WHERE location_id = :location_id AND slot_code = :slot_code AND team = :team');
        $existingReq->bindValue(':location_id', $location['id'], PDO::PARAM_INT);
        $existingReq->bindValue(':slot_code', $slot);
        $existingReq->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($existingReq);
        $existing = $existingReq->fetch() ?: null;
        $sync = storageSyncNativeAssignment($Db, $team, $location, $slot, $itemId, $qty, trim((string) ($body['qty_unit'] ?? 'tube')), $existing);

        $req = $Db->prepare('INSERT INTO ricky_storage_assignments(team, location_id, slot_code, item_id, qty_stored, qty_unit, note, created_by, modified_by)
            VALUES(:team, :location_id, :slot_code, :item_id, :qty_stored, :qty_unit, :note, :created_by, :modified_by)
            ON DUPLICATE KEY UPDATE item_id = VALUES(item_id), qty_stored = VALUES(qty_stored), qty_unit = VALUES(qty_unit), note = VALUES(note), modified_by = VALUES(modified_by)');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':location_id', $location['id'], PDO::PARAM_INT);
        $req->bindValue(':slot_code', $slot);
        $req->bindValue(':item_id', $itemId, PDO::PARAM_INT);
        $req->bindValue(':qty_stored', $qty);
        $req->bindValue(':qty_unit', trim((string) ($body['qty_unit'] ?? 'tube')));
        $req->bindValue(':note', $body['note'] ?? null);
        $req->bindValue(':created_by', $userId, PDO::PARAM_INT);
        $req->bindValue(':modified_by', $userId, PDO::PARAM_INT);
        $Db->execute($req);

        $nativeReq = $Db->prepare('UPDATE ricky_storage_assignments SET native_storage_unit_id = :native_storage_unit_id, native_container_id = :native_container_id WHERE location_id = :location_id AND slot_code = :slot_code AND team = :team');
        $nativeReq->bindValue(':native_storage_unit_id', $sync['native_storage_unit_id'], PDO::PARAM_INT);
        $nativeReq->bindValue(':native_container_id', $sync['native_container_id'], PDO::PARAM_INT);
        $nativeReq->bindValue(':location_id', $location['id'], PDO::PARAM_INT);
        $nativeReq->bindValue(':slot_code', $slot);
        $nativeReq->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($nativeReq);

        $freshReq = $Db->prepare('SELECT a.*, i.title AS item_title FROM ricky_storage_assignments a JOIN items i ON i.id = a.item_id WHERE a.location_id = :location_id AND a.slot_code = :slot_code AND a.team = :team');
        $freshReq->bindValue(':location_id', $location['id'], PDO::PARAM_INT);
        $freshReq->bindValue(':slot_code', $slot);
        $freshReq->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($freshReq);
        $fresh = $freshReq->fetch();
        storageMovement($Db, $team, $userId, array(
            'assignment_id' => $fresh['id'],
            'item_id' => $itemId,
            'action' => $existing ? 'update' : 'store',
            'from_location_id' => $existing['location_id'] ?? null,
            'from_slot_code' => $existing['slot_code'] ?? null,
            'to_location_id' => $location['id'],
            'to_slot_code' => $slot,
            'qty_before' => $existing['qty_stored'] ?? null,
            'qty_after' => $qty,
            'note' => $body['note'] ?? null,
        ));
        storageJson($Response, $fresh, 201);
    } elseif ($method === 'DELETE' && count($parts) === 2 && $parts[0] === 'assignments') {
        $id = (int) $parts[1];
        $req = $Db->prepare('SELECT * FROM ricky_storage_assignments WHERE id = :id AND team = :team');
        $req->bindValue(':id', $id, PDO::PARAM_INT);
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($req);
        $assignment = $req->fetch();
        if (!$assignment) {
            throw new Exception('Assignment not found');
        }
        $nativeStorageUnitId = storageInt($assignment['native_storage_unit_id'] ?? null);
        storageDeleteNativeContainer($Db, storageInt($assignment['native_container_id'] ?? null), (int) $assignment['item_id'], $nativeStorageUnitId);
        storageMovement($Db, $team, $userId, array(
            'assignment_id' => $assignment['id'],
            'item_id' => $assignment['item_id'],
            'action' => 'remove',
            'from_location_id' => $assignment['location_id'],
            'from_slot_code' => $assignment['slot_code'],
            'qty_before' => $assignment['qty_stored'],
            'note' => 'Removed from visual storage map',
        ));
        $delete = $Db->prepare('DELETE FROM ricky_storage_assignments WHERE id = :id AND team = :team');
        $delete->bindValue(':id', $id, PDO::PARAM_INT);
        $delete->bindValue(':team', $team, PDO::PARAM_INT);
        $Db->execute($delete);
        storageDeleteNativeUnitIfUnused($Db, $nativeStorageUnitId);
        storageJson($Response, null, 204);
    } elseif ($method === 'GET' && $parts === array('movements')) {
        $itemId = (int) $Request->query->get('item_id', 0);
        $req = $Db->prepare('SELECT m.*, fl.name AS from_location_name, tl.name AS to_location_name, CONCAT(u.firstname, " ", u.lastname) AS user_name
            FROM ricky_storage_movements m
            LEFT JOIN ricky_storage_locations fl ON fl.id = m.from_location_id
            LEFT JOIN ricky_storage_locations tl ON tl.id = m.to_location_id
            LEFT JOIN users u ON u.userid = m.created_by
            WHERE m.team = :team AND (:item_id = 0 OR m.item_id = :item_id)
            ORDER BY m.created_at DESC LIMIT 50');
        $req->bindValue(':team', $team, PDO::PARAM_INT);
        $req->bindValue(':item_id', $itemId, PDO::PARAM_INT);
        $Db->execute($req);
        storageJson($Response, $req->fetchAll());
    } else {
        throw new Exception('Unsupported storage map endpoint');
    }
} catch (Throwable $e) {
    storageJson($Response, array(
        'error' => $e->getMessage() ?: 'Storage map API error',
        'type' => $e::class,
    ), 400);
} finally {
    $Response->send();
}
