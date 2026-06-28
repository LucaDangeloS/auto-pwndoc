// Shared helpers for the scanner importers. The audit finding fields are stored
// as HTML (they are edited with TipTap), so plain-text scanner output is wrapped
// into simple HTML and base64 HTTP messages are decoded into <pre> blocks.

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Turn plain text into HTML paragraphs. Blank lines separate paragraphs, single
// newlines become <br>. Returns '' for empty input so callers can skip the field.
function textToHtml(str) {
    var text = String(str == null ? '' : str).replace(/\r\n/g, '\n').trim();
    if (!text) return '';
    return text
        .split(/\n{2,}/)
        .map(block => '<p>' + escapeHtml(block).replace(/\n/g, '<br>') + '</p>')
        .join('');
}

// Truncate long text, appending a marker so the analyst knows it was cut.
function truncate(str, max) {
    var text = String(str == null ? '' : str);
    if (!max || text.length <= max) return text;
    return text.slice(0, max) + '\n… [truncated, ' + (text.length - max) + ' more characters]';
}

// Wrap text (e.g. a decoded HTTP request/response) into a monospaced block.
// `max` bounds the embedded length so a single field cannot grow unbounded and
// choke the rich-text editor.
function preBlock(str, max) {
    var text = truncate(String(str == null ? '' : str).replace(/\r\n/g, '\n').trimEnd(), max);
    if (!text) return '';
    return '<pre><code>' + escapeHtml(text) + '</code></pre>';
}

function decodeBase64(str) {
    try {
        return Buffer.from(String(str || ''), 'base64').toString('utf8');
    } catch (e) {
        return '';
    }
}

// fast-xml-parser yields either a string or an object with a '#text' key
// (when a node carries attributes). Normalise both to a string.
function nodeText(node) {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number' || typeof node === 'boolean') return String(node);
    if (typeof node === 'object' && '#text' in node) return String(node['#text']);
    return '';
}

// Collect http/https links from an HTML blob (Burp references are an HTML list).
function extractLinks(html) {
    var out = [];
    var str = String(html || '');
    var re = /https?:\/\/[^\s"'<>)]+/g;
    var m;
    while ((m = re.exec(str)) !== null) {
        var url = m[0].replace(/[.,;]+$/, '');
        if (out.indexOf(url) === -1) out.push(url);
    }
    return out;
}

module.exports = { escapeHtml, textToHtml, preBlock, truncate, decodeBase64, nodeText, extractLinks };
