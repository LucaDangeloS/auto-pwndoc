function isSecureRequest(req) {
    const forwardedProto = req.get && req.get('x-forwarded-proto');
    if (forwardedProto) return forwardedProto.split(',')[0].trim() === 'https';
    return !!req.secure;
}

function cookieOptions(req, options = {}) {
    return {secure: isSecureRequest(req), ...options};
}

module.exports = {cookieOptions, isSecureRequest};
