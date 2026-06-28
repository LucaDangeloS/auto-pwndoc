const fs = require('fs');
const path = require('path');
const { parseReport } = require('../src/lib/importers');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('Burp Suite importer', () => {
    const findings = parseReport('burp', fixture('burp-sample.xml'), {});

    test('groups issue instances of the same type into one finding', () => {
        const xss = findings.find(f => f.title === 'Cross-site scripting (reflected)');
        expect(xss).toBeDefined();
        expect(xss.scope.split('\n')).toHaveLength(2);
    });

    test('decodes base64 request/response into the PoC', () => {
        const xss = findings.find(f => f.title === 'Cross-site scripting (reflected)');
        expect(xss.poc).toMatch(/GET \/search/);
    });

    test('extracts reference links and leaves cvss empty', () => {
        const xss = findings.find(f => f.title === 'Cross-site scripting (reflected)');
        expect(xss.references).toContain('https://cwe.mitre.org/data/definitions/79.html');
        expect(xss.cvssv3).toBe('');
    });

    test('skips false positives but keeps informational issues by default', () => {
        expect(findings.find(f => /Frameable/.test(f.title))).toBeDefined();
    });

    test('truncates oversized request/response so a finding stays editor-friendly', () => {
        const huge = Buffer.from('GET / HTTP/1.1\n' + 'A'.repeat(200000)).toString('base64');
        const xml =
            '<issues><issue><serialNumber>1</serialNumber><type>1</type>' +
            '<name>Big</name><host ip="1.1.1.1">https://x</host><path>/</path>' +
            '<location>/</location><severity>Low</severity><confidence>Firm</confidence>' +
            '<requestresponse><request base64="true">' + huge + '</request></requestresponse>' +
            '</issue></issues>';
        const f = parseReport('burp', xml, {});
        expect(f).toHaveLength(1);
        expect(f[0].poc).toMatch(/truncated/);
        expect(f[0].poc.length).toBeLessThan(20000);
    });
});

describe('OpenVAS importer', () => {
    test('groups an NVT across hosts and skips Log entries', () => {
        const findings = parseReport('openvas', fixture('openvas-sample.xml'), { skipInformational: true });
        expect(findings).toHaveLength(1);
        const tls = findings[0];
        expect(tls.scope.split('\n')).toHaveLength(2);
        expect(tls.references).toContain('CVE-2011-3389');
        expect(tls.cvssv3).toBe('');
        expect(tls.remediation).toMatch(/Disable TLSv1.0/);
    });

    test('keeps Log entries when skipInformational is false', () => {
        const findings = parseReport('openvas', fixture('openvas-sample.xml'), { skipInformational: false });
        expect(findings.length).toBe(2);
    });
});
