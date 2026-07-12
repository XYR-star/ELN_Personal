# ELN Personal Architecture

## Purpose

ELN Personal is an extension layer on top of the official eLabFTW image. It is
not a fork of eLabFTW core. Native experiments, resources, users, permissions,
uploads, and sessions remain owned by eLabFTW.

## Boundaries

| Area | Owner | Integration |
| --- | --- | --- |
| Experiments, resources, users, uploads | eLabFTW | Native database and APIs |
| Navigation and entity page placement | ELN Personal | Read-only Twig template mounts |
| Planner and todos | ELN Personal | Isolated Node service and JSON data volume |
| Literature, ideas, records | ELN Personal | Authenticated PHP endpoints and data-volume files |
| Storage map and Drive links | ELN Personal | Custom tables linked to native entity IDs |
| Diagram and browser UI | ELN Personal | Static assets mounted under `/planner-assets` |

Custom database tables use the `ricky_` prefix. Runtime files live outside the
repository under `/www/elabftw-data`. No eLabFTW source file inside the image is
modified in place.

## Upgrade-sensitive surfaces

The following full-template overrides are coupled to the eLabFTW release:

- `dashboard.html`
- `edit.html`
- `head.html`
- `view.html`

`storage-map-api.php` also uses native `items`, `storage_units`, and
`containers2items` tables. These surfaces require review whenever the eLabFTW
image changes. Other feature pages are additive and have a smaller upgrade
surface.

## Upgrade procedure

1. Create and verify a backup with `sudo ops/backup.sh`.
2. Pull the candidate image without changing the running container.
3. Compare its four templates with `ops/upstream-templates.sha256`.
4. Review upstream database migrations affecting the storage tables.
5. Run `npm test` and the Playwright tests against a staging instance.
6. Update the image digest in Compose and deploy.
7. Run `npm run preflight` and verify Dashboard, experiment edit/view, Planner,
   Literature, and Storage Map.
8. Keep the previous digest and backup until normal use is confirmed.

Do not use a floating `stable` image in production. A digest change is an
explicit upgrade and must go through this procedure. The currently verified
production digests are recorded in `ops/images.lock`.

## Recovery order

1. Restore the MySQL dump into a clean MySQL container.
2. Restore uploads and custom data archives to `/www/elabftw-data`.
3. Check out the matching Git commit.
4. Start Compose with the image digests recorded for that commit.
5. Run `npm run preflight` before exposing the site.
