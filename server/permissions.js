/**
 * Permission system for multi-user RBAC
 * Defines role-based permissions for Uptime Kuma
 */

/**
 * Available roles and their permissions
 * '*' means all permissions (admin role)
 */
const PERMISSIONS = {
    admin: ["*"],
    viewer: [
        "monitor:read",
        "heartbeat:read",
        "notification:read",
        "status-page:read",
        "maintenance:read",
        "proxy:read",
        "docker-host:read",
        "remote-browser:read",
        "api-key:read",
        "tag:read",
        "cert-info:read",
    ],
};

/**
 * All available permissions in the system
 */
const ALL_PERMISSIONS = [
    // Monitor permissions
    "monitor:read",
    "monitor:write",
    "monitor:delete",
    // Heartbeat permissions
    "heartbeat:read",
    // Notification permissions
    "notification:read",
    "notification:write",
    "notification:delete",
    // Status page permissions
    "status-page:read",
    "status-page:write",
    "status-page:delete",
    // Maintenance permissions
    "maintenance:read",
    "maintenance:write",
    "maintenance:delete",
    // Proxy permissions
    "proxy:read",
    "proxy:write",
    "proxy:delete",
    // Docker host permissions
    "docker-host:read",
    "docker-host:write",
    "docker-host:delete",
    // Remote browser permissions
    "remote-browser:read",
    "remote-browser:write",
    "remote-browser:delete",
    // API key permissions
    "api-key:read",
    "api-key:write",
    "api-key:delete",
    // Tag permissions
    "tag:read",
    "tag:write",
    "tag:delete",
    // Certificate info
    "cert-info:read",
    // Settings permissions
    "settings:read",
    "settings:write",
    // User management permissions
    "user:read",
    "user:write",
    "user:delete",
];

/**
 * Check if a user has a specific permission
 * @param {object} user User object with role property
 * @param {string} permission Permission to check (e.g., 'monitor:write')
 * @returns {boolean} True if user has the permission
 */
function hasPermission(user, permission) {
    if (!user) {
        return false;
    }

    const role = user.role || "viewer";
    const perms = PERMISSIONS[role];

    if (!perms) {
        return false;
    }

    // Admin has all permissions
    if (perms.includes("*")) {
        return true;
    }

    return perms.includes(permission);
}

/**
 * Check if a socket user has a specific permission
 * @param {Socket} socket Socket.io socket instance
 * @param {string} permission Permission to check
 * @returns {boolean} True if user has the permission
 */
function socketHasPermission(socket, permission) {
    if (!socket.userID) {
        return false;
    }

    const role = socket.userRole || "viewer";
    const perms = PERMISSIONS[role];

    if (!perms) {
        return false;
    }

    if (perms.includes("*")) {
        return true;
    }

    return perms.includes(permission);
}

/**
 * Check if socket user has permission, throw error if not
 * @param {Socket} socket Socket.io socket instance
 * @param {string} permission Permission required
 * @throws {Error} If user doesn't have permission
 */
function checkPermission(socket, permission) {
    if (!socket.userID) {
        throw new Error("You are not logged in.");
    }

    if (!socketHasPermission(socket, permission)) {
        throw new Error("Permission denied. You don't have access to this feature.");
    }
}

/**
 * Check if a role is an admin role
 * @param {string} role Role to check
 * @returns {boolean} True if role is admin
 */
function isAdmin(role) {
    return role === "admin";
}

/**
 * Check if socket user is an admin
 * @param {Socket} socket Socket.io socket instance
 * @returns {boolean} True if user is admin
 */
function socketIsAdmin(socket) {
    return socket.userRole === "admin";
}

/**
 * Check if socket user is admin, throw error if not
 * @param {Socket} socket Socket.io socket instance
 * @throws {Error} If user is not admin
 */
function checkAdmin(socket) {
    if (!socket.userID) {
        throw new Error("You are not logged in.");
    }

    if (!socketIsAdmin(socket)) {
        throw new Error("Permission denied. Admin access required.");
    }
}

/**
 * Get all permissions for a role
 * @param {string} role Role name
 * @returns {string[]} Array of permissions
 */
function getPermissionsForRole(role) {
    const perms = PERMISSIONS[role];
    if (!perms) {
        return [];
    }

    if (perms.includes("*")) {
        return ALL_PERMISSIONS;
    }

    return perms;
}

/**
 * Available roles
 */
const ROLES = {
    ADMIN: "admin",
    VIEWER: "viewer",
};

module.exports = {
    PERMISSIONS,
    ALL_PERMISSIONS,
    ROLES,
    hasPermission,
    socketHasPermission,
    checkPermission,
    isAdmin,
    socketIsAdmin,
    checkAdmin,
    getPermissionsForRole,
};
