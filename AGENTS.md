# AGENTS.md

<role>
You are an engineering agent working on `autopwndoc`, a fork of `pwndoc-ng` used as a final master's degree thesis project.
Your job is to modernise the application, fix inherited issues, upgrade the codebase, and implement AI-assisted pentest reporting features without regressing existing report workflows.
</role>

<context>
<project>
- Product: pentest report generation platform based on `pwndoc-ng`.
- Backend: Node.js, Express-style route registration, Mongoose, MongoDB, Socket.IO, DOCX report generation, ChromaDB-backed AI retrieval.
- Frontend: Vue 3, Quasar 2, TipTap v3, Vue Router 4, Vue I18n, Axios, Socket.IO client.
- Dev stack: Docker Compose services `backend`, `frontend-app`, `proxy`, `mongodb`, `chroma`, and `languagetool`.
</project>

<repository_goals>
- Fix immediate issues inherited from the base `pwndoc-ng` repository.
- Upgrade dependencies and code structure where needed.
- Build AI-driven features that help prepare, enrich, review, and generate reports.
- Keep the thesis project maintainable and explainable for future work.
</repository_goals>

<branch_policy>
- `master`: canonical default branch. Do not push a branch named `main`.
- `update-dependencies`: dependency upgrades and required compatibility fixes.
- `new-ui`: visual/UI changes only; no new features or API endpoints.
- `ai-features`: AI infrastructure and features when separated from `master`.
</branch_policy>
</context>

<default_follow_through_policy>
- If the repository contains enough context, proceed without asking questions.
- Ask only when a missing decision would materially change the implementation, data model, security posture, or user-facing behavior.
- Do not ask for confirmation before reversible analysis, local reads, tests, or log inspection.
- Keep changes narrowly scoped to the user's request and the local patterns already present in the codebase.
- Do not revert or overwrite unrelated user changes.
</default_follow_through_policy>

<research_mode>
Work internally in three passes for non-trivial tasks:
1. Plan: translate the request into concrete code areas, risks, and verification steps.
2. Retrieve: read only the project-map files relevant to the task; follow second-order references only when they affect correctness.
3. Synthesize: implement the smallest complete change, verify it, and report only the outcome and important evidence.
</research_mode>

<tool_persistence_rules>
- Prefer `rg` / `rg --files` for searches.
- Use additional searches when they materially improve correctness or completeness.
- If a search is empty, partial, or suspiciously narrow, retry with alternate terms, nearby routes/components, or caller/callee references.
- Do not stop at the first plausible hit when the task affects permissions, persistence, report generation, migrations, authentication, or AI provider behavior.
- Use sub-agents only for independent focused searches or disjoint implementation work, then merge and verify the evidence before finalizing.
</tool_persistence_rules>

<grounding_rules>
- Base implementation decisions on files actually inspected in this repository.
- Do not invent endpoints, fields, permissions, route names, i18n keys, template variables, or migration state.
- Label assumptions when they cannot be confirmed locally.
- Prefer existing service/model/helper APIs over ad hoc logic.
- When behavior crosses backend and frontend, trace the whole flow before editing.
</grounding_rules>

<completeness_contract>
- Treat a task as incomplete until every requested behavior is implemented, explicitly deferred, or listed as blocked with the missing evidence.
- For backend behavior, verify route, model/static method, permissions, response shape, persistence, side effects, and tests/logs when applicable.
- For frontend behavior, verify service wrapper, component/page integration, i18n strings in all locales, loading/error states, and visual/manual test instructions when applicable.
- For schema changes, add an append-only migration step and document the new durable model behavior in this file.
- For report-generation changes, verify template variables, HTML/OOXML conversion, generated output behavior, and relevant translations.
- Before final response, verify changed containers were restarted when required and logs were checked, unless impossible; if impossible, state why.
</completeness_contract>

<verbosity_controls>
- Prefer concise, information-dense code and responses.
- Minimise source comments; add them only when they explain non-obvious behavior.
- Do not emit chain-of-thought, speculative filler, or long narrative summaries.
- In final responses, lead with what changed and how it was verified.
- Keep durable documentation in this file as current operating knowledge, not as a chronological changelog.
</verbosity_controls>

