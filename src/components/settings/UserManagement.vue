<template>
    <div>
        <h5 class="my-4 settings-subheading">{{ $t("User Management") }}</h5>

        <div v-if="!$root.isAdmin()" class="alert alert-warning">
            {{ $t("Only administrators can manage users.") }}
        </div>

        <div v-else>
            <!-- User List -->
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>{{ $t("Username") }}</th>
                            <th>{{ $t("Email") }}</th>
                            <th>{{ $t("Display Name") }}</th>
                            <th>{{ $t("Role") }}</th>
                            <th>{{ $t("Auth Method") }}</th>
                            <th>{{ $t("Last Login") }}</th>
                            <th>{{ $t("Actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="7" class="text-center">
                                <div class="spinner-border spinner-border-sm" role="status">
                                    <span class="visually-hidden">{{ $t("Loading...") }}</span>
                                </div>
                            </td>
                        </tr>
                        <tr v-else-if="users.length === 0">
                            <td colspan="7" class="text-center text-muted">
                                {{ $t("No users found") }}
                            </td>
                        </tr>
                        <tr v-for="user in users" :key="user.id">
                            <td>
                                <strong>{{ user.username }}</strong>
                                <span v-if="user.id === currentUserId" class="badge bg-primary ms-1">
                                    {{ $t("You") }}
                                </span>
                            </td>
                            <td>{{ user.email || "-" }}</td>
                            <td>{{ user.displayName || "-" }}</td>
                            <td>
                                <select
                                    v-model="user.role"
                                    class="form-select form-select-sm"
                                    :disabled="user.id === currentUserId"
                                    @change="setUserRole(user)"
                                >
                                    <option value="admin">{{ $t("Admin") }}</option>
                                    <option value="viewer">{{ $t("Viewer") }}</option>
                                </select>
                            </td>
                            <td>
                                <span v-if="user.hasEntraId" class="badge bg-info">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-microsoft me-1" viewBox="0 0 16 16">
                                        <path d="M7.462 0H0v7.19h7.462V0zM16 0H8.538v7.19H16V0zM7.462 8.211H0V16h7.462V8.211zm8.538 0H8.538V16H16V8.211z"/>
                                    </svg>
                                    Entra ID
                                </span>
                                <span v-if="user.hasPassword" class="badge bg-secondary">
                                    {{ $t("Password") }}
                                </span>
                            </td>
                            <td>
                                <span v-if="user.lastLogin">
                                    {{ formatDate(user.lastLogin) }}
                                </span>
                                <span v-else class="text-muted">{{ $t("Never") }}</span>
                            </td>
                            <td>
                                <button
                                    class="btn btn-sm btn-outline-danger"
                                    :disabled="user.id === currentUserId"
                                    :title="user.id === currentUserId ? $t('Cannot delete yourself') : $t('Delete user')"
                                    @click="confirmDeleteUser(user)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">
                                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                                    </svg>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Role Legend -->
            <div class="mt-3 small text-muted">
                <p class="mb-1"><strong>{{ $t("Role Permissions") }}:</strong></p>
                <ul class="mb-0">
                    <li><strong>{{ $t("Admin") }}:</strong> {{ $t("Full access to all features including settings and user management") }}</li>
                    <li><strong>{{ $t("Viewer") }}:</strong> {{ $t("Read-only access to monitors, status pages, and dashboards") }}</li>
                </ul>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <Confirm
            ref="confirmDelete"
            btn-style="btn-danger"
            :yes-text="$t('Delete')"
            :no-text="$t('Cancel')"
            @yes="deleteUser"
        >
            <p>{{ $t("Are you sure you want to delete this user?") }}</p>
            <p v-if="userToDelete" class="mb-0">
                <strong>{{ userToDelete.username }}</strong>
                <span v-if="userToDelete.email"> ({{ userToDelete.email }})</span>
            </p>
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../Confirm.vue";
import dayjs from "dayjs";

export default {
    components: {
        Confirm,
    },

    data() {
        return {
            users: [],
            loading: true,
            userToDelete: null,
        };
    },

    computed: {
        currentUserId() {
            const payload = this.$root.getJWTPayload();
            // We need to get the user ID from somewhere - let's use the socket userID
            // For now, we'll identify by username
            return null; // This will be handled by comparing usernames
        },
    },

    mounted() {
        this.loadUsers();
    },

    methods: {
        /**
         * Load users from server
         */
        loadUsers() {
            this.loading = true;
            this.$root.getSocket().emit("getUsers", (res) => {
                this.loading = false;
                if (res.ok) {
                    this.users = res.users;
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },

        /**
         * Set user role
         * @param {object} user User object
         */
        setUserRole(user) {
            this.$root.getSocket().emit("setUserRole", {
                userId: user.id,
                role: user.role,
            }, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);
                } else {
                    this.$root.toastError(res.msg);
                    // Reload to revert changes
                    this.loadUsers();
                }
            });
        },

        /**
         * Show delete confirmation
         * @param {object} user User to delete
         */
        confirmDeleteUser(user) {
            this.userToDelete = user;
            this.$refs.confirmDelete.show();
        },

        /**
         * Delete user
         */
        deleteUser() {
            if (!this.userToDelete) return;

            this.$root.getSocket().emit("deleteUser", this.userToDelete.id, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);
                    this.loadUsers();
                } else {
                    this.$root.toastError(res.msg);
                }
                this.userToDelete = null;
            });
        },

        /**
         * Format date for display
         * @param {string} date Date string
         * @returns {string} Formatted date
         */
        formatDate(date) {
            if (!date) return "-";
            return dayjs(date).format("YYYY-MM-DD HH:mm");
        },
    },
};
</script>

<style lang="scss" scoped>
.form-select-sm {
    width: auto;
    min-width: 100px;
}
</style>
