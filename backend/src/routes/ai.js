module.exports = function(app) {
    var Response = require('../lib/httpResponse.js');
    var acl = require('../lib/auth').acl;
    var AiService = require('../lib/ai');

    // Generate text using AI
    app.post("/api/ai/generate", acl.hasPermission('vulnerabilities:read'), async function(req, res) {
        // #swagger.tags = ['AI']
        // #swagger.parameters['body'] = {
        //     in: 'body',
        //     description: 'Prompt and context for generation',
        //     required: true,
        //     schema: {
        //         prompt: "Write a description for a XSS vulnerability",
        //         context: "Optional context"
        //     }
        // }

        if (!req.body.prompt) {
            Response.BadParameters(res, 'Required parameters: prompt');
            return;
        }

        try {
            // If context is provided, use it. Otherwise, perform RAG search.
            let context = req.body.context || "";
            
            if (!context) {
                // RAG: Search for similar findings
                const similarDocs = await AiService.searchSimilar(req.body.prompt, 3);
                if (similarDocs.length > 0) {
                    context = similarDocs.map(doc => 
                        `Title: ${doc.metadata.title}\nDescription: ${doc.content}\n`
                    ).join('\n---\n');
                }
            }

            const result = await AiService.generate(req.body.prompt, context);
            Response.Ok(res, result);
        } catch (err) {
            console.error(err);
            Response.Internal(res, err);
        }
    });
}
