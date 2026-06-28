'use strict';

module.exports = function(app) {
    var Response = require('../lib/httpResponse');
    var acl = require('../lib/auth').acl;
    var aiService = require('../lib/ai-service');
    var embeddingService = require('../lib/embedding-service');
    var visionService = require('../lib/vision-service');
    var OpenWebUIProvider = require('../lib/openwebui-provider');
    var Settings = require('mongoose').model('Settings');
    var CVSS40 = require('../lib/cvsscalc40');

    async function getAiSettings() {
        var settings = await Settings.getAll();
        if (!settings || !settings.ai) return null;
        return settings.toObject().ai;
    }

    async function generateProofField(fieldName, context, aiSettings) {
        var result = await aiService.generate({
            action: 'generate',
            text: '',
            fieldName,
            context,
            aiSettings
        });
        return result && result.html ? result.html : '';
    }

    var FIELD_LABELS = {
        title: ['title', 'titulo', 'título', 'titel'],
        description: ['description', 'descripcion', 'descripción', 'beschreibung'],
        observation: ['observation', 'observacion', 'observación', 'beobachtung'],
        remediation: ['remediation', 'remediacion', 'remediación', 'behebung', 'abhilfe'],
        references: ['references', 'referencias', 'referenzen'],
        cvssv3: ['cvss', 'cvss 3.1', 'cvssv3'],
        cvssv4: ['cvss', 'cvss 4.0', 'cvssv4']
    };

    function htmlToPlainText(html) {
        return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function stripMarkdownWrapping(value) {
        var output = String(value || '').trim();
        output = output.replace(/^```[ \t]*[a-z0-9_-]*[ \t]*\r?\n?/i, '').replace(/\n?[ \t]*```$/i, '').trim();
        output = output.replace(/^\s{0,3}#{1,6}\s+/, '').trim();
        output = output.replace(/^[-*•]\s+/, '').trim();
        output = output.replace(/^>\s+/, '').trim();
        output = output.replace(/^(\*\*|__|\*|_)+/, '').replace(/(\*\*|__|\*|_)+$/, '').trim();
        return output.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
    }

    function stripLeadingFieldLabel(value, fieldName) {
        var labels = FIELD_LABELS[fieldName] || [fieldName];
        var labelPattern = labels.map(escapeRegExp).join('|');
        var output = String(value || '').trim();
        var previous;
        var markdownLabel = new RegExp(
            '^\\s*(?:#{1,6}\\s*)?(?:[-*•]\\s*)?(?:\\*\\*|__|\\*|_)?\\s*(?:' + labelPattern + ')\\s*(?:\\*\\*|__|\\*|_)?\\s*[:：\\-–—]\\s*',
            'i'
        );
        var htmlLabel = new RegExp(
            '^\\s*(?:<p[^>]*>\\s*)?(?:<(?:strong|b|em|i)[^>]*>\\s*)?(?:' + labelPattern + ')\\s*[:：\\-–—]?\\s*(?:<\\/(?:strong|b|em|i)>\\s*)?',
            'i'
        );

        do {
            previous = output;
            output = output.replace(markdownLabel, '').replace(htmlLabel, match => match.toLowerCase().includes('<p') ? '<p>' : '').trim();
        } while (output && output !== previous);

        return output;
    }

    function normalizeGeneratedProofField(fieldName, value) {
        if (Array.isArray(value)) return value;
        var output = stripLeadingFieldLabel(value, fieldName);
        if (fieldName === 'title') {
            return stripLeadingFieldLabel(stripMarkdownWrapping(htmlToPlainText(output)), fieldName);
        }
        if (fieldName === 'references') return normalizeReferences(output);
        if (fieldName === 'cvssv3') return normalizeCvssVector(output, '3.1');
        if (fieldName === 'cvssv4') return normalizeCvssVector(output, '4.0');
        return output;
    }

    function isPlaceholderTitle(value) {
        return !value || /^(placeholder|test|tbd|todo|untitled)(\s+\d+)?$/i.test(String(value).trim());
    }

    function isWeakExistingContent(value) {
        var text = htmlToPlainText(value);
        if (!text) return true;
        if (/insufficient evidence|evidencia insuficiente|no se proporcion[oó] evidencia|no se proporcionaron evidencias|no se proporcionaron pruebas/i.test(text)) {
            return true;
        }
        if (/^(placeholder|test|tbd|todo|untitled|n\/a|na|none|null|empty|description|descripci[oó]n|observaci[oó]n|remediaci[oó]n)(\s+\d+)?$/i.test(text)) {
            return true;
        }
        return text.length < 20;
    }

    function existingFieldForContext(fieldName, value) {
        if (fieldName === 'title') return isPlaceholderTitle(value) ? '' : value;
        return isWeakExistingContent(value) ? '' : value;
    }

    function hasArrayContent(value) {
        return Array.isArray(value) && value.some(item => htmlToPlainText(item));
    }

    function normalizeCvssVector(value, version) {
        var text = htmlToPlainText(value);
        var prefix = version === '4.0' ? 'CVSS:4.0/' : 'CVSS:3.1/';
        var match = text.match(version === '4.0'
            ? /CVSS:4\.0\/[A-Za-z0-9:\/._-]+/
            : /CVSS:3\.1\/[A-Za-z0-9:\/._-]+/);
        if (!match) return '';
        var vector = match[0].replace(/[.,;:]+$/, '');
        if (!vector.startsWith(prefix)) return '';
        if (version === '4.0') {
            try {
                var parsed = CVSS40.calculateCVSSFromVector(vector);
                return parsed && parsed.success ? vector : '';
            } catch (_) {
                return '';
            }
        }
        return vector;
    }

    function parseCvss31Vector(vector) {
        if (!vector || !vector.startsWith('CVSS:3.1/')) return null;
        return vector.split('/').slice(1).reduce((acc, part) => {
            var pieces = part.split(':');
            if (pieces.length === 2) acc[pieces[0]] = pieces[1];
            return acc;
        }, {});
    }

    function cvss31ToCvss40Fallback(cvss31Vector) {
        var metrics = parseCvss31Vector(cvss31Vector);
        if (!metrics) return '';
        var impact = value => ({ H: 'H', L: 'L', N: 'N' }[value] || 'N');
        var scopeChanged = metrics.S === 'C';
        var vector = [
            'CVSS:4.0',
            `AV:${metrics.AV || 'N'}`,
            `AC:${metrics.AC || 'L'}`,
            'AT:N',
            `PR:${metrics.PR || 'N'}`,
            `UI:${metrics.UI === 'R' ? 'A' : 'N'}`,
            `VC:${impact(metrics.C)}`,
            `VI:${impact(metrics.I)}`,
            `VA:${impact(metrics.A)}`,
            `SC:${scopeChanged ? impact(metrics.C) : 'N'}`,
            `SI:${scopeChanged ? impact(metrics.I) : 'N'}`,
            `SA:${scopeChanged ? impact(metrics.A) : 'N'}`
        ].join('/');

        try {
            var parsed = CVSS40.calculateCVSSFromVector(vector);
            return parsed && parsed.success ? vector : '';
        } catch (_) {
            return '';
        }
    }

    function normalizeReferences(value) {
        var text = String(value || '');
        var matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
        return Array.from(new Set(matches.map(ref => ref.replace(/[.,;:]+$/, ''))));
    }

    async function generateProofFieldMaybe(fieldName, currentValue, context, aiSettings, overwriteFilledFields) {
        if (overwriteFilledFields) return normalizeGeneratedProofField(fieldName, await generateProofField(fieldName, context, aiSettings));
        if (fieldName === 'title') {
            return isPlaceholderTitle(currentValue) ? normalizeGeneratedProofField(fieldName, await generateProofField(fieldName, context, aiSettings)) : currentValue;
        }
        if (fieldName === 'references') {
            return hasArrayContent(currentValue) ? currentValue : normalizeGeneratedProofField(fieldName, await generateProofField(fieldName, context, aiSettings));
        }
        if (fieldName === 'cvssv3' || fieldName === 'cvssv4') {
            return hasContent(currentValue) ? currentValue : normalizeGeneratedProofField(fieldName, await generateProofField(fieldName, context, aiSettings));
        }
        return isWeakExistingContent(currentValue) ? normalizeGeneratedProofField(fieldName, await generateProofField(fieldName, context, aiSettings)) : currentValue;
    }

    function hasContent(value) {
        return Boolean(htmlToPlainText(value));
    }

    async function buildGeneratedProofResult({ pocHtml, locale, findingTitle, findingDescription, findingRemediation, findingReferences, findingCvssv3, findingCvssv4, auditContext, visionSummary, overwriteFilledFields }, aiSettings) {
        var shouldOverwrite = overwriteFilledFields !== false;
        var generationContext = {
            findingTitle: existingFieldForContext('title', findingTitle) || '',
            findingDescription: existingFieldForContext('description', findingDescription) || '',
            findingPoc: pocHtml,
            findingPocVision: visionSummary || '',
            auditContext: auditContext || '',
            proofCompletion: true,
            locale: locale || 'en'
        };

        var generatedFields = await Promise.all([
            generateProofFieldMaybe('title', findingTitle, generationContext, aiSettings, shouldOverwrite),
            generateProofFieldMaybe('description', findingDescription, generationContext, aiSettings, shouldOverwrite),
            generateProofFieldMaybe('remediation', findingRemediation, generationContext, aiSettings, shouldOverwrite),
            generateProofFieldMaybe('references', findingReferences, generationContext, aiSettings, shouldOverwrite),
            generateProofFieldMaybe('cvssv3', findingCvssv3, generationContext, aiSettings, shouldOverwrite),
            generateProofFieldMaybe('cvssv4', findingCvssv4, generationContext, aiSettings, shouldOverwrite)
        ]);
        var references = Array.isArray(generatedFields[3]) ? generatedFields[3] : normalizeReferences(generatedFields[3]);
        var cvssv3 = normalizeCvssVector(generatedFields[4], '3.1') || findingCvssv3 || '';
        var cvssv4 = normalizeCvssVector(generatedFields[5], '4.0')
            || normalizeCvssVector(findingCvssv4, '4.0')
            || cvss31ToCvss40Fallback(cvssv3);

        return {
            vulnId: '__generated_from_proof__',
            generatedFromProof: true,
            distance: null,
            title: htmlToPlainText(generatedFields[0]) || findingTitle || 'Generated from proof',
            vulnType: '',
            category: '',
            taxonomies: [],
            description: generatedFields[1],
            remediation: generatedFields[2],
            references,
            cvssv3,
            cvssv4
        };
    }

    async function searchSimilarFromProof({ locale, findingTitle, findingDescription, visionSummary }, aiSettings) {
        if (!aiSettings.embeddingEnabled || !visionSummary) return [];

        var Vulnerability = require('mongoose').model('Vulnerability');
        var searchQuery = [
            findingTitle || '',
            findingDescription || '',
            visionSummary || ''
        ].join('\n').trim();
        var similar = await embeddingService.searchSimilar(
            searchQuery || visionSummary,
            locale || 'en',
            aiSettings
        );

        var similarResults = await Promise.all(similar.map(async (r) => {
            try {
                var vuln = await Vulnerability.findById(r.vulnId).lean();
                if (!vuln) return null;
                var detail = (vuln.details || []).find(d => d.locale === (locale || 'en')) || {};
                var taxonomy = (Array.isArray(vuln.taxonomies) && vuln.taxonomies[0]) || {};
                return {
                    vulnId: r.vulnId,
                    distance: r.distance,
                    title: detail.title || r.title || '',
                    vulnType: taxonomy.category || '',
                    category: taxonomy.type || '',
                    taxonomies: vuln.taxonomies || [],
                    description: detail.description || '',
                    remediation: detail.remediation || '',
                    references: vuln.references || [],
                    cvssv3: vuln.cvssv3 || '',
                    cvssv4: vuln.cvssv4 || ''
                };
            } catch (_) {
                return null;
            }
        }));
        return similarResults.filter(Boolean);
    }

    app.post('/api/ai/generate', acl.hasPermission('audits:read'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();

            if (!aiSettings || !aiSettings.enabled) {
                return Response.Forbidden(res, 'AI features are not enabled');
            }

            var { action, text, fieldName, context } = req.body;

            if (!action || !['generate', 'complete', 'rewrite', 'fill-proofs', 'executive-summary', 'severity-summary'].includes(action)) {
                return Response.BadParameters(res, 'Invalid action. Must be one of: generate, complete, rewrite, fill-proofs, executive-summary, severity-summary');
            }

            var enrichedContext = context || {};

            if (fieldName && enrichedContext.findingTitle && aiSettings.embeddingEnabled) {
                try {
                    var locale = enrichedContext.locale || 'en';
                    var similar = await embeddingService.searchSimilar(
                        enrichedContext.findingTitle,
                        locale,
                        aiSettings,
                        3
                    );
                    enrichedContext.similarVulns = similar;
                } catch (embErr) {
                    console.error('[AI] Embedding search failed (skipping RAG):', embErr.message);
                    enrichedContext.similarVulns = [];
                }
            }

            var result = await aiService.generate({
                action,
                text: text || '',
                fieldName: fieldName || '',
                context: enrichedContext,
                aiSettings
            });

            return Response.Ok(res, result);
        } catch (err) {
            console.error('[AI] Generation error:', err.message);
            return Response.Internal(res, err.message || 'AI generation failed');
        }
    });

    app.post('/api/ai/search-similar', acl.hasPermission('vulnerabilities:read'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();

            if (!aiSettings || !aiSettings.enabled || !aiSettings.embeddingEnabled) {
                return Response.Forbidden(res, 'Embedding features are not enabled');
            }

            var { query, locale } = req.body;

            if (!query) {
                return Response.BadParameters(res, 'query is required');
            }

            var Vulnerability = require('mongoose').model('Vulnerability');
            var similar = await embeddingService.searchSimilar(query, locale || 'en', aiSettings);

            var enriched = await Promise.all(similar.map(async (r) => {
                try {
                    var vuln = await Vulnerability.findById(r.vulnId).lean();
                    if (!vuln) return null;
                    var detail = (vuln.details || []).find(d => d.locale === (locale || 'en')) || {};
                    var taxonomy = (Array.isArray(vuln.taxonomies) && vuln.taxonomies[0]) || {};
                    return {
                        vulnId: r.vulnId,
                        distance: r.distance,
                        title: detail.title || r.title || '',
                        vulnType: taxonomy.category || '',
                        category: taxonomy.type || '',
                        taxonomies: vuln.taxonomies || [],
                        description: detail.description || '',
                        observation: detail.observation || '',
                        remediation: detail.remediation || '',
                        references: vuln.references || [],
                        cvssv3: vuln.cvssv3 || '',
                        cvssv4: vuln.cvssv4 || ''
                    };
                } catch (_) {
                    return null;
                }
            }));

            return Response.Ok(res, enriched.filter(Boolean));
        } catch (err) {
            console.error('[AI] Semantic search error:', err.message);
            return Response.Internal(res, err.message || 'Semantic search failed');
        }
    });

    app.post('/api/ai/reindex-all', acl.hasPermission('settings:update'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();

            if (!aiSettings || !aiSettings.enabled || !aiSettings.embeddingEnabled) {
                return Response.Forbidden(res, 'Embedding features are not enabled');
            }

            var status = embeddingService.getReindexStatus();
            if (status.inProgress) {
                return Response.Ok(res, { started: false, alreadyRunning: true, status });
            }

            embeddingService.reindexAll(aiSettings)
                .catch(err => console.error('[AI] Re-index error:', err.message));

            return Response.Ok(res, { started: true, status: embeddingService.getReindexStatus() });
        } catch (err) {
            console.error('[AI] Re-index error:', err.message);
            return Response.Internal(res, err.message || 'Re-index failed');
        }
    });

    app.get('/api/ai/reindex-status', acl.hasPermission('settings:read'), async function(req, res) {
        try {
            return Response.Ok(res, embeddingService.getReindexStatus());
        } catch (err) {
            return Response.Internal(res, err.message || 'Failed to read reindex status');
        }
    });

    app.post('/api/ai/list-models', acl.hasPermission('settings:read'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();
            if (!aiSettings) return Response.Internal(res, 'Could not load AI settings');

            var { type } = req.body || {};
            if (!['generation', 'embedding', 'vision'].includes(type)) {
                return Response.BadParameters(res, 'type must be one of: generation, embedding, vision');
            }

            var pub = aiSettings.public || {};
            var visionPub = aiSettings.visionPublic || {};
            var priv = aiSettings.private || {};

            var provider, apiUrl, apiKey;
            if (type === 'generation') {
                provider = pub.provider || 'openai';
                apiUrl = priv.apiUrl || '';
                apiKey = priv.apiKey || '';
            } else if (type === 'embedding') {
                provider = pub.embeddingProvider || 'openai';
                apiUrl = priv.embeddingApiUrl || '';
                apiKey = priv.embeddingApiKey || priv.apiKey || '';
            } else {
                provider = visionPub.visionProvider || 'openai';
                apiUrl = priv.visionApiUrl || '';
                apiKey = priv.visionApiKey || priv.apiKey || '';
            }

            // Static lists for providers without a public model-listing API
            var staticLists = {
                anthropic: [
                    'claude-opus-4-20250514', 'claude-sonnet-4-20250514',
                    'claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest',
                    'claude-3-5-haiku-latest', 'claude-3-opus-latest'
                ]
            };

            if (provider === 'anthropic') {
                return Response.Ok(res, { source: 'static', models: staticLists.anthropic });
            }
            if (provider === 'azure-openai') {
                // Azure deployments are user-defined; can't enumerate generically
                return Response.Ok(res, { source: 'manual', models: [], note: 'Enter the Azure deployment name manually.' });
            }

            function ensureV1(u) {
                if (!u) return u;
                const t = u.replace(/\/+$/, '');
                return t.endsWith('/v1') ? t : t + '/v1';
            }

            function defaultUrl(p) {
                if (p === 'openai') return 'https://api.openai.com/v1';
                if (p === 'ollama') return 'http://ollama:11434/v1';
                if (OpenWebUIProvider.isOpenWebUIProvider(p)) return OpenWebUIProvider.DEFAULT_BASE_URL;
                return '';
            }

            var baseUrl = OpenWebUIProvider.isOpenWebUIProvider(provider)
                ? OpenWebUIProvider.normalizeBaseUrl(apiUrl)
                : ensureV1(apiUrl) || defaultUrl(provider);
            if (!baseUrl) {
                return Response.Ok(res, { source: 'manual', models: [], note: 'Configure the API URL first.' });
            }

            var headers = { 'Accept': 'application/json' };
            var keyToUse = apiKey || (provider === 'ollama' ? 'ollama' : '');
            if (keyToUse) headers['Authorization'] = 'Bearer ' + keyToUse;

            try {
                var fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');
                var response = await fetchFn(baseUrl + '/models', { method: 'GET', headers });
                if (!response.ok) {
                    var bodyText = await response.text().catch(() => '');
                    return Response.Ok(res, { source: 'remote', ok: false, status: response.status, models: [], error: bodyText.slice(0, 240) });
                }
                var data = await response.json();
                var raw = Array.isArray(data && data.data) ? data.data : (Array.isArray(data && data.models) ? data.models : []);
                var ids = raw.map(function(m) {
                    if (typeof m === 'string') return m;
                    return m.id || m.name || m.model || '';
                }).filter(Boolean);
                ids = Array.from(new Set(ids)).sort();
                return Response.Ok(res, { source: 'remote', ok: true, models: ids });
            } catch (fetchErr) {
                return Response.Ok(res, { source: 'remote', ok: false, models: [], error: fetchErr.message || 'Failed to fetch models' });
            }
        } catch (err) {
            console.error('[AI] list-models error:', err.message);
            return Response.Internal(res, err.message || 'list-models failed');
        }
    });

    app.post('/api/ai/analyze-proofs', acl.hasPermission('audits:read'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();

            if (!aiSettings || !aiSettings.enabled) {
                return Response.Forbidden(res, 'AI features are not enabled');
            }

            if (!aiSettings.visionEnabled) {
                return Response.Forbidden(res, 'Vision features are not enabled');
            }

            var {
                pocHtml,
                locale,
                findingTitle,
                findingDescription,
                findingRemediation,
                findingReferences,
                findingCvssv3,
                findingCvssv4,
                auditContext,
                overwriteFilledFields
            } = req.body;

            if (!pocHtml) {
                return Response.BadParameters(res, 'pocHtml is required');
            }

            var visionResult = await visionService.analyzeProofs(pocHtml, aiSettings);
            var generatedResult = null;
            try {
                generatedResult = await buildGeneratedProofResult({
                    pocHtml,
                    locale,
                    findingTitle,
                    findingDescription,
                    findingRemediation,
                    findingReferences,
                    findingCvssv3,
                    findingCvssv4,
                    auditContext,
                    visionSummary: visionResult.visionSummary,
                    overwriteFilledFields
                }, aiSettings);
            } catch (genErr) {
                console.error('[AI] Proof field generation failed:', genErr.message);
            }

            var similarResults = [];
            try {
                similarResults = await searchSimilarFromProof({
                    locale,
                    findingTitle,
                    findingDescription,
                    visionSummary: visionResult.visionSummary
                }, aiSettings);
            } catch (embErr) {
                console.error('[AI] Embedding search after vision analysis failed:', embErr.message);
            }

            return Response.Ok(res, {
                visionSummary: visionResult.visionSummary,
                imageDescriptions: visionResult.imageDescriptions,
                generatedResult,
                similarResults
            });
        } catch (err) {
            console.error('[AI] Proof analysis error:', err.message);
            return Response.Internal(res, err.message || 'Proof analysis failed');
        }
    });

    app.post('/api/ai/analyze-proof-evidence', acl.hasPermission('audits:read'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();

            if (!aiSettings || !aiSettings.enabled) {
                return Response.Forbidden(res, 'AI features are not enabled');
            }

            if (!aiSettings.visionEnabled) {
                return Response.Forbidden(res, 'Vision features are not enabled');
            }

            var { pocHtml } = req.body;
            if (!pocHtml) {
                return Response.BadParameters(res, 'pocHtml is required');
            }

            var visionResult = await visionService.analyzeProofs(pocHtml, aiSettings);
            return Response.Ok(res, visionResult);
        } catch (err) {
            console.error('[AI] Proof evidence analysis error:', err.message);
            return Response.Internal(res, err.message || 'Proof evidence analysis failed');
        }
    });

    app.post('/api/ai/complete-proof-fields', acl.hasPermission('audits:read'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();

            if (!aiSettings || !aiSettings.enabled) {
                return Response.Forbidden(res, 'AI features are not enabled');
            }

            var {
                pocHtml,
                locale,
                findingTitle,
                findingDescription,
                findingRemediation,
                findingReferences,
                findingCvssv3,
                findingCvssv4,
                auditContext,
                visionSummary,
                overwriteFilledFields
            } = req.body;
            if (!pocHtml) {
                return Response.BadParameters(res, 'pocHtml is required');
            }

            var generatedResult = await buildGeneratedProofResult({
                pocHtml,
                locale,
                findingTitle,
                findingDescription,
                findingRemediation,
                findingReferences,
                findingCvssv3,
                findingCvssv4,
                auditContext,
                visionSummary,
                overwriteFilledFields
            }, aiSettings);
            return Response.Ok(res, { generatedResult });
        } catch (err) {
            console.error('[AI] Proof field completion error:', err.message);
            return Response.Internal(res, err.message || 'Proof field completion failed');
        }
    });

    app.post('/api/ai/search-proof-similar', acl.hasPermission('audits:read'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();

            if (!aiSettings || !aiSettings.enabled) {
                return Response.Forbidden(res, 'AI features are not enabled');
            }

            var { locale, findingTitle, findingDescription, visionSummary } = req.body;
            var similarResults = await searchSimilarFromProof({
                locale,
                findingTitle,
                findingDescription,
                visionSummary
            }, aiSettings);
            return Response.Ok(res, { similarResults });
        } catch (err) {
            console.error('[AI] Proof similarity search error:', err.message);
            return Response.Internal(res, err.message || 'Proof similarity search failed');
        }
    });

    // POST /api/ai/test  — connection test for generation, embedding, or vision
    app.post('/api/ai/test', acl.hasPermission('settings:read'), async function(req, res) {
        const { type } = req.body; // 'generation' | 'embedding' | 'vision'
        if (!['generation', 'embedding', 'vision'].includes(type)) {
            return Response.BadParameters(res, 'type must be one of: generation, embedding, vision');
        }

        var aiSettings = await getAiSettings();
        if (!aiSettings) return Response.Internal(res, 'Could not load AI settings');

        try {
            if (type === 'generation') {
                const { ChatOpenAI, AzureChatOpenAI } = require('@langchain/openai');
                const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

                const pub = aiSettings.public;
                const priv = aiSettings.private;
                const provider = pub.provider || 'openai';
                const model = pub.model || 'gpt-4o';
                const apiKey = priv.apiKey || '';
                const apiUrl = priv.apiUrl || '';
                const azure = priv.azure || {};

                function ensureV1(u) {
                    if (!u) return u;
                    const t = u.replace(/\/+$/, '');
                    return t.endsWith('/v1') ? t : t + '/v1';
                }

                let chatModel;
                if (provider === 'azure-openai') {
                    chatModel = new AzureChatOpenAI({
                        model: azure.deploymentName || model,
                        temperature: 0, maxTokens: 1024,
                        apiKey: apiKey || undefined,
                        azureOpenAIApiInstanceName: apiUrl ? new URL(apiUrl).hostname.split('.')[0] : undefined,
                        azureOpenAIApiDeploymentName: azure.deploymentName || model,
                        azureOpenAIApiVersion: azure.apiVersion || '2024-06-01'
                    });
                } else {
                    chatModel = OpenWebUIProvider.isOpenWebUIProvider(provider)
                        ? new ChatOpenAI(OpenWebUIProvider.chatModelOptions({
                            model,
                            temperature: 0,
                            maxTokens: 1024,
                            apiUrl,
                            apiKey
                        }))
                        : new ChatOpenAI({
                            model,
                            temperature: 0, maxTokens: 1024,
                            apiKey: apiKey || (provider === 'ollama' ? 'ollama' : provider === 'anthropic' ? 'anthropic' : undefined),
                            configuration: apiUrl ? { baseURL: ensureV1(apiUrl) }
                                : provider === 'anthropic' ? { baseURL: 'https://api.anthropic.com/v1' }
                                : provider === 'ollama' ? { baseURL: ensureV1('http://ollama:11434') }
                                : {}
                        });
                }

                const response = await chatModel.invoke([
                    new SystemMessage('You are a test assistant.'),
                    new HumanMessage('Reply with exactly the word: OK')
                ]);
                const text = (response.content || response.additional_kwargs?.reasoning_content || '').trim();
                if (!text) throw new Error('Empty response from model');
                const isReasoning = !response.content && !!response.additional_kwargs?.reasoning_content;
                const displayText = isReasoning ? `(thinking model) ${text.substring(0, 60)}` : text.substring(0, 80);
                return Response.Ok(res, { ok: true, response: displayText });
            }

            if (type === 'embedding') {
                const { OpenAIEmbeddings, AzureOpenAIEmbeddings } = require('@langchain/openai');
                const pub = aiSettings.public;
                const priv = aiSettings.private;
                const provider = pub.embeddingProvider || 'openai';
                const model = pub.embeddingModel || 'text-embedding-3-small';
                const apiKey = priv.embeddingApiKey || priv.apiKey || '';
                const rawUrl = priv.embeddingApiUrl || '';

                function normalizeUrl(u, def) {
                    const raw = (u || def || '').replace(/\/+$/, '');
                    if (!raw) return raw;
                    const stripped = raw
                        .replace(/\/embeddings$/, '')
                        .replace(/\/chat\/completions$/, '')
                        .replace(/\/completions$/, '')
                        .replace(/\/chat$/, '');
                    return stripped.endsWith('/v1') ? stripped : stripped + '/v1';
                }

                let embeddings;
                if (provider === 'azure-openai') {
                    const azure = priv.embeddingAzure || {};
                    const baseUrl = normalizeUrl(rawUrl, '');
                    embeddings = new AzureOpenAIEmbeddings({
                        model: azure.deploymentName || model,
                        apiKey: apiKey || undefined,
                        azureOpenAIApiInstanceName: baseUrl ? new URL(baseUrl).hostname.split('.')[0] : undefined,
                        azureOpenAIApiDeploymentName: azure.deploymentName || model,
                        azureOpenAIApiVersion: azure.apiVersion || '2024-06-01'
                    });
                } else {
                    const baseUrl = normalizeUrl(rawUrl,
                        provider === 'ollama' ? 'http://ollama:11434' :
                        provider === 'openwebui' ? OpenWebUIProvider.DEFAULT_BASE_URL :
                        provider === 'openai' ? 'https://api.openai.com/v1' : '');
                    embeddings = new OpenAIEmbeddings({
                        model,
                        apiKey: apiKey || (provider === 'ollama' ? 'ollama' : undefined),
                        configuration: baseUrl ? { baseURL: baseUrl } : {}
                    });
                }

                const vector = await embeddings.embedQuery('connection test');
                if (!Array.isArray(vector) || vector.length === 0) throw new Error('Embedding returned empty vector');
                return Response.Ok(res, { ok: true, response: `Vector dim: ${vector.length}` });
            }

            if (type === 'vision') {
                const { ChatOpenAI, AzureChatOpenAI } = require('@langchain/openai');
                const { HumanMessage } = require('@langchain/core/messages');

                const pub = aiSettings.visionPublic || {};
                const priv = aiSettings.private;
                const provider = pub.visionProvider || 'openai';
                const model = pub.visionModel || 'gpt-4o';
                const apiKey = priv.visionApiKey || priv.apiKey || '';
                const apiUrl = priv.visionApiUrl || '';
                const azure = priv.visionAzure || {};

                function ensureV1(u) {
                    if (!u) return u;
                    const t = u.replace(/\/+$/, '');
                    return t.endsWith('/v1') ? t : t + '/v1';
                }

                const fs = require('fs');
                const path = require('path');
                const testImagePath = path.join(__dirname, '../lib/test-assets/vision-test.png');
                // 50×50 white PNG — reliable fallback for all vision backends
                const WHITE_50_B64 = 'iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAASklEQVR4nO3OMQEAIAzAsPk3DQb25IKjUZA5X5rXgV0tUUvUErVELVFL1BK1RC1RS9QStUQtUUvUErVELVFL1BK1RC1RS9QStcQFBi0waAoU3dAAAAAASUVORK5CYII=';
                let imageB64 = WHITE_50_B64;
                const imageMime = 'image/png';
                if (fs.existsSync(testImagePath)) {
                    imageB64 = fs.readFileSync(testImagePath).toString('base64');
                }

                let chatModel;
                if (provider === 'azure-openai') {
                    chatModel = new AzureChatOpenAI({
                        model: azure.deploymentName || model,
                        temperature: 0, maxTokens: 1024,
                        apiKey: apiKey || undefined,
                        azureOpenAIApiInstanceName: apiUrl ? new URL(apiUrl).hostname.split('.')[0] : undefined,
                        azureOpenAIApiDeploymentName: azure.deploymentName || model,
                        azureOpenAIApiVersion: azure.apiVersion || '2024-06-01'
                    });
                } else {
                    chatModel = OpenWebUIProvider.isOpenWebUIProvider(provider)
                        ? new ChatOpenAI(OpenWebUIProvider.chatModelOptions({
                            model,
                            temperature: 0,
                            maxTokens: 1024,
                            apiUrl,
                            apiKey
                        }))
                        : new ChatOpenAI({
                            model,
                            temperature: 0, maxTokens: 1024,
                            apiKey: apiKey || (provider === 'ollama' ? 'ollama' : provider === 'anthropic' ? 'anthropic' : undefined),
                            configuration: apiUrl ? { baseURL: ensureV1(apiUrl) }
                                : provider === 'anthropic' ? { baseURL: 'https://api.anthropic.com/v1' }
                                : provider === 'ollama' ? { baseURL: ensureV1('http://ollama:11434') }
                                : {}
                        });
                }

                const response = await chatModel.invoke([
                    new HumanMessage({
                        content: [
                            { type: 'text', text: 'What color is this image? Reply with one word.' },
                            { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageB64}` } }
                        ]
                    })
                ]);
                const text = (response.content || response.additional_kwargs?.reasoning_content || '').trim();
                if (!text) throw new Error('Empty response from vision model');
                return Response.Ok(res, { ok: true, response: text.substring(0, 80) });
            }
        } catch (err) {
            console.error(`[AI] Test (${type}) failed:`, err.message);
            return Response.Ok(res, { ok: false, response: err.message || 'Test failed' });
        }
    });
};
