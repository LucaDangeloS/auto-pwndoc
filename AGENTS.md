# AGENTS.md

## Project Context
This repository is a fork of `pwndoc-ng`, a pentest report generation tool, serving as a final master's degree thesis project. The core objective is to modernise the application and integrate AI features to assist in report elaboration.

## Goals
- Fix immediate issues from the base `pwndoc-ng` repository.
- Upgrade dependencies and codebase.
- Implement AI-driven features for reporting.

## Methodology
- **Testing**: All implementations must be correctly verified.
  - For automated tests (docker, logs, HTTP calls), the agent will perform them and report the results.
  - For manual testing (e.g. frontend visual checks), the agent will provide the user with the link and instructions to test it.
- **Comments**: Minimise comments in the codebase to maintain readability.
- **Documentation**: Everything implemented must be documented in this file under the Changes Log section. No exceptions.
- **Restart affected containers**: After each change, the agent **must** restart the affected containers and check logs before reporting success:
  - **Backend changes** (`backend/src/**`): `docker compose -f docker-compose-dev.yml restart backend`
  - **Frontend changes** (`frontend/src/**`, `frontend/quasar.config.js`): `docker compose -f docker-compose-dev.yml restart frontend-app`
  - **Infra changes** (`docker-compose-dev.yml`, `Dockerfile.dev`): `docker compose -f docker-compose-dev.yml up -d`

## Branch Policy
- **`master`**: Main branch, canonical default (`origin/HEAD → origin/master`). All significant work is merged here. Do **not** push a branch named `main` to remote.
- **`update-dependencies`**: Dependency upgrades and related breaking-change fixes.
- **`new-ui`**: Purely visual/UI changes — no new features or API endpoints.
- **`ai-features`**: AI infrastructure and features (not yet active as a separate branch; work has been merged to master).

---

## Project Map

> **Token-efficiency rule for AI agents:** read only the files listed in the sub-section that matches the request. Do **not** scan the full project. The map below tells you exactly which files to open for any given task. Reading files outside that set wastes context with no benefit.
>
> Before opening any source file, re-read the **Changes Log** section of this file — every feature already implemented is documented there in enough detail to answer most questions without touching source.

---

### Infrastructure

| File | Purpose |
|---|---|
| `docker-compose-dev.yml` | Dev stack: `backend`, `frontend-app`, `proxy` (nginx), `mongodb`, `chroma`, `languagetool`. Add/change env vars here (`APP_URL`, `MIGRATE_FROM`, `CHROMA_HOST`, etc.). |
| `docker-compose.yml` | Production stack (minimal, no dev tooling). |
| `backend/Dockerfile.dev` | Backend dev image (Node + nodemon). |
| `frontend/Dockerfile.dev` | Frontend dev image (Quasar CLI + webpack-dev-server). |
| `frontend/.docker/nginx.dev.conf` | nginx reverse proxy — routes `/api` → backend, frontend dev server WebSocket upgrades → frontend, `/v2` → LanguageTool. **Modify here when adding new proxy paths.** |

**Container restart rules:**

| Changed files | Command |
|---|---|
| `backend/src/**` | `docker compose -f docker-compose-dev.yml restart backend` |
| `frontend/src/**`, `frontend/quasar.config.js` | `docker compose -f docker-compose-dev.yml restart frontend-app` |
| `docker-compose-dev.yml`, any `Dockerfile.dev` | `docker compose -f docker-compose-dev.yml up -d` |

Always tail logs after restart for the affected service, for example: `docker compose -f docker-compose-dev.yml logs --since 1m backend` or `docker compose -f docker-compose-dev.yml logs --since 1m frontend-app`

---

### Backend — entry point

**`backend/src/app.js`** — read this only when changing startup order, adding middleware, or registering a new route file. Boot sequence: MongoDB connect → model imports → `runMigration()` → middleware (CORS, body-parser, cookie-parser) → route registration → cron jobs → ChromaDB startup sync → Hocuspocus WebSocket server (port 8440).

To register a new route file add: `require('./routes/yourfile')(app)` after the existing imports.

CORS headers are set in `app.js` — `X-API-Key` is already in the `Access-Control-Allow-Headers` list.

---

### Backend models (`backend/src/models/`)

Read when: adding schema fields, changing validation, understanding stored data shape.

| File | What it models |
|---|---|
| `settings.js` | **Single-document global config.** Sections: `report`, `reviews`, `danger`, `mcp`, `ai`. Statics: `getAll()` (full, server-only), `getPublic()` (safe for browser — strips `ai.private` and `mcp.apiKey`), `update()`, `restoreDefaults()`. **Always start here when adding any new configurable feature.** |
| `audit.js` | `AuditSchema` + `Finding` subdocument. Fields: `isRetest`, `executiveSummary` (embedded object), `findings[]`, `scope[]`, `sections[]`, `state`, `approvals[]`. All DB logic in statics (`createFinding`, `updateFinding`, `deleteFinding`, `getGeneral`, `updateGeneral`, etc.). |
| `audit-archive.js` | Metadata for uploaded historical audit PDFs (`name`, generated disk `filename`, `originalName`, `size`, `mimeType`, `uploadedBy`). PDF bytes are stored on disk under `backend/audit-archives/`, not in MongoDB. |
| `vulnerability.js` | `VulnerabilitySchema` + `VulnerabilityDetails` subdocument (per-locale). Statics: `getAll`, `getAllByLanguage`, `create`, `update`, `delete`, `Merge`. |
| `user.js` | User schema with `permissions[]` extra-grants array. `updateRefreshToken` merges base role permissions with `user.permissions` into the JWT `payload.roles`. |
| `audit-type.js` | Audit type lookup (name, sections, templates). |
| `vulnerability-type.js` | Vulnerability type lookup, per-locale name. |
| `vulnerability-category.js` | Category lookup with sort configuration used by `updateSortFindings`. |
| `custom-field.js` | Custom field definition (display context, type, default text per locale). |
| `custom-section.js` | Custom section definition. |
| `client.js` / `company.js` | Client contact and company schemas. |
| `template.js` | DOCX template binary storage. |
| `image.js` | Image binary store (base64, referenced in POC HTML as `/api/images/:id`). |
| `language.js` | Language/locale entry (`language`, `locale`). |
| `vulnerability-update.js` | Pending vulnerability update/diff awaiting review. |

**Schema change checklist:** add a migration step in `backend/src/lib/migration.js` (append to `STEPS` array with unique `id`) and document it in the **Migration steps** table in this file.

---

### Backend routes (`backend/src/routes/`)

Each file: `module.exports = function(app) { ... }` — no Express Router, routes registered directly on `app`. Auth is per-route as the second argument. `req.decodedToken` carries `{ id, username, role, roles }` after successful auth.

