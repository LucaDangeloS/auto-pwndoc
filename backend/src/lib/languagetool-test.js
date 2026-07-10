function isHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

/**
 * Test a LanguageTool endpoint and return a structured result.
 * @param {string} url - Base URL of the LanguageTool service
 * @returns {{ valid: boolean, reachable: boolean, isLanguageTool: boolean, error?: string }}
 */
async function testLanguageToolConnection(url) {
    if (!url) return { valid: false, error: 'url is required' };
    if (!isHttpUrl(url)) return { valid: false, error: 'url must use http or https' };

    const baseUrl = url.replace(/\/?$/, '/');
    let reachable = false;
    let isLanguageTool = false;

    // Probe v2/languages (vanilla LT, erikvl87 image, or public LT API)
    try {
        const infoRes = await fetch(new URL('v2/languages', baseUrl), { signal: AbortSignal.timeout(5000) });
        reachable = true;
        if (infoRes.ok) {
            const infoData = await infoRes.json();
            if (Array.isArray(infoData) && infoData.length > 0 && infoData[0].longCode)
                isLanguageTool = true;
        }
    } catch (_) {}

    if (!reachable) {
        return { valid: false, reachable: false, isLanguageTool: false };
    }

    return { valid: true, reachable, isLanguageTool };
}

module.exports = { testLanguageToolConnection };
