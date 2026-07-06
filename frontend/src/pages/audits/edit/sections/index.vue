<template src='./sections.html'></template>

<script src='./sections.js'></script>

<style lang="scss">
.checklist-section-table {
  .q-td {
    vertical-align: top;
  }

  th:nth-child(2),
  td:nth-child(2) {
    min-width: 300px;
  }

  th:nth-child(3),
  td:nth-child(3) {
    min-width: 180px;
  }

  .checklist-status-toggle {
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
    justify-content: center;
    min-width: 260px;

    .q-btn {
      border-radius: 4px !important;
      min-width: 52px;
    }
  }
}
</style>
