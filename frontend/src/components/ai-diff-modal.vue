<template>
  <q-dialog v-model="show" full-width>
    <q-card class="ai-diff-modal column no-wrap">
      <q-bar class="bg-purple text-white">
        <q-icon name="auto_awesome" />
        <span class="q-ml-sm text-body1">{{ currentTitle }}</span>
        <q-space />
        <q-btn dense flat icon="close" @click="show = false">
          <q-tooltip>{{ $t('btn.close') }}</q-tooltip>
        </q-btn>
      </q-bar>

      <div class="q-pa-md column no-wrap col" style="min-height:0">
        <q-tabs
          v-if="reviewItems.length > 1"
          :model-value="activeReviewId"
          dense
          align="left"
          class="ai-diff-tabs q-mb-sm"
          @update:model-value="setActiveReview"
        >
          <q-tab
            v-for="item in reviewItems"
            :key="item.id"
            :name="item.id"
            :label="item.title || $t('aiReviewTitle')"
            no-caps
          />
        </q-tabs>

        <div class="text-caption text-grey-7 q-mb-md">{{ $t('aiReviewHint') }}</div>

        <div class="row q-col-gutter-md col" style="min-height:0">
          <div class="col-12 col-md-6 column no-wrap" style="min-height:0">
            <div class="row items-center q-mb-sm">
              <q-icon name="history" size="xs" class="q-mr-xs" />
              <span class="text-caption text-weight-medium text-uppercase text-grey-7">{{ $t('aiReviewPrevious') }}</span>
            </div>
            <div
              class="ai-diff-pane col"
              role="region"
              aria-readonly="true"
              :aria-label="$t('aiReviewPrevious')"
              v-html="displayPreviousSafe"
            ></div>
          </div>

          <div class="col-12 col-md-6 column no-wrap" style="min-height:0">
            <div class="row items-center q-mb-sm">
              <q-icon name="edit" size="xs" class="q-mr-xs" />
              <span class="text-caption text-weight-medium text-uppercase text-grey-7">{{ $t('aiReviewProposedEditable') }}</span>
            </div>
            <div
              ref="proposedEditor"
              class="ai-diff-pane ai-diff-pane-editable col"
              contenteditable="true"
              spellcheck="false"
              role="textbox"
              aria-multiline="true"
              :aria-label="$t('aiReviewProposedEditable')"
              @input="updateEditedHtml"
            ></div>
          </div>
        </div>
      </div>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md q-gutter-sm">
        <q-btn
          flat
          no-caps
          color="grey-7"
          icon="undo"
          :label="$t('aiUseOriginal')"
          @click="show = false"
        />
        <q-btn
          flat
          no-caps
          color="purple"
          icon="refresh"
          :label="$t('aiRegenerate')"
          @click="regenerate"
        >
          <q-tooltip>{{ $t('aiRegenerateTooltip') }}</q-tooltip>
        </q-btn>
        <q-btn
          color="positive"
          unelevated
          no-caps
          icon="check"
          :label="$t('aiApplyProposed')"
          @click="apply"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue';
import { sanitizeHtml } from '@/services/ai-helpers';

