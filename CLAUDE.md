# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Repository**: https://github.com/sasquatch-vide-coder/uptime-kuma

## Project Overview

Uptime Kuma is a self-hosted monitoring tool for HTTP(s), TCP, DNS, Docker, and more. Built with Vue 3 (frontend) and Node.js/Express (backend), using Socket.IO for real-time communication instead of REST APIs.

- **Backend**: Node.js >= 20.4, Express, Socket.IO, SQLite (Redbean ORM)
- **Frontend**: Vue 3 SPA, Vite, Bootstrap 5
- **Package Manager**: npm with `legacy-peer-deps=true`

## Essential Commands

```bash
# Install dependencies (always use ci, not install)
npm ci

# Development server (frontend on 3000, backend on 3001)
npm run dev

# Linting (required before commits)
npm run lint              # Both ESLint and Stylelint
npm run lint:prod         # Zero warnings mode for production

# Build frontend
npm run build             # Outputs to dist/

# Testing
npm run test-backend      # Backend unit tests
npm test                  # All tests
npm run test-e2e          # Playwright E2E tests (requires npx playwright install first)
```

## Architecture

### Backend (`server/`)

- **Entry**: `server/server.js` → `server/uptime-kuma-server.js` (singleton)
- **Socket Handlers**: `server/socket-handlers/` - All client-server communication uses Socket.IO events, not REST
- **Models**: `server/model/` - Redbean ORM beans auto-mapped to database tables
- **Monitor Types**: `server/monitor-types/` - Each monitor type extends base class with `check()` method
- **Notification Providers**: `server/notification-providers/` - 90+ integrations, each extends base with `send()` method
- **Routers**: `server/routers/` - Express routes for non-socket endpoints (push API, status pages)

### Frontend (`src/`)

- **Pages**: `src/pages/` - Main views (Dashboard, EditMonitor, Settings, StatusPage)
- **Components**: `src/components/` - Reusable Vue components
- **Socket Mixin**: `src/mixins/socket.js` - Provides `$socket.emit()` for all components
- **Translations**: `src/lang/en.json` - Only modify English, other languages via Weblate

### Database

- **ORM**: Redbean Node with Knex.js migrations
- **Migrations**: `db/knex_migrations/` - Filename format: `YYYY-MM-DD-HHMM-description.js`
- **Status Constants**: 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE

## Key Patterns

### Socket Handler Pattern
```javascript
module.exports.handlerName = (socket, server) => {
    socket.on("eventName", async (data, callback) => {
        try {
            checkLogin(socket);
            checkPermission(socket, "resource:action");
            let bean = R.dispense("table");
            bean.field = value;
            await R.store(bean);
            callback({ ok: true, msg: "success" });
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });
};
```

### Redbean ORM Pattern
```javascript
let bean = R.dispense("monitor");     // Create
bean.name = "value";
await R.store(bean);                   // Save
let bean = await R.findOne("table", " id = ? ", [id]);  // Query
```

### Vue Component Socket Pattern
```javascript
this.$root.getSocket().emit("eventName", data, (res) => {
    if (res.ok) { /* success */ }
});
```

## Code Style (Enforced by Linters)

- 4 spaces indentation, double quotes, Unix LF line endings, semicolons required
- **JavaScript/TypeScript**: camelCase
- **Database columns**: snake_case
- **CSS classes**: kebab-case
- JSDoc required for all functions

## Adding New Features

### New Notification Provider
1. `server/notification-providers/PROVIDER.js` - Backend logic extending NotificationProvider
2. `server/notification.js` - Register the provider
3. `src/components/notifications/PROVIDER.vue` - Frontend form
4. `src/components/notifications/index.js` - Register frontend component
5. `src/lang/en.json` - Translation keys

### New Monitor Type
1. `server/monitor-types/TYPE.js` - Backend logic extending MonitorType
2. `server/uptime-kuma-server.js` - Register the monitor type
3. `src/pages/EditMonitor.vue` - Frontend form fields
4. `src/lang/en.json` - Translation keys

## Important Notes

- `npm run tsc` shows 1400+ TypeScript errors - this is expected, ignore them
- First run shows "db-config.json not found" - expected, triggers setup wizard
- Dev server uses ports 3000 (frontend) and 3001 (backend)
- Always run `npm run build` before running tests
- Git branches: `master` (v2 development), `1.23.X` (v1 maintenance)
