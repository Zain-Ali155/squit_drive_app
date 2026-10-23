# Project State

## Current phase

M03.2 - First Workspace Bootstrap

STATUS: COMPLETE

CONTROL PLANE TOOLING RECONCILIATION: 2026-09-17

UI REGISTRY AND TYPESCRIPT RECONCILIATION: 2026-09-17

SERVER FEATURE AND SHARED CONFIG RECONCILIATION: 2026-09-17

HEALTH FEATURE RESPONSIBILITY RECONCILIATION: 2026-09-18

NEXT.JS AND PACKAGES ARCHITECTURE RECONCILIATION: 2026-09-18

SECURITY SCANNER RECONCILIATION: 2026-09-18

GIT GOVERNANCE RECONCILIATION: 2026-09-18

## Implemented

- The repository remains the workspace. The repository-owned control plane, project manifests, dependency graph, task runner, affected analysis, cache, checks, scans, and execution profiles remain the monorepo foundation.
- `codebase/` owns repository discovery, dependency graphing, execution planning, task ordering, caching, repository-specific policy, result normalization, and the CLI. It delegates specialized analysis to standard engines rather than recreating them.
- The homemade regex secret scanner remains absent. Thin functional adapters orchestrate `pnpm audit` for dependency vulnerabilities and TruffleHog 3.97.5 for secret detection, normalize their results, omit credential values, and fail closed on missing tools, invalid versions, malformed reports, registry failures, findings, or non-zero tool failures.
- Type checking remains delegated to `tsc`, linting to ESLint, testing to project-declared runners, compilation to project build tools, and package resolution to pnpm. The custom dependency graph, planner, runner, cache, architecture validators, and generators remain repository-owned.
- The control plane manages the architecture-pinned TruffleHog release under `.repo-cache`, verifies the official release SHA-256 checksum and executable version, then scans the current repository filesystem for verified, unknown, and unverified findings. Local development and CI use this same bootstrap and scanner adapter.
- pnpm 11.19.0 is the actual workspace package manager. `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `workspace:*` internal dependencies, package scripts, project tasks, CI, generator defaults, and operating guidance are aligned; the npm workspace field and `package-lock.json` were removed.
- pnpm dependency build scripts are deny-by-default except for the explicit `esbuild` and `unrs-resolver` allowlist required by installed tooling.
- `packages/ui` is an operational strict TypeScript workspace package with controlled compiled exports, package-local shadcn configuration, a generated shadcn Button primitive, generic PageHeader, PageShell, and MessageState compositions, and a component test.
- `packages/ui` now owns 53 official shadcn `new-york` registry primitives under `src/primitives`, with a controlled category index, generated hooks category, source/runtime private import mappings, and the exact dependencies declared by its project manifest.
- UI creation is registry-first and CLI-first. Root `ui:add` and `ui:add:all` commands delegate to the package-pinned shadcn 4.20.0 CLI, architecture policy fixes the source aliases and style-compatible catalog, and repository checks reject workflow, alias, version, or catalog drift.
- Repository-owned TypeScript configuration forbids `baseUrl` and `ignoreDeprecations`. The UI package retains explicit source path mappings without `baseUrl`, and repository checks reject either forbidden compiler option.
- `apps/web` consumes generic UI only through the `@workspace/ui` root API. Application-specific workspace components remain local, while the former app-local primitive, layout, feedback, and utility implementations were removed.
- Tailwind CSS scans the UI package source and applies the shared shadcn CSS-variable tokens. The rendered home route composes the package Button through application-owned workspace UI.
- API constants are categorized under `constants/errors`, `constants/http`, and `constants/runtime`, with controlled category and root exports. Existing categorized web, API, and shared types remain in their owning boundaries.
- MongoDB remains server-owned under `servers/api/integrations/mongodb`; no database package or speculative integration was introduced.
- Architecture validation enforces pnpm workspace policy, `workspace:` dependencies, the native-build allowlist, UI ownership, named shadcn primitive ownership, feature ownership, package export surfaces, deep-import boundaries, categorized module exports, and constants/types dumping-ground rules.
- New and refactored code remains functional and compositional, with no classes, dependency-injection containers, mutable global state, or explicit `any`.
- Server HTTP features now have an explicit `servers/<runtime>/features/<feature>/` boundary. Health owns a dependency-injected router factory under `servers/api/features/health`, and API bootstrap composes it through an explicit feature list while preserving `/health`.
- `packages/tsconfig` and `packages/eslint-config` are configuration-only workspace projects. Five TypeScript consumers inherit approved shared presets, and configuration projects participate in discovery and dependency planning without invented tasks.
- The web root route is owned by `(public)`, while `(app)` establishes a minimal application layout boundary without authentication, guards, providers, or speculative feature code.
- Package-local maintenance, prebuilt solution, enabler, and categorization contracts are now explicit and executable where static validation is meaningful.
- Health is the reference categorized server feature: `routes/` composes HTTP delivery, `controllers/` translates the response, and `services/` owns the application operation. Every layer is functional, dependency-explicit, and exposed through controlled indexes; no unused domain, validation, persistence, model, or integration layer exists.
- Health behavior tests now live with the feature and independently verify service, controller, and HTTP route contracts. The API-level suite retains the general not-found/error boundary test.
- Server consumers outside a feature are rejected when they bypass the feature root public API, and route validation requires the justified `features/<feature>/routes/` boundary plus explicit bootstrap registration.
- Shared logging renders readable level-first, locally timestamped terminal output with indented context in non-production API environments; production output remains structured JSON for ingestion.
- The public home route now composes an application-owned `workspace-foundation` feature through its root public API. Its feature UI moved out of the generic application component boundary, and the route remains a thin Server Component that owns environment-derived configuration.
- `packages/ui` now owns its Tailwind theme and semantic design tokens through an exported stylesheet consumed by the web application. `PageHeader` is a generic component, while `PageShell` and the shell-dependent `MessageState` are compositions; all consumers continue through the package root API.
- Shared API contracts are categorized under `packages/types/src/api/environment`, `errors`, and `health`, with category indexes and unchanged root-package imports for consumers.
- Git governance uses repository-local Husky hooks, Commitlint Conventional Commits, lint-staged workspace ESLint routing, the existing managed TruffleHog scan, and the existing control-plane check contract. GitHub repository policy now includes CODEOWNERS, a pull request template, least-privilege immutable-action CI, documented branch and review standards, and a versioned `main` ruleset payload for administrator application.

## Validated

- A frozen pnpm install succeeds across all eight workspace projects and executes only the two allowlisted dependency build scripts.
- Repository syntax, architecture, project discovery, and package-manager checks pass with no issues.
- All five TypeScript workspaces pass independent `tsc --noEmit`: web, API, UI, logging, and shared types.
- All five TypeScript workspaces pass independent ESLint tasks.
- Production builds pass for web, API, UI, logging, and shared types. Next.js compiled and type-checked the app and generated `/` and `/_not-found`.
- 48 control-plane tests pass. Fourteen workspace tests pass: four web, eight API, one UI, and one logging test.
- `pnpm audit` reports zero dependency findings at every severity. The managed TruffleHog repository scan is clean, and aggregate local validation no longer depends on a globally installed secret scanner.
- Controlled standard-tool failures propagate correctly. ESLint rejected explicit `any`; `tsc` rejected an invalid assignment; the runner marked the owning task failed and skipped its dependent task; TruffleHog detected a generated temporary private key without exposing its value; checksum, version, scanner-error, malformed-report, missing-tool, and dependency-advisory fixtures all failed repository policy. All temporary files were removed.
- The package-local `ui:add` workflow and controlled UI package exports remain operational across tests and production builds.
- The pinned shadcn 4.20.0 CLI successfully queried the official registry and generated all 53 components that expose `new-york` style artifacts. The reproducible catalog command excludes eight searchable entries whose registry style artifacts return not found: `attachment`, `bubble`, `combobox`, `direction`, `marker`, `message`, `message-scroller`, and `native-select`.
- Registry aliases resolve generation into `packages/ui/src` without `baseUrl`; the private `#ui` import map resolves source during TypeScript compilation and compiled files at runtime. Strict UI type checking, scoped registry-source linting, the component test, and the UI build pass.
- 56 control-plane tests pass, including shared TypeScript inheritance, config-project placement, server feature placement and registration, feature public API enforcement, package-local maintenance scope, forbidden compiler options, and the pinned registry workflow. Sixteen workspace tests pass.
- Controlled failures detect invalid server feature location and registration, invalid shared TypeScript inheritance, invalid config-project placement, forbidden package-local maintenance behavior, duplicate shadcn primitives, feature UI inside `packages/ui`, and generic UI inside `apps/web`. Test fixtures are temporary and the real tree passes cleanly afterward.
- Production runtime smoke checks returned HTTP 200 from the web application, rendered the expected UI-package-backed content, and returned the healthy API payload from `/health` with startup and request logging.
- `git diff --check` passes.
- M03.4 workspace discovery and the dependency graph remain valid and acyclic. Architecture checks, lint, strict type checking, production builds, 56 control-plane tests, and 17 workspace tests pass; the pinned shadcn CLI resolves the package-owned theme and all 53 installed registry components.
- The security scanner reconciliation passes a clean managed TruffleHog scan, normalized JSON output, aggregate validation, checksum, cached-binary integrity, and version enforcement, a generated-credential integration test, 71 control-plane tests, all 17 workspace tests, lint, strict type checking, and every production build.
- Git governance contract tests cover valid, invalid, malformed, missing-subject, and breaking Conventional Commits; staged-only processing and command failure; hook thinness; workspace ESLint routing; immutable CI actions; pull request structure; CODEOWNERS; and the versioned ruleset policy. Repository-wide validation remains the authoritative CI path.

