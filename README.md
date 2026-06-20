# ELN Personal

Personal eLabFTW customizations for `eln.heyrickishere.com`.

这是 Rick 个人版 eLabFTW 的轻量定制层。目标不是 fork eLabFTW 核心，而是在原系统之上补齐个人实验管理需要的几个入口：规划日历、可视化冰箱/库存、实验流程画板，以及更清爽的个人导航。

This repository keeps the lightweight add-ons and template overrides used on top of a self-hosted eLabFTW instance:

- Personal-mode navigation cleanup for a single-user ELN workflow.
- Experiment planner embedded into eLabFTW.
- Zotero-like Literature workspace backed by Zotero Web API and local reading cards.
- Memo-style Ideas workspace for quick Markdown notes and experiment/resource links.
- Visual freezer/storage map linked to eLabFTW resources.
- Experiment diagram panel for drawing workflow sketches above the main text.
- Lightweight Google Drive file links on experiment and resource edit pages.
- Smoke tests for the key browser flows.

The repository stores code only. Runtime data, uploaded files, database contents, login sessions, generated reports, and server secrets stay on the server and are not committed.

本仓库只同步代码和静态资源，不同步实验数据、数据库、上传附件、登录态、测试报告和服务器密钥。

## Project Layout

```text
.
├── head.html                    # eLabFTW navigation template override
├── personal-mode.html           # Tools page documenting hidden/kept entries
├── planner.html                 # Planner page shell
├── literature.html              # Zotero-like Literature workspace
├── ideas.html                   # Ideas workspace shell
├── storage-map.html             # Visual storage map shell
├── storage-view-edit.html       # Resource storage panel override
├── view.html                    # Resource view/edit override for Drive links
├── experiment-diagram.html      # Diagram panel shell
├── drive-links.html             # Lightweight Drive link panel shell
├── *-api.php                    # eLabFTW-side PHP API endpoints
├── public/                      # Browser assets and built diagram bundle
├── src/                         # JS source modules
├── tests/                       # Unit and Playwright smoke tests
├── package.json
└── storage-map-schema.sql       # Storage map database tables
```

## Main Features

## 功能概览

### Personal Navigation

The overridden `head.html` keeps eLabFTW familiar while hiding noisy multi-user entries:

- Hidden: Team page, notification bell, help/community links.
- Hidden: Team/All experiment lists.
- Hidden: Team/All resource lists.
- Kept: Dashboard, Experiments, Resources, Planner, Tools, Admin/Sysadmin.
- Resources includes `Inventory / Storage map` as the visual inventory entry.

The `personal-mode.html` page records what was hidden so the customization is reversible.

`Tools -> Personal mode` 会记录当前隐藏了哪些入口，方便之后回滚或调整。

### Planner

The planner adds a personal experiment planning calendar inside the eLabFTW UI. It supports month/week/day views, plan status, links to experiments/resources, quick completion, deletion, and retroactive completion notes.

规划日历用于安排实验事项，不等同于 eLabFTW 原生的仪器预约 Scheduler。

### Literature

The Literature page provides a lightweight Zotero-like view inside eLabFTW. Zotero remains the reference manager and source of metadata; the ELN page reads it through a server-side API proxy and stores local reading cards on the data disk. If Zotero is not configured yet, local paper records can still be created from the `Local paper` button.

第一版只读取 Zotero，不写回 Zotero。ELN 本地保存阅读状态、总结、阅读笔记、关联实验、关联资源，以及可回溯到具体段落/图片/发现的 Evidence cards。

Evidence cards can be copied into the Markdown editor as references:

```md
[[Evidence:PaperKey#fig-20260620093000]]
```

The Markdown editor renders these references as clickable source chips. `[[Experiment:12]]` and `[[Resource:11]]` remain available for native eLabFTW record links, while Evidence cards are for paper-level quotes, figures, findings, and protocol hints.

Configure Zotero from the `Literature -> API config` button, with environment variables in the eLabFTW container, or with a data-disk config file:

```json
{
  "api_key": "zotero-api-key",
  "library_id": "1234567",
  "library_type": "user"
}
```

Runtime config file path:

