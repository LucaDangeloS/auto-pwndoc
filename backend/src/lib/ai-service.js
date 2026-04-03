'use strict';

const { ChatOpenAI, AzureChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

const DEFAULT_SYSTEM_PROMPTS = {
    generate: `You are a cybersecurity expert writing professional penetration test reports.
Generate clear, technical content for a "{fieldName}" section of a finding.
The content should be in HTML format using only simple tags: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not include any markdown, backticks, or code fences. Output only the HTML fragment, no wrapping document tags.`,

    complete: `You are a cybersecurity expert writing professional penetration test reports.
Continue the following "{fieldName}" text naturally, maintaining the same technical tone and style.
Output only the continuation as an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not repeat the existing content. Do not include markdown or code fences.`,

    rewrite: `You are a cybersecurity expert writing professional penetration test reports.
Rewrite the following "{fieldName}" text to be clearer, more concise, and more professional.
Output only the rewritten content as an HTML fragment using: <p>, <ul>, <li>, <strong>, <em>, <code>.
Do not include markdown or code fences.`
};

const DEFAULT_USER_PROMPTS = {
    generate: `Finding title: "{findingTitle}"
Field: {fieldName}
{similarVulnsBlock}
Generate the {fieldName} content for this finding.`,

    complete: `Finding title: "{findingTitle}"
Field: {fieldName}
{similarVulnsBlock}
Existing content:
{text}

Continue from where the content ends.`,

    rewrite: `Finding title: "{findingTitle}"
Field: {fieldName}
Content to rewrite:
{text}`
};

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

    const systemTemplate = priv.systemPrompt || DEFAULT_SYSTEM_PROMPTS[action] || DEFAULT_SYSTEM_PROMPTS.generate;
    const userTemplate = priv.userPrompt || DEFAULT_USER_PROMPTS[action] || DEFAULT_USER_PROMPTS.generate;

    const systemContent = fillTemplate(systemTemplate, { fieldName, findingTitle });
    const userContent = fillTemplate(userTemplate, { fieldName, findingTitle, text: text || '', similarVulnsBlock });

    const messages = [
        new SystemMessage(systemContent),
        new HumanMessage(userContent)
    ];

    const response = await chatModel.invoke(messages);
    const raw = response.content || '';

    const html = raw
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    return { html };
}

module.exports = { generate };
