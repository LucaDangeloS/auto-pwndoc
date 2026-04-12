'use strict';

const { ChatOpenAI, AzureChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

const DEFAULT_VISION_SYSTEM_PROMPT = `You are a cybersecurity expert analyzing proof-of-concept screenshots and evidence for a penetration test report.
Examine all provided images and accompanying text carefully.
Describe in technical detail what each image shows, focusing on:
- What vulnerability or security weakness is being demonstrated
- What the attacker is doing or has achieved
- Any sensitive information visible (e.g. responses, error messages, system information)
- The overall attack flow or exploitation chain if multiple images are present

Produce a structured analysis with:
1. A concise overall summary of the vulnerability being demonstrated (2-4 sentences)
2. A per-image description labelled clearly (e.g. "Image 1:", "Image 2:")

Output plain text only. Do not use markdown headers or code fences.`;

const ANONYMIZE_INSTRUCTION = `
IMPORTANT: You must anonymize all sensitive information in your output. Replace the following with [REDACTED]:
- IP addresses (e.g. 192.168.1.1, 10.0.0.1)
- Domain names and hostnames (e.g. example.com, server01.internal)
- Email addresses
- Usernames and account names
- Passwords or credentials
- API keys or tokens
- Company or product names that could identify the target`;

const REGEX_PATTERNS = [
    // IPv4
    { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_REDACTED]' },
    // IPv6
    { pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, replacement: '[IP_REDACTED]' },
    // Email addresses
    { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
    // Domain names (basic heuristic: word.word patterns that look like FQDNs)
    { pattern: /\b(?:[a-zA-Z0-9\-]+\.){2,}[a-zA-Z]{2,}\b/g, replacement: '[DOMAIN_REDACTED]' },
    // Common hostname patterns like server01, host-name
    { pattern: /\b(?:server|host|dc|ad|ws|pc|laptop|desktop|node|worker|master|slave|db|sql|web|app|api|proxy|vpn|fw|firewall|router|switch|lb)\d*[-\w]*/gi, replacement: '[HOST_REDACTED]' }
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
        const idMatch = src.match(/\/api\/images\/([^/?#]+)/);
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

function anonymizeWithRegex(text) {
    let result = text;
    for (const { pattern, replacement } of REGEX_PATTERNS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

async function analyzeProofs(pocHtml, aiSettings) {
    const segments = parseProofHtml(pocHtml);

    if (segments.length === 0) {
        return { visionSummary: '', imageDescriptions: [] };
    }

    const images = segments.filter(s => s.type === 'image');
    const imageFetches = await Promise.all(
        images.map(async (seg) => {
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

    const customSystemPrompt = priv.visionSystemPrompt || '';
    let systemContent = customSystemPrompt || DEFAULT_VISION_SYSTEM_PROMPT;
    if (anonymizeLlm) {
        systemContent += ANONYMIZE_INSTRUCTION;
    }

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

    const chatModel = buildVisionModel(aiSettings);
    const messages = [
        new SystemMessage(systemContent),
        new HumanMessage({ content: messageContent })
    ];

    const response = await chatModel.invoke(messages);
    let rawOutput = (response.content || '').toString().trim();

    if (anonymizeRegex) {
        rawOutput = anonymizeWithRegex(rawOutput);
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

module.exports = { analyzeProofs, parseProofHtml, anonymizeWithRegex };
