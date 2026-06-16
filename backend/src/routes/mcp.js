'use strict';

module.exports = function(app) {
    var https = require('https');
    var jwt = require('jsonwebtoken');
    var config = require('../config/config.json')[process.env.NODE_ENV || 'dev'];
    var auth = require('../lib/auth');
    var mcpAuth = require('../lib/mcp-auth');
    var CVSS31 = require('../lib/cvsscalc31');
    var CVSS40 = require('../lib/cvsscalc40');

    var SERVER_INFO = {
        name: 'autopwndoc-mcp',
        version: '1.0.0'
    };

    var PROTOCOL_VERSION = '2025-03-26';

    var FINDING_FIELDS_DOC = `\
Finding fields (all optional except title on create):
  title                 (string, plain text) Vulnerability title.
  description           (string, HTML) What the vulnerability is and how it was identified.
  poc                   (string, HTML) Proof of concept — reproduction steps, tool output, payloads, screenshots. This is the primary evidence field; always populate it when documenting a finding.
  observation           (string, HTML) Additional analyst notes or context. Leave blank unless the user explicitly asks for it.
  remediation           (string, HTML) Recommended fix or mitigation.
  references            (array of strings) URLs or identifiers such as CVEs, CWEs, or security advisories.
  cvssv3                (string) CVSS 3.1 vector, e.g. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H".
  cvssv4                (string) CVSS 4.0 vector, e.g. "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N".
  priority              (integer 1-4) Remediation priority: 1=Low 2=Medium 3=High 4=Urgent.
  remediationComplexity (integer 1-3) Fix effort: 1=Low 2=Medium 3=High.
  status                (integer) 0=Done/reviewed 1=Redacting/in-progress (default).
  taxonomies            (array of {type, category, subcategory}) Vulnerability classification.

HTML FORMAT — CRITICAL: description, poc, observation, and remediation are rendered as HTML in the final report. Always write them as valid HTML, never as Markdown. Use <p> for paragraphs, <strong>/<em> for emphasis, <pre><code> for code blocks, <ul>/<ol>/<li> for lists, <a href="..."> for links. Example: "<p>The endpoint does not validate input.</p><pre><code>GET /api?id=1 OR 1=1</code></pre>"

STYLE (default, advisory): unless the user asks for something different, match how findings are normally written in these reports — formal, impersonal, evidence-grounded prose. Do not invent assets, endpoints, versions, CVEs, credentials, payloads, responses, exploitation results, or CVSS values; use conditional language for unconfirmed consequences. Per field: description ~90-140 words, normally two paragraphs, no proof steps or remediation; observation ~45-90 words of target-specific observed facts only (blank if none); poc a concise reproducible sequence (entry point, action, observable result) with literal values in <code>; remediation a short recommendation paragraph then 3-5 ordered <li> items (definitive fix -> hardening/least privilege -> compensating controls -> validation); retest evidence states what was retested and whether the weakness remains, never inferring pass/fail without explicit retest facts. See the server instructions for the full guide.`;

    var REPORT_STYLE_GUIDE = `\
This server edits penetration-test audits. When you create or change finding content, match the style the rest of the report is written in, unless the user explicitly asks for something different — then follow the user.

General conventions:
- Write finding text (description, poc, observation, remediation, retestEvidence) as HTML, never Markdown.
- Use formal, impersonal, technically precise language; executive/severity prose may be slightly more management-facing.
- Ground every statement in evidence actually present in the audit or finding. Do not invent affected assets, endpoints, software versions, CVEs, credentials, payloads, observed responses, exploitation results, severities, or CVSS values. Use conditional language for consequences that are not explicitly confirmed.
- Prefer existing library wording: search_similar_vulnerabilities / apply_vulnerability_to_finding before writing a finding from scratch.

Per-field house style:
- description: ~90-140 words, normally two short paragraphs (lists only when they materially help). Cover the vulnerable condition, why it is insecure, a realistic attack scenario, and the principal potential impact. No reproduction steps or remediation.
- observation: ~45-90 words recording only target-specific conditions actually observed. No generic theory, reproduction steps, or remediation. Leave blank if there is no evidence for it.
- poc: a concise, reproducible sequence — the tested entry point or service, the action performed, and the observable result. Keep literal commands, requests, and values inside <code>. Evidence only.
- remediation: one short recommendation paragraph, then 3-5 actionable <li> items ordered from the definitive fix to secure configuration/least privilege, compensating controls, and validation. Recommend a currently supported vendor-fixed release without inventing a version number. Do not restate the description or impact.
- retestEvidence: state what was retested, the observed result, and whether the original weakness remains reproducible, distinguishing a full correction from a partial mitigation. Never infer pass/fail without explicit retest evidence.

These are defaults to keep new and edited content consistent with the existing report. Explicit user instructions always take precedence.`;

    function firstTaxonomy(row) {
        return (row && Array.isArray(row.taxonomies) && row.taxonomies[0]) || {};
    }

    function findingSeverity(finding) {
        try {
            if (finding.cvssv4) {
                var r4 = CVSS40.calculateCVSSFromVector(finding.cvssv4);
                if (r4 && r4.success) return { cvssScore: parseFloat(r4.baseMetricScore), severity: r4.baseSeverity };
            }
        } catch (_) {}
        try {
            if (finding.cvssv3) {
                var r3 = CVSS31.calculateCVSSFromVector(finding.cvssv3);
                if (r3 && r3.success) return { cvssScore: parseFloat(r3.baseMetricScore), severity: r3.baseSeverity };
            }
        } catch (_) {}
        return { cvssScore: null, severity: 'N/A' };
    }

    var tools = [
        {
            name: 'list_audits',
            description: 'List audits visible to the MCP service account. Optionally filter by finding title. Returns id, name, date, client, language, template, type, state, creator, and collaborators for each audit.',
            inputSchema: {
                type: 'object',
                properties: { findingTitle: { type: 'string', description: 'Return only audits that contain a finding whose title matches this substring.' } }
            }
        },
        {
            name: 'get_audit',
            description: 'Get the full audit document including metadata and all findings. Each finding in the response includes a computed cvssScore (number) and severity (Critical/High/Medium/Low/None/N/A) alongside its raw CVSS vectors, so you can scan findings by title and severity without extra calls. Text fields (description, poc, etc.) are present but can be large — use get_all_findings or get_finding when you need to work with finding content.',
            inputSchema: {
                type: 'object',
                required: ['auditId'],
                properties: { auditId: { type: 'string' } }
            }
        },
        {
            name: 'update_audit_general',
            description: 'Update audit general fields such as name, dates, client, collaborators, scope names, retest status, and executive summary.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'fields'],
                properties: { auditId: { type: 'string' }, fields: { type: 'object' } }
            }
        },
        {
            name: 'get_audit_network',
            description: 'Get the audit network/scope structure.',
            inputSchema: {
                type: 'object',
                required: ['auditId'],
                properties: { auditId: { type: 'string' } }
            }
        },
        {
            name: 'update_audit_network',
            description: 'Update the audit network/scope structure.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'scope'],
                properties: { auditId: { type: 'string' }, scope: { type: 'array', items: { type: 'object' } } }
            }
        },
        {
            name: 'list_findings',
            description: 'List all findings in an audit with a concise summary per finding: id, title, severity label, CVSS score, CVSS vectors, status, priority, remediationComplexity, and taxonomies. Text content fields (description, poc, observation, remediation) are intentionally omitted. Call get_finding for a single finding\'s full content, or get_all_findings to retrieve every finding\'s complete fields at once.',
            inputSchema: {
                type: 'object',
                required: ['auditId'],
                properties: { auditId: { type: 'string' } }
            }
        },
        {
            name: 'get_finding',
            description: 'Get one finding with all its fields, including the HTML-formatted text fields (description, poc, observation, remediation), references, CVSS vectors, taxonomy, status, and custom fields. The poc field holds proof-of-concept evidence and reproduction steps. Call this before updating a finding to inspect its current state.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'findingId'],
                properties: { auditId: { type: 'string' }, findingId: { type: 'string' } }
            }
        },
        {
            name: 'get_all_findings',
            description: 'Get every finding in an audit with complete field detail — same shape as get_finding, for all findings at once. Use this instead of calling get_finding in a loop. Ideal for bulk review, generating summaries, or deciding what to update across multiple findings.',
            inputSchema: {
                type: 'object',
                required: ['auditId'],
                properties: { auditId: { type: 'string' } }
            }
        },
        {
            name: 'create_finding',
            description: `Create a new finding (vulnerability) in an audit. The fields object must include title.\n\n${FINDING_FIELDS_DOC}`,
            inputSchema: {
                type: 'object',
                required: ['auditId', 'fields'],
                properties: { auditId: { type: 'string' }, fields: { type: 'object', description: 'Finding fields. Must include title. See tool description for all available fields and the HTML format requirement.' } }
            }
        },
        {
            name: 'update_finding',
            description: `Update any editable field of a finding. Only the fields provided are changed; omitted fields are left as-is. Call get_finding first to see the current state.\n\n${FINDING_FIELDS_DOC}`,
            inputSchema: {
                type: 'object',
                required: ['auditId', 'findingId', 'fields'],
                properties: { auditId: { type: 'string' }, findingId: { type: 'string' }, fields: { type: 'object', description: 'Fields to update. See tool description for all available fields and the HTML format requirement.' } }
            }
        },
        {
            name: 'delete_finding',
            description: 'Permanently delete a finding from an audit.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'findingId'],
                properties: { auditId: { type: 'string' }, findingId: { type: 'string' } }
            }
        },
        {
            name: 'list_vulnerabilities',
            description: 'List known vulnerabilities from the vulnerability database. Provide locale (e.g. "en-US") for locale-specific flattened details including title, description, and remediation. Optional query filters by title or text substring.',
            inputSchema: {
                type: 'object',
                properties: { locale: { type: 'string' }, query: { type: 'string' } }
            }
        },
        {
            name: 'search_similar_vulnerabilities',
            description: 'Semantic search over the vulnerability database using the embedding index (requires an embedding model configured in Settings). Returns matching vulnerabilities with similarity scores. Use this to find relevant library entries before creating or populating a finding.',
            inputSchema: {
                type: 'object',
                required: ['query'],
                properties: { query: { type: 'string', description: 'Natural language description of the vulnerability to search for.' }, locale: { type: 'string' } }
            }
        },
        {
            name: 'apply_vulnerability_to_finding',
            description: 'Overwrite a finding\'s fields (title, description, poc, observation, remediation, references, taxonomies, CVSS) with data from a known vulnerability in the library, in the specified locale. Use search_similar_vulnerabilities or list_vulnerabilities to find the vulnerability id first.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'findingId', 'vulnerabilityId'],
                properties: { auditId: { type: 'string' }, findingId: { type: 'string' }, vulnerabilityId: { type: 'string' }, locale: { type: 'string', description: 'Locale to use, e.g. "en-US". Defaults to the first available locale.' } }
            }
        }
    ];

    function response(id, result) {
        return { jsonrpc: '2.0', id: id === undefined ? null : id, result };
    }

    function errorResponse(id, code, message, data) {
        var error = { code, message };
        if (data !== undefined) error.data = data;
        return { jsonrpc: '2.0', id: id === undefined ? null : id, error };
    }

    function contentResult(data) {
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    function makeServiceCookie() {
        var token = jwt.sign({
            id: '000000000000000000000000',
            username: 'mcp-service',
            role: 'admin',
            roles: '*'
        }, auth.jwtSecret, { expiresIn: '5m' });
        return 'token=JWT ' + token;
    }

    function internalRequest(method, path, body) {
        return new Promise((resolve, reject) => {
            var payload = body === undefined ? null : JSON.stringify(body);
            var req = https.request({
                hostname: config.host || '127.0.0.1',
                port: config.port,
                path,
                method,
                rejectUnauthorized: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Cookie': makeServiceCookie()
                }
            }, (res) => {
                var chunks = '';
                res.on('data', chunk => { chunks += chunk; });
                res.on('end', () => {
                    var parsed = chunks;
                    try { parsed = chunks ? JSON.parse(chunks) : null; } catch (_) {}

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed && parsed.datas !== undefined ? parsed.datas : parsed);
                    }
                    else {
                        reject({ statusCode: res.statusCode, body: parsed });
                    }
                });
            });

            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        });
    }

    function encodeQuery(params) {
        var search = new URLSearchParams();
        Object.keys(params || {}).forEach(key => {
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') search.append(key, params[key]);
        });
        var text = search.toString();
        return text ? '?' + text : '';
    }

    function filterVulnerabilities(rows, query) {
        if (!query) return rows;
        var needle = query.toLowerCase();
        return (rows || []).filter(row => JSON.stringify(row).toLowerCase().includes(needle));
    }

    async function callTool(name, args) {
        args = args || {};

        if (name === 'list_audits') {
            return internalRequest('GET', '/api/audits' + encodeQuery({ findingTitle: args.findingTitle }));
        }
        if (name === 'get_audit') {
            var audit = await internalRequest('GET', '/api/audits/' + encodeURIComponent(args.auditId));
            if (audit && Array.isArray(audit.findings)) {
                audit.findings = audit.findings.map(f => Object.assign({}, f, findingSeverity(f)));
            }
            return audit;
        }
        if (name === 'update_audit_general') {
            return internalRequest('PUT', '/api/audits/' + encodeURIComponent(args.auditId) + '/general', args.fields || {});
        }
        if (name === 'get_audit_network') {
            return internalRequest('GET', '/api/audits/' + encodeURIComponent(args.auditId) + '/network');
        }
        if (name === 'update_audit_network') {
            return internalRequest('PUT', '/api/audits/' + encodeURIComponent(args.auditId) + '/network', { scope: args.scope || [] });
        }
        if (name === 'list_findings') {
            var audit = await internalRequest('GET', '/api/audits/' + encodeURIComponent(args.auditId));
            return (audit.findings || []).map(finding => {
                var taxonomy = firstTaxonomy(finding);
                var sev = findingSeverity(finding);
                return {
                    _id: finding._id,
                    identifier: finding.identifier,
                    title: finding.title,
                    severity: sev.severity,
                    cvssScore: sev.cvssScore,
                    cvssv3: finding.cvssv3,
                    cvssv4: finding.cvssv4,
                    taxonomies: finding.taxonomies || [],
                    category: taxonomy.type || '',
                    vulnType: taxonomy.category || '',
                    priority: finding.priority,
                    remediationComplexity: finding.remediationComplexity,
                    status: finding.status,
                    retestPassed: finding.retestPassed
                };
            });
        }
        if (name === 'get_all_findings') {
            var audit = await internalRequest('GET', '/api/audits/' + encodeURIComponent(args.auditId));
            return (audit.findings || []).map(f => Object.assign({}, f, findingSeverity(f)));
        }
        if (name === 'get_finding') {
            return internalRequest('GET', '/api/audits/' + encodeURIComponent(args.auditId) + '/findings/' + encodeURIComponent(args.findingId));
        }
        if (name === 'create_finding') {
            return internalRequest('POST', '/api/audits/' + encodeURIComponent(args.auditId) + '/findings', args.fields || {});
        }
        if (name === 'update_finding') {
            return internalRequest('PUT', '/api/audits/' + encodeURIComponent(args.auditId) + '/findings/' + encodeURIComponent(args.findingId), args.fields || {});
        }
        if (name === 'delete_finding') {
            return internalRequest('DELETE', '/api/audits/' + encodeURIComponent(args.auditId) + '/findings/' + encodeURIComponent(args.findingId));
        }
        if (name === 'list_vulnerabilities') {
            var path = args.locale ? '/api/vulnerabilities/' + encodeURIComponent(args.locale) : '/api/vulnerabilities';
            return filterVulnerabilities(await internalRequest('GET', path), args.query);
        }
        if (name === 'search_similar_vulnerabilities') {
            return internalRequest('POST', '/api/ai/search-similar', { query: args.query, locale: args.locale });
        }
        if (name === 'apply_vulnerability_to_finding') {
            var vulnerabilities = await internalRequest('GET', '/api/vulnerabilities');
            var vulnerability = (vulnerabilities || []).find(v => String(v._id) === String(args.vulnerabilityId));
            if (!vulnerability) throw new Error('Vulnerability not found');

            var locale = args.locale || 'en-GB';
            var detail = (vulnerability.details || []).find(d => d.locale === locale) || (vulnerability.details || []).find(d => d.title);
            if (!detail) throw new Error('Vulnerability detail not found');
            var taxonomy = firstTaxonomy(vulnerability);

            var fields = {
                title: detail.title,
                taxonomies: vulnerability.taxonomies || [],
                vulnType: taxonomy.category || '',
                description: detail.description,
                observation: detail.observation,
                remediation: detail.remediation,
                references: detail.references || [],
                customFields: detail.customFields || [],
                cvssv3: vulnerability.cvssv3,
                cvssv4: vulnerability.cvssv4,
                priority: vulnerability.priority,
                remediationComplexity: vulnerability.remediationComplexity,
                category: taxonomy.type || ''
            };
            return internalRequest('PUT', '/api/audits/' + encodeURIComponent(args.auditId) + '/findings/' + encodeURIComponent(args.findingId), fields);
        }

        throw new Error('Unknown tool: ' + name);
    }

    async function handleMessage(message) {
        if (!message || message.jsonrpc !== '2.0') return errorResponse(message && message.id, -32600, 'Invalid Request');
        if (!message.method) return errorResponse(message.id, -32600, 'Missing method');
        if (message.id === undefined) return null;

        try {
            if (message.method === 'initialize') {
                return response(message.id, {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: SERVER_INFO,
                    instructions: REPORT_STYLE_GUIDE
                });
            }
            if (message.method === 'ping') {
                return response(message.id, {});
            }
            if (message.method === 'tools/list') {
                return response(message.id, { tools });
            }
            if (message.method === 'tools/call') {
                var params = message.params || {};
                if (!params.name) return errorResponse(message.id, -32602, 'Missing tool name');
                var result = await callTool(params.name, params.arguments || {});
                return response(message.id, contentResult(result));
            }

            return errorResponse(message.id, -32601, 'Method not found');
        }
        catch (err) {
            return response(message.id, { content: [{ type: 'text', text: err.message || 'Tool execution failed' }], isError: true });
        }
    }

    app.post('/api/mcp', mcpAuth, async function(req, res) {
        try {
            var body = req.body;
            if (Array.isArray(body)) {
                var results = (await Promise.all(body.map(handleMessage))).filter(Boolean);
                if (results.length === 0) return res.status(202).end();
                return res.json(results);
            }

            var result = await handleMessage(body);
            if (!result) return res.status(202).end();
            return res.json(result);
        }
        catch (err) {
            return res.status(500).json(errorResponse(null, -32603, err.message || 'Internal error'));
        }
    });
};
