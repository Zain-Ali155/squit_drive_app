# SQUID Drive Proposed Backlog

Status: Implementation backlog for the local-demo phase; project-local IDs are approved for this implementation only.

## Epic SD-E01 — Architecture and Foundation

### Story SD-E01-S01 — Keep the local demo bound to loopback

- **Status:** Complete.
- **User story:** As the local-demo operator, I want the web and API services restricted to loopback origins, so that the unauthenticated demo is not exposed to other machines on the network.
- **Business value:** Establishes the local-only security boundary before adding file operations.
- **Priority:** P0.
- **Estimate:** Not assigned; no team estimation scale was available in the approved planning context.
- **Dependencies:** Approved local-demo scope; repository test workflow or its approved direct-runner alternative.
- **Scope:** Reject production runtime configuration; bind API and local web server to loopback; restrict configured browser origin to localhost/loopback; retain exact-origin CORS behavior.
- **Out of scope:** Authentication, sessions, public deployment, Supabase integration, and file operations.

#### Acceptance criteria

1. **Given** API runtime configuration, **when** it specifies production mode, an unspecified/public API bind host, or a non-loopback browser origin, **then** validation fails before the server listens.
2. **Given** local development/test configuration using localhost, IPv4 loopback, or IPv6 loopback, **when** it is validated, **then** the API can start using only the configured loopback interface and exact local web origin.
3. **Given** a browser request with any other origin, **when** it reaches the API, **then** CORS does not grant that origin access.
4. **Given** the web development server is started by its repository script, **when** it binds, **then** it listens only on IPv4 loopback.
5. **Given** local-only mode, **when** configuration is checked, **then** no production or public deployment path is represented as safe or supported.

#### Task breakdown

| Task ID | Objective and completion condition | Planned paths | Dependencies / verification | Status |
|---|---|---|---|
| SD-E01-S01-T01 | Validate API `NODE_ENV`, `API_HOST`, and `WEB_ORIGIN` for local-only loopback operation; reject production and non-loopback values before listen. | `servers/api/validation/env.validation.ts`, `servers/api/tests/environment.test.ts` | Direct existing `tsx` scripts preserve the declared runner, arguments, package cwd, inherited environment, and `api:test` dependency order. | Complete: logging 2/2, API 12/12, logging/types/API typecheck pass. |
| SD-E01-S01-T02 | Bind Next.js local `dev` and `start` scripts to `127.0.0.1`; verify web tests and typecheck. | `apps/web/package.json`, `apps/web/tests/environment.test.ts` | T01; direct existing `tsx` scripts preserve runner, arguments, cwd, inherited environment, and `web:test` dependency order. | Complete: web suite 9/9 (includes `tests/environment.test.ts`), web typecheck and ESLint pass. |
| SD-E01-S01-T03 | Apply CORS response headers only to the configured local web origin and test allowed/disallowed HTTP origins. | `servers/api/middleware/cors.ts`, `servers/api/tests/http-boundaries.test.ts` | T01; exact API test command plus `logging:test` prerequisite. | Complete: current API suite 30/30 includes allowed/disallowed CORS tests; API lint and typecheck pass. |

#### Definition of Done

- The API rejects non-local binds, non-local web origins, and production configuration.
- The web scripts bind only to loopback.
- Relevant tests and type checks pass using the repository workflow or a documented safe equivalent.
- No environment files, credentials, public access settings, or unrelated files are changed.

## Epic SD-E02 — Google SSO and Access Control

### Story SD-E02-S01 — Google identity and server-managed session

- **Status:** Deferred for the local-demo phase; Google sign-in and sessions are not implemented in this phase.
- **User story:** As a SQUID Drive user, I want to sign in with any valid Google account and receive a secure server-managed session, so that I can access only my own Drive data.
- **Business value:** Establishes the trusted identity and session boundary required by every protected Drive operation.
- **Priority:** P0.
- **Estimate:** Not assigned; no team estimation scale was available in the approved planning context.
- **Dependencies:** Approved standalone Google SSO and session decisions; existing MongoDB connection integration; a usable repository-owned test workflow. Supabase is not a dependency of this story.
- **Scope:** Future Google OIDC authorization-code login and callback; state, nonce, and PKCE transaction validation; stable internal owner identity keyed by issuer and subject; MongoDB-backed server session; secure cookie issuance; expiry, CSRF/Origin protections, logout invalidation, and safe OAuth logging.
- **Out of scope:** Supabase or Drive file operations, account linking by email, Google Drive API access, production deployment, and user-facing account administration.

#### Future acceptance criteria (deferred)

1. **Given** a user starts sign-in from the local web app, **when** the API creates the Google authorization request, **then** it uses the authorization-code flow with cryptographically random, short-lived, single-use state, nonce, and PKCE S256 values, and requests only approved identity scopes.
2. **Given** an OIDC callback, **when** state is missing, mismatched, expired, or replayed, **then** the callback is rejected without issuing a session.
3. **Given** a Google authorization code, **when** the API exchanges it, **then** the ID token signature, issuer, audience, expiry, and nonce are validated before identity is trusted.
4. **Given** a valid Google identity, **when** the callback resolves the owner, **then** identity is keyed by issuer and subject, any valid Google account is eligible, and email alone is never used to link accounts.
5. **Given** successful authentication, **when** the session is issued, **then** the prior session identifier is not reused, only a protected representation of a cryptographically random opaque token is stored, and the cookie is HttpOnly, Secure, host-only, and configured with the approved SameSite and expiry policy.
6. **Given** an expired, revoked, or unknown session, **when** an authenticated API route is called, **then** the request is unauthenticated even if MongoDB TTL cleanup has not yet removed the record.
7. **Given** a state-changing request or logout request, **when** CSRF or Origin validation fails, **then** it is rejected; successful logout invalidates the MongoDB session and clears the cookie.
8. **Given** OAuth callback or session traffic, **when** it is logged, **then** callback query values, authorization codes, state, cookies, session tokens, ID tokens, and provider credentials are not logged.
9. **Given** the local test environment, **when** auth tests run with deterministic provider/session dependencies, **then** protocol failures, session lifecycle, CSRF/Origin checks, and logout behavior are covered without contacting Google. Staging Google OIDC smoke tests remain a release gate.