| File | Endpoints |
|---|---|
| `audit.js` | `GET/POST /api/audits`, `/api/audits/:id` (full), `/api/audits/:id/general`, `/api/audits/:id/network`, `/api/audits/:id/findings` (CRUD), `/api/audits/:id/sections/:sid`, sort, review, approval, report generation. Emits `io.to(auditId).emit('updateAudit')` after every mutation. |
| `audit-archive.js` | `GET/POST /api/audit-archives`, `GET /api/audit-archives/:id/file`, `DELETE /api/audit-archives/:id`. Uploads accept base64 PDFs up to 200 MB, validate PDF signatures, store files in `backend/audit-archives/`, and stream them inline for the browser reader. |
| `vulnerability.js` | `GET/POST/PUT/DELETE /api/vulnerabilities[/:id][/:locale]`. Fires `indexVulnAsync` / `deleteVulnAsync` (fire-and-forget ChromaDB hooks) on mutations. |
| `ai.js` | `POST /api/ai/generate` — RAG + LLM. `POST /api/ai/search-similar` — semantic search. `POST /api/ai/analyze-proofs` — vision pipeline. `POST /api/ai/reindex-all` — background reindex. `GET /api/ai/reindex-status` — progress tracker. `POST /api/ai/list-models` — provider model enumeration. `POST /api/ai/test` — provider connection tests. |
| `settings.js` | `GET /api/settings` (full, admin-only), `GET /api/settings/public` (browser-safe), `PUT /api/settings`, `PUT /api/settings/revert`, `GET /api/settings/export`, `POST /api/settings/mcp/rotate-key`, `DELETE /api/settings/mcp/key`. |
| `mcp.js` | `POST /api/mcp` — MCP Streamable HTTP, JSON-RPC 2.0. Guarded by `mcp-auth.js`. Implements: `initialize`, `ping`, `tools/list`, `tools/call` (13 tools). Tool handlers call existing REST endpoints via internal HTTPS with a short-lived admin JWT. |
| `user.js` | `POST /api/users/token` (login), `GET /api/users/refreshtoken`, `DELETE /api/users/refreshtoken` (logout), `GET/POST/PUT /api/users`, `PUT /api/users/me`, TOTP endpoints. |
| `data.js` | Languages, audit types, vulnerability types/categories, custom fields/sections — all under `/api/data/*`. |
| `client.js` / `company.js` | `/api/clients` and `/api/companies` CRUD. |
| `template.js` | `/api/templates` CRUD + upload. |
| `image.js` | `/api/images` upload + retrieval. |

**HTTP response helpers** (always use `lib/httpResponse.js` — response body key is `datas`, not `data`):

```js
Response.Ok(res, data)           // 200
Response.Created(res, data)      // 201
Response.BadParameters(res, msg) // 422
Response.Unauthorized(res, msg)  // 401
Response.Forbidden(res, msg)     // 403
Response.NotFound(res, msg)      // 404
Response.Internal(res, err)      // 500
```

---

### Backend library (`backend/src/lib/`)

Read only the file that matches the area being changed.

| File | Purpose — read when |
|---|---|
| `ai-service.js` | **Central AI generation.** `generate({ action, text, fieldName, context, aiSettings })`. Provider routing via `buildChatModel()` (switch on `provider` enum). Prompt resolution order: per-field override (`field_{name}_{action}SystemPrompt`) → generic action prompt → hardcoded default. `ensureV1(url)` appends `/v1` if missing — OpenWebUI users enter the base URL without `/v1`. **Touch when:** adding an AI action, a new provider, or changing prompt logic. |
| `embedding-service.js` | ChromaDB vector store. `indexVulnerability`, `deleteVulnerability`, `searchSimilar`, `reindexAll`. Strict locale filtering. Forces `float` encoding for non-OpenAI providers. |
| `vision-service.js` | Multimodal proof analysis. Extracts `<img>` tags from POC HTML, fetches base64 from Image model, calls vision LLM, optionally anonymises output. Returns `{ visionSummary, imageDescriptions }`. |
| `translate-service.js` | Auto-translate vulnerability details field-by-field via LLM. `translateVulnerability` (on create), `translateVulnerabilityUpdate` (on update). Preserves HTML tags. |
| `mcp-auth.js` | Middleware for `POST /api/mcp`. Validates `X-API-Key` header against `settings.mcp.apiKey` and checks `mcp.enabled`. Returns JSON-RPC error shapes on failure. |
| `migration.js` | Migration runner. `runMigration()` called at startup when `MIGRATE_FROM` env var is set. Steps are append-only; tracked in `_migrations` collection. |
| `report-generator.js` | DOCX generation via docxtemplater. Exposes all template variables (`audit.*`, `finding.*`). Touch when adding new report variables. |
| `auth.js` | `ACL` class — `acl.hasPermission('perm')` (Express middleware factory) and `acl.isAllowed(role, perm)` (sync check). JWT secret from `config/config.json`. Cookie format: `token=JWT <token>` (split on space). |
| `httpResponse.js` | Standardised response helpers (see above). |
| `html2ooxml.js` | HTML → OOXML converter for DOCX. Touch when fixing report HTML rendering. |
| `chart-generator.js` | Generates chart images embedded in DOCX. |
| `cvsscalc31.js` / `cvsscalc40.js` | CVSS 3.1 and 4.0 score calculators. |
| `utils.js` | Generic utilities: filename validation, UUID, `getObjectPaths`. |
| `cron.js` | Scheduled background jobs. |
| `passwordpolicy.js` | Password strength validation. |

---

### Backend config (`backend/src/config/`)

| File | Purpose |
|---|---|
| `config.json` | Runtime config per `NODE_ENV` (`dev`, `prod`, `test`): DB server/port/name, HTTP port/host, JWT secrets, `apidoc` flag. JWT secrets are auto-generated on first run if absent. |
| `roles.json` | Custom ACL role definitions (`allows`, `inherits`). Built-in roles (`user`, `admin`) are hardcoded in `lib/auth.js`. |
| `mcp-server-sample.json` | Copy-paste MCP client config for Claude Desktop + curl. References `APP_URL` env var. |

---

### Backend translate (`backend/src/translate/`)

`index.js` + `es.json`, `fr.json`, `nl.json`, `ru.json` — locale strings used by `report-generator.js` to localise report-level labels (e.g. overall risk level names). Touch when adding a new report-level localised string.

---

### Frontend architecture

**Stack:** Vue 3 + Quasar 2 + TipTap v3 + Vue Router 4 + Vue I18n + Axios + Socket.IO client.

**Split-file convention:** most pages use three files — `index.vue` (thin route wrapper, never edit), `page.html` (template), `page.js` (component logic). Edits go to `.html` + `.js` pairs only.

**Global API base URL:** `window.location.origin + '/api'` — set in `boot/axios.js`. All service files import `{ api }` from there.

---

### Frontend boot plugins (`frontend/src/boot/`)

Read only when changing startup behaviour. Listed in `quasar.config.js` boot array — order matters.