<documentation_policy>
- Keep `AGENTS.md` focused on current architecture, conventions, and durable feature knowledge needed by future agents.
- Do not maintain a historical Changes Log in this file.
- When a change introduces new durable behavior, update the relevant XML section below instead of appending a dated change entry.
- When a change adds a schema field, update the schema-change section and the relevant model/settings reference if future agents must know it.
</documentation_policy>

<verification_policy>
<automated_tests>
- Run the most focused reliable automated tests available for the touched area.
- Backend integration tests require MongoDB on `127.0.0.1:27017`:
  `cd backend && npm test`
- If a full suite is too expensive or blocked, run targeted tests and clearly report the remaining risk.
</automated_tests>

<container_restart_rules>
- Backend changes under `backend/src/**`:
  `docker compose -f docker-compose-dev.yml restart backend`
- Frontend changes under `frontend/src/**` or `frontend/quasar.config.js`:
  `docker compose -f docker-compose-dev.yml restart frontend-app`
- Infra changes to `docker-compose-dev.yml` or any `Dockerfile.dev`:
  `docker compose -f docker-compose-dev.yml up -d`
- After restarting, inspect logs for the affected service, for example:
  `docker compose -f docker-compose-dev.yml logs --since 1m backend`
  `docker compose -f docker-compose-dev.yml logs --since 1m frontend-app`
</container_restart_rules>

<manual_testing>
- For manual frontend checks, provide the local URL and a short test path.
- Do not claim visual success unless the UI was actually inspected.
</manual_testing>
</verification_policy>

<project_map>
<token_efficiency_rule>
Read only the subsection that matches the task. Do not scan the full repository unless the request is cross-cutting and the relevant files cannot be identified from this map.
</token_efficiency_rule>

<infrastructure>
- `docker-compose-dev.yml`: dev stack, service env vars such as `APP_URL`, `MIGRATE_FROM`, `CHROMA_HOST`.
- `docker-compose.yml`: production stack.
- `backend/Dockerfile.dev`: backend dev image.
- `frontend/Dockerfile.dev`: frontend dev image.
- `frontend/.docker/nginx.dev.conf`: dev reverse proxy; `/api` to backend, frontend websocket upgrades, `/v2` to LanguageTool.
</infrastructure>

<backend_entrypoint>
- `backend/src/app.js`: startup order, middleware, route registration, cron, ChromaDB startup sync, Hocuspocus WebSocket server on port `8440`.
- Register new route files with `require('./routes/name')(app)` alongside existing route registration.
- CORS headers are configured here; `X-API-Key` is already allowed.
</backend_entrypoint>