#### Security and data considerations

- Session ownership and all future Drive authorization derive from the verified internal owner ID, never a client-supplied owner ID.
- Session expiry is enforced in application logic; a TTL index is cleanup support, not the authorization check.
- Cookie attributes and callback origins must be limited to the local demo configuration. No public file access or production deployment is part of this story.
- Logs and errors must not expose secrets, tokens, callback parameters, session identifiers, or provider response bodies.

#### Future task breakdown (deferred)

| Task ID | Objective and completion condition | Planned paths | Dependencies / verification |
|---|---|---|---|
| SD-E02-S01-T01 | Define and validate server-only Google OIDC and session configuration; local mode must use explicit localhost callback/origin settings and never expose provider credentials to web configuration. | `servers/api/config/env.ts`, `servers/api/validation/env.validation.ts`, `servers/api/types/configuration/environment.ts`, API environment tests | Existing config boundary; tests cover missing, malformed, and valid non-secret configuration shapes. |
| SD-E02-S01-T02 | Implement functional OIDC transaction creation and callback validation with state, nonce, PKCE S256, and verified Google claims; dependencies are passed explicitly. | `servers/api/features/auth/auth.route.ts`, `auth.controller.ts`, `auth.service.ts`, `auth.validation.ts`, `auth.integration.ts`, feature tests | T01; unit tests use a provider fake and cover mismatch, expiry, replay, and invalid claims. |
| SD-E02-S01-T03 | Persist stable Google identity mapping and server sessions in MongoDB; enforce session expiry and invalidation, with a TTL index for cleanup only. | `servers/api/features/auth/auth.repository.ts`, `auth.model.ts`, feature tests | T02; repository tests cover unique issuer/subject mapping, token-hash lookup, expiry, and logout invalidation. |
| SD-E02-S01-T04 | Register auth routes and enforce principal, CSRF/Origin, cookie, logout, and safe logging behavior in the API composition. | `servers/api/bootstrap/create-app.ts`, `servers/api/features/auth/auth.route.ts`, relevant API middleware/tests, logging tests if required | T02–T03; HTTP tests cover anonymous/authenticated behavior, CSRF/Origin rejection, logout, cookie attributes, and log redaction. |
| SD-E02-S01-T05 | Run story verification and staging smoke tests; document the local-only setup and callback requirements without credentials. | Existing API test scripts and existing documentation location, selected after repository inspection | T01–T04; repository API test, lint, and typecheck tasks; real staging Google OIDC smoke test is a release gate. |

#### Future Definition of Done (deferred)

- All acceptance criteria pass.
- Auth code remains feature-owned and follows functional factories, explicit immutable dependencies, and existing API/Mongo boundaries.
- API and local configuration contain no browser-exposed credentials and logs redact OAuth/session material.
- Tests use the repository Node.js built-in test runner with `tsx` and are run through the repository-approved task workflow.
- Staging Google OIDC smoke test is recorded as a release gate; it is not represented as complete by mocked tests.
- No public deployment or public file access is enabled.
- Git status is reviewed and the pre-existing `.env.example` modification and project-instruction file remain untouched.

## Epic SD-E03 — Local Drive API and Metadata

### Story SD-E03-S01 — Persist owner-scoped folders and file metadata

- **Status:** Implemented; prior live MongoDB folder CRUD verification passed against the owner-confirmed development/demo database and cleanup was verified. Current automated tests in this audit use fakes and do not repeat live-provider verification.
- **User story:** As the local-demo operator, I want folder and file metadata stored in MongoDB and scoped to the local demo owner, so that the API can safely list, search, rename, move, and delete Drive entries.
- **Business value:** Establishes durable metadata and authorization boundaries before connecting private file bytes.
- **Priority:** P0.
- **Estimate:** Not assigned; no team estimation scale was available.
- **Dependencies:** SD-E01-S01 complete; configured MongoDB reachable for live persistence checks. Tests must remain runnable without external services by injecting repository fakes.
- **Scope:** Feature-owned Drive metadata schemas and repository/service/API contracts; root folder; unique sibling names; folder/file listing, search and pagination; rename/move; reject non-empty folder deletion; permanent metadata deletion contract.
- **Out of scope:** Login, sessions, provider storage, public deployment, background workers, trash/recycle bin.

#### Acceptance criteria

1. **Given** any Drive request, **when** the API selects metadata, **then** it applies the server-owned local demo owner ID and never accepts an owner ID from the client.
2. **Given** a new folder or file metadata record, **when** it is persisted, **then** required identifiers, parent, owner, timestamps, lifecycle state, and type-specific fields are validated.
3. **Given** two entries under one parent, **when** their normalized names collide, **then** creation or rename is rejected without changing either record.
4. **Given** listing or search input, **when** it is processed, **then** results are owner-scoped, paginated with default 25 and maximum 100, and search covers all owned files and folders.
5. **Given** a folder containing children, **when** deletion is requested, **then** it is rejected; an empty folder may be permanently deleted.
6. **Given** a foreign, malformed, or missing entry ID, **when** an operation is requested, **then** no cross-owner data is disclosed or mutated.

#### Task breakdown

