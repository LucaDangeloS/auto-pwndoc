<template src='./general.html'></template>

<script src='./general.js'></script>

<style>
.severity-graph {
  display: grid;
  gap: 12px;
}

.severity-graph__row {
  display: grid;
  grid-template-columns: minmax(120px, 160px) minmax(0, 1fr) 36px;
  align-items: center;
  gap: 12px;
}

.severity-graph__label {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.severity-graph__swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex: 0 0 auto;
}

.severity-graph__bar {
  min-width: 0;
}

.severity-graph__count {
  text-align: right;
  font-weight: 600;
}

@media (max-width: 599px) {
  .severity-graph__row {
    grid-template-columns: minmax(0, 1fr) 32px;
  }

  .severity-graph__bar {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
