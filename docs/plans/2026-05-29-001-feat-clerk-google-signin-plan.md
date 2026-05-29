---
title: "feat: Add Google Sign-In via Clerk"
status: active
plan_depth: Standard
created: 2026-05-29
origin: User request — integrate Google OAuth Sign-In using Clerk as auth provider
---

# feat: Add Google Sign-In via Clerk

## Problem Frame

Mafiking currently only supports email/password authentication (bcrypt + express-session + SQLite). Users have requested the ability to sign in with their Google account for a faster, frictionless onboarding experience. **Clerk** will be used as the OAuth provider, handling the Google Sign-In flow, while the existing email/password auth remains fully operational.

### Key Constraints

- **No architecture migration.** The app runs on `MAFIKING.html` with React UMD + Babel standalone (no bundler). ClerkJS must be loaded via CDN `<script>` tag, not `@clerk/react`.
- **Dual auth.** Both session-cookie auth (existing) and Clerk JWT auth (new) must coexist. Every API route must work with either auth source.
- **SQLite remains the source of truth.** Clerk users must be mapped to local `users` table rows. All features (progress, XP, streak, corrections) use `users.id` as foreign key.
- **Existing UI preserved.** The `AuthScreen` in `src/lobby.jsx` keeps its current layout. A "Sign in with Google" button is added below the existing form, not replacing it.

---

## Scope Boundaries

### In Scope

- Clerk project setup guidance (account creation, Google provider config, API keys)
- ClerkJS CDN integration in `MAFIKING.html`
- Google Sign-In button in `AuthScreen` (login + signup modes)
- Display name prompt after first Google sign-up
- Backend dual-auth middleware (`@clerk/express` + existing session)
- `users` table schema migration (add `clerk_id`, `email`, `auth_provider` columns)
- Clerk webhook endpoint for user sync (production)
- Lazy sync fallback for development (no ngrok needed)
- Account linking: if Google email matches existing `username`, auto-merge
- Guest-to-Google upgrade: transfer guest data to new Google account
- Environment variable setup (`.env` additions)

### Deferred to Follow-Up Work

- Additional social providers (GitHub, Facebook, etc.)
- Full migration away from email/password auth
- Clerk Organizations / multi-tenancy
- Clerk webhook for `user.updated` / `user.deleted` events
- Production deployment guide (ngrok replacement, public webhook URL)

---

## Key Technical Decisions

### D1. ClerkJS via CDN, not @clerk/react

**Rationale:** The app uses React UMD + Babel standalone without a bundler. `@clerk/react` requires a build system (Vite/Webpack). Using ClerkJS via CDN `<script>` tag is the only option that preserves the current architecture. Clerk is initialized with `window.Clerk.load()` and sign-in is triggered via `window.Clerk.openSignIn()`.

### D2. Dual-Auth Middleware Pattern

**Rationale:** Instead of routing all Clerk users through session creation (which would make Clerk a "one-time pass-through"), the backend natively supports both auth sources. A new middleware layer checks for a Clerk JWT bearer token first; if present, it verifies via `@clerk/express` and maps the Clerk `userId` to the local `users.id`. If no Clerk token is found, the existing `express-session` flow runs unchanged. This keeps Clerk auth stateless and session auth stateful — both coexist cleanly.

### D3. Lazy Sync Fallback for Development

**Rationale:** Clerk webhooks require a public URL (ngrok or similar) during development, which adds friction. The plan includes a "lazy sync" fallback: when the dual-auth middleware encounters a verified Clerk user without a local `users` row, it creates one on-the-fly. This makes development possible without ngrok. In production, the webhook is the primary sync mechanism, with lazy sync as a safety net for race conditions (user hits API before webhook fires).

### D4. Account Linking by Email Match

**Rationale:** When a Google Sign-In produces an email that matches an existing `username` in `users`, the accounts are automatically linked by setting the `clerk_id` on the existing row. This prevents duplicate accounts and lets existing users start using Google Sign-In without losing their data. The reverse also works: a linked user can still log in with their password.

### D5. Display Name Prompt After Google Sign-Up

**Rationale:** User requested an extra step after Google OAuth where new users can choose their display name (rather than auto-using Google profile name). This is implemented as a modal/step in the frontend after Clerk auth completes and before the user is fully onboarded.

