import { nextTick } from 'vue';
import { Notify, Dialog } from 'quasar';

import BasicEditor from 'components/editor';
import Breadcrumb from 'components/breadcrumb';
import CvssCalculatorUnified from 'components/cvss-calculator-unified';
import TextareaArray from 'components/textarea-array';
import SimilarVulnModal from 'components/similar-vuln-modal';
import TemplateHint from 'components/template-hint';
import AiActionBtn from 'components/ai-action-btn';
import TaxonomyPicker from 'components/taxonomy-picker';
import CommentsPanel from 'components/comments-panel';
import DraftDiff from 'components/draft-diff';
import AiAnonymizationReview from 'components/ai-anonymization-review';

import AuditService from '@/services/audit';
import DataService from '@/services/data';
import DraftRecoveryService from '@/services/draftRecovery';
import VulnService from '@/services/vulnerability';
import AiService from '@/services/ai';
import Utils from '@/services/utils';
import {
    isEmbeddingEnabled,
    isVisionEnabled,
    aiDisabledReason,
    notifyError,
    notifySuccess,
    notifyWarning,
    isAbortError
} from '@/services/ai-helpers';

import { $t } from '@/boot/i18n';

export default {
  props: {
    audit: Object,
    frontEndAuditState: Number,
    parentState: String,
    parentApprovals: Array,
  },
  data: () => {
    return {
      finding: {
        title: '',
        taxonomies: [],
        description: '',
        observation: '',
        references: [],
        status: 1,
          poc: '',
        retestEvidence: '',
        retestStatus: 'unknown',
        scope: '',
        cvssv3: '',
        cvssv4: '',
        remediationComplexity: null,
        priority: null,
        remediation: '',
      },
      localAudit: { language: '' },
      showComments: false,
      // Local draft recovery banner state
      draftRecovery: { available: false, savedAt: null, data: null },
      // Draft diff dialog (current server snapshot vs. stored draft)
      showDraftDiff: false,
      // Deep clone of the server state — used for structural dirty comparison
      findingOrig: null,
      selectedTab: 'definition',
      proofsTabVisited: false,
      retestTabVisited: false,
      detailsTabVisited: false,
      // loading: true while the finding fetch is in flight
      loading: true,
      // readyToSave: true once editors have connected and initialised
      readyToSave: false,
      // needSave: structural dirty flag driven by _.isEqual(finding, findingOrig)
      needSave: false,
      _hasUserEdited: false,
      // _baselining: suppresses the finding watcher during sync/snapshot operations
      // that mutate finding and findingOrig together (tab switches, initial load).
      _baselining: false,
      _cleanBeforeTabTransition: true,
      // _fetchDone: true once Promise.all has resolved; used by onEditorReady
      _fetchDone: false,
      deleting: false,
      AUDIT_VIEW_STATE: Utils.AUDIT_VIEW_STATE,
      similarVulnModalOpen: false,
      similarVulnResults: [],
      similarVulnLoading: false,
      similarVulnError: '',
      similarVulnIsProofMode: false,
      proofVisionSummary: '',
      proofImageDescriptions: [],
      proofOverwriteFilledFields: true,
      proofCompletionSteps: {
        analyze: 'pending',
        generate: 'pending',
        search: 'pending',
      },
      cvssCalculatorKey: 0,
      _similarController: null,
      // "Review anonymized input before sending" popup state for the
      // complete-from-proof flow (mirrors the per-field review in editor.vue).
      proofAnonReview: {
        open: false,
        fields: {},
        resolve: null,
      },
    };
  },

  components: {
    BasicEditor,
    Breadcrumb,
    CvssCalculatorUnified,
    TextareaArray,
    SimilarVulnModal,
    TemplateHint,
    AiActionBtn,
    TaxonomyPicker,
    CommentsPanel,
    DraftDiff,
    AiAnonymizationReview,
  },

  watch: {
    // Structural dirty check: compare finding against the server snapshot.
    // Suppressed during baseline sync operations (_baselining flag) and before
    // initial load completes (findingOrig === null).
    finding: {
      deep: true,
      handler() {
        if (this.findingOrig === null || this._baselining) return;
        if (!this._hasUserEdited) return;
        this.needSave = !this.$_.isEqual(this.finding, this.findingOrig);
      },
    },
  },

  mounted() {
    this.auditId = this.$route.params.auditId;
    this.findingId = this.$route.params.findingId;

    // initCustomFieldsForFinding() runs only when both have resolved.
    this._fetchFindingData();

    this.getAudit();

    DraftRecoveryService.purgeOld();

    this.$socket.emit('menu', {
      menu: 'editFinding',
      finding: this.findingId,
      room: this.auditId,
    });

    document.addEventListener('keydown', this._listener, false);
  },

  beforeUnmount() {
    document.removeEventListener('keydown', this._listener, false);
    this._abortAllAi();
  },

  beforeRouteLeave(to, from, next) {
    if (this.deleting) {
      next();
      return;
    }

    // Only sync editors if they are fully initialised — avoids flushing
    // empty strings from editors that haven't connected yet.
    if (!this.loading) this._syncEditorsForDirtyCheck();

    if (this.loading) {
      // Data still loading — block navigation to prevent saving an empty state.
      Notify.create({
        message: $t('msg.findingLoading'),
        color: 'warning',
        textColor: 'white',
        position: 'top-right',
        timeout: 1500,
      });
      next(false);
      return;
    }

    if (this.unsavedChanges()) {
      Dialog.create({
        title: $t('msg.thereAreUnsavedChanges'),
        message: $t('msg.doYouWantToLeave'),
        ok: { label: $t('btn.confirm'), color: 'negative' },
        cancel: { label: $t('btn.cancel'), color: 'white' },
      }).onOk(() => next());
    } else {
      next();
    }
  },

  beforeRouteUpdate(to, from, next) {
    if (this.deleting) {
      next();
      return;
    }

    if (!this.loading) this._syncEditorsForDirtyCheck();

    if (this.loading) {
      Notify.create({
        message: $t('msg.findingLoading'),
        color: 'warning',
        textColor: 'white',
        position: 'top-right',
        timeout: 1500,
      });
      next(false);
      return;
    }

    if (this.unsavedChanges()) {
      Dialog.create({
        title: $t('msg.thereAreUnsavedChanges'),
        message: $t('msg.doYouWantToLeave'),
        ok: { label: $t('btn.confirm'), color: 'negative' },
        cancel: { label: $t('btn.cancel'), color: 'white' },
      }).onOk(() => next());
    } else {
      next();
    }
  },

  computed: {
    aiSimilarReady() {
      return isEmbeddingEnabled(this.$settings);
    },
    aiVisionReady() {
      return isVisionEnabled(this.$settings);
    },
    aiSimilarDisabledReason() {
      return aiDisabledReason(this.$settings, 'embedding');
    },
    aiVisionDisabledReason() {
      return aiDisabledReason(this.$settings, 'vision');
    },
    // Proof completion generates description/remediation through the same
    // per-field anonymization pipeline; when the "review before send" setting
    // is on and any of those fields anonymizes its input, pause for review.
    proofAnonReviewNeeded() {
      const ai = this.$settings && this.$settings.ai;
      if (!ai || !ai.anonymizeReviewBeforeSend) return false;
      const anonymized = Array.isArray(ai.anonymizedFields) ? ai.anonymizedFields : [];
      return ['description', 'remediation', 'poc'].some(f => anonymized.includes(f));
    },
    statusOptions() {
      return Utils.FINDING_STATUS.map((e) => ({
        value: e.value,
        label: this.$t(e.labelKey),
        icon: e.icon,
        color: e.color,
      }));
    },
    currentStatusMeta() {
      return Utils.getFindingStatusMeta(this.finding.status);
    },
    findingCommentCount() {
      const comments = (this.localAudit && this.localAudit.comments) || [];
      return comments.filter(c => String(c.findingId) === String(this.findingId) && !c.resolved).length;
    },
    commentFieldOptions() {
      const opts = [
        { value: 'title', label: this.$t('title') },
        { value: 'description', label: this.$t('fieldDescription') },
        { value: 'observation', label: this.$t('fieldObservation') },
        { value: 'poc', label: this.$t('fieldPoc') },
        { value: 'remediation', label: this.$t('fieldRemediation') },
      ];
      if (this.localAudit && this.localAudit.isRetest)
        opts.push({ value: 'retestEvidence', label: this.$t('fieldRetestEvidence') });
      opts.push({ value: 'general', label: this.$t('general') });
      return opts;
    },
    // Current server-side snapshot the draft would overwrite; feeds the diff dialog.
    draftDiffCurrent() {
      return this._draftSnapshot();
    },
  },

  methods: {
    findingAiContext(auditOverride = null) {
      const audit = auditOverride || this.audit || this.localAudit || {};
      return {
        findingTitle: this.finding.title,
        findingDescription: this.finding.description,
        findingPoc: this.finding.poc,
        auditContext: audit.summary || '',
        auditName: audit.name || '',
        locale: audit.language || '',
      };
    },

    _listener(e) {
      if (
        (window.navigator.platform.match('Mac') ? e.metaKey : e.ctrlKey) &&
        e.keyCode == 83
      ) {
        e.preventDefault();
        if (
          this.frontEndAuditState === this.AUDIT_VIEW_STATE.EDIT &&
          this.$route.name === 'editFinding'
        ) {
          this.updateFinding();
        }
      }
    },

    _fetchFindingData() {
      this.loading = true;
      this.findingOrig = null;
      this.needSave = false;
      this._hasUserEdited = false;

      AuditService.getFinding(this.auditId, this.findingId)
        .then((data) => {
          this.finding = data.data.datas || {};
          // Normalise text fields so empty ones are '' not undefined/null
          ['description', 'observation', 'poc', 'retestEvidence', 'scope', 'remediation'].forEach(field => {
            this.finding[field] = this.finding[field] || '';
          });
          if (!this.finding.retestStatus) this.finding.retestStatus = 'unknown';
          this.finding.references = this.finding.references || [];
          this._fetchDone = true;
          this.loading = false;
          this._checkDraft();
        })
        .catch((err) => {
          console.error('Error loading finding data:', err);
          this.loading = false;
          if (err.response && err.response.status === 404) {
            this.redirectToAvailableFinding();
          }
        });
    },

    getAudit() {
      AuditService.getAudit(this.auditId)
        .then((data) => {
          this.localAudit = data.data.datas;
        })
        .catch((err) => {
          console.log(err);
        });
    },


    updateFinding() {
      Utils.syncEditors(this.$refs);
      nextTick(() => {
        AuditService.updateFinding(this.auditId, this.findingId, this.finding)
          .then(() => {
            // Update the baseline snapshot so dirty check resets to false
            this.findingOrig = this.$_.cloneDeep(this.finding);
            this.needSave = false;
            this._hasUserEdited = false;
            this._clearDraft();
            Notify.create({
              message: $t('msg.findingUpdateOk'),
              color: 'positive',
              textColor: 'white',
              position: 'top-right',
            });
          })
          .catch((err) => {
            Notify.create({
              message: err.response.data.datas,
              color: 'negative',
              textColor: 'white',
              position: 'top-right',
            });
          });
      }).catch((err) => {
        console.error('Error in updateFinding nextTick:', err);
      });
    },

    syncEditors() {
      Utils.syncEditors(this.$refs);
    },

    markUserEdited() {
      if (this.loading || this.findingOrig === null || this._baselining) return;
      this._hasUserEdited = true;
      this.needSave = !this.$_.isEqual(this.finding, this.findingOrig);
      if (this.needSave) this._saveDraft();
    },

    // Fields that only persist on explicit Save (rich-text fields are handled by
    // the collaborative editor, so they are intentionally excluded from drafts).
    _draftSnapshot() {
      return {
        title: this.finding.title,
        references: this.finding.references,
        cvssv3: this.finding.cvssv3,
        cvssv4: this.finding.cvssv4,
        priority: this.finding.priority,
        remediationComplexity: this.finding.remediationComplexity,
        status: this.finding.status,
        retestStatus: this.finding.retestStatus,
        scope: this.finding.scope,
        taxonomies: this.finding.taxonomies,
      };
    },

    _saveDraft() {
      if (!this.findingId) return;
      DraftRecoveryService.save('finding', this.findingId, this._draftSnapshot());
    },

    _clearDraft() {
      DraftRecoveryService.clear('finding', this.findingId);
      this.draftRecovery = { available: false, savedAt: null, data: null };
    },

    // After load, offer recovery if a stored draft differs from the server copy.
    async _checkDraft() {
      if (!this.findingId) return;
      const draft = await DraftRecoveryService.load('finding', this.findingId);
      if (!draft || !draft.data) return;
      const current = this._draftSnapshot();
      if (this.$_.isEqual(draft.data, current)) {
        // Draft matches what was saved server-side; nothing to recover
        DraftRecoveryService.clear('finding', this.findingId);
        return;
      }
      this.draftRecovery = { available: true, savedAt: draft.savedAt, data: draft.data };
    },

    restoreDraft() {
      if (!this.draftRecovery.data) return;
      Object.assign(this.finding, this.draftRecovery.data);
      this._hasUserEdited = true;
      this.needSave = true;
      this.draftRecovery = { available: false, savedAt: null, data: null };
    },

    discardDraft() {
      this._clearDraft();
    },

    formatDraftDate(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    },

    beforeTabTransition() {
      this._cleanBeforeTabTransition = !this._syncEditorsForDirtyCheck();
    },

    onEditorReady(fieldName = null) {
      this.readyToSave = true;
      if (!this._fetchDone) return; // data not loaded yet — will be called again on next ready
      this._baselining = true;
      Utils.syncEditors(this.$refs);
      this.$nextTick(() => {
        if (fieldName && this.findingOrig) {
          this.findingOrig[fieldName] = this.finding[fieldName];
          this.needSave = this._hasUserEdited && !this.$_.isEqual(this.finding, this.findingOrig);
        } else {
          this.findingOrig = this.$_.cloneDeep(this.finding);
          this.needSave = false;
          this._hasUserEdited = false;
        }
        this._baselining = false;
      });
    },

    backupFinding() {
      Utils.syncEditors(this.$refs);
      VulnService.backupFinding(this.localAudit.language, this.finding)
        .then((data) => {
          Notify.create({
            message: data.data.datas,
            color: 'positive',
            textColor: 'white',
            position: 'top-right',
          });
        })
        .catch((err) => {
          Notify.create({
            message: err.response.data.datas,
            color: 'negative',
            textColor: 'white',
            position: 'top-right',
          });
        });
    },

    deleteFinding() {
      Dialog.create({
        title: $t('msg.deleteFindingConfirm'),
        message: $t('msg.deleteFindingNotice'),
        ok: { label: $t('btn.confirm'), color: 'negative' },
        cancel: { label: $t('btn.cancel'), color: 'white' },
      }).onOk(() => {
        const generalPath = `/audits/${this.auditId}/general`;
        const findings = (this.audit && this.audit.findings) || [];
        const currentIndex = findings.findIndex(e => e._id === this.findingId);
        let fallbackFinding = null;

        if (currentIndex !== -1) {
          fallbackFinding = findings[currentIndex + 1] || findings[currentIndex - 1] || null;
        } else {
          fallbackFinding = findings.find(e => e._id !== this.findingId) || null;
        }

        const nextPath = fallbackFinding ? `/audits/${this.auditId}/findings/${fallbackFinding._id}` : generalPath;
        this.deleting = true;
        AuditService.deleteFinding(this.auditId, this.findingId)
          .then(() => {
            Notify.create({
              message: $t('msg.findingDeleteOk'),
              color: 'positive',
              textColor: 'white',
              position: 'top-right',
            });
            // Mark as clean so beforeRouteLeave lets navigation through
            this.findingOrig = this.$_.cloneDeep(this.finding);
            this.needSave = false;
            this._hasUserEdited = false;
            this.$router.push(nextPath).catch(() => {
              if (nextPath !== generalPath) this.$router.push(generalPath);
            });
          })
          .catch((err) => {
            this.deleting = false;
            Notify.create({
              message: err.response.data.datas,
              color: 'negative',
              textColor: 'white',
              position: 'top-right',
            });
          });
      });
    },

    redirectToAvailableFinding() {
      const generalPath = `/audits/${this.auditId}/general`;
      const findings = (this.audit && this.audit.findings) || [];
      const fallbackFinding = findings.find(e => e._id !== this.findingId) || null;
      const nextPath = fallbackFinding ? `/audits/${this.auditId}/findings/${fallbackFinding._id}` : generalPath;

      this.deleting = true;
      this.findingOrig = this.$_.cloneDeep(this.finding);
      this.needSave = false;
      this._hasUserEdited = false;
      this.$router.push(nextPath).catch(() => {
        if (nextPath !== generalPath) this.$router.push(generalPath);
      });
    },

    // Called after each tab transition completes.
    // On first visit to proofs/retest/details tabs: sync editors (they just mounted)
    // then re-baseline findingOrig for those fields, so the first visit doesn't
    // falsely trigger the dirty flag due to editor initialisation noise.
    updateOrig() {
      // Suppress the watcher for the duration of this sync — we're bringing
      // findingOrig up to date with the editor's normalised HTML, not making
      // user edits. Without this, the watcher fires mid-mutation and sets
      // needSave = true before findingOrig is patched to match.
      this._baselining = true;

      if (this.selectedTab === 'proofs' && !this.proofsTabVisited) {
        this.finding.poc = this.finding.poc || '';
        Utils.syncEditors(this.$refs);
        if (this.findingOrig) this.findingOrig.poc = this.finding.poc;
        this.proofsTabVisited = true;
      } else if (this.selectedTab === 'retest' && !this.retestTabVisited) {
        this.finding.retestEvidence = this.finding.retestEvidence || '';
        Utils.syncEditors(this.$refs);
        if (this.findingOrig) {
          this.findingOrig.retestEvidence = this.finding.retestEvidence;
          this.findingOrig.retestStatus = this.finding.retestStatus;
        }
        this.retestTabVisited = true;
      } else if (this.selectedTab === 'details' && !this.detailsTabVisited) {
        this.finding.remediation = this.finding.remediation || '';
        Utils.syncEditors(this.$refs);
        if (this.findingOrig) this.findingOrig.remediation = this.finding.remediation;
        this.detailsTabVisited = true;
      }

      this._baselining = false;
      if (this.findingOrig !== null && this._cleanBeforeTabTransition) {
        this.findingOrig = this.$_.cloneDeep(this.finding);
        this.needSave = false;
        this._hasUserEdited = false;
      } else if (this.findingOrig !== null) {
        // Do a single authoritative recheck now that both finding and findingOrig
        // are in sync. This correctly handles subsequent tab revisits too.
        this.needSave = this._hasUserEdited && !this.$_.isEqual(this.finding, this.findingOrig);
      }
    },

    _activeLazyEditorFields() {
      if (this.selectedTab === 'proofs') return ['poc'];
      if (this.selectedTab === 'retest') return ['retestEvidence'];
      if (this.selectedTab === 'details') return ['scope', 'remediation'];
      return [];
    },

    _rebaseIdleActiveEditor() {
      if (!this.findingOrig) return;

      this._activeLazyEditorFields().forEach((fieldName) => {
        const ref = this.$refs[`basiceditor_${fieldName}`];
        if (!ref || !ref.initialeDataUpdated) return;

        if (ref.countChange === ref.countChangeAfterUpdate) {
          this.findingOrig[fieldName] = this.finding[fieldName];
        }
      });
    },

    _syncEditorsForDirtyCheck() {
      const wasDirty = this.needSave;
      Utils.syncEditors(this.$refs);

      if (!wasDirty || !this._hasUserEdited) {
        this._rebaseIdleActiveEditor();
      }

      this.needSave = this._hasUserEdited && this.findingOrig !== null && !this.$_.isEqual(this.finding, this.findingOrig);
      return this.needSave;
    },

    // Structural dirty check: sync editors first so HTML is flushed into
    // this.finding, then compare against the server baseline.
    unsavedChanges() {
      if (this.findingOrig === null) return false;
      if (!this._hasUserEdited) return false;
      return this._syncEditorsForDirtyCheck();
    },

    _abortAllAi() {
      if (this._similarController) {
        try { this._similarController.abort(); } catch (_) { /* noop */ }
        this._similarController = null;
      }
      // Close a pending anonymization review popup as a rejection so the
      // awaiting flow settles.
      if (this.proofAnonReview.resolve) this.onProofAnonReviewReject();
      this.similarVulnLoading = false;
      this._resetProofCompletionSteps();
    },

    cancelSimilarSearch() {
      this._abortAllAi();
      this.similarVulnModalOpen = false;
    },

    onSimilarModalClose() {
      this._abortAllAi();
    },

    searchSimilarVulns() {
      if (!this.aiSimilarReady) {
        notifyWarning('aiDisabledReasonEmbedding');
        return;
      }
      if (!this.finding.title) {
        notifyWarning('similarVulnNeedTitle');
        return;
      }
      Utils.syncEditors(this.$refs);
      const locale = this.localAudit.language || 'en';
      const query = [
        this.finding.title,
        this.finding.description
          ? this.finding.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          : '',
      ].filter(Boolean).join('\n').slice(0, 500);
      this.similarVulnResults = [];
      this.similarVulnError = '';
      this.similarVulnLoading = true;
      this.similarVulnIsProofMode = false;
      this.proofVisionSummary = '';
      this.proofImageDescriptions = [];
      this._abortAllAi();
      this.similarVulnLoading = true;
      this.similarVulnModalOpen = true;
      this._similarController = new AbortController();
      AiService.searchSimilar(query, locale, this._similarController.signal)
        .then((data) => {
          this.similarVulnResults = data.data.datas || [];
        })
        .catch((err) => {
          if (isAbortError(err)) return;
          this.similarVulnError = err.response?.data?.datas || $t('aiError');
        })
        .finally(() => {
          this.similarVulnLoading = false;
          this._similarController = null;
        });
    },

    applySimilarVuln(payload) {
      this.markUserEdited();
      // payload: { result, fields: ['description', ...] }
      const result = payload && payload.result ? payload.result : payload;
      const fields = (payload && Array.isArray(payload.fields)) ? payload.fields : [
        'title', 'description', 'observation', 'remediation', 'references', 'cvssv3', 'cvssv4', 'poc'
      ];
      const allowedFields = this.similarVulnIsProofMode
        ? fields.filter(field => field !== 'observation')
        : fields;
      const apply = (key) => {
        if (!allowedFields.includes(key)) return;
        if (result[key] === undefined) return;
        this.finding[key] = result[key];
      };
      apply('title');
      apply('description');
      apply('observation');
      apply('remediation');
      apply('references');
      apply('cvssv3');
      apply('cvssv4');
      apply('poc');
      if (allowedFields.includes('cvssv3') || allowedFields.includes('cvssv4')) {
        this.cvssCalculatorKey += 1;
      }
      nextTick(() => {
        ['description', 'observation', 'remediation', 'poc'].forEach((field) => {
          if (!allowedFields.includes(field)) return;
          const ref = this.$refs[`basiceditor_${field}`];
          if (ref && ref.editor && ref.editor.getHTML() !== (this.finding[field] || '')) {
            ref.editor.commands.setContent(this.finding[field] || '', false);
          }
        });
      });
      notifySuccess('similarVulnApplied');
    },

    _resetProofCompletionSteps() {
      const steps = {
        analyze: 'pending',
        generate: 'pending',
        search: 'pending',
      };
      // The anonymization pass runs server-side inside the proof analysis
      // request; show it as its own step only when it is configured.
      if (this.$settings?.ai?.visionAnonymizationEnabled) {
        steps.anonymize = 'pending';
      }
      // User review of the anonymized generation input happens between the
      // analysis and generation steps.
      if (this.proofAnonReviewNeeded) {
        steps.review = 'pending';
      }
      this.proofCompletionSteps = steps;
    },

    _setProofCompletionStep(step, status) {
      this.proofCompletionSteps = {
        ...this.proofCompletionSteps,
        [step]: status,
      };
    },

    async searchSimilarFromProofs() {
      if (!this.aiVisionReady) {
        notifyWarning('aiDisabledReasonVision');
        return;
      }
      Utils.syncEditors(this.$refs);
      const locale = this.localAudit.language || 'en';
      if (!this.finding.poc || !this.finding.poc.trim()) {
        notifyWarning('proofSearchNeedContent');
        return;
      }
      this.similarVulnResults = [];
      this.similarVulnError = '';
      this.similarVulnLoading = true;
      this.similarVulnIsProofMode = true;
      this.proofVisionSummary = '';
      this.proofImageDescriptions = [];
      this._resetProofCompletionSteps();
      this._abortAllAi();
      this.similarVulnLoading = true;
      this.similarVulnIsProofMode = true;
      this.similarVulnModalOpen = true;
      this._similarController = new AbortController();
      const payloadBase = {
        pocHtml: this.finding.poc,
        locale,
        findingTitle: this.finding.title || '',
        findingDescription: this.finding.description || '',
        findingRemediation: this.finding.remediation || '',
        findingReferences: this.finding.references || [],
        findingCvssv3: this.finding.cvssv3 || '',
        findingCvssv4: this.finding.cvssv4 || '',
        findingPoc: this.finding.poc || '',
        auditContext: (this.localAudit && this.localAudit.summary) || (this.audit && this.audit.summary) || '',
        overwriteFilledFields: this.proofOverwriteFilledFields,
      };

      try {
        this._setProofCompletionStep('analyze', 'active');
        const analysisResponse = await AiService.analyzeProofEvidence({ pocHtml: payloadBase.pocHtml }, this._similarController.signal);
        const analysis = analysisResponse.data.datas || {};
        this.proofVisionSummary = analysis.visionSummary || '';
        this.proofImageDescriptions = analysis.imageDescriptions || [];
        this._setProofCompletionStep('analyze', 'done');
        if ('anonymize' in this.proofCompletionSteps) {
          this._setProofCompletionStep('anonymize', 'done');
        }

        // "Review anonymized input before sending": preview the anonymized
        // generation context, let the user confirm/edit/reject it, and send
        // the approved values so generation uses exactly what was reviewed.
        let approvedAnonymization = null;
        let approvedVisionSummary = this.proofVisionSummary;
        if (this.proofAnonReviewNeeded) {
          this._setProofCompletionStep('review', 'active');
          const previewResponse = await AiService.anonymizePreview({
            fieldNames: ['description', 'remediation', 'poc'],
            proofCompletion: true,
            context: {
              findingTitle: payloadBase.findingTitle,
              findingDescription: payloadBase.findingDescription,
              findingPoc: payloadBase.pocHtml,
              auditContext: payloadBase.auditContext,
            },
          }, this._similarController.signal);
          const anon = previewResponse.data.datas || {};
          if (anon.anonymized) {
            const approved = await new Promise((resolve) => {
              this.proofAnonReview = {
                open: true,
                fields: { ...(anon.fields || {}), visionSummary: this.proofVisionSummary },
                resolve,
              };
            });
            if (!approved) {
              // User rejected — nothing is sent to the generation model.
              this._setProofCompletionStep('review', 'pending');
              this.similarVulnModalOpen = false;
              notifyWarning('aiAnonReviewCancelled');
              return;
            }
            // The flow may have been cancelled while the popup was open.
            if (!this._similarController || this._similarController.signal.aborted) return;
            approvedAnonymization = approved;
            if (typeof approved.visionSummary === 'string') {
              approvedVisionSummary = approved.visionSummary;
            }
          }
          this._setProofCompletionStep('review', 'done');
        }

        this._setProofCompletionStep('generate', 'active');
        const completionResponse = await AiService.completeProofFields({
          ...payloadBase,
          visionSummary: approvedVisionSummary,
          ...(approvedAnonymization
            ? { anonymizationReviewed: true, approvedAnonymization }
            : {}),
        }, this._similarController.signal);
        const completion = completionResponse.data.datas || {};
        const generated = completion.generatedResult ? [completion.generatedResult] : [];
        this._setProofCompletionStep('generate', 'done');

        this._setProofCompletionStep('search', 'active');
        const searchResponse = await AiService.searchProofSimilar({
          locale,
          findingTitle: payloadBase.findingTitle,
          findingDescription: payloadBase.findingDescription,
          findingRemediation: payloadBase.findingRemediation,
          findingPoc: payloadBase.findingPoc,
          visionSummary: this.proofVisionSummary,
        }, this._similarController.signal);
        const search = searchResponse.data.datas || {};
        this._setProofCompletionStep('search', 'done');

        this.similarVulnResults = generated.concat(search.similarResults || []);
        if (this.similarVulnResults.length > 0) {
          nextTick(() => this.onProofResultSelected(this.similarVulnResults[0]));
        }
      } catch (err) {
        if (isAbortError(err)) return;
        this.similarVulnError = err.response?.data?.datas || $t('aiError');
      } finally {
        this.similarVulnLoading = false;
        this._similarController = null;
      }
    },

    onProofResultSelected(result) {
      if (!this.similarVulnIsProofMode || !result) return;
    },

    onProofAnonReviewSend(approvedFields) {
      const resolve = this.proofAnonReview.resolve;
      this.proofAnonReview = { open: false, fields: {}, resolve: null };
      if (resolve) resolve(approvedFields);
    },

    onProofAnonReviewReject() {
      const resolve = this.proofAnonReview.resolve;
      this.proofAnonReview = { open: false, fields: {}, resolve: null };
      if (resolve) resolve(null);
    },
  },
};