| Task ID | Objective and completion condition | Planned paths | Dependencies / verification | Status |
|---|---|---|---|---|
| SD-E03-S01-T01 | Add Drive metadata types, Zod request schemas, Mongo model/index definitions and repository query contract with owner-scoped filters; unit tests cover validation, indexes and query scoping. | `servers/api/features/drive/drive.types.ts`, `features/drive/integrations/drive.model.ts`, `integrations/drive.repository.ts`, `drive.validation.ts`, `drive.test.ts`, `servers/api/package.json` | SD-E01-S01; built-in Node test runner with tsx; no live Mongo required for contract tests. | Complete: current API suite 30/30; repository architecture check, API typecheck, and API ESLint pass. |
| SD-E03-S01-T02 | Implement functional Mongo repository operations for owner-scoped lookup, listing/search, create, rename/move, children checks, and permanent metadata deletion; exercise behavior with an injected model fake. | `servers/api/features/drive/integrations/drive.repository.ts`, `drive.test.ts` | T01; fake model tests prove reads include owner scope and search spans all owned entries. | Complete: current API suite 30/30 includes owner-scoped repository read/write tests; API typecheck and ESLint pass. |
| SD-E03-S01-T03 | Compose owner-scoped folder/list/search API behavior, default root creation, normalized sibling-name uniqueness, folder move/rename, and empty-folder deletion; test services and HTTP contracts with fakes. | `servers/api/features/drive/routes/drive.route.ts`, `drive.controller.ts`, `drive.service.ts`, `create-app.ts`, API test script | T02; HTTP tests verify owner isolation, invalid parents, duplicates, and non-empty-folder delete rejection. | Complete: current API suite 30/30 includes Drive HTTP lifecycle; API typecheck, ESLint, and repository architecture check pass. |
| SD-E03-S01-T04 | Verify Mongo connection/model composition and indexes against configured development/demo MongoDB; record the actual outcome without printing the URI. | Existing Mongo integration boundary and Drive feature tests/docs | T01-T03; safe database approval required; no URI values in output. | Complete for the approved live CRUD scope: prior create/list/rename/delete verification used unique records, persistence was confirmed, and cleanup was verified. This audit did not repeat live writes. |

#### Definition of Done

- All metadata reads and mutations include the server-owned owner scope.
- Mongo indexes enforce sibling-name uniqueness and support owner/parent/name query patterns.
- Unit and HTTP tests cover accepted and rejected contracts, without implying live Mongo verification when Mongo is unavailable.
- The API test script includes Drive tests and relevant typecheck/lint tasks pass through the approved runner path.
- No application credential or environment file is changed.

## Epic SD-E04 — Private File Storage

### Story SD-E04-S01 — Store private file bytes through the API

- **Status:** Implemented; private-bucket verification and a 50,000,000-byte streamed round trip passed in the prior local smoke. The provider's exact configured maximum-size setting and staging verification remain open.
- **User story:** As a local-demo user, I want file bytes streamed through the API to a private Supabase bucket, so that files are never public and metadata stays in MongoDB.
- **Business value:** Completes the file-byte boundary while preserving application authorization and the exact 50,000,000-byte upload cap.
- **Priority:** P0.
- **Estimate:** Not assigned.
- **Dependencies:** SD-E01-S01 complete; approved Supabase URL and bucket; private bucket and usable server secret key must pass read-only runtime verification before upload is enabled.
- **Scope:** Server-only Supabase Storage REST adapter, private-bucket verification, API-streamed upload/download/delete, opaque object keys, exact byte limit, metadata/storage failure handling.
- **Out of scope:** Public URLs, browser-to-provider transfers, signed URLs, other providers, queues/workers, login/session changes.

#### Acceptance criteria

1. **Given** incomplete or invalid Supabase configuration, **when** the API starts, **then** Drive file-byte operations are disabled without logging the credential or URL value.
2. **Given** a configured storage integration, **when** it verifies the configured bucket, **then** only a confirmed non-public bucket is accepted; missing or public buckets disable file operations.
3. **Given** an upload, **when** it is accepted, **then** bytes stream through the API, the measured body stays at or below 50,000,000 bytes, executable content is rejected, and Mongo metadata is created only after storage succeeds.
4. **Given** a download request, **when** the current local owner has a matching file record, **then** the API authorizes from Mongo before opening the private object stream and sends safe download headers.
5. **Given** a delete request, **when** the file record is authorized, **then** permanent provider deletion is attempted before metadata removal; failed provider deletion remains represented as internal pending-delete recovery state.

#### Task breakdown

| Task ID | Objective and completion condition | Planned paths | Dependencies / verification | Status |
|---|---|---|---|---|
| SD-E04-S01-T01 | Validate server-only Supabase URL/bucket/secret configuration and implement a fetch-based private-bucket probe with injected fetch; tests verify headers, privacy checks, URL construction, and redacted failures. | `servers/api/config/env.ts`, API environment types/validation/tests, `servers/api/features/drive/integrations/drive.integration.ts`, Drive tests | Existing Node fetch; no SDK/dependency installation; safe fake responses; never print configuration values. | Complete: current API suite 30/30, API typecheck and lint pass. A live probe confirmed the configured bucket is private; no credential values were displayed. |
| SD-E04-S01-T02 | Implement bounded API stream, content type/extension and signature validation, opaque object keys, and provider upload/download/remove stream methods. | `servers/api/features/drive/integrations/drive.integration.ts`, `drive.validation.ts`, tests | T01; stream tests include 50,000,000-byte cap, overflow, executable signatures, mismatch, cancellation, and provider failures. | Complete: current API suite 30/30 verifies bounded streaming and validation; API typecheck and lint pass. Live smoke used a small object only. |
| SD-E04-S01-T03 | Compose upload/download/delete lifecycle with Mongo metadata and pending-delete recovery marker; test storage/Mongo failure ordering and owner authorization. | Drive model/repository/service/route/tests | T02; deletion remains permanent and non-empty folders remain rejected. | Complete for fake-backed API contracts: current API suite 30/30 covers owner authorization, API streaming, permanent deletion, and pending-delete failure state. Live Mongo is tracked by SD-E03-S01-T04. |
| SD-E04-S01-T04 | Run real Supabase bucket privacy/stream smoke checks when safe configuration is present; record actual results and manual recovery steps without credentials. | Existing project documentation location selected after inspection | T01-T03; staging/provider access is a release verification gate; no live result may be inferred from fake tests. | Complete for requested local smoke scope: private bucket confirmed; a 50,000,000-byte streamed upload/download round trip passed and temporary object cleanup succeeded. Bucket metadata endpoint did not expose numeric `file_size_limit`; dashboard global/per-bucket setting remains unverified. Not a staging run. |