| File | Purpose |
|---|---|
| `auth.js` | Navigation guard — checks JWT cookie, redirects to `/login` if unauthenticated. Uses `router.currentRoute.value.path` (Vue Router 4). |
| `axios.js` | Configures global `api` Axios instance. Handles 401 → token refresh → retry queue. |
| `settings.js` | Loads `GET /api/settings/public` on startup; stores as `this.$settings`. Call `this.$settings.refresh()` after saving settings to propagate changes. |
| `i18n.js` | Installs Vue I18n, sets initial locale from localStorage or browser. |
| `socketio.js` | Initialises Socket.IO client; exposes as `this.$socket`. |
| `notify-defaults.js` | Sets Quasar Notify defaults: `position: 'top-right'`, `offset: [10, 70]` (clears navbar). |
| `darkmode.js` | Restores dark mode preference from localStorage. |
| `lodash.js` | Registers lodash as `this.$_`. |

---

### Frontend router (`frontend/src/router/`)

| File | Purpose |
|---|---|
| `routes.js` | **All route definitions.** Touch here when adding a new page or sub-route. Nested under `/audits/:auditId`: `general`, `network`, `executive-summary`, `findings/add`, `findings/:findingId`, `sections/:sectionId`. |
| `index.js` | Creates the Vue Router 4 instance. |

---

### Frontend services (`frontend/src/services/`)

Thin Axios wrappers — one file per API domain. Always call through these; never use `api` directly in page components.

| File | Wraps |
|---|---|
| `ai.js` | `/api/ai/*` — `generate`, `searchSimilar`, `analyzeProofs`, `reindexAll`, `testConnection` |
| `audit.js` | `/api/audits/*` — full audit, findings, network, general, sections, report download |
| `audit-archive.js` | `/api/audit-archives/*` — list/upload/delete archived PDFs and fetch PDF bytes for the in-app reader |
| `vulnerability.js` | `/api/vulnerabilities/*` — CRUD + update review + `backupFinding` |
| `settings.js` | `/api/settings/*` — get/update/export/revert + `rotateMcpKey`, `clearMcpKey` |
| `user.js` | Auth + profile + `isAllowed(permission)` ACL check (reads `roles` from decoded JWT cookie) |
| `data.js` | Languages, audit types, vuln types/categories, custom fields/sections |
| `client.js` / `company.js` | Client and company CRUD |
| `collaborator.js` / `reviewer.js` | User listing for picker components |
| `template.js` | DOCX template CRUD |
| `image.js` | Image upload and retrieval |
| `utils.js` | Shared utilities: `syncEditors`, `filterCustomFields`, `AUDIT_VIEW_STATE` enum |
| `autoCorrection.js` | Editor auto-correction helpers |

---

### Frontend components (`frontend/src/components/`)

| File | When to touch |
|---|---|
| `editor.vue` | Adding toolbar buttons, new TipTap extensions, AI toolbar integration, editor props (`fieldName`, `aiContext`, `toolbar`, `noSync`, `editable`, `collab`). The `toolbar` prop is a string array controlling which button groups render. |
| `ai-assistant.js` | How AI generate/complete/rewrite commands work inside the editor. Defines `aiGenerate`, `aiComplete`, `aiRewrite` TipTap commands. Calls `AiService.generate`. |
| `similar-vuln-modal.vue` | Semantic similarity results dialog. Two-panel: results list + field diff + Apply. Supports text-based and proof-based (vision) modes via `isProofMode` prop. |
| `template-hint.vue` | The `?` hover icon showing the docxtemplater variable name for a field. Used on every field label in audit pages. |
| `cvss-calculator-unified.vue` | CVSS v3.1 + v4.0 calculator. `v-model` = cvssv3 string, `v-model:cvssv4Value` = cvssv4 string. |
| `breadcrumb.vue` | Page header with responsive layout. `<template #buttons>` slot for page-level action buttons. |
| `custom-fields.vue` | Renders the dynamic custom fields array. |
| `textarea-array.vue` | Editable list of strings (references, scope items) with stable unique IDs. |
| `language-selector.vue` | Locale picker dropdown. |
| `languagetool.js` | TipTap LanguageTool extension — spell/grammar underlines via nginx-proxied `/v2` endpoint. |

---

### Frontend pages (`frontend/src/pages/`)

Navigate directly to the relevant sub-directory. Do not open others.

| Directory | When to touch |
|---|---|
| `settings/` | AI provider config (generation/embedding/vision), per-action + per-field prompt overrides, MCP settings (enable/key/sample configs), report settings, CVSS colours, reviews. `settings.js` holds `DEFAULT_PROMPTS`, `aiFieldPromptFields`, `aiProviderOptions`, `getSettings()`, `testAiConnection()`, `rotateMcpKey()`. |
| `audits/edit/findings/edit/` | Finding edit — tabs: Definition (title, type, description, observation, references), Proofs/POC, Retest Evidence, Details (affected assets, CVSS, remediation). All `basic-editor` instances pass `fieldName` and `:aiContext`. Dirty tracking via `_.isEqual(finding, findingOrig)`. Loading guard blocks navigation during data fetch. |
| `audits/edit/executive-summary/` | Executive summary — overall risk picker, summary editor, per-severity editors with AI suggest buttons and confirm-overwrite dialog. |
| `audits/edit/general/` | General audit info — name, dates, company, client, scope, language, reviewers, collaborators, `isRetest` toggle. All fields have `<template-hint>`. |
| `audits/edit/index.vue` | Audit shell — collapsible left drawer, sub-route navigation menu. **Add new audit sub-pages here** (new `q-item` + route). |
| `audits/edit/network/` | Network/scope hosts editor. |
| `audits/edit/sections/` | Custom sections editor. |
| `audits/list/` | Audit list — table, create dialog, filter. |
| `audits-archive/` | Historical audit PDF archive — upload/list/delete PDFs and read them with embedded outline navigation plus a client-side searchable text index for page jumps. |
| `vulnerabilities/` | Vulnerability library — list, create/edit modal, update review modal (diff between current and proposed). |
| `data/collaborators/` | User management — role picker + granular permissions checkbox grid (5 categories × n permissions). |
| `data/custom/` | Custom fields and sections editor. `section` prop (`'vulnerabilities'`, `'audits'`, `'custom'`) controls which tabs are visible. |
| `data/vulnerabilities-data/` | Thin wrapper passing `section="vulnerabilities"` to `<custom>` (Languages / Vuln Types / Vuln Categories). |
| `data/audits-data/` | Thin wrapper passing `section="audits"` to `<custom>` (Audit Types). |
| `data/dump/` | Import/export. Delete All hidden for non-admins. |
| `data/index.vue` | Data section sidebar — People / Vulnerabilities / Audits / Custom Data / Import-Export groups. Add new data pages here. |
| `profile/` | User profile — change password, preferences. |

---

### Frontend i18n (`frontend/src/i18n/`)

Five locale files: `en-US`, `es-ES`, `fr-FR`, `de-DE`, `zh-CN`.

**Rule:** when adding any user-facing string, add the key to **all five** locale files. Use `en-US/index.js` as the authoritative key source. Keys are flat (not nested) except for the `btn`, `msg`, `tooltip`, `err`, and `nav` sub-objects.

