'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, '..', 'pages', 'settings', 'settings.html');
const template = fs.readFileSync(templatePath, 'utf8');
const settingsScript = fs.readFileSync(path.join(__dirname, '..', 'pages', 'settings', 'settings.js'), 'utf8');
const archiveScript = fs.readFileSync(path.join(__dirname, '..', 'pages', 'audits-archive', 'page.js'), 'utf8');
const aiAssistantScript = fs.readFileSync(path.join(__dirname, '..', 'components', 'ai-assistant.js'), 'utf8');
const vulnerabilitiesScript = fs.readFileSync(path.join(__dirname, '..', 'pages', 'vulnerabilities', 'vulnerabilities.js'), 'utf8');
const vulnerabilitiesTemplate = fs.readFileSync(path.join(__dirname, '..', 'pages', 'vulnerabilities', 'vulnerabilities.html'), 'utf8');
const vulnerabilitiesComponent = fs.readFileSync(path.join(__dirname, '..', 'pages', 'vulnerabilities', 'index.vue'), 'utf8');
const bundleDir = path.join(__dirname, '..', '..', 'dist', 'spa', 'js');

assert(
    !/<template\s+[^>]*v-for\s*=/.test(template),
    'settings.html must put v-for on the rendered component; a bare template v-for breaks the external template render scope'
);
assert(
    /<q-expansion-item\s+[^>]*v-for="field in aiFieldPromptFields"/s.test(template),
    'per-field AI prompt controls must render from aiFieldPromptFields'
);
assert.strictEqual(
    (template.match(/v-model="settings\.ai\.private\.visionSystemPrompt"/g) || []).length,
    1,
    'Vision / Proof Analysis prompt must be rendered exactly once'
);
assert.strictEqual(
    (template.match(/v-model="settings\.ai\.private\.visionAnonymizationPrompt"/g) || []).length,
    1,
    'LLM anonymization prompt must be rendered exactly once'
);
for (const action of ['generate', 'complete', 'rewrite']) {
    const fieldPrompt = new RegExp(`field_poc_${action}UserPrompt:[\\s\\S]*?\\{findingPocVision\\}`);
    assert(fieldPrompt.test(settingsScript), `PoC ${action} must include vision descriptions`);
}
assert(
    /GlobalWorkerOptions\.workerPort\s*=\s*new Worker\(\s*new URL\(\s*['"]pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs['"]\s*,\s*import\.meta\.url\s*\)/s.test(archiveScript),
    'PDF.js must use a module worker emitted by the frontend bundle instead of a fake worker loaded from the site root'
);
assert(
    archiveScript.includes('document.body.appendChild(link)') &&
        archiveScript.includes('AuditArchiveService.getArchiveDownloadUrl(this.selectedArchive._id)') &&
        archiveScript.includes('window.setTimeout(() => link.remove(), 60000)') &&
        !archiveScript.includes('URL.revokeObjectURL'),
    'archive downloads must use the authenticated attachment endpoint'
);
assert(
    aiAssistantScript.includes('export function restorePocImages') &&
        aiAssistantScript.includes('const placeholderPattern') &&
        aiAssistantScript.includes('return imageTags[index]'),
    'PoC AI results must restore original images from numbered placeholders'
);
assert(
    vulnerabilitiesScript.includes('if (status === 2) return 0; // Updates') &&
        vulnerabilitiesScript.includes('if (status === 1) return 1; // New') &&
        vulnerabilitiesScript.includes('const statusDifference = statusPriority(a) - statusPriority(b)') &&
        vulnerabilitiesScript.includes('return descending ? -comparison : comparison'),
    'vulnerability sorting must keep Updates first and New second without reversing those groups'
);
assert(
    vulnerabilitiesTemplate.includes('class="vuln-column-resizer"') &&
        vulnerabilitiesTemplate.includes('startColumnResize(col.name, $event)') &&
        vulnerabilitiesTemplate.includes(`columnStyle('title')`) &&
        vulnerabilitiesScript.includes('VULNERABILITY_COLUMN_WIDTHS_KEY') &&
        vulnerabilitiesScript.includes('localStorage.setItem(VULNERABILITY_COLUMN_WIDTHS_KEY') &&
        vulnerabilitiesComponent.includes('--vulnerability-table-width'),
    'vulnerability columns must be drag-resizable, persisted, and applied to all table rows'
);

const settingsBundle = fs.readdirSync(bundleDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(bundleDir, name), 'utf8'))
    .find((content) => content.includes('aiFieldPromptFields'));

assert(settingsBundle, 'production build must contain the settings component');
assert(
    !settingsBundle.includes('.field.labelKey'),
    'compiled settings render must not read field as an undefined component property'
);
assert(
    /renderList\)\([^)]*\.aiFieldPromptFields/.test(settingsBundle),
    'compiled settings render must iterate over aiFieldPromptFields'
);

console.log('Settings template render regression test passed');
