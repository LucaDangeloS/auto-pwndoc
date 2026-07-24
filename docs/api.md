# REST API

AutoPwnDoc exposes interactive Swagger documentation at `/api-docs`. Its URL is also displayed in **Settings → API**, where administrators can open or copy it.

The machine-readable Swagger 2.0 document is available at `/api-docs/swagger.json`. It is generated from the registered backend routes with:

```bash
cd backend
npm run swagger-autogen
```

## Authentication

Use a signed-in browser session or create an API key in **Settings → API** and send it in the `X-API-Key` request header. `Authorization: Bearer <key>` is also accepted. API keys act with administrator permissions; store them securely and revoke them when they are no longer needed.

## Response format

Most JSON endpoints use this envelope:

```json
{
  "status": "success",
  "datas": {}
}
```

Errors use `status: "error"` and include the message in `datas`. Download endpoints return their file directly. The MCP endpoint is a separate JSON-RPC service at `/api/mcp`; its connection details are documented in **Settings → MCP**.