---

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAFIKING.html                            │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ React UMD    │   │ Babel        │   │ ClerkJS CDN          │ │
│  │ (existing)   │   │ (existing)   │   │ (NEW - <script>)     │ │
│  └──────────────┘   └──────────────┘   └──────────────────────┘ │
│                                                                 │
│  AuthScreen (src/lobby.jsx)                                     │
│  ┌─────────────────────────────┐                                │
│  │ [Username/Email    ]        │                                │
│  │ [Password          ]        │                                │
│  │ [   Login/Daftar   ]        │                                │
│  │ ─────── atau ───────        │  ← NEW divider                │
│  │ [G  Sign in with Google]    │  ← NEW button (calls          │
│  └─────────────────────────────┘    window.Clerk.openSignIn())  │
│                                                                 │
│  Display Name Prompt (NEW)                                      │
│  ┌─────────────────────────────┐                                │
│  │ "Pilih display name kamu"   │  ← Shows after first Google   │
│  │ [Display Name      ]        │    sign-up only               │
│  │ [      Lanjut      ]        │                                │
│  └─────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Express Backend                             │
│                                                                 │
│  Dual-Auth Middleware (NEW)                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Request arrives                                        │    │
│  │    ├─ Has Bearer token?                                 │    │
│  │    │   ├─ YES → Verify via @clerk/express               │    │
│  │    │   │       → Map clerk_id → local users.id          │    │
│  │    │   │       → Set req.userId + req.role              │    │
│  │    │   │       → (Lazy sync if user not in SQLite)      │    │
│  │    │   └─ NO  → Fall through to express-session         │    │
│  │    │           → Use req.session.userId (existing flow)  │    │
│  │    └─ Neither? → Auto-guest (existing behavior)          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Webhook Endpoint (NEW - /api/webhooks/clerk)                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  user.created → Verify signature (svix)                 │    │
│  │              → Create users row with clerk_id           │    │
│  │              → Check email match → link if found        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  SQLite users table (MODIFIED)                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  + clerk_id TEXT UNIQUE         (Clerk user ID)         │    │
│  │  + email TEXT                   (from Google profile)   │    │
│  │  + auth_provider TEXT DEFAULT 'local'                   │    │
│  │    ('local' | 'clerk' | 'linked')                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Units

### U1. Environment & Dependencies Setup

**Goal:** Install required npm packages and configure environment variables for Clerk integration.

**Requirements:** Foundation for all subsequent units.

**Dependencies:** None (first unit).

**Files:**
- `package.json` — add `@clerk/express` and `svix` dependencies
- `.env` — add `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` placeholders
- `.env.example` (or `.env.template` if exists) — document new env vars

**Approach:**
- `npm install @clerk/express svix`
- Add env var documentation with comments explaining where to get each key
- Add `CLERK_WEBHOOK_SIGNING_SECRET` env var (for production webhook)
- Ensure `.gitignore` covers `.env`

**Patterns to follow:** Existing env var pattern in `server.js` (e.g., `process.env.SESSION_SECRET`, `process.env.GEMINI_KEY_1`)

**Test scenarios:**
- Server starts without Clerk keys set (graceful degradation — Google button hidden, no crash)
- Server starts with Clerk keys set (Clerk features enabled)

**Verification:** `npm install` completes without errors. Server boots cleanly with and without the new env vars.

---

### U2. Database Schema Migration

**Goal:** Add columns to `users` table to support Clerk-linked accounts.

**Requirements:** Enable storing Clerk user ID, email, and auth provider for each user.

**Dependencies:** None (can run in parallel with U1).

**Files:**
- `db/schema.sql` — add new columns to `CREATE TABLE users` for documentation
- `server.js` — add ALTER TABLE migration block (same pattern as existing column migrations)

**Approach:**
Add three new columns via `ALTER TABLE` in the server startup migration block (same pattern used for `fakultas`, `highest_streak`, etc.):

```sql
ALTER TABLE users ADD COLUMN clerk_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local';
```

