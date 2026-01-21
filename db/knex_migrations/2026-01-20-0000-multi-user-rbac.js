/**
 * Multi-User RBAC Migration
 * Adds support for:
 * - User roles (admin/viewer)
 * - Microsoft Entra ID SSO
 * - OIDC login codes for secure token exchange
 */
exports.up = function (knex) {
    return knex.schema
        // Modify user table to add role and Entra ID fields
        .alterTable("user", function (table) {
            // Role for RBAC: 'admin' or 'viewer'
            table.string("role", 20).defaultTo("admin");
            // Azure AD Object ID for Entra SSO users
            table.string("entra_oid", 255).nullable().unique();
            // User email from Entra ID
            table.string("email", 255).nullable();
            // Display name from Entra ID
            table.string("display_name", 255).nullable();
            // Last login timestamp
            table.datetime("last_login").nullable();
        })
        // Create table for one-time OIDC login codes
        .createTable("oidc_login_code", function (table) {
            table.increments("id");
            table.string("code", 64).notNullable().unique();
            table.integer("user_id").unsigned().notNullable()
                .references("id").inTable("user")
                .onDelete("CASCADE").onUpdate("CASCADE");
            table.datetime("expires_at").notNullable();
            table.boolean("used").defaultTo(false);
            table.index("code");
            table.index("expires_at");
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists("oidc_login_code")
        .alterTable("user", function (table) {
            table.dropColumn("role");
            table.dropColumn("entra_oid");
            table.dropColumn("email");
            table.dropColumn("display_name");
            table.dropColumn("last_login");
        });
};
