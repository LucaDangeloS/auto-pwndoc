'use strict';

const crypto = require('crypto');

const PROVIDER = 'openwebui';
const DEFAULT_BASE_URL = 'http://openwebui:3000/api';

function isOpenWebUIProvider(provider) {
    return provider === PROVIDER;
}

function normalizeBaseUrl(url) {
    const raw = (url || DEFAULT_BASE_URL).replace(/\/+$/, '');
    if (!raw) return raw;

    const stripped = raw
        .replace(/\/v1\/chat\/completions$/, '')
        .replace(/\/chat\/completions$/, '')
        .replace(/\/v1\/models$/, '')
        .replace(/\/models$/, '')
        .replace(/\/v1$/, '');

    return stripped.endsWith('/api') ? stripped : stripped + '/api';
}

function chatRequestModelKwargs() {
    const id = crypto.randomUUID();
    return {
        id: id,
        chat_id: `local:${id}`
    };
}

function chatModelOptions({ model, temperature, maxTokens, apiUrl, apiKey }) {
    return {
        model: model,
        temperature: temperature,
        maxTokens: maxTokens,
        apiKey: apiKey || 'none',
        configuration: { baseURL: normalizeBaseUrl(apiUrl) },
        modelKwargs: chatRequestModelKwargs()
    };
}

module.exports = {
    PROVIDER,
    DEFAULT_BASE_URL,
    isOpenWebUIProvider,
    normalizeBaseUrl,
    chatModelOptions
};
