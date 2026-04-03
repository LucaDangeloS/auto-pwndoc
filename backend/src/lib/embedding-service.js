'use strict';

const { ChromaClient } = require('chromadb');
const { OpenAIEmbeddings, AzureOpenAIEmbeddings } = require('@langchain/openai');

const COLLECTION_NAME = 'vulnerabilities';
const CHROMA_HOST = process.env.CHROMA_HOST || 'chroma';
const CHROMA_PORT = parseInt(process.env.CHROMA_PORT || '8000', 10);

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeBaseUrl(url, defaultUrl) {
    const raw = (url || defaultUrl || '').replace(/\/+$/, '');
    if (!raw) return raw;
    // Strip known endpoint suffixes the user might have accidentally pasted
    const stripped = raw
        .replace(/\/embeddings$/, '')
        .replace(/\/chat\/completions$/, '')
        .replace(/\/completions$/, '')
        .replace(/\/chat$/, '');
    // Ensure the URL ends with /v1
    return stripped.endsWith('/v1') ? stripped : stripped + '/v1';
}

function buildEmbeddings(aiSettings) {
    const pub = aiSettings.public;
    const priv = aiSettings.private;
    const provider = pub.embeddingProvider || 'openai';
    const model = pub.embeddingModel || 'text-embedding-3-small';
    const apiKey = priv.embeddingApiKey || priv.apiKey || '';
    const rawUrl = priv.embeddingApiUrl || '';

    switch (provider) {
        case 'azure-openai': {
            const azure = priv.embeddingAzure || {};
            const baseUrl = normalizeBaseUrl(rawUrl, '');
            return new AzureOpenAIEmbeddings({
                model: model,
                apiKey: apiKey || undefined,
                azureOpenAIApiInstanceName: baseUrl ? new URL(baseUrl).hostname.split('.')[0] : undefined,
                azureOpenAIApiDeploymentName: azure.deploymentName || model,
                azureOpenAIApiVersion: azure.apiVersion || '2024-06-01'
            });
        }

        case 'ollama':
            return new OpenAIEmbeddings({
                model: model,
                apiKey: 'ollama',
                encodingFormat: 'float',
                configuration: { baseURL: normalizeBaseUrl(rawUrl, 'http://ollama:11434') }
            });

        case 'openai-compatible':
            return new OpenAIEmbeddings({
                model: model,
                apiKey: apiKey || 'none',
                encodingFormat: 'float',
                configuration: { baseURL: normalizeBaseUrl(rawUrl, 'http://localhost:11434') }
            });

        case 'anthropic':
        case 'openai':
        default:
            return new OpenAIEmbeddings({
                model: model,
                apiKey: apiKey || undefined,
                // Only force float for non-standard endpoints; official OpenAI supports base64 fine
                ...(rawUrl ? { encodingFormat: 'float', configuration: { baseURL: normalizeBaseUrl(rawUrl, '') } } : {})
            });
    }
}

async function getChromaCollection() {
    const client = new ChromaClient({ host: CHROMA_HOST, port: CHROMA_PORT, ssl: false });
    // embeddingFunction: null — we compute embeddings ourselves via LangChain
    return client.getOrCreateCollection({ name: COLLECTION_NAME, embeddingFunction: null });
}

async function indexVulnerability(vuln, aiSettings) {
    const embeddings = buildEmbeddings(aiSettings);
    const collection = await getChromaCollection();

    const ids = [];
    const documents = [];
    const metadatas = [];
    const texts = [];

    for (const detail of vuln.details || []) {
        const id = `${vuln._id}_${detail.locale}`;
        const doc = [
            stripHtml(detail.title),
            stripHtml(detail.description),
            stripHtml(detail.observation)
        ].filter(Boolean).join('\n');

        if (!doc.trim()) continue;

        ids.push(id);
        documents.push(doc);
        texts.push(doc);
        metadatas.push({
            vulnId: vuln._id.toString(),
            locale: detail.locale || 'en',
            title: detail.title || '',
            category: vuln.category || '',
            vulnType: detail.vulnType || ''
        });
    }

    if (ids.length === 0) return;

    const embeddingVectors = await embeddings.embedDocuments(texts);

    await collection.upsert({
        ids,
        documents,
        metadatas,
        embeddings: embeddingVectors
    });
}

async function deleteVulnerability(vulnId, aiSettings) {
    const collection = await getChromaCollection();
    const results = await collection.get({ where: { vulnId: vulnId.toString() } });
    if (results.ids && results.ids.length > 0) {
        await collection.delete({ ids: results.ids });
    }
}

async function searchSimilar(query, locale, aiSettings, topK = 10) {
    const embeddings = buildEmbeddings(aiSettings);
    const collection = await getChromaCollection();

    const queryVector = await embeddings.embedQuery(query);
    const maxDistance = (aiSettings.public && aiSettings.public.embeddingMaxDistance != null)
        ? aiSettings.public.embeddingMaxDistance
        : 0.8;

    const queryParams = {
        queryEmbeddings: [queryVector],
        nResults: topK,
        include: ['metadatas', 'distances']
    };

    if (locale) {
        queryParams.where = { locale };
    }

    const results = await collection.query(queryParams);

    if (!results || !results.ids || results.ids[0].length === 0) return [];

    return results.ids[0]
        .map((id, i) => ({
            vulnId: results.metadatas[0][i].vulnId,
            title: results.metadatas[0][i].title,
            category: results.metadatas[0][i].category,
            vulnType: results.metadatas[0][i].vulnType,
            distance: results.distances ? results.distances[0][i] : null
        }))
        .filter(r => r.distance === null || r.distance <= maxDistance);
}

async function reindexAll(aiSettings) {
    const Vulnerability = require('mongoose').model('Vulnerability');
    const vulns = await Vulnerability.find({});
    let indexed = 0;
    for (const vuln of vulns) {
        try {
            await indexVulnerability(vuln, aiSettings);
            indexed++;
        } catch (err) {
            console.error('[Embedding] Failed to index vuln', vuln._id, ':', err.message);
        }
    }
    console.log(`[Embedding] Re-indexed ${indexed}/${vulns.length} vulnerabilities`);
    return indexed;
}

module.exports = { indexVulnerability, deleteVulnerability, searchSimilar, reindexAll };
