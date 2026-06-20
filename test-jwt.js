const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
async function run() {
    try {
        const token = "rDGb2BttWF6Sd2TRYsVV7dFBZzblYQvG"; // I saw this in the previous output
        const JWKS = createRemoteJWKSet(new URL('http://localhost:3000/api/auth/jwks'));
        const { payload } = await jwtVerify(token, JWKS);
        console.log("PAYLOAD:", payload);
    } catch (e) {
        console.error(e);
    }
}
run();