---

### Frontend styles (`frontend/src/css/`)

| File | Purpose |
|---|---|
| `quasar.variables.styl` | Colour palette — Tailwind-inspired slate scale (`$slate50`–`$slate900`), `$primary`, `$secondary`. |
| `app.styl` | Global overrides — card/input/button border-radius, dark mode remaps (`.body--dark .bg-grey-*`), AI loading pulse animation (`.ai-loading`). |

---

### Settings model — complete field reference

The settings document is a singleton in MongoDB. `Settings.getPublic()` strips everything under `ai.private` and the `mcp.apiKey` field. Never expose these to the browser.

```
settings.report.enabled / .public.* / .private.*
settings.reviews.enabled / .public.* / .private.*
settings.danger.enabled / .public.* / .private.*

settings.mcp.enabled
settings.mcp.apiKey          ← server-only, never in getPublic()
settings.mcp.apiKeyCreatedAt

settings.ai.enabled
settings.ai.embeddingEnabled
settings.ai.visionEnabled

settings.ai.public.*         ← provider, model, temperature, maxTokens,
                                embeddingProvider, embeddingModel, embeddingMaxDistance

settings.ai.visionPublic.*   ← visionProvider, visionModel

settings.ai.private.*        ← apiKey, apiUrl, azure.*, embeddingApiKey, embeddingApiUrl,
                                embeddingAzure.*, visionApiKey, visionApiUrl, visionAzure.*,
                                visionSystemPrompt, visionAnonymizeLlm, visionAnonymizeRegex,
                                generateSystemPrompt, generateUserPrompt,
                                completeSystemPrompt, completeUserPrompt,
                                rewriteSystemPrompt, rewriteUserPrompt,
                                fillProofsSystemPrompt,
                                executiveSummarySystemPrompt, severitySummarySystemPrompt,
                                field_{name}_{action}SystemPrompt  (15 keys, see below)
```

**Per-field prompt keys** (`ai.private`) — `fieldName` ∈ `{description, observation, remediation, poc, retestEvidence}`, `action` ∈ `{generate, complete, rewrite}`:
```
field_description_generateSystemPrompt    field_description_completeSystemPrompt    field_description_rewriteSystemPrompt
field_observation_generateSystemPrompt    field_observation_completeSystemPrompt    field_observation_rewriteSystemPrompt
field_remediation_generateSystemPrompt    field_remediation_completeSystemPrompt    field_remediation_rewriteSystemPrompt
field_poc_generateSystemPrompt            field_poc_completeSystemPrompt            field_poc_rewriteSystemPrompt
field_retestEvidence_generateSystemPrompt field_retestEvidence_completeSystemPrompt field_retestEvidence_rewriteSystemPrompt
```

**Prompt resolution order** in `ai-service.js`:
1. `ai.private.field_{fieldName}_{action}SystemPrompt` (if non-empty)
2. `ai.private.{action}SystemPrompt` (if non-empty)
3. Hardcoded `DEFAULT_SYSTEM_PROMPTS[action]`

---

### AI system — full data flow

```
Browser editor toolbar
  → ai-assistant.js (TipTap extension: aiGenerate / aiComplete / aiRewrite commands)
    → frontend/src/services/ai.js  →  POST /api/ai/generate
      → backend/src/routes/ai.js
          → embedding-service.js (RAG search via ChromaDB, if embeddingEnabled + findingTitle present)
          → ai-service.js
              buildChatModel(provider)  →  LangChain ChatOpenAI / AzureChatOpenAI
              resolve prompt (per-field → generic → default)
              invoke(messages)  →  provider endpoint /v1/chat/completions
          → returns { html }
      → editor inserts / replaces content
```

**Supported providers** (all route through `ChatOpenAI` via `baseURL` except Azure):

| Provider value | Effective endpoint | Auth header |
|---|---|---|
| `openai` | `https://api.openai.com/v1/chat/completions` | `Authorization: Bearer <apiKey>` |
| `anthropic` | `<apiUrl or https://api.anthropic.com>/v1/chat/completions` | `Authorization: Bearer <apiKey>` |
| `ollama` | `<apiUrl or http://ollama:11434>/v1/chat/completions` | `Authorization: Bearer ollama` (ignored) |
| `azure-openai` | Azure endpoint via `AzureChatOpenAI` | `api-key` header |
| `openai-compatible` | `<apiUrl>/v1/chat/completions` | `Authorization: Bearer <apiKey>` |

`ensureV1(url)` appends `/v1` if the stored URL doesn't already end with it. For OpenWebUI: store the base URL without `/v1` (e.g. `http://openwebui:3000`); `ensureV1` adds it, LangChain appends `/chat/completions`.

---

### MCP server — full data flow

```
AI agent  →  POST /api/mcp  (X-API-Key: <key>)
  → mcp-auth.js  (checks settings.mcp.enabled + compares key against settings.mcp.apiKey)
    → mcp.js  (JSON-RPC 2.0 dispatcher)
        method: initialize  →  returns server info + protocol version 2025-03-26
        method: tools/list  →  returns 13 tool schemas
        method: tools/call  →  callTool(name, args)
            internal HTTPS request to https://127.0.0.1:<port>/api/*
            with Cookie: token=JWT <short-lived admin JWT signed with jwtSecret>
          → existing REST route handles the operation
          → result wrapped in { content: [{ type: 'text', text: JSON.stringify(result) }] }
```

**13 MCP tools:** `list_audits`, `get_audit`, `update_audit_general`, `get_audit_network`, `update_audit_network`, `list_findings`, `get_finding`, `create_finding`, `update_finding`, `delete_finding`, `list_vulnerabilities`, `search_similar_vulnerabilities`, `apply_vulnerability_to_finding`.

---

### Auth model

| Aspect | Detail |
|---|---|
| Cookie format | `token=JWT <token>` — split on space, verify `cookie[0] === 'JWT'`, then `jwt.verify(cookie[1], jwtSecret)` |
| Route middleware | `acl.hasPermission('perm:string')` as the second argument on every route |
| Admin scope check | `acl.isAllowed(req.decodedToken.role, 'audits:read-all')` inside handlers for admin-vs-own filtering |
| MCP auth | `X-API-Key` header only — completely independent of JWT cookies |
| Frontend ACL | `UserService.isAllowed('permission')` — reads `roles` array from decoded JWT cookie; no extra API call |

Built-in role base permissions are hardcoded in `lib/auth.js` (`builtInRoles`). Custom roles go in `config/roles.json`.

---

### Granular permissions

Users have `role` (`user` or `admin`) + optional `permissions[]` extra-grant array. At login, `user.js` `updateRefreshToken` merges: `[...new Set([...baseRolePerms, ...user.permissions])]` → embedded in JWT as `payload.roles`. Admin role gets `'*'`. Changes take effect at next login or token refresh.

**Known permission strings:**