<backend_models>
- `backend/src/models/settings.js`: singleton global config. Use first for configurable features. `getAll()` is server-only; `getPublic()` strips `ai.private` and `mcp.apiKey`.
- `backend/src/models/audit.js`: audits, findings, scope, sections, approvals, retest fields, executive summary fields. DB logic belongs in statics.
- `backend/src/models/audit-archive.js`: uploaded historical audit PDF metadata; bytes live under `backend/audit-archives/`.
- `backend/src/models/vulnerability.js`: vulnerability library with per-locale details and merge/update helpers.
- `backend/src/models/user.js`: users, roles, refresh tokens, extra `permissions[]` grants merged into JWT `roles`.
- `backend/src/models/audit-type.js`, `custom-field.js`, `custom-section.js`, `client.js`, `company.js`, `template.js`, `image.js`, `language.js`, `vulnerability-update.js`: lookup, dynamic form, document, image, locale, and pending vulnerability-update data.
- `backend/src/models/vulnerability-taxonomy.js`: unified locale-agnostic taxonomy `{type, category?, subcategory?, code?}` with sort config on type-root rows. Loose semantics — vulnerabilities and audit findings store taxonomy values as plain strings in their `taxonomies[]` arrays, so renames here do not cascade. Mass-edit support via `parseLines()` and `replaceAll()` statics. The legacy `vulnerability-type.js` and `vulnerability-category.js` models were retired in Phase 3.
- `backend/src/models/vulnerability-translation-group.js`: non-destructive translation mapping between library vulnerabilities in different languages. Each group contains `members[]` with `{vulnerability, locale, isSource, lastEditedAt, lastSyncedAt, syncStatus}` and enforces one vulnerability per locale by replacing existing members on relate. Imported vulnerabilities start unmapped; mappings are managed through `/api/vulnerabilities/*/translations*`.
- `backend/src/models/vulnerability-matching-run.js`: persisted background proposal runs for automatic translation matching. Runs store progress plus pending/accepted/dismissed proposals so the UI can recover after page refresh or backend restart. Applying proposals creates/updates `VulnerabilityTranslationGroup` records. Matching thresholds are distance cutoffs; the explicit start payload wins, then `settings.ai.public.vulnerabilityProcessing.matchThreshold`, then `embeddingMaxDistance`. `DELETE /api/vulnerabilities` clears vulnerabilities, translation groups, and matching runs together so imports start with no mapping state.
- Custom field `fieldType: 'checklist'` stores `field.text[locale].value` as an array of `{label, code, taxonomy: {type, category, subcategory}, status, note}`. The audit/finding/section instance copies this array forward at create time; `Audit.applyChecklistAutoMark` is invoked from `createFinding` / `updateFinding` and flips a row's `status` from `untested` to `fail` when the finding's `taxonomies[]` (or legacy `category`/`vulnType`) match the row's taxonomy or `code`. Pass/fail/na set by a human are never overwritten. Generate-from-taxonomy uses `POST /api/data/vulnerability-taxonomy/generate-checklist`.
- **Custom sections revamp (migration step 13)**: `CustomSection` model fields are now `{field, name, icon, type: 'text'|'checklist', rows: [{label}]}`. The `type` and `rows` fields are new. `Audit.sections[]` sub-schema is `{field, name, type, text, rows: [{label, status, note}]}` — the former `customFields: [customField]` array was removed from sections entirely (sections are self-contained, no longer coupled to the generic `CustomField` system). Migration step 13 backfills `type='text'` and `rows=[]` on existing `customsections` documents and strips `customFields` from embedded `audits.sections[]` entries. The `DELETE /api/data/sections/:field` route now uses only `field` (locale parameter removed). `Audit.applyChecklistAutoMark` no longer walks section customFields. Report templates expose `{section_field.type}`, `{section_field.text | convertHTML}` (text type), and `{#section_field.rows}…{/}` with `.label`, `.status`, `.note` per row (checklist type).
- **Supported languages (migration step 15)**: runtime language selectors and report language records are limited to English (`en`/`en-US`), Spanish (`es`/`es-ES`), and German (`de`/`de-DE`). Step 15 deletes persisted French and Chinese language rows (`fr`, `fr-FR`, `zh`, `zh-CN`) from the `languages` collection; it does not rewrite historical audit or vulnerability content that was already authored in those locales.
- **Obsolete WSTG General custom fields (migration steps 16-17)**: the experimental `WSTG Checklist` and `wstg` custom-field rows on the audit General page were removed. Step 16 deletes those `customfields` rows and pulls their references from `audits.customFields`, `audits.findings[].customFields`, `vulnerabilities.details[].customFields`, and `vulnerabilityupdates.customFields`; step 17 removes already-orphaned embedded audit snapshots from databases that ran the first version of step 16. `CustomField.delete()` now performs the same cross-domain cleanup for future deletions.
</backend_models>

<backend_routes>
- Route files export `module.exports = function(app) { ... }`; routes are registered directly on `app`.
- Auth middleware is passed per route. `req.decodedToken` carries `{ id, username, role, roles }`.
- `backend/src/routes/audit.js`: audits, findings, sections, sorting, review, approval, report generation; emit `io.to(auditId).emit('updateAudit')` after audit/finding mutations.
- `backend/src/routes/audit-archive.js`: historical PDF upload/list/read/delete.
- `backend/src/routes/vulnerability.js`: vulnerability CRUD and fire-and-forget Chroma index/delete hooks.
- `backend/src/routes/ai.js`: generation, semantic search, proof analysis, reindex, model listing, provider tests.
- `backend/src/routes/settings.js`: full/public settings, update/revert/export, MCP key rotation/clear.
- `backend/src/routes/mcp.js`: MCP Streamable HTTP JSON-RPC endpoint guarded by `mcp-auth.js`.
- `backend/src/routes/user.js`: login, refresh token, logout, user CRUD, profile, TOTP.
- `backend/src/routes/data.js`, `client.js`, `company.js`, `template.js`, `image.js`: supporting CRUD domains.
</backend_routes>

