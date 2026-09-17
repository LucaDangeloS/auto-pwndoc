# REST API

AutoPwnDoc exposes interactive Swagger documentation at `/api-docs`. Its URL is also displayed in **Settings → API**, where administrators can open or copy it.

The machine-readable Swagger 2.0 document is available at `/api-docs/swagger.json`. It is generated from the registered backend routes with:

```bash
cd backend
npm run swagger-autogen
```

## Authentication

Every new REST API key is owned by the signed-in user who created it, and the owner is displayed beside the key in Settings. Requests use that user's current role and additional permissions. Legacy keys without an owner are rejected; revoke and recreate an unassigned key before using it again.

MCP keys follow the same rule: rotating the MCP key assigns it to the signed-in user, and MCP tools then execute with that user's identity and permissions.

An administrator viewing an unassigned legacy REST or MCP key in Settings can use **Assign to me** to preserve the existing secret while binding it to their user. Claiming a legacy REST key also repairs audits previously created with that key's internal record ID as their invalid owner. This recovery is only available while the key is unassigned; owned keys cannot be transferred by this action.

Use a signed-in browser session or create an API key in **Settings → API** and send it in the `X-API-Key` request header. `Authorization: Bearer <key>` is also accepted. New keys act as the user who created them, so audits created through a key remain editable by that user. Store keys securely and revoke them when they are no longer needed.

## Repairing an orphaned audit

An administrator with `audits:update-all` can assign a valid enabled user as the owner of an existing audit:

```http
PUT /api/audits/{auditId}/owner
Content-Type: application/json

{"username":"luca"}
```

`userId` can be supplied instead of `username`. New audit creation refuses to save an audit unless its authenticated owner is a valid enabled user.

## Taxonomy-aware finding updates

Use `GET /api/data/vulnerability-taxonomy/hierarchy` before creating or updating a finding taxonomy. It returns the approved type → category → subcategory → code hierarchy in its configured order. Finding `taxonomies` values must match an existing path exactly; the API rejects invented values. API keys can read the hierarchy and assign approved paths, but cannot modify taxonomy definitions.

## Response format

Most JSON endpoints use this envelope:

```json
{
  "status": "success",
  "datas": {}
}
```

Errors use `status: "error"` and include the message in `datas`. Download endpoints return their file directly. The MCP endpoint is a separate JSON-RPC service at `/api/mcp`; its connection details are documented in **Settings → MCP**. MCP clients should call `list_taxonomies` before setting finding taxonomies.
