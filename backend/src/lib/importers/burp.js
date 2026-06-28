// Burp Suite XML report importer.
//
// Burp exports an <issues> root with one <issue> per detected instance. Rich
// text fields (issueBackground, remediationBackground, ...) are already HTML
// (wrapped in CDATA) and drop straight into the finding editor. Burp does not
// provide a CVSS vector, only a severity label, so cvssv3 is left empty for the
// analyst to fill — the severity/confidence labels are surfaced in the
// observation so they know what to set.

const { XMLParser } = require('fast-xml-parser');
const { textToHtml, preBlock, decodeBase64, nodeText, extractLinks } = require('./html');

const SEVERITY_RANK = { 'High': 4, 'Medium': 3, 'Low': 2, 'Information': 1, 'False positive': 0 };
// Bound embedded evidence so a single finding cannot grow into a multi-hundred-KB
// document that would choke the rich-text editor on load.
const MAX_HTTP_CHARS = 6000;   // per request/response message
const MAX_INSTANCES = 20;      // grouped instances embedded in observation/PoC

function asArray(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
}

function buildPoc(issue) {
    var blocks = [];
    asArray(issue.requestresponse).forEach(rr => {
        if (!rr) return;
        ['request', 'response'].forEach(kind => {
            var node = rr[kind];
            if (!node) return;
            var isB64 = node && typeof node === 'object' && String(node['@_base64']) === 'true';
            var raw = nodeText(node);
            var text = isB64 ? decodeBase64(raw) : raw;
            if (text) blocks.push('<p><strong>' + kind.toUpperCase() + '</strong></p>' + preBlock(text, MAX_HTTP_CHARS));
        });
    });
    return blocks.join('');
}

function parse(xmlText, options) {
    var opts = Object.assign({ groupByVuln: true, includePoc: true, skipFalsePositives: true }, options || {});

    var parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseTagValue: false,
        trimValues: true
    });

    var doc = parser.parse(xmlText);
    if (!doc || !doc.issues) return [];

    var issues = asArray(doc.issues.issue);
    var entries = [];

    issues.forEach(issue => {
        var severity = nodeText(issue.severity) || 'Information';
        if (opts.skipFalsePositives && severity === 'False positive') return;

        var host = nodeText(issue.host);
        var path = nodeText(issue.path);
        var scope = (host + (path || '')).trim();

        var references = extractLinks(nodeText(issue.references) + ' ' + nodeText(issue.vulnerabilityClassifications));

        var observationParts = [];
        observationParts.push(textToHtml('Burp severity: ' + severity +
            (nodeText(issue.confidence) ? ' | Confidence: ' + nodeText(issue.confidence) : '') +
            (nodeText(issue.location) ? '\nLocation: ' + nodeText(issue.location) : '')));
        if (nodeText(issue.issueDetail)) observationParts.push(nodeText(issue.issueDetail));

        entries.push({
            type: nodeText(issue.type) || nodeText(issue.name),
            severity: severity,
            title: nodeText(issue.name),
            description: nodeText(issue.issueBackground),
            observation: observationParts.filter(Boolean).join(''),
            remediation: [nodeText(issue.remediationBackground), nodeText(issue.remediationDetail)].filter(Boolean).join(''),
            poc: opts.includePoc ? buildPoc(issue) : '',
            references: references,
            scope: scope
        });
    });

    return opts.groupByVuln ? groupByType(entries) : entries.map(toFinding);
}

function toFinding(e) {
    return {
        title: e.title,
        description: e.description,
        observation: e.observation,
        remediation: e.remediation,
        poc: e.poc,
        references: e.references,
        cvssv3: '',
        scope: e.scope,
        taxonomies: []
    };
}

// Burp emits one issue per instance; collapse instances of the same issue type
// into a single finding, listing every affected URL and stacking each instance's
// observation/PoC.
function groupByType(entries) {
    var groups = new Map();
    entries.forEach(e => {
        var key = e.type;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    });

    var findings = [];
    groups.forEach(list => {
        var first = list[0];
        var topSeverity = list.reduce((a, b) => (SEVERITY_RANK[b.severity] || 0) > (SEVERITY_RANK[a.severity] || 0) ? b : a, first);
        var scopes = [];
        var references = [];
        list.forEach(e => {
            if (e.scope && scopes.indexOf(e.scope) === -1) scopes.push(e.scope);
            e.references.forEach(r => { if (references.indexOf(r) === -1) references.push(r); });
        });

        var observation = '';
        var poc = '';
        if (list.length === 1) {
            observation = first.observation;
            poc = first.poc;
        } else {
            var shown = list.slice(0, MAX_INSTANCES);
            var omitted = list.length - shown.length;
            var moreNote = omitted > 0 ? '<p><em>… and ' + omitted + ' more affected location(s) (see scope).</em></p>' : '';
            observation = shown.map(e => '<p><strong>' + e.scope + '</strong></p>' + e.observation).join('') + moreNote;
            poc = shown.map(e => e.poc ? '<p><strong>' + e.scope + '</strong></p>' + e.poc : '').filter(Boolean).join('') + moreNote;
        }

        findings.push({
            title: topSeverity.title,
            description: first.description,
            observation: observation,
            remediation: first.remediation,
            poc: poc,
            references: references,
            cvssv3: '',
            scope: scopes.join('\n'),
            taxonomies: []
        });
    });
    return findings;
}

module.exports = { parse };
