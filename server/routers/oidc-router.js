/**
 * OIDC Router for Microsoft Entra ID SSO
 * Handles authentication flow with Azure AD
 */
const express = require("express");
const router = express.Router();
const { Issuer, generators } = require("openid-client");
const { R } = require("redbean-node");
const { Settings } = require("../settings");
const { log } = require("../../src/util");
const crypto = require("crypto");

// Store PKCE verifiers and state in memory (consider Redis for production clusters)
const authSessions = new Map();

// Clean up expired sessions periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, session] of authSessions.entries()) {
        if (session.expiresAt < now) {
            authSessions.delete(key);
        }
    }
}, 60000); // Clean every minute

/**
 * Get OIDC settings from database
 * @returns {Promise<object>} OIDC configuration
 */
async function getOidcSettings() {
    return {
        enabled: await Settings.get("oidcEntraEnabled") === true,
        tenantId: await Settings.get("oidcEntraTenantId"),
        clientId: await Settings.get("oidcEntraClientId"),
        clientSecret: await Settings.get("oidcEntraClientSecret"),
        allowedGroups: await Settings.get("oidcEntraAllowedGroups") || [],
        defaultRole: await Settings.get("oidcEntraDefaultRole") || "viewer",
        autoCreateUsers: await Settings.get("oidcEntraAutoCreateUsers") !== false,
    };
}

/**
 * Build the redirect URI based on the request
 * @param {express.Request} req Express request
 * @returns {string} Redirect URI
 */
function getRedirectUri(req) {
    const protocol = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("x-forwarded-host") || req.get("host");
    return `${protocol}://${host}/auth/oidc/entra/callback`;
}

/**
 * GET /auth/oidc/entra/config
 * Returns public OIDC configuration (whether SSO is enabled)
 */
