import { Dialog, Notify, uid } from 'quasar';
import draggable from 'vuedraggable'
import BasicEditor from 'components/editor';

import DataService from '@/services/data'
import Utils from '@/services/utils'
import UserService from '@/services/user'
import TemplateService from '@/services/template'
import VulnerabilityService from '@/services/vulnerability'
import TemplatesPage from '../templates/index.vue'

import { $t } from '@/boot/i18n'

function safeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (ok) resolve(); else reject(new Error('copy failed'));
        } catch (err) {
            reject(err);
        }
    });
}

function formatChecklistBulkLine(row) {
    const taxonomy = row.taxonomy || row;
    const parts = [taxonomy.type || row.type || ''];
    if (taxonomy.category || row.category) parts.push(taxonomy.category || row.category || '');
    if (taxonomy.subcategory || row.subcategory) parts.push(taxonomy.subcategory || row.subcategory || '');
    let line = parts.filter(Boolean).join(' > ');
    const code = row.code || taxonomy.code || '';
    if (code) line += ` [${code}]`;
    return line;
}

function parseChecklistBulkText(text) {
    const rows = [];
    const errors = [];
    const seen = new Set();
    const addedPrefixes = new Set();

    String(text || '').split(/\r?\n/).forEach((raw, idx) => {
        let line = raw.trim();
        if (!line || line.startsWith('#')) return;

        let code = '';
        const codeMatch = line.match(/\s*\[([^\]]+)\]\s*$/);
        if (codeMatch) {
            code = codeMatch[1].trim();
            line = line.slice(0, codeMatch.index).trim();
        }

        const parts = line.split('>').map(part => part.trim());
        const type = parts[0] || '';
        if (!type) {
            errors.push({line: idx + 1, message: $t('msg.typeRequired')});
            return;
        }

        const hierarchy = parts.slice(1).filter(Boolean);
        const leafParts = hierarchy.length ? hierarchy : [type];
        const exactKey = [type, ...hierarchy, code].join('|');
        if (seen.has(exactKey)) {
            errors.push({line: idx + 1, message: $t('msg.checklistBulkDuplicate')});
            return;
        }
        seen.add(exactKey);

        leafParts.forEach((label, hierarchyIndex) => {
            const prefixParts = hierarchy.length ? hierarchy.slice(0, hierarchyIndex + 1) : [];
            const isLeaf = hierarchyIndex === leafParts.length - 1;
            const prefixKey = [type, ...prefixParts, isLeaf ? code : ''].join('|');
            if (addedPrefixes.has(prefixKey)) return;
            addedPrefixes.add(prefixKey);

            const category = prefixParts[0] || '';
            const subcategory = prefixParts[1] || '';
            const rowCode = isLeaf ? code : '';
            rows.push({
                label,
                code: rowCode,
                taxonomy: {type, category, subcategory, code: rowCode},
                level: hierarchy.length ? hierarchyIndex : 0,
                path: prefixParts.length ? prefixParts.join(' / ') : type
            });
        });
    });

    return {rows, errors};
}

