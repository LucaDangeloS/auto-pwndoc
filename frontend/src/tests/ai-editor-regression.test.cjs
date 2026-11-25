'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const assistant = source('components', 'ai-assistant.js');
const editor = source('components', 'editor.vue');
const modal = source('components', 'similar-vuln-modal.vue');
const settings = source('pages', 'settings', 'settings.js');
const settingsTemplate = source('pages', 'settings', 'settings.html');

assert(
    assistant.includes('options && options.selectionRange') &&
        editor.includes('rerun: () => this.runAi(result.action, result.selectionRange)') &&
        editor.includes('{ onResult, onDone, review, selectionRange }'),
    'rewrite must preserve and reuse the selected range through review and regeneration'
);

assert(
    settings.includes('SettingsService.getSettings(true)') &&
        settingsTemplate.includes('promptValue(operation.prefix') &&
        !settingsTemplate.includes('v-model="settings.ai.private.generateSystemPrompt"'),
    'settings must use server-provided prompt defaults and a single editor per operation and field'
);

assert(
    modal.includes("const PROOF_DIFF_FIELD = { key: 'poc'") &&
        modal.includes("field.key !== 'observation'"),
    'proof completion must offer a completed PoC while leaving Observation out'
);

console.log('AI editor regression tests passed');
