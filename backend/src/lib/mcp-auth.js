'use strict';

var Settings = require('mongoose').model('Settings');

function requestId(req) {
    return req.body && req.body.id !== undefined ? req.body.id : null;
}

module.exports = async function(req, res, next) {
    try {
        var settings = await Settings.getAll();
        var mcp = settings && settings.mcp;

        if (!mcp || !mcp.enabled) {
            return res.status(403).json({ jsonrpc: '2.0', error: { code: -32000, message: 'MCP server is disabled' }, id: requestId(req) });
        }

        var apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Missing X-API-Key header' }, id: requestId(req) });
        }

        if (!mcp.apiKey || apiKey !== mcp.apiKey) {
            return res.status(401).json({ jsonrpc: '2.0', error: { code: -32002, message: 'Invalid API key' }, id: requestId(req) });
        }

        next();
    }
    catch (err) {
        return res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message || 'MCP authentication failed' }, id: requestId(req) });
    }
};
