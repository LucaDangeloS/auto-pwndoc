// Dispatcher for scanner report importers. Each importer turns a raw report
// (string) into an array of finding drafts shaped like the create-finding body.

const burp = require('./burp');
const openvas = require('./openvas');

const IMPORTERS = {
    burp: burp,
    openvas: openvas
};

function parseReport(tool, content, options) {
    var importer = IMPORTERS[tool];
    if (!importer) throw { fn: 'BadParameters', message: 'Unknown import tool: ' + tool };
    if (!content || !String(content).trim()) throw { fn: 'BadParameters', message: 'Empty report content' };

    var drafts;
    try {
        drafts = importer.parse(content, options || {});
    } catch (e) {
        throw { fn: 'BadParameters', message: 'Failed to parse ' + tool + ' report: ' + (e && e.message ? e.message : e) };
    }
    return (drafts || []).filter(d => d && d.title);
}

module.exports = { parseReport, tools: Object.keys(IMPORTERS) };