export default defineComponent({
  name: 'AiDiffModal',

  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '' },
    previousHtml: { type: String, default: '' },
    proposedHtml: { type: String, default: '' },
    reviews: { type: Array, default: () => [] },
  },

  emits: ['update:modelValue', 'apply', 'regenerate'],

  data() {
    return {
      editedHtml: '',
      editedHtmlById: {},
      activeReviewId: '',
    };
  },

  computed: {
    show: {
      get() { return this.modelValue; },
      set(v) { this.$emit('update:modelValue', v); }
    },
    displayPreviousSafe() {
      const html = this.currentPreviousHtml;
      if (!html) return `<em class="text-grey-5">${this.$t('empty')}</em>`;
      return sanitizeHtml(html);
    },
    reviewItems() {
      return Array.isArray(this.reviews) ? this.reviews : [];
    },
    isMultiReview() {
      return this.reviewItems.length > 0;
    },
    currentReview() {
      if (!this.isMultiReview) return null;
      return this.reviewItems.find(item => item.id === this.activeReviewId) || this.reviewItems[0] || null;
    },
    currentPreviousHtml() {
      return this.currentReview ? (this.currentReview.previousHtml || '') : this.previousHtml;
    },
    currentProposedHtml() {
      return this.currentReview ? (this.currentReview.proposedHtml || '') : this.proposedHtml;
    },
    currentTitle() {
      return (this.currentReview && this.currentReview.title) || this.title || this.$t('aiReviewTitle');
    },
  },

  watch: {
    modelValue(v) {
      if (v) this.ensureActiveReview();
    },
    proposedHtml(value) {
      if (this.show && !this.isMultiReview) this.setEditedHtml(value || '');
    },
    reviews: {
      deep: true,
      handler() {
        if (this.show) this.ensureActiveReview();
      },
    },
  },

  methods: {
    ensureActiveReview() {
      if (this.isMultiReview) {
        if (!this.reviewItems.some(item => item.id === this.activeReviewId)) {
          this.activeReviewId = this.reviewItems[0].id;
        }
        const current = this.currentReview;
        if (current && this.editedHtmlById[current.id] === undefined) {
          this.setEditedHtml(current.proposedHtml || '', current.id);
        } else if (current) {
          this.setEditedHtml(this.editedHtmlById[current.id] || '', current.id);
        }
      } else {
        this.activeReviewId = '';
        this.setEditedHtml(this.proposedHtml || '');
      }
    },
    setActiveReview(id) {
      this.updateEditedHtml();
      this.activeReviewId = id;
      const value = this.editedHtmlById[id] !== undefined
        ? this.editedHtmlById[id]
        : ((this.currentReview && this.currentReview.proposedHtml) || '');
      this.setEditedHtml(value, id);
    },
    setEditedHtml(value, id = null) {
      const safe = sanitizeHtml(value || '');
      this.editedHtml = safe;
      if (id) this.editedHtmlById = { ...this.editedHtmlById, [id]: safe };
      this.$nextTick(() => {
        if (this.$refs.proposedEditor) this.$refs.proposedEditor.innerHTML = safe;
      });
    },
    updateEditedHtml() {
      this.editedHtml = this.$refs.proposedEditor ? this.$refs.proposedEditor.innerHTML : '';
      if (this.currentReview) {
        this.editedHtmlById = { ...this.editedHtmlById, [this.currentReview.id]: this.editedHtml };
      }
    },
    apply() {
      this.updateEditedHtml();
      this.$emit('apply', sanitizeHtml(this.editedHtml), this.currentReview);
      if (!this.isMultiReview || this.reviewItems.length <= 1) this.show = false;
    },
    regenerate() {
      this.$emit('regenerate', this.currentReview);
    },
  },
});
</script>

<style lang="scss" scoped>
.ai-diff-modal {
  width: calc(100vw - 64px);
  max-width: 1440px;
  height: calc(100vh - 64px);
  max-height: calc(100vh - 64px);
}

.ai-diff-pane {
  min-height: 280px;
  overflow: auto;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
}

.ai-diff-pane-editable {
  border-color: rgba(156, 39, 176, 0.4);
  background: rgba(156, 39, 176, 0.05);
}

.ai-diff-pane-editable:focus {
  outline: 2px solid rgba(156, 39, 176, 0.45);
  outline-offset: 1px;
}

.ai-diff-tabs {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

@media (max-width: 600px) {
  .ai-diff-modal {
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    max-height: calc(100vh - 16px);
  }
}

.body--dark {
  .ai-diff-pane {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .ai-diff-pane-editable {
    background: rgba(156, 39, 176, 0.12);
    border-color: rgba(156, 39, 176, 0.3);
  }

  .ai-diff-tabs {
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
}
</style>
