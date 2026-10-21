'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const assistant = source('components', 'ai-assistant.js');
const editor = source('components', 'editor.vue');
const modal = source('components', 'similar-vuln-modal.vue');
const settings = source('pages', 'settings', 'settings.js');
const findingEditor = source('pages', 'audits', 'edit', 'findings', 'edit', 'edit.html');

assert(
    assistant.includes('options && options.selectionRange') &&
        editor.includes('rerun: () => this.runAi(result.action, result.selectionRange)') &&
        editor.includes('{ onResult, onDone, review, selectionRange }'),
    'rewrite must preserve and reuse the selected range through review and regeneration'
);

for (const action of ['generate', 'complete', 'rewrite']) {
    const prompt = new RegExp(`field_description_${action}SystemPrompt:[\\s\\S]*?never use bullet points or numbered lists`, 'i');
    assert(prompt.test(settings), `description ${action} must require prose instead of lists`);
}
assert(
    settings.includes('LEGACY_DESCRIPTION_PROMPT_MARKERS') &&
        settings.includes('this.settings.ai.private[key] = DEFAULT_PROMPTS[key]'),
    'stored legacy description defaults must be upgraded without replacing custom prompts'
);

assert(
    modal.includes("const PROOF_DIFF_FIELD = { key: 'poc'") &&
        modal.includes("field.key !== 'observation'") &&
        modal.includes("k !== 'observation' && this._fieldChanged(sel, k)"),
    'proof completion must offer a completed PoC while leaving Observation out'
);

assert(
    !settings.includes("{ key: 'observation',    labelKey: 'fieldObservation'") &&
        !settings.includes('field_observation_generateSystemPrompt'),
    'Observation must not expose prompt overrides'
);

const observationEditor = findingEditor.match(/ref="basiceditor_observation"[\s\S]*?\/>/)?.[0] || '';
assert(
    observationEditor.includes(':toolbar="[\'format\', \'marks\', \'list\', \'code\', \'table\', \'image\', \'caption\']"') &&
        !observationEditor.includes('fieldName="observation"'),
    'Observation editor must not expose AI actions'
);

console.log('AI editor regression tests passed');