<backend_libraries>
- `backend/src/lib/ai-service.js`: central AI generation, provider routing, prompt resolution, `ensureV1(url)`.
- `backend/src/lib/embedding-service.js`: ChromaDB indexing/search/reindex, locale filtering.
- `backend/src/lib/vision-service.js`: multimodal proof analysis from POC images.
- `backend/src/lib/translate-service.js`: LLM translation helpers.
- `backend/src/lib/mcp-auth.js`: MCP API-key middleware and JSON-RPC error shapes.
- `backend/src/lib/migration.js`: append-only migration runner controlled by `MIGRATE_FROM`.
- `backend/src/lib/report-generator.js`: DOCX generation and template variable exposure.
- `backend/src/lib/auth.js`: ACL, JWT verification, built-in role permissions.
- `backend/src/lib/httpResponse.js`: standard response helpers. Response body key is `datas`, not `data`.
- `backend/src/lib/html2ooxml.js`, `chart-generator.js`, `cvsscalc31.js`, `cvsscalc40.js`, `utils.js`, `cron.js`, `passwordpolicy.js`: report rendering, scoring, utilities, scheduled jobs, password policy.
</backend_libraries>

<backend_config>
- `backend/src/config/config.json`: runtime config by `NODE_ENV`; JWT secrets are auto-generated if absent.
- `backend/src/config/roles.json`: custom ACL roles. Built-in `user` and `admin` roles are hardcoded in `auth.js`.
- `backend/src/config/mcp-server-sample.json`: sample MCP client config driven by `APP_URL`.
- `backend/src/translate/*.json`: report-level localization strings used by report generation.
</backend_config>

<frontend_architecture>
- Split-file convention: most pages use `index.vue` as a thin wrapper plus `page.html` and `page.js`. Edit `.html` and `.js`, not wrapper `index.vue`, unless the shell itself is changing.
- API base URL is configured in `frontend/src/boot/axios.js` as `window.location.origin + '/api'`.
- Page components should call `frontend/src/services/*` wrappers instead of importing `api` directly.
</frontend_architecture>

<frontend_boot_and_router>
- `frontend/src/boot/auth.js`: navigation guard and JWT cookie checks.
- `frontend/src/boot/axios.js`: global Axios instance and 401 refresh retry queue.
- `frontend/src/boot/settings.js`: loads public settings and exposes `this.$settings`; call `this.$settings.refresh()` after settings saves.
- `frontend/src/boot/i18n.js`, `socketio.js`, `notify-defaults.js`, `darkmode.js`, `lodash.js`: localization, sockets, notifications, dark mode, lodash.
- `frontend/src/router/routes.js`: all route definitions. Touch when adding pages/sub-routes.
</frontend_boot_and_router>

<frontend_services>
- `frontend/src/services/ai.js`: AI endpoints.
- `frontend/src/services/audit.js`: audit, finding, network, general, section, report endpoints.
- `frontend/src/services/audit-archive.js`: historical PDF archive endpoints.
- `frontend/src/services/vulnerability.js`: vulnerability library and update review endpoints.
- `frontend/src/services/settings.js`: settings, export/revert, MCP key actions.
- `frontend/src/services/user.js`: auth/profile and frontend ACL checks.
- `frontend/src/services/data.js`, `client.js`, `company.js`, `collaborator.js`, `reviewer.js`, `template.js`, `image.js`, `utils.js`, `autoCorrection.js`: supporting API and UI helpers.
</frontend_services>

<frontend_components>
- `frontend/src/components/editor.vue`: TipTap editor, toolbar groups, AI integration props, collaboration/editability behavior.
- `frontend/src/components/ai-assistant.js`: TipTap AI commands and calls to `AiService.generate`.
- `frontend/src/components/similar-vuln-modal.vue`: semantic similarity result selection and diff/apply UI.
- `frontend/src/components/template-hint.vue`: docxtemplater variable hint.
- `frontend/src/components/cvss-calculator-unified.vue`: CVSS 3.1 and 4.0 calculator.
- `frontend/src/components/breadcrumb.vue`, `custom-fields.vue`, `textarea-array.vue`, `language-selector.vue`, `languagetool.js`: shared UI and editor helpers.
</frontend_components>

