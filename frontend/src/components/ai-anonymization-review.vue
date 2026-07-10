<template>
  <q-dialog v-model="show" persistent full-width>
    <q-card class="ai-anon-modal column no-wrap">
      <q-bar class="bg-primary text-white">
        <q-icon name="privacy_tip" />
        <span class="q-ml-sm text-body1">{{ $t('aiAnonReviewTitle') }}</span>
        <q-space />
        <q-btn dense flat icon="close" @click="reject">
          <q-tooltip>{{ $t('btn.close') }}</q-tooltip>
        </q-btn>
      </q-bar>

      <div class="q-pa-md column no-wrap col" style="min-height:0; overflow:auto">
        <div class="text-caption text-grey-7 q-mb-md">{{ $t('aiAnonReviewHint') }}</div>

        <div v-if="visibleFields.length === 0" class="text-grey-6 q-pa-md text-center">
          {{ $t('aiAnonReviewEmpty') }}
        </div>

        <div
          v-for="f in visibleFields"
          :key="f.key"
          class="q-mb-md"
        >
          <div class="text-caption text-weight-medium text-uppercase text-grey-7 q-mb-xs">
            {{ $t(f.labelKey) }}
          </div>
          <q-input
            v-model="edited[f.key]"
            outlined
            type="textarea"
            autogrow
            spellcheck="false"
            input-class="ai-anon-textarea"
          />
        </div>
      </div>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md q-gutter-sm">
        <q-btn
          flat
          no-caps
          color="negative"
          icon="block"
          :label="$t('aiAnonReviewReject')"
          @click="reject"
        />
        <q-btn
          color="positive"
          unelevated
          no-caps
          icon="send"
          :label="$t('aiAnonReviewSend')"
          @click="send"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue';

const FIELD_META = [
  { key: 'findingTitle', labelKey: 'aiAnonReviewFieldFindingTitle' },
  { key: 'findingDescription', labelKey: 'aiAnonReviewFieldFindingDescription' },
  { key: 'findingPoc', labelKey: 'aiAnonReviewFieldFindingPoc' },
  { key: 'auditContext', labelKey: 'aiAnonReviewFieldAuditContext' },
  { key: 'text', labelKey: 'aiAnonReviewFieldText' },
];

export default defineComponent({
  name: 'AiAnonymizationReview',

  props: {
    modelValue: { type: Boolean, default: false },
    // The anonymized context fields to review, keyed by FIELD_META keys.
    fields: { type: Object, default: () => ({}) },
  },

  emits: ['update:modelValue', 'send', 'reject'],

  data() {
    return {
      edited: {},
    };
  },

  computed: {
    show: {
      get() { return this.modelValue; },
      set(v) { this.$emit('update:modelValue', v); }
    },
    // Only present non-empty context values as editable fields; empty ones are
    // still sent back verbatim (empty) so the approved payload stays complete.
    visibleFields() {
      return FIELD_META.filter(f => {
        const v = this.fields ? this.fields[f.key] : '';
        return typeof v === 'string' && v.trim().length > 0;
      });
    },
  },

  watch: {
    modelValue(v) {
      if (v) this.seedEdited();
    },
    fields: {
      deep: true,
      handler() { if (this.show) this.seedEdited(); },
    },
  },

  methods: {
    seedEdited() {
      const next = {};
      FIELD_META.forEach(f => {
        const v = this.fields ? this.fields[f.key] : '';
        next[f.key] = typeof v === 'string' ? v : '';
      });
      this.edited = next;
    },
    send() {
      // Return the full field set (edits merged, empty fields preserved).
      const approved = {};
      FIELD_META.forEach(f => {
        approved[f.key] = this.edited[f.key] !== undefined ? this.edited[f.key] : '';
      });
      this.$emit('send', approved);
      this.show = false;
    },
    reject() {
      this.$emit('reject');
      this.show = false;
    },
  },
});
</script>

<style lang="scss" scoped>
.ai-anon-modal {
  width: calc(100vw - 64px);
  max-width: 1100px;
  height: calc(100vh - 64px);
  max-height: calc(100vh - 64px);
}

@media (max-width: 600px) {
  .ai-anon-modal {
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    max-height: calc(100vh - 16px);
  }
}
</style>