## Epic SD-E05 — Drive Web Experience

### Story SD-E05-S01 — Manage local Drive entries in the browser

- **Status:** Implemented for local-demo UI; the complete journey was manually verified in the local browser with live local services. Automated browser E2E and staging release gates remain outstanding.
- **User story:** As a local-demo user, I want to navigate folders and upload, download, rename, move, search, and permanently delete entries from the browser, so that I can use the Drive MVP end to end.
- **Business value:** Makes the API and storage behavior usable through the repository's existing Next.js application.
- **Priority:** P0.
- **Estimate:** Not assigned.
- **Dependencies:** SD-E03-S01 and SD-E04-S01 APIs; API URL configured for local loopback; MongoDB and private Supabase access available for live use.
- **Scope:** Feature-owned `apps/web/features/drive/` API client and UI; loading/error/empty states; browser file chooser; pagination/search/navigation; full entry operations.
- **Out of scope:** Login, public deployment, provider-direct transfer, public file links, separate UI package extraction.

#### Acceptance criteria

1. **Given** the local demo opens, **when** Drive loads, **then** the UI lists the current folder and clearly indicates that login is deferred and operation is local-only.
2. **Given** folders and files exist, **when** users navigate/search/page, **then** the UI displays the API's owner-scoped results and supports creating, renaming, moving, downloading, and permanently deleting entries.
3. **Given** an upload selection, **when** file size/type/content validation or provider storage fails, **then** the user sees a safe actionable error and no success state is shown.
4. **Given** list, upload, download, rename, move, or delete operations, **when** the API is unavailable or returns a safe error, **then** the UI displays loading, error, and empty states accessibly.
5. **Given** a browser E2E environment, **when** the release journey runs, **then** login is excluded from local demo and upload/list/download/delete are verified; real provider smoke tests remain separate release gates.

#### Task breakdown

| Task ID | Objective and completion condition | Planned paths | Dependencies / verification | Status |
|---|---|---|---|---|
| SD-E05-S01-T01 | Implement typed app-owned Drive API client functions using shared response contracts and fake-fetch tests. | `apps/web/features/drive/drive.api.ts`, `drive.api.test.ts`, web test script | Existing `@workspace/types`; no browser-visible provider configuration or credentials. | Complete: web suite 9/9 includes typed Drive API and environment tests; web typecheck and ESLint pass. |
| SD-E05-S01-T02 | Build responsive Drive UI for navigation, create/rename/move/delete, search, pagination, upload and streaming download link; show all loading/error/empty states and local-only/login-deferred status. | `apps/web/features/drive/drive-workspace.tsx`, `apps/web/app/(app)/drive/page.tsx`, root page link | T01; functional component conventions; generic UI remains in `packages/ui` only if reuse is genuine. | Complete for local-demo UI: manual browser journey verified folder creation, upload/list/download with content hash match, rename cancel/invalid/duplicate/success behavior, file deletion, and empty-folder deletion. Test data cleanup was verified. |
| SD-E05-S01-T03 | Run repository web/UI tests, typechecks and lint; verify in a local browser where available and document the absence of an automated browser suite if no runner exists. | Existing web tests/scripts and existing documentation location | T01-T02; browser E2E release gate remains unverified until a supported runner/environment exists. | Partial: current web tests 10/10, API tests 30/30, logging tests 3/3 passed with the existing Node.js runner and tsx. No Playwright, Puppeteer, WebDriver package, or repository browser-test task is installed. Interactive Codex browser availability does not provide a checked-in repeatable E2E runner. Full automated E2E remains blocked; no dependency was added. |

## Final readiness audit — 2026-10-14

### Verified in this audit

- `node codebase/cli/repo.mjs check` — passed with no issues.
- Web tests using the existing Node.js built-in runner through local `tsx` — 10/10 passed; API tests — 30/30 passed; logging tests — 3/3 passed.
- TypeScript `--noEmit` checks passed for `apps/web`, `servers/api`, `packages/types`, and `packages/logging` using their installed local `tsc` executables.
- ESLint passed for those same four workspaces using installed local ESLint executables.
- Production builds passed for the web (`next build`) and API (`tsc -p tsconfig.build.json`).
- `git diff --check` passed before this audit's documentation update.
- Validation used installed tools directly because the pinned pnpm workflow remains blocked by the previously recorded global store lock/permission issue. No dependencies were installed or upgraded.

### Current capability and release status

- The local-only API and web feature provide file/folder listing, navigation, search, pagination, upload, download, create, rename, move, and permanent delete. Automated tests cover contracts with fakes. Prior live verification recorded successful Mongo folder CRUD and cleanup, a private Supabase bucket, and a 50,000,000-byte streamed storage round trip with cleanup. Those external-provider checks were not repeated in this audit.
- A prior manual local-browser journey verified folder creation, synthetic upload/list/download and content equality, rename cancellation/validation/conflict/success, file deletion, and empty-folder deletion. Cleanup was checked. This was a manual browser journey, not an automated browser E2E suite.
- Authentication and sessions are not implemented in the local-demo phase. The API uses a fixed local-demo owner, so its owner filters are not equivalent to authenticated per-user authorization. Do not expose the demo beyond the trusted loopback environment.
- Supabase access is private and server-side in the implementation; there are no public file URLs. The app enforces a 50,000,000-byte cap and validates declared type/name plus an initial content signature. This is not malware scanning or full semantic validation. The provider dashboard's exact configured maximum-size setting remains unverified.
- Permanent file deletion uses an internal `pending_delete` marker when provider removal fails; it is not a trash/recycle-bin or user recovery feature. Tests cover failure state, but no automated reconciliation/retry tool was verified. Best-effort cleanup after some upload/metadata failures can itself fail and requires operational recovery.

