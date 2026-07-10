module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var acl = require('../lib/auth').acl;
    var SpellingDictionary = require('mongoose').model('SpellingDictionary');
    var Settings = require('mongoose').model('Settings');
    var { getLanguageToolConfig } = require('../lib/languagetool-config');
    var { testLanguageToolConnection } = require('../lib/languagetool-test');

    // Capabilities: is spellcheck enabled and is a LanguageTool endpoint configured
    app.get("/api/spellcheck/capabilities", acl.hasPermission('spellcheck:read'), async function(req, res) {
        try {
            const settings = await Settings.getAll();
            const enabled = !!(settings && settings.report && settings.report.public && settings.report.public.enableSpellCheck);
            const config = await getLanguageToolConfig();
            Response.Ok(res, {
                enabled: enabled,
                configured: !!(config && config.url)
            });
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    // Live connection test using request body values (not saved settings)
    app.post("/api/spellcheck/test", acl.hasPermission('settings:update'), async function(req, res) {
        try {
            const result = await testLanguageToolConnection(req.body.url);
            if (result.error)
                return Response.BadParameters(res, result.error);
            const { valid, ...data } = result;
            Response.Ok(res, data);
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    // Spellcheck proxy with shared-dictionary filtering
    app.post("/api/spellcheck", acl.hasPermission('spellcheck:read'), async function(req, res) {
        try {
            const { text, language = 'auto', enabledOnly, disabledCategories } = req.body;
            if (!text)
                return Response.Ok(res, { matches: [] });

            const config = await getLanguageToolConfig();
            if (!config)
                return Response.Ok(res, { matches: [] });

            const entries = await SpellingDictionary.getAll();
            const dictionary = entries.map(e => e.word.toLowerCase());

            const params = new URLSearchParams({ text, language });
            if (enabledOnly !== undefined) params.append('enabledOnly', enabledOnly);
            if (disabledCategories) params.append('disabledCategories', disabledCategories);

            let ltResponse;
            try {
                ltResponse = await fetch(`${config.url}/v2/check`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params,
                    signal: AbortSignal.timeout(10000)
                });
            }
            catch (err) {
                const cause = err && err.cause ? err.cause : {};
                const code = cause.code || cause.errno;
                const detail = cause.message || err.message || String(err);
                console.error('LanguageTool fetch failed', { url: config.url, code, detail });
                return Response.Custom(res, 'error', 502, `LanguageTool fetch failed${code ? ` (${code})` : ''}: ${detail}`);
            }

            if (ltResponse.status === 429)
                return Response.Ok(res, { matches: [], rateLimited: true });

            if (!ltResponse.ok) {
                let errorDetail = ltResponse.statusText || 'Unknown error';
                try {
                    const errorBody = await ltResponse.text();
                    if (errorBody) errorDetail = errorBody;
                } catch (_) {}
                return Response.Custom(res, 'error', 502, `LanguageTool HTTP ${ltResponse.status}: ${errorDetail}`);
            }

            const ltResult = await ltResponse.json();

            // Filter matches against the shared custom dictionary
            ltResult.matches = (ltResult.matches || []).filter(match => {
                const word = text.substring(match.offset, match.offset + match.length);
                return !dictionary.includes(word.toLowerCase());
            });

            Response.Ok(res, ltResult);
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    app.get("/api/spellcheck/dict", acl.hasPermission('spellcheck:read'), function(req, res) {
        SpellingDictionary.getAll()
        .then(dict => Response.Ok(res, dict))
        .catch(err => Response.Internal(res, err));
    });

    app.post("/api/spellcheck/dict", acl.hasPermission('spellcheck:create'), function(req, res) {
        if (!req.body.word)
            return Response.BadParameters(res, 'Required parameters: word');

        SpellingDictionary.create(req.body.word)
        .then(row => Response.Ok(res, { word: row.word }))
        .catch(err => Response.Internal(res, err));
    });

    app.delete("/api/spellcheck/dict", acl.hasPermission('spellcheck:delete'), function(req, res) {
        if (!req.body.word)
            return Response.BadParameters(res, 'Required parameters: word');

        SpellingDictionary.delete(req.body.word)
        .then(row => Response.Ok(res, { removed: row.word }))
        .catch(err => Response.Internal(res, err));
    });
};
