module.exports = function(app) {
    const mongoose = require('mongoose');
    const Response = require('../lib/httpResponse');
    const acl = require('../lib/auth').acl;
    const Audit = mongoose.model('Audit');
    const AuditTask = mongoose.model('AuditTask');

    app.get('/api/dashboard', acl.hasPermission('audits:read'), async (req, res) => {
        try {
            const token = req.decodedToken;
            const scope = acl.isTokenAllowed(token, 'audits:read-all') ? {} :
                {$or: [{creator: token.id}, {collaborators: token.id}, {reviewers: token.id}]};
            const ids = await Audit.distinct('_id', scope);
            const activeFilter = {_id: {$in: ids}, state: {$ne: 'APPROVED'}};
            const [activeCount, reviewCount, audits, findingCounts, tasks, taskCount] =
                await Promise.all([
                    Audit.countDocuments(activeFilter),
                    Audit.countDocuments({_id: {$in: ids}, state: 'REVIEW'}),
                    Audit.find(activeFilter).select('name auditType state company date_end updatedAt isRetest')
                        .populate('company', 'name').sort({updatedAt: -1}).limit(12).lean().exec(),
                    Audit.aggregate([{$match: {_id: {$in: ids}}}, {$unwind: '$findings'},
                        {$match: {'findings.status': 2}}, {$count: 'count'}]),
                    acl.isTokenAllowed(token, 'tasks:read') ? AuditTask.find({audit: {$in: ids}, assignee: token.id,
                        status: {$ne: 'done'}}).populate('audit', 'name state').sort({dueOn: 1, createdAt: -1})
                        .limit(20).lean().exec() : [],
                    acl.isTokenAllowed(token, 'tasks:read') ? AuditTask.countDocuments({audit: {$in: ids},
                        assignee: token.id, status: {$ne: 'done'}}) : 0,
                ]);
            Response.Ok(res, {stats: {activeAudits: activeCount, auditsInReview: reviewCount,
                findingsForReview: findingCounts[0]?.count || 0, myTasks: taskCount}, audits, tasks});
        } catch (err) { Response.Internal(res, err); }
    });
};
