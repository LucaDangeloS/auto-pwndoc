<template>
  <q-btn
    :flat="flat"
    :outline="outline"
    :dense="dense"
    :size="size"
    :no-caps="true"
    :class="['ai-action-btn', { 'ai-action-btn--running': running }]"
    :color="effectiveColor"
    :disable="disabled || (running && !cancellable)"
    @click="onClick"
  >
    <span class="row items-center no-wrap q-gutter-x-xs">
      <q-spinner v-if="running" size="14px" color="white" />
      <q-icon v-else :name="effectiveIcon" :size="iconSize" />
      <span v-if="label">{{ label }}</span>
      <span v-if="running && cancellable" class="text-caption ai-action-btn__cancel-hint">{{ cancelHint }}</span>
    </span>
    <q-tooltip v-if="effectiveTooltip" :delay="400" anchor="top middle" self="bottom middle">
      {{ effectiveTooltip }}
    </q-tooltip>
  </q-btn>
</template>

<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'AiActionBtn',

  props: {
    label: { type: String, default: '' },
    icon: { type: String, default: 'auto_awesome' },
    color: { type: String, default: 'purple' },
    flat: { type: Boolean, default: true },
    outline: { type: Boolean, default: false },
    dense: { type: Boolean, default: true },
    size: { type: String, default: 'md' },
    iconSize: { type: String, default: 'xs' },
    loading: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    disabledReason: { type: String, default: '' },
    tooltip: { type: String, default: '' },
    cancellable: { type: Boolean, default: false },
    cancelHint: { type: String, default: '' }
  },

  emits: ['click', 'cancel'],

  computed: {
    running() {
      return !!this.loading
    },
    effectiveIcon() {
      return this.icon || 'auto_awesome'
    },
    effectiveColor() {
      if (this.disabled && !this.running) return 'grey-5'
      return this.color || 'purple'
    },
    effectiveTooltip() {
      if (this.disabled && this.disabledReason) return this.disabledReason
      return this.tooltip
    }
  },

  methods: {
    onClick(evt) {
      if (this.running) {
        if (this.cancellable) this.$emit('cancel', evt)
        return
      }
      this.$emit('click', evt)
    }
  }
})
</script>

<style lang="scss" scoped>
.ai-action-btn {
  font-weight: 500;
  letter-spacing: 0.01em;
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.ai-action-btn--running {
  cursor: progress;
}

.ai-action-btn__cancel-hint {
  opacity: 0.85;
  margin-left: 4px;
}
</style>