- `clerk_id`: The Clerk external user ID (e.g., `user_2abc...`). UNIQUE constraint.
- `email`: User's email from Google profile. Not UNIQUE because it might match an existing `username`.
- `auth_provider`: `'local'` (email/password only), `'clerk'` (Google-only), `'linked'` (both methods available).
- Existing users get `auth_provider = 'local'` by default.
- Guest users keep `auth_provider = 'local'` and `clerk_id = NULL`.

**Patterns to follow:** Existing migration pattern in `server.js`:
```js
try { db.prepare("ALTER TABLE users ADD COLUMN fakultas TEXT DEFAULT ''").run(); } catch(e) {}
```

**Test scenarios:**
- Fresh database: columns exist from schema creation
- Existing database: ALTER TABLE runs without error, existing users get default values
- Re-running migration: ALTER TABLE silently fails (column already exists), no crash

**Verification:** After server start, `PRAGMA table_info(users)` shows `clerk_id`, `email`, `auth_provider` columns.

---

### U3. Dual-Auth Middleware

**Goal:** Create middleware that accepts both Clerk JWT tokens and existing session cookies, mapping both to a local `users.id`.

**Requirements:** All existing API routes must continue working with session auth. New Clerk-authenticated requests must also work.

**Dependencies:** U1 (packages installed), U2 (schema migrated).

**Files:**
- `middleware/clerk-auth.js` — **[NEW]** Clerk token verification + local user mapping
- `server.js` — mount the new middleware in the middleware chain (before route handlers, after session middleware)
- `middleware/auth.js` — modify `isAuthenticated` to check both `req.userId` (Clerk-set) and `req.session.userId`

**Approach:**
1. Create `middleware/clerk-auth.js`:
   - Import `clerkMiddleware` or `verifyToken` from `@clerk/express`
   - For each request with `Authorization: Bearer <token>`:
     - Verify the Clerk JWT
     - Extract `clerkUserId` from the verified token
     - Look up `users` table by `clerk_id`
     - If found: set `req.userId = user.id` and `req.role = user.role`
     - If NOT found (lazy sync): create a new user row with `clerk_id`, `auth_provider = 'clerk'`, fetch user details from Clerk API for email/display_name
   - If no Bearer token: call `next()` (fall through to session flow)

2. Update `middleware/auth.js` `isAuthenticated`:
   - Check `req.userId` (set by Clerk middleware) OR `req.session.userId`
   - Normalize to a single `req.userId` for downstream routes

3. Mount order in `server.js`:
   ```
   session middleware → clerk-auth middleware → auto-guest middleware → routes
   ```

**Patterns to follow:**
- Existing `isAuthenticated` in `middleware/auth.js` (9 lines, simple check)
- Existing auto-guest middleware in `server.js`

**Test scenarios:**
- Request with valid Clerk Bearer token → user identified, API works
- Request with invalid/expired Clerk token → 401 returned
- Request with session cookie (no Bearer token) → existing flow works unchanged
- Request with neither → auto-guest behavior unchanged
- Clerk user not in SQLite yet → lazy sync creates user, API works
- Clerk user already in SQLite → lookup succeeds, no duplicate created
- Admin user via Clerk → `req.role = 'admin'` set correctly

**Verification:** All existing API tests pass. Clerk-authenticated requests return correct user data.

---

### U4. Clerk Webhook Endpoint

**Goal:** Create a webhook endpoint that receives `user.created` events from Clerk and syncs users to the local SQLite database.

**Requirements:** Production-ready user sync. Account linking when email matches existing user.

**Dependencies:** U1 (svix installed), U2 (schema migrated).

**Files:**
- `routes/webhooks.js` — **[NEW]** webhook handler for Clerk events
- `server.js` — mount webhook route (BEFORE `express.json()` middleware — webhook needs raw body)

**Approach:**
1. Create `routes/webhooks.js`:
   - Use `svix` to verify webhook signature
   - Handle `user.created` event:
     - Extract `clerk_id`, `email_addresses`, `first_name`, `last_name` from event data
     - Check if `email` matches any existing `username` in `users`:
       - **Match found:** Link accounts — set `clerk_id` and `auth_provider = 'linked'` on existing row
       - **No match:** Create new user row with `clerk_id`, `email`, `auth_provider = 'clerk'`, `password_hash = 'none'`
     - Return 200

