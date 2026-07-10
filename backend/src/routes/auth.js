module.exports = function(app) {

    var Response = require('../lib/httpResponse.js');
    var Settings = require('mongoose').model('Settings');
    var User = require('mongoose').model('User');
    var crypto = require('crypto');

    var STATE_COOKIE = 'ssoState';

    function getAppUrl() {
        return (process.env.APP_URL || 'https://localhost:8443').replace(/\/$/, '');
    }

    function getRedirectUri() {
        return `${getAppUrl()}/api/auth/sso/callback`;
    }

    function clearStateCookie(res) {
        res.clearCookie(STATE_COOKIE, {secure: true, httpOnly: true, sameSite: 'lax', path: '/api/auth/sso/callback'});
    }

    function fail(res, reason) {
        clearStateCookie(res);
        res.redirect(`${getAppUrl()}/login?ssoError=${encodeURIComponent(reason)}`);
    }

    function getClaim(profile, claim) {
        if (!profile || !claim) return '';
        return String(claim).split('.').reduce((value, part) => {
            if (value && Object.prototype.hasOwnProperty.call(value, part)) return value[part];
            return undefined;
        }, profile) || '';
    }

    function ssoConfig(settings) {
        var auth = settings && settings.authentication ? settings.authentication : {};
        return auth.sso || {};
    }

    function validateConfig(sso) {
        var pub = sso.public || {};
        var priv = sso.private || {};
        var missing = [];
        if (!pub.authorizationUrl) missing.push('authorizationUrl');
        if (!pub.tokenUrl) missing.push('tokenUrl');
        if (!pub.userInfoUrl) missing.push('userInfoUrl');
        if (!priv.clientId) missing.push('clientId');
        if (!priv.clientSecret) missing.push('clientSecret');
        return missing;
    }

    async function exchangeCode(sso, code) {
        var pub = sso.public || {};
        var priv = sso.private || {};
        var body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: getRedirectUri(),
            client_id: priv.clientId,
            client_secret: priv.clientSecret
        });

        var response = await fetch(pub.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: body
        });
        var token = await response.json().catch(() => ({}));
        if (!response.ok || !token.access_token)
            throw({fn: 'Unauthorized', message: token.error_description || token.error || 'SSO token exchange failed'});
        return token;
    }

    async function loadUserInfo(sso, accessToken) {
        var response = await fetch((sso.public || {}).userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        var profile = await response.json().catch(() => ({}));
        if (!response.ok)
            throw({fn: 'Unauthorized', message: profile.error_description || profile.error || 'SSO user info request failed'});
        return profile;
    }

    async function findOrCreateUser(sso, rawProfile) {
        var pub = sso.public || {};
        var provider = pub.providerId || 'oauth2';
        var subject = getClaim(rawProfile, pub.subjectClaim || 'sub') || rawProfile.sub || rawProfile.id;
        if (!subject)
            throw({fn: 'Unauthorized', message: 'SSO profile does not contain a subject'});

        var profile = {
            provider: provider,
            subject: String(subject),
            username: getClaim(rawProfile, pub.usernameClaim || 'preferred_username'),
            firstname: getClaim(rawProfile, pub.firstnameClaim || 'given_name'),
            lastname: getClaim(rawProfile, pub.lastnameClaim || 'family_name'),
            email: getClaim(rawProfile, pub.emailClaim || 'email')
        };

        var linked = await User.findBySsoIdentity(profile.provider, profile.subject);
        if (linked) return linked;

        var emailVerified = rawProfile.email_verified === true || rawProfile.email_verified === 'true';
        if (pub.autoLinkExistingUsers && profile.email && emailVerified) {
            var matches = await User.find({email: profile.email}).limit(2);
            if (matches.length === 1 && !(matches[0].sso && matches[0].sso.provider && matches[0].sso.subject)) {
                return User.linkSsoIdentity(matches[0]._id, profile);
            }
        }

        if (!pub.registrationEnabled)
            throw({fn: 'Unauthorized', message: 'SSO registration is disabled'});

        return User.createSsoUser(profile);
    }

    app.get('/api/auth/sso/config', async function(req, res) {
        try {
            var settings = await Settings.getAll();
            var sso = ssoConfig(settings);
            Response.Ok(res, {
                enabled: !!sso.enabled,
                providerName: (sso.public && sso.public.providerName) || 'SSO'
            });
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    app.get('/api/auth/sso/start', async function(req, res) {
        try {
            var settings = await Settings.getAll();
            var sso = ssoConfig(settings);
            if (!sso.enabled)
                return Response.NotFound(res, 'SSO is disabled');

            var missing = validateConfig(sso);
            if (missing.length > 0)
                return Response.BadParameters(res, `Missing SSO settings: ${missing.join(', ')}`);

            var pub = sso.public || {};
            var priv = sso.private || {};
            var state = crypto.randomBytes(32).toString('hex');
            res.cookie(STATE_COOKIE, state, {secure: true, httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/api/auth/sso/callback'});

            var authorizationUrl = new URL(pub.authorizationUrl);
            authorizationUrl.searchParams.set('response_type', 'code');
            authorizationUrl.searchParams.set('client_id', priv.clientId);
            authorizationUrl.searchParams.set('redirect_uri', getRedirectUri());
            authorizationUrl.searchParams.set('scope', pub.scope || 'openid profile email');
            authorizationUrl.searchParams.set('state', state);
            res.redirect(authorizationUrl.toString());
        }
        catch (err) {
            Response.Internal(res, err);
        }
    });

    app.get('/api/auth/sso/callback', async function(req, res) {
        try {
            if (!req.query.code)
                return fail(res, 'missing_code');
            if (!req.query.state || req.query.state !== req.cookies[STATE_COOKIE])
                return fail(res, 'invalid_state');

            var settings = await Settings.getAll();
            var sso = ssoConfig(settings);
            if (!sso.enabled)
                return fail(res, 'disabled');

            clearStateCookie(res);
            var token = await exchangeCode(sso, req.query.code);
            var profile = await loadUserInfo(sso, token.access_token);
            var user = await findOrCreateUser(sso, profile);
            var msg = await User.issueTokensForUser(user, req.headers['user-agent']);
            res.cookie('token', `JWT ${msg.token}`, {secure: true, sameSite: 'strict', httpOnly: true});
            res.cookie('refreshToken', msg.refreshToken, {secure: true, sameSite: 'strict', httpOnly: true, path: '/api/users/refreshtoken'});
            res.redirect(`${getAppUrl()}/`);
        }
        catch (err) {
            fail(res, err.message || 'sso_failed');
        }
    });
}
