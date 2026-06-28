import { nextTick } from 'vue';
import { Notify, Dialog } from 'quasar';
import _ from 'lodash';

import Breadcrumb from 'components/breadcrumb';
import BasicEditor from 'components/editor';
import TemplateHint from 'components/template-hint';
import AiDiffModal from 'components/ai-diff-modal.vue';
import { applyAiResult } from 'components/ai-assistant';

import AuditService from '@/services/audit';
import Utils from '@/services/utils';
import {
    notifyError,
    notifySuccess,
} from '@/services/ai-helpers';

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
        AiDiffModal,
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
        saving: false,
        aiReviewOpen: false,
        aiReviews: [],
        aiReviewSeq: 0,
        aiErrorMessage: '',
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

        auditFindings() {
            return Array.isArray(this.audit?.findings) ? this.audit.findings : [];
        },

        presentSeverities() {
            const present = new Set();
            for (const finding of this.auditFindings) {
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

        graphTemplateHints() {
            return [
                {
                    title: this.$t('graphSeverityPie3D'),
                    useCase: this.$t('graphSeverityPie3DUseCase'),
                    templateVar: '{@findings | severityPie3D}',
                    examples: [
                        "{@findings | severityPie3D:'Risk distribution':'value'}",
                        "{@findings | severityPie3D:'Risk distribution':'percent'}",
                        "{@findings | severityPie3D:'Risk distribution':'both'}"
                    ]
                },
                {
                    title: this.$t('graphSeverityPie3DNamed'),
                    useCase: this.$t('graphSeverityPie3DNamedUseCase'),
                    templateVar: "{@findings | severityPie3D:'Risk distribution'}",
                    examples: [
                        "{@findings | severityPie3D:'Distribución de riesgo':'both'}"
                    ]
                },
                {
                    title: this.$t('graphFindingsByType'),
                    useCase: this.$t('graphFindingsByTypeUseCase'),
                    templateVar: "{@findings | barChart:'category':'Findings by type'}",
                    examples: [
                        "{@findings | barChart:'category':'Findings by type':'value'}",
                        "{@findings | barChart:'category':'Findings by type':'percent'}",
                        "{@findings | barChart:'category':'Findings by type':'both'}"
                    ]
                },
                {
                    title: this.$t('graphFindingsBySeverity'),
                    useCase: this.$t('graphFindingsBySeverityUseCase'),
                    templateVar: "{@findings | barChart:'cvss.baseSeverity':'Findings by severity'}",
                    examples: [
                        "{@findings | barChart:'cvss.baseSeverity':'Findings by severity':'both'}"
                    ]
                }
            ];
        },

        findingsDigest() {
            return this.auditFindings
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
            this.saving = true;
            nextTick(() => {
                AuditService.updateAuditGeneral(this.auditId, { executiveSummary: this.executiveSummary })
                    .then(() => {
                        this.executiveSummaryOrig = _.cloneDeep(this.executiveSummary);
                        notifySuccess('msg.auditUpdateOk');
                    })
                    .catch(err => {
                        notifyError(err, 'msg.errorOccurred');
                    })
                    .finally(() => {
                        this.saving = false;
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
            const description = this._plainText(f.description).slice(0, 800);
            const descriptionLine = description ? `\n  Description: ${description}` : '';
            return `- [${severity}${scoreStr}] ${f.title || $t('untitled')}${descriptionLine}`;
        },

        _plainText(html) {
            if (!html) return '';
            const container = document.createElement('div');
            container.innerHTML = html;
            return (container.textContent || '').replace(/\s+/g, ' ').trim();
        },

        aiContextFor(severity) {
            const findings = this.findingsForSeverity(severity);
            return {
                auditName: this.auditName,
                severity,
                severityCount: findings.length,
                severityPrefix: this.severitySummaryPrefix(severity),
                overallRisk: this.executiveSummary.overallRisk || '',
                findingsDigest: findings
                    .map(f => this._findingDigestLine(f))
                    .join('\n'),
                auditContext: this.audit?.summary || '',
                locale: this.audit?.language || 'en-GB',
            };
        },

        aiContextSummary() {
            return {
                auditName: this.auditName,
                overallRisk: this.executiveSummary.overallRisk || '',
                findingsDigest: this.findingsDigest,
                auditContext: this.audit?.summary || '',
                locale: this.audit?.language || 'en-GB',
            };
        },

        findingsForSeverity(severity) {
            return this.auditFindings.filter(f => {
                const { severity: sev } = this._findingSeverityAndScore(f);
                if (severity === 'Informative') return sev === 'Informative';
                return sev === severity;
            });
        },

        severitySummaryPrefix(severity) {
            const count = this.findingsForSeverity(severity).length;
            const locale = this.audit?.language || this.$i18n?.locale || 'en-US';
            if (String(locale).toLowerCase().startsWith('es')) {
                const label = this._severityLabelForPrefix(severity, 'es');
                const noun = count === 1 ? 'vulnerabilidad' : 'vulnerabilidades';
                const verb = count === 1 ? 'ha' : 'han';
                const connector = count === 1 ? 'relacionada con' : 'relacionadas con';
                return `Se ${verb} detectado ${count} ${noun} de severidad ${label}, ${connector}`;
            }
            if (String(locale).toLowerCase().startsWith('de')) {
                const label = this._severityLabelForPrefix(severity, 'de');
                const noun = count === 1 ? 'Schwachstelle' : 'Schwachstellen';
                const verb = count === 1 ? 'wurde' : 'wurden';
                return `Es ${verb} ${count} ${noun} mit Schweregrad ${label} festgestellt, im Zusammenhang mit`;
            }
            const label = this._severityLabelForPrefix(severity, 'en');
            const noun = count === 1 ? 'vulnerability' : 'vulnerabilities';
            const verb = count === 1 ? 'was' : 'were';
            return `${count} ${label} severity ${noun} ${verb} detected, related to`;
        },

        _severityLabelForPrefix(severity, locale) {
            const key = String(severity || '').toLowerCase();
            const labels = {
                es: {
                    critical: 'crítica',
                    high: 'alta',
                    medium: 'media',
                    low: 'baja',
                    informative: 'informativa'
                },
                de: {
                    critical: 'kritisch',
                    high: 'hoch',
                    medium: 'mittel',
                    low: 'niedrig',
                    informative: 'informativ'
                },
                en: {
                    critical: 'critical',
                    high: 'high',
                    medium: 'medium',
                    low: 'low',
                    informative: 'informative'
                }
            };
            if (labels[locale] && labels[locale][key]) return labels[locale][key];
            const translated = this.$t(key);
            return String(translated || key).toLowerCase();
        },

        aiReviewTitle(fieldName, action) {
            const actionLabel = action === 'complete'
                ? this.$t('aiComplete')
                : action === 'rewrite'
                    ? this.$t('aiRewrite')
                    : this.$t('aiGenerate');
            if (fieldName === 'executiveSummary') return `${this.$t('executiveSummaryText')} - ${actionLabel}`;
            const level = this.SEVERITY_LEVELS.find(item => item.field === fieldName);
            return level
                ? `${this.$t(level.key.toLowerCase())} ${this.$t('aiPromptSectionSeveritySummary')} - ${actionLabel}`
                : `${this.$t('aiReviewTitle')} - ${actionLabel}`;
        },

        setAiReviewOpen(value) {
            this.aiReviewOpen = value;
            if (!value) this.aiReviews = [];
        },

        removeAiReview(id) {
            this.aiReviews = this.aiReviews.filter(review => review.id !== id);
            this.aiReviewOpen = this.aiReviews.length > 0;
        },

        handleEditorAiReview(result) {
            if (!result || !result.editor) {
                this.aiErrorMessage = $t('aiEditorUnavailable');
                notifyError(this.aiErrorMessage, 'aiError');
                return;
            }
            this.aiErrorMessage = '';
            const fieldName = result.fieldName || '';
            const reviewId = `${fieldName || 'editor'}-${Date.now()}-${++this.aiReviewSeq}`;
            this.aiReviews = [
                ...this.aiReviews,
                {
                    id: reviewId,
                    title: this.aiReviewTitle(fieldName, result.action),
                    fieldName,
                    editor: result.editor,
                    action: result.action,
                    previousHtml: result.previousHtml,
                    proposedHtml: result.proposedHtml,
                    selectionRange: result.selectionRange || null,
                    rerun: result.rerun,
                }
            ];
            this.aiReviewOpen = true;
        },

        applyAiReview(html, review = null) {
            const activeReview = review || this.aiReviews[0] || {};
            if (!activeReview.editor) return;
            try {
                applyAiResult(activeReview.editor, activeReview.action, html, activeReview.selectionRange || null);
            } catch (err) {
                this.aiErrorMessage = err.message || $t('aiError');
                notifyError(err, 'aiError');
                return;
            }
            this.removeAiReview(activeReview.id);
        },

        regenerateAi(review = null) {
            const activeReview = review || this.aiReviews[0] || {};
            this.removeAiReview(activeReview.id);
            if (typeof activeReview.rerun === 'function') activeReview.rerun();
        },
    },
};