## Deferred

- A required live MongoDB connection, feature repositories, models, and live-provider integration coverage remain deferred until a persistence-backed feature exists.
- Remote artifact storage, distributed execution, deployment-specific standalone web packaging, and production observability infrastructure remain deferred until operational requirements justify them.
- Applying `.github/rulesets/main.json` to GitHub remains an authenticated repository-administrator action; the current environment has no authenticated GitHub CLI session.

## Not applicable

- Authentication, users, sessions, and authorization are outside M03.2 and were not introduced.
- `packages/validation` is not justified because current environment schemas are runtime-specific and not shared.
- Additional feature, form, navigation, persistence, or infrastructure folder hierarchies are not justified by current source responsibilities.

## Next milestone

M03.3 - Auth Vertical Slice Design. Authentication is not implemented in the current workspace.

## SQUID Drive — Local-demo Phase D progress (2026-10-13)

- Implemented the approved local-only Drive slice in the existing web and API workspaces. Google login remains out of this phase; the API derives a fixed server-owned local-demo owner.
- The API Drive feature now exposes a root public surface, registers its route through the repository-required `routes/` category, and keeps Mongoose implementation inside the feature's `integrations/` boundary. Mongo metadata operations remain feature-scoped and owner-filtered.
- The web feature provides a typed API client and local Drive UI. The API supports folder creation/list/search/rename/move/deletion, file upload/download/deletion, private Supabase API streaming, the 50,000,000-byte application cap, and internal pending-delete recovery state. Non-empty folder deletion is rejected; no trash/recycle bin exists.
- Validation on 2026-10-13: repository architecture check passed; web tests 9/9, API tests 30/30, logging tests 3/3; web/API/shared-types/logging typechecks and ESLint passed. Test execution used existing `tsx` and Node.js built-in tests; no dependency installation or package-manager upgrade occurred.
- A live Supabase check confirmed private bucket access and a tiny streamed upload/download/delete smoke, including cleanup. This does not verify a 50,000,000-byte provider transfer, the provider's configured maximum-size setting, or a staging E2E run.
- Local preview was started on loopback. The `/drive` route initially revealed an unresolved app-local API client import; after correcting it, the page returned HTTP 200 and the web tests/typecheck/lint/repository check passed again. API `/health` returned 200; Drive API returned 503 because this preview intentionally had no MongoDB connection.
- Live MongoDB persistence remains blocked: no reachable local MongoDB service/binary was present, and a secret-safe connection attempt failed with `MongooseServerSelectionError`. Browser E2E remains unavailable because the repository has no installed browser runner. These are open verification/release blockers; no production deployment is supported.
- The repository-pinned pnpm version is 11.19.0, while the available executable reports 12.6.0 and cannot acquire its global store-operation lock. The implementation used the direct existing package runners plus `node codebase/cli/repo.mjs check`; no pnpm upgrade/install was attempted.
- The current worktree continues to contain unrelated/pre-existing changes, including the pre-existing `.env.example` edit and untracked project-instruction file. They were not altered. No credentials or secret values are recorded here.

