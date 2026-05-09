import { nextTick } from 'vue';
import { Notify, Dialog } from 'quasar';

import BasicEditor from 'components/editor';
import Breadcrumb from 'components/breadcrumb';
import CvssCalculatorUnified from 'components/cvss-calculator-unified';
import TextareaArray from 'components/textarea-array';
import CustomFields from 'components/custom-fields';
import SimilarVulnModal from 'components/similar-vuln-modal';
import TemplateHint from 'components/template-hint';
import AiActionBtn from 'components/ai-action-btn';

import AuditService from '@/services/audit';
import DataService from '@/services/data';
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
        vulnType: '',
        description: '',
        observation: '',
        references: [],
        status: 1,
        customFields: [],
        poc: '',
        retestEvidence: '',
        retestPassed: null,
        scope: '',
        cvssv3: '',
        cvssv4: '',
        remediationComplexity: null,
        priority: null,
        remediation: '',
      },
      localAudit: { language: '' },
      // Deep clone of the server state — used for structural dirty comparison
      findingOrig: null,
      selectedTab: 'definition',
      proofsTabVisited: false,
      retestTabVisited: false,
      detailsTabVisited: false,
      vulnTypes: [],
      filteredVulnTypes: [],
      // loading: true while either fetch (customFields or finding) is in flight
      loading: true,
      // readyToSave: true once editors have connected and initialised
      readyToSave: false,
      // needSave: structural dirty flag driven by _.isEqual(finding, findingOrig)
      needSave: false,
      // _baselining: suppresses the finding watcher during sync/snapshot operations
      // that mutate finding and findingOrig together (tab switches, initial load).
      _baselining: false,
      // _fetchDone: true once Promise.all has resolved; used by onEditorReady
      _fetchDone: false,
      AUDIT_VIEW_STATE: Utils.AUDIT_VIEW_STATE,
      similarVulnModalOpen: false,
      similarVulnResults: [],
      similarVulnLoading: false,
      similarVulnError: '',
      similarVulnIsProofMode: false,
      proofVisionSummary: '',
      proofImageDescriptions: [],
      proofGeneratedPoc: '',
      proofPocLoading: false,
      _similarController: null,
      _proofPocController: null,
      _proofPocSelectionToken: 0,
    };
  },

  components: {
    BasicEditor,
    Breadcrumb,
    CvssCalculatorUnified,
    TextareaArray,
    CustomFields,
    SimilarVulnModal,
    TemplateHint,
    AiActionBtn,
  },

  watch: {
    // Structural dirty check: compare finding against the server snapshot.
    // Suppressed during baseline sync operations (_baselining flag) and before
    // initial load completes (findingOrig === null).
    finding: {
      deep: true,
      handler() {
        if (this.findingOrig === null || this._baselining) return;
        this.needSave = !this.$_.isEqual(this.finding, this.findingOrig);
      },
    },
  },

  mounted() {
    this.auditId = this.$route.params.auditId;
    this.findingId = this.$route.params.findingId;

    // Fetch customFields and finding in parallel — no sequential dependency.
    // initCustomFieldsForFinding() runs only when both have resolved.
    this._fetchFindingData();

    this.getAudit();
    this.getVulnTypes();

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
    // Only sync editors if they are fully initialised — avoids flushing
    // empty strings from editors that haven't connected yet.
    if (!this.loading) Utils.syncEditors(this.$refs);

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
    if (!this.loading) Utils.syncEditors(this.$refs);

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
    vulnTypesLang() {
      // Taxonomy is locale-agnostic — return the full list. (The old
      // VulnerabilityType collection was per-locale; this filter is now
      // a no-op kept for callsite compatibility.)
      return this.vulnTypes;
    },
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
  },

  methods: {
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

    // Fetch customFields and finding data in parallel.
    // Both results are needed before initCustomFieldsForFinding() can run.
    _fetchFindingData() {
      this.loading = true;
      this.findingOrig = null;
      this.needSave = false;

      const customFieldsPromise = DataService.getCustomFields()
        .then((data) => {
          this.customFields = this.$_.cloneDeep(data.data.datas);
        });

      const findingPromise = AuditService.getFinding(this.auditId, this.findingId)
        .then((data) => {
          this.finding = data.data.datas || {};

          if (typeof this.finding.customFields === 'undefined') {
            this.finding.customFields = [];
          }

          // Normalise text fields so empty ones are '' not undefined/null
          ['description', 'observation', 'poc', 'retestEvidence', 'scope', 'remediation'].forEach(field => {
            this.finding[field] = this.finding[field] || '';
          });
          if (this.finding.retestPassed === undefined) this.finding.retestPassed = null;
          this.finding.references = this.finding.references || [];
        });

      Promise.all([customFieldsPromise, findingPromise])
        .then(() => {
          this._baselining = true;
          this.initCustomFieldsForFinding();
          this._baselining = false;
          // Signal that fetch is complete. The findingOrig snapshot is taken in
          // onEditorReady(), AFTER TipTap has connected and normalised the HTML,
          // so the baseline always matches what the editor actually contains.
          this._fetchDone = true;
          this.loading = false;
        })
        .catch((err) => {
          console.error('Error loading finding data:', err);
          this.loading = false;
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

    getVulnTypes() {
      // Phase 3: source from VulnerabilityTaxonomy (locale-agnostic)
      // and shape as [{name}] so existing markup keeps working.
      DataService.getVulnerabilityTaxonomy()
        .then((data) => {
          var rows = data.data.datas || [];
          var unique = Array.from(new Set(rows.map(r => r.type))).filter(Boolean).sort();
          this.vulnTypes = unique.map(t => ({ name: t }));
          this.filteredVulnTypes = this.vulnTypesLang;
        })
        .catch((err) => {
          console.log(err);
        });
    },

    filterType(val, update) {
      if (val === '') {
        update(() => {
          this.filteredVulnTypes = this.vulnTypesLang || [];
        });
        return;
      }

      update(() => {
        const needle = val.toLowerCase();
        this.filteredVulnTypes = (this.vulnTypesLang || []).filter((v) =>
          v.name.toLowerCase().includes(needle)
        );
      });
    },

    initCustomFieldsForFinding() {
      const categoryForFilter = this.finding.category || 'default';
      const languageForFilter = (this.audit && this.audit.language) || 'en';

      if (!this.finding.customFields || this.finding.customFields.length === 0) {
        const findingCustomField = this.$_.cloneDeep(
          Utils.filterCustomFields('finding', categoryForFilter, this.customFields, [], languageForFilter)
        );
        const existingKeys = new Set(findingCustomField.map(field => field.key));
        const vulnerabilityCustomField = this.$_.cloneDeep(
          Utils.filterCustomFields('vulnerability', categoryForFilter, this.customFields, [], languageForFilter)
            .filter(field => !existingKeys.has(field.key))
        );
        this.finding.customFields = [...findingCustomField, ...vulnerabilityCustomField];
      } else {
        const existingKeys = new Set(this.finding.customFields.map(field => field.key));
        const newFindingFields = this.$_.cloneDeep(
          Utils.filterCustomFields('finding', categoryForFilter, this.customFields, this.finding.customFields, languageForFilter)
        );
        const newVulnerabilityFields = this.$_.cloneDeep(
          Utils.filterCustomFields('vulnerability', categoryForFilter, this.customFields, this.finding.customFields, languageForFilter)
        ).filter(field => !existingKeys.has(field.key));
        this.finding.customFields = [...newFindingFields, ...newVulnerabilityFields];
      }
    },

    updateFinding() {
      Utils.syncEditors(this.$refs);
      nextTick(() => {
        if (
          this.$refs.customfields &&
          this.$refs.customfields.requiredFieldsEmpty()
        ) {
          Notify.create({
            message: $t('msg.fieldRequired'),
            color: 'negative',
            textColor: 'white',
            position: 'top-right',
          });
          return;
        }

        AuditService.updateFinding(this.auditId, this.findingId, this.finding)
          .then(() => {
            // Update the baseline snapshot so dirty check resets to false
            this.findingOrig = this.$_.cloneDeep(this.finding);
            this.needSave = false;
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

    // Called when the description editor fires @ready — i.e. TipTap has
    // connected to Hocuspocus, normalised the HTML, and is fully initialised.
    // This is the correct moment to snapshot findingOrig, because the normalised
    // HTML that TipTap produces is now in this.finding.description, so the
    // baseline matches what the editor actually contains.
    onEditorReady() {
      this.readyToSave = true;
      if (!this._fetchDone) return; // data not loaded yet — will be called again on next ready
      this._baselining = true;
      Utils.syncEditors(this.$refs);
      this.$nextTick(() => {
        this.findingOrig = this.$_.cloneDeep(this.finding);
        this.needSave = false;
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
            const generalPath = `/audits/${this.auditId}/general`;
            const findings = this.$parent.audit.findings || [];
            const currentIndex = findings.findIndex(e => e._id === this.findingId);
            let fallbackFinding = null;

            if (currentIndex !== -1) {
              fallbackFinding = findings[currentIndex + 1] || findings[currentIndex - 1] || null;
            } else {
              fallbackFinding = findings.find(e => e._id !== this.findingId) || null;
            }

            const nextPath = fallbackFinding ? `/audits/${this.auditId}/findings/${fallbackFinding._id}` : generalPath;
            this.$router.push(nextPath).catch(() => {
              if (nextPath !== generalPath) this.$router.push(generalPath);
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
          this.findingOrig.retestPassed = this.finding.retestPassed;
        }
        this.retestTabVisited = true;
      } else if (this.selectedTab === 'details' && !this.detailsTabVisited) {
        this.finding.remediation = this.finding.remediation || '';
        Utils.syncEditors(this.$refs);
        if (this.findingOrig) this.findingOrig.remediation = this.finding.remediation;
        this.detailsTabVisited = true;
      }

      this._baselining = false;
      // Do a single authoritative recheck now that both finding and findingOrig
      // are in sync. This correctly handles subsequent tab revisits too.
      if (this.findingOrig !== null) {
        this.needSave = !this.$_.isEqual(this.finding, this.findingOrig);
      }
    },

    // Structural dirty check: sync editors first so HTML is flushed into
    // this.finding, then compare against the server baseline.
    unsavedChanges() {
      if (this.findingOrig === null) return false;
      Utils.syncEditors(this.$refs);
      return !this.$_.isEqual(this.finding, this.findingOrig);
    },

    _abortAllAi() {
      if (this._similarController) {
        try { this._similarController.abort(); } catch (_) { /* noop */ }
        this._similarController = null;
      }
      if (this._proofPocController) {
        try { this._proofPocController.abort(); } catch (_) { /* noop */ }
        this._proofPocController = null;
      }
      this.similarVulnLoading = false;
      this.proofPocLoading = false;
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
      this.proofGeneratedPoc = '';
      this.similarVulnModalOpen = true;
      this._abortAllAi();
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
      // payload: { result, fields: ['description', ...] }
      const result = payload && payload.result ? payload.result : payload;
      const fields = (payload && Array.isArray(payload.fields)) ? payload.fields : [
        'description', 'observation', 'remediation', 'references', 'cvssv3', 'cvssv4', 'poc'
      ];
      const apply = (key) => {
        if (!fields.includes(key)) return;
        if (result[key] === undefined) return;
        this.finding[key] = result[key];
      };
      apply('description');
      apply('observation');
      apply('remediation');
      apply('references');
      apply('cvssv3');
      apply('cvssv4');
      apply('poc');
      nextTick(() => {
        Utils.syncEditors(this.$refs);
      });
      notifySuccess('similarVulnApplied');
    },

    searchSimilarFromProofs() {
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
      this.proofGeneratedPoc = '';
      this.similarVulnModalOpen = true;
      this._abortAllAi();
      this._similarController = new AbortController();
      AiService.analyzeProofs(this.finding.poc, locale, this._similarController.signal)
        .then((data) => {
          const result = data.data.datas || {};
          this.proofVisionSummary = result.visionSummary || '';
          this.proofImageDescriptions = result.imageDescriptions || [];
          this.similarVulnResults = result.similarResults || [];
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

    onProofResultSelected(result) {
      if (!this.similarVulnIsProofMode || !result) return;
      // Cancel any pending fill-proofs and bump selection token to discard stale results
      if (this._proofPocController) {
        try { this._proofPocController.abort(); } catch (_) { /* noop */ }
      }
      this._proofPocSelectionToken++;
      const myToken = this._proofPocSelectionToken;
      this.proofGeneratedPoc = '';
      this.proofPocLoading = true;
      const locale = this.localAudit.language || 'en';
      this._proofPocController = new AbortController();
      AiService.generate({
        action: 'fill-proofs',
        fieldName: 'poc',
        context: {
          findingTitle: result.title || this.finding.title,
          locale,
          vulnDescription: result.description || '',
          visionSummary: this.proofVisionSummary,
          imageDescriptions: this.proofImageDescriptions,
        },
      }, this._proofPocController.signal)
        .then((data) => {
          if (myToken !== this._proofPocSelectionToken) return; // stale
          this.proofGeneratedPoc = (data.data.datas && data.data.datas.html) || '';
        })
        .catch((err) => {
          if (myToken !== this._proofPocSelectionToken) return;
          if (isAbortError(err)) return;
          notifyError(err);
        })
        .finally(() => {
          if (myToken === this._proofPocSelectionToken) {
            this.proofPocLoading = false;
            this._proofPocController = null;
          }
        });
    },
  },
};
