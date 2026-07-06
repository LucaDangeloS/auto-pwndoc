<template src='./custom.html'></template>

<script src='./custom.js'></script>

<style lang="scss">
.drag-ghost {
  opacity: 0.5;
  background: $grey-4;
}

.checklist-config-table {
  border: 1px solid $separator-color;
  border-radius: 4px;
  box-sizing: border-box;
  max-width: 100%;
  overflow-x: auto;
  width: 100%;

  table {
    border-collapse: collapse;
    min-width: 980px;
    width: 100%;
  }

  th {
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
  }

  th,
  td {
    border-bottom: 1px solid $separator-color;
    padding: 4px 8px;
    vertical-align: top;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }
}

.section-type-badge {
  justify-content: center;
  min-width: 96px;
  width: max-content;
}

.checklist-bulk-editor {
  border: 1px solid $separator-color;
  border-radius: 4px;
  padding: 4px 8px 8px;

  .monospace {
    font-family: "Roboto Mono", monospace;
    font-size: 12px;
    line-height: 1.5;
  }
}

.checklist-template-guide {
  border: 1px solid $separator-color;
  border-radius: 4px;
  padding: 4px 8px 8px;
}

.checklist-template-snippet {
  border: 1px solid $separator-color;
  border-radius: 4px;
  font-family: "Roboto Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  max-width: 100%;
  overflow-x: auto;
  padding: 8px;
  white-space: pre;
}
</style>
