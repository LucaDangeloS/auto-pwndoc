import { nextTick } from 'vue';
import { Notify, Dialog } from 'quasar';

import Breadcrumb from 'components/breadcrumb';
import TextareaArray from 'components/textarea-array'
import CustomFields from 'components/custom-fields'
import TemplateHint from 'components/template-hint'

import AuditService from '@/services/audit';
import CompanyService from '@/services/company';
import CollabService from '@/services/collaborator';
import ReviewerService from '@/services/reviewer';
import TemplateService from '@/services/template';
import DataService from '@/services/data';
import Utils from '@/services/utils';

import { $t } from '@/boot/i18n'

export default {
    props: {
        frontEndAuditState: Number,
        parentState: String,
        parentApprovals: Array

    },
    data: () => {
        return {
            // Set audit ID
            auditId: null,
            // Current editing audit object
            audit: {
                creator: {},
                name: "",
                auditType: "",
                company: {},
                collaborators: [],
                reviewers: [],
                date: "",
                date_start: "",
                date_end: "",
                scope: [],
                language: "",
                template: "",
                customFields: [],
                approvals: [],
                isRetest: false
            },
            auditOrig: {},
            // List of existing Collaborators
            collaborators: [],
            // List of existing reviewers
            reviewers: [],
            // List of existing Companies
            companies: [],
            // List of filtered companies
            selectCompanies: [],
            // List of existing Templates
            templates: [],
            // List of existing Languages
            languages: [],
            // List of existing audit types
            auditTypes: [],
            // List of CustomFields
            customFields: [],
            AUDIT_VIEW_STATE: Utils.AUDIT_VIEW_STATE
        }
    },

    components: {
        Breadcrumb,
        TextareaArray,
        CustomFields,
        TemplateHint
    },

    mounted: function() {
        this.auditId = this.$route.params.auditId;
        this.getAuditGeneral();
        this.getTemplates();
        this.getLanguages();
        this.getAuditTypes();

        this.$socket.emit('menu', {menu: 'general', room: this.auditId});

        // save on ctrl+s
        // var lastSave = 0;
        document.addEventListener('keydown', this._listener, false)
    },

    destroyed: function() {
        document.removeEventListener('keydown', this._listener, false)
    },

    beforeRouteLeave (to, from , next) {
        Utils.syncEditors(this.$refs)
        if (this.$_.isEqual(this.audit, this.auditOrig))
            next();
        else {
            Dialog.create({
                title: $t('msg.thereAreUnsavedChanges'),
                message: $t('msg.doYouWantToLeave'),
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => next())
        }
    },
    methods: {
        _listener: function(e) {
            if ((window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey) && e.keyCode == 83) {
                e.preventDefault();
                // Only trigger save if we're in the general audit context
                if (this.frontEndAuditState === this.AUDIT_VIEW_STATE.EDIT && 
                    this.$route.name === 'general')
                    this.updateAuditGeneral();
            }
        },

        // Get Audit datas from uuid
        getAuditGeneral: function() {
            DataService.getCustomFields()
            .then((data) => {
                this.customFields = data.data.datas
                return AuditService.getAuditGeneral(this.auditId)
            })
            .then((data) => {
                this.audit = data.data.datas;
                this.auditOrig = this.$_.cloneDeep(this.audit);
                this.getCollaborators();
                this.getReviewers();
                this.getCompanies();
            })
            .catch((err) => {              
                console.log(err.response)
            })
        },

        // Save Audit
        updateAuditGeneral: function() {
            Utils.syncEditors(this.$refs)
            nextTick(() => {
                if (this.$refs.customfields && this.$refs.customfields.requiredFieldsEmpty()) {
                    Notify.create({
                        message: $t('msg.fieldRequired'),
                        color: 'negative',
                        textColor:'white',
                        position: 'top-right'
                    })
                    return
                }
                AuditService.updateAuditGeneral(this.auditId, this.audit)
                .then(() => {
                    this.auditOrig = this.$_.cloneDeep(this.audit);
                    Notify.create({
                        message: $t('msg.auditUpdateOk'),
                        color: 'positive',
                        textColor:'white',
                        position: 'top-right'
                    })
                })
                .catch((err) => {
                    Notify.create({
                        message: err.response.data.datas,
                        color: 'negative',
                        textColor:'white',
                        position: 'top-right'
                    })
                })
            }).catch((err) => {
                console.error('Error in updateAuditGeneral nextTick:', err);
            })
        },

        // Get Companies list
        getCompanies: function() {
            CompanyService.getCompanies()
            .then((data) => {
                this.companies = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get Collaborators list
        getCollaborators: function() {
            CollabService.getCollabs()
            .then((data) => {
                var creatorId = ""
                if (this.audit.creator)
                    creatorId = this.audit.creator._id
                this.collaborators = data.data.datas.filter(e => e._id !== creatorId)
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get Reviewers list
        getReviewers: function() {
            ReviewerService.getReviewers()
            .then((data) => {
                var creatorId = ""
                if (this.audit.creator)
                    creatorId = this.audit.creator._id
                this.reviewers = data.data.datas.filter(e => e._id !== creatorId)
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get Templates list
        getTemplates: function() {
            TemplateService.getTemplates()
            .then((data) => {
                this.templates = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get Languages list
        getLanguages: function() {
            DataService.getLanguages()
            .then((data) => {
                this.languages = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        // Get Audit types
        getAuditTypes: function() {
            DataService.getAuditTypes()
            .then((data) => {
                this.auditTypes = data.data.datas;
            })
            .catch((err) => {
                console.log(err)
            })
        },

        createSelectCompany: function(val, done) {
            var index = this.companies.findIndex(e => Utils.normalizeString(e.name) === Utils.normalizeString(val))
            if (index > -1)
                done(this.companies[index], 'add-unique')
            else
                done(val, 'add-unique')
        },
        clearCompany() {
            this.audit = this.$_.clone({...this.audit, company: null})
        },
        filterSelectCompany (val, update) {
            if (val === '') {
                update(() => this.selectCompanies = this.companies)
                return
              }
            update(() => {
                const needle = Utils.normalizeString(val)
                this.selectCompanies = this.$_.clone(this.companies.filter(v => Utils.normalizeString(v.name).indexOf(needle) > -1))
            })
        }
    }
}
