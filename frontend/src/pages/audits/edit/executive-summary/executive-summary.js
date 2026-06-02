import { nextTick } from 'vue';
import { Notify, Dialog } from 'quasar';
import _ from 'lodash';

import Breadcrumb from 'components/breadcrumb';
import BasicEditor from 'components/editor';
import TemplateHint from 'components/template-hint';
import AiActionBtn from 'components/ai-action-btn';
import AiDiffModal from 'components/ai-diff-modal.vue';

import AuditService from '@/services/audit';
import AiService from '@/services/ai';
import Utils from '@/services/utils';
import {
    isAiEnabled,
    aiDisabledReason,
    notifyError,
    notifySuccess,
    isAbortError,
    sanitizeHtml
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
        AiActionBtn,
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
        aiLoadingMap: {},
        aiControllers: {},
        aiReviewOpen: false,
        aiReviews: [],
        aiReviewSeq: 0,
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

        aiReady() {
            return isAiEnabled(this.$settings);
        },

        aiDisabledReasonText() {
            return aiDisabledReason(this.$settings, 'generation');
        },

        anyAiInFlight() {
            return Object.values(this.aiLoadingMap).some(Boolean);
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
        this._abortAllAi();
    },

    beforeRouteLeave(to, from, next) {
        Utils.syncEditors(this.$refs);
        if (this.anyAiInFlight) {
            Dialog.create({
                title: $t('aiInFlightTitle'),
                message: $t('aiInFlightMessage'),
                ok: { label: $t('btn.confirm'), color: 'negative' },
                cancel: { label: $t('btn.cancel'), color: 'white' },
            }).onOk(() => {
                this._abortAllAi();
                next();
            }).onCancel(() => next(false));
            return;
        }
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

        _abortAllAi() {
            Object.keys(this.aiControllers).forEach((k) => {
                const controller = this.aiControllers[k];
                if (controller) {
                    try { controller.abort(); } catch (_) { /* noop */ }
                }
            });
            this.aiControllers = {};
            this.aiLoadingMap = {};
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
            return `- [${severity}${scoreStr}] ${f.title || $t('untitled')}`;
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
            return this.auditFindings.filter(f => {
                const { severity: sev } = this._findingSeverityAndScore(f);
                if (severity === 'Informative') return sev === 'Informative';
                return sev === severity;
            });
        },

        _resolveEditorInstance(refKey) {
            const ref = this.$refs[refKey];
            return Array.isArray(ref) ? ref[0] : ref;
        },

        cancelAiOnEditor(refKey) {
            const controller = this.aiControllers[refKey];
            if (controller) {
                try { controller.abort(); } catch (_) { /* noop */ }
            }
            this.aiControllers = { ...this.aiControllers, [refKey]: null };
            this.aiLoadingMap = { ...this.aiLoadingMap, [refKey]: false };
        },

        aiReviewTitle(refKey, action, severity) {
            if (action === 'executive-summary') return this.$t('executiveSummaryText');
            if (severity) return `${this.$t(severity.toLowerCase())} ${this.$t('aiPromptSectionSeveritySummary')}`;
            const level = this.SEVERITY_LEVELS.find(item => `editor_${item.field}` === refKey);
            return level ? `${this.$t(level.key.toLowerCase())} ${this.$t('aiPromptSectionSeveritySummary')}` : this.$t('aiReviewTitle');
        },

        setAiReviewOpen(value) {
            this.aiReviewOpen = value;
            if (!value) this.aiReviews = [];
        },

        removeAiReview(id) {
            this.aiReviews = this.aiReviews.filter(review => review.id !== id);
            this.aiReviewOpen = this.aiReviews.length > 0;
        },

        async runAiOnEditor(refKey, action, severity) {
            if (!this.aiReady) return;
            const editorInstance = this._resolveEditorInstance(refKey);
            if (!editorInstance) return;

            this.aiLoadingMap = { ...this.aiLoadingMap, [refKey]: true };

            const controller = new AbortController();
            this.aiControllers = { ...this.aiControllers, [refKey]: controller };

            const context = action === 'executive-summary' ? this.aiContextSummary() : this.aiContextFor(severity);

            try {
                const response = await AiService.generate({ action, fieldName: refKey, context }, controller.signal);
                const html = response.data?.datas?.html || '';
                if (!html) throw new Error($t('aiEmptyResponse'));

                const previousHtml = editorInstance && editorInstance.editor ? editorInstance.editor.getHTML() : '';
                const proposedHtml = sanitizeHtml(html);

                const reviewId = `${refKey}-${Date.now()}-${++this.aiReviewSeq}`;
                this.aiReviews = [
                    ...this.aiReviews,
                    {
                        id: reviewId,
                        title: this.aiReviewTitle(refKey, action, severity),
                        refKey,
                        action,
                        severity: severity || '',
                        previousHtml,
                        proposedHtml,
                    }
                ];
                this.aiReviewOpen = true;
            } catch (err) {
                if (isAbortError(err)) return;
                console.error('[AI Executive Summary]', err);
                const retry = () => this.runAiOnEditor(refKey, action, severity);
                notifyError(err, 'aiError', [
                    { label: $t('btn.retry'), color: 'white', noCaps: true, handler: retry }
                ]);
            } finally {
                this.aiLoadingMap = { ...this.aiLoadingMap, [refKey]: false };
                this.aiControllers = { ...this.aiControllers, [refKey]: null };
            }
        },

        applyAiReview(html, review = null) {
            const activeReview = review || this.aiReviews[0] || {};
            const refKey = activeReview.refKey;
            if (!refKey) return;
            const editorInstance = this._resolveEditorInstance(refKey);
            if (editorInstance && editorInstance.editor) {
                editorInstance.editor.commands.setContent(sanitizeHtml(html));
            }
            this.removeAiReview(activeReview.id);
        },

        regenerateAi(review = null) {
            const activeReview = review || this.aiReviews[0] || {};
            const { refKey, action, severity } = activeReview;
            this.removeAiReview(activeReview.id);
            if (refKey && action) this.runAiOnEditor(refKey, action, severity);
        },
    },
};
