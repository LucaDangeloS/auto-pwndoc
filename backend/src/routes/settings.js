module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var acl = require('../lib/auth').acl;
    var Settings = require('mongoose').model('Settings');
    var crypto = require('crypto');

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

    app.get("/api/settings/export", acl.hasPermission("settings:read"), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.getAll()
        .then(settings => Response.SendFile(res, "app-settings.json", settings))
        .catch(err => Response.Internal(res, err))
    });
}
