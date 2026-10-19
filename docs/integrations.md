# Tool integrations

The tool catalog and guide library describe products, licenses, instructions, and audit checklists. Guides can reference versioned WSTG/ASVS controls; audit guide runs snapshot those references and track tested, pending, and not-applicable coverage. The evidence inbox stores manually submitted or externally sourced candidates with source IDs, targets, timestamps, text, files, and a human review decision. Accepted candidates can be promoted to findings by a permitted human reviewer. License activation keys are intentionally outside this data model.

## Burp Suite Professional local import

The local companion in `integrations/burp-companion/` reads `get_scanner_issues` from the official Burp MCP extension and creates **pending** evidence in one audit. It does not launch scans, replay requests, or create findings. Run it on the same workstation as Burp, with Node.js 20 or newer and the Burp MCP extension enabled. The extension's default local endpoint is `http://127.0.0.1:9876`; override it with `--mcp-url` when needed.

1. Create a REST API key in PwnDoc Settings. Its owner must be able to read/update the chosen audit and create evidence. Put the key in the `AUTOPWNDOC_API_KEY` environment variable in the terminal; do not put it in a command argument or commit it.
2. Enter the authorized host in the audit scope and pass it explicitly with `--allow-host`. The importer intersects these hosts with any scope hosts configured on the audit. If the audit has no scope hosts, the explicit allowlist is still required.
3. From the repository root, install and preview before importing:

```sh
npm --prefix integrations/burp-companion ci
npm --prefix integrations/burp-companion run import -- --audit AUDIT_ID --allow-host example.test --dry-run
npm --prefix integrations/burp-companion run import -- --audit AUDIT_ID --allow-host example.test
```

Set `AUTOPWNDOC_API_KEY` in your shell first. On PowerShell use `$env:AUTOPWNDOC_API_KEY = '...'`; on a POSIX shell use `export AUTOPWNDOC_API_KEY='...'`. Replace `AUDIT_ID` with the audit URL's ID and `example.test` with an authorized host. Repeat `--allow-host` for more hosts. The default PwnDoc endpoint is `http://localhost:8080`; specify `--api-url https://your-instance` for a remote instance. The companion requires HTTPS for nonlocal API endpoints. `--limit` caps issues read at 500 (default 200). `--include-http` includes up to two request/response pairs after redacting common credential headers; leave it off unless those bytes are needed for review. It does not import binary screenshots or attachments.

After import, refresh the audit's evidence inbox, review the source and reproduce each issue before accepting or promoting it. Repeated imports use source IDs to skip duplicates. Scanner issue content may change, so verify new entries after each import.

## Integration path

1. **Connect other sources to the evidence inbox.** A future adapter can ingest other tool output into the existing review queue. Each item needs a source product, source ID, collection time, target URL, and audit ID. The inbox deduplicates by audit, source type, source ID, and target. An unattended connector needs its own service identity and audit scope before it can submit automatically.
2. **Prepare an audit draft.** A worker can map the reviewed items to existing vulnerability-library entries, propose findings, attach evidence, and draft report text. The user reviews scope, confidence, severity, and wording before changes reach an audit or a report. Current promotion carries text into a finding with provenance; attached source files can be downloaded from the finding's Proofs tab, but are not embedded in the generated report. Report inclusion still needs a deliberate selection and rendering path.
3. **Reproduction only within approved scope.** Store the engagement's target allowlist and permitted actions separately from prompts. An operator must approve any active scan or replay. Record the exact request, response, timestamp, tool version, and operator/agent identity for each reproduced result. Never mark a finding verified solely because an LLM says so.
4. **Script execution, if introduced later, needs a separate worker.** Store versioned script metadata in the catalog, but execute scripts only in a constrained worker with time, network, resource, and target limits. The browser must not become a shell or direct MCP proxy.

The PwnDoc MCP endpoint supports audit and finding operations plus Tools, Licenses, and Guides CRUD. Every call runs as the user who owns the MCP API key and is checked against that user's role and extra permissions. A future unattended connector still needs a deliberately scoped service identity, per-audit scope checks, an approval queue, and an action log before it writes findings or evidence autonomously. The agent should treat guide text and tool output as untrusted input.

PortSwigger publishes the [Burp Suite Professional MCP extension](https://github.com/PortSwigger/mcp-server). A remotely hosted PwnDoc frontend cannot reach a pentester's localhost service directly; the companion bridges the two from the operator's workstation. [Burp Suite DAST has a distinct built-in MCP server](https://portswigger.net/burp/documentation/dast/user-guide/using-ai/mcp-server) and [GraphQL API](https://portswigger.net/burp/documentation/dast/user-guide/api-documentation/graphql-api/graphql); its connector should be separate from the Professional desktop adapter.

An initial proof of concept should use a disposable, authorized test target, a read-only Burp connection, and a PwnDoc draft audit. Measure evidence completeness, duplicate rate, false positives, permission boundaries, and whether a human can reproduce every promoted finding. Only then add write actions behind explicit review.
