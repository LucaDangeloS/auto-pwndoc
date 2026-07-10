const { isArray } = require('lodash');

module.exports = function(app) {

    var Response = require('../lib/httpResponse.js');
    var acl = require('../lib/auth').acl;
    var utils = require('../lib/utils')
    var Language = require('mongoose').model('Language');
    var AuditType = require('mongoose').model('AuditType');
    var VulnerabilityTaxonomy = require('mongoose').model('VulnerabilityTaxonomy');
    var CustomSection = require('mongoose').model('CustomSection');
    var CustomField = require('mongoose').model('CustomField');

    var _ = require('lodash')

    function normalizeChecklistRow(row) {
        var taxonomy = (row && row.taxonomy) || {};
        return {
            label: row.label,
            code: row.code || '',
            taxonomy: {
                type: taxonomy.type || '',
                category: taxonomy.category || '',
                subcategory: taxonomy.subcategory || '',
                code: taxonomy.code || ''
            },
            level: Math.max(0, parseInt(row.level, 10) || 0),
            path: row.path || ''
        }
    }

/* ===== LANGUAGES ===== */

    // Get languages list
    app.get("/api/data/languages", acl.hasPermission('languages:read'), function(req, res) {
        // #swagger.tags = ['Data']

        Language.getAll()
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Create language
    app.post("/api/data/languages", acl.hasPermission('languages:create'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!req.body.locale || !req.body.language) {
            Response.BadParameters(res, 'Missing required parameters: locale, language');
            return;
        }
        if (!utils.validFilename(req.body.language) || !utils.validFilename(req.body.locale)) {
            Response.BadParameters(res, 'language and locale value must match /^[\p{Letter}\p{Mark}0-9 \[\]\'()_-]+$/iu')
            return
        }
        
        var language = {};
        language.locale = req.body.locale;
        language.language = req.body.language;

        Language.create(language)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });
    
    // Delete Language
    app.delete("/api/data/languages/:locale", acl.hasPermission('languages:delete'), function(req, res) {
        // #swagger.tags = ['Data']

        Language.delete(req.params.locale)
        .then(msg => {
            Response.Ok(res, 'Language deleted successfully')
        })
        .catch(err => Response.Internal(res, err))
    });

    // Update Languages
    app.put("/api/data/languages", acl.hasPermission('languages:update'), function(req, res) {
        // #swagger.tags = ['Data']

        for (var i=0; i<req.body.length; i++) {
            var language = req.body[i]
            if (!language.locale || !language.language) {
                Response.BadParameters(res, 'Missing required parameters: locale, language')
                return
            }
            if (!utils.validFilename(language.language) || !utils.validFilename(language.locale)) {
                Response.BadParameters(res, 'language and locale value must match /^[\p{Letter}\p{Mark}0-9 \[\]\'()_-]+$/iu')
                return
            }
        }

        var languages = []
        req.body.forEach(e => {
            languages.push({language: e.language, locale: e.locale})
        })

        Language.updateAll(languages)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });

/* ===== AUDIT TYPES ===== */

    // Get audit types list
    app.get("/api/data/audit-types", acl.hasPermission('audit-types:read'), function(req, res) {
        // #swagger.tags = ['Data']

        AuditType.getAll()
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Create audit type
    app.post("/api/data/audit-types", acl.hasPermission('audit-types:create'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!req.body.name || !req.body.templates) {
            Response.BadParameters(res, 'Missing required parameters: name, templates');
            return;
        }
        if (!utils.validFilename(req.body.name)) {
            Response.BadParameters(res, 'name and locale value must match /^[\p{Letter}\p{Mark}0-9 \[\]\'()_-]+$/iu')
            return
        }

        var auditType = {};
        // Required parameters
        auditType.name = req.body.name;
        auditType.templates = req.body.templates;

        // Optional parameters
        if (req.body.sections) auditType.sections = req.body.sections
        if (req.body.hidden) auditType.hidden = req.body.hidden

        AuditType.create(auditType)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });
    
    // Delete audit type
    app.delete("/api/data/audit-types/:name", acl.hasPermission('audit-types:delete'), function(req, res) {
        // #swagger.tags = ['Data']

        AuditType.delete(req.params.name)
        .then(msg => {
            Response.Ok(res, 'Audit type deleted successfully')
        })
        .catch(err => Response.Internal(res, err))
    });

    // Update Audit Types
    app.put("/api/data/audit-types", acl.hasPermission('audit-types:update'), function(req, res) {
        // #swagger.tags = ['Data']

        for (var i=0; i<req.body.length; i++) {
            var auditType = req.body[i]
            if (!auditType.name || !auditType.templates) {
                Response.BadParameters(res, 'Missing required parameters: name, templates')
                return
            }
            if (!utils.validFilename(auditType.name)) {
                Response.BadParameters(res, 'name and locale value must match /^[\p{Letter}\p{Mark}0-9 \[\]\'()_-]+$/iu')
                return
            }
        }

        var auditTypes = []
        req.body.forEach(e => {
            auditTypes.push({name: e.name, templates: e.templates, sections: e.sections, hidden: e.hidden})
        })

        AuditType.updateAll(auditTypes)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });

// Legacy /api/data/vulnerability-types and /api/data/vulnerability-categories
// routes were removed in Phase 3 of the taxonomy refactor. Consumers now
// derive their data from /api/data/vulnerability-taxonomy.

/* ===== VULNERABILITY TAXONOMY ===== */
// Unified type -> category -> subcategory taxonomy. See
// backend/src/models/vulnerability-taxonomy.js. Loose semantics: vulnerabilities
// store taxonomy values as plain strings, so renames here do not cascade.

    // List all taxonomy entries
    app.get("/api/data/vulnerability-taxonomy", acl.hasPermission('vulnerability-taxonomy:read'), function(req, res) {
        // #swagger.tags = ['Data']

        VulnerabilityTaxonomy.getAll()
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Create one taxonomy entry
    app.post("/api/data/vulnerability-taxonomy", acl.hasPermission('vulnerability-taxonomy:create'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!req.body.type) {
            Response.BadParameters(res, 'Missing required parameter: type');
            return;
        }

        var entry = {
            type: req.body.type,
            category: req.body.category || '',
            subcategory: req.body.subcategory || '',
            code: req.body.code || ''
        };
        if (!_.isNil(req.body.sortValue)) entry.sortValue = req.body.sortValue;
        if (!_.isNil(req.body.sortOrder)) entry.sortOrder = req.body.sortOrder;
        if (!_.isNil(req.body.sortAuto))  entry.sortAuto  = req.body.sortAuto;

        VulnerabilityTaxonomy.create(entry)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Update one taxonomy entry by id
    app.put("/api/data/vulnerability-taxonomy/:id", acl.hasPermission('vulnerability-taxonomy:update'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!req.body.type) {
            Response.BadParameters(res, 'Missing required parameter: type');
            return;
        }

        var entry = {
            type: req.body.type,
            category: req.body.category || '',
            subcategory: req.body.subcategory || '',
            code: req.body.code || ''
        };
        if (!_.isNil(req.body.sortValue)) entry.sortValue = req.body.sortValue;
        if (!_.isNil(req.body.sortOrder)) entry.sortOrder = req.body.sortOrder;
        if (!_.isNil(req.body.sortAuto))  entry.sortAuto  = req.body.sortAuto;

        VulnerabilityTaxonomy.update(req.params.id, entry)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Delete one taxonomy entry by id
    app.delete("/api/data/vulnerability-taxonomy/:id", acl.hasPermission('vulnerability-taxonomy:delete'), function(req, res) {
        // #swagger.tags = ['Data']

        VulnerabilityTaxonomy.delete(req.params.id)
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Preview a bulk-edit text payload. Returns parsed rows + errors WITHOUT
    // mutating the database. Frontend uses this to render a confirmation
    // diff (additions / removals / kept) before the user commits.
    app.post("/api/data/vulnerability-taxonomy/parse", acl.hasPermission('vulnerability-taxonomy:read'), function(req, res) {
        // #swagger.tags = ['Data']

        if (typeof req.body.text !== 'string') {
            Response.BadParameters(res, 'Missing required parameter: text (string)');
            return;
        }

        try {
            var parsed = VulnerabilityTaxonomy.parseLines(req.body.text);
            Response.Ok(res, parsed);
        } catch (err) {
            Response.Internal(res, err);
        }
    });

    // Bulk replace the entire taxonomy collection. Body: {rows: [{type, category, subcategory, code}, ...]}
    // Sort config on type-root rows is preserved for types that appear in both old and new sets.
    app.put("/api/data/vulnerability-taxonomy", acl.hasPermission('vulnerability-taxonomy:update'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!Array.isArray(req.body.rows)) {
            Response.BadParameters(res, 'Missing required parameter: rows (array)');
            return;
        }
        for (var i = 0; i < req.body.rows.length; i++) {
            if (!req.body.rows[i] || !req.body.rows[i].type) {
                Response.BadParameters(res, 'Row ' + (i + 1) + ': type is required');
                return;
            }
        }

        VulnerabilityTaxonomy.replaceAll(req.body.rows)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Generate checklist rows from the taxonomy. Body:
    //   { type: "WSTG", includeCategories: true, includeSubcategories: true }
    // Returns rows ready to seed a `fieldType: 'checklist'` custom field:
    //   [ { label, code, taxonomy: {type, category, subcategory}, status, note } ]
    // Granularity rules (default both true):
    //   - subcategory rows when includeSubcategories
    //   - category rows when includeCategories and the type has at least one
    //     category-only row (no subcategory)
    //   - the type-root row itself only when both flags are false
    app.post("/api/data/vulnerability-taxonomy/generate-checklist", acl.hasPermission('vulnerability-taxonomy:read'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!req.body.type) {
            Response.BadParameters(res, 'Missing required parameter: type');
            return;
        }
        var type = String(req.body.type);
        var includeCategories = req.body.includeCategories !== false;
        var includeSubcategories = req.body.includeSubcategories !== false;

        VulnerabilityTaxonomy.getAll()
        .then(rows => {
            var matches = rows.filter(r => r.type === type);
            var picked = [];
            matches.forEach(r => {
                var hasCat = !!(r.category && r.category.length);
                var hasSub = !!(r.subcategory && r.subcategory.length);
                if (hasSub && includeSubcategories) picked.push(r);
                else if (hasCat && !hasSub && includeCategories) picked.push(r);
                else if (!hasCat && !hasSub && !includeCategories && !includeSubcategories) picked.push(r);
            });

            var seen = new Set();
            var seed = [];
            function addSeed(r, level, label, path, code) {
                var key = [r.type, r.category || '', r.subcategory || '', code || '', level, path].join('|');
                if (seen.has(key)) return;
                seen.add(key);
                seed.push({
                    label: label,
                    code: code || '',
                    taxonomy: { type: r.type, category: r.category || '', subcategory: r.subcategory || '', code: code || '' },
                    level: level,
                    path: path,
                    status: 'untested',
                    note: ''
                });
            }

            picked.forEach(r => {
                if (r.category && r.subcategory && includeCategories) {
                    addSeed(
                        {type: r.type, category: r.category, subcategory: '', code: ''},
                        0,
                        r.category,
                        r.category,
                        ''
                    );
                }

                var labelParts = [];
                if (r.category) labelParts.push(r.category);
                if (r.subcategory) labelParts.push(r.subcategory);
                if (labelParts.length === 0) labelParts.push(r.type);
                addSeed(
                    r,
                    r.subcategory ? 1 : 0,
                    r.subcategory || r.category || r.type,
                    labelParts.join(' / '),
                    r.code || ''
                );
            });

            Response.Ok(res, seed);
        })
        .catch(err => Response.Internal(res, err));
    });

/* ===== SECTIONS ===== */

    // Get sections list
    app.get("/api/data/sections", acl.hasPermission('sections:read'), function(req, res) {
        // #swagger.tags = ['Data']

        CustomSection.getAll()
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Create section
    app.post("/api/data/sections", acl.hasPermission('sections:create'), function(req, res) {
        // #swagger.tags = ['Data']

        if (!req.body.field || !req.body.name) {
            Response.BadParameters(res, 'Missing required parameters: field, name');
            return;
        }
        if (!utils.validFilename(req.body.field) || !utils.validFilename(req.body.name)) {
            Response.BadParameters(res, 'name and field value must match /^[\p{Letter}\p{Mark}0-9 \[\]\'()_-]+$/iu ')
            return
        }

        var section = {
            field: req.body.field,
            name:  req.body.name,
            type:  ['text', 'checklist'].includes(req.body.type) ? req.body.type : 'text',
        }
        if (req.body.icon) section.icon = req.body.icon
        if (section.type === 'checklist' && Array.isArray(req.body.rows))
            section.rows = req.body.rows.filter(r => r && r.label).map(normalizeChecklistRow)

        CustomSection.create(section)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Delete section
    app.delete("/api/data/sections/:field", acl.hasPermission('sections:delete'), function(req, res) {
        // #swagger.tags = ['Data']

        CustomSection.delete(req.params.field)
        .then(msg => Response.Ok(res, 'Section deleted successfully'))
        .catch(err => Response.Internal(res, err))
    });

    // Update sections
    app.put("/api/data/sections", acl.hasPermission('sections:update'), function(req, res) {
        // #swagger.tags = ['Data']

        for (var i = 0; i < req.body.length; i++) {
            var section = req.body[i]
            if (!section.name || !section.field) {
                Response.BadParameters(res, 'Missing required parameters: name, field')
                return
            }
            if (!utils.validFilename(section.name) || !utils.validFilename(section.field)) {
                Response.BadParameters(res, 'name and field value must match /^[\p{Letter}\p{Mark}0-9 \[\]\'()_-]+$/iu')
                return
            }
        }

        var sections = req.body.map(e => {
            var s = {
                _id:   e._id,
                name:  e.name,
                field: e.field,
                icon:  e.icon || '',
                type:  ['text', 'checklist'].includes(e.type) ? e.type : 'text',
                rows:  [],
            }
            if (s.type === 'checklist' && Array.isArray(e.rows))
                s.rows = e.rows.filter(r => r && r.label).map(normalizeChecklistRow)
            return s
        })

        CustomSection.updateAll(sections)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });

/* ===== CUSTOM FIELDS ===== */

    // Get custom fields
    app.get("/api/data/custom-fields", acl.hasPermission('custom-fields:read'), function(req, res) {
        // #swagger.tags = ['Data']

        CustomField.getAll()
        .then(msg => Response.Ok(res, msg))
        .catch(err => Response.Internal(res, err))
    })

    // Create custom field
    app.post("/api/data/custom-fields", acl.hasPermission('custom-fields:create'), function(req, res) {
        // #swagger.tags = ['Data']

        if ((!req.body.fieldType || !req.body.label || !req.body.display) && req.body.fieldType !== 'space') {
            Response.BadParameters(res, 'Missing required parameters: fieldType, label, display')
            return
        }
        if ((!utils.validFilename(req.body.fieldType) || !utils.validFilename(req.body.label)) && req.body.fieldType !== 'space') {
            Response.BadParameters(res, 'name and field value must match /^[\p{Letter}\p{Mark}0-9 \[\]\'()_-]+$/iu ')
            return
        }
        
        var customField = {}
        customField.fieldType = req.body.fieldType
        customField.label = req.body.label
        customField.display = req.body.display
        if (req.body.displaySub) customField.displaySub = req.body.displaySub
        if (req.body.size) customField.size = req.body.size
        if (req.body.offset) customField.offset = req.body.offset
        if (typeof req.body.required === 'boolean' && req.body.fieldType !== 'space') customField.required = req.body.required
        if (req.body.description) customField.description = req.body.description
        if (req.body.text) customField.text = req.body.text
        if (req.body.options) customField.options = req.body.options
        if (typeof req.body.position === 'number') customField.position = req.body.position

        CustomField.create(customField)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    })

     // Update custom fields
     app.put("/api/data/custom-fields", acl.hasPermission('custom-fields:update'), function(req, res) {
         // #swagger.tags = ['Data']

         for (var i=0; i<req.body.length; i++) {
            var customField = req.body[i]
            if ((!customField.label || !customField._id || !customField.display) && customField.fieldType !== 'space') {
                Response.BadParameters(res, 'Missing required parameters: _id, label, display')
                return
            }
            if ((!utils.validFilename(customField.label || !utils.validFilename(customField.fieldType))) && customField.fieldType !== 'space') {
                Response.BadParameters(res, 'label and fieldType value must match /^[\p{Letter}\p{Mark}0-9 \[\]\'()_-]+$/iu')
                return
            }
        }

        var customFields = []
        req.body.forEach(e => {
            var field = {_id: e._id, label: e.label, display: e.display}
            if (typeof e.size === 'number') field.size = e.size
            if (typeof e.offset === 'number') field.offset = e.offset
            if (typeof e.required === 'boolean') field.required = e.required
            if (!_.isNil(e.description)) field.description = e.description
            if (!_.isNil(e.text)) field.text = e.text
            if (isArray(e.options)) field.options = e.options
            if (typeof e.position === 'number') field.position = e.position
            customFields.push(field)
        })

        CustomField.updateAll(customFields)
        .then(msg => Response.Created(res, msg))
        .catch(err => Response.Internal(res, err))
    });

    // Delete custom field
    app.delete("/api/data/custom-fields/:fieldId", acl.hasPermission('custom-fields:delete'), function(req, res) {
        // #swagger.tags = ['Data']

        CustomField.delete(req.params.fieldId)
        .then(msg => {
            Response.Ok(res, msg)
        })
        .catch(err => Response.Internal(res, err))
    });
}
