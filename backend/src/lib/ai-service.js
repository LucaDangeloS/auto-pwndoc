'use strict';

const { ChatOpenAI, AzureChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

const DEFAULT_SYSTEM_PROMPTS = {
    generate: `You are a cybersecurity expert writing professional penetration test reports.
Generate clear, technical content for the "{fieldName}" section of a finding titled "{findingTitle}".
The content should be in HTML format using only simple tags: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not include any markdown, backticks, or code fences. Output only the HTML fragment, no wrapping document tags.
Reply exclusively in {language}.`,

    complete: `You are a cybersecurity expert writing professional penetration test reports.
Continue the "{fieldName}" section of the finding titled "{findingTitle}" naturally, maintaining the same technical tone and style.
Output only the continuation as an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not repeat the existing content. Do not include markdown or code fences.
Reply exclusively in {language}.`,

    rewrite: `You are a cybersecurity expert writing professional penetration test reports.
Rewrite the "{fieldName}" section of the finding titled "{findingTitle}" to be clearer, more concise, and more professional.
Output only the rewritten content as an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not include markdown or code fences.
Reply exclusively in {language}.`,

    'fill-proofs': `You are a cybersecurity expert writing professional penetration test reports.
You will receive a proof-of-concept analysis of screenshots and evidence, along with the selected vulnerability details.
Your task is to write the Proof of Concept (poc) section that narrates the exploitation steps demonstrated in the images.

Rules:
- Output an HTML fragment using only: <p>, <ul>, <li>, <strong>, <em>, <code>, <img>
- Do NOT use markdown, backticks, or code fences
- Integrate the provided <img> tags at natural, logical positions within the narrative text
- The <img> tags must appear EXACTLY as provided (do not modify src attributes)
- Use the vulnerability title and description as context for accurate technical language
- Write in third person past tense (e.g. "The tester navigated to...", "It was observed that...")
- Be concise but technically precise
Reply exclusively in {language}.`,

    'executive-summary': `You are a cybersecurity expert writing executive summaries for professional penetration test reports.
Your target audience is management and non-technical stakeholders.
Write a concise, high-level executive summary of the overall security posture of the engagement.
The summary should convey the overall risk, the most critical issues, and the business impact without excessive technical jargon.
Output only an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>.
Do not include markdown, backticks, or code fences.
Reply exclusively in {language}.`,

    'severity-summary': `You are a cybersecurity expert writing penetration test reports.
Summarise the {severity}-severity vulnerabilities found during the engagement in one concise paragraph.
Focus on common patterns, attack vectors, and the collective business impact of this group.
Output only an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not include markdown, backticks, or code fences.
Reply exclusively in {language}.`
};

const DEFAULT_USER_PROMPTS = {
    generate: `Finding title: "{findingTitle}"
Field to generate: {fieldName}
{similarVulnsBlock}
Write the {fieldName} content for this finding. Reply in {language}.`,

    complete: `Finding title: "{findingTitle}"
Field: {fieldName}
{similarVulnsBlock}
Existing content:
{text}

Continue from where the content ends. Reply in {language}.`,

    rewrite: `Finding title: "{findingTitle}"
Field: {fieldName}
Content to rewrite:
{text}

Reply in {language}.`,

    'fill-proofs': `Vulnerability: "{findingTitle}"
Vulnerability description: {vulnDescription}

Proof analysis from images:
{visionSummary}

Image references to integrate (use these exact <img> tags in the output):
{imageRefsBlock}

Write the proof of concept narrative for this finding, integrating the images at appropriate positions. Reply in {language}.`,

    'executive-summary': `Audit: "{auditName}"
Findings (title, severity and CVSS score):
{findingsDigest}

Write the executive summary for this penetration test engagement. Reply in {language}.`,

    'severity-summary': `Audit: "{auditName}"
Severity level: {severity}
{severity}-severity findings (title and CVSS score):
{findingsDigest}

Write a concise summary paragraph for all {severity}-severity findings in this audit. Reply in {language}.`
};

function localeToLanguage(locale) {
    if (!locale) return 'English';
    try {
        const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
        const tag = locale.replace('_', '-');
        const name = displayNames.of(tag);
        return name || locale;
    } catch (_) {
        return locale;
    }
}

function ensureV1(url) {
    if (!url) return url;
    const trimmed = url.replace(/\/+$/, '');
    return trimmed.endsWith('/v1') ? trimmed : trimmed + '/v1';
}

function buildChatModel(aiConfig) {
    const { provider, model, temperature, maxTokens, apiUrl, apiKey, azure } = aiConfig;

    switch (provider) {
        case 'azure-openai':
            return new AzureChatOpenAI({
                model: (azure && azure.deploymentName) || model,
                temperature: temperature,
                maxTokens: maxTokens,
                apiKey: apiKey || undefined,
                azureOpenAIApiInstanceName: apiUrl ? new URL(apiUrl).hostname.split('.')[0] : undefined,
                azureOpenAIApiDeploymentName: (azure && azure.deploymentName) || model,
                azureOpenAIApiVersion: (azure && azure.apiVersion) || '2024-06-01'
            });

        case 'ollama':
            return new ChatOpenAI({
                model: model,
                temperature: temperature,
                maxTokens: maxTokens,
                apiKey: 'ollama',
                configuration: { baseURL: ensureV1(apiUrl || 'http://ollama:11434') }
            });

        case 'anthropic':
            return new ChatOpenAI({
                model: model,
                temperature: temperature,
                maxTokens: maxTokens,
                apiKey: apiKey || 'anthropic',
                configuration: { baseURL: ensureV1(apiUrl || 'https://api.anthropic.com') }
            });

        case 'openai-compatible':
            return new ChatOpenAI({
                model: model,
                temperature: temperature,
                maxTokens: maxTokens,
                apiKey: apiKey || 'none',
                configuration: { baseURL: ensureV1(apiUrl || 'http://localhost:11434') }
            });

        case 'openai':
        default:
            return new ChatOpenAI({
                model: model,
                temperature: temperature,
                maxTokens: maxTokens,
                apiKey: apiKey || undefined,
                configuration: apiUrl ? { baseURL: ensureV1(apiUrl) } : {}
            });
    }
}

function fillTemplate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] !== undefined ? vars[key] : '');
}

