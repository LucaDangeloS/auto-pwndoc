<template src="./page.html"></template>
<script src="./page.js"></script>

<style scoped>
.archive-reader-layout {
  min-height: calc(100vh - 140px);
}

.archive-outline {
  max-height: calc((100vh - 340px) / 2);
  overflow-y: auto;
}

.archive-search-results {
  max-height: calc((100vh - 340px) / 2);
  overflow-y: auto;
}

.archive-pages {
  max-height: calc(100vh - 260px);
  overflow: auto;
  background: #f1f5f9;
}

.archive-page-wrapper {
  position: relative;
  display: block;
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

/* Fix low-contrast text on selected archive list items */
:deep(.q-item--active .q-item__label--caption) {
  color: rgba(255, 255, 255, 0.75);
}

:deep(.q-item--active .q-item__label) {
  color: #ffffff;
}

/* PDF icon turns white on selected item for consistency */
:deep(.q-item--active .q-icon[name="picture_as_pdf"]) {
  color: rgba(255, 255, 255, 0.85) !important;
}
</style>