2. Mount in `server.js`:
   - `app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), webhookRouter)`
   - This route must be BEFORE `express.json()` global middleware or use its own body parser
   - This route must be PUBLIC (no `isAuthenticated`)

3. Exclude from auto-guest middleware:
   - Add `/api/webhooks/clerk` to the skip list alongside `/api/health` and `/api/payment/callback`

**Patterns to follow:**
- Existing public route exclusion pattern in auto-guest middleware
- Existing route mounting pattern in `server.js`

**Test scenarios:**
- Valid `user.created` webhook → user row created in SQLite
- Valid webhook with email matching existing user → accounts linked, no duplicate
- Invalid signature → 400 returned, no database change
- Duplicate webhook (same clerk_id already exists) → idempotent, no error
- Missing/malformed event data → graceful error handling
- Webhook for unsupported event type → 200 returned, no action

**Verification:** Webhook endpoint returns 200 for valid signed requests. User appears in `users` table with correct `clerk_id`.

---

### U5. ClerkJS CDN Integration in MAFIKING.html

**Goal:** Load the ClerkJS library via CDN script tag and initialize it on page load.

**Requirements:** ClerkJS must be available as `window.Clerk` for frontend components to use.

**Dependencies:** U1 (env vars configured — publishable key needed).

**Files:**
- `MAFIKING.html` — add ClerkJS `<script>` tag and initialization script
- `server.js` — expose `CLERK_PUBLISHABLE_KEY` to the frontend (inject into HTML or serve via API endpoint)

**Approach:**
1. Add ClerkJS CDN script to `MAFIKING.html`:
   ```html
   <script
     async
     crossorigin="anonymous"
     src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"
     data-clerk-publishable-key="{{CLERK_PUBLISHABLE_KEY}}"
   ></script>
   ```

2. Expose publishable key to frontend:
   - Option A: Server-side template replacement when serving `MAFIKING.html` (replace `{{CLERK_PUBLISHABLE_KEY}}` placeholder)
   - Option B: Add a public `/api/config` endpoint that returns the publishable key
   - Recommend Option A since `server.js` already reads and serves `MAFIKING.html`

3. Add initialization in a `<script type="text/babel">` block (or regular script):
   ```js
   window.addEventListener('load', async () => {
     if (window.Clerk) {
       await window.Clerk.load();
       // Clerk is ready — dispatch custom event for React components
       window.dispatchEvent(new Event('clerk-ready'));
     }
   });
   ```

4. If `CLERK_PUBLISHABLE_KEY` is not set, skip the script tag entirely (graceful degradation).

**Patterns to follow:**
- Existing CDN script loading in `MAFIKING.html` (Tailwind CDN, React UMD, etc.)
- Existing `window.*` global pattern for inter-script communication

**Test scenarios:**
- Clerk key configured → ClerkJS loads, `window.Clerk` available
- Clerk key NOT configured → No Clerk script tag, no errors, Google button hidden
- ClerkJS CDN unavailable → Page still loads, existing auth works, Google button shows error/hidden
- `window.Clerk.load()` completes → 'clerk-ready' event fires

**Verification:** Open browser console, confirm `window.Clerk` is defined and `window.Clerk.user` reflects sign-in state.

---

### U6. Google Sign-In Button in AuthScreen

**Goal:** Add a "Sign in with Google" button to the existing `AuthScreen` component in `src/lobby.jsx`.

**Requirements:** Button appears in both login and signup modes. Clicking it triggers Clerk's Google OAuth flow. After successful auth, user is onboarded to the app.

**Dependencies:** U3 (dual-auth middleware), U5 (ClerkJS loaded).

**Files:**
- `src/lobby.jsx` — modify `AuthScreen` component to add Google button
- `src/styles.css` — add styles for Google button and "atau" divider (if needed)

**Approach:**
1. Add divider and Google button below the existing form:
   ```jsx
   {/* After the submit button */}
   <div className="auth-divider">
     <span>atau</span>
   </div>
   <button
     className="google-signin-btn"
     onClick={handleGoogleSignIn}
     disabled={!window.Clerk}
   >
     <GoogleIcon /> Sign in with Google
   </button>
   ```

