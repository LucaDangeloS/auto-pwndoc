'use strict';

const { ChatOpenAI, AzureChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

const LOCALE_NAMES = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'zh': 'Chinese (Simplified)',
    'pt': 'Portuguese',
    'it': 'Italian',
    'nl': 'Dutch',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ar': 'Arabic',
    'pl': 'Polish',
    'tr': 'Turkish',
    'sv': 'Swedish',
    'da': 'Danish',
    'fi': 'Finnish',
    'nb': 'Norwegian',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'ro': 'Romanian',
    'uk': 'Ukrainian'
};

function localeName(locale) {
    var base = locale.split('-')[0].toLowerCase();
    return LOCALE_NAMES[locale] || LOCALE_NAMES[base] || locale;
}

function ensureV1(url) {
    if (!url) return url;
    var trimmed = url.replace(/\/+$/, '');
    return trimmed.endsWith('/v1') ? trimmed : trimmed + '/v1';
}

function buildChatModel(aiSettings) {
    var pub = aiSettings.public;
    var priv = aiSettings.private;
    var provider = pub.provider || 'openai';
    var model = pub.model || 'gpt-4o';
    var temperature = pub.temperature !== undefined ? pub.temperature : 0.3;
    var maxTokens = pub.maxTokens || 4096;
    var apiUrl = priv.apiUrl || '';
    var apiKey = priv.apiKey || '';
    var azure = priv.azure || {};

    switch (provider) {
        case 'azure-openai':
            return new AzureChatOpenAI({
                model: azure.deploymentName || model,
                temperature,
                maxTokens,
                apiKey: apiKey || undefined,
                azureOpenAIApiInstanceName: apiUrl ? new URL(apiUrl).hostname.split('.')[0] : undefined,
                azureOpenAIApiDeploymentName: azure.deploymentName || model,
                azureOpenAIApiVersion: azure.apiVersion || '2024-06-01'
            });

        case 'ollama':
            return new ChatOpenAI({
                model,
                temperature,
                maxTokens,
                apiKey: 'ollama',
                configuration: { baseURL: ensureV1(apiUrl || 'http://ollama:11434') }
            });

        case 'anthropic':
            return new ChatOpenAI({
                model,
                temperature,
                maxTokens,
                apiKey: apiKey || 'anthropic',
                configuration: { baseURL: ensureV1(apiUrl || 'https://api.anthropic.com') }
            });

        case 'openai-compatible':
            return new ChatOpenAI({
                model,
                temperature,
                maxTokens,
                apiKey: apiKey || 'none',
                configuration: { baseURL: ensureV1(apiUrl || 'http://localhost:11434') }
            });

        case 'openai':
        default:
            return new ChatOpenAI({
                model,
                temperature,
                maxTokens,
                apiKey: apiKey || undefined,
                configuration: apiUrl ? { baseURL: ensureV1(apiUrl) } : {}
            });
    }
}

function stripFences(text) {
    return text
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

async function translateField(chatModel, html, fieldName, fromLocale, toLocale) {
    if (!html || !html.trim()) return html;

    var fromName = localeName(fromLocale);
    var toName = localeName(toLocale);

    var systemPrompt = `You are a professional technical translator specializing in cybersecurity penetration test reports.
Translate HTML content from ${fromName} to ${toName}.

Rules:
- Preserve ALL HTML tags exactly as-is (do not modify, add, or remove any tags)
- Only translate the visible text content between tags
- Maintain the same technical terminology and security jargon in ${toName}
- Do NOT translate code snippets, commands, URLs, file paths, or technical identifiers
- Do NOT wrap the output in markdown code fences or add any extra markup
- Output only the translated HTML fragment`;

    var userPrompt = `Translate this "${fieldName}" field from ${fromName} to ${toName}:

${html}`;

    var messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
    ];

    var response = await chatModel.invoke(messages);
    return stripFences(response.content || '');
}