### Remaining release blockers and next tasks

1. `SD-E02-S01-T01`–`T05`: implement and verify standalone Google OIDC, server-managed sessions, CSRF/Origin protections, secure cookies, logout invalidation, and staging OIDC smoke. Until then, the demo is unauthenticated and local-only.
2. `SD-E05-S01-T03` follow-up: add and run an automated browser E2E suite for the required journey (login when auth is implemented, upload, listing, download, rename, deletion). The prior browser journey was manual and does not satisfy this gate.
3. `SD-E04-S01-T04` follow-up: verify the exact bucket/global upload-size setting in the provider dashboard and run the required staging private-storage smoke. The prior live 50,000,000-byte acceptance does not prove the configured numeric ceiling.
4. `SD-E04-S01-T03` operational follow-up: define and verify recovery for stuck pending-delete/orphaned objects, including retry ownership, safe cleanup evidence, and the approved manual operational handover before launch.
5. Confirm a supported package-manager task path that works with the repository-pinned pnpm version and store permissions; direct local tool invocations passed here but are not a substitute for restoring the standard workflow in the intended environment.

No staging authentication test, automated browser E2E, or live-provider probe was run as part of this audit. Do not interpret the local-demo checks as production readiness.

## Automated browser E2E tooling check — 2026-10-14

- Re-read repository testing, development, architecture, UI, and integration guidance. The approved test engine is the project-declared runner; web scripts use Node.js built-in tests through `tsx`.
- Checked installed module resolution and workspace executable bins for Playwright, `@playwright/test`, Puppeteer, and Selenium WebDriver: none are available. No browser-E2E script is declared in the repository manifests.
- The Codex in-app browser is available for interactive use but is not a repeatable test runner integrated with the project scripts. No custom browser protocol/driver was introduced.
- Re-ran the existing test suites: web 10/10, API 30/30, logging 3/3 passed. These are not browser E2E evidence. The automated browser release journey remains blocked until an approved, supported browser runner is available; no package installation was attempted due the no-install constraint and pnpm store-lock issue.
- No test fixtures were created and no database or storage writes/deletes were performed during this tooling check.

## Verification record — 2026-10-13

- Repository architecture check: `node codebase/cli/repo.mjs check` — passed with no issues after aligning Drive feature boundaries with repository policy.
- Web: existing Node.js built-in test runner via `tsx` — 9/9; `tsc --noEmit` — passed; ESLint — passed. The web suite includes `tests/environment.test.ts`.
- API: existing Node.js built-in test runner via `tsx` — 30/30; `tsc --noEmit` — passed; ESLint — passed.
- Shared types: typecheck and ESLint passed. Logging: existing test runner 3/3, typecheck, and ESLint passed.
- Local preview: Next.js `/drive` returned HTTP 200 after correcting the app-local API client import discovered at runtime; API `/health` returned 200. Drive API returned 503 because preview mode intentionally started without MongoDB persistence.
- The root `pnpm` invocation reports the installed executable as 12.6.0 and cannot acquire its global store-operation lock; the repository pins pnpm 11.19.0. No upgrade or install was attempted. The direct package runner and repository CLI checks were used instead.
- Live MongoDB persistence remains unverified because the local MongoDB service/binary is unavailable and the secret-safe connection probe failed with `MongooseServerSelectionError`.
- Supabase private-bucket verification and a tiny streamed upload/download/delete smoke passed; this does not verify a 50,000,000-byte live transfer, provider plan/size setting, or staging E2E.
- Browser E2E remains unavailable; no E2E dependency was installed. The release user-journey gate is therefore not met.

## Verification update — 2026-10-14

- Frontend review confirmed the existing Drive page already implemented folder navigation/breadcrumbs, file/folder list, search, bounded pagination, upload, download, rename/move, folder creation, deletion confirmation, and loading/error/empty states. Upload progress was missing; the API client now reports XHR upload progress, and the page displays an accessible percentage/progress bar. Added retry after load errors and suppressed the misleading empty state when the API returns an error.
- Web tests: existing Node.js built-in test runner via `tsx` — 10/10, including upload progress reporting. Web `tsc --noEmit` and ESLint passed. `next build` passed and generated `/drive`.
- Local production page was opened in the browser and returned HTTP 200; visible state correctly showed the persistence-unavailable message and Retry action. API `/health` returned 200; Drive list returned 503 with Mongo disabled. This was a page/state check, not a browser E2E journey.
- Supabase Storage API bucket details returned HTTP 200 and `public: false`, but did not expose a numeric bucket `file_size_limit`. An exact 50,000,000-byte synthetic stream uploaded and downloaded with byte counts matching; the temporary object was removed in cleanup. This proves the configured project accepted at least the app cap, not the exact configured maximum. Supabase documents Free-plan global maximum as 50 MB and recommends a more reliable resumable method above 6 MB; owner dashboard verification of the project plan and global/per-bucket settings remains needed: [file size limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).
- Mongo diagnosis: local Windows MongoDB service and `mongod` executable are absent. A secret-safe, read-only retry against the configured Mongo endpoint failed with `MongooseServerSelectionError` / `MongoNetworkError`; URI, hostname, username, and error message were not output. No real metadata write was attempted because no safe local database was available.

## MongoDB connectivity follow-up — 2026-10-14