2. `handleGoogleSignIn` function:
   - Call `window.Clerk.openSignIn({ strategy: 'oauth_google' })` or equivalent Clerk API
   - Listen for sign-in completion via Clerk's event/callback
   - After Clerk auth completes:
     - Get Clerk session token
     - Call `GET /api/auth/me` with Bearer token to verify backend recognizes the user
     - If new user (first Google sign-up) → show display name prompt (U7)
     - If existing/linked user → call `onAuthSuccess()` and navigate

3. Conditionally render Google button:
   - Only show if `window.Clerk` is available (graceful degradation when key not set)
   - Show loading state while Clerk initializes

4. Style the button to match Google's branding guidelines (white background, Google "G" icon, proper font)

**Patterns to follow:**
- Existing `AuthScreen` form submission pattern in `src/lobby.jsx`
- Existing `onAuthSuccess(user, redirect)` callback pattern in `src/app.jsx`

**Test scenarios:**
- Google button visible when Clerk is loaded
- Google button hidden when Clerk key not configured
- Click Google button → Clerk OAuth popup opens
- Successful Google auth → user redirected to app
- User cancels Google popup → returns to auth screen, no error
- Google auth with existing linked account → direct login, no display name prompt
- Google auth as new user → display name prompt appears (U7)
- Google auth while guest session active → guest data transferred (U8)

**Verification:** Click "Sign in with Google" → Google OAuth flow completes → user lands in app with correct identity.

---

### U7. Display Name Prompt for New Google Users

**Goal:** Show a prompt asking new Google Sign-Up users to choose their display name before completing onboarding.

**Requirements:** Only shown on first Google sign-up (not subsequent logins). Uses the chosen name as `display_name` in the local `users` table.

**Dependencies:** U6 (Google button flow).

**Files:**
- `src/lobby.jsx` — add `DisplayNamePrompt` component
- `src/backend-api.jsx` — add API call to set display name after Google signup

**Approach:**
1. Create `DisplayNamePrompt` component:
   - Simple modal/card with text input for display name
   - Pre-filled with Google profile name as suggestion
   - "Lanjut" button to confirm
   - No "Skip" — display name is required

2. Flow:
   - After Clerk Google auth completes → check if user is new (backend returns flag or user has no display_name set)
   - If new → render `DisplayNamePrompt` instead of navigating
   - On submit → `POST /api/auth/set-display-name` or `PATCH /api/auth/me` with `{ display_name }`
   - After display name set → call `onAuthSuccess()` and navigate

3. Backend:
   - Add `POST /api/auth/clerk-onboard` endpoint in `routes/auth.js`:
     - Accepts `{ display_name }` from authenticated Clerk user
     - Updates `users.display_name` where `clerk_id` matches
     - Returns updated user profile

**Patterns to follow:**
- Existing modal patterns in the app (e.g., confirmation dialogs)
- Existing `onAuthSuccess` callback flow

**Test scenarios:**
- New Google user → prompt appears with Google name pre-filled
- User changes display name → saved correctly
- User submits empty display name → validation error
- User submits display name with XSS → sanitized (match existing register sanitization)
- Returning Google user → no prompt, direct login
- Display name prompt → "Lanjut" → navigates to correct redirect (belajar or original auth redirect)

**Verification:** Sign up with Google → prompted for display name → name appears in profile after login.

---

### U8. Guest-to-Google Account Upgrade

**Goal:** When a guest user signs in with Google, transfer their existing guest data (progress, corrections, etc.) to the new Google account.

**Requirements:** Same behavior as the current guest-to-registered upgrade path, but triggered after Google OAuth instead of email/password registration.

**Dependencies:** U3 (dual-auth), U6 (Google button flow), U7 (display name prompt).

**Files:**
- `middleware/clerk-auth.js` — add guest upgrade logic to lazy sync
- `routes/auth.js` — add `POST /api/auth/clerk-onboard` with guest merge capability
- `server.js` — ensure guest session data is accessible during upgrade

**Approach:**
1. During Google sign-in flow:
   - Frontend detects current session is a guest (`isGuest` check)
   - After Clerk auth completes, sends `POST /api/auth/clerk-onboard` with:
     - Clerk session token (Bearer header)
     - `{ display_name, guest_user_id: currentGuestUserId }` (body)