<frontend_pages>
- `frontend/src/pages/settings/`: report/review/danger/MCP/AI provider settings, prompt settings, model tests.
- `frontend/src/pages/audits/edit/findings/edit/`: finding edit tabs, editors, proofs, retest evidence, CVSS, remediation.
- `frontend/src/pages/audits/edit/executive-summary/`: overall risk and executive/severity summaries.
- `frontend/src/pages/audits/edit/general/`: audit metadata, scope, language, reviewers, collaborators, retest toggle.
- `frontend/src/pages/audits/edit/index.vue`: audit shell navigation; add audit sub-page menu entries here.
- `frontend/src/pages/audits/edit/network/`, `sections/`, `audits/list/`, `audits-archive/`: audit-adjacent pages.
- `frontend/src/pages/vulnerabilities/`: vulnerability library and update review.
- `frontend/src/pages/data/`: users, custom data, audit/vulnerability data, import/export.
- `frontend/src/pages/profile/`: user profile and preferences.
</frontend_pages>

<frontend_i18n_and_styles>
- Locale files live under `frontend/src/i18n/`: `en-US`, `es-ES`, `de-DE`.
- When adding user-facing strings, add keys to all three locale files.
- Keys are flat except `btn`, `msg`, `tooltip`, `err`, and `nav`.
- `frontend/src/css/quasar.variables.styl`: color palette.
- `frontend/src/css/app.styl`: global UI overrides, dark mode remaps, AI loading/overlay styles.
</frontend_i18n_and_styles>
</project_map>

<domain_contracts>
<http_response_contract>
Use `backend/src/lib/httpResponse.js` for backend responses:
```js
Response.Ok(res, data)           // 200
Response.Created(res, data)      // 201
Response.BadParameters(res, msg) // 422
Response.Unauthorized(res, msg)  // 401
Response.Forbidden(res, msg)     // 403
Response.NotFound(res, msg)      // 404
Response.Internal(res, err)      // 500
```
The response payload key is `datas`.
</http_response_contract>

<auth_contract>
- Cookie format: `token=JWT {token}`.
- Use `acl.hasPermission('permission:string')` as route middleware.
- Use `acl.isAllowed(role, 'permission')` for synchronous admin/ownership checks.
- Frontend ACL uses `UserService.isAllowed('permission')` from JWT `roles`.
- MCP auth is independent from JWT and uses the `X-API-Key` header.
</auth_contract>

<known_permissions>
`audits:create/read/update/delete/read-all/update-all/review/review-all`
`audit-archives:read/create/delete`
`vulnerabilities:read/create/update/delete/delete-all`
`vulnerability-updates:create`
`settings:read/read-public/update`
`users:read/read-all/create/update`
`templates:read/create/update/delete`
`languages:read/create/update/delete`
`audit-types:read/create/update/delete`
`vulnerability-taxonomy:read/create/update/delete`
`custom-fields:read/create/update/delete`
`sections:read/create/update/delete`
`images:create/read`
`clients:create/read/update/delete`
`companies:create/read/update/delete`
`roles:read`
</known_permissions>

<schema_change_rules>
- Start with the relevant model file and `backend/src/lib/migration.js`.
- Migration steps are append-only. Never modify existing migration steps.
- Inspect `STEPS` in `migration.js` to find the current highest id, then append a new unique id.
- Keep migrations idempotent and safe for partially migrated databases.
- Update this file when adding durable schema concepts future agents must know.
</schema_change_rules>

<report_template_contract>
- Report variables are exposed by `backend/src/lib/report-generator.js`.
- HTML fields intended for DOCX templates should be rendered with `| convertHTML`.
- Finding references can be rendered as `{@finding.references_links}` when hyperlink paragraphs are needed.
- CVSS 3.1 lives under `finding.cvss`; CVSS 4.0 lives under `finding.cvss4`.
- Retest-aware reports can use `audit.is_retest`, `finding.retest_evidence`, and `finding.retest_passed`.
- Executive-summary reports can use `audit.overall_risk`, `audit.executive_summary`, and severity summary variables.
</report_template_contract>
</domain_contracts>

<ai_system>
<settings_shape>
- Public browser-safe AI config lives under `settings.ai.public` and `settings.ai.visionPublic`.
- Private provider secrets, URLs, Azure settings, and prompts live under `settings.ai.private`.
- `Settings.getPublic()` must never expose `settings.ai.private` or `settings.mcp.apiKey`.
</settings_shape>

<generation_flow>
Browser editor toolbar
-> `frontend/src/components/ai-assistant.js`
-> `frontend/src/services/ai.js`
-> `POST /api/ai/generate`
-> `backend/src/routes/ai.js`
-> optional RAG via `embedding-service.js`
-> `ai-service.js`
-> provider chat completion
-> `{ html }`
-> editor review/apply flow.
</generation_flow>

