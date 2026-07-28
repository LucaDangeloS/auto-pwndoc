'use strict';

var Settings = require('mongoose').model('Settings');
var User = require('mongoose').model('User');

function extractKey(req) {
    if (req.headers['x-api-key']) return req.headers['x-api-key'];
    var auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return null;
}

module.exports = async function(req, res, next) {
    var key = extractKey(req);
    if (!key) return next();

    try {
        var settings = await Settings.getAll();
        var keys = settings && settings.api && settings.api.keys;
        if (!keys || keys.length === 0) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        var match = keys.find(k => k.key === key);
        if (!match) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        req.apiKey = { id: match._id.toString(), creator: match.creator ? match.creator.toString() : null };

        if (match.creator) {
            var owner = await User.findById(match.creator).select('username firstname lastname email phone role permissions enabled');
            if (!owner || owner.enabled === false) {
                return res.status(401).json({ error: 'API key owner is unavailable' });
            }

            var auth = require('./auth');
            var baseRoles = auth.acl.getRoles(owner.role);
            req.decodedToken = {
                id: owner._id.toString(),
                username: owner.username,
                firstname: owner.firstname,
                lastname: owner.lastname,
                email: owner.email,
                phone: owner.phone,
                role: owner.role,
                roles: baseRoles === '*' ? '*' : [...new Set([...baseRoles, ...(owner.permissions || [])])]
            };
        }
        else {
            // Keys created before ownership was introduced retain their
            // original administrator-level behaviour until they are replaced.
            req.decodedToken = {
                id: match._id.toString(),
                username: match.name,
                role: 'admin',
                roles: '*'
            };
        }

        Settings.updateOne(
            { 'api.keys._id': match._id },
            { $set: { 'api.keys.$.lastUsedAt': new Date() } }
        ).catch(() => {});

        next();
    }
    catch (err) {
        return res.status(500).json({ error: 'API key authentication failed' });
    }
};