- The configured target was classified without outputting its URI or host: Atlas (`mongodb+srv`), with credentials and a database path configured. No local MongoDB Windows service or `mongod` executable is present. The target was not changed.
- Read-only diagnostics: Atlas SRV DNS returned 3 records; DNS resolution and TCP connects succeeded for tested nodes. TLS handshakes to all tested nodes failed with `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`; Mongoose server selection timed out with all three nodes `Unknown` / `MongoNetworkError`. No error messages, addresses, hostnames, URIs, or credential values were recorded. This points to a TLS/network path failure after TCP connection; the evidence does not distinguish Atlas-side policy from local TLS inspection or another network intermediary.
- API test script through `pnpm --filter @workspace/api test` could not start because the pnpm global store lock returned access denied. Running the existing API script directly through the installed local `tsx` executable with the Node.js built-in test runner passed 30/30 tests. These tests use injected clients/in-memory data and do not verify live MongoDB persistence.
- Real folder creation, metadata persistence, listing, rename, deletion, and the browser CRUD/upload/download journey remain blocked. No live database writes were attempted, and no browser E2E journey was claimed.
- Next diagnostic action: have the network/Atlas owner verify the Atlas cluster is active and the current network path/egress is permitted, and check for TLS-intercepting proxy/firewall behavior. Keep the existing Atlas target and environment configuration unchanged until that diagnosis is complete. Once TLS succeeds, run a narrowly scoped real-persistence smoke using a dedicated local-demo test owner/database and clean up the created records; then execute the browser journey against that same safe database.

## MongoDB TLS recovery check — 2026-10-14

- Runtime versions: Node.js 24.21.0, Mongoose 9.10.1, MongoDB Node.js driver 7.6.0. Source composes `mongoose.connect(uri)` without custom TLS overrides; the configured scheme is `mongodb+srv`, so driver TLS defaults apply. No URI, host, database name, credentials, or proxy values were emitted.
- Fresh strict TLS checks (`rejectUnauthorized: true`, hostname SNI and hostname verification enabled) succeeded against all 3 Atlas SRV nodes under default negotiation, TLS 1.2, and TLS 1.3. Peer certificates were authorized by Node; no certificate validation was disabled. Mongoose then connected and disconnected successfully using the unchanged configured target, confirming server selection and authentication currently work.
- The previous `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` is not reproducible in this check. `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` variables are present but their values were not read or printed; WinHTTP reports direct access. Standard Node socket/TLS and the MongoDB driver do not automatically route this Mongoose connection through those web-proxy variables absent explicit driver proxy configuration. Windows service enumeration was denied, so local antivirus/security services were not verified. Wi-Fi/ISP and intermittent TLS inspection cannot be excluded from one successful retry.
- The API's existing built-in test suite passed 30/30 using the local `tsx` runner outside the sandbox (test workers require process spawning); tests use fixtures and do not write to Atlas.
- Live CRUD and the browser journey remain pending: the runtime reports development mode, but the configured Atlas database name has no recognizable development/test marker. To avoid writing to an unverified or production database, first confirm with the owner that this exact configured database is a disposable/non-production Drive demo target and safe for temporary test records with cleanup. Once confirmed, run real folder create/list/rename/delete, then the browser upload/list/download/rename/delete journey and verify cleanup.

## Live persistence and browser verification — 2026-10-14

- Owner confirmed `squid_drive` is their non-production SQUID Drive development/demo database and approved temporary test writes. Baseline read-only count for `local-demo-owner` was 0 entries and no root folder.
- API live Mongo CRUD passed using a unique test folder: create returned HTTP 201; the stored Mongo record had the expected owner, root parent, name, kind, and active state; listing returned the test entry; rename returned HTTP 200 and persisted both name and normalized name; delete returned HTTP 204; exact metadata lookup confirmed the test folder absent.
- Browser setup uncovered a local-origin mismatch: the browser at `127.0.0.1:3000` was outside the API's configured `http://localhost:3000` CORS origin. Opening the same app at `http://localhost:3000/drive` resolved it without configuration edits.
- Browser journey completed through folder creation, navigation/listing, upload, and download. The UI showed a unique folder and a synthetic 75-byte PDF. Mongo metadata matched its parent, `application/pdf`, 75-byte size, and a present opaque storage key. Browser download was byte-for-byte identical to the generated fixture (SHA-256 match).
- Browser rename and browser-initiated delete were not completed. The local in-app browser reports `prompt() is not supported` for the existing rename action, and the computer-use tool later stopped because it could not establish the current Windows browser URL. Therefore the browser E2E/release gate remains partial and is not claimed as passed. API-level rename and delete were independently verified.
- Cleanup: API file deletion returned 204, exact file metadata was absent, and an authenticated Supabase object GET returned provider error code `not_found` (HTTP 400); API folder deletion returned 204 and both exact test metadata records were absent. The root folder, absent before the test and created by the first list request, was removed by an exact owner/id/name filter after confirming it was the only remaining entry. Final owner entry count was 0. The synthetic source and downloaded copy were removed after matching their expected SHA-256.
- The existing API test suite passed 30/30 with Node.js built-in tests and installed `tsx`. No application files or environment configuration were changed. Browser deletion remains unverified through the UI; the full browser E2E release gate is still open.

## SQUID Drive — Browser rename/delete follow-up — 2026-10-14

