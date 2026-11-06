var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var CVSS31 = require('../lib/cvsscalc31');
var CVSS40 = require('../lib/cvsscalc40');

var CompanySchema = new Schema({
    name: {type: String, required: true, unique: true},
    shortName: String,
    logo: String,
    address: String,
    postalCode: String,
    city: String

}, {timestamps: true});

/*
*** Statics ***
*/

// Get all companies
CompanySchema.statics.getAll = () => {
    return new Promise((resolve, reject) => {
        var query = Company.find();
        query.select('name shortName logo address postalCode city');
        query.exec()
        .then((rows) => {
            resolve(rows);
        })
        .catch((err) => {
            reject(err);
        })
    });
}

// Get all companies for download
CompanySchema.statics.export = () => {
    return new Promise((resolve, reject) => {
        var query = Company.find();
        query.select('name shortName logo address postalCode city -_id')
        query.exec()
        .then((rows) => {
            resolve(rows);
        })
        .catch((err) => {
            reject(err);
        })
    });
}

// Create company
CompanySchema.statics.create = (companies) => {
    return new Promise((resolve, reject) => {
        Company.insertMany(companies, {ordered: false})
        .then((rows) => {
            resolve({created: rows.length, duplicates: 0});
        })
        .catch((err) => {
            if (err.code === 11000) {
                // Always reject when there are duplicates, even if some insertions succeeded
                reject({fn: 'BadParameters', message: 'Company name already exists'});
            }
            else
                reject(err);
        })
    })
}

// Update company
CompanySchema.statics.update = (companyId, company) => {
    return new Promise((resolve, reject) => {
        var query = Company.findOneAndUpdate({_id: companyId}, company);
        query.exec()
        .then((rows) => {
            if (rows)
                resolve(rows);
            else
                reject({fn: 'NotFound', message: 'Company Id not found'});
        })
        .catch((err) => {
            if (err.code === 11000)
                reject({fn: 'BadParameters', message: 'Company name already exists'});
            else
                reject(err);
        })
    });
}

// Delete all clients
CompanySchema.statics.deleteAll = () => {
    return new Promise((resolve, reject) => {
        var query = Company.deleteMany();
        query.exec()
        .then(() => Promise.all([
            mongoose.model('Audit').updateMany({company: {$ne: null}}, {$unset: {company: 1}}),
            mongoose.model('AuditArchive').updateMany({company: {$ne: null}}, {$set: {company: null}})
        ]))
        .then(() => {
            resolve('All companies deleted successfully');
        })
        .catch((err) => {
            reject(err);
        })
    });
}

// Count audits and archived reports referencing a company
CompanySchema.statics.getUsage = async (companyId) => {
    var [audits, archives] = await Promise.all([
        mongoose.model('Audit').countDocuments({company: companyId}),
        mongoose.model('AuditArchive').countDocuments({company: companyId})
    ]);
    return {audits, archives};
}

function auditSummary(audit) {
    var severity = {critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0};
    var progress = {completed: 0, inProgress: 0, forReview: 0, improvementNeeded: 0};
    for (const finding of audit.findings || []) {
        const status = ['completed', 'inProgress', 'forReview', 'improvementNeeded'][finding.status];
        if (status) progress[status]++;
        let rating;
        try {
            const result = finding.cvssv4 ? CVSS40.calculateCVSSFromVector(finding.cvssv4) :
                finding.cvssv3 ? CVSS31.calculateCVSSFromVector(finding.cvssv3) : null;
            if (result?.success) rating = String(result.baseSeverity).toLowerCase();
        } catch (_) { /* Invalid historical vectors remain unclassified. */ }
        severity[rating === 'none' ? 'info' : rating in severity ? rating : 'unknown']++;
    }
    return {
        _id: audit._id, name: audit.name, auditType: audit.auditType, dateStart: audit.date_start,
        dateEnd: audit.date_end, createdAt: audit.createdAt, state: audit.state,
        isRetest: audit.isRetest, parentId: audit.parentId,
        findingCount: (audit.findings || []).length, severity, progress
    };
}

CompanySchema.statics.getOverview = async function(companyId, userId, options = {}) {
    const company = await this.findById(companyId).select('name shortName logo address postalCode city').lean().exec();
    if (!company) throw {fn: 'NotFound', message: 'Company not found'};
    let audits = [];
    let archives = [];
    if (options.audits) {
        const query = mongoose.model('Audit').find({company: companyId});
        if (!options.allAudits) query.or([{creator: userId}, {collaborators: userId}, {reviewers: userId}]);
        const rows = await query.select('name auditType date_start date_end createdAt state isRetest parentId findings.cvssv3 findings.cvssv4 findings.status')
            .sort({createdAt: -1}).lean().exec();
        audits = rows.map(auditSummary);
    }
    if (options.archives) archives = await mongoose.model('AuditArchive').getAll({company: companyId});
    return {company, audits, archives};
};

// Delete company (refused while audits or archived reports still reference it)
CompanySchema.statics.delete = (companyId) => {
    return new Promise((resolve, reject) => {
        Company.getUsage(companyId)
        .then(usage => {
            if (usage.audits || usage.archives)
                throw({fn: 'BadParameters', message: `Company is still used by ${usage.audits} audit(s) and ${usage.archives} archived report(s)`, usage});
            return Company.findOneAndDelete({_id: companyId}).exec();
        })
        .then((rows) => {
            if (rows)
                resolve(rows);
            else
                reject({fn: 'NotFound', message: 'Company Id not found'});
        })
        .catch((err) => {
            reject(err);
        })
    });
}

/*
*** Methods ***
*/

var Company = mongoose.model('Company', CompanySchema);
module.exports = Company;