```text
/www/elabftw-data/silverbullet-space/Literature/zotero-config.json
```

Inside the container this appears as:

```text
/elabftw/silverbullet-space/Literature/zotero-config.json
```

Local literature files are stored on the data disk:

```text
/www/elabftw-data/silverbullet-space/Literature/papers
/www/elabftw-data/silverbullet-space/Literature/cards
/www/elabftw-data/silverbullet-space/Literature/evidence
```

### Ideas

The Ideas page is a memo-style Markdown capture area for quick observations, hypotheses, and follow-up thoughts. It supports manual tags, `#tag` extraction, optional location filtering, `[[Experiment:12]]`, and `[[Resource:11]]`.

`灵感` 是轻量 memo 区，用于像发动态一样快速记录想法，并可按日期、标签和位置回看。

### Storage Map

The storage map visualizes freezer layouts, drawers, boxes, and individual slots. Slots can be linked to native eLabFTW resources, so the visual freezer map and the resource database stay connected. Visual assignments are also mirrored into eLabFTW's native `STORAGE` panel as storage units and item containers.

入口在 `Resources -> Inventory / Storage map`。样本实体仍然使用 eLabFTW 原生 Resources，冰箱孔位会把 Resource 链接到具体位置，并同步显示在 Resource 自带的 `STORAGE` 区块中。

### Experiment Diagram

The diagram panel provides a local drawing board for experiment schematics. It is intended for workflow sketches and visual notes near the experiment editor without relying on cloud sync.

实验画板是本地嵌入的示意图工具，用于在实验正文上方画流程图或操作示意，不依赖 Excalidraw 云同步。

### Drive Links

Experiment and resource edit pages include a lightweight Drive files panel. It stores Google Drive or Google Docs URLs as structured links in the eLabFTW database, so raw data folders, Google Sheets, images, datasheets, manuals, protocols, and analysis files can be opened from the related record without OAuth sync.

这是轻量引用，不同步 Google Drive 文件内容，也不保存 Google 登录授权；系统只保存标题、链接和备注。

## Development

Install dependencies:

```bash
npm install
```

Run unit tests:

```bash
npm test
```

Run browser smoke tests against the deployed eLabFTW instance:

```bash
cp .env.e2e.example .env.e2e
# fill ELAB_EMAIL and ELAB_PASSWORD locally
npm run smoke:e2e
```

Build the experiment diagram bundle after changing React sources:

```bash
npm run build:diagram
```

## Deployment Notes

The live eLabFTW instance uses Docker and template overrides under the eLabFTW data directory. A typical deployment copies the maintained overrides and add-on pages into the mounted override/web locations, then clears template cache or restarts the web container.

Current important override:

```text
/www/elabftw-data/overrides/head.html
/www/elabftw-data/overrides/edit.html
/www/elabftw-data/overrides/view.html
/www/elabftw-data/overrides/literature.html
/www/elabftw-data/overrides/ideas.html
/www/elabftw-data/overrides/literature.php
/www/elabftw-data/overrides/literature-api.php
/www/elabftw-data/overrides/ideas.php
/www/elabftw-data/overrides/drive-links.html
/www/elabftw-data/overrides/drive-links-api.php
/www/elabftw-data/overrides/storage-map.html
/www/elabftw-data/overrides/storage-view-edit.html
```

After changing template overrides, refresh runtime cache:

```bash
docker exec elabftw sh -lc 'rm -rf /elabftw/cache/twig/* /elabftw/cache/templates/* 2>/dev/null || true'
docker compose -f /root/elabftw/docker-compose.yml restart web
```

Keep secrets and runtime state out of git:

- `.env`
- `.env.e2e`
- `htpasswd-*`
- `playwright/.auth/`
- `playwright-report/`
- `test-results/`
- `node_modules/`

## Reversibility

These customizations are intentionally shallow:

- eLabFTW core files are not edited directly.
- Hidden navigation items are hidden by template override, not deleted from eLabFTW.
- Runtime data remains in the eLabFTW database and data volume.

To roll back the personal navigation cleanup, restore the previous `head.html` override or remove the override file from the eLabFTW data directory.
