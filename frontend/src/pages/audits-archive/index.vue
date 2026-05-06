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

.archive-page-canvas {
  display: block;
  max-width: 100%;
  margin: 0 auto 24px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  background: white;
}

.body--dark .archive-pages {
  background: #0f172a;
}
</style>
