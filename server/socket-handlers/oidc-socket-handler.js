/**
 * OIDC Socket Handler
 * Handles WebSocket events for:
 * - OIDC login code exchange
 * - OIDC settings management (admin only)
 * - User management (admin only)
 */
const { R } = require("redbean-node");
const { Settings } = require("../settings");
const { checkLogin } = require("../util-server");
const { checkAdmin } = require("../permissions");
const { log } = require("../../src/util");
const User = require("../model/user");

/**
 * OIDC and User Management Socket Handler
 * @param {Socket} socket Socket.io socket instance
 * @param {UptimeKumaServer} server Uptime Kuma server instance
 */
module.exports.oidcSocketHandler = (socket, server) => {

    /**
     * Exchange OIDC login code for JWT
     * This is called by the frontend after OIDC redirect
     */
    socket.on("loginByOidcCode", async (code, callback) => {
        try {
            if (typeof callback !== "function") {
                return;
            }

            if (!code || typeof code !== "string") {
                return callback({
                    ok: false,
                    msg: "Invalid login code",
                });
            }

            // Find the login code
            const loginCode = await R.findOne("oidc_login_code", " code = ? AND used = 0 ", [code]);

            if (!loginCode) {
                log.warn("oidc", "Invalid or already used login code");
                return callback({
                    ok: false,
                    msg: "Invalid or expired login code",
                });
            }

            // Check expiry
            const expiresAt = new Date(loginCode.expires_at);
            if (expiresAt < new Date()) {
                log.warn("oidc", "Login code expired");
                // Clean up expired code
                await R.trash(loginCode);
                return callback({
                    ok: false,
                    msg: "Login code expired",
                });
            }

            // Mark code as used
            loginCode.used = true;
            await R.store(loginCode);

            // Get the user
            const user = await R.findOne("user", " id = ? AND active = 1 ", [loginCode.user_id]);

            if (!user) {
                log.warn("oidc", "User not found for login code");
                return callback({
                    ok: false,
                    msg: "User not found or inactive",
                });
            }

            // Set socket user info
            socket.userID = user.id;
            socket.userRole = user.role || "viewer";
            socket.join(user.id);

            // Generate JWT
            const token = User.createJWT(user, server.jwtSecret);

            log.info("oidc", `User ${user.username} logged in via OIDC`);

            callback({
                ok: true,
                token,
                role: user.role,
            });

        } catch (e) {
            log.error("oidc", "Error exchanging OIDC login code: " + e.message);
            callback({
                ok: false,
                msg: "Authentication failed",
            });
        }
    });

    /**
     * Get OIDC settings (admin only)
     */
    socket.on("getOidcSettings", async (callback) => {
        try {
            checkLogin(socket);
            checkAdmin(socket);

            const settings = {
                oidcEntraEnabled: await Settings.get("oidcEntraEnabled") === true,
                oidcEntraTenantId: await Settings.get("oidcEntraTenantId") || "",
                oidcEntraClientId: await Settings.get("oidcEntraClientId") || "",
                oidcEntraClientSecret: await Settings.get("oidcEntraClientSecret") ? "********" : "",
                oidcEntraAllowedGroups: await Settings.get("oidcEntraAllowedGroups") || [],
                oidcEntraDefaultRole: await Settings.get("oidcEntraDefaultRole") || "viewer",
                oidcEntraAutoCreateUsers: await Settings.get("oidcEntraAutoCreateUsers") !== false,
            };

            callback({
                ok: true,
                settings,
            });

        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    /**
     * Save OIDC settings (admin only)
     */
    socket.on("saveOidcSettings", async (data, callback) => {
        try {
            checkLogin(socket);
            checkAdmin(socket);

            // Validate required fields if enabling
            if (data.oidcEntraEnabled) {
                if (!data.oidcEntraTenantId || !data.oidcEntraClientId) {
                    throw new Error("Tenant ID and Client ID are required when enabling Entra ID SSO");
                }
                // Client secret is required if not already set or if being changed
                const existingSecret = await Settings.get("oidcEntraClientSecret");
                if (!existingSecret && !data.oidcEntraClientSecret) {
                    throw new Error("Client Secret is required when enabling Entra ID SSO");
                }
            }

            // Save settings
            await Settings.set("oidcEntraEnabled", data.oidcEntraEnabled === true);
            await Settings.set("oidcEntraTenantId", data.oidcEntraTenantId || "");
            await Settings.set("oidcEntraClientId", data.oidcEntraClientId || "");

            // Only update client secret if provided (not placeholder)
            if (data.oidcEntraClientSecret && data.oidcEntraClientSecret !== "********") {
                await Settings.set("oidcEntraClientSecret", data.oidcEntraClientSecret);
            }

            // Parse allowed groups if string
            let allowedGroups = data.oidcEntraAllowedGroups;
            if (typeof allowedGroups === "string") {
                allowedGroups = allowedGroups.split(",").map(g => g.trim()).filter(g => g);
            }
            await Settings.set("oidcEntraAllowedGroups", allowedGroups || []);

            await Settings.set("oidcEntraDefaultRole", data.oidcEntraDefaultRole || "viewer");
            await Settings.set("oidcEntraAutoCreateUsers", data.oidcEntraAutoCreateUsers !== false);

            log.info("oidc", "OIDC settings saved by user " + socket.userID);

            callback({
                ok: true,
                msg: "oidcSettingsSaved",
                msgi18n: true,
            });

        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    /**
     * Get all users (admin only)
     */
    socket.on("getUsers", async (callback) => {
        try {
            checkLogin(socket);
            checkAdmin(socket);

            const users = await R.findAll("user", " active = 1 ORDER BY id ASC");

            const userList = users.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                displayName: user.display_name,
                role: user.role || "admin",
                lastLogin: user.last_login,
                hasEntraId: !!user.entra_oid,
                hasPassword: !!user.password,
            }));

            callback({
                ok: true,
                users: userList,
            });

        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    /**
     * Set user role (admin only)
     */
    socket.on("setUserRole", async (data, callback) => {
        try {
            checkLogin(socket);
            checkAdmin(socket);

            const { userId, role } = data;

            if (!userId || !role) {
                throw new Error("User ID and role are required");
            }

            if (!["admin", "viewer"].includes(role)) {
                throw new Error("Invalid role. Must be 'admin' or 'viewer'");
            }

            // Prevent removing the last admin
            if (role !== "admin") {
                const adminCount = await R.count("user", " role = 'admin' AND active = 1 AND id != ? ", [userId]);
                if (adminCount === 0) {
                    throw new Error("Cannot remove the last admin. At least one admin must remain.");
                }
            }

            const user = await R.findOne("user", " id = ? AND active = 1 ", [userId]);

            if (!user) {
                throw new Error("User not found");
            }

            user.role = role;
            await R.store(user);

            log.info("user-management", `User ${user.username} role changed to ${role} by user ${socket.userID}`);

            callback({
                ok: true,
                msg: "userRoleUpdated",
                msgi18n: true,
            });

        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    /**
     * Delete user (admin only)
     */
    socket.on("deleteUser", async (userId, callback) => {
        try {
            checkLogin(socket);
            checkAdmin(socket);

            if (!userId) {
                throw new Error("User ID is required");
            }

            // Prevent self-deletion
            if (userId === socket.userID) {
                throw new Error("You cannot delete your own account");
            }

            // Prevent deleting the last admin
            const user = await R.findOne("user", " id = ? AND active = 1 ", [userId]);

            if (!user) {
                throw new Error("User not found");
            }

            if (user.role === "admin") {
                const adminCount = await R.count("user", " role = 'admin' AND active = 1 AND id != ? ", [userId]);
                if (adminCount === 0) {
                    throw new Error("Cannot delete the last admin. At least one admin must remain.");
                }
            }

            // Soft delete (set inactive)
            user.active = false;
            await R.store(user);

            // Clean up OIDC login codes
            await R.exec("DELETE FROM oidc_login_code WHERE user_id = ?", [userId]);

            log.info("user-management", `User ${user.username} deleted by user ${socket.userID}`);

            callback({
                ok: true,
                msg: "userDeleted",
                msgi18n: true,
            });

        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    /**
     * Link current user's account with Entra ID
     * Allows existing password-based users to also use SSO
     */
    socket.on("linkEntraAccount", async (data, callback) => {
        try {
            checkLogin(socket);

            // This would typically be called after an OIDC flow with a special flag
            // For now, we just return info about the current state
            const user = await R.findOne("user", " id = ? AND active = 1 ", [socket.userID]);

            if (!user) {
                throw new Error("User not found");
            }

            callback({
                ok: true,
                hasEntraId: !!user.entra_oid,
                email: user.email,
            });

        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });
};
