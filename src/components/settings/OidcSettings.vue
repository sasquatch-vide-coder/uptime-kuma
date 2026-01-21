<template>
    <div>
        <h5 class="my-4 settings-subheading">{{ $t("Microsoft Entra ID SSO") }}</h5>

        <div v-if="!$root.isAdmin()" class="alert alert-warning">
            {{ $t("Only administrators can configure SSO settings.") }}
        </div>

        <form v-else class="mb-4" @submit.prevent="saveOidcSettings">
            <!-- Enable/Disable Toggle -->
            <div class="mb-4">
                <div class="form-check form-switch">
                    <input
                        id="oidcEntraEnabled"
                        v-model="settings.oidcEntraEnabled"
                        class="form-check-input"
                        type="checkbox"
                    />
                    <label class="form-check-label" for="oidcEntraEnabled">
                        {{ $t("Enable Entra ID SSO") }}
                    </label>
                </div>
                <div class="form-text">
                    {{ $t("Allow users to sign in with their Microsoft Entra ID accounts.") }}
                </div>
            </div>

            <div v-if="settings.oidcEntraEnabled">
                <!-- Tenant ID -->
                <div class="mb-3">
                    <label for="oidcEntraTenantId" class="form-label">
                        {{ $t("Tenant ID") }} <span class="text-danger">*</span>
                    </label>
                    <input
                        id="oidcEntraTenantId"
                        v-model="settings.oidcEntraTenantId"
                        type="text"
                        class="form-control"
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        required
                    />
                    <div class="form-text">
                        {{ $t("Your Azure AD tenant ID (Directory ID).") }}
                    </div>
                </div>

                <!-- Client ID -->
                <div class="mb-3">
                    <label for="oidcEntraClientId" class="form-label">
                        {{ $t("Client ID") }} <span class="text-danger">*</span>
                    </label>
                    <input
                        id="oidcEntraClientId"
                        v-model="settings.oidcEntraClientId"
                        type="text"
                        class="form-control"
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        required
                    />
                    <div class="form-text">
                        {{ $t("Application (client) ID from your Azure App Registration.") }}
                    </div>
                </div>

                <!-- Client Secret -->
                <div class="mb-3">
                    <label for="oidcEntraClientSecret" class="form-label">
                        {{ $t("Client Secret") }}
                        <span v-if="!hasExistingSecret" class="text-danger">*</span>
                    </label>
                    <input
                        id="oidcEntraClientSecret"
                        v-model="settings.oidcEntraClientSecret"
                        type="password"
                        class="form-control"
                        :placeholder="hasExistingSecret ? $t('Leave blank to keep existing secret') : ''"
                        :required="!hasExistingSecret"
                    />
                    <div class="form-text">
                        {{ $t("Client secret from your Azure App Registration.") }}
                    </div>
                </div>

                <!-- Redirect URI (Read-only) -->
                <div class="mb-3">
                    <label class="form-label">{{ $t("Redirect URI") }}</label>
                    <div class="input-group">
                        <input
                            type="text"
                            class="form-control"
                            :value="redirectUri"
                            readonly
                        />
                        <button class="btn btn-outline-secondary" type="button" @click="copyRedirectUri">
                            {{ $t("Copy") }}
                        </button>
                    </div>
                    <div class="form-text">
                        {{ $t("Add this URL as a redirect URI in your Azure App Registration.") }}
                    </div>
                </div>

                <!-- Allowed Groups -->
                <div class="mb-3">
                    <label for="oidcEntraAllowedGroups" class="form-label">
                        {{ $t("Allowed Groups") }}
                    </label>
                    <input
                        id="oidcEntraAllowedGroups"
                        v-model="allowedGroupsText"
                        type="text"
                        class="form-control"
                        :placeholder="$t('Leave empty to allow all users')"
                    />
                    <div class="form-text">
                        {{ $t("Comma-separated list of Azure AD group Object IDs. Only users in these groups can sign in.") }}
                    </div>
                </div>

                <!-- Default Role -->
                <div class="mb-3">
                    <label for="oidcEntraDefaultRole" class="form-label">
                        {{ $t("Default Role for New Users") }}
                    </label>
                    <select
                        id="oidcEntraDefaultRole"
                        v-model="settings.oidcEntraDefaultRole"
                        class="form-select"
                    >
                        <option value="viewer">{{ $t("Viewer") }} - {{ $t("Read-only access") }}</option>
                        <option value="admin">{{ $t("Admin") }} - {{ $t("Full access") }}</option>
                    </select>
                    <div class="form-text">
                        {{ $t("Role assigned to users when they first sign in via SSO.") }}
                    </div>
                </div>

                <!-- Auto Create Users -->
                <div class="mb-4">
                    <div class="form-check form-switch">
                        <input
                            id="oidcEntraAutoCreateUsers"
                            v-model="settings.oidcEntraAutoCreateUsers"
                            class="form-check-input"
                            type="checkbox"
                        />
                        <label class="form-check-label" for="oidcEntraAutoCreateUsers">
                            {{ $t("Auto-create users on first login") }}
                        </label>
                    </div>
                    <div class="form-text">
                        {{ $t("Automatically create user accounts when users sign in via SSO for the first time.") }}
                    </div>
                </div>

                <!-- Azure Configuration Help -->
                <div class="alert alert-info">
                    <h6 class="alert-heading">{{ $t("Azure AD Configuration") }}</h6>
                    <ol class="mb-0 small">
                        <li>{{ $t("Create an App Registration in Azure Portal") }}</li>
                        <li>{{ $t("Add the Redirect URI shown above") }}</li>
                        <li>{{ $t("Create a Client Secret and copy it here") }}</li>
                        <li>{{ $t("To use group filtering, go to Token configuration and add a groups claim") }}</li>
                    </ol>
                </div>
            </div>

            <div class="mt-4">
                <button class="btn btn-primary" type="submit" :disabled="saving">
                    <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
                    {{ $t("Save") }}
                </button>
            </div>
        </form>
    </div>