```
audits:create/read/update/delete/read-all/update-all/review/review-all
audit-archives:read/create/delete
vulnerabilities:read/create/update/delete/delete-all
vulnerability-updates:create
settings:read/read-public/update
users:read/read-all/create/update
templates:read/create/update/delete
languages:read/create/update/delete
audit-types:read/create/update/delete
vulnerability-types:read/create/update/delete
vulnerability-categories:read/create/update/delete
custom-fields:read/create/update/delete
sections:read/create/update/delete
images:create/read
clients:create/read/update/delete
companies:create/read/update/delete
roles:read
```

---

### Report template variables

Exposed by `backend/src/lib/report-generator.js` for use in DOCX templates (docxtemplater syntax):

| Variable | Type | Notes |
|---|---|---|
| `audit.name`, `.language`, `.date`, `.date_start`, `.date_end` | String | |
| `audit.is_retest` | Boolean | |
| `audit.overall_risk` | String | Localised (e.g. `"Alto"` in Spanish) |
| `audit.executive_summary` | HTML object | Use `\| convertHTML` |
| `audit.critical_summary` … `audit.informative_summary` | HTML object | Use `\| convertHTML` |
| `{#findings}` … `{/findings}` | Loop | |
| `finding.title`, `.vulnType`, `.category` | String | |
| `finding.description`, `.observation`, `.remediation`, `.poc` | HTML object | Use `\| convertHTML` |
| `finding.retest_evidence` | HTML object | Use `\| convertHTML` |
| `finding.retest_passed` | Boolean/null | `true` = passed, `false` = failed, `null` = not set |
| `finding.references_links` | OOXML string | Use raw tag `{@finding.references_links}` to render references as one hyperlink per line |
| `finding.cvss.baseMetricScore` | Number | CVSS 3.1 |
| `finding.cvss4.baseMetricScore` | Number | CVSS 4.0 |
| `{#audit.collaborators}.firstname .lastname{/audit.collaborators}` | Loop | |

---

### Database migration

- Triggered by `MIGRATE_FROM=<mongodb_uri>` env var on the `backend` service in `docker-compose-dev.yml`.
- `migration.js` `runMigration()` is called at every backend startup — it is a no-op when `MIGRATE_FROM` is empty.
- Applied steps tracked in `_migrations` collection of the destination DB.
- **Steps are append-only.** Never modify an existing step. Current steps 1–9 cover: base collections, vulnerabilities, audits, `isRetest`, retest finding fields, CVSSv4 fields, `executiveSummary`, and report chart theme defaults.
- When adding a schema field: append a new step object `{ id, name, async run(srcDb, dstDb) }` to the `STEPS` array in `migration.js` and document it in the Migration steps table in this file.

#### Migration steps

| Step | Name | Description |
|---|---|---|
| 1 | `copy-base-collections` | Copies clients, companies, templates, languages, audit-types, vulnerability-types/categories, custom-sections/fields, images by `_id` without overwriting existing documents. Users are matched by `username`: existing destination users are preserved, missing source users are inserted with `refreshTokens: []`, and audit user references are remapped when usernames already exist locally. |
| 2 | `copy-vulnerabilities` | Copies the full vulnerabilities collection |
| 3 | `copy-audits` | Copies the full audits collection |
| 4 | `add-isRetest-to-audits` | Sets `isRetest: false` on all copied audits that lack the field |
| 5 | `add-retest-fields-to-findings` | Sets `retestEvidence: ''` and `retestPassed: null` on all finding subdocuments that lack these fields |
| 6 | `add-cvssv4-to-vulnerabilities` | Sets `cvssv4: ''` on all vulnerability documents that lack the field |
| 7 | `add-cvssv4-to-findings` | Sets `cvssv4: ''` on all finding subdocuments that lack the field |
| 8 | `add-executive-summary-to-audits` | Sets `executiveSummary: { overallRisk: '', summary: '', criticalSummary: '', highSummary: '', mediumSummary: '', lowSummary: '', informativeSummary: '' }` on all audit documents that lack the field |
| 9 | `add-chartTheme-to-settings` | Sets `report.public.chartTheme` defaults on settings documents that lack the field |

---

### Testing

```bash
# Backend integration tests — requires MongoDB on 127.0.0.1:27017
cd backend && npm test
```

Test files in `backend/tests/` — one per domain (`audit`, `vulnerability`, `user`, `settings`, etc.). Fixtures in `backend/tests/fixtures/test-vulnerabilities.json` (10 canonical vulns in `en-GB` locale).

---

### Key conventions — quick reference

- **Route files** export `module.exports = function(app) { ... }` — no Express Router.
- **Model statics** do all DB work; routes are thin orchestrators.
- **Response body key is `datas`** (not `data`) — `Response.Ok(res, payload)` → `{ status: 'success', datas: payload }`.
- **Fire-and-forget** for AI side-effects (ChromaDB index/delete, auto-translate) — never `await` them in route handlers; errors are logged, not propagated.
- **Socket.IO** `io.to(auditId).emit('updateAudit')` after every audit/finding mutation — required for collaborative editing to update other connected clients.
- **Split-file pages** — always edit `.html` + `.js`; never edit `index.vue` wrappers.
- **Settings refresh** — after any `PUT /api/settings` call in the frontend, call `this.$settings.refresh()` to propagate public settings to all components.
- **Minimise comments** in source files — rely on `AGENTS.md` and this file for context.
- **Document every change** in the Changes Log section of this file. No exceptions.
- **i18n** — every user-facing string goes in all 5 locale files.
- **Schema changes** always require a migration step.

---

## Dev Environment Reference

### Default credentials
- **Username**: `admin`
- **Password**: `Admin1admin2`

### Access
- App: `https://localhost:8443`
- Backend API: `https://localhost:8443/api`

### Test data on fresh install
After a full restart with data destruction (`docker compose down -v`), the MongoDB volume is wiped. Upon first boot the admin user is pre-seeded automatically. Everything else must be re-created.

**Order matters: add languages before vulnerabilities.**

```bash
TOKEN=$(curl -sk -X POST https://localhost:8443/api/users/token \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin1admin2"}' | jq -r '.datas.token')

# 1 — languages
curl -sk -X POST https://localhost:8443/api/data/languages \
  -H "Content-Type: application/json" -H "Cookie: token=JWT $TOKEN" \
  -d '{"language":"English","locale":"en-GB"}'

curl -sk -X POST https://localhost:8443/api/data/languages \
  -H "Content-Type: application/json" -H "Cookie: token=JWT $TOKEN" \
  -d '{"language":"Spanish","locale":"es-ES"}'

# 2 — vulnerabilities
curl -sk -X POST https://localhost:8443/api/vulnerabilities \
  -H "Content-Type: application/json" -H "Cookie: token=JWT $TOKEN" \
  -d @backend/tests/fixtures/test-vulnerabilities.json
```

The backend authenticates via cookie (`token=JWT <token>`), not a Bearer header.

