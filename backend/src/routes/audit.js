module.exports = function(app, io) {

    var Response = require('../lib/httpResponse');
    var Audit = require('mongoose').model('Audit');
    var acl = require('../lib/auth').acl;
    var reportGenerator = require('../lib/report-generator');
    var _ = require('lodash');
    var utils = require('../lib/utils');
    var Settings = require('mongoose').model('Settings');

    function syncTaxonomy(finding, body) {
        if (Array.isArray(body.taxonomies)) {
            finding.taxonomies = body.taxonomies.map(t => ({
                type: (t && t.type) || '',
                category: (t && t.category) || '',
                subcategory: (t && t.subcategory) || '',
                code: (t && t.code) || ''
            }));
            return;
        }
        // Accept old clients and imports that still send legacy classifier fields.
        const type = body.category || '';
        const category = body.vulnType || '';
        if (type || category) {
            finding.taxonomies = [{ type: type, category: category, subcategory: '', code: '' }];
        }
    }

    /* ### AUDITS LIST ### */

    // Get audits list of user (all for admin) with regex filter on findings
    app.get("/api/audits", acl.hasPermission('audits:read'), function(req, res) {
        // #swagger.tags = ['Audit']

        var getUsersRoom = function(room) {
            return utils.getSockets(io, room).map(s => s.username)
        }
        var filters = {};
        if (req.query.findingTitle) 
            filters['findings.title'] = new RegExp(utils.escapeRegex(req.query.findingTitle), 'i')
            
        Audit.getAudits(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.decodedToken.id, filters)
        .then(msg => {
                var result = []
                msg.forEach(audit => {
                    var a = {}
                    a._id = audit._id
                    a.name = audit.name
                    a.auditType = audit.auditType
                    a.language = audit.language
                    a.creator = audit.creator
                    a.collaborators = audit.collaborators
                    a.company = audit.company
                    a.createdAt = audit.createdAt
                    a.reviewers = audit.reviewers
                    a.approvals = audit.approvals
                    a.state = audit.state
                    a.isRetest = audit.isRetest
                    a.parentId = audit.parentId
                    if (acl.isAllowed(req.decodedToken.role, 'audits:users-connected')){
                        a.connected = getUsersRoom(audit._id.toString())
                    }
                    result.push(a)
                })
            Response.Ok(res, result)
        })
        .catch(err => Response.Internal(res, err))
    });


    
    // Get clients for export
    /*
    app.get("/api/audits/export", acl.hasPermission('audits:read-all'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.export()
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });
    */

    // Create audit with name, auditType, language provided
    app.post("/api/audits", acl.hasPermission('audits:create'), function(req, res) {
        // #swagger.tags = ['Audit']

        if (!req.body.name || !req.body.language || !req.body.auditType) {
            Response.BadParameters(res, 'Missing some required parameters: name, language, auditType');
            return;
        }

        if (!utils.validFilename(req.body.language)) {
            Response.BadParameters(res, 'Invalid characters for language');
            return;
        }

        var audit = {};
        // Required params
        audit.name = req.body.name;
        audit.language = req.body.language;
        audit.auditType = req.body.auditType;

        Audit.create(audit, req.decodedToken.id)
        .then(inserted => Response.Created(res, {message: 'Audit created successfully', audit: inserted}))
        .catch(err => Response.Internal(res, err))
    });

    // Clone existing audit
    app.post("/api/audits/:auditId/clone", acl.hasPermission('audits:create'), function(req, res) {
        // #swagger.tags = ['Audit']

        if (!req.body.name) {
            Response.BadParameters(res, 'Missing required parameter: name');
            return;
        }

        Audit.clone(req.params.auditId, req.body.name, req.decodedToken.id)
        .then(inserted => Response.Created(res, {message: 'Audit cloned successfully', audit: inserted}))
        .catch(err => Response.Internal(res, err))
    });

    // Get the linked retest child audit of an audit (null if none)
    app.get("/api/audits/:auditId/retest", acl.hasPermission('audits:read'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.getRetest(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Create a linked retest child audit from an audit
    app.post("/api/audits/:auditId/retest", acl.hasPermission('audits:create'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.createRetest(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id, req.body.name)
        .then(inserted => Response.Created(res, {message: 'Audit retest created successfully', audit: inserted}))
        .catch(err => Response.Internal(res, err))
    });

    // Delete audit if creator or admin
    app.delete("/api/audits/:auditId", acl.hasPermission('audits:delete'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.delete(acl.isAllowed(req.decodedToken.role, 'audits:delete-all'), req.params.auditId, req.decodedToken.id)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    })

    /* ### AUDITS EDIT ### */

    // Get Audit with ID
    app.get("/api/audits/:auditId", acl.hasPermission('audits:read'), function(req, res) {
        // #swagger.tags = ['Audit']

        // Reconcile sections with the current audit type before returning the
        // audit, so sections added to the type after creation show up
        Audit.syncSectionsWithAuditType(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id)
        .catch(err => console.log(err))
        .then(() => Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id))
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Get audit general information
    app.get("/api/audits/:auditId/general", acl.hasPermission('audits:read'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.getGeneral(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Update audit general information
    app.put("/api/audits/:auditId/general", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var update = {};
        
        var settings = await Settings.getAll();
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }

        if (req.body.reviewers) {
            if (req.body.reviewers.some(element => !element._id)) {
                Response.BadParameters(res, "One or more reviewer is missing an _id");
                return;
            }

            // Is the new reviewer the creator of the audit? 
            if (req.body.reviewers.some(element => element._id === audit.creator._id)) {
                Response.BadParameters(res, "A user cannot simultaneously be a reviewer and a collaborator/creator");
                return;
            }

            // Is the new reviewer one of the new collaborators that will override current collaborators? 
            if (req.body.collaborators) {
                req.body.reviewers.forEach((reviewer) => {
                    if (req.body.collaborators.some(element => !element._id || element._id === reviewer._id)) {
                        Response.BadParameters(res, "A user cannot simultaneously be a reviewer and a collaborator/creator");
                        return;
                    }
                });
            }

            // If no new collaborators are being set, is the new reviewer one of the current collaborators? 
            else if (audit.collaborators) {
                req.body.reviewers.forEach((reviewer) => {
                    if (audit.collaborators.some(element => element._id === reviewer._id)) {
                        Response.BadParameters(res, "A user cannot simultaneously be a reviewer and a collaborator/creator");
                        return;
                    }
                });
            }
        }

        if (req.body.collaborators) {
            if (req.body.collaborators.some(element => !element._id)) {
                Response.BadParameters(res, "One or more collaborator is missing an _id");
                return;
            }
            
            // Are the new collaborators part of the current reviewers?
            req.body.collaborators.forEach((collaborator) => {
                if (audit.reviewers.some(element => element._id === collaborator._id)) {
                    Response.BadParameters(res, "A user cannot simultaneously be a reviewer and a collaborator/creator");
                    return;
                }
            });

            // If the new collaborator already gave a review, remove said review, accept collaborator
            if (audit.approvals) {
                newApprovals = audit.approvals.filter((approval) => !req.body.collaborators.some((collaborator) => approval.toString() === collaborator._id));
                update.approvals = newApprovals;
            }
        }

        // Optional parameters
        if (req.body.name) update.name = req.body.name;
        if (req.body.date) update.date = req.body.date;
        if (req.body.date_start) update.date_start = req.body.date_start;
        if (req.body.date_end) update.date_end = req.body.date_end;
        if (req.body.summary !== undefined) update.summary = req.body.summary;
        if (req.body.company !== undefined) {
            update.company = {};
            if (req.body.company && req.body.company._id)
                update.company._id = req.body.company._id;
            else if (req.body.company && req.body.company.name)
                update.company.name = req.body.company.name
            else
                update.company = null
        }
        if (req.body.collaborators) update.collaborators = req.body.collaborators;
        if (req.body.reviewers) update.reviewers = req.body.reviewers;
        if (req.body.language && utils.validFilename(req.body.language)) update.language = req.body.language;
        if (req.body.scope && typeof(req.body.scope === "array")) {
            update.scope = req.body.scope.map(item => {return {name: item}});
        }
        if (req.body.template) update.template = req.body.template;
        if (req.body.customFields) update.customFields = req.body.customFields;
        if (req.body.isRetest !== undefined) update.isRetest = req.body.isRetest;
        if (req.body.executiveSummary !== undefined) update.executiveSummary = req.body.executiveSummary;
        if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate) update.approvals = [];

        Audit.updateGeneral(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, update)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    // Get audit network information
    app.get("/api/audits/:auditId/network", acl.hasPermission('audits:read'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.getNetwork(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Update audit network information
    app.put("/api/audits/:auditId/network", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var settings = await Settings.getAll();

        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }

        var update = {};
        // Optional parameters
        if (req.body.scope) update.scope = req.body.scope;
        if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate) update.approvals = [];

        Audit.updateNetwork(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, update)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Add finding to audit
    app.post("/api/audits/:auditId/findings", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var settings = await Settings.getAll();
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }
        if (!req.body.title) {
            Response.BadParameters(res, 'Missing some required parameters: title');
            return;
        }

        var finding = {};
        // Required parameters
        finding.title = req.body.title;

        // Optional parameters
        if (req.body.description) finding.description = req.body.description;
        if (req.body.observation) finding.observation = req.body.observation;
        if (req.body.remediation) finding.remediation = req.body.remediation;
        if (req.body.remediationComplexity) finding.remediationComplexity = req.body.remediationComplexity;
        if (req.body.priority) finding.priority = req.body.priority;
        if (req.body.references) finding.references = req.body.references;
        if (!_.isNil(req.body.cvssv3)) finding.cvssv3 = req.body.cvssv3;
        if (!_.isNil(req.body.cvssv4)) finding.cvssv4 = req.body.cvssv4;
        if (req.body.poc) finding.poc = req.body.poc;
        if (req.body.retestEvidence) finding.retestEvidence = req.body.retestEvidence;
        if (req.body.retestStatus !== undefined && ['ok','ko','partial','unknown'].includes(req.body.retestStatus)) finding.retestStatus = req.body.retestStatus;
        else if (req.body.retestPassed !== undefined) finding.retestStatus = req.body.retestPassed === true ? 'ok' : req.body.retestPassed === false ? 'ko' : 'unknown'; // legacy boolean payloads
        if (req.body.scope) finding.scope = req.body.scope;
        if (req.body.status !== undefined && [0,1,2,3].includes(req.body.status)) finding.status = req.body.status;
        if (req.body.customFields) finding.customFields = req.body.customFields
        syncTaxonomy(finding, req.body);

        if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate) {
            Audit.updateGeneral(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, { approvals: [] });
        }

        Audit.createFinding(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, finding)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    // Import findings from a scanner report (OpenVAS / Burp Suite)
    app.post("/api/audits/:auditId/findings/import", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var importers = require('../lib/importers');

        if (!req.body.tool || !importers.tools.includes(req.body.tool)) {
            Response.BadParameters(res, 'Missing or invalid parameter: tool (' + importers.tools.join(', ') + ')');
            return;
        }
        if (!req.body.content) {
            Response.BadParameters(res, 'Missing required parameter: content');
            return;
        }

        var settings = await Settings.getAll();
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }

        var drafts;
        try {
            drafts = importers.parseReport(req.body.tool, req.body.content, req.body.options || {});
        } catch (err) {
            Response.BadParameters(res, err.message || 'Failed to parse report');
            return;
        }

        if (drafts.length === 0) {
            Response.BadParameters(res, 'No findings could be parsed from the report');
            return;
        }

        if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate) {
            Audit.updateGeneral(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, { approvals: [] });
        }

        Audit.createFindings(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, drafts)
        .then(count => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, {message: 'Findings imported successfully', imported: count})
        })
        .catch(err => Response.Internal(res, err))
    });

    // Get finding of audit
    app.get("/api/audits/:auditId/findings/:findingId", acl.hasPermission('audits:read'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.getFinding(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id, req.params.findingId)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Update finding of audit
    app.put("/api/audits/:auditId/findings/:findingId", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var settings = await Settings.getAll();
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }
        
        var finding = {};
        // Optional parameters
        if (req.body.title) finding.title = req.body.title;
        if (!_.isNil(req.body.description)) finding.description = req.body.description;
        if (!_.isNil(req.body.observation)) finding.observation = req.body.observation;
        if (!_.isNil(req.body.remediation)) finding.remediation = req.body.remediation;
        if (req.body.remediationComplexity) finding.remediationComplexity = req.body.remediationComplexity;
        if (req.body.priority) finding.priority = req.body.priority;
        if (req.body.references) finding.references = req.body.references;
        if (!_.isNil(req.body.cvssv3)) finding.cvssv3 = req.body.cvssv3;
        if (!_.isNil(req.body.cvssv4)) finding.cvssv4 = req.body.cvssv4;
        if (!_.isNil(req.body.poc)) finding.poc = req.body.poc;
        if (!_.isNil(req.body.retestEvidence)) finding.retestEvidence = req.body.retestEvidence;
        if (req.body.retestStatus !== undefined && ['ok','ko','partial','unknown'].includes(req.body.retestStatus)) finding.retestStatus = req.body.retestStatus;
        else if (req.body.retestPassed !== undefined) finding.retestStatus = req.body.retestPassed === true ? 'ok' : req.body.retestPassed === false ? 'ko' : 'unknown'; // legacy boolean payloads
        if (!_.isNil(req.body.scope)) finding.scope = req.body.scope;
        if (req.body.status !== undefined && [0,1,2,3].includes(req.body.status)) finding.status = req.body.status;
        if (req.body.customFields) finding.customFields = req.body.customFields
        syncTaxonomy(finding, req.body);

        if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate) {
            Audit.updateGeneral(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, { approvals: [] });
        }

        Audit.updateFinding(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, req.params.findingId, finding)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');            
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    // Delete finding of audit
    app.delete("/api/audits/:auditId/findings/:findingId", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var settings = await Settings.getAll();
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }
        Audit.deleteFinding(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, req.params.findingId)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');            
            Response.Ok(res, msg);
        })
        .catch(err => Response.Internal(res, err))
    });

    // Get section of audit
    app.get("/api/audits/:auditId/sections/:sectionId", acl.hasPermission('audits:read'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.getSection(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id, req.params.sectionId)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Update section of audit
    app.put("/api/audits/:auditId/sections/:sectionId", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var settings = await Settings.getAll();
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }
        var section = {};
        if (req.body.text !== undefined) section.text = req.body.text;
        if (Array.isArray(req.body.rows)) section.rows = req.body.rows;

        if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate) {
            Audit.updateGeneral(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, { approvals: [] });
        }

        Audit.updateSection(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, req.params.sectionId, section)
        .then(msg => {
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    // Generate Report for specific audit
    app.get("/api/audits/:auditId/generate", acl.hasPermission('audits:read'), function(req, res){
        // #swagger.tags = ['Audit']

        Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id)
        .then(async audit => {
            var settings = await Settings.getAll();

            if (settings.reviews.enabled && settings.reviews.public.mandatoryReview && audit.state !== 'APPROVED') {
                Response.Forbidden(res, "Audit was not approved therefore cannot be exported.");
                return;
            }

            if (!audit.template)
                throw ({fn: 'BadParameters', message: 'Template not defined'})

            var reportDoc = await reportGenerator.generateDoc(audit);
            Response.SendFile(res, `${audit.name.replace(/[\\\/:*?"<>|]/g, "")}.${audit.template.ext || 'docx'}`, reportDoc);
        })
        .catch(err => {
            if (err.code === "ENOENT")
                Response.BadParameters(res, 'Template File not found')
            else
                Response.Internal(res, err)
        });
    });

    // Update sort options of an audit
    app.put("/api/audits/:auditId/sortfindings", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var settings = await Settings.getAll();
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }
        var update = {};
        // Optional parameters
        if (req.body.sortFindings) update.sortFindings = req.body.sortFindings;
        if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate) update.approvals = [];
        
        Audit.updateSortFindings(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, update)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    // Update finding position (oldIndex -> newIndex)
    app.put("/api/audits/:auditId/movefinding", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']

        var settings = await Settings.getAll();
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);
        if (settings.reviews.enabled && audit.state !== "EDIT") {
            Response.Forbidden(res, "The audit is not in the EDIT state and therefore cannot be edited.");
            return;
        }
        if (typeof req.body.oldIndex === 'undefined' || typeof req.body.newIndex === 'undefined') {
            Response.BadParameters(res, 'Missing some required parameters: oldIndex, newIndex');
            return;
        }
        
        var move = {};
        // Required parameters
        move.oldIndex = req.body.oldIndex;
        move.newIndex = req.body.newIndex;

        if (settings.reviews.enabled && settings.reviews.private.removeApprovalsUponUpdate) {
            Audit.updateGeneral(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, { approvals: [] });
        }
        
        Audit.moveFindingPosition(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, move)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    // Give or remove a reviewer's approval to an audit
    app.put("/api/audits/:auditId/toggleApproval", acl.hasPermission('audits:review'), async function(req, res) {
        // #swagger.tags = ['Audit']

        const settings = await Settings.getAll();

        if (!settings.reviews.enabled) {
            Response.Forbidden(res, "Audit reviews are not enabled.");
            return;
        }

        Audit.findById(req.params.auditId)
        .then(audit => {
            if (audit.state !== "REVIEW" && audit.state !== "APPROVED") {
                Response.Forbidden(res, "The audit is not approvable in the current state.");
                return;
            }

            var hasApprovedBefore = false;
            var newApprovalsArray = [];
            if (audit.approvals) {
                audit.approvals.forEach((approval) => {
                    if (approval._id.toString() === req.decodedToken.id) {
                        hasApprovedBefore = true;
                    } else {
                        newApprovalsArray.push(approval);
                    }
                });
            }

            if (!hasApprovedBefore) {
                newApprovalsArray.push({
                    _id: req.decodedToken.id,
                    role: req.decodedToken.role,
                    username: req.decodedToken.username,
                    firstname: req.decodedToken.firstname,
                    lastname: req.decodedToken.lastname
                });
            }

            var update = { approvals : newApprovalsArray};
            Audit.updateApprovals(acl.isAllowed(req.decodedToken.role, 'audits:review-all'), req.params.auditId, req.decodedToken.id, update)
            .then(() => {
                io.to(req.params.auditId).emit('updateAudit');
                Response.Ok(res, "Approval updated successfully.")
            })
            .catch((err) => {
                Response.Internal(res, err);
            })
        })
        .catch((err) => {
            Response.Internal(res, err);
        })
    });

    // Sets the audit state to EDIT or REVIEW
    app.put("/api/audits/:auditId/updateReadyForReview", acl.hasPermission('audits:update'), async function(req, res) {
        // #swagger.tags = ['Audit']


        const settings = await Settings.getAll();

        if (!settings.reviews.enabled) {
            Response.Forbidden(res, "Audit reviews are not enabled.");
            return;
        }

        var update = {};
        var audit = await Audit.getAudit(acl.isAllowed(req.decodedToken.role, 'audits:read-all'), req.params.auditId, req.decodedToken.id);

        if (audit.state !== "EDIT" && audit.state !== "REVIEW") {
            Response.Forbidden(res, "The audit is not in the proper state for this action.");
            return;
        }

        if (req.body.state != undefined && (req.body.state === "EDIT" || req.body.state === "REVIEW")) update.state = req.body.state;

        if (update.state === "EDIT") {
            var newApprovalsArray = [];
            if (audit.approvals) {
                audit.approvals.forEach((approval) => {
                    if (approval._id.toString() !== req.decodedToken.id) {
                        newApprovalsArray.push(approval);
                    }
                });
                update.approvals = newApprovalsArray;
            }
        }

        Audit.updateGeneral(acl.isAllowed(req.decodedToken.role, 'audits:update-all'), req.params.auditId, req.decodedToken.id, update)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    /* ### COMMENTS ### */

    // Add a field-level comment to a finding or section
    app.post("/api/audits/:auditId/comments", acl.hasPermission('audits:comments:create'), function(req, res) {
        // #swagger.tags = ['Audit']

        if ((!req.body.findingId && !req.body.sectionId) || (req.body.findingId && req.body.sectionId)) {
            Response.BadParameters(res, 'Only set one of "findingId" or "sectionId"');
            return;
        }
        if (!req.body.fieldName) {
            Response.BadParameters(res, 'Missing required parameter: fieldName');
            return;
        }

        var comment = {};
        if (req.body.findingId) comment.findingId = req.body.findingId;
        if (req.body.sectionId) comment.sectionId = req.body.sectionId;
        comment.fieldName = req.body.fieldName;
        comment.author = req.decodedToken.id;
        comment.text = req.body.text || '';

        Audit.createComment(acl.isAllowed(req.decodedToken.role, 'audits:comments:create-all'), req.params.auditId, req.decodedToken.id, comment)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Created(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    // Update a comment (text, replies, resolved)
    app.put("/api/audits/:auditId/comments/:commentId", acl.hasPermission('audits:comments:update'), function(req, res) {
        // #swagger.tags = ['Audit']

        var comment = {};
        if (!_.isNil(req.body.text)) comment.text = req.body.text;
        if (Array.isArray(req.body.replies)) comment.replies = req.body.replies;
        if (typeof(req.body.resolved) === 'boolean') comment.resolved = req.body.resolved;

        Audit.updateComment(acl.isAllowed(req.decodedToken.role, 'audits:comments:update-all'), req.params.auditId, req.decodedToken.id, req.params.commentId, comment)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });

    // Delete a comment
    app.delete("/api/audits/:auditId/comments/:commentId", acl.hasPermission('audits:comments:delete'), function(req, res) {
        // #swagger.tags = ['Audit']

        Audit.deleteComment(acl.isAllowed(req.decodedToken.role, 'audits:comments:delete-all'), req.params.auditId, req.decodedToken.id, req.params.commentId)
        .then(msg => {
            io.to(req.params.auditId).emit('updateAudit');
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });
}
