<template>
    <div class="form-container">
        <div class="form">
            <!-- OIDC Error Display -->
            <div v-if="oidcError" class="alert alert-danger mb-3" role="alert">
                {{ oidcError }}
            </div>

            <!-- OIDC Login Processing -->
            <div v-if="oidcProcessing" class="text-center mb-3">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">{{ $t("Loading...") }}</span>
                </div>
                <p class="mt-2">{{ $t("Completing SSO login...") }}</p>
            </div>

            <form v-if="!oidcProcessing" @submit.prevent="submit">
                <h1 class="h3 mb-3 fw-normal" />

                <div v-if="!tokenRequired" class="form-floating">
                    <input
                        id="floatingInput"
                        v-model="username"
                        type="text"
                        class="form-control"
                        placeholder="Username"
                        autocomplete="username"
                        required
                    />
                    <label for="floatingInput">{{ $t("Username") }}</label>
                </div>

                <div v-if="!tokenRequired" class="form-floating mt-3">
                    <input
                        id="floatingPassword"
                        v-model="password"
                        type="password"
                        class="form-control"
                        placeholder="Password"
                        autocomplete="current-password"
                        required
                    />
                    <label for="floatingPassword">{{ $t("Password") }}</label>
                </div>

                <div v-if="tokenRequired">
                    <div class="form-floating mt-3">
                        <input
                            id="otp"
                            ref="otpInput"
                            v-model="token"
                            type="text"
                            maxlength="6"
                            class="form-control"
                            placeholder="123456"
                            autocomplete="one-time-code"
                            required
                        />
                        <label for="otp">{{ $t("Token") }}</label>
                    </div>
                </div>

                <div class="form-check mb-3 mt-3 d-flex justify-content-center pe-4">
                    <div class="form-check">
                        <input
                            id="remember"
                            v-model="$root.remember"
                            type="checkbox"
                            value="remember-me"
                            class="form-check-input"
                        />

                        <label class="form-check-label" for="remember">
                            {{ $t("Remember me") }}
                        </label>
                    </div>
                </div>
                <button class="w-100 btn btn-primary" type="submit" :disabled="processing">
                    {{ $t("Login") }}
                </button>

                <!-- SSO Login Button -->
                <div v-if="oidcEnabled" class="mt-3">
                    <div class="divider-text mb-3">
                        <span>{{ $t("or") }}</span>
                    </div>
                    <button
                        type="button"
                        class="w-100 btn btn-outline-primary"
                        :disabled="processing"
                        @click="loginWithEntra"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-microsoft me-2" viewBox="0 0 16 16">
                            <path d="M7.462 0H0v7.19h7.462V0zM16 0H8.538v7.19H16V0zM7.462 8.211H0V16h7.462V8.211zm8.538 0H8.538V16H16V8.211z"/>
                        </svg>
                        {{ $t("Login with Microsoft") }}
                    </button>
                </div>

                <div v-if="res && !res.ok" class="alert alert-danger mt-3" role="alert">
                    {{ $t(res.msg) }}
                </div>
            </form>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            processing: false,
            username: "",
            password: "",
            token: "",
            res: null,
            tokenRequired: false,
            oidcEnabled: false,
            oidcError: null,
            oidcProcessing: false,
        };
    },

    watch: {
        tokenRequired(newVal) {
            if (newVal) {
                this.$nextTick(() => {
                    this.$refs.otpInput?.focus();
                });
            }
        },
    },

    mounted() {
        document.title += " - Login";
        this.checkOidcConfig();
        this.handleOidcCallback();
    },

    unmounted() {
        document.title = document.title.replace(" - Login", "");
    },

    methods: {
        /**
         * Check if OIDC is enabled
         * @returns {void}
         */
        async checkOidcConfig() {
            try {
                const response = await fetch("/auth/oidc/entra/config");
                const data = await response.json();
                this.oidcEnabled = data.enabled;
            } catch (e) {
                console.error("Failed to check OIDC config:", e);
            }
        },

        /**
         * Handle OIDC callback parameters from URL
         * @returns {void}
         */
        handleOidcCallback() {
            const urlParams = new URLSearchParams(window.location.search);
            const oidcCode = urlParams.get("oidc_code");
            const oidcError = urlParams.get("oidc_error");

            // Clean up URL parameters
            if (oidcCode || oidcError) {
                const newUrl = window.location.pathname;
                window.history.replaceState({}, "", newUrl);
            }

            if (oidcError) {
                this.oidcError = decodeURIComponent(oidcError);
                return;
            }

            if (oidcCode) {
                this.exchangeOidcCode(oidcCode);
            }
        },

        /**
         * Exchange OIDC login code for JWT
         * @param {string} code One-time login code from OIDC callback
         * @returns {void}
         */
        exchangeOidcCode(code) {
            this.oidcProcessing = true;
            this.oidcError = null;

            this.$root.getSocket().emit("loginByOidcCode", code, (res) => {
                this.oidcProcessing = false;

                if (res.ok) {
                    this.$root.storage().token = res.token;
                    this.$root.socket.token = res.token;
                    this.$root.loggedIn = true;
                    this.$root.username = this.$root.getJWTPayload()?.username;
                    this.$root.userRole = res.role;

                    // Trigger navigation
                    history.pushState({}, "");
                } else {
                    this.oidcError = res.msg;
                }
            });
        },

        /**
         * Redirect to Microsoft Entra ID login
         * @returns {void}
         */
        loginWithEntra() {
            window.location.href = "/auth/oidc/entra/login";
        },

        /**
         * Submit the user details and attempt to log in
         * @returns {void}
         */
        submit() {
            this.processing = true;

            this.$root.login(this.username, this.password, this.token, (res) => {
                this.processing = false;

                if (res.tokenRequired) {
                    this.tokenRequired = true;
                } else {
                    this.res = res;
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
.form-container {
    display: flex;
    align-items: center;
    padding-top: 40px;
    padding-bottom: 40px;
}

.form-floating {
    > label {
        padding-left: 1.3rem;
    }

    > .form-control {
        padding-left: 1.3rem;
    }
}

.form {
    width: 100%;
    max-width: 330px;
    padding: 15px;
    margin: auto;
    text-align: center;
}

.divider-text {
    display: flex;
    align-items: center;
    text-align: center;
    color: #6c757d;

    &::before,
    &::after {
        content: "";
        flex: 1;
        border-bottom: 1px solid #dee2e6;
    }

    span {
        padding: 0 10px;
        font-size: 0.875rem;
    }
}
</style>