- Replaced native `window.prompt()` rename and `window.confirm()` deletion with the existing accessible Dialog and AlertDialog primitives. Rename trims input and rejects blank, over-255-character, slash, backslash, and control-character names. Cancel closes without changing the entry; a successful save closes only after the refreshed listing succeeds. API errors leave the prior listing intact and remain visible.
- Verified in the real local browser at the inventory-confirmed `http://localhost:3000/drive`: created a unique folder, uploaded and listed a 119-byte synthetic PDF, downloaded it, and matched its SHA-256 to the fixture. Cancelled rename preserved the original folder name; invalid slash input was rejected; duplicate-name rename returned the expected API conflict while the listing remained present; a valid file rename appeared in the listing. The accessible permanent-delete dialog opened and cancellation preserved the file.
- After the user confirmed the exact permanent cleanup targets, the browser deleted the test file, empty conflict-test folder, and empty parent verification folder through their accessible confirmation dialogs. The UI then showed the root listing empty; a read-only API owner search returned 0 matches for the unique run token, the file download route returned 404, and the root listing contained 0 children. The API file-delete response was 204, which is returned only after the storage adapter removal succeeds. A service-managed `My Drive` root record created by listing remains; no other records were targeted.
- The full requested **manual local browser journey** passed: create folder, upload synthetic file, list, download and byte/SHA-256 verify (119 bytes; matching SHA-256 `0E284D47BE238DDF29916C093C0F0079B69EB90452CF5903C7F0B1BFB514EE8C`), cancel rename, reject invalid name, retain listing on duplicate-name API `409`, successfully rename the file, cancel delete, delete file, delete empty conflict folder, and delete empty parent folder. This is a verified manual browser journey, not an automated browser E2E suite or staging release-gate run.
- The source fixture and downloaded copy were removed after rechecking that both matched the expected SHA-256. Web test suite: 10/10 passed with the existing Node.js test runner and `tsx`; web typecheck, ESLint, production build, and repository architecture check passed. `pnpm` commands remain blocked by access denied on the global store-operation lock; no packages were installed or upgraded.
- Web test suite: 10/10 passed using the existing Node.js test runner with `tsx`; web TypeScript typecheck, full web ESLint, Next.js production build, and `node codebase/cli/repo.mjs check` passed. The `pnpm` wrapper remains blocked by access denied on its store-operation lock, so no package installation or upgrade was attempted.

## Phase 9 — Staging readiness and manual browser checklist — 2026-10-26

### Readiness and prerequisites

- Staging readiness: **BLOCKED / NOT READY**. The current API validation permits only loopback API hosts and web origins and rejects `NODE_ENV=production`. Do not bypass these safeguards. A deployment-ready staging configuration requires an explicitly approved, separately scoped change that preserves the production rejection policy.
- No staging environment, Google test account, browser test account, or authorization to contact a deployed environment was established for this verification. No external provider or deployed service was contacted.
- The tagged `servers/api/.env` was not read. The file exists locally and is ignored by Git; its contents and configuration-key presence are **unknown**. The API keys were absent from the current process environment. The tracked API example shows the required local API keys and commented Google, MongoDB, and Supabase examples. The web API-base-URL example is present; its process-environment value is missing. These observations do not establish local `.env` or staging configuration.
- Required Google-mode settings per the validated API configuration are `AUTH_MODE`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `MONGODB_URI`, in addition to the normal API settings. Drive storage verification also requires the complete `SUPABASE_URL`, `SUPABASE_BUCKET`, and `SUPABASE_SECRET_KEY` set. The web app requires `NEXT_PUBLIC_API_BASE_URL`. Presence of these values in the uninspected local `.env` is unknown; no staging values were available in the process environment.
- **Credential hygiene blocker:** a credential-like OAuth secret appeared in output while inspecting the tracked, modified API example configuration. Its value is intentionally not recorded here. Treat it as exposed: rotate/revoke it in the provider console, remove the credential from tracked configuration, and review Git history for exposure before using any related OAuth client. This checklist does not modify or disclose that value.
- Existing installed browser automation remains unavailable: Playwright, Puppeteer, Selenium WebDriver, and a declared browser E2E task are absent. No browser framework was added.
- Use only a dedicated, owner-approved non-production project, test accounts, isolated test data, and cleanup plan when staging becomes available. Do not use production identities or data.

### Verification checklist

Status labels distinguish automated local evidence from actual staging evidence. `PASS (local automated only)` is not a staging pass. All staging/browser checks remain **NOT RUN**.

| Check | Prerequisites | Steps | Expected result | Status |
|---|---|---|---|---|
| Google Console redirect URI matches the configured callback URI | Approved Google test client; securely configured staging callback; console access | Compare the exact registered redirect URI with the configured callback URI, including scheme, host, port, and path | Exact match; no wildcard or alternate untrusted callback | **NOT RUN** — no staging config or console authorization available |
| Google login redirect and callback complete | Dedicated test account; approved staging API and web origin; exact callback registration | Start sign-in in a browser, authenticate with the test account, and complete the callback | Browser returns only to the configured web origin; verified identity creates a session without exposing credentials | **PASS (local mocked HTTP test only)**; **NOT RUN** against Google or staging |
| OAuth state, nonce, and browser-binding reject invalid or replayed transactions | Local tests or approved staging browser; single-use test transactions | Attempt missing, mismatched, expired, and replayed state and invalid nonce/binding cases | Callback is rejected before session creation; each transaction is single-use | **PASS (local mocked tests)**; **NOT RUN** against Google/staging |
| Session cookie attributes match HTTPS deployment policy | Approved HTTPS staging host and browser | Inspect cookie attributes in browser developer tools after successful sign-in; do not copy cookie values | `HttpOnly`, appropriate `SameSite`, narrow `Path`, `Secure`, and expiry consistent with persisted session; host-only scope | **PASS (cookie-option tests only)**; **NOT RUN** on deployed HTTPS |
| `/auth/me` reports authenticated and unauthenticated states | Dedicated test account and session; staging browser | Check `/auth/me` after sign-in, then after logout, expiry, and revocation | Only minimal authenticated status is returned; invalidated sessions receive standard 401 | **PASS (local HTTP/fake repository tests)**; **NOT RUN** on staging |
| Logout revokes the current session and clears cookies | Active staging test session | Sign out, inspect cookie clearing attributes, then repeat the prior session request | Current session is revoked, cookies are cleared with matching scope, repeated logout is safe | **PASS (local HTTP/fake repository tests)**; **NOT RUN** on staging |
| Missing or untrusted Origin is rejected for state changes | Approved staging origin and browser/test client | Submit protected state-changing requests with missing and untrusted Origin, then a trusted Origin | Missing/untrusted origins are rejected; trusted origin is accepted under the configured policy | **PASS (local HTTP tests)**; **NOT RUN** on staging |
| Credentialed CORS is limited to configured trusted origins | Approved staging web/API origins and browser | Request with configured and untrusted origins; inspect CORS response headers and browser behavior | Credentials are allowed only for trusted exact origins; untrusted origins receive no credentialed CORS grant | **PASS (local HTTP tests)**; **NOT RUN** in staging browser |
| Cross-user Drive access is denied | Two dedicated staging test users with separate files/metadata | Sign in as user A; attempt user B file/metadata access using known test identifiers and spoofed owner inputs | Every operation remains scoped to the verified session principal; no cross-user data is returned or changed | **PASS (local fake-repository/API tests)**; **NOT RUN** with staging users/data |
| Upload, list, download, preview, and delete work with staging persistence/storage | Approved isolated MongoDB and private storage project; synthetic disposable files; cleanup plan | Execute the full journey as each test user and verify byte integrity, owner scope, and cleanup | Authorized operations succeed, unauthorized cross-user operations fail, and test artifacts are removed | **PASS (local automated tests only)**; **NOT RUN** against staging persistence/storage |
| Responses and logs do not expose secrets or session/provider material | Local test suite; later, approved staging log access | Run secret-redaction/error tests; during staging smoke, inspect sanitized responses and logs without copying sensitive values | No raw session tokens, hashes, cookies, authorization codes, secrets, or sensitive provider details appear | **PASS (local mocked error/log tests only)**; **NOT RUN** in staging logs |

