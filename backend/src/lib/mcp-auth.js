'use strict';

var Settings = require('mongoose').model('Settings');
var User = require('mongoose').model('User');
var auth = require('./auth');

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

        if (!mcp.creator) {
            return res.status(401).json({ jsonrpc: '2.0', error: { code: -32003, message: 'MCP API key has no owner. Rotate it from Settings.' }, id: requestId(req) });
        }

        var owner = await User.findById(mcp.creator).select('username firstname lastname email phone role permissions enabled');
        if (!owner || owner.enabled === false) {
            return res.status(401).json({ jsonrpc: '2.0', error: { code: -32004, message: 'MCP API key owner is unavailable' }, id: requestId(req) });
        }

        var baseRoles = auth.acl.getRoles(owner.role);
        req.mcpActor = {
            id: owner._id.toString(),
            username: owner.username,
            firstname: owner.firstname,
            lastname: owner.lastname,
            email: owner.email,
            phone: owner.phone,
            role: owner.role,
            roles: baseRoles === '*' ? '*' : [...new Set([...baseRoles, ...(owner.permissions || [])])]
        };

        next();
    }
    catch (err) {
        return res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message || 'MCP authentication failed' }, id: requestId(req) });
    }
};
