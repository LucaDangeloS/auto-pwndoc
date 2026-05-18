<template src='./executive-summary.html'></template>

<script src='./executive-summary.js'></script>

<style lang="sass">
.graph-template-row
  padding: 12px 0
  border-top: 1px solid rgba(0, 0, 0, .08)

  &:first-child
    border-top: 0
    padding-top: 0

.graph-template-code
  display: block
  max-width: 100%
  overflow-x: auto
  white-space: nowrap
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace
  font-size: .82rem
  background: rgba(0, 0, 0, .04)
  padding: 6px 8px
  border-radius: 4px

.graph-template-example + .graph-template-example
  margin-top: 6px

.body--dark
  .graph-template-row
    border-top-color: rgba(255, 255, 255, .12)

  .graph-template-code
    background: rgba(255, 255, 255, .08)
</style>
