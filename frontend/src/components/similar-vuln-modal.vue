<template>
  <q-dialog v-model="show" full-width @hide="onHide">
    <q-card class="similar-vuln-modal column no-wrap">
      <q-bar class="bg-primary text-white">
        <q-icon :name="isProofMode ? 'image_search' : 'manage_search'" />
        <span class="q-ml-sm text-body1">{{ isProofMode ? $t('proofSearchTitle') : $t('similarVulnTitle') }}</span>
        <q-space />
        <q-btn dense flat icon="close" @click="show = false">
          <q-tooltip>{{ $t('btn.close') }}</q-tooltip>
        </q-btn>
      </q-bar>

      <!-- Loading state -->
      <div v-if="loading && isProofMode" class="col flex flex-center q-pa-xl">
        <q-card flat bordered class="q-pa-lg proof-processing-card">
          <div class="row items-center q-mb-md">
            <q-spinner-gears size="42px" color="primary" class="q-mr-md" />
            <div>
              <div class="text-h6">{{ $t('proofCompletionProcessingTitle') }}</div>
              <div class="text-body2">{{ $t('proofCompletionRunning') }}</div>
            </div>
          </div>
          <q-linear-progress indeterminate color="primary" class="q-mb-md" />
          <q-list dense>
            <q-item :class="proofStepClass('analyze')">
              <q-item-section avatar>
                <q-icon v-if="proofStepDone('analyze')" name="check_circle" color="positive" size="22px" />
                <q-spinner v-else-if="proofStepActive('analyze')" size="20px" color="primary" />
                <q-icon v-else name="radio_button_unchecked" color="grey-6" size="22px" />
              </q-item-section>
              <q-item-section>{{ $t('proofCompletionStepAnalyze') }}</q-item-section>
            </q-item>
            <q-item v-if="proofSteps && proofSteps.anonymize" :class="proofStepClass('anonymize')">
              <q-item-section avatar>
                <q-icon v-if="proofStepDone('anonymize')" name="check_circle" color="positive" size="22px" />
                <q-spinner v-else-if="proofStepActive('anonymize')" size="20px" color="primary" />
                <q-icon v-else name="radio_button_unchecked" color="grey-6" size="22px" />
              </q-item-section>
              <q-item-section>{{ $t('proofCompletionStepAnonymize') }}</q-item-section>
            </q-item>
            <q-item :class="proofStepClass('generate')">
              <q-item-section avatar>
                <q-icon v-if="proofStepDone('generate')" name="check_circle" color="positive" size="22px" />
                <q-spinner v-else-if="proofStepActive('generate')" size="20px" color="secondary" />
                <q-icon v-else name="radio_button_unchecked" color="grey-6" size="22px" />
              </q-item-section>
              <q-item-section>{{ $t('proofCompletionStepGenerate') }}</q-item-section>
            </q-item>
            <q-item :class="proofStepClass('search')">
              <q-item-section avatar>
                <q-icon v-if="proofStepDone('search')" name="check_circle" color="positive" size="22px" />
                <q-spinner v-else-if="proofStepActive('search')" size="20px" color="info" />
                <q-icon v-else name="radio_button_unchecked" color="grey-6" size="22px" />
              </q-item-section>
              <q-item-section>{{ $t('proofCompletionStepSearch') }}</q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </div>
      <div v-else-if="loading" class="col flex flex-center q-pa-xl">
        <q-spinner-gears size="48px" color="primary" />
        <div class="q-ml-md text-grey-7 ai-loading">
          {{ $t('similarVulnSearching') }}
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="col flex flex-center q-pa-xl column">
        <q-icon name="error_outline" size="48px" color="negative" />
        <div class="q-mt-md text-negative text-center" style="max-width: 480px">{{ error }}</div>
        <q-btn
          class="q-mt-md"
          color="primary"
          icon="refresh"
          no-caps
          :label="$t('btn.retry')"
          @click="$emit('retry')"
        />
      </div>

      <!-- No results -->
      <div v-else-if="results.length === 0" class="col flex flex-center q-pa-xl column">
        <q-icon name="search_off" size="48px" color="grey-5" />
        <div class="q-mt-md text-grey-7 text-center">
          {{ isProofMode ? $t('proofCompletionNoResults') : $t('similarVulnNoResults') }}
        </div>

        <!-- Vision summary still useful even with zero results -->
        <div v-if="isProofMode && visionSummary" class="q-mt-lg" style="max-width: 640px; width: 100%">
          <div class="text-caption text-weight-medium text-grey-7 q-mb-xs row items-center">
            <q-icon name="visibility" size="xs" class="q-mr-xs" />
            {{ $t('proofAnalysisSummary') }}
          </div>
          <div class="diff-html-box" style="white-space: pre-wrap;">{{ visionSummary }}</div>
        </div>
      </div>

      <!-- Results + diff layout -->
      <div v-else class="col row no-wrap" style="min-height:0">
        <!-- Left panel: results list -->
        <div class="similar-vuln-list col-4 q-pa-md column no-wrap" style="border-right:1px solid rgba(0,0,0,0.12); overflow-y:auto">
          <div class="text-caption text-grey-7 q-mb-sm">{{ $t('similarVulnResultsCount', { n: results.length }) }}</div>
          <q-list separator role="listbox" :aria-label="$t('similarVulnTitle')">
            <q-item
              v-for="(r, i) in results"
              :key="r.vulnId"
              clickable
              :active="selectedIndex === i"
              active-class="bg-primary text-white"
              @click="selectResult(i)"
              class="similar-vuln-result-item rounded-borders q-mb-xs"
              role="option"
              :aria-selected="selectedIndex === i"
            >
              <q-item-section>
                <q-item-label lines="2">
                  {{ r.generatedFromProof ? $t('proofGeneratedCandidate') : (r.title || $t('untitled')) }}
                </q-item-label>
                <q-item-label v-if="!r.generatedFromProof" caption>
                  <span v-if="r.category">{{ $t('type') }}: {{ r.category }} &bull; </span>
                  <span>{{ $t('category') }}: <span v-if="r.vulnType">{{ r.vulnType }}</span><span v-else class="taxonomy-empty">-</span> &bull; </span>
                  <span class="text-weight-medium">
                    {{ $t('similarVulnDistance') }}: {{ r.distance != null ? r.distance.toFixed(3) : 'N/A' }}
                  </span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge
                  v-if="!r.generatedFromProof"
                  :color="distanceColor(r.distance)"
                  :label="distanceLabel(r.distance)"
                />
                <q-badge v-else color="secondary" :label="$t('proofGeneratedBadge')" />
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- Right panel: diff view -->
        <div class="col column no-wrap" style="min-height:0; overflow-y:auto">
          <div v-if="selected" class="col q-pa-md column no-wrap">
            <div class="row items-center q-mb-md q-pb-sm q-gutter-sm">
              <q-icon name="compare_arrows" color="primary" />
              <span class="text-subtitle2">{{ $t('similarVulnDiffTitle') }}</span>
              <q-space />
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                :label="$t('similarVulnSelectAll')"
                icon="done_all"
                @click="selectAllFields"
              />
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                :label="$t('similarVulnSelectChanged')"
                icon="filter_alt"
                @click="selectChangedFields"
              />
              <q-btn
                color="positive"
                no-caps
                unelevated
                icon="check"
                :label="$t('similarVulnApply')"
                :disable="appliedCount === 0"
                @click="applySelected"
              >
                <q-tooltip v-if="appliedCount === 0">{{ $t('similarVulnApplyHint') }}</q-tooltip>
              </q-btn>
            </div>

            <div class="text-caption text-grey-7 q-mb-md">
              {{ $t('similarVulnApplyCount', { n: appliedCount }) }}
            </div>

            <!-- Vision summary (proof mode only) -->
            <div v-if="isProofMode && visionSummary" class="diff-field-block">
              <q-expansion-item
                :label="$t('proofAnalysisSummary')"
                icon="visibility"
                dense
                header-class="text-caption text-weight-medium text-grey-7"
              >
                <div class="q-pa-sm text-caption" style="white-space: pre-wrap;">{{ visionSummary }}</div>
              </q-expansion-item>
            </div>

            <!-- Field diffs with per-field apply checkboxes -->
            <div class="diff-fields-stack column">
              <div v-for="field in diffFields" :key="field.key" class="diff-field-block">
                <div class="row items-center q-mb-xs">
                  <q-checkbox
                    v-model="applyMap[field.key]"
                    dense
                    color="positive"
                    class="q-mr-sm"
                    :aria-label="$t(field.label)"
                  />
                  <q-icon
                    :name="fieldHasChange(field.key) ? 'edit' : 'check'"
                    :color="fieldHasChange(field.key) ? 'warning' : 'positive'"
                    size="xs"
                    class="q-mr-xs"
                  />
                  <span class="text-caption text-weight-medium text-uppercase text-grey-7">{{ $t(field.label) }}</span>
                  <q-badge v-if="fieldHasChange(field.key)" color="warning" :label="$t('similarVulnChanged')" class="q-ml-sm" />
                  <q-badge v-else color="positive" outline :label="$t('similarVulnSame')" class="q-ml-sm" />
                </div>

                <!-- HTML fields (description, observation, remediation) -->
                <template v-if="field.type === 'html'">
                  <div class="diff-columns row q-col-gutter-sm">
                    <div class="col-6">
                      <div class="text-caption text-grey-6 q-mb-xs">{{ $t('similarVulnCurrent') }}</div>
                      <div class="diff-html-box" v-html="sanitize(currentFinding[field.key]) || emptyMarkup"></div>
                    </div>
                    <div class="col-6">
                      <div class="text-caption text-grey-6 q-mb-xs">{{ $t('similarVulnProposed') }}</div>
                      <div class="diff-html-box proposed" v-html="sanitize(selected[field.key]) || emptyMarkup"></div>
                    </div>
                  </div>
                </template>

                <!-- References (array of strings) -->
                <template v-else-if="field.type === 'array'">
                  <div class="diff-columns row q-col-gutter-sm">
                    <div class="col-6">
                      <div class="text-caption text-grey-6 q-mb-xs">{{ $t('similarVulnCurrent') }}</div>
                      <div class="diff-html-box">
                        <div v-if="(currentFinding[field.key] || []).length === 0" class="text-grey-5"><em>{{ $t('empty') }}</em></div>
                        <div v-else v-for="ref in currentFinding[field.key]" :key="ref" class="text-caption">{{ ref }}</div>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="text-caption text-grey-6 q-mb-xs">{{ $t('similarVulnProposed') }}</div>
                      <div class="diff-html-box proposed">
                        <div v-if="(selected[field.key] || []).length === 0" class="text-grey-5"><em>{{ $t('empty') }}</em></div>
                        <div v-else v-for="ref in selected[field.key]" :key="ref" class="text-caption">{{ ref }}</div>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- CVSS string fields -->
                <template v-else>
                  <div class="diff-columns row q-col-gutter-sm">
                    <div class="col-6">
                      <div class="text-caption text-grey-6 q-mb-xs">{{ $t('similarVulnCurrent') }}</div>
                      <div class="diff-html-box">
                        <span v-if="currentFinding[field.key]">{{ currentFinding[field.key] }}</span>
                        <em v-else class="text-grey-5">{{ $t('empty') }}</em>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="text-caption text-grey-6 q-mb-xs">{{ $t('similarVulnProposed') }}</div>
                      <div class="diff-html-box proposed">
                        <span v-if="selected[field.key]">{{ selected[field.key] }}</span>
                        <em v-else class="text-grey-5">{{ $t('empty') }}</em>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
          <div v-else class="col flex flex-center text-grey-6">
            <div class="text-center">
              <q-icon name="arrow_back" size="32px" class="q-mb-sm" />
              <div>{{ $t('similarVulnSelectResult') }}</div>
            </div>
          </div>
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue';
import { sanitizeHtml } from '@/services/ai-helpers';