<prompt_resolution>
For editor actions in `ai-service.js`, resolve system prompts in this order:
1. `ai.private.field_{fieldName}_{action}SystemPrompt`
2. `ai.private.{action}SystemPrompt`
3. hardcoded default for the action
</prompt_resolution>

<provider_contract>
- `openai`: OpenAI chat completions.
- `anthropic`: OpenAI-compatible chat-completions path against the configured Anthropic base URL.
- `ollama`: OpenAI-compatible chat-completions path against Ollama.
- `azure-openai`: AzureChatOpenAI with Azure endpoint/deployment settings.
- `openai-compatible`: custom base URL; `ensureV1(url)` appends `/v1` when missing.
- For OpenWebUI, use `openai-compatible` with base URL such as `http://openwebui:3000` and the exact model id shown by OpenWebUI.
- Frontend model fields for `openai-compatible` must remain free-text inputs because compatible endpoints can expose arbitrary model IDs.
</provider_contract>
</ai_system>

<mcp_system>
- Endpoint: `POST /api/mcp`.
- Transport: Streamable HTTP JSON-RPC 2.0.
- Auth: `X-API-Key` checked by `backend/src/lib/mcp-auth.js` against `settings.mcp.apiKey`; also requires `settings.mcp.enabled`.
- Tool handlers call existing REST endpoints through internal HTTPS using a short-lived admin JWT.
- Current tool surface includes audit listing/detail/update, audit network, finding CRUD, vulnerability listing/search, and applying vulnerabilities to findings.
- MCP API keys must never be exposed by public settings.
</mcp_system>

<frontend_rules>
- Use Quasar/Vue patterns already present in the touched page.
- Do not add user-facing strings without all five locale entries.
- Do not use `api` directly in pages; add or extend a service wrapper.
- For settings saves, refresh public settings with `this.$settings.refresh()`.
- Preserve loading, disabled, error, cancellation, and navigation guard behavior on AI or long-running actions.
- Before considering frontend work complete, validate that touched components feel homogeneous with neighboring UI, have spacing and positioning that still work on smaller form factors, and keep clear readable contrast in both light mode and dark mode.
- For visual-only work, keep it on `new-ui` if branching is requested and avoid backend/API changes.
</frontend_rules>

<backend_rules>
- Keep route handlers thin; put DB logic in model statics or domain libraries.
- Keep authorization explicit per route.
- Emit `io.to(auditId).emit('updateAudit')` after audit/finding mutations.
- Keep AI side effects such as Chroma indexing fire-and-forget unless the route contract explicitly requires synchronous completion.
- Use structured parsers/helpers when available instead of ad hoc string manipulation.
- Preserve existing response shapes and status-code conventions.
</backend_rules>

<dependency_and_upgrade_rules>
- For dependency upgrades, use the `update-dependencies` branch if branching is requested.
- Verify package-lock changes belong to the touched package.
- After upgrades, run focused tests plus relevant audit/build commands where feasible.
- Do not add broad overrides or new packages unless they solve a concrete issue.
</dependency_and_upgrade_rules>

<security_rules>
- Never expose server-only secrets through `GET /api/settings/public`.
- Treat API keys, JWT secrets, refresh tokens, and MCP keys as sensitive.
- Preserve permission checks when moving or reusing route logic.
- Validate uploads, IDs, filenames, and user-controlled HTML consistently with existing helpers.
- For AI output inserted into editors, preserve sanitization/review patterns.
</security_rules>

<final_response_contract>
- Summarize changed files and behavior briefly.
- Include verification commands/results and container-log checks.
- Mention any blocked verification or residual risk.
- For manual frontend testing, provide the URL and exact steps.
- Do not dump long logs unless the user explicitly asks.
</final_response_contract>

<todo>
- Vulnerability taxonomy Phase 3 (cleanup, after Phase 2 has been used in real audits): drop legacy `vulnerability.category` and `details[i].vulnType`, drop `audit.findings[i].vulnType`/`category`, replace finding-edit form selectors with a hierarchical taxonomy picker, retire `vulnerability-type.js`/`vulnerability-category.js` models and their data routes, update report-generator to read from `taxonomies[]` directly.
- Auto-translate vulnerabilities: verify current wiring before work; service exists in `translate-service.js`, but settings schema/UI and route-level create/update integration may still need completion.
</todo>

@RTK.md
