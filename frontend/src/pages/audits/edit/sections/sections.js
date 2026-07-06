import { nextTick } from 'vue';
import { Notify, Dialog } from 'quasar';

import BasicEditor from 'components/editor';
import Breadcrumb from 'components/breadcrumb';

import AuditService from '@/services/audit';
import Utils from '@/services/utils';

import { $t } from '@/boot/i18n'

export default {
    props: {
        frontEndAuditState: Number,
        parentState: String,
        parentApprovals: Array,
        audit: {
            type: Object,
            required: false,
            default: () => ({})
          }
    },
    data: () => {
        return {
            auditId: null,
            sectionId: null,
            section: {
                field: "",
                name: "",
                type: "text",
                text: "",
                rows: []
            },
            sectionOrig: {},
            AUDIT_VIEW_STATE: Utils.AUDIT_VIEW_STATE,
            checklistColumns: [
                {name: 'label',  label: $t('checklistRowLabel'), field: 'label',  align: 'left',   style: 'width: 46%'},
                {name: 'status', label: $t('checklistStatus'),   field: 'status', align: 'center', style: 'width: 260px'},
                {name: 'note',   label: $t('checklistNote'),     field: 'note',   align: 'left'}
            ],
            statusOptions: [
                {label: $t('checklistStatusUntested'), value: 'untested', color: 'grey'},
                {label: $t('checklistStatusPass'),     value: 'pass',     color: 'positive'},
                {label: $t('checklistStatusFail'),     value: 'fail',     color: 'negative'},
                {label: $t('checklistStatusNa'),       value: 'na',       color: 'warning'}
            ]
        }
    },

    components: {
        BasicEditor,
        Breadcrumb
    },

    mounted: function() {
        this.auditId = this.$route.params.auditId;
        this.sectionId = this.$route.params.sectionId;
        this.getSection();

        this.$socket.emit('menu', {menu: 'editSection', section: this.sectionId, room: this.auditId});

        document.addEventListener('keydown', this._listener, false)
    },

    destroyed: function() {
        document.removeEventListener('keydown', this._listener, false)
    },

    beforeRouteLeave (to, from , next) {
        Utils.syncEditors(this.$refs)
        if (this.unsavedChanges()) {
            Dialog.create({
            title: $t('msg.thereAreUnsavedChanges'),
            message: $t('msg.doYouWantToLeave'),
            ok: {label: $t('btn.confirm'), color: 'negative'},
            cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => next())
        }
        else
            next()
    },

    beforeRouteUpdate (to, from , next) {
        Utils.syncEditors(this.$refs)
        if (this.unsavedChanges()) {
            Dialog.create({
            title: $t('msg.thereAreUnsavedChanges'),
            message: $t('msg.doYouWantToLeave'),
            ok: {label: $t('btn.confirm'), color: 'negative'},
            cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => next())
        }
        else
            next()
    },

    methods: {
        _listener: function(e) {
            if ((window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey) && e.keyCode == 83) {
                e.preventDefault();
                if (this.frontEndAuditState === this.AUDIT_VIEW_STATE.EDIT &&
                    this.$route.name === 'editSection' &&
                    this.$route.params.sectionId === this.sectionId)
                    this.updateSection();
            }
        },

        getSection: function() {
            AuditService.getSection(this.auditId, this.sectionId)
            .then((data) => {
                this.section = data.data.datas;
                this.normalizeChecklistRows();
                this.sectionOrig = this.$_.cloneDeep(this.section);
                nextTick(() => {
                    Utils.syncEditors(this.$refs)
                })
            })
            .catch((err) => {
                console.log(err)
            })
        },

        updateSection: function() {
            Utils.syncEditors(this.$refs)
            this.normalizeChecklistRows();
            nextTick(() => {
                AuditService.updateSection(this.auditId, this.sectionId, this.section)
                .then(() => {
                    this.sectionOrig = this.$_.cloneDeep(this.section);
                    Notify.create({
                        message: $t('msg.sectionUpdateOk'),
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
                console.error('Error in updateSection nextTick:', err);
            })
        },

        unsavedChanges: function() {
            if (!this.$_.isEqual(this.section.text, this.sectionOrig.text)) return true
            if (!this.$_.isEqual(this.section.rows, this.sectionOrig.rows)) return true
            return false
        },

        normalizeChecklistRows: function() {
            if (!this.section || this.section.type !== 'checklist') return
            if (!Array.isArray(this.section.rows)) this.section.rows = []
            this.section.rows = this.section.rows.map(row => {
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
                    path: row.path || [taxonomy.category, taxonomy.subcategory].filter(Boolean).join(' / ') || row.label || '',
                    status: row.status || 'untested',
                    note: row.note || '',
                    auto: row.auto === true
                }
            })
        },

        taxonomyPath: function(row) {
            const taxonomy = row && row.taxonomy ? row.taxonomy : {}
            return row.path || [taxonomy.type, taxonomy.category, taxonomy.subcategory].filter(Boolean).join(' › ')
        },

        statusColor: function(status) {
            if (status === 'pass') return 'positive'
            if (status === 'fail') return 'negative'
            if (status === 'na') return 'warning'
            return 'grey'
        },

        statusLabel: function(status) {
            const option = this.statusOptions.find(item => item.value === status)
            return option ? option.label : $t('checklistStatusUntested')
        },

        statusCount: function(status) {
            return (this.section.rows || []).filter(row => (row.status || 'untested') === status).length
        },

        setChecklistStatus: function(row, status) {
            row.status = status
            row.auto = false
        }
    }
}
