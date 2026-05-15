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
            newSection: {field: "", name: "", icon: "", type: "text", rows: []},
            editSections: [],
            editSection: false,
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

        // Create section
        createSection: function() {
            this.cleanErrors();
            if (!this.newSection.field)
                this.errors.sectionField = "Field required";
            if (!this.newSection.name)
                this.errors.sectionName = "Name required";

            if (this.errors.sectionName || this.errors.sectionField)
                return;

            DataService.createSection(this.newSection)
            .then(() => {
                this.newSection = {field: "", name: "", icon: "", type: "text", rows: []}
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
                _uniqueId: uid()
            }));
            this.editSection = true;
        },

        // Remove section from edit list
        removeSection: function(index) {
            this.editSections.splice(index, 1)
        },

        // Add a blank row to a section's row list (checklist type)
        addSectionRow: function(section) {
            if (!Array.isArray(section.rows)) section.rows = []
            section.rows.push({label: ''})
        },

        // Remove a row from a section's row list
        removeSectionRow: function(section, idx) {
            section.rows.splice(idx, 1)
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
