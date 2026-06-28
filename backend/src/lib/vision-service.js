'use strict';

const { ChatOpenAI, AzureChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const OpenWebUIProvider = require('./openwebui-provider');

const DEFAULT_VISION_SYSTEM_PROMPT = `You are a cybersecurity expert analyzing proof-of-concept evidence for a penetration test report.
Examine all provided proof text and any attached images carefully.
Describe in technical detail what the evidence demonstrates, focusing on:
- What vulnerability or security weakness is being demonstrated
- What the tester observed, performed, or achieved
- Any sensitive information visible or described (e.g. responses, error messages, system information, credentials)
- The overall attack flow or exploitation chain if multiple evidence items are present

Produce a structured analysis with:
1. A concise overall summary of the vulnerability being demonstrated (2-4 sentences)
2. A per-image description labelled clearly only when images are provided (e.g. "Image 1:", "Image 2:")

If only text is provided, analyze the text as evidence. Do not ask for screenshots or say that analysis cannot be performed solely because images are absent.

Output plain text only. Do not use markdown headers or code fences.`;

const DEFAULT_VISION_ANONYMIZATION_PROMPT = `IMPORTANT: You must anonymize all sensitive information in your output. Replace the following with [REDACTED]:
- IP addresses (e.g. 192.168.1.1, 10.0.0.1)
- URLs, including schemes, ports, paths, query strings, and fragments
- Domain names and hostnames (e.g. example.com, server01.internal)
- Email addresses
- Usernames and account names
- Passwords or credentials
- API keys or tokens
- Company or product names that could identify the target`;

const DEFAULT_REGEX_RULES = [
    { name: 'URLs', pattern: '\\b(?:(?:https?|ftp):\\/\\/|www\\.)[A-Za-z0-9._~:/?#\\[\\]@!$&\'()*+,;=%-]*[A-Za-z0-9_~/#\\]=%-]', flags: 'gi', replacement: '[URL_REDACTED]', enabled: true },
    { name: 'IPv4 addresses', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', flags: 'g', replacement: '[IP_REDACTED]', enabled: true },
    { name: 'IPv6 addresses', pattern: '(?<![0-9A-Fa-f:])(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?:(?::[0-9A-Fa-f]{1,4}){1,6})|:(?:(?::[0-9A-Fa-f]{1,4}){1,7}|:))(?![0-9A-Fa-f:])', flags: 'g', replacement: '[IP_REDACTED]', enabled: true },
    { name: 'Email addresses', pattern: '\\b[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}\\b', flags: 'g', replacement: '[EMAIL_REDACTED]', enabled: true },
    { name: 'Domain names', pattern: '\\b(?:[a-zA-Z0-9\\-]+\\.){2,}[a-zA-Z]{2,}\\b', flags: 'g', replacement: '[DOMAIN_REDACTED]', enabled: true },
    { name: 'Common hostnames', pattern: '\\b(?:server|host|dc|ad|ws|pc|laptop|desktop|node|worker|master|slave|db|sql|web|app|api|proxy|vpn|fw|firewall|router|switch|lb)\\d*[-\\w]*', flags: 'gi', replacement: '[HOST_REDACTED]', enabled: true }
];

function ensureV1(url) {
    if (!url) return url;
    const trimmed = url.replace(/\/+$/, '');
    return trimmed.endsWith('/v1') ? trimmed : trimmed + '/v1';
}

function buildVisionModel(aiSettings) {
    const pub = aiSettings.visionPublic || {};
    const priv = aiSettings.private || {};
    const provider = pub.visionProvider || 'openai';
    const model = pub.visionModel || 'gpt-4o';
    const apiUrl = priv.visionApiUrl || '';
    const apiKey = priv.visionApiKey || '';
    const azure = priv.visionAzure || {};

    switch (provider) {
        case 'azure-openai':
            return new AzureChatOpenAI({
                model: azure.deploymentName || model,
                apiKey: apiKey || undefined,
                azureOpenAIApiInstanceName: apiUrl ? new URL(apiUrl).hostname.split('.')[0] : undefined,
                azureOpenAIApiDeploymentName: azure.deploymentName || model,
                azureOpenAIApiVersion: azure.apiVersion || '2024-06-01'
            });

        case 'ollama':
            return new ChatOpenAI({
                model: model,
                apiKey: 'ollama',
                configuration: { baseURL: ensureV1(apiUrl || 'http://ollama:11434') }
            });

        case 'anthropic':
            return new ChatOpenAI({
                model: model,
                apiKey: apiKey || 'anthropic',
                configuration: { baseURL: ensureV1(apiUrl || 'https://api.anthropic.com') }
            });

        case 'openai-compatible':
            return new ChatOpenAI({
                model: model,
                apiKey: apiKey || 'none',
                configuration: { baseURL: ensureV1(apiUrl || 'http://localhost:11434') }
            });

        case OpenWebUIProvider.PROVIDER:
            return new ChatOpenAI(OpenWebUIProvider.chatModelOptions({
                model: model,
                temperature: undefined,
                maxTokens: undefined,
                apiUrl: apiUrl,
                apiKey: apiKey
            }));

        case 'openai':
        default:
            return new ChatOpenAI({
                model: model,
                apiKey: apiKey || undefined,
                configuration: apiUrl ? { baseURL: ensureV1(apiUrl) } : {}
            });
    }
}

function parseProofHtml(pocHtml) {
    if (!pocHtml) return [];

    const segments = [];
    const imgRegex = /<img[^>]+src="([^"]*)"[^>]*>/gi;
    let lastIndex = 0;
    let match;
    let imageCounter = 0;

    while ((match = imgRegex.exec(pocHtml)) !== null) {
        const textBefore = pocHtml.slice(lastIndex, match.index);
        if (textBefore.trim()) {
            const plainText = textBefore.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (plainText) segments.push({ type: 'text', content: plainText });
        }

        const src = match[1];
        imageCounter++;
        const idMatch = src.match(/(?:^|\/)api\/images\/(?:download\/)?([^/?#]+)/) ||
            src.match(/^([a-f0-9]{24})$/i);
        const imageId = idMatch ? idMatch[1] : null;

        segments.push({
            type: 'image',
            src,
            imageId,
            index: imageCounter,
            markdownRef: `[Image ${imageCounter}](${src})`
        });

        lastIndex = match.index + match[0].length;
    }

    const textAfter = pocHtml.slice(lastIndex);
    if (textAfter.trim()) {
        const plainText = textAfter.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plainText) segments.push({ type: 'text', content: plainText });
    }

    return segments;
}

async function fetchImageBase64(imageId) {
    const Image = require('mongoose').model('Image');
    const img = await Image.findById(imageId).lean();
    if (!img || !img.value) return null;
    return img.value;
}

function compileRegexRule(rule) {
    const flags = (rule.flags || '').includes('g') ? rule.flags : `${rule.flags || ''}g`;
    return new RegExp(rule.pattern, flags);
}

function buildVisionSystemContent(privateSettings = {}) {
    const analysisPrompt = privateSettings.visionSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT;
    if (!privateSettings.visionAnonymizeLlm) return analysisPrompt;

    const anonymizationPrompt =
        privateSettings.visionAnonymizationPrompt || DEFAULT_VISION_ANONYMIZATION_PROMPT;
    return `${analysisPrompt}\n\n${anonymizationPrompt}`;
}

function validateRegexRules(rules) {
    if (!Array.isArray(rules)) return ['Regex rules must be an array'];

    const errors = [];
    rules.forEach((rule, index) => {
        if (!rule || typeof rule !== 'object') {
            errors.push(`Rule ${index + 1} must be an object`);
            return;
        }
        if (!rule.name || typeof rule.name !== 'string' || rule.name.length > 120) {
            errors.push(`Rule ${index + 1} requires a name of at most 120 characters`);
        }
        if (!rule.pattern || typeof rule.pattern !== 'string' || rule.pattern.length > 1000) {
            errors.push(`Rule ${index + 1} requires a pattern of at most 1000 characters`);
        }
        if (typeof rule.replacement !== 'string' || rule.replacement.length > 200) {
            errors.push(`Rule ${index + 1} requires a replacement of at most 200 characters`);
        }
        if (!/^[gimsuy]*$/.test(rule.flags || '') || new Set(rule.flags || '').size !== (rule.flags || '').length) {
            errors.push(`Rule ${index + 1} has invalid or duplicate flags`);
        }
        try {
            compileRegexRule(rule);
        } catch (err) {
            errors.push(`Rule ${index + 1} has an invalid regular expression: ${err.message}`);
        }
    });
    return errors;
}

function anonymizeWithRegex(text, rules = DEFAULT_REGEX_RULES) {
    let result = text;
    for (const rule of rules) {
        if (!rule || rule.enabled === false) continue;
        try {
            result = result.replace(compileRegexRule(rule), rule.replacement);
        } catch (err) {
            console.error(`[Vision] Invalid anonymization regex "${rule.name || 'unnamed'}":`, err.message);
        }
    }
    return result;
}

function buildMessageContentFromSegments(segments, imageFetches) {
    const messageContent = [];

    let imageIndex = 0;
    for (const seg of segments) {
        if (seg.type === 'text') {
            messageContent.push({ type: 'text', text: seg.content });
        } else if (seg.type === 'image') {
            const fetched = imageFetches[imageIndex];
            imageIndex++;

            messageContent.push({ type: 'text', text: `Image ${seg.index}:` });

            if (fetched && fetched.base64) {
                const base64Value = fetched.base64;
                const mimeMatch = base64Value.match(/^data:([^;]+);base64,/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                const base64Data = base64Value.replace(/^data:[^;]+;base64,/, '');

                messageContent.push({
                    type: 'image_url',
                    image_url: { url: `data:${mimeType};base64,${base64Data}` }
                });
            } else {
                messageContent.push({ type: 'text', text: `[Image ${seg.index} could not be loaded]` });
            }
        }
    }

    return messageContent;
}

async function analyzeProofs(pocHtml, aiSettings) {
    const segments = parseProofHtml(pocHtml);

    if (segments.length === 0) {
        return { visionSummary: '', imageDescriptions: [] };
    }

    const images = segments.filter(s => s.type === 'image');
    const imageFetches = await Promise.all(
        images.map(async (seg) => {
            if (typeof seg.src === 'string' && /^data:image\/[^;]+;base64,/i.test(seg.src)) {
                return { ...seg, base64: seg.src };
            }
            if (!seg.imageId) return { ...seg, base64: null };
            try {
                const base64 = await fetchImageBase64(seg.imageId);
                return { ...seg, base64 };
            } catch (err) {
                console.error('[Vision] Failed to fetch image', seg.imageId, ':', err.message);
                return { ...seg, base64: null };
            }
        })
    );

    const imageMap = {};
    for (const img of imageFetches) {
        imageMap[img.index] = img;
    }

    const priv = aiSettings.private || {};
    const anonymizeLlm = priv.visionAnonymizeLlm || false;
    const anonymizeRegex = priv.visionAnonymizeRegex || false;
    const anonymizeRegexRules = Array.isArray(priv.visionAnonymizeRegexRules)
        ? priv.visionAnonymizeRegexRules
        : DEFAULT_REGEX_RULES;

    const systemContent = buildVisionSystemContent({
        ...priv,
        visionAnonymizeLlm: anonymizeLlm
    });

    const messageContent = buildMessageContentFromSegments(segments, imageFetches);

    const chatModel = buildVisionModel(aiSettings);
    const messages = [
        new SystemMessage(systemContent),
        new HumanMessage({ content: messageContent })
    ];

    const response = await chatModel.invoke(messages);
    let rawOutput = (response.content || '').toString().trim();

    if (anonymizeRegex) {
        rawOutput = anonymizeWithRegex(rawOutput, anonymizeRegexRules);
    }

    const imageDescriptions = [];
    for (const seg of segments.filter(s => s.type === 'image')) {
        const descMatch = rawOutput.match(new RegExp(`Image\\s+${seg.index}\\s*:\\s*([\\s\\S]*?)(?=Image\\s+\\d+\\s*:|$)`, 'i'));
        const description = descMatch ? descMatch[1].trim() : '';
        imageDescriptions.push({
            index: seg.index,
            src: seg.src,
            markdownRef: seg.markdownRef,
            description
        });
    }

    return { visionSummary: rawOutput, imageDescriptions };
}

module.exports = {
    analyzeProofs,
    parseProofHtml,
    _buildMessageContentFromSegments: buildMessageContentFromSegments,
    anonymizeWithRegex,
    validateRegexRules,
    buildVisionSystemContent,
    DEFAULT_REGEX_RULES,
    DEFAULT_VISION_SYSTEM_PROMPT,
    DEFAULT_VISION_ANONYMIZATION_PROMPT
};
