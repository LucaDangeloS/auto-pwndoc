module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var acl = require('../lib/auth').acl;
    var Settings = require('mongoose').model('Settings');
    var crypto = require('crypto');
    var visionService = require('../lib/vision-service');

    function withRuntimeSettings(settings) {
        var result = settings && settings.toObject ? settings.toObject() : settings;
        if (!result) return result;
        result.mcp = result.mcp || {};
        result.mcp.appUrl = process.env.APP_URL || 'https://localhost:8443';
        return result;
    }
    
    app.get("/api/settings", acl.hasPermission('settings:read'), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.getAll()
        .then(settings => Response.Ok(res, withRuntimeSettings(settings)))
        .catch(err => Response.Internal(res, err));
    });

    app.get("/api/settings/public", acl.hasPermission('settings:read-public'), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.getPublic()
        .then(settings => Response.Ok(res, withRuntimeSettings(settings)))
        .catch(err => Response.Internal(res, err));
    });

    app.put("/api/settings", acl.hasPermission('settings:update'), function(req, res) {
        // #swagger.tags = ['Settings']

        var regexRules = req.body && req.body.ai && req.body.ai.private &&
            req.body.ai.private.visionAnonymizeRegexRules;
        if (regexRules !== undefined) {
            var regexErrors = visionService.validateRegexRules(regexRules);
            if (regexErrors.length > 0) {
                return Response.BadParameters(res, regexErrors.join('; '));
            }
        }

        Settings.update(req.body)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err));
    });

    app.put("/api/settings/revert", acl.hasPermission('settings:update'), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.restoreDefaults()
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err));
    });

    app.post("/api/settings/mcp/rotate-key", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']

        try {
            var apiKey = crypto.randomBytes(32).toString('hex');
            var apiKeyCreatedAt = new Date();
            await Settings.update({ $set: { 'mcp.apiKey': apiKey, 'mcp.apiKeyCreatedAt': apiKeyCreatedAt } });
            Response.Ok(res, { apiKey, apiKeyCreatedAt });
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    app.delete("/api/settings/mcp/key", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']

        try {
            await Settings.update({ $set: { 'mcp.apiKey': '', 'mcp.apiKeyCreatedAt': null } });
            Response.Ok(res, { apiKey: '', apiKeyCreatedAt: null });
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    app.get("/api/settings/api-keys", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']
        try {
            var settings = await Settings.getAll();
            var keys = (settings && settings.api && settings.api.keys) || [];
            var safe = keys.map(k => ({
                id: k._id,
                name: k.name,
                keyPrefix: k.key.substring(0, 8),
                createdAt: k.createdAt,
                lastUsedAt: k.lastUsedAt
            }));
            Response.Ok(res, safe);
        }
        catch (err) { Response.Internal(res, err); }
    });

    app.post("/api/settings/api-keys", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']
        try {
            var name = req.body && req.body.name;
            if (!name || !name.trim()) return Response.BadParameters(res, 'name is required');
            var key = crypto.randomBytes(32).toString('hex');
            var createdAt = new Date();
            var result = await Settings.findOneAndUpdate(
                {},
                { $push: { 'api.keys': { name: name.trim(), key, createdAt, lastUsedAt: null } } },
                { new: true, upsert: true }
            );
            var entry = result.api.keys[result.api.keys.length - 1];
            Response.Ok(res, { id: entry._id, name: entry.name, key, createdAt: entry.createdAt });
        }
        catch (err) { Response.Internal(res, err); }
    });

    app.delete("/api/settings/api-keys/:id", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']
        try {
            await Settings.findOneAndUpdate(
                {},
                { $pull: { 'api.keys': { _id: req.params.id } } }
            );
            Response.Ok(res, 'API key revoked');
        }
        catch (err) { Response.Internal(res, err); }
    });

    app.get("/api/settings/export", acl.hasPermission("settings:read"), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.getAll()
        .then(settings => Response.SendFile(res, "app-settings.json", settings))
        .catch(err => Response.Internal(res, err))
    });
}
