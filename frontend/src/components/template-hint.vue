<template>
  <q-btn
    round
    flat
    dense
    size="xs"
    icon="help_outline"
    color="grey-5"
    class="template-hint-btn"
  >
    <q-tooltip
      anchor="top middle"
      self="bottom middle"
      :delay="200"
      class="template-hint-tooltip"
    >
      <div class="text-caption text-weight-medium q-mb-xs text-grey-4">{{ $t('templateHintLabel') }}</div>
      <code class="template-hint-code">{{ templateVar }}</code>
    </q-tooltip>
  </q-btn>
</template>

<script>
export default {
  name: 'TemplateHint',
  props: {
    templateVar: {
      type: String,
      required: true
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

.template-hint-code
  font-family monospace
  font-size 0.82rem
  color #5eeadb
  background rgba(255,255,255,0.07)
  padding 2px 6px
  border-radius 4px
  white-space nowrap
</style>