async function translateVulnerability(vuln, aiSettings) {
    var targetLocales = aiSettings.translateLocales || [];
    if (!targetLocales.length) return vuln;

    var sourceDetail = (vuln.details || []).find(d => d.title && d.title.trim());
    if (!sourceDetail) return vuln;

    var fromLocale = sourceDetail.locale;
    var chatModel = buildChatModel(aiSettings);

    var existingLocales = (vuln.details || []).map(d => d.locale);
    var localesNeeded = targetLocales.filter(loc => loc !== fromLocale && !existingLocales.includes(loc));

    if (!localesNeeded.length) return vuln;

    for (var targetLocale of localesNeeded) {
        try {
            var translatedDetail = { locale: targetLocale };

            translatedDetail.title = await translateField(chatModel, sourceDetail.title, 'title', fromLocale, targetLocale);

            if (sourceDetail.vulnType) {
                translatedDetail.vulnType = await translateField(chatModel, sourceDetail.vulnType, 'vulnerability type', fromLocale, targetLocale);
            }
            if (sourceDetail.description) {
                translatedDetail.description = await translateField(chatModel, sourceDetail.description, 'description', fromLocale, targetLocale);
            }
            if (sourceDetail.observation) {
                translatedDetail.observation = await translateField(chatModel, sourceDetail.observation, 'observation', fromLocale, targetLocale);
            }
            if (sourceDetail.remediation) {
                translatedDetail.remediation = await translateField(chatModel, sourceDetail.remediation, 'remediation', fromLocale, targetLocale);
            }
            if (sourceDetail.references && sourceDetail.references.length) {
                translatedDetail.references = sourceDetail.references;
            }
            if (sourceDetail.customFields && sourceDetail.customFields.length) {
                translatedDetail.customFields = sourceDetail.customFields;
            }

            vuln.details.push(translatedDetail);
            console.log(`[Translate] Added ${targetLocale} translation for vuln ${vuln._id}`);
        } catch (err) {
            console.error(`[Translate] Failed to translate to ${targetLocale} for vuln ${vuln._id}:`, err.message);
        }
    }

    await vuln.save();
    return vuln;
}

async function translateVulnerabilityUpdate(vuln, aiSettings) {
    var targetLocales = aiSettings.translateLocales || [];
    if (!targetLocales.length) return vuln;

    var sourceDetail = (vuln.details || []).find(d => d.title && d.title.trim());
    if (!sourceDetail) return vuln;

    var fromLocale = sourceDetail.locale;
    var chatModel = buildChatModel(aiSettings);

    var localesNeeded = targetLocales.filter(loc => loc !== fromLocale);

    if (!localesNeeded.length) return vuln;

    for (var targetLocale of localesNeeded) {
        try {
            var existingIndex = vuln.details.findIndex(d => d.locale === targetLocale);
            var translatedDetail = existingIndex >= 0 ? vuln.details[existingIndex].toObject() : { locale: targetLocale };

            translatedDetail.title = await translateField(chatModel, sourceDetail.title, 'title', fromLocale, targetLocale);

            if (sourceDetail.vulnType !== undefined) {
                translatedDetail.vulnType = sourceDetail.vulnType
                    ? await translateField(chatModel, sourceDetail.vulnType, 'vulnerability type', fromLocale, targetLocale)
                    : sourceDetail.vulnType;
            }
            if (sourceDetail.description !== undefined) {
                translatedDetail.description = sourceDetail.description
                    ? await translateField(chatModel, sourceDetail.description, 'description', fromLocale, targetLocale)
                    : sourceDetail.description;
            }
            if (sourceDetail.observation !== undefined) {
                translatedDetail.observation = sourceDetail.observation
                    ? await translateField(chatModel, sourceDetail.observation, 'observation', fromLocale, targetLocale)
                    : sourceDetail.observation;
            }
            if (sourceDetail.remediation !== undefined) {
                translatedDetail.remediation = sourceDetail.remediation
                    ? await translateField(chatModel, sourceDetail.remediation, 'remediation', fromLocale, targetLocale)
                    : sourceDetail.remediation;
            }
            if (sourceDetail.references !== undefined) {
                translatedDetail.references = sourceDetail.references;
            }
            if (sourceDetail.customFields !== undefined) {
                translatedDetail.customFields = sourceDetail.customFields;
            }

            if (existingIndex >= 0) {
                vuln.details[existingIndex] = translatedDetail;
            } else {
                vuln.details.push(translatedDetail);
            }

            console.log(`[Translate] Updated ${targetLocale} translation for vuln ${vuln._id}`);
        } catch (err) {
            console.error(`[Translate] Failed to translate to ${targetLocale} for vuln ${vuln._id}:`, err.message);
        }
    }

    await vuln.save();
    return vuln;
}

module.exports = { translateVulnerability, translateVulnerabilityUpdate };
