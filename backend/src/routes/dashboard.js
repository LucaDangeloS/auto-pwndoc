module.exports = function(app) {
    const mongoose = require('mongoose');
    const Response = require('../lib/httpResponse');
    const acl = require('../lib/auth').acl;
    const Audit = mongoose.model('Audit');
    const AuditTask = mongoose.model('AuditTask');
    const EvidenceCandidate = mongoose.model('EvidenceCandidate');
    const GuideRun = mongoose.model('GuideRun');
    const ToolLicense = mongoose.model('ToolLicense');

    app.get('/api/dashboard', acl.hasPermission('audits:read'), async (req, res) => {
        try {
            const token = req.decodedToken;
            const scope = acl.isTokenAllowed(token, 'audits:read-all') ? {} :
                {$or: [{creator: token.id}, {collaborators: token.id}, {reviewers: token.id}]};
            const ids = await Audit.distinct('_id', scope);
            const activeFilter = {_id: {$in: ids}, state: {$ne: 'APPROVED'}};
            const dueLimit = new Date();
            dueLimit.setUTCDate(dueLimit.getUTCDate() + 90);
            const [activeCount, reviewCount, audits, findingCounts, tasks, taskCount, coverageCounts, evidenceCount, evidence, licenses] =
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
                    acl.isTokenAllowed(token, 'guides:read') ? GuideRun.aggregate([{$match: {audit: {$in: ids}}},
                        {$unwind: '$coverage'}, {$group: {_id: '$coverage.status', count: {$sum: 1}}}]) : [],
                    acl.isTokenAllowed(token, 'evidence:read') ? EvidenceCandidate.countDocuments({audit: {$in: ids}, status: 'pending'}) : 0,
                    acl.isTokenAllowed(token, 'evidence:read') ? EvidenceCandidate.find({audit: {$in: ids}, status: 'pending'})
                        .select('audit title sourceType createdAt').populate('audit', 'name').sort({createdAt: -1})
                        .limit(10).lean().exec() : [],
                    acl.isTokenAllowed(token, 'licenses:read') ? ToolLicense.find({expiresOn: {$ne: null, $lte: dueLimit}})
                        .select('tool label expiresOn renewalOwner').populate('tool', 'name edition')
                        .populate('renewalOwner', 'username').sort({expiresOn: 1}).limit(12).lean().exec() : []
                ]);
            const coverage = {pending: 0, tested: 0, na: 0};
            for (const row of coverageCounts) if (Object.hasOwn(coverage, row._id)) coverage[row._id] = row.count;
            Response.Ok(res, {stats: {activeAudits: activeCount, auditsInReview: reviewCount,
                findingsForReview: findingCounts[0]?.count || 0, myTasks: taskCount, pendingEvidence: evidenceCount},
            audits, tasks, evidence, licenses, coverage});
        } catch (err) { Response.Internal(res, err); }
    });
};