const DEFAULT_DIFF_FIELDS = [
  { key: 'title',       label: 'title',                type: 'text'  },
  { key: 'description', label: 'description',          type: 'html'  },
  { key: 'observation',  label: 'observation',          type: 'html'  },
  { key: 'remediation',  label: 'remediation',          type: 'html'  },
  { key: 'references',   label: 'references',           type: 'array' },
  { key: 'cvssv3',       label: 'cvssScore',            type: 'text'  },
  { key: 'cvssv4',       label: 'similarVulnCvss4',     type: 'text'  },
];

function diffFieldsForMode(isProofMode) {
  return isProofMode
    ? DEFAULT_DIFF_FIELDS.filter(field => field.key !== 'observation')
    : DEFAULT_DIFF_FIELDS;
}

export default defineComponent({
  name: 'SimilarVulnModal',

  props: {
    modelValue: { type: Boolean, default: false },
    results: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    currentFinding: { type: Object, default: () => ({}) },
    isProofMode: { type: Boolean, default: false },
    visionSummary: { type: String, default: '' },
    proofSteps: {
      type: Object,
      default: () => ({ analyze: 'pending', generate: 'pending', search: 'pending' }),
    },
  },

  emits: ['update:modelValue', 'apply', 'select', 'retry', 'close'],

  data() {
    return {
      selectedIndex: null,
      applyMap: this._defaultApplyMap(),
    };
  },

  computed: {
    show: {
      get() { return this.modelValue; },
      set(v) { this.$emit('update:modelValue', v); }
    },
    selected() {
      if (this.selectedIndex === null || this.selectedIndex >= this.results.length) return null;
      return this.results[this.selectedIndex];
    },
    appliedCount() {
      const fields = Object.keys(this.applyMap);
      return fields.filter((k) => this.applyMap[k]).length;
    },
    emptyMarkup() {
      return `<em class="text-grey-5">${this.$t('empty')}</em>`;
    },
    diffFields() {
      return diffFieldsForMode(this.isProofMode);
    }
  },

  watch: {
    modelValue(v) {
      if (v) {
        this.selectedIndex = this.results.length > 0 ? 0 : null;
        this.applyMap = this._defaultApplyMap();
      } else {
        this.$emit('close');
      }
    },
    results(v) {
      this.selectedIndex = v.length > 0 ? 0 : null;
      this.applyMap = this._defaultApplyMap();
    },
    selectedIndex() {
      // reset to "all changed selected" when switching results
      this.applyMap = this._defaultApplyMap();
    }
  },

  methods: {
    _defaultApplyMap() {
      // Pre-tick fields that actually changed so the user starts from a sensible default
      const map = diffFieldsForMode(this.isProofMode).reduce((acc, field) => {
        acc[field.key] = false;
        return acc;
      }, {});
      if (this.results && this.results.length > 0 && this.selectedIndex !== null && this.selectedIndex < this.results.length) {
        const sel = this.results[this.selectedIndex];
        Object.keys(map).forEach((k) => {
          map[k] = this._fieldChanged(sel, k);
        });
      } else {
        // Even with no diff, default to selecting changed fields once selectedIndex is set
        Object.keys(map).forEach((k) => { map[k] = false; });
      }
      return map;
    },

    _fieldChanged(result, key) {
      if (!result) return false;
      const curr = this.currentFinding ? this.currentFinding[key] : undefined;
      const prop = result[key];
      if (Array.isArray(curr) && Array.isArray(prop)) {
        return JSON.stringify(curr) !== JSON.stringify(prop);
      }
      return (curr || '') !== (prop || '');
    },

    sanitize(html) {
      return sanitizeHtml(html || '');
    },

    proofStepActive(step) {
      return this.proofSteps && this.proofSteps[step] === 'active';
    },

    proofStepDone(step) {
      return this.proofSteps && this.proofSteps[step] === 'done';
    },

    proofStepClass(step) {
      if (this.proofStepDone(step)) return 'text-positive';
      if (this.proofStepActive(step)) return 'text-primary text-weight-medium';
      return 'text-grey-7';
    },

    selectResult(i) {
      this.selectedIndex = i;
      this.$emit('select', this.results[i]);
    },

    fieldHasChange(key) {
      if (!this.selected) return false;
      return this._fieldChanged(this.selected, key);
    },

    selectAllFields() {
      Object.keys(this.applyMap).forEach((k) => {
        this.applyMap[k] = true;
      });
    },

    selectChangedFields() {
      Object.keys(this.applyMap).forEach((k) => {
        this.applyMap[k] = this._fieldChanged(this.selected, k);
      });
    },

    applySelected() {
      if (!this.selected) return;
      const fields = Object.keys(this.applyMap).filter((k) => this.applyMap[k]);
      if (fields.length === 0) return;
      const result = { ...this.selected };
      this.$emit('apply', { result, fields });
      this.show = false;
    },

    onHide() {
      this.$emit('close');
    },

    distanceColor(d) {
      if (d == null) return 'grey';
      if (d < 0.4) return 'positive';
      if (d < 0.8) return 'warning';
      return 'negative';
    },

    distanceLabel(d) {
      if (d == null) return '?';
      if (d < 0.4) return this.$t('similarVulnHigh');
      if (d < 0.8) return this.$t('similarVulnMedium');
      return this.$t('similarVulnLow');
    },
  },
});
</script>

