module.exports = function(app) {
    const mongoose = require('mongoose');
    const Tool = mongoose.model('Tool');
    const ToolLicense = mongoose.model('ToolLicense');
    const User = mongoose.model('User');
    const Response = require('../lib/httpResponse');
    const acl = require('../lib/auth').acl;

    function handle(res, err) {
        if (err.fn) return Response.Internal(res, err);
        if (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000)
            return Response.BadParameters(res, err.code === 11000 ? 'Tool already exists' : err.message);
        Response.Internal(res, err);
    }

    function date(value) {
        if (!value) return null;
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw {fn: 'BadParameters', message: 'Expected YYYY-MM-DD date'};
        const parsed = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
            throw {fn: 'BadParameters', message: 'Invalid calendar date'};
        return parsed;
    }

    async function user(id) {
        if (!id) return null;
        if (!mongoose.isValidObjectId(id) || !await User.exists({_id: id}))
            throw {fn: 'BadParameters', message: 'User not found'};
        return id;
    }

    async function toolPayload(body, creator) {
        if (!body || typeof body.name !== 'string' || !body.name.trim()) throw {fn: 'BadParameters', message: 'Tool name is required'};
        const text = field => typeof body[field] === 'string' ? body[field].trim() : '';
        if (body.website && !/^https?:\/\/[^\s]+$/i.test(body.website)) throw {fn: 'BadParameters', message: 'Invalid website URL'};
        if (body.tags && (!Array.isArray(body.tags) || body.tags.some(tag => typeof tag !== 'string'))) throw {fn: 'BadParameters', message: 'Invalid tags'};
        return {name: text('name'), vendor: text('vendor'), edition: text('edition'), category: text('category'),
            purpose: text('purpose'), website: text('website'), version: text('version'), status: text('status') || 'active',
            owner: await user(body.owner), tags: [...new Set((body.tags || []).map(t => t.trim()).filter(Boolean))].slice(0, 20),
            ...(creator ? {createdBy: creator} : {})};
    }

    async function licensePayload(body, creator) {
        if (!body || !mongoose.isValidObjectId(body.tool) || typeof body.label !== 'string' || !body.label.trim())
            throw {fn: 'BadParameters', message: 'Tool and license label are required'};
        const seats = Number(body.seats);
        if (!Number.isInteger(seats) || seats < 1 || seats > 100000) throw {fn: 'BadParameters', message: 'Invalid seat count'};
        const ids = body.assignedTo || [];
        if (!Array.isArray(ids) || ids.length > seats || new Set(ids).size !== ids.length)
            throw {fn: 'BadParameters', message: 'Assignments exceed available seats'};
        for (const id of ids) await user(id);
        const purchasedOn = date(body.purchasedOn);
        const expiresOn = date(body.expiresOn);
        if (purchasedOn && expiresOn && expiresOn < purchasedOn)
            throw {fn: 'BadParameters', message: 'Expiry precedes purchase date'};
        return {tool: body.tool, label: body.label.trim(), type: String(body.type || '').trim(), seats,
            assignedTo: ids, purchasedOn, expiresOn, renewalOwner: await user(body.renewalOwner),
            purchaseRef: String(body.purchaseRef || '').trim(), notes: String(body.notes || '').trim(),
            ...(creator ? {createdBy: creator} : {})};
    }

    app.get('/api/tools', acl.hasPermission('tools:read'), (_req, res) => Tool.list().then(rows => Response.Ok(res, rows)).catch(err => handle(res, err)));
    app.post('/api/tools', acl.hasPermission('tools:create'), async (req, res) => {
        try { Response.Created(res, await Tool.saveTool(null, await toolPayload(req.body, req.decodedToken.id))); }
        catch (err) { handle(res, err); }
    });
    app.put('/api/tools/:id', acl.hasPermission('tools:update'), async (req, res) => {
        try { Response.Ok(res, await Tool.saveTool(req.params.id, await toolPayload(req.body))); }
        catch (err) { handle(res, err); }
    });
    app.delete('/api/tools/:id', acl.hasPermission('tools:delete'), async (req, res) => {
        try { await Tool.removeTool(req.params.id); Response.Ok(res, 'Tool deleted'); }
        catch (err) { handle(res, err); }
    });
    app.get('/api/licenses', acl.hasPermission('licenses:read'), (_req, res) => ToolLicense.list().then(rows => Response.Ok(res, rows)).catch(err => handle(res, err)));
    app.post('/api/licenses', acl.hasPermission('licenses:create'), async (req, res) => {
        try { Response.Created(res, await ToolLicense.saveLicense(null, await licensePayload(req.body, req.decodedToken.id))); }
        catch (err) { handle(res, err); }
    });
    app.put('/api/licenses/:id', acl.hasPermission('licenses:update'), async (req, res) => {
        try { Response.Ok(res, await ToolLicense.saveLicense(req.params.id, await licensePayload(req.body))); }
        catch (err) { handle(res, err); }
    });
    app.delete('/api/licenses/:id', acl.hasPermission('licenses:delete'), async (req, res) => {
        try { await ToolLicense.removeLicense(req.params.id); Response.Ok(res, 'License deleted'); }
        catch (err) { handle(res, err); }
    });
};
