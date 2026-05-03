'use strict';

module.exports = function(app) {
    var https = require('https');
    var jwt = require('jsonwebtoken');
    var config = require('../config/config.json')[process.env.NODE_ENV || 'dev'];
    var auth = require('../lib/auth');
    var mcpAuth = require('../lib/mcp-auth');

    var SERVER_INFO = {
        name: 'autopwndoc-mcp',
        version: '1.0.0'
    };

    var PROTOCOL_VERSION = '2025-03-26';

    var tools = [
        {
            name: 'list_audits',
            description: 'List audits visible to the MCP service account. Optionally filter by finding title.',
            inputSchema: {
                type: 'object',
                properties: { findingTitle: { type: 'string' } }
            }
        },
        {
            name: 'get_audit',
            description: 'Get the full audit document, including populated metadata and findings.',
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
            description: 'List findings inside an audit.',
            inputSchema: {
                type: 'object',
                required: ['auditId'],
                properties: { auditId: { type: 'string' } }
            }
        },
        {
            name: 'get_finding',
            description: 'Get one finding from an audit.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'findingId'],
                properties: { auditId: { type: 'string' }, findingId: { type: 'string' } }
            }
        },
        {
            name: 'create_finding',
            description: 'Create a finding in an audit. The fields object must include title.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'fields'],
                properties: { auditId: { type: 'string' }, fields: { type: 'object' } }
            }
        },
        {
            name: 'update_finding',
            description: 'Update any editable field of a finding.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'findingId', 'fields'],
                properties: { auditId: { type: 'string' }, findingId: { type: 'string' }, fields: { type: 'object' } }
            }
        },
        {
            name: 'delete_finding',
            description: 'Delete a finding from an audit.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'findingId'],
                properties: { auditId: { type: 'string' }, findingId: { type: 'string' } }
            }
        },
        {
            name: 'list_vulnerabilities',
            description: 'List known vulnerabilities. Provide locale for flattened locale-specific results. Optional query filters titles and text.',
            inputSchema: {
                type: 'object',
                properties: { locale: { type: 'string' }, query: { type: 'string' } }
            }
        },
        {
            name: 'search_similar_vulnerabilities',
            description: 'Search the known vulnerability database semantically using the embedding index.',
            inputSchema: {
                type: 'object',
                required: ['query'],
                properties: { query: { type: 'string' }, locale: { type: 'string' } }
            }
        },
        {
            name: 'apply_vulnerability_to_finding',
            description: 'Overwrite a finding with fields from a known vulnerability detail in the selected locale.',
            inputSchema: {
                type: 'object',
                required: ['auditId', 'findingId', 'vulnerabilityId'],
                properties: { auditId: { type: 'string' }, findingId: { type: 'string' }, vulnerabilityId: { type: 'string' }, locale: { type: 'string' } }
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
            return internalRequest('GET', '/api/audits/' + encodeURIComponent(args.auditId));
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
            return (audit.findings || []).map(finding => ({
                _id: finding._id,
                id: finding.id,
                identifier: finding.identifier,
                title: finding.title,
                vulnType: finding.vulnType,
                category: finding.category,
                priority: finding.priority,
                remediationComplexity: finding.remediationComplexity,
                cvssv3: finding.cvssv3,
                cvssv4: finding.cvssv4,
                status: finding.status,
                retestPassed: finding.retestPassed
            }));
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

            var fields = {
                title: detail.title,
                vulnType: detail.vulnType,
                description: detail.description,
                observation: detail.observation,
                remediation: detail.remediation,
                references: detail.references || [],
                customFields: detail.customFields || [],
                cvssv3: vulnerability.cvssv3,
                cvssv4: vulnerability.cvssv4,
                priority: vulnerability.priority,
                remediationComplexity: vulnerability.remediationComplexity,
                category: vulnerability.category
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
                    serverInfo: SERVER_INFO
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
