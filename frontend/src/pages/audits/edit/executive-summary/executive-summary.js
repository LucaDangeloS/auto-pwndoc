import { nextTick } from 'vue';
import { Notify, Dialog } from 'quasar';
import _ from 'lodash';

import Breadcrumb from 'components/breadcrumb';
import BasicEditor from 'components/editor';
import TemplateHint from 'components/template-hint';

import AuditService from '@/services/audit';
import AiService from '@/services/ai';
import Utils from '@/services/utils';

import { $t } from '@/boot/i18n';

const SEVERITY_LEVELS = [
    { key: 'Critical',    field: 'criticalSummary',    colorKey: 'criticalColor' },
    { key: 'High',        field: 'highSummary',        colorKey: 'highColor' },
    { key: 'Medium',      field: 'mediumSummary',      colorKey: 'mediumColor' },
    { key: 'Low',         field: 'lowSummary',         colorKey: 'lowColor' },
    { key: 'Informative', field: 'informativeSummary', colorKey: 'noneColor' },
];

export default {
    props: {
        audit: Object,
        frontEndAuditState: Number,
        parentState: String,
        parentApprovals: Array,
    },

    components: {
        Breadcrumb,
        BasicEditor,
        TemplateHint,
    },

    data: () => ({
        auditId: null,
        executiveSummary: {
            overallRisk: '',
            summary: '',
            criticalSummary: '',
            highSummary: '',
            mediumSummary: '',
            lowSummary: '',
            informativeSummary: '',
        },
        executiveSummaryOrig: {},
        loading: false,
        aiLoadingMap: {},
        AUDIT_VIEW_STATE: Utils.AUDIT_VIEW_STATE,
        SEVERITY_LEVELS,
    }),

    computed: {
        riskOptions() {
            const colors = this.$settings?.report?.public?.cvssColors || {};
            return [
                { label: this.$t('critical'),    value: 'Critical',    color: colors.criticalColor || '#212121' },
                { label: this.$t('high'),        value: 'High',        color: colors.highColor     || '#fe0000' },
                { label: this.$t('medium'),      value: 'Medium',      color: colors.mediumColor   || '#f9a009' },
                { label: this.$t('low'),         value: 'Low',         color: colors.lowColor      || '#008000' },
                { label: this.$t('informative'), value: 'Informative', color: colors.noneColor     || '#4a86e8' },
            ];
        },

        selectedRiskOption() {
            return this.riskOptions.find(o => o.value === this.executiveSummary.overallRisk) || null;
        },

        presentSeverities() {
            if (!this.audit || !this.audit.findings) return new Set();
            const present = new Set();
            for (const finding of this.audit.findings) {
                const { severity } = this._findingSeverityAndScore(finding);
                present.add(severity);
            }
            return present;
        },

        severityColor() {
            const colors = this.$settings?.report?.public?.cvssColors || {};
            return {
                Critical:    colors.criticalColor || '#212121',
                High:        colors.highColor     || '#fe0000',
                Medium:      colors.mediumColor   || '#f9a009',
                Low:         colors.lowColor      || '#008000',
                Informative: colors.noneColor     || '#4a86e8',
            };
        },

        findingsDigest() {
            if (!this.audit || !this.audit.findings) return '';
            return this.audit.findings
                .map(f => this._findingDigestLine(f))
                .join('\n');
        },

        auditName() {
            return this.audit ? (this.audit.name || '') : '';
        },
    },

    mounted() {
        this.auditId = this.$route.params.auditId;
        this.getExecutiveSummary();
        this.$socket.emit('menu', { menu: 'general', room: this.auditId });
        document.addEventListener('keydown', this._listener, false);
    },

    beforeUnmount() {
        document.removeEventListener('keydown', this._listener, false);
    },

    beforeRouteLeave(to, from, next) {
        Utils.syncEditors(this.$refs);
        if (_.isEqual(this.executiveSummary, this.executiveSummaryOrig)) {
            next();
        } else {
            Dialog.create({
                title: $t('msg.thereAreUnsavedChanges'),
                message: $t('msg.doYouWantToLeave'),
                ok: { label: $t('btn.confirm'), color: 'negative' },
                cancel: { label: $t('btn.cancel'), color: 'white' },
            }).onOk(() => next());
        }
    },

    methods: {
        _listener(e) {
            if ((window.navigator.platform.match('Mac') ? e.metaKey : e.ctrlKey) && e.keyCode === 83) {
                e.preventDefault();
                if (this.frontEndAuditState === this.AUDIT_VIEW_STATE.EDIT &&
                    this.$route.name === 'executiveSummary') {
                    this.save();
                }
            }
        },

        getExecutiveSummary() {
            this.loading = true;
            AuditService.getAuditGeneral(this.auditId)
                .then(res => {
                    const data = res.data.datas;
                    if (data.executiveSummary) {
                        this.executiveSummary = {
                            overallRisk:        data.executiveSummary.overallRisk        || '',
                            summary:            data.executiveSummary.summary            || '',
                            criticalSummary:    data.executiveSummary.criticalSummary    || '',
                            highSummary:        data.executiveSummary.highSummary        || '',
                            mediumSummary:      data.executiveSummary.mediumSummary      || '',
                            lowSummary:         data.executiveSummary.lowSummary         || '',
                            informativeSummary: data.executiveSummary.informativeSummary || '',
                        };
                    }
                    this.executiveSummaryOrig = _.cloneDeep(this.executiveSummary);
                })
                .catch(err => console.error(err))
                .finally(() => { this.loading = false; });
        },

        save() {
            Utils.syncEditors(this.$refs);
            nextTick(() => {
                AuditService.updateAuditGeneral(this.auditId, { executiveSummary: this.executiveSummary })
                    .then(() => {
                        this.executiveSummaryOrig = _.cloneDeep(this.executiveSummary);
                        Notify.create({
                            message: $t('msg.auditUpdateOk'),
                            color: 'positive',
                            textColor: 'white',
                            position: 'top-right',
                        });
                    })
                    .catch(err => {
                        Notify.create({
                            message: err.response?.data?.datas || $t('msg.errorOccurred'),
                            color: 'negative',
                            textColor: 'white',
                            position: 'top-right',
                        });
                    });
            });
        },

        _findingSeverityAndScore(f) {
            const cvssVersion = this.$settings?.report?.public?.defaultCvssVersion || '3.1';
            let severity = 'Informative';
            let score = null;
            if (cvssVersion === '4.0' && f.cvssv4) {
                const cvss = window.CVSS40 ? window.CVSS40.calculateCVSSFromVector(f.cvssv4) : null;
                if (cvss && cvss.success) {
                    severity = cvss.baseSeverity || 'Informative';
                    score = cvss.baseMetricScore;
                }
            } else {
                const cvss = CVSS31 ? CVSS31.calculateCVSSFromVector(f.cvssv3) : { success: false };
                if (cvss.success) {
                    severity = cvss.baseSeverity || 'Informative';
                    score = cvss.baseMetricScore;
                }
            }
            if (severity === 'None') severity = 'Informative';
            return { severity, score };
        },

        _findingDigestLine(f) {
            const { severity, score } = this._findingSeverityAndScore(f);
            const scoreStr = score !== null && score !== undefined && score !== '' ? ` (CVSS: ${score})` : '';
            return `- [${severity}${scoreStr}] ${f.title || '(untitled)'}`;
        },

        aiContextFor(severity) {
            return {
                auditName: this.auditName,
                severity,
                findingsDigest: this.findingsForSeverity(severity)
                    .map(f => this._findingDigestLine(f))
                    .join('\n'),
                locale: this.audit?.language || 'en-GB',
            };
        },

        aiContextSummary() {
            return {
                auditName: this.auditName,
                findingsDigest: this.findingsDigest,
                locale: this.audit?.language || 'en-GB',
            };
        },

        findingsForSeverity(severity) {
            if (!this.audit || !this.audit.findings) return [];
            return this.audit.findings.filter(f => {
                const { severity: sev } = this._findingSeverityAndScore(f);
                if (severity === 'Informative') return sev === 'Informative';
                return sev === severity;
            });
        },

        async runAiOnEditor(refKey, action, severity) {
            const editorRef = this.$refs[refKey];
            const editorInstance = Array.isArray(editorRef) ? editorRef[0] : editorRef;
            const hasContent = editorInstance?.editor?.getText().trim().length > 0;

            const doGenerate = async () => {
                this.aiLoadingMap = { ...this.aiLoadingMap, [refKey]: true };

                let context;
                if (action === 'executive-summary') {
                    context = this.aiContextSummary();
                } else {
                    context = this.aiContextFor(severity);
                }

                try {
                    const response = await AiService.generate({ action, fieldName: refKey, context });
                    const html = response.data?.datas?.html || '';
                    if (!html) throw new Error('Empty response from AI');

                    if (editorInstance && editorInstance.editor) {
                        editorInstance.editor.commands.setContent(html);
                    }
                } catch (err) {
                    console.error('[AI Executive Summary]', err);
                    Notify.create({
                        message: err.response?.data?.datas || err.message || $t('aiError'),
                        color: 'negative',
                        textColor: 'white',
                        position: 'top-right',
                        timeout: 4000,
                    });
                } finally {
                    this.aiLoadingMap = { ...this.aiLoadingMap, [refKey]: false };
                }
            };

            if (hasContent) {
                Dialog.create({
                    title: $t('aiSuggest'),
                    message: $t('aiGenerateOverwriteConfirm'),
                    ok: { label: $t('btn.confirm'), color: 'negative' },
                    cancel: { label: $t('btn.cancel'), color: 'white' },
                }).onOk(doGenerate);
            } else {
                await doGenerate();
            }
        },
    },
};
