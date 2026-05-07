<template>
  <transition name="fade">
    <div v-if="show" class="ai-overlay" role="status" aria-live="polite">
      <q-spinner-gears size="40px" color="purple" />
      <div class="ai-overlay__label">
        <q-icon name="auto_awesome" />
        <span class="ai-loading">{{ effectiveLabel }}</span>
      </div>
      <q-btn
        v-if="cancellable"
        class="ai-overlay__cancel"
        flat
        dense
        no-caps
        icon="close"
        color="grey-8"
        :label="$t('btn.cancel')"
        @click="$emit('cancel')"
      />
    </div>
  </transition>
</template>

<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'AiOverlay',

  props: {
    show: { type: Boolean, default: false },
    label: { type: String, default: '' },
    cancellable: { type: Boolean, default: true }
  },

  emits: ['cancel'],

  computed: {
    effectiveLabel() {
      return this.label || this.$t('aiGenerating')
    }
  }
})
</script>

<style lang="scss" scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