## SQUID Drive — follow-up verification (2026-10-14)

- Frontend inspection confirmed navigation/breadcrumbs, listing, global owner search, pagination, upload/download, rename/move, create-folder, and delete confirmation were present. Added browser upload progress reporting and an accessible progress bar, an error Retry action, and prevented an error response from also rendering the empty-folder state.
- Web tests pass 10/10; web typecheck, ESLint, and production build pass. The production `/drive` page was opened in a browser and returned HTTP 200; the visible unavailable-state and Retry control were verified. No user-flow E2E claim is made.
- Supabase private bucket remains confirmed. A real 50,000,000-byte synthetic upload/download round-trip passed with exact byte counts and cleanup. Bucket details endpoint did not provide numeric file-size limit; effective acceptance at the app cap is verified, while the exact configured ceiling/global plan setting remains a dashboard check.
- MongoDB local service/binary is absent. Secret-safe read-only connectivity retry failed (`MongooseServerSelectionError` / `MongoNetworkError`); no metadata writes were attempted without a safe local database.
- Browser E2E, live Mongo persistence, and exact Supabase dashboard size settings remain outstanding. No packages were installed, env files changed, or commits/pushes/deployments performed during this follow-up.

## SQUID Drive — MongoDB connectivity diagnosis (2026-10-14)