router.get("/auth/oidc/entra/config", async (req, res) => {
    try {
        const enabled = await Settings.get("oidcEntraEnabled") === true;
        res.json({
            enabled,
        });
    } catch (e) {
        log.error("oidc", "Error getting OIDC config: " + e.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /auth/oidc/entra/login
 * Initiates the OIDC authentication flow
 */
router.get("/auth/oidc/entra/login", async (req, res) => {
    try {
        const settings = await getOidcSettings();

        if (!settings.enabled) {
            return res.status(400).json({ error: "Entra ID SSO is not enabled" });
        }

        if (!settings.tenantId || !settings.clientId || !settings.clientSecret) {
            return res.status(500).json({ error: "Entra ID SSO is not properly configured" });
        }

        // Discover the Entra ID OIDC endpoints
        const issuerUrl = `https://login.microsoftonline.com/${settings.tenantId}/v2.0`;
        const entraIssuer = await Issuer.discover(issuerUrl);

        const redirectUri = getRedirectUri(req);

        const client = new entraIssuer.Client({
            client_id: settings.clientId,
            client_secret: settings.clientSecret,
            redirect_uris: [redirectUri],
            response_types: ["code"],
        });

        // Generate PKCE code verifier and challenge
        const codeVerifier = generators.codeVerifier();
        const codeChallenge = generators.codeChallenge(codeVerifier);

        // Generate state and nonce for security
        const state = generators.state();
        const nonce = generators.nonce();

        // Store session data
        authSessions.set(state, {
            codeVerifier,
            nonce,
            redirectUri,
            expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
        });

        // Build authorization URL
        const authUrl = client.authorizationUrl({
            scope: "openid profile email",
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            response_mode: "query",
        });

        log.info("oidc", "Redirecting to Entra ID for authentication");
        res.redirect(authUrl);

    } catch (e) {
        log.error("oidc", "Error initiating OIDC login: " + e.message);
        res.redirect("/dashboard?oidc_error=" + encodeURIComponent("Failed to initiate SSO login"));
    }
});

/**
 * GET /auth/oidc/entra/callback
 * Handles the callback from Microsoft Entra ID
 */
router.get("/auth/oidc/entra/callback", async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        // Check for errors from Entra ID
        if (error) {
            log.error("oidc", `Entra ID error: ${error} - ${error_description}`);
            return res.redirect("/dashboard?oidc_error=" + encodeURIComponent(error_description || error));
        }

        // Validate state
        if (!state || !authSessions.has(state)) {
            log.error("oidc", "Invalid or expired state parameter");
            return res.redirect("/dashboard?oidc_error=" + encodeURIComponent("Invalid or expired authentication session"));
        }

        const session = authSessions.get(state);
        authSessions.delete(state); // One-time use

        // Check session expiry
        if (session.expiresAt < Date.now()) {
            log.error("oidc", "Authentication session expired");
            return res.redirect("/dashboard?oidc_error=" + encodeURIComponent("Authentication session expired"));
        }

        const settings = await getOidcSettings();

        if (!settings.enabled) {
            return res.redirect("/dashboard?oidc_error=" + encodeURIComponent("Entra ID SSO is not enabled"));
        }

        // Discover the Entra ID OIDC endpoints
        const issuerUrl = `https://login.microsoftonline.com/${settings.tenantId}/v2.0`;
        const entraIssuer = await Issuer.discover(issuerUrl);

        const client = new entraIssuer.Client({
            client_id: settings.clientId,
            client_secret: settings.clientSecret,
            redirect_uris: [session.redirectUri],
            response_types: ["code"],
        });

        // Exchange code for tokens
        const tokenSet = await client.callback(session.redirectUri, { code, state }, {
            code_verifier: session.codeVerifier,
            nonce: session.nonce,
        });

        // Get user info from ID token
        const claims = tokenSet.claims();
        log.info("oidc", `User authenticated: ${claims.preferred_username || claims.email}`);

        // Extract user information
        const userInfo = {
            oid: claims.oid || claims.sub, // Azure AD Object ID
            email: claims.preferred_username || claims.email,
            name: claims.name,
            groups: claims.groups || [], // Requires group claims configuration in Azure
        };

        // Check group membership if allowed groups are configured
        if (settings.allowedGroups && settings.allowedGroups.length > 0) {
            const userGroups = userInfo.groups || [];
            const hasAllowedGroup = settings.allowedGroups.some(g => userGroups.includes(g));

            if (!hasAllowedGroup) {
                log.warn("oidc", `User ${userInfo.email} not in allowed groups`);
                return res.redirect("/dashboard?oidc_error=" + encodeURIComponent("You are not authorized to access this application. Please contact your administrator."));
            }
        }

        // Find or create user
        let user = await R.findOne("user", " entra_oid = ? AND active = 1", [userInfo.oid]);

        if (!user) {
            // Check if auto-create is enabled
            if (!settings.autoCreateUsers) {
                log.warn("oidc", `User ${userInfo.email} not found and auto-create is disabled`);
                return res.redirect("/dashboard?oidc_error=" + encodeURIComponent("Your account has not been provisioned. Please contact your administrator."));
            }

            // Create new user
            user = R.dispense("user");
            user.username = userInfo.email.split("@")[0]; // Use email prefix as username
            user.entra_oid = userInfo.oid;
            user.email = userInfo.email;
            user.display_name = userInfo.name;
            user.role = settings.defaultRole;
            user.active = true;
            user.password = null; // OIDC users don't have passwords
            user.last_login = new Date();

            // Ensure unique username
            let existingUser = await R.findOne("user", " username = ?", [user.username]);
            if (existingUser) {
                user.username = user.username + "_" + crypto.randomBytes(4).toString("hex");
            }

            await R.store(user);
            log.info("oidc", `Created new user: ${user.username} (${userInfo.email})`);
        } else {
            // Update existing user info
            user.email = userInfo.email;
            user.display_name = userInfo.name;
            user.last_login = new Date();
            await R.store(user);
            log.info("oidc", `Updated user: ${user.username} (${userInfo.email})`);
        }

        // Generate one-time login code
        const loginCode = crypto.randomBytes(32).toString("hex");
        const loginCodeBean = R.dispense("oidc_login_code");
        loginCodeBean.code = loginCode;
        loginCodeBean.user_id = user.id;
        loginCodeBean.expires_at = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        loginCodeBean.used = false;
        await R.store(loginCodeBean);

        log.info("oidc", `Generated login code for user: ${user.username}`);

        // Redirect to dashboard with login code
        res.redirect(`/dashboard?oidc_code=${loginCode}`);

    } catch (e) {
        log.error("oidc", "Error handling OIDC callback: " + e.message);
        log.error("oidc", e.stack);
        res.redirect("/dashboard?oidc_error=" + encodeURIComponent("Authentication failed. Please try again."));
    }
});

module.exports = router;