function buildImageRefsBlock(imageDescriptions) {
    if (!imageDescriptions || imageDescriptions.length === 0) return '';
    return imageDescriptions.map(img => {
        const imgTag = `<img src="${img.src}" alt="Image ${img.index}" />`;
        const desc = img.description ? ` — ${img.description}` : '';
        return `Image ${img.index}${desc}\n${imgTag}`;
    }).join('\n\n');
}

function buildSimilarVulnsBlock(similarVulns) {
    if (!similarVulns || similarVulns.length === 0) return '';
    const lines = similarVulns
        .map((v, i) => `${i + 1}. ${v.title}${v.category ? ` (category: ${v.category})` : ''}${v.vulnType ? `, type: ${v.vulnType}` : ''}`)
        .join('\n');
    return `\nSimilar vulnerabilities from our database for reference:\n${lines}\n`;
}

async function generate({ action, text, fieldName, context, aiSettings }) {
    const pub = aiSettings.public;
    const priv = aiSettings.private;

    const aiConfig = {
        provider: pub.provider || 'openai',
        model: pub.model || 'gpt-4o',
        temperature: pub.temperature !== undefined ? pub.temperature : 0.7,
        maxTokens: pub.maxTokens || 4096,
        apiUrl: priv.apiUrl || '',
        apiKey: priv.apiKey || '',
        azure: priv.azure || {}
    };

    const chatModel = buildChatModel(aiConfig);

    const findingTitle = (context && context.findingTitle) || '';
    const similarVulns = (context && context.similarVulns) || [];
    const similarVulnsBlock = buildSimilarVulnsBlock(similarVulns);
    const visionSummary = (context && context.visionSummary) || '';
    const vulnDescription = (context && context.vulnDescription) || '';
    const imageRefsBlock = buildImageRefsBlock(context && context.imageDescriptions);
    const auditName = (context && context.auditName) || '';
    const severity = (context && context.severity) || '';
    const findingsDigest = (context && context.findingsDigest) || '';
    const locale = (context && context.locale) || '';
    const language = localeToLanguage(locale);

    const SUPPORTED_FIELDS = ['description', 'observation', 'remediation', 'poc', 'retestEvidence'];

    let systemTemplate, userTemplate;
    if (action === 'generate') {
        const fieldKey = SUPPORTED_FIELDS.includes(fieldName) ? `field_${fieldName}_generateSystemPrompt` : null;
        systemTemplate = (fieldKey && priv[fieldKey]) || priv.generateSystemPrompt || DEFAULT_SYSTEM_PROMPTS.generate;
        userTemplate = priv.generateUserPrompt || DEFAULT_USER_PROMPTS.generate;
    } else if (action === 'complete') {
        const fieldKey = SUPPORTED_FIELDS.includes(fieldName) ? `field_${fieldName}_completeSystemPrompt` : null;
        systemTemplate = (fieldKey && priv[fieldKey]) || priv.completeSystemPrompt || DEFAULT_SYSTEM_PROMPTS.complete;
        userTemplate = priv.completeUserPrompt || DEFAULT_USER_PROMPTS.complete;
    } else if (action === 'rewrite') {
        const fieldKey = SUPPORTED_FIELDS.includes(fieldName) ? `field_${fieldName}_rewriteSystemPrompt` : null;
        systemTemplate = (fieldKey && priv[fieldKey]) || priv.rewriteSystemPrompt || DEFAULT_SYSTEM_PROMPTS.rewrite;
        userTemplate = priv.rewriteUserPrompt || DEFAULT_USER_PROMPTS.rewrite;
    } else if (action === 'fill-proofs') {
        systemTemplate = priv.fillProofsSystemPrompt || DEFAULT_SYSTEM_PROMPTS['fill-proofs'];
        userTemplate = DEFAULT_USER_PROMPTS['fill-proofs'];
    } else if (action === 'executive-summary') {
        systemTemplate = priv.executiveSummarySystemPrompt || DEFAULT_SYSTEM_PROMPTS['executive-summary'];
        userTemplate = DEFAULT_USER_PROMPTS['executive-summary'];
    } else if (action === 'severity-summary') {
        systemTemplate = priv.severitySummarySystemPrompt || DEFAULT_SYSTEM_PROMPTS['severity-summary'];
        userTemplate = DEFAULT_USER_PROMPTS['severity-summary'];
    } else {
        systemTemplate = DEFAULT_SYSTEM_PROMPTS.generate;
        userTemplate = DEFAULT_USER_PROMPTS.generate;
    }

    const systemContent = fillTemplate(systemTemplate, { fieldName, findingTitle, auditName, severity, language });
    const userContent = fillTemplate(userTemplate, { fieldName, findingTitle, text: text || '', similarVulnsBlock, visionSummary, vulnDescription, imageRefsBlock, auditName, severity, findingsDigest, language });

    const messages = [
        new SystemMessage(systemContent),
        new HumanMessage(userContent)
    ];

    const response = await chatModel.invoke(messages);
    const raw = response.content || response.additional_kwargs?.reasoning_content || '';

    const html = raw
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    return { html };
}

module.exports = { generate };
