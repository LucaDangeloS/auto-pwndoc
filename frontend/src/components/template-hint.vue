<template>
  <q-btn
    round
    flat
    dense
    size="xs"
    icon="help_outline"
    color="grey-5"
    class="template-hint-btn"
    @mouseenter="openHint"
    @mouseleave="scheduleClose"
    @focus="openHint"
    @blur="scheduleClose"
    @click.stop="toggleHint"
  >
    <q-menu
      v-model="isOpen"
      no-parent-event
      anchor="top middle"
      self="bottom middle"
      :offset="[0, 6]"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose"
    >
      <div class="template-hint-tooltip">
        <div class="text-caption text-weight-medium q-mb-xs text-grey-4">{{ $t('templateHintLabel') }}</div>
        <code class="template-hint-code">{{ displayTemplateVar }}</code>
        <div v-if="description" class="template-hint-description q-mt-sm">{{ description }}</div>
        <template v-if="examples.length">
          <div class="text-caption text-weight-medium q-mt-sm q-mb-xs text-grey-4">{{ $t('templateHintExamples') }}</div>
          <code
            v-for="example in examples"
            :key="example"
            class="template-hint-code template-hint-example"
          >
            {{ displayTemplateValue(example) }}
          </code>
        </template>
      </div>
    </q-menu>
  </q-btn>
</template>

<script>
export default {
  name: 'TemplateHint',
  data() {
    return {
      isOpen: false,
      closeTimer: null
    }
  },
  props: {
    templateVar: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    examples: {
      type: Array,
      default: () => []
    }
  },
  computed: {
    displayTemplateVar() {
      return this.displayTemplateValue(this.templateVar)
    }
  },
  beforeUnmount() {
    this.cancelClose()
  },
  methods: {
    displayTemplateValue(value) {
      const trimmed = (value || '').trim()
      if (!trimmed || trimmed.startsWith('{')) {
        return trimmed
      }
      if (trimmed.includes('| convertHTML')) {
        return `{@${trimmed}}`
      }
      return `{${trimmed}}`
    },
    openHint() {
      this.cancelClose()
      this.isOpen = true
    },
    toggleHint() {
      this.cancelClose()
      this.isOpen = !this.isOpen
    },
    scheduleClose() {
      this.cancelClose()
      this.closeTimer = setTimeout(() => {
        this.isOpen = false
      }, 180)
    },
    cancelClose() {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer)
        this.closeTimer = null
      }
    }
  }
}
</script>

<style lang="stylus">
.template-hint-btn
  opacity 0.5
  transition opacity 0.15s ease
  vertical-align middle
  margin-left 2px

.template-hint-btn:hover
  opacity 1

.template-hint-tooltip
  background rgba(30, 30, 40, 0.97)
  border 1px solid rgba(255,255,255,0.1)
  border-radius 6px
  padding 8px 12px
  max-width 520px
  user-select text

.template-hint-code
  display block
  font-family monospace
  font-size 0.82rem
  color #5eeadb
  background rgba(255,255,255,0.07)
  padding 2px 6px
  border-radius 4px
  white-space pre-wrap
  overflow-wrap anywhere

.template-hint-description
  color rgba(255,255,255,0.78)
  font-size 0.78rem
  line-height 1.35

.template-hint-example + .template-hint-example
  margin-top 4px
</style>
