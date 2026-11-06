module.exports = function(app) {
    const mongoose = require('mongoose');
    const Response = require('../lib/httpResponse');
    const acl = require('../lib/auth').acl;
    const Audit = mongoose.model('Audit');
    const AuditTask = mongoose.model('AuditTask');
    const User = mongoose.model('User');

    function handle(res, err) {
        if (err.fn) return Response.Internal(res, err);
        if (err.name === 'CastError' || err.name === 'ValidationError') return Response.BadParameters(res, err.message);
        Response.Internal(res, err);
    }
    function membership(token, write) {
        if (acl.isTokenAllowed(token, write ? 'audits:update-all' : 'audits:read-all')) return {};
        return write ? {$or: [{creator: token.id}, {collaborators: token.id}]}
            : {$or: [{creator: token.id}, {collaborators: token.id}, {reviewers: token.id}]};
    }
    async function auditAccess(req, write = false) {
        if (!acl.isTokenAllowed(req.decodedToken, write ? 'audits:update' : 'audits:read'))
            throw {fn: 'Forbidden', message: 'Audit access required'};
        const audit = await Audit.findOne({_id: req.params.auditId, ...membership(req.decodedToken, write)})
            .select('creator collaborators reviewers').exec();
        if (!audit) throw {fn: 'NotFound', message: 'Audit not found or insufficient privileges'};
        return audit;
    }
    async function assigneeFor(audit, id) {
        if (!mongoose.isValidObjectId(id)) throw {fn: 'BadParameters', message: 'Invalid assignee'};
        const members = [audit.creator, ...audit.collaborators, ...audit.reviewers].map(String);
        if (!members.includes(String(id)) || !await User.exists({_id: id, enabled: {$ne: false}}))
            throw {fn: 'BadParameters', message: 'Assignee must be an active audit member'};
        return id;
    }
    function dueOn(value) {
        if (value == null || value === '') return null;
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
            throw {fn: 'BadParameters', message: 'Invalid due date'};
        const date = new Date(`${value}T00:00:00.000Z`);
        if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
            throw {fn: 'BadParameters', message: 'Invalid due date'};
        return date;
    }
    function fields(body) {
        if (typeof body?.title !== 'string' || !body.title.trim() || body.title.length > 160 ||
            (body.description != null && (typeof body.description !== 'string' || body.description.length > 3000)))
            throw {fn: 'BadParameters', message: 'Invalid task'};
        if (body.status && !['todo', 'doing', 'done'].includes(body.status))
            throw {fn: 'BadParameters', message: 'Invalid task status'};
        return {title: body.title.trim(), description: body.description || '', assignee: body.assignee,
            dueOn: dueOn(body.dueOn), status: body.status || 'todo'};
    }

    app.get('/api/tasks', acl.hasPermission('tasks:read'), async (req, res) => {
        try {
            if (!acl.isTokenAllowed(req.decodedToken, 'audits:read'))
                throw {fn: 'Forbidden', message: 'Audit access required'};
            const auditIds = await Audit.distinct('_id', membership(req.decodedToken, false));
            Response.Ok(res, await AuditTask.list(auditIds, req.query.mine === '1' ? req.decodedToken.id : null));
        } catch (err) { handle(res, err); }
    });
    app.get('/api/audits/:auditId/tasks', acl.hasPermission('tasks:read'), async (req, res) => {
        try { await auditAccess(req); Response.Ok(res, await AuditTask.list([req.params.auditId])); }
        catch (err) { handle(res, err); }
    });
    app.post('/api/audits/:auditId/tasks', acl.hasPermission('tasks:create'), async (req, res) => {
        try {
            const audit = await auditAccess(req, true);
            const data = fields(req.body);
            await assigneeFor(audit, data.assignee);
            const row = await AuditTask.create({...data, audit: audit._id,
                createdBy: req.decodedToken.id, updatedBy: req.decodedToken.id});
            Response.Created(res, await AuditTask.getOne(audit._id, row._id));
        } catch (err) { handle(res, err); }
    });
    app.put('/api/audits/:auditId/tasks/:taskId', acl.hasPermission('tasks:update'), async (req, res) => {
        try {
            await auditAccess(req);
            const task = await AuditTask.findOne({_id: req.params.taskId, audit: req.params.auditId});
            if (!task) throw {fn: 'NotFound', message: 'Task not found'};
            const canManage = !!await Audit.findOne({_id: req.params.auditId,
                ...membership(req.decodedToken, true)}).select('_id').exec() &&
                acl.isTokenAllowed(req.decodedToken, 'audits:update');
            if (!canManage && String(task.assignee) !== req.decodedToken.id)
                throw {fn: 'Forbidden', message: 'Task update not allowed'};
            if (canManage && typeof req.body?.title === 'string') {
                const data = fields(req.body);
                const audit = await auditAccess(req, true);
                await assigneeFor(audit, data.assignee);
                Object.assign(task, data);
            } else {
                if (!['todo', 'doing', 'done'].includes(req.body?.status) ||
                    Object.keys(req.body || {}).some(key => key !== 'status'))
                    throw {fn: 'BadParameters', message: 'Only task status can be changed'};
                task.status = req.body.status;
            }
            task.updatedBy = req.decodedToken.id;
            await task.save();
            Response.Ok(res, await AuditTask.getOne(req.params.auditId, task._id));
        } catch (err) { handle(res, err); }
    });
    app.delete('/api/audits/:auditId/tasks/:taskId', acl.hasPermission('tasks:delete'), async (req, res) => {
        try {
            await auditAccess(req, true);
            const result = await AuditTask.deleteOne({_id: req.params.taskId, audit: req.params.auditId});
            if (!result.deletedCount) throw {fn: 'NotFound', message: 'Task not found'};
            Response.Ok(res, 'Task deleted');
        } catch (err) { handle(res, err); }
    });
};