The fixture `backend/tests/fixtures/test-vulnerabilities.json` contains 10 canonical test vulnerabilities (SQL Injection, XSS, IDOR, SSRF, Broken Authentication, Path Traversal, Command Injection, Insecure Deserialization, Security Misconfiguration, Sensitive Data Exposure) using the `en-GB` locale.

---

## Changes Log

### Audit archive

- `backend/src/models/audit-archive.js` + `backend/src/routes/audit-archive.js`: historical audit PDF archive with metadata in MongoDB, PDF bytes stored under `backend/audit-archives/`, 200 MB PDF validation, inline streaming, and delete cleanup.
- `backend/src/app.js`, compose files, and nginx configs: registered archive model/routes, persisted the archive storage directory, and raised JSON/proxy body limits to support 200 MB base64 PDF uploads.
- Frontend: `services/audit-archive.js`, `/audits-archive` route, main navigation entry, and `pages/audits-archive/` for upload/list/delete plus in-app PDF reading with embedded outline navigation and client-side searchable page index for jump-to-page results.
- Regression test: `backend/tests/audit-archive.test.js` covers empty list, upload validation, list, file streaming, and delete.

### AI features

- `backend/src/lib/ai-service.js`: unified generation via LangChain; provider routing (`openai`, `anthropic`, `ollama`, `azure-openai`, `openai-compatible`); prompt resolution order (per-field → generic action → hardcoded default); `ensureV1()` for URL normalisation.
- `backend/src/lib/embedding-service.js`: ChromaDB vector store for vulnerability semantic search; strict locale filtering; `float` encoding for non-OpenAI providers.
- `backend/src/lib/vision-service.js`: multimodal proof analysis — extracts images from POC HTML, calls vision LLM, optional anonymisation.
- `backend/src/routes/ai.js`: `POST /api/ai/generate` (RAG + LLM), `/search-similar`, `/analyze-proofs`, `/reindex-all`, `/reindex-status`, `/list-models`, `/test`.
- ChromaDB service in `docker-compose-dev.yml`; startup sync in `app.js`; fire-and-forget index/delete hooks in `vulnerability.js`.
- Frontend: `services/ai.js`, `components/ai-assistant.js` (TipTap extension), AI toolbar in `editor.vue`, all finding editors wired with `fieldName` + `aiContext`; AI editor actions now open a previous/proposed review dialog before applying generated text and clear loading state when the request finishes.
- `components/ai-diff-modal.vue`: side-by-side AI comparison dialog with editable proposed text and explicit apply/keep controls.
- `components/similar-vuln-modal.vue`: two-panel diff dialog with viewport margins and Apply-action spacing; supports text-based and proof-based (vision) modes.

### AI UX polish

Comprehensive polish pass on every user-facing AI interaction point — unified visual language, in-flight feedback, cancellation, sanitisation, accessibility, discoverability, and i18n parity across all five locales.

**Foundations**
- `frontend/src/services/ai.js`: every AI endpoint accepts an optional `AbortSignal` (`generate`, `searchSimilar`, `analyzeProofs`, `reindexAll`, `reindexStatus`, `testConnection`, `listModels`).
- `frontend/src/services/ai-helpers.js` (new): `sanitizeHtml` (DOMPurify wrapper), `notifyError` / `notifySuccess` / `notifyWarning` with consistent position + timeout, `isAbortError`, `extractErrorMessage`, `isAiEnabled` / `isEmbeddingEnabled` / `isVisionEnabled`, `aiDisabledReason(kind)`.
- `frontend/src/components/ai-action-btn.vue` (new): single visual language for every AI button — purple accent, `auto_awesome` icon, `:loading` spinner, `:disabled-reason` tooltip pointing to settings, optional cancel mode.
- `frontend/src/components/ai-overlay.vue` (new): translucent overlay with spinner + "AI is writing…" label + Cancel button. Used over the editor body and other long-running surfaces.
- `frontend/src/css/app.styl`: tag-agnostic `.ai-loading` selector, `prefers-reduced-motion` block, replaced glyph with icon, added `.ai-overlay`, `.ai-test-row`, `.ai-test-result`, `.rotate-anim` keyframe.
- `frontend/package.json`: added `dompurify` dependency.

**Editor**
- `components/editor.vue`: AI dropdown shows disabled-with-tooltip (instead of `v-if`-removing) when AI is off, with the disabled reason from settings; per-action sub-tooltips wired from existing i18n keys; `<ai-overlay>` mounted over the editor body during requests with a Cancel button; new `regenerateAi` and `cancelAi` methods.
- `components/ai-assistant.js`: AbortController integration, rewrite-without-selection now shows a confirm dialog ("Rewrite the entire field?"), retry action injected into the error Notify, sanitisation of generated HTML before applying, exposed `cancelAiCommand(editor)` and `aiCancel()` TipTap command.
- `components/ai-diff-modal.vue`: added Regenerate button, swapped Apply to green/positive and Keep-previous to grey/flat, ARIA roles on contenteditable panes, DOMPurify on both panes, keyboard-accessible Close icon.

**Finding edit & similar-vuln**
- `pages/audits/edit/findings/edit/edit.html`: Search Similar and Search-from-Proofs both use `<ai-action-btn>` with cancellable mode, disabled-with-tooltip when embeddings/vision are off.
- `pages/audits/edit/findings/edit/edit.js`: AbortController for searchSimilar / analyzeProofs / fill-proofs; selection token to discard stale fill-proofs results when the user clicks another result; abort-on-modal-close; abort-on-unmount; `applySimilarVuln` now accepts a `{ result, fields }` payload; helpers from `ai-helpers.js` for notifications.
- `components/similar-vuln-modal.vue`: per-field apply checkboxes (description/observation/remediation/references/cvssv3/cvssv4/poc), "Select all" / "Only changed" quick actions, Apply count badge, ARIA `role="listbox"` + `role="option"` + `aria-selected` on results, Retry button on the error state, vision summary still shown when zero similar results in proof mode, DOMPurify on all `v-html`, `@close` event for parent abort hooks.

**Executive summary**
- `pages/audits/edit/executive-summary/executive-summary.html`: AI buttons use `<ai-action-btn>` with cancel mode; `<ai-diff-modal>` mounted at page level so AI suggestions go through the same review flow as the editor toolbar (no more direct overwrite after upfront confirm).
- `pages/audits/edit/executive-summary/executive-summary.js`: per-editor AbortController in `aiControllers` map; navigation guard (`beforeRouteLeave`) prompts when AI is in flight; `regenerateAi` / `cancelAiOnEditor` methods; `Save` button now reflects an actual `saving` flag.

