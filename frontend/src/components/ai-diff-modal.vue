<template>
  <q-dialog v-model="show" full-width>
    <q-card class="ai-diff-modal column no-wrap">
      <q-bar class="bg-purple text-white">
        <q-icon name="auto_awesome" />
        <span class="q-ml-sm text-body1">{{ $t('aiReviewTitle') }}</span>
        <q-space />
        <q-btn dense flat icon="close" @click="show = false" />
      </q-bar>

      <div class="q-pa-md column no-wrap col" style="min-height:0">
        <div class="text-caption text-grey-7 q-mb-md">{{ $t('aiReviewHint') }}</div>

        <div class="row q-col-gutter-md col" style="min-height:0">
          <div class="col-12 col-md-6 column no-wrap" style="min-height:0">
            <div class="row items-center q-mb-sm">
              <q-icon name="history" size="xs" class="q-mr-xs" />
              <span class="text-caption text-weight-medium text-uppercase text-grey-7">{{ $t('aiReviewPrevious') }}</span>
            </div>
            <div class="ai-diff-pane col" v-html="displayPrevious"></div>
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
              @input="updateEditedHtml"
            ></div>
          </div>
        </div>
      </div>

      <q-separator />
      <q-card-actions align="right" class="q-pa-md q-gutter-sm">
        <q-btn flat no-caps :label="$t('aiUseOriginal')" @click="show = false" />
        <q-btn color="purple" no-caps icon="check" :label="$t('aiApplyProposed')" @click="apply" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'AiDiffModal',

  props: {
    modelValue: { type: Boolean, default: false },
    previousHtml: { type: String, default: '' },
    proposedHtml: { type: String, default: '' },
  },

  emits: ['update:modelValue', 'apply'],

  data() {
    return {
      editedHtml: '',
    };
  },

  computed: {
    show: {
      get() { return this.modelValue; },
      set(v) { this.$emit('update:modelValue', v); }
    },
    displayPrevious() {
      return this.previousHtml || `<em class="text-grey-5">${this.$t('empty')}</em>`;
    },
  },

  watch: {
    modelValue(v) {
      if (v) this.setEditedHtml(this.proposedHtml || '');
    },
    proposedHtml(value) {
      if (this.show) this.setEditedHtml(value || '');
    },
  },

  methods: {
    setEditedHtml(value) {
      this.editedHtml = value;
      this.$nextTick(() => {
        if (this.$refs.proposedEditor) this.$refs.proposedEditor.innerHTML = value;
      });
    },
    updateEditedHtml() {
      this.editedHtml = this.$refs.proposedEditor ? this.$refs.proposedEditor.innerHTML : '';
    },
    apply() {
      this.updateEditedHtml();
      this.$emit('apply', this.editedHtml);
      this.show = false;
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
  outline: 2px solid rgba(156, 39, 176, 0.35);
  outline-offset: 1px;
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
}
</style>