### Next actions

1. Rotate/revoke the potentially exposed OAuth credential and sanitize the tracked configuration/history through an explicitly approved follow-up; do not reuse it for staging.
2. Obtain owner approval for a dedicated non-production Google client, test accounts, MongoDB database, private storage bucket, test-data cleanup, and staging access.
3. Resolve the loopback-only / production-rejection deployment constraint through a separately reviewed safe staging design without enabling production or weakening the current guardrails.
4. Once staging is explicitly available and authorized, execute each NOT RUN item manually over HTTPS, record only safe outcomes, and keep automated local results separate from browser/staging evidence.
5. Approve a supported browser E2E workflow before introducing any browser automation dependency; none was installed for this phase.

## Epic SD-E06 — Private Email File Sharing

### Story SD-E06-S01 — Invite a verified recipient to download a private file

- **User story:** As a file owner, I can invite an email address to download one of my files, so the intended recipient can access it without making the file public.
- **Business value:** Enables a basic email-based file handoff while keeping object storage private and access revocable by the owner.
- **Acceptance criteria:**
  1. **Given** an authenticated owner and active file, **when** they invite a valid email, **then** a private recipient-scoped grant is saved and a plain-text email is sent with a download link.
  2. **Given** a recipient signed into SQUID with the same Google-verified email, **when** they use the link, **then** the file streams through the API from private storage; any other identity receives a non-disclosing not-found response.
  3. **Given** an owner revokes a grant or permanently deletes its file, **when** the recipient reuses the link, **then** download is denied.
  4. **Given** email configuration is absent or delivery fails, **when** sharing is attempted, **then** the API fails safely and does not expose the file or provider details.
- **Dependencies:** Google-authenticated session with verified email (`SD-E02-S01`); private Supabase Storage availability (`SD-E04`); existing owner-scoped Drive API and metadata (`SD-E03`, `SD-E04`); verified Resend sender and API credential before live email checks.
- **Security / constraints:** No public bucket or storage URL; grant is bound to the exact normalized recipient email and file; share management is owner-scoped; share creation is rate-limited; email contains no file bytes or storage credential; downloads require a verified session and use safe attachment headers. Local-demo mode has no verified email and cannot use sharing.
- **Estimate:** 5 points.
- **Definition of Done:** Shared contracts, validation, persistence, owner/recipient authorization, UI, and deterministic tests are in place; local tests/typechecks/lint pass; live delivery and browser recipient-flow evidence are recorded separately and are not implied by local tests.

| ID | Task | Main ownership | Verification / status |
|---|---|---|---|
| SD-E06-S01-T01 | Persist verified Google email on the stable internal user and expose it only through the authenticated principal. | `servers/api/features/auth/`, auth tests | Google email scope, verified-claim requirement, lowercasing, and account backfill covered by API tests. **Complete; staging Google verification not run.** |
| SD-E06-S01-T02 | Add private share metadata, recipient-scoped lookup, owner-scoped listing/revoke, and API streaming download contracts. | `packages/types/src/api/drive/`, `servers/api/features/drive/` | Service, repository-contract, schema, and HTTP tests cover invite access, email mismatch, revocation, and file streaming. **Complete in local tests.** |
| SD-E06-S01-T03 | Send a plain-text invitation using the server-side Resend HTTP API and validated paired configuration. | `servers/api/features/drive/`, API configuration | Fake-fetch tests cover request and sanitized failure; environment tests require both settings. No dependency added. **Complete in code; real sender/API configuration and email delivery unverified.** |
| SD-E06-S01-T04 | Add file action, recipient entry dialog, current access list, and owner revoke action to Drive UI/API client. | `apps/web/features/drive/` | Web client tests cover encoded routes, credentials, and share operations; component render and web typecheck/lint pass. **Complete in local tests; browser interaction not run.** |
| SD-E06-S01-T05 | Verify real invitation delivery and recipient download/revocation using isolated test accounts and private storage. | Existing API/web test and documentation locations | Requires verified Resend sender, secret configured locally/staging, two Google test accounts, and approved test file. **Blocked / not run; do not treat the feature as live-email verified.** |