export default {

    props: {
        // 'custom' (default) shows only Custom Fields + Custom Sections
        // 'vulnerabilities' shows Languages, Vuln Types, Vuln Categories
        // 'audits' shows Audit Types
        section: {
            type: String,
            default: 'custom'
        }
    },

    data: () => {
        return {
            UserService: UserService,
            Utils: Utils,
            templates: [],

            languages: [],
            newLanguage: {locale: "", language: ""},
            editLanguages: [],
            editLanguage: false,

            auditTypes: [],
            newAuditType: {name: "", templates: [], sections: [], hidden: []},
            editAuditTypes: [],
            editAuditType: false,

            sections: [],
            newSection: {
                field: "",
                name: "",
                icon: "",
                type: "text",
                rows: [],
                checklistTaxonomyType: "",
                checklistIncludeCategories: true,
                checklistIncludeSubcategories: true,
                checklistBulkText: ""
            },
            editSections: [],
            editSection: false,
            taxonomyRows: [],
            sectionTypeOptions: [
                {label: 'Plain Text', value: 'text'},
                {label: 'Checklist', value: 'checklist'}
            ],

            errors: {locale: '', language: '', auditType: '', vulnType: '', vulnCat: '', vulnCatField: '', sectionField: '', sectionName: '', fieldLabel: '', fieldType: ''},

            selectedTab: "languages"
        }
    },

    components: {
        BasicEditor,
        draggable,
        TemplatesPage
    },

    mounted: function() {
        if (this.section === 'vulnerabilities') this.selectedTab = 'languages';
        else if (this.section === 'audits') this.selectedTab = ['audit-types', 'templates'].includes(this.$route.query.tab) ? this.$route.query.tab : 'audit-types';
        else this.selectedTab = 'custom-sections';

        this.getTemplates()
        this.getLanguages()
        this.getAuditTypes()
        this.getSections()
        this.getTaxonomy()
    },

    computed: {
        taxonomyTypeOptions() {
            return Array.from(new Set((this.taxonomyRows || []).map(row => row.type).filter(Boolean)))
            .sort()
            .map(type => ({label: type, value: type}))
        }
    },

    methods: {
        getTemplates: function() {
            TemplateService.getTemplates()
            .then((data) => {
                this.templates = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        requiredFieldsEmpty: function() {
            Object.keys(this.$refs).forEach(key => {
                if (key.startsWith('validate') && this.$refs[key]) {
                    if (Array.isArray(this.$refs[key]))
                        this.$refs[key].forEach(e => e.validate())
                    else
                        this.$refs[key].validate()
                }
            })
            if (this.selectedTab === 'languages')
                return !this.newLanguage.language || !this.newLanguage.locale
            if (this.selectedTab === 'audit-types') 
                return !this.newAuditType.name || this.newAuditType.templates.length !== this.languages.length || this.newAuditType.templates.some(e => !e)
        },

        cleanupTranslationGroups: function() {
            VulnerabilityService.cleanupTranslationGroups()
            .then((data) => {
                const result = data.data.datas || {};
                Notify.create({
                    message: $t('translationCleanupDone', {
                        groups: result.removedGroups || 0,
                        members: result.removedMembers || 0,
                        sources: result.repairedSources || 0
                    }),
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

/* ===== LANGUAGES ===== */

        // Get available languages
        getLanguages: function() {
            DataService.getLanguages()
            .then((data) => {
                this.languages = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Create Language
        createLanguage: function() {
            if (this.requiredFieldsEmpty())
                return;

            DataService.createLanguage(this.newLanguage)
            .then((data) => {
                this.newLanguage.locale = "";
                this.newLanguage.language = "";
                this.getLanguages();
                Notify.create({
                    message: 'Language created successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        // Update Languages
        updateLanguages: function() {
           const cleanedLanguages = this.editLanguages.map(l => {
               const { _uniqueId, ...rest } = l;
               return rest;
           });
           DataService.updateLanguages(cleanedLanguages)
           .then((data) => {
               this.getLanguages()
               this.editLanguage = false
               Notify.create({
                   message: 'Languages updated successfully',
                   color: 'positive',
                   textColor:'white',
                   position: 'top-right'
               })
           })
           .catch((err) => {
               Notify.create({
                   message: err.response.data.datas,
                   color: 'negative',
                   textColor: 'white',
                   position: 'top-right'
               })
           })
       },

       startEditingLanguages() {
           this.editLanguages = this.$_.cloneDeep(this.languages).map(lang => ({
               ...lang,
               _uniqueId: uid()
           }));
           this.editLanguage = true;
       },

       // Remove Language
        removeLanguage: function(locale) {
            this.editLanguages = this.editLanguages.filter(e => e.locale !== locale)
        },

/* ===== AUDIT TYPES ===== */

        // Get available audit types
        getAuditTypes: function() {
            DataService.getAuditTypes()
            .then((data) => {
                this.auditTypes = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Create Audit type
        createAuditType: function() {
            if (this.requiredFieldsEmpty())
                return

            DataService.createAuditType(this.newAuditType)
            .then((data) => {
                this.newAuditType.name = "";
                this.newAuditType.templates = [];
                this.newAuditType.sections = [];
                this.newAuditType.hidden = [];
                this.getAuditTypes();
                Notify.create({
                    message: 'Audit type created successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        // Update Audit Types
        updateAuditTypes: function() {
            const cleanedAuditTypes = this.editAuditTypes.map(at => {
                const { _uniqueId, ...rest } = at;
                return rest;
            });
            DataService.updateAuditTypes(cleanedAuditTypes)
            .then((data) => {
                this.getAuditTypes()
                this.editAuditType = false
                Notify.create({
                    message: 'Audit Types updated successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        startEditingAuditTypes() {
            this.editAuditTypes = this.$_.cloneDeep(this.auditTypes).map(at => ({
                ...at,
                _uniqueId: uid()
            }));
            this.editAuditType = true;
        },

        // Remove Audit Type
        removeAuditType: function(auditType) {
            this.editAuditTypes = this.editAuditTypes.filter(e => e.name !== auditType.name)
        },

        getTemplateOptionsLanguage: function(locale) {
            var result = []
            this.templates.forEach(e => result.push({name: e.name, locale: locale, template: e._id}))
            return result
        },

/* ===== SECTIONS ===== */

        // Get available sections
        getSections: function() {
            DataService.getSections()
            .then((data) => {
                this.sections = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        getTaxonomy: function() {
            DataService.getVulnerabilityTaxonomy()
            .then((data) => {
                this.taxonomyRows = data.data.datas || []
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Create section
        createSection: function() {
            this.cleanErrors();
            if (!this.newSection.field)
                this.errors.sectionField = "Field required";
            if (!this.newSection.name)
                this.errors.sectionName = "Name required";

            if (this.errors.sectionName || this.errors.sectionField)
                return;

            this.normalizeChecklistRows(this.newSection)
            DataService.createSection(this.newSection)
            .then(() => {
                this.newSection = {
                    field: "",
                    name: "",
                    icon: "",
                    type: "text",
                    rows: [],
                    checklistTaxonomyType: "",
                    checklistIncludeCategories: true,
                    checklistIncludeSubcategories: true,
                    checklistBulkText: ""
                }
                this.getSections();
                Notify.create({
                    message: 'Section created successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        // Update Sections
        updateSections: function() {
            Utils.syncEditors(this.$refs)
            this.editSections.forEach(section => this.normalizeChecklistRows(section))
            DataService.updateSections(this.editSections)
            .then(() => {
                this.sections = this.$_.cloneDeep(this.editSections)
                this.editSection = false
                Notify.create({
                    message: 'Sections updated successfully',
                    color: 'positive',
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        startEditingSections() {
            this.editSections = this.$_.cloneDeep(this.sections).map(s => ({
                ...s,
                checklistTaxonomyType: '',
                checklistIncludeCategories: true,
                checklistIncludeSubcategories: true,
                checklistBulkText: '',
                _uniqueId: uid()
            }));
            this.editSections.forEach(section => this.normalizeChecklistRows(section))
            this.editSection = true;
        },

        // Remove section from edit list
        removeSection: function(index) {
            this.editSections.splice(index, 1)
        },

        // Add a blank row to a section's row list (checklist type)
        addSectionRow: function(section) {
            if (!Array.isArray(section.rows)) section.rows = []
            section.rows.push({
                label: '',
                code: '',
                taxonomy: {type: '', category: '', subcategory: '', code: ''},
                level: 0,
                path: ''
            })
        },

        // Remove a row from a section's row list
        removeSectionRow: function(section, idx) {
            section.rows.splice(idx, 1)
        },

        normalizeChecklistRows: function(section) {
            if (!section || section.type !== 'checklist') return
            if (!Array.isArray(section.rows)) section.rows = []
            section.rows = section.rows.map(row => {
                const taxonomy = row.taxonomy || {}
                return {
                    label: row.label || '',
                    code: row.code || '',
                    taxonomy: {
                        type: taxonomy.type || '',
                        category: taxonomy.category || '',
                        subcategory: taxonomy.subcategory || '',
                        code: taxonomy.code || ''
                    },
                    level: Math.max(0, parseInt(row.level, 10) || 0),
                    path: row.path || [taxonomy.category, taxonomy.subcategory].filter(Boolean).join(' / ') || row.label || ''
                }
            })
        },

        checklistTaxonomyRowsForSection: function(section) {
            if (!section || !section.checklistTaxonomyType) return []
            return (this.taxonomyRows || []).filter(row => {
                if (row.type !== section.checklistTaxonomyType) return false
                const hasCat = !!row.category
                const hasSub = !!row.subcategory
                if (hasSub && section.checklistIncludeSubcategories !== false) return true
                if (hasCat && !hasSub && section.checklistIncludeCategories !== false) return true
                return !hasCat && !hasSub && section.checklistIncludeCategories === false && section.checklistIncludeSubcategories === false
            })
        },

        fillChecklistBulkFromTaxonomy: function(section) {
            const lines = this.checklistTaxonomyRowsForSection(section).map(formatChecklistBulkLine)
            section.checklistBulkText = lines.join('\n')
            if (!lines.length) {
                Notify.create({
                    message: $t('msg.checklistBulkNoRows'),
                    color: 'warning',
                    textColor: 'white',
                    position: 'top-right'
                })
            }
        },

        copyChecklistBulkFromTaxonomy: function(section) {
            this.fillChecklistBulkFromTaxonomy(section)
            if (!section.checklistBulkText) return
            safeClipboard(section.checklistBulkText)
                .then(() => {
                    Notify.create({
                        message: $t('copied'),
                        color: 'positive',
                        textColor: 'white',
                        position: 'top-right'
                    })
                })
                .catch(() => {
                    Notify.create({
                        message: $t('copyFailed'),
                        color: 'negative',
                        textColor: 'white',
                        position: 'top-right'
                    })
                })
        },

        importChecklistBulkRows: function(section) {
            const parsed = parseChecklistBulkText(section?.checklistBulkText)
            if (parsed.errors.length) {
                Notify.create({
                    message: parsed.errors.map(error => `${$t('msg.bulkErrorLine', {line: error.line})}: ${error.message}`).join('\n'),
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right',
                    multiLine: true
                })
                return
            }
            section.rows = parsed.rows
            Notify.create({
                message: $t('msg.checklistBulkImported', {count: section.rows.length}),
                color: 'positive',
                textColor: 'white',
                position: 'top-right'
            })
        },

        generateSectionRowsFromTaxonomy: function(section) {
            if (!section || !section.checklistTaxonomyType) {
                Notify.create({
                    message: $t('msg.typeRequired'),
                    color: 'warning',
                    textColor: 'white',
                    position: 'top-right'
                })
                return
            }

            DataService.generateChecklistFromTaxonomy({
                type: section.checklistTaxonomyType,
                includeCategories: section.checklistIncludeCategories !== false,
                includeSubcategories: section.checklistIncludeSubcategories !== false
            })
            .then((data) => {
                section.rows = (data.data.datas || []).map(row => ({
                    label: row.label || '',
                    code: row.code || '',
                    taxonomy: row.taxonomy || {type: '', category: '', subcategory: '', code: ''},
                    level: Math.max(0, parseInt(row.level, 10) || 0),
                    path: row.path || ''
                }))
                Notify.create({
                    message: $t('msg.checklistGenerated', {count: section.rows.length}),
                    color: 'positive',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response?.data?.datas || err.message,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        cleanErrors: function() {
            this.errors.locale = ''
            this.errors.language = ''
            this.errors.auditType = ''
            this.errors.vulnType = ''
            this.errors.vulnCat = ''
            this.errors.fieldLabel = ''
            this.errors.fieldType = ''
            this.errors.sectionField = ''
            this.errors.sectionName = ''
        }
    }
}
