<template src='./vulnerabilities.html'></template>

<script src='./vulnerabilities.js'></script>

<style lang="sass">
.translation-relation-modal
    width: min(1280px, 96vw)
    max-width: 96vw
    height: min(82vh, 760px)
    display: flex
    flex-direction: column

.translation-relation-modal__body
    flex: 1 1 auto
    min-height: 0

.translation-relation-modal__column
    min-height: 0
    display: flex
    flex-direction: column

.card-section-merge
    flex: 1 1 auto
    min-height: 260px

@media (max-width: 1023px)
    .translation-relation-modal
        width: 96vw
        height: 88vh

    .translation-relation-modal__body
        overflow-y: auto

    .card-section-merge
        height: 260px
        flex: 0 0 auto

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

.vuln-index-chip
    vertical-align: middle

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

// Vulnerabilities toolbar: language selector (left) + switches stacked to its
// right + action buttons pushed to the far right. Single non-wrapping row so the
// button group never drops below or left of the switches.
.vuln-toolbar
    display: flex
    flex-wrap: nowrap
    align-items: flex-start
    width: 100%
    gap: 16px

.vuln-toolbar-language
    flex: 0 0 auto
    min-width: 150px

// Switches laid out as a 2x2 grid, immediately right of the language selector.
.vuln-toolbar-switches
    display: grid
    grid-template-columns: auto auto
    align-items: center
    justify-items: start
    gap: 6px 16px
    flex: 0 0 auto

// Action buttons: pushed to the right edge and kept together. Stacked vertically
// by default (narrow / split-screen) so the group stays a slim column on the
// right instead of wrapping left or under the switches; laid out in a row only
// when the viewport is wide enough to fit them beside the filters.
.vuln-toolbar-actions
    display: flex
    flex-direction: column
    align-items: flex-end
    gap: 8px
    margin-left: auto
    flex: 0 0 auto

    .q-btn,
    .q-btn-dropdown
        margin: 0

@media (min-width: 1740px)
    .vuln-toolbar-actions
        flex-direction: row
        align-items: flex-start
        gap: 12px

</style>