2. Backend `clerk-onboard` endpoint:
   - Verify Clerk token
   - If `guest_user_id` provided:
     - Verify guest exists and `password_hash = 'none'`
     - Transfer all foreign-key references from guest to new/linked Clerk user:
       - `user_progress` rows
       - `correction_attempts` rows
       - `ai_token_usage` rows
       - Any other tables with `user_id` FK
     - Delete the old guest row
   - Set display name
   - Return updated user profile

3. Frontend post-merge:
   - Update `currentUser` state with new user data
   - Navigate to redirect or default route

**Patterns to follow:**
- Current guest cleanup pattern in `server.js` (the `setInterval` cleanup)
- Existing foreign key relationships in `db/schema.sql`

**Test scenarios:**
- Guest with progress data → signs in with Google → progress preserved under new account
- Guest with no data → signs in with Google → clean new account created
- Non-guest user (already logged in) → signs in with Google → no guest merge attempted
- Guest merge with database error → rollback, guest data not lost
- Duplicate merge attempt (same guest, same Clerk user) → idempotent

**Verification:** As guest, answer some questions → sign in with Google → verify progress still visible in profile.

---

### U9. Auth State Sync & Logout Handling

**Goal:** Ensure the frontend correctly manages auth state for both Clerk and session-based users, including logout.

**Requirements:** `currentUser` state in `app.jsx` must correctly reflect the auth source. Logout must clear both Clerk and session state.

**Dependencies:** U3 (dual-auth), U5 (ClerkJS), U6 (Google button).

**Files:**
- `src/app.jsx` — update `refreshCurrentUser`, `handleLogout`, and auth state management
- `src/backend-api.jsx` — update `MafikingAPI` to include Clerk Bearer token when available

**Approach:**
1. Update `MafikingAPI` in `src/backend-api.jsx`:
   - Before each `fetch()` call, check if `window.Clerk?.session` exists
   - If yes, get the session token via `window.Clerk.session.getToken()`
   - Add `Authorization: Bearer <token>` header to the request
   - Keep `credentials: 'same-origin'` for backward compatibility with session auth

2. Update `refreshCurrentUser` in `src/app.jsx`:
   - After `window.Clerk.load()`, check `window.Clerk.user` state
   - If Clerk user exists and `GET /api/auth/me` succeeds with Bearer token → set as currentUser
   - If no Clerk user → fall through to existing session-based check

3. Update `handleLogout` in `src/app.jsx`:
   - If `window.Clerk?.user` → call `window.Clerk.signOut()` first
   - Then call `POST /api/auth/logout` (existing session destroy)
   - Then `window.location.assign("/")`

4. Listen for Clerk sign-out events:
   - `window.Clerk.addListener(({ user }) => { if (!user) refreshCurrentUser() })`
   - This handles cases where Clerk session expires or user signs out from another tab

**Patterns to follow:**
- Existing `refreshCurrentUser` pattern in `src/app.jsx`
- Existing `handleLogout` pattern in `src/app.jsx`
- Existing `MafikingAPI` fetch wrapper pattern

**Test scenarios:**
- Clerk user → `MafikingAPI` calls include Bearer token
- Session user → `MafikingAPI` calls use cookie only (no Bearer header)
- Guest user → no Bearer token, session cookie only
- Logout as Clerk user → Clerk signed out + session destroyed + redirect to landing
- Logout as session user → only session destroyed (no Clerk involved)
- Clerk session expires → user gracefully logged out
- Page refresh as Clerk user → auth state restored from Clerk
- Page refresh as session user → auth state restored from session (existing behavior)

**Verification:** Login via Google → refresh page → still logged in → logout → both Clerk and session cleared.

---

### U10. Documentation & Env Setup Guide

**Goal:** Update project documentation to reflect the new Clerk integration and provide setup instructions.

**Requirements:** New developers must be able to set up Clerk integration from scratch.

**Dependencies:** All previous units complete.

**Files:**
- `README.md` — add Clerk setup section
- `ARCHITECTURE.md` — update auth architecture description
- `AGENTS.md` — add Clerk-related facts and rules
- `.env.example` — ensure all new env vars are documented

