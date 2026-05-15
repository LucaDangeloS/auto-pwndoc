<template src='./vulnerabilities.html'></template>

<script src='./vulnerabilities.js'></script>

<style lang="sass">
.card-section-merge 
    height: calc(60vh - 173px)

.vuln-row-new
    background: #e3f2fd !important

.vuln-row-updates
    background: #fff3e0 !important

.body--dark .vuln-row-new
    background: rgba(3, 169, 244, 0.12) !important

    td
        background: rgba(3, 169, 244, 0.12) !important

.body--dark .vuln-row-updates
    background: rgba(251, 140, 0, 0.14) !important

    td
        background: rgba(251, 140, 0, 0.14) !important

.vuln-toggle-new
    .q-toggle__inner--truthy
        .q-toggle__thumb
            color: #03a9f4 !important
        .q-toggle__track
            background: rgba(3, 169, 244, 0.38) !important

.vuln-toggle-updates
    .q-toggle__inner--truthy
        .q-toggle__thumb
            color: #fb8c00 !important
        .q-toggle__track
            background: rgba(251, 140, 0, 0.38) !important

</style>
