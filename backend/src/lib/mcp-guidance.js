'use strict';

const DEFAULT_MCP_GUIDANCE = {
    general: `This server edits penetration-test audits. When you create or change finding content, match the style the rest of the report is written in, unless the user explicitly asks for something different.

Use formal, impersonal, technically precise language. Executive and severity prose may be slightly more management-facing. These are defaults to keep new and edited content consistent with the existing report; explicit user instructions always take precedence.`,

    evidence: `Ground every statement in evidence actually present in the audit or finding. Do not invent affected assets, endpoints, software versions, CVEs, credentials, payloads, observed responses, exploitation results, severities, or CVSS values. Use conditional language for consequences that are not explicitly confirmed.

The poc field is the primary evidence field. Always populate it when documenting a finding, and keep it limited to the tested entry point or service, the action performed, and the observable result.`,

    html: `Write finding text fields as valid HTML, never Markdown. This applies to description, poc, observation, remediation, and retestEvidence.

Use <p> for paragraphs, <strong>/<em> for emphasis, <pre><code> for code blocks, <ul>/<ol>/<li> for lists, and <a href="..."> for links. Keep literal commands, requests, payloads, and values inside <code> or <pre><code>.`,

    fieldStyle: `Per-field house style:
- description: ~90-140 words, normally two short paragraphs. Cover the vulnerable condition, why it is insecure, a realistic attack scenario, and the principal potential impact. Do not include reproduction steps or remediation.
- observation: ~45-90 words recording only target-specific conditions actually observed. Do not include generic theory, reproduction steps, or remediation. Leave blank if there is no evidence for it.
- poc: a concise, reproducible sequence with the tested entry point or service, the action performed, and the observable result. Evidence only.
- remediation: one short recommendation paragraph, then 3-5 actionable <li> items ordered from the definitive fix to secure configuration/least privilege, compensating controls, and validation. Recommend a currently supported vendor-fixed release without inventing a version number.
- retestEvidence: state what was retested, the observed result, and whether the original weakness remains reproducible, distinguishing a full correction from a partial mitigation. Never infer pass/fail without explicit retest evidence.`,

    libraryUsage: `Prefer existing library wording before writing a finding from scratch. Use search_similar_vulnerabilities or list_vulnerabilities to find a relevant entry, then apply_vulnerability_to_finding when the library entry matches the finding context. After applying library content, adjust only the target-specific evidence and wording that the user or audit evidence supports.`,

    findingFields: `Finding fields (all optional except title on create):
  title                 (string, plain text) Vulnerability title.
  description           (string, HTML) What the vulnerability is and how it was identified.
  poc                   (string, HTML) Proof of concept: reproduction steps, tool output, payloads, screenshots.
  observation           (string, HTML) Additional analyst notes or context. Leave blank unless the user explicitly asks for it.
  remediation           (string, HTML) Recommended fix or mitigation.
  references            (array of strings) URLs or identifiers such as CVEs, CWEs, or security advisories.
  cvssv3                (string) CVSS 3.1 vector, e.g. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H".
  cvssv4                (string) CVSS 4.0 vector, e.g. "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N".
  priority              (integer 1-4) Remediation priority: 1=Low 2=Medium 3=High 4=Urgent.
  remediationComplexity (integer 1-3) Fix effort: 1=Low 2=Medium 3=High.
  status                (integer) 0=Completed 1=In progress (default) 2=For review 3=Improvement needed.
  taxonomies            (array of {type, category, subcategory}) Vulnerability classification.
  retestEvidence        (string, HTML) Retest observations for retest audits: what was retested and the observed result.
  retestStatus          (string) Retest outcome: "ok"=fixed, "ko"=still vulnerable, "partial"=partially mitigated, "unknown"=not retested (default). Never set ok/ko/partial without explicit retest evidence.`
};

function normalizeMcpGuidance(guidance) {
    const source = guidance || {};
    return Object.keys(DEFAULT_MCP_GUIDANCE).reduce((acc, key) => {
        acc[key] = typeof source[key] === 'string' && source[key].trim()
            ? source[key]
            : DEFAULT_MCP_GUIDANCE[key];
        return acc;
    }, {});
}

function section(title, text) {
    return `${title}:\n${text}`;
}

function buildReportStyleGuide(guidance) {
    const g = normalizeMcpGuidance(guidance);
    return [
        section('General conventions', g.general),
        section('Evidence and traceability', g.evidence),
        section('HTML formatting', g.html),
        section('Per-field house style', g.fieldStyle),
        section('Vulnerability library usage', g.libraryUsage)
    ].join('\n\n');
}

function buildFindingFieldsDoc(guidance) {
    const g = normalizeMcpGuidance(guidance);
    return [
        g.findingFields,
        section('HTML format', g.html),
        section('Style defaults', g.fieldStyle),
        section('Evidence rules', g.evidence)
    ].join('\n\n');
}

module.exports = {
    DEFAULT_MCP_GUIDANCE,
    normalizeMcpGuidance,
    buildReportStyleGuide,
    buildFindingFieldsDoc
};