</template>

<script>
export default {
    data() {
        return {
            settings: {
                oidcEntraEnabled: false,
                oidcEntraTenantId: "",
                oidcEntraClientId: "",
                oidcEntraClientSecret: "",
                oidcEntraAllowedGroups: [],
                oidcEntraDefaultRole: "viewer",
                oidcEntraAutoCreateUsers: true,
            },
            hasExistingSecret: false,
            saving: false,
            loaded: false,
        };
    },

    computed: {
        redirectUri() {
            return `${window.location.origin}/auth/oidc/entra/callback`;
        },

        allowedGroupsText: {
            get() {
                return Array.isArray(this.settings.oidcEntraAllowedGroups)
                    ? this.settings.oidcEntraAllowedGroups.join(", ")
                    : this.settings.oidcEntraAllowedGroups || "";
            },
            set(value) {
                this.settings.oidcEntraAllowedGroups = value
                    .split(",")
                    .map(g => g.trim())
                    .filter(g => g);
            },
        },
    },

    mounted() {
        this.loadOidcSettings();
    },

    methods: {
        /**
         * Load OIDC settings from server
         */
        loadOidcSettings() {
            this.$root.getSocket().emit("getOidcSettings", (res) => {
                if (res.ok) {
                    this.settings = res.settings;
                    this.hasExistingSecret = res.settings.oidcEntraClientSecret === "********";
                    // Clear the placeholder so user doesn't accidentally save it
                    if (this.hasExistingSecret) {
                        this.settings.oidcEntraClientSecret = "";
                    }
                    this.loaded = true;
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },

        /**
         * Save OIDC settings to server
         */
        saveOidcSettings() {
            this.saving = true;

            this.$root.getSocket().emit("saveOidcSettings", this.settings, (res) => {
                this.saving = false;

                if (res.ok) {
                    this.$root.toastRes(res);
                    this.loadOidcSettings();
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },

        /**
         * Copy redirect URI to clipboard
         */
        async copyRedirectUri() {
            try {
                await navigator.clipboard.writeText(this.redirectUri);
                this.$root.toastSuccess("Copied to clipboard");
            } catch (err) {
                this.$root.toastError("Failed to copy");
            }
        },
    },
};
</script>
