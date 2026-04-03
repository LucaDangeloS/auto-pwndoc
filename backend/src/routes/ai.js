'use strict';

module.exports = function(app) {
    var Response = require('../lib/httpResponse');
    var acl = require('../lib/auth').acl;
    var aiService = require('../lib/ai-service');
    var embeddingService = require('../lib/embedding-service');
    var Settings = require('mongoose').model('Settings');

    async function getAiSettings() {
        var settings = await Settings.getAll();
        if (!settings || !settings.ai) return null;
        return settings.toObject().ai;
    }

    app.post('/api/ai/generate', acl.hasPermission('audits:read'), async function(req, res) {
        try {
            var aiSettings = await getAiSettings();

            if (!aiSettings || !aiSettings.enabled) {
                return Response.Forbidden(res, 'AI features are not enabled');
            }

            var { action, text, fieldName, context } = req.body;

            if (!action || !['generate', 'complete', 'rewrite'].includes(action)) {
                return Response.BadParameters(res, 'Invalid action. Must be one of: generate, complete, rewrite');
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
                    return {
                        vulnId: r.vulnId,
                        distance: r.distance,
                        title: detail.title || r.title || '',
                        vulnType: detail.vulnType || r.vulnType || '',
                        category: vuln.category || r.category || '',
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

            embeddingService.reindexAll(aiSettings)
                .catch(err => console.error('[AI] Re-index error:', err.message));

            return Response.Ok(res, { started: true });
        } catch (err) {
            console.error('[AI] Re-index error:', err.message);
            return Response.Internal(res, err.message || 'Re-index failed');
        }
    });
};
