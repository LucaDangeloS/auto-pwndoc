<template src='./collaborators.html'></template>

<script src='./collaborators.js'></script>

<style>
/* `table-style` puts its min-width on the scroll container itself, which makes
   the container wider than the card instead of scrolling inside it. Keep the
   container fluid and move the min-width onto the inner table so it scrolls. */
.users-table .q-table__middle {
    overflow-x: auto;
    min-width: 0 !important;
}

.users-table .q-table__middle > table {
    min-width: 1120px;
}
</style>
