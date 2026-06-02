'use strict';

var Settings = require('mongoose').model('Settings');

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

        req.decodedToken = {
            id: match._id.toString(),
            username: match.name,
            role: 'admin',
            roles: '*'
        };

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
