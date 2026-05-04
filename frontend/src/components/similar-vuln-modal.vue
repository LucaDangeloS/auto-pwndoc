<template>
  <q-dialog v-model="show" full-width>
    <q-card class="similar-vuln-modal column no-wrap">
      <q-bar class="bg-primary text-white">
        <q-icon :name="isProofMode ? 'image_search' : 'search'" />
        <span class="q-ml-sm text-body1">{{ isProofMode ? $t('proofSearchTitle') : $t('similarVulnTitle') }}</span>
        <q-space />
        <q-btn dense flat icon="close" @click="show = false" />
      </q-bar>

      <!-- Loading state -->
      <div v-if="loading" class="col flex flex-center q-pa-xl">
        <q-spinner size="48px" color="primary" />
        <div class="q-ml-md text-grey-7">{{ $t('similarVulnSearching') }}</div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="col flex flex-center q-pa-xl">
        <q-icon name="error_outline" size="48px" color="negative" />
        <div class="q-ml-md text-negative">{{ error }}</div>
      </div>

      <!-- No results -->
      <div v-else-if="results.length === 0" class="col flex flex-center q-pa-xl">
        <q-icon name="search_off" size="48px" color="grey-5" />
        <div class="q-ml-md text-grey-7">{{ $t('similarVulnNoResults') }}</div>
      </div>

      <!-- Results + diff layout -->
      <div v-else class="col row no-wrap" style="min-height:0">
        <!-- Left panel: results list -->
        <div class="similar-vuln-list col-4 q-pa-md column no-wrap" style="border-right:1px solid rgba(0,0,0,0.12); overflow-y:auto">
          <div class="text-caption text-grey-7 q-mb-sm">{{ $t('similarVulnResultsCount', { n: results.length }) }}</div>
          <q-list separator>
            <q-item
              v-for="(r, i) in results"
              :key="r.vulnId"
              clickable
              :active="selectedIndex === i"
              active-class="bg-primary text-white"
              @click="selectResult(i)"
              class="rounded-borders q-mb-xs"
            >
              <q-item-section>
                <q-item-label lines="2">{{ r.title || $t('untitled') }}</q-item-label>
                <q-item-label caption>
                  <span v-if="r.category">{{ r.category }} &bull; </span>
                  <span v-if="r.vulnType">{{ r.vulnType }} &bull; </span>
                  <span class="text-weight-medium">
                    {{ $t('similarVulnDistance') }}: {{ r.distance != null ? r.distance.toFixed(3) : 'N/A' }}
                  </span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge
                  :color="distanceColor(r.distance)"
                  :label="distanceLabel(r.distance)"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- Right panel: diff view -->
        <div class="col column no-wrap" style="min-height:0; overflow-y:auto">
          <div v-if="selected" class="col q-pa-md column no-wrap">
            <div class="row items-center q-mb-lg q-pb-sm q-gutter-sm">
              <q-icon name="compare_arrows" color="primary" />
              <span class="text-subtitle2">{{ $t('similarVulnDiffTitle') }}</span>
              <q-space />
              <q-btn
                color="positive"
                no-caps
                icon="check"
                :label="$t('similarVulnApply')"
                @click="applySelected"
              />
            </div>

            <!-- Vision summary (proof mode only) -->
            <div v-if="isProofMode && visionSummary" class="diff-field-block q-mb-md">
              <q-expansion-item
                :label="$t('proofAnalysisSummary')"
                icon="visibility"
                dense
                header-class="text-caption text-weight-medium text-grey-7"
              >
                <div class="q-pa-sm text-caption" style="white-space: pre-wrap;">{{ visionSummary }}</div>
              </q-expansion-item>
            </div>

            <!-- Generated PoC preview (proof mode only) -->
            <div v-if="isProofMode" class="diff-field-block q-mb-md">
              <div class="row items-center q-mb-xs">
                <q-icon name="article" color="secondary" size="xs" class="q-mr-xs" />
                <span class="text-caption text-weight-medium text-uppercase text-grey-7">{{ $t('proofGeneratedPreview') }}</span>
                <q-spinner v-if="pocLoading" size="xs" color="secondary" class="q-ml-sm" />
              </div>
              <div v-if="pocLoading" class="text-caption text-grey-6 q-py-sm">{{ $t('proofFillLoading') }}</div>
              <div v-else-if="generatedPoc" class="diff-html-box proposed" v-html="generatedPoc"></div>
              <div v-else class="diff-html-box text-grey-5"><em>{{ $t('proofGeneratedEmpty') }}</em></div>
            </div>

            <!-- Field diffs -->
            <div class="q-col-gutter-md column">
              <div v-for="field in diffFields" :key="field.key" class="diff-field-block">
                <div class="row items-center q-mb-xs">
                  <q-icon
                    :name="fieldHasChange(field.key) ? 'edit' : 'check'"
                    :color="fieldHasChange(field.key) ? 'warning' : 'positive'"
                    size="xs"
                    class="q-mr-xs"
                  />
                  <span class="text-caption text-weight-medium text-uppercase text-grey-7">{{ $t(field.label) }}</span>
                  <q-badge v-if="fieldHasChange(field.key)" color="warning" label="changed" class="q-ml-sm" />
                </div>

                <!-- HTML fields (description, observation, remediation) -->
                <template v-if="field.type === 'html'">
                  <div class="diff-columns row q-col-gutter-sm">
                    <div class="col-6">
                      <div class="text-caption text-grey-6 q-mb-xs">{{ $t('similarVulnCurrent') }}</div>
                      <div class="diff-html-box" v-html="currentFinding[field.key] || '<em class=\'text-grey-5\'>' + $t('empty') + '</em>'"></div>
                    </div>
                    <div class="col-6">
                      <div class="text-caption text-grey-6 q-mb-xs">{{ $t('similarVulnProposed') }}</div>
                      <div class="diff-html-box proposed" v-html="selected[field.key] || '<em class=\'text-grey-5\'>' + $t('empty') + '</em>'"></div>
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
    generatedPoc: { type: String, default: '' },
    pocLoading: { type: Boolean, default: false },
  },

  emits: ['update:modelValue', 'apply', 'select'],

  data() {
    return {
      selectedIndex: null,
      diffFields: [
        { key: 'description', label: 'description', type: 'html' },
        { key: 'observation', label: 'observation', type: 'html' },
        { key: 'remediation', label: 'remediation', type: 'html' },
        { key: 'references', label: 'references', type: 'array' },
        { key: 'cvssv3', label: 'cvssScore', type: 'text' },
        { key: 'cvssv4', label: 'similarVulnCvss4', type: 'text' },
      ],
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
  },

  watch: {
    modelValue(v) {
      if (v) this.selectedIndex = this.results.length > 0 ? 0 : null;
    },
    results(v) {
      this.selectedIndex = v.length > 0 ? 0 : null;
    },
  },

  methods: {
    selectResult(i) {
      this.selectedIndex = i;
      this.$emit('select', this.results[i]);
    },

    fieldHasChange(key) {
      if (!this.selected) return false;
      const curr = this.currentFinding[key];
      const prop = this.selected[key];
      if (Array.isArray(curr) && Array.isArray(prop)) {
        return JSON.stringify(curr) !== JSON.stringify(prop);
      }
      return (curr || '') !== (prop || '');
    },

    applySelected() {
      if (!this.selected) return;
      const payload = { ...this.selected };
      if (this.isProofMode && this.generatedPoc) {
        payload.poc = this.generatedPoc;
      }
      this.$emit('apply', payload);
      this.show = false;
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
