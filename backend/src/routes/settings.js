module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var acl = require('../lib/auth').acl;
    var Settings = require('mongoose').model('Settings');
    var User = require('mongoose').model('User');
    var Audit = require('mongoose').model('Audit');
    var crypto = require('crypto');
    var visionService = require('../lib/vision-service');

    function withRuntimeSettings(settings) {
        var result = settings && settings.toObject ? settings.toObject() : settings;
        if (!result) return result;
        result.mcp = result.mcp || {};
        result.mcp.appUrl = process.env.APP_URL || 'https://localhost:8443';
        return result;
    }

    function ownerSummary(user) {
        if (!user) return null;
        return {
            _id: user._id.toString(),
            username: user.username,
            firstname: user.firstname,
            lastname: user.lastname
        };
    }

    function unavailableOwnerSummary(id) {
        if (!id) return null;
        return {_id: id.toString(), unavailable: true};
    }

    async function populateKeyOwners(settings) {
        var result = withRuntimeSettings(settings);
        if (!result) return result;
        var ownerIds = [];
        if (result.mcp && result.mcp.creator) ownerIds.push(result.mcp.creator);
        var users = await User.find({ _id: { $in: ownerIds } }).select('username firstname lastname').lean();
        var byId = new Map(users.map(user => [user._id.toString(), ownerSummary(user)]));
        if (result.mcp) {
            result.mcp.creator = result.mcp.creator
                ? byId.get(result.mcp.creator.toString()) || unavailableOwnerSummary(result.mcp.creator)
                : null;
        }
        return result;
    }
    
    app.get("/api/settings", acl.hasPermission('settings:read'), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.getAll()
        .then(populateKeyOwners)
        .then(settings => Response.Ok(res, settings))
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

        Settings.getAll()
        .then(current => {
            if (req.body.mcp) {
                req.body.mcp.creator = current && current.mcp ? current.mcp.creator : null;
            }
            return Settings.update(req.body);
        })
        .then(msg => {
            require('../lib/languagetool-config').invalidateLanguageToolConfigCache();
            Response.Ok(res, msg);
        })
        .catch(err => Response.Internal(res, err));
    });

    app.put("/api/settings/revert", acl.hasPermission('settings:update'), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.restoreDefaults()
        .then(msg => {
            require('../lib/languagetool-config').invalidateLanguageToolConfigCache();
            Response.Ok(res, msg);
        })
        .catch(err => Response.Internal(res, err));
    });

    app.post("/api/settings/mcp/rotate-key", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']

        try {
            var apiKey = crypto.randomBytes(32).toString('hex');
            var apiKeyCreatedAt = new Date();
            var creator = req.decodedToken.id;
            await Settings.update({ $set: { 'mcp.apiKey': apiKey, 'mcp.apiKeyCreatedAt': apiKeyCreatedAt, 'mcp.creator': creator } });
            var owner = await User.findById(creator).select('username firstname lastname').lean();
            Response.Ok(res, { apiKey, apiKeyCreatedAt, creator: ownerSummary(owner) });
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    app.post("/api/settings/mcp/claim-key", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']

        try {
            var settings = await Settings.getAll();
            if (!settings.mcp || !settings.mcp.apiKey)
                return Response.BadParameters(res, 'No MCP API key exists');
            var creator = req.decodedToken.id;
            if (settings.mcp.creator && settings.mcp.creator.toString() !== creator)
                return Response.BadParameters(res, 'MCP API key already has an owner');
            if (!settings.mcp.creator) {
                var claimed = await Settings.findOneAndUpdate(
                    {'mcp.apiKey': settings.mcp.apiKey, 'mcp.creator': null},
                    {$set: {'mcp.creator': creator}}
                );
                if (!claimed)
                    return Response.BadParameters(res, 'MCP API key was already assigned');
            }
            var repaired = await Audit.updateMany(
                {creator: '000000000000000000000000'},
                {$set: {creator}}
            );
            var owner = await User.findById(creator).select('username firstname lastname').lean();
            Response.Ok(res, { creator: ownerSummary(owner), repairedAudits: repaired.modifiedCount || 0 });
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    app.delete("/api/settings/mcp/key", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']

        try {
            await Settings.update({ $set: { 'mcp.apiKey': '', 'mcp.apiKeyCreatedAt': null, 'mcp.creator': null } });
            Response.Ok(res, { apiKey: '', apiKeyCreatedAt: null, creator: null });
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
            var ownerIds = keys.map(key => key.creator).filter(Boolean);
            var owners = await User.find({ _id: { $in: ownerIds } }).select('username firstname lastname').lean();
            var ownersById = new Map(owners.map(owner => [owner._id.toString(), ownerSummary(owner)]));
            var safe = keys.map(k => ({
                id: k._id,
                name: k.name,
                creator: k.creator
                    ? ownersById.get(k.creator.toString()) || unavailableOwnerSummary(k.creator)
                    : null,
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
                { $push: { 'api.keys': { name: name.trim(), key, creator: req.decodedToken.id, createdAt, lastUsedAt: null } } },
                { new: true, upsert: true }
            );
            var entry = result.api.keys[result.api.keys.length - 1];
            var owner = await User.findById(entry.creator).select('username firstname lastname').lean();
            Response.Ok(res, { id: entry._id, name: entry.name, creator: ownerSummary(owner), key, createdAt: entry.createdAt });
        }
        catch (err) { Response.Internal(res, err); }
    });

    app.post("/api/settings/api-keys/:id/claim", acl.hasPermission('settings:update'), async function(req, res) {
        // #swagger.tags = ['Settings']
        try {
            var settings = await Settings.getAll();
            var entry = settings && settings.api && settings.api.keys.id(req.params.id);
            if (!entry)
                return Response.NotFound(res, 'API key not found');
            var creator = req.decodedToken.id;
            if (entry.creator && entry.creator.toString() !== creator)
                return Response.BadParameters(res, 'API key already has an owner');
            if (!entry.creator) {
                var claimed = await Settings.updateOne(
                    { 'api.keys': { $elemMatch: { _id: entry._id, creator: null } } },
                    { $set: { 'api.keys.$.creator': creator } }
                );
                if (!claimed.modifiedCount)
                    return Response.BadParameters(res, 'API key was already assigned');
            }
            var repaired = await Audit.updateMany(
                {creator: entry._id},
                {$set: {creator}}
            );
            var owner = await User.findById(creator).select('username firstname lastname').lean();
            Response.Ok(res, {
                id: entry._id,
                creator: ownerSummary(owner),
                repairedAudits: repaired.modifiedCount || 0
            });
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