**Settings**
- `pages/settings/settings.js`: model dropdowns populated by `loadModelList(type)` calling `/api/ai/list-models`; `applyDefaultUrlIfEmpty(type)` triggered on provider change; `safeClipboard` fallback to `document.execCommand('copy')` for insecure HTTP origins; reindex confirm dialog with cost/time warning + live status polling (`_startReindexPolling` / `REINDEX_POLL_MS`); MCP `Clear key` now requires a confirm dialog with explicit destructive warning; Save button has `:loading="saving"` wired to the actual save call; tests track `aiTest[type].controller` so duplicate clicks abort the previous test; `clearAiTestResult(type)` clears inline test indicators; `formatLastTestRun(type)` shows last-tested-at persisted in localStorage.
- `pages/settings/settings.html`: model selects now use `q-select` with `use-input` + `new-value-mode="add-unique"` + popup `loadModelList` hook; refresh icon next to each model select; API key visibility icons converted to `<q-btn>` with `aria-label` and tooltip; test result rows wrap and use `.ai-test-message` (max-width, max-height, scroll) for long error responses; per-result clear icon; per-type "last tested" caption; reindex live progress bar driven by `/api/ai/reindex-status`.

**Discoverability**
- `pages/vulnerabilities/vulnerabilities.html` + `.js`: vulnerability create/edit modals now pass `fieldName` + `aiContext = { findingTitle, locale }` to the description/observation/remediation editors so AI generation runs with proper RAG context.

**i18n parity**
- 47 new keys added to all five locales (`en-US`, `es-ES`, `fr-FR`, `de-DE`, `zh-CN`): `btn.retry`, `btn.clear`, `btn.close`, `aiAssistant`, `aiSuggest` (was missing in 3 locales), `untitled` (was missing in all 5), `aiSuggestTooltip`, `aiSuggestOverwriteTitle`, `aiRewriteWholeTitle`, `aiRewriteWholeMessage`, `aiGeneratingAction`, `aiCompletingAction`, `aiRewritingAction`, `aiEmptyResponse`, `aiInFlightTitle`, `aiInFlightMessage`, `aiRegenerate`, `aiRegenerateTooltip`, `aiDisabledReasonGlobal`, `aiDisabledReasonEmbedding`, `aiDisabledReasonVision`, `aiHideApiKey`, `aiShowApiKey`, `aiRefreshModels`, `aiModelManualHint`, `aiTestLastRunAt`, `aiReindexConfirmTitle`, `aiReindexConfirmMessage`, `aiReindexAlreadyRunning`, `aiReindexProgress`, `aiReindexFinished`, `aiReindexFinishedWithFailures`, `mcpClearKeyConfirmTitle`, `mcpClearKeyConfirmMessage`, `mcpCopyKey`, `similarVulnSearchTooltip`, `searchSimilarFromProofsTooltip`, `similarVulnSelectAll`, `similarVulnSelectChanged`, `similarVulnApplyHint`, `similarVulnApplyCount`, `similarVulnChanged`, `similarVulnSame`.

**Backend additions**
- `backend/src/routes/ai.js`: `GET /api/ai/reindex-status` returns the live tracker (`{ inProgress, total, processed, failed, startedAt, finishedAt, lastError }`); `POST /api/ai/list-models` enumerates models per provider — static list for Anthropic, manual for Azure, live `/v1/models` fetch for OpenAI / OpenAI-compatible / Ollama, with graceful failure that surfaces the upstream error string for diagnostics.
- `backend/src/lib/embedding-service.js`: added `reindexState` tracker + `getReindexStatus()` export; `reindexAll(aiSettings)` populates the tracker per vulnerability and now refuses to start a duplicate reindex while one is in progress.
- `backend/tests/ai.test.js` (new): regression suite covering `reindex-status` shape, `list-models` invalid type rejection, `list-models` static path for Anthropic, `test` invalid type rejection, and `generate` Forbidden when AI is off.

### Report references

- `backend/src/lib/report-generator.js`: added `links` filter and `finding.references_links` report variable so finding references can render as one hyperlink paragraph per line in DOCX templates via `{@finding.references_links}`.

### Severity 3D pie chart filter

- `backend/src/lib/chart-generator.js` + `backend/src/lib/report-generator.js`: added native editable OOXML 3D pie charts via `{@findings | severityPie3D}` or `{@findings | severityPie3D: 'Custom title'}`. The filter buckets findings into Critical, High, Medium, Low, and Informational using CVSSv3 `baseSeverity`, falls back to CVSSv4 `baseSeverity`, and sends missing/unknown severities to Informational.
- `backend/src/models/settings.js` + migration step 9: added `report.public.chartTheme` for report-wide 3D chart styling: title/legend/data-label colours and sizes, label mode, border, plot-area fill, and 3D rotation/perspective. Slice colours still come from existing `report.public.cvssColors`.
- Frontend Settings → Report: added Chart theme controls and i18n labels across all five frontend locales.
- Backend report translations: added `Informational` and `Vulnerabilities` keys for chart labels/titles in supported report locales.
- Regression coverage: `backend/tests/lib.test.js` now checks that generated 3D pie chart XML contains `<c:pie3DChart>`, `<c:view3D>`, configured slice colours, and all five data points.

### Retest feature

- `audit.js` model: `isRetest: Boolean` on `AuditSchema`; `retestEvidence: String`, `retestPassed: Boolean|null` on `Finding`.
- Report variables: `audit.is_retest`, `finding.retest_evidence`, `finding.retest_passed`.
- Frontend: `isRetest` toggle in general page; Retest Evidence tab in finding edit (visible only when `localAudit.isRetest`).

### Finding deletion navigation

- `frontend/src/pages/audits/edit/findings/edit/edit.js`: after deleting the currently open finding, navigation now selects an adjacent remaining finding when available and falls back to the audit General page when no finding exists or the adjacent navigation fails.

### Executive Summary section

- `audit.js` model: `executiveSummary` embedded object (`overallRisk`, `summary`, `criticalSummary`, `highSummary`, `mediumSummary`, `lowSummary`, `informativeSummary`).
- Report variables: `audit.overall_risk` (localised), `audit.executive_summary`, `audit.critical_summary` … `audit.informative_summary` — all use `| convertHTML`.
- Page: `audits/edit/executive-summary/` — overall risk dropdown, summary editor, per-severity editors with AI suggest.
- AI actions: `executive-summary` and `severity-summary` — context keys `auditName`, `severity`, `findingsDigest` (includes severity + CVSS score per finding).
- Settings: `executiveSummarySystemPrompt`, `severitySummarySystemPrompt` in `ai.private`.

### AI settings — prompts and provider config

- All generation prompts configurable in Settings → AI → Advanced Settings.
- Generic action prompts: `generateSystemPrompt`, `generateUserPrompt`, `completeSystemPrompt`, `completeUserPrompt`, `rewriteSystemPrompt`, `rewriteUserPrompt`, `fillProofsSystemPrompt`.
- Per-field overrides (15 keys): `field_{fieldName}_{action}SystemPrompt` for each of `description`, `observation`, `remediation`, `poc`, `retestEvidence` × `generate`, `complete`, `rewrite`.
- Connection test endpoint: `POST /api/ai/test` (`type: 'generation' | 'embedding' | 'vision'`).
- UI: `settings.js` holds `DEFAULT_PROMPTS` (all 9 generic keys + 15 field keys), `aiFieldPromptFields` array, `testAiConnection()`.
- UI: generation temperature uses a styled native range slider (`.ai-temperature-slider`) to remain visible in dark mode.

