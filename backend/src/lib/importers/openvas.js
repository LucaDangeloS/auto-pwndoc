// OpenVAS / Greenbone (GVM) report importer. Accepts both the XML report
// (<report><results><result>...) and the flat CSV export.
//
// One scanner result is emitted per NVT per host:port. By default results of the
// same NVT are grouped into a single finding listing every affected host. As
// with Burp, no CVSS vector is written to cvssv3 — OpenVAS' cvss_base_vector may
// be CVSS v2 or v3 depending on version, so it is surfaced as text in the
// observation and the analyst sets the vector manually.

const { XMLParser } = require('fast-xml-parser');
const Papa = require('papaparse');
const { textToHtml, preBlock, nodeText } = require('./html');

// Bound embedded evidence so a single grouped finding stays editor-friendly.
const MAX_POC_CHARS = 6000;   // per specific-result block
const MAX_INSTANCES = 30;     // grouped host results embedded in the PoC

function asArray(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
}

function parse(text, options) {
    var opts = Object.assign({ groupByVuln: true, skipInformational: false }, options || {});
    var trimmed = String(text || '').trimStart();
    var entries = trimmed.charAt(0) === '<' ? parseXml(trimmed, opts) : parseCsv(trimmed, opts);
    return opts.groupByVuln ? groupByNvt(entries) : entries.map(toFinding);
}

// Recursively locate the first `results.result` collection in the parsed XML
// (GVM nests <report> inside <get_reports_response><report>).
function findResults(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.results && obj.results.result) return asArray(obj.results.result);
    for (var k of Object.keys(obj)) {
        var found = findResults(obj[k]);
        if (found) return found;
    }
    return null;
}

function parseTags(tagStr) {
    var tags = {};
    String(tagStr || '').split('|').forEach(pair => {
        var idx = pair.indexOf('=');
        if (idx > 0) tags[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    });
    return tags;
}

function parseXml(xmlText, opts) {
    var parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, trimValues: true });
    var doc = parser.parse(xmlText);
    var results = findResults(doc) || [];

    var entries = [];
    results.forEach(r => {
        var nvt = r.nvt || {};
        var tags = parseTags(nodeText(nvt.tags));
        var threat = nodeText(r.threat);
        var severity = nodeText(r.severity);
        if (opts.skipInformational && (threat === 'Log' || parseFloat(severity) <= 0)) return;

        var hostNode = r.host;
        var ip = nodeText(hostNode);
        var hostname = (hostNode && typeof hostNode === 'object') ? nodeText(hostNode.hostname) : '';
        var port = nodeText(r.port);
        var refs = [];
        asArray(nvt.refs && nvt.refs.ref).forEach(ref => {
            var id = ref && ref['@_id'];
            if (id && refs.indexOf(id) === -1) refs.push(id);
        });

        entries.push(buildEntry({
            oid: nvt['@_oid'] || nodeText(nvt.name) || nodeText(r.name),
            title: nodeText(nvt.name) || nodeText(r.name),
            summary: tags.summary,
            insight: tags.insight,
            impact: tags.impact,
            affected: tags.affected,
            solution: tags.solution || nodeText(nvt.solution),
            vuldetect: tags.vuldetect,
            qod: nodeText(r.qod && r.qod.value),
            cvss: nodeText(nvt.cvss_base) || severity,
            vector: tags.cvss_base_vector,
            threat: threat,
            specific: nodeText(r.description),
            refs: refs,
            scope: formatScope(ip, hostname, port)
        }));
    });
    return entries;
}

function parseCsv(csvText, opts) {
    var parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    var get = (row, names) => {
        for (var n of names) if (row[n] != null && row[n] !== '') return row[n];
        return '';
    };

    var entries = [];
    (parsed.data || []).forEach(row => {
        var severity = get(row, ['Severity', 'CVSS']);
        if (opts.skipInformational && (parseFloat(severity) <= 0)) return;
        var refs = get(row, ['CVEs']).split(/[,\s]+/).filter(Boolean);

        entries.push(buildEntry({
            oid: get(row, ['NVT OID', 'NVT Name']),
            title: get(row, ['NVT Name']),
            summary: get(row, ['Summary']),
            insight: get(row, ['Vulnerability Insight']),
            impact: get(row, ['Impact']),
            affected: get(row, ['Affected Software/OS']),
            solution: get(row, ['Solution']),
            vuldetect: get(row, ['Vulnerability Detection Method']),
            qod: get(row, ['QoD']),
            cvss: get(row, ['CVSS']),
            vector: '',
            threat: get(row, ['Severity']),
            specific: get(row, ['Specific Result']),
            refs: refs,
            scope: formatScope(get(row, ['IP']), get(row, ['Hostname']), get(row, ['Port']))
        }));
    });
    return entries;
}

function formatScope(ip, hostname, port) {
    var host = ip || hostname || '';
    if (ip && hostname && hostname !== ip) host = ip + ' (' + hostname + ')';
    return port ? host + ':' + port : host;
}

function buildEntry(d) {
    var observationText = [
        d.threat ? 'Threat: ' + d.threat : '',
        d.cvss ? 'CVSS base: ' + d.cvss : '',
        d.vector ? 'CVSS vector: ' + d.vector : '',
        d.qod ? 'Quality of Detection: ' + d.qod + '%' : '',
        d.affected ? '\nAffected: ' + d.affected : '',
        d.vuldetect ? '\nDetection: ' + d.vuldetect : ''
    ].filter(Boolean).join('\n');

    return {
        oid: d.oid,
        title: d.title,
        description: [d.summary, d.insight, d.impact].filter(Boolean).join('\n\n'),
        observation: observationText,
        remediation: d.solution || '',
        poc: d.specific || '',
        references: d.refs || [],
        scope: d.scope
    };
}

function toFinding(e) {
    return {
        title: e.title,
        description: textToHtml(e.description),
        observation: textToHtml(e.observation),
        remediation: textToHtml(e.remediation),
        poc: e.poc ? preBlock(e.poc, MAX_POC_CHARS) : '',
        references: e.references,
        cvssv3: '',
        scope: e.scope,
        taxonomies: []
    };
}

function groupByNvt(entries) {
    var groups = new Map();
    entries.forEach(e => {
        var key = e.oid || e.title;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    });

    var findings = [];
    groups.forEach(list => {
        var first = list[0];
        var scopes = [];
        var references = [];
        list.forEach(e => {
            if (e.scope && scopes.indexOf(e.scope) === -1) scopes.push(e.scope);
            e.references.forEach(r => { if (references.indexOf(r) === -1) references.push(r); });
        });

        var poc;
        if (list.length === 1) {
            poc = first.poc ? preBlock(first.poc, MAX_POC_CHARS) : '';
        } else {
            var shown = list.slice(0, MAX_INSTANCES);
            var omitted = list.length - shown.length;
            poc = shown.map(e => e.poc ? '<p><strong>' + e.scope + '</strong></p>' + preBlock(e.poc, MAX_POC_CHARS) : '').filter(Boolean).join('');
            if (omitted > 0) poc += '<p><em>… and ' + omitted + ' more affected host(s) (see scope).</em></p>';
        }

        findings.push({
            title: first.title,
            description: textToHtml(first.description),
            observation: textToHtml(first.observation),
            remediation: textToHtml(first.remediation),
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
