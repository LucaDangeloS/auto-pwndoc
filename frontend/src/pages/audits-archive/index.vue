<template src="./page.html"></template>
<script src="./page.js"></script>

<style scoped>
.archive-reader-layout {
  min-height: calc(100vh - 140px);
}

.archive-muted {
  opacity: 0.7;
}

.archive-list-card {
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.archive-drop-active {
  border-color: var(--q-secondary);
  box-shadow: 0 0 0 2px var(--q-secondary);
}

.archive-groups {
  max-height: calc(100vh - 380px);
  min-height: 160px;
  overflow-y: auto;
}

.archive-year-header {
  font-weight: 600;
  letter-spacing: 0.04em;
}

.archive-company-logo {
  object-fit: contain;
  background: white;
}

.archive-tag {
  font-size: 11px;
}

.archive-item-active {
  color: white;
}

.archive-item-active :deep(.q-item__label--caption) {
  color: rgba(255, 255, 255, 0.75);
}

.archive-item-active :deep(.archive-pdf-icon) {
  color: rgba(255, 255, 255, 0.85) !important;
}

.archive-item-active :deep(.q-badge--outline) {
  color: white !important;
}

.archive-item-active :deep(.q-item__section--side) {
  color: rgba(255, 255, 255, 0.85);
}

.archive-outline {
  max-height: calc((100vh - 380px) / 2);
  overflow-y: auto;
}

.archive-search-results {
  max-height: calc((100vh - 380px) / 2);
  overflow-y: auto;
}

.archive-pages {
  max-height: calc(100vh - 300px);
  overflow: auto;
  background: #f1f5f9;
}

.archive-page-wrapper {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto 24px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  background: white;
  line-height: 1;
}

.archive-page-canvas {
  display: block;
  max-width: 100%;
}

.archive-page-text-layer {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  pointer-events: auto;
}

.archive-page-text-layer :deep(span),
.archive-page-text-layer :deep(br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  -webkit-user-select: text;
  user-select: text;
}

.archive-page-text-layer :deep(span::selection) {
  background: rgba(0, 100, 255, 0.25);
  color: transparent;
}

.body--dark .archive-pages {
  background: #0f172a;
}
</style>