### Granular user permissions

- `user.js` model: `permissions: [String]` extra-grant array; `updateRefreshToken` merges with base role perms into `payload.roles`.
- Routes: `POST/PUT /api/users` accept `permissions` array.
- Frontend: collaborators page has role picker + permissions checkbox grid (5 categories); Settings nav gated on `settings:read`.
- Permission changes take effect at next login or token refresh.

### Native MCP server

- Endpoint: `POST /api/mcp` — JSON-RPC 2.0, Streamable HTTP transport, protocol version `2025-03-26`.
- Auth: `X-API-Key` header validated by `mcp-auth.js` against `settings.mcp.apiKey`.
- Settings: `mcp.enabled`, `mcp.apiKey`, `mcp.apiKeyCreatedAt` (key never in `getPublic()`). Key rotation: `POST /api/settings/mcp/rotate-key`. Clear: `DELETE /api/settings/mcp/key`.
- Tool handlers make internal HTTPS calls to existing REST routes using a short-lived admin JWT.
- 13 tools: `list_audits`, `get_audit`, `update_audit_general`, `get_audit_network`, `update_audit_network`, `list_findings`, `get_finding`, `create_finding`, `update_finding`, `delete_finding`, `list_vulnerabilities`, `search_similar_vulnerabilities`, `apply_vulnerability_to_finding`.
- `APP_URL` env var in both compose files drives the MCP endpoint URL in sample configs.
- Sample config: `backend/src/config/mcp-server-sample.json` (Claude Desktop + curl).
- Frontend: MCP Settings card in settings page — enable toggle, masked key, rotate/clear/copy, sample config snippets.

### Migration and session hardening

- `backend/src/lib/migration.js`: migration now waits for the destination Mongoose connection before accessing `mongoose.connection.db`, preventing startup failures when MongoDB recovery is still in progress.
- User migration preserves existing destination accounts by matching source users on `username`; missing users are inserted with `refreshTokens: []`, and audit user references are remapped to preserved local users when needed.
- `backend/src/routes/user.js`: refresh-token failures for missing sessions now return `401` and clear both auth cookies using the correct cookie path, preventing stale refresh-token retry loops after migration or DB replacement.
- `README.md`: includes exact PowerShell and Bash command sequences to migrate from an `old-mongo-data` folder through a temporary `mongo:5` source container and a temporary Compose override that sets `MIGRATE_FROM`.

### Default admin auto-seed

- `backend/src/lib/seed-admin.js`: at every backend start the users collection is checked. When empty, a default admin (`admin` / `Admin1admin2`) is created automatically so a fresh stack always exposes working credentials. Existing accounts are never overwritten.
- `RESET_DEFAULT_ADMIN=true` env var on the `backend` service forces the admin user back to the default password and clears all refresh tokens — safe escape hatch when a migrated database leaves an unknown admin password and login keeps returning 401 / "Invalid refreshToken".
- `backend/src/lib/reset-default-admin.js` + `npm run reset-admin`: standalone script that connects to the configured database and restores the admin to default credentials. Run from the backend container: `docker exec -it autopwndoc-backend npm run reset-admin`.
- Regression test: `backend/tests/auth-default.test.js` — boots from an empty users collection, asserts the seed creates the admin, performs a full login + refresh-token round-trip with the documented credentials, asserts wrong passwords return 401, and verifies `resetDefaultAdmin()` recovers the account when its password drifts. Hooked into `tests/index.test.js` between the unauthenticated and user suites.

### Agent workflow updates

- Frontend changes under `frontend/src/**` or `frontend/quasar.config.js` require `docker compose -f docker-compose-dev.yml restart frontend-app` followed by `docker compose -f docker-compose-dev.yml logs --since 1m frontend-app`.
- Backend tests now use the isolated `pwndoc-test` database, fail fast if pointed at the development `pwndoc` database, and await the initial cleanup before registering tests so stale test data cannot race the suite.
- The frontend dev container runs `npm install` before `npm run dev` so package changes mounted over the persisted `node_modules` volume are installed after container restarts.

### OpenWebUI provider support

Use the existing **`openai-compatible`** provider — no new provider type needed.

1. Provider: `OpenAI Compatible`
2. API URL: `http://openwebui:3000` (no `/v1` — `ensureV1()` appends it)
3. API Key: JWT session token or permanent API key from Open WebUI → Settings → Account → API Keys
4. Model: exact model ID as shown in Open WebUI

`ensureV1()` + LangChain produce `http://openwebui:3000/v1/chat/completions` with `Authorization: Bearer <token>` — exactly what Open WebUI expects. Embedding/vision work only if the chosen model supports those capabilities through Open WebUI.

Frontend: blue info banner shown below each provider grid when `openai-compatible` is selected.

### Dependency security upgrade

- Backend dependencies and lockfile were updated to clear all npm audit findings, including LangChain/ChromaDB, Mongoose, Docxtemplater, OTPAuth, Yjs, body-parser, lodash, bcrypt, and targeted transitive security overrides. Jest now transforms dependencies so updated ESM packages used by LangChain can run in the existing backend test suite.
- Frontend dependencies and lockfile were updated to clear all production and development npm audit findings, including Quasar, TipTap, Vue, Axios, PDF.js, DOMPurify, Electron tooling, and targeted transitive security overrides.
- Frontend Quasar tooling moved to `@quasar/app-webpack` v4 / `@quasar/cli` v4. Required migrations: `frontend/quasar.conf.js` was renamed to `frontend/quasar.config.js` and converted to ESM, `frontend/src/index.template.html` moved to root `frontend/index.html` with the Quasar entry-point marker, and webpack-dev-server config was updated to v5 schema (`server` and array `proxy`).
- Backend and frontend Docker images now use Node 22 so upgraded dependencies satisfy current engine requirements. `docker-compose-dev.yml` mounts `frontend/index.html` and `frontend/quasar.config.js` into the dev container.
- Verification after the upgrade: backend production audit `0`, backend full audit `0`, backend tests `162/162`; frontend production audit `0`, frontend full audit `0`, frontend `npm test` passed, and frontend production build passed in the Node 22 container.

### Auto-translate vulnerabilities

Service implemented in `backend/src/lib/translate-service.js` (`translateVulnerability`, `translateVulnerabilityUpdate`) but **route-level wiring and settings UI are pending**. The service translates `details` fields (`title`, `vulnType`, `description`, `observation`, `remediation`) field-by-field via LLM, preserving HTML. Errors per-locale are logged and skipped. `aiSettings.translateLocales` (array of locale strings) drives target locales — this field is not yet in the settings schema.

---

## TODO
- [ ] Checklists feature (design TBD)
- [ ] Wire auto-translate: add `translateLocales` to settings schema + frontend UI + call `translateVulnerability` / `translateVulnerabilityUpdate` from `vulnerability.js` route after create/update