<style lang="scss" scoped>
.similar-vuln-modal {
  width: calc(100vw - 64px);
  max-width: 1440px;
  min-height: 60vh;
  height: calc(100vh - 64px);
  max-height: calc(100vh - 64px);
}

@media (max-width: 600px) {
  .similar-vuln-modal {
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    max-height: calc(100vh - 16px);
  }
}

.diff-field-block {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.diff-fields-stack {
  gap: 12px;

  .diff-field-block {
    margin-bottom: 0;
  }
}

.diff-html-box {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  padding: 8px 12px;
  min-height: 48px;
  font-size: 0.85rem;
  background: rgba(0, 0, 0, 0.02);

  &.proposed {
    border-color: rgba(var(--q-positive-rgb), 0.4);
    background: rgba(var(--q-positive-rgb), 0.04);
  }
}

:deep(.similar-vuln-result-item.q-item--active) {
  .q-item__label,
  .q-item__label--caption,
  .q-item__section--side {
    color: #fff;
  }

  .taxonomy-empty {
    color: rgba(255, 255, 255, 0.8);
  }
}

.body--dark {
  .diff-field-block {
    border-color: rgba(255, 255, 255, 0.1);
  }

  .diff-html-box {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);

    &.proposed {
      background: rgba(var(--q-positive-rgb), 0.08);
      border-color: rgba(var(--q-positive-rgb), 0.3);
    }
  }
}
</style>