**Approach:**
1. `README.md`:
   - Add "Google Sign-In Setup" section with step-by-step:
     1. Create Clerk account at clerk.com
     2. Create Clerk application
     3. Enable Google as social connection
     4. Copy API keys to `.env`
     5. (Production) Set up webhook endpoint

2. `ARCHITECTURE.md`:
   - Add dual-auth diagram
   - Document Clerk ↔ SQLite sync flow
   - Document account linking behavior

3. `AGENTS.md`:
   - Add `clerk_id`, `email`, `auth_provider` to runtime facts
   - Add `middleware/clerk-auth.js` and `routes/webhooks.js` to required context
   - Add Clerk-related rules (e.g., "Keep dual-auth middleware order")

**Test scenarios:**
- Test expectation: none — documentation-only unit

**Verification:** A new developer can follow README instructions to set up Clerk from scratch.

---

## Verification Plan

### Automated Tests

Run after all units are complete:

```bash
npm run check        # Build/lint check passes
npm start            # Server starts without errors (with and without Clerk keys)
```

### Manual Verification (Browser Smoke Tests)

1. **Without Clerk keys set:** Server starts, all existing features work, Google button NOT shown
2. **With Clerk keys set:**
   - Google button appears in login/signup AuthScreen
   - Click "Sign in with Google" → Google OAuth popup opens
   - Complete Google auth → display name prompt (first time only)
   - Set display name → lands in Belajar page
   - Profile shows correct display name and Google-linked account
3. **Existing auth unchanged:**
   - Login with username/password still works
   - Register with username/password still works
   - Guest auto-creation still works
   - Admin login (`123`/`135`) still works
4. **Account linking:**
   - Register with email `test@gmail.com` (password auth)
   - Sign in with Google using same `test@gmail.com`
   - Both login methods work for the same account
5. **Guest upgrade:**
   - Browse as guest → answer questions → sign in with Google
   - Progress preserved under new Google account
6. **Logout:** Both Clerk and session state cleared
7. **Practice page:** All practice flows still work (free Try Out, paid chapters, canvas)

### API Verification

```bash
# Health check (unchanged)
curl -s http://127.0.0.1:3000/api/health

# Webhook endpoint exists (will return 400 without proper signature)
curl -s -X POST http://127.0.0.1:3000/api/webhooks/clerk
```

---

## Prerequisite: Clerk Account Setup (Manual Steps Before Codex Runs)

> [!IMPORTANT]
> These steps must be done manually BEFORE running Codex to execute this plan.

1. **Create Clerk account:** Go to [clerk.com](https://clerk.com) → Sign up
2. **Create application:** In Clerk Dashboard → "Create application"
3. **Enable Google:**
   - Go to **SSO Connections** → **Add connection** → **Google**
   - Enable for sign-up and sign-in
   - For development: use Clerk's shared Google credentials (no Google Cloud Console needed)
   - For production: create your own Google OAuth credentials
4. **Copy API keys:**
   - Go to **API Keys** in Clerk Dashboard
   - Copy `CLERK_PUBLISHABLE_KEY` (starts with `pk_test_...`)
   - Copy `CLERK_SECRET_KEY` (starts with `sk_test_...`)
5. **Add to `.env`:**
   ```
   CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
   CLERK_SECRET_KEY=sk_test_your_key_here
   ```
6. **(Optional, for production webhook):** Copy webhook signing secret after setting up the endpoint

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ClerkJS CDN down | Google Sign-In unavailable | Graceful degradation — button hidden, existing auth works |
| Clerk JWT verification fails intermittently | Users get 401 errors | Retry logic in middleware, fallback to session if available |
| Webhook race condition (user hits API before webhook fires) | User not found in SQLite | Lazy sync fallback creates user on-the-fly |
| Account linking merges wrong accounts | Data integrity issue | Only link when email EXACTLY matches `username`, require email verification from Clerk |
| Guest data lost during merge | User loses progress | Wrap merge in SQLite transaction, rollback on error |
| Clerk free tier limits | May hit user/session limits in production | Monitor usage, plan upgrade path |