- Safely classified the existing configured database target as MongoDB Atlas using only URI scheme/host category metadata; no URI, hostname, database name, username, or secret was displayed. The target remains unchanged.
- No local MongoDB service or `mongod` binary exists in this Windows environment. Atlas SRV DNS returned 3 records, and tested DNS/TCP connections succeeded. TLS handshakes failed for every tested node with `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`; Mongoose server selection failed with three `Unknown` nodes and `MongoNetworkError`. This identifies a TLS/network-path blocker after TCP connectivity but does not isolate Atlas policy versus TLS interception or another intermediary.
- API tests: `pnpm --filter @workspace/api test` was blocked by access denied acquiring pnpm's global store lock. The existing API test command was then run directly with the installed local `tsx` and Node.js built-in test runner: 30/30 passed. Tests use fakes/in-memory repositories and are not live-persistence evidence.
- No production or configured database data was touched. Real metadata CRUD and the complete browser journey remain blocked until Atlas TLS/server selection succeeds. The recommended next step is for the network/Atlas owner to check cluster availability, egress/network access, and any TLS-inspecting proxy. After connectivity is restored, use a dedicated test owner/database for real CRUD and clean up test records before the browser journey.

## SQUID Drive — MongoDB Atlas TLS recheck (2026-10-14)

