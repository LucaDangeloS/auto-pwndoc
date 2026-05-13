import { api } from 'boot/axios'
export default {
    getRoles: function() {
        return  api.get(`data/roles`)
    },

    getLanguages: function() {
        return  api.get(`data/languages`)
    },

    createLanguage: function(language) {
        return  api.post(`data/languages`, language)
    },

    deleteLanguage: function(locale) {
        return  api.delete(`data/languages/${locale}`)
    },

    updateLanguages: function(languages) {
        return  api.put(`data/languages`, languages)
    },

    getAuditTypes: function() {
        return  api.get(`data/audit-types`)
    },

    createAuditType: function(auditType) {
        return  api.post(`data/audit-types`, auditType)
    },

    deleteAuditType: function(name) {
        return  api.delete(`data/audit-types/${name}`)
    },

    updateAuditTypes: function(auditTypes) {
        return  api.put(`data/audit-types`, auditTypes)
    },

    getVulnerabilityTaxonomy: function() {
        return api.get(`data/vulnerability-taxonomy`)
    },

    createVulnerabilityTaxonomy: function(entry) {
        return api.post(`data/vulnerability-taxonomy`, entry)
    },

    updateVulnerabilityTaxonomyEntry: function(id, entry) {
        return api.put(`data/vulnerability-taxonomy/${id}`, entry)
    },

    deleteVulnerabilityTaxonomy: function(id) {
        return api.delete(`data/vulnerability-taxonomy/${id}`)
    },

    parseVulnerabilityTaxonomyText: function(text) {
        return api.post(`data/vulnerability-taxonomy/parse`, { text })
    },

    replaceVulnerabilityTaxonomy: function(rows) {
        return api.put(`data/vulnerability-taxonomy`, { rows })
    },

    generateChecklistFromTaxonomy: function(payload) {
        return api.post(`data/vulnerability-taxonomy/generate-checklist`, payload)
    },

    getCustomFields: function() {
        return  api.get(`data/custom-fields`)
    },

    createCustomField: function(customField) {
        return  api.post(`data/custom-fields`, customField)
    },

    updateCustomFields: function(customFields) {
        return  api.put(`data/custom-fields/`, customFields)
    },

    deleteCustomField: function(customFieldId) {
        return  api.delete(`data/custom-fields/${customFieldId}`)
    },

    getSections: function() {
        return  api.get(`data/sections`)
    },

    createSection: function(section) {
        return  api.post(`data/sections`, section)
    },

    deleteSection: function(field) {
        return  api.delete(`data/sections/${field}`)
    },

    updateSections: function(sections) {
        return  api.put(`data/sections`, sections)
    }
}