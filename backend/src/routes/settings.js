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

    // Keys are listed through their own endpoints, never with the settings document
    function withoutKeys(settings) {
        var result = withRuntimeSettings(settings);
        if (result && result.mcp) delete result.mcp.keys;
        if (result) delete result.api;
        return result;
    }
    
    app.get("/api/settings", acl.hasPermission('settings:read'), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.getAll()
        .then(settings => {
            var result = withoutKeys(settings);
            if (result && req.query.includeAiPrompts === '1') {
                result.aiPromptSettings = require('../lib/ai-service').getPromptSettings(result.ai?.private || {});
            }
            Response.Ok(res, result);
        })
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
                req.body.mcp.keys = current && current.mcp ? current.mcp.keys : [];
            }
            if (req.body.api) {
                req.body.api.keys = current && current.api ? current.api.keys : [];
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

    // API keys (REST) and MCP keys share the same lifecycle: each key belongs to
    // its creator, is shown once on creation and can be claimed when ownerless.
    function registerKeyRoutes(route, field, label, repairFilter) {
        function keysOf(settings) {
            var parent = settings && settings[field];
            return (parent && parent.keys) || [];
        }

        app.get(route, acl.hasPermission('settings:update'), async function(req, res) {
            // #swagger.tags = ['Settings']
            try {
                var keys = keysOf(await Settings.getAll());
                var ownerIds = keys.map(key => key.creator).filter(Boolean);
                var owners = await User.find({ _id: { $in: ownerIds } }).select('username firstname lastname').lean();
                var ownersById = new Map(owners.map(owner => [owner._id.toString(), ownerSummary(owner)]));
                Response.Ok(res, keys.map(k => ({
                    id: k._id,
                    name: k.name,
                    creator: k.creator
                        ? ownersById.get(k.creator.toString()) || unavailableOwnerSummary(k.creator)
                        : null,
                    keyPrefix: k.key.substring(0, 8),
                    createdAt: k.createdAt,
                    lastUsedAt: k.lastUsedAt
                })));
            }
            catch (err) { Response.Internal(res, err); }
        });

        app.post(route, acl.hasPermission('settings:update'), async function(req, res) {
            // #swagger.tags = ['Settings']
            try {
                var name = req.body && req.body.name;
                if (!name || typeof name !== 'string' || !name.trim()) return Response.BadParameters(res, 'name is required');
                var key = crypto.randomBytes(32).toString('hex');
                var result = await Settings.findOneAndUpdate(
                    {},
                    { $push: { [`${field}.keys`]: { name: name.trim(), key, creator: req.decodedToken.id, createdAt: new Date(), lastUsedAt: null } } },
                    { new: true, upsert: true }
                );
                var keys = keysOf(result);
                var entry = keys[keys.length - 1];
                var owner = await User.findById(entry.creator).select('username firstname lastname').lean();
                Response.Ok(res, { id: entry._id, name: entry.name, creator: ownerSummary(owner), key, createdAt: entry.createdAt });
            }
            catch (err) { Response.Internal(res, err); }
        });

        app.post(`${route}/:id/claim`, acl.hasPermission('settings:update'), async function(req, res) {
            // #swagger.tags = ['Settings']
            try {
                var entry = keysOf(await Settings.getAll()).find(k => k._id.toString() === req.params.id);
                if (!entry)
                    return Response.NotFound(res, `${label} not found`);
                var creator = req.decodedToken.id;
                if (entry.creator && entry.creator.toString() !== creator)
                    return Response.BadParameters(res, `${label} already has an owner`);
                if (!entry.creator) {
                    var claimed = await Settings.updateOne(
                        { [`${field}.keys`]: { $elemMatch: { _id: entry._id, creator: null } } },
                        { $set: { [`${field}.keys.$.creator`]: creator } }
                    );
                    if (!claimed.modifiedCount)
                        return Response.BadParameters(res, `${label} was already assigned`);
                }
                var repaired = await Audit.updateMany(repairFilter(entry), {$set: {creator}});
                var owner = await User.findById(creator).select('username firstname lastname').lean();
                Response.Ok(res, {
                    id: entry._id,
                    creator: ownerSummary(owner),
                    repairedAudits: repaired.modifiedCount || 0
                });
            }
            catch (err) { Response.Internal(res, err); }
        });

        app.delete(`${route}/:id`, acl.hasPermission('settings:update'), async function(req, res) {
            // #swagger.tags = ['Settings']
            try {
                await Settings.findOneAndUpdate(
                    {},
                    { $pull: { [`${field}.keys`]: { _id: req.params.id } } }
                );
                Response.Ok(res, `${label} revoked`);
            }
            catch (err) { Response.Internal(res, err); }
        });
    }

    // Ownerless REST keys stored their own id as audit creator; ownerless MCP keys used the zero id.
    registerKeyRoutes('/api/settings/api-keys', 'api', 'API key', entry => ({creator: entry._id}));
    registerKeyRoutes('/api/settings/mcp-keys', 'mcp', 'MCP key', () => ({creator: '000000000000000000000000'}));

    app.get("/api/settings/export", acl.hasPermission("settings:read"), function(req, res) {
        // #swagger.tags = ['Settings']

        Settings.getAll()
        .then(settings => Response.SendFile(res, "app-settings.json", settings))
        .catch(err => Response.Internal(res, err))
    });
}