- Runtime versions: Node.js 24.21.0, Mongoose 9.10.1, MongoDB Node.js driver 7.6.0. The integration calls `mongoose.connect(uri)` without custom TLS overrides; configured `mongodb+srv` applies the driver's TLS defaults.
- With strict certificate verification and hostname SNI/verification enabled, TLS succeeded to all 3 Atlas SRV nodes using default negotiation, TLS 1.2, and TLS 1.3. Node reported authorized peer certificates. Mongoose connected and disconnected successfully, confirming current server selection and authentication. The previously observed `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` did not recur.
- Web proxy environment-variable names are set (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`); values were neither read nor printed. WinHTTP reports direct access. These variables alone do not indicate that Mongoose sockets use a proxy. Security-service inventory was denied, and Wi-Fi/ISP or intermittent TLS interception cannot be ruled out by these checks.
- API Node.js built-in test suite: 30/30 passed through installed local `tsx`; tests use fixtures and are not real Atlas persistence tests.
- At the time of this TLS recheck, no database writes were made and database safety had not yet been confirmed. Subsequent live persistence and browser verification is recorded below.

## SQUID Drive — Live persistence and browser verification (2026-10-14)

- Owner confirmed `squid_drive` is their development/demo database and approved temporary test writes. Read-only baseline: no entries for `local-demo-owner`, including no root folder.
- Live API Mongo CRUD passed for a unique temporary folder: create 201, owner/parent/name metadata verified, listing verified, rename 200 with normalized-name persistence, delete 204, and exact record absent afterward.
- Browser origin mismatch was corrected by opening the same local app at `http://localhost:3000/drive`, matching the API's existing CORS origin. No configuration changes were made.
- Browser successfully created/navigated into a unique folder, uploaded and listed a generated 75-byte PDF, and downloaded it. Source and download matched byte-for-byte and by SHA-256; Mongo metadata matched owner, parent, MIME type, size, and had an opaque storage key.
- Browser rename and UI deletion remain unverified: the in-app browser does not support the app's `window.prompt()` rename UI (`prompt() is not supported`), and computer-use automation then stopped because it could not determine the active Windows browser URL. API-level rename/delete succeeded in the separate CRUD test. Do not mark the full browser E2E release gate passed.
- Cleanup verified: API deleted the exact file (204) and folder (204); Mongo confirmed both records absent. An authenticated Supabase object lookup returned `not_found` after deletion. The root record was absent in baseline, created during listing, and removed after confirming it was the only remaining entry. Final owner entry count: 0. Generated fixture and downloaded copy were removed after checksum matching.
- Existing API tests passed 30/30 with the Node.js built-in test runner and installed `tsx`. No source code, credentials, or environment configuration changed.

## SQUID Drive — browser UI verification follow-up (2026-10-14)

- Updated the existing Drive feature UI to use accessible in-app rename and permanent-delete dialogs instead of native prompt/confirm. Rename enforces trimmed nonempty names, max 255 characters, and rejects slash, backslash, and control characters. Cancel leaves data unchanged. Duplicate-name API failure is surfaced while retaining the current entries.
- On the inventory-confirmed local browser tab `http://localhost:3000/drive`, the manual journey passed: create a unique folder; upload/list a synthetic 119-byte PDF; download and verify exact size and SHA-256; cancel rename; verify invalid-name rejection; verify duplicate-name API `409` preserves the listing; rename the file; cancel delete; then permanently delete the test file and two empty test folders through the UI. UI showed an empty root listing afterward. API search returned no entries matching the unique run token and the deleted file's download route returned 404. The user-approved cleanup removed only this run's exact test records and file storage object through the service's successful delete path. The service-managed root entry created during listing remains.
- The generated fixture and browser download were removed after both hashes matched. No browser automation package was added. This evidence is a manual local browser journey, not automated E2E coverage or staging verification.
- Validation: web Node.js built-in tests through `tsx` 10/10; web TypeScript typecheck passed; ESLint passed; Next.js production build passed; `node codebase/cli/repo.mjs check` reported no issues. `pnpm` remains blocked by access denied on its global store-operation lock, so validation used already-installed local tools; no dependency install or package-manager upgrade occurred.
- The production-style local web process on loopback port 3000 was restarted from this repository's successful build so the existing browser tab loaded the new UI. API/database target and credentials were not changed. No commit, push, or deployment was performed.

## SQUID Drive — final local-demo readiness audit (2026-10-14)

- Verified repository architecture check: `node codebase/cli/repo.mjs check` passed with no issues.
- Current automated checks using already-installed local tools: web Node.js built-in/tsx tests 10/10; API tests 30/30; logging tests 3/3; web, API, shared types, and logging typechecks passed; ESLint passed for those four workspaces; web production build (`next build`) and API production TypeScript build passed. No install or upgrade was attempted because the pinned pnpm workflow has a previously recorded global store lock/permission blocker.
- The implementation has local-demo UI and API support for folder navigation, breadcrumbs, listing, owner-wide search under the fixed local-demo owner, bounded pagination, upload progress, file download, create/rename/move, and permanent deletion. Loading, empty, and safe error/retry states are present.
- Prior evidence records live MongoDB folder create/list/rename/delete persistence and verified test-record cleanup; private Supabase bucket access and a 50,000,000-byte API-streamed round trip with temporary object cleanup; and a manual local-browser journey covering folder creation, synthetic upload/list/download with content verification, rename cancel/validation/conflict/success, file deletion, empty-folder deletion, and cleanup. This audit reran automated checks, not external-provider probes or the browser journey.
- Security boundary: the local-demo API has no Google SSO/session authentication and uses a fixed local-demo owner. Repository owner filters protect feature queries but do not provide authenticated per-user isolation. Keep both servers loopback-only and do not expose this demo to untrusted users. Supabase file access is server-side and private; no public URLs are issued. The server enforces 50,000,000 bytes and filename/type/signature checks, but does not provide malware scanning or full content-semantic validation.
- Failure handling permanently deletes files and rejects non-empty folder deletion; `pending_delete` is an internal provider-failure marker, not user-facing trash/recovery. Automated tests cover failure ordering/state, but no automated reconciler/retry command was verified. A failed best-effort cleanup can require documented manual operator recovery.
- Release blockers: implement and staging-verify the approved Google OIDC/session/CSRF/Origin flow; add automated browser E2E for the release journey; verify the provider's exact dashboard upload ceiling and staging storage smoke; define/test retry and orphan cleanup operations and confirm operational handover; restore the normal pnpm task workflow under the repository-pinned version.
- No staging authentication/storage verification or automated browser E2E was run. Local-demo results are not production-readiness evidence.
- This audit updated only the existing SQUID Drive backlog and this project-state document. Other pre-existing worktree changes were preserved. No credentials, database target, environment configuration, commits, pushes, or deployments were changed.

## SQUID Drive — automated browser E2E tooling check (2026-10-14)

- Re-read repository testing, development, architecture, UI, and integration instructions. The existing web test script uses the Node.js built-in test runner with `tsx`.
- Checked module resolution and workspace executable bins for Playwright, `@playwright/test`, Puppeteer, and Selenium WebDriver: none are installed. No browser E2E command is declared in repository manifests. The available Codex in-app browser is an interactive automation surface, not an integrated repeatable repository test runner.
- Re-ran existing suites using installed local tools: web 10/10, API 30/30, logging 3/3 passed. These results do not constitute browser E2E coverage.
- The requested automated browser journey remains blocked until a supported browser runner is approved and available. No dependency was installed, no custom driver was introduced, and no test database/storage writes or deletes occurred during this check.
- Backlog task `SD-E05-S01-T03` remains partial. No application source code changed.
