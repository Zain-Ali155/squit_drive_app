# SQUID Drive — Complete Project Instructions

## 1. Project Overview

Build a lightweight, secure, maintainable document-management application inspired by Google Drive and integrated into the existing SQUID codebase.

Authenticated users must be able to upload, organize, search, rename, download, and delete their own files and folders.

This is not a full Google Drive clone. The goal is to deliver a practical, production-minded MVP with clear architecture, appropriate security, automated tests, complete Agile planning, and maintainable documentation.

**Primary rule:** Inspect the existing repository first. Complete discovery, backlog planning, and architecture design. Present these deliverables for review and obtain explicit approval before modifying application code.

## 2. Technology Stack

Reuse the existing project technology and conventions.

* Frontend: Next.js, React, TypeScript.
* Backend: Node.js, Express, TypeScript.
* Metadata database: MongoDB.
* File storage: Supabase Storage, subject to verification and approval.
* Authentication: Google Single Sign-On (SSO), following the approved identity architecture.
* Validation: Existing validation libraries and conventions, including Zod where already used.
* Shared contracts: Existing shared API types and packages.
* UI: Existing design system and UI component library.
* Testing: Existing test frameworks and package scripts.

Do not replace MongoDB or introduce alternative frameworks without a documented reason and approval. Avoid unnecessary dependencies, duplicate libraries, broad upgrades, and speculative infrastructure.

## 3. Phase A — Repository Discovery

Before changing anything, inspect the repository and report the findings.

### 3.1 Instructions and architecture

Read applicable files that actually exist, including:

* `<span>AGENTS.md</span>`
* `<span>CLAUDE.md</span>`
* `<span>.agent/instructions/architecture.md</span>`
* `<span>architecture.yaml</span>`
* Relevant project-specific instructions
* Package manifests and workspace configuration

Follow established architecture, dependency-boundary, coding, testing, and security rules.

### 3.2 Frontend

Inspect:

* Next.js App Router and existing routes.
* Layouts, navigation, styling, and UI components.
* API clients and environment validation.
* Loading, empty, success, and error states.
* Authentication assumptions.
* Existing frontend tests and build commands.

### 3.3 Backend

Inspect:

* Express bootstrap and middleware.
* Existing routes, controllers, services, and features.
* Dependency-injection conventions.
* Shared API contracts and request validation.
* Logging, request IDs, and centralized error handling.
* Authentication and authorization middleware.
* MongoDB connection, persistence patterns, and indexes.
* Existing tests and test database configuration.

### 3.4 Integrations

Verify the actual implementation of:

* Google OAuth/OIDC and session management.
* MongoDB persistence.
* Supabase client and storage operations.
* Environment-variable validation.
* File-upload handling and limits.
* Existing security controls.

Environment variables alone do not prove that an integration works. Do not claim a provider is connected until its implementation and behavior have been verified.

### 3.5 Discovery deliverable

Provide:

1. Relevant repository structure.
2. Existing capabilities that can be reused.
3. Missing functionality.
4. Existing dependencies and available commands.
5. Git status and pre-existing changes.
6. Authentication, database, and storage findings.
7. Security, reliability, and testing risks.
8. Decisions that need review or approval.

Discovery must be read-only. Do not modify application code or install packages during this phase.

## 4. Git and Existing-Code Protection

* Inspect Git status before and after changes.
* Preserve all existing modified, staged, and untracked files.
* Never reset, clean, revert, or overwrite unrelated work.
* Do not commit, push, or deploy unless explicitly authorized.
* Do not perform unrelated refactoring.
* Do not install or upgrade dependencies without justification and approval.
* Report exact files changed.
* Never expose secrets from environment files.
* Do not invent repository paths or claim functionality exists without evidence.

## 5. MVP Functional Requirements

### 5.1 Authentication

* Google SSO sign-in using the approved architecture.
* Secure authenticated access.
* Appropriate unauthenticated behavior.
* Server-side identity verification.
* Session expiry and logout handling.
* Authorization on every protected API operation.

Inspect the existing SQUID identity/session architecture before implementing a new authentication system. Avoid duplicate authentication when an existing solution can be reused.

### 5.2 File management

Users must be able to:

* Upload permitted files.
* List files in an authorized location.
* View file metadata.
* Download files after authorization.
* Rename files.
* Delete files according to the approved deletion policy.
* Search accessible file and folder metadata.
* Receive useful upload progress and operation feedback where supported.

Enforce supported file types, maximum file size, safe filename handling, and server-side validation.

### 5.3 Folder management

Users must be able to:

* Create folders.
* List folders and their contents.
* Navigate nested folders.
* See their current location through breadcrumbs or equivalent navigation.
* Rename folders.
* Delete folders according to the approved policy.

Prevent invalid parent references, folder cycles, and access to another user's folders.

### 5.4 Search and navigation

* Search only authorized files and folders.
* Define search as metadata/name search for the MVP unless broader content search is approved.
* Validate search input.
* Use bounded result sets and pagination.
* Provide clear empty and no-results states.
* Do not load every file into the browser to perform searches.

### 5.5 Frontend experience

Build a professional, calm, consistent interface that follows the existing design system.

Include:

* Navigation and folder breadcrumbs.
* File and folder list or grid.
* Upload interface and progress feedback.
* Rename and delete confirmation.
* Loading, empty, success, and error states.
* Responsive desktop and mobile layouts.
* Keyboard navigation, visible focus, accessible labels, and sufficient contrast.

Do not leave visible interactive controls without defined behavior. Avoid unnecessary UI dependencies.

## 6. Out-of-Scope Features

Do not implement the following in the MVP unless explicitly approved:

* File sharing and shared folders.
* Public download links.
* Collaborative editing.
* File version history.
* Favorites and recent files.
* Trash and file recovery.
* Storage quotas and billing.
* Activity feeds and notifications.
* OCR, advanced content indexing, or advanced previews.
* Queues, microservices, or background workers without a demonstrated need.

Keep the architecture extensible without implementing speculative future features.

## 7. Authentication and Authorization Architecture

Document and review these decisions before implementation:

* Whether Google SSO is standalone or integrated with existing SQUID identity.
* The trusted source of user identity.
* Mapping between the authenticated identity and the application owner ID.
* OAuth/OIDC callback and redirect configuration.
* State and PKCE protections where applicable.
* Token and claim validation.
* Secure cookies and session handling.
* CSRF protection where applicable.
* Logout and session-expiry behavior.
* Account linking, if required.
* Backend authorization requirements.

Never trust a user ID, owner ID, or storage key supplied by the client as proof of identity.

Every protected operation must derive identity from the trusted authentication context and verify permission for the requested resource.

Google SSO authenticates a user; it does not automatically authorize access to other users' documents or provide Google Drive API access.

Never expose OAuth secrets or service credentials in browser code, public environment variables, API responses, or logs.

## 8. MongoDB and Supabase Storage

### 8.1 MongoDB

Store file and folder metadata in MongoDB, not unbounded file contents.

Metadata may include:

* Record ID.
* Trusted owner ID.
* Record type: file or folder.
* Display name.
* Parent folder reference.
* File size and content type.
* Storage provider and opaque object key.
* Creation and modification timestamps.
* Deletion or lifecycle state, if required.

Define schemas, validation, indexes, ownership constraints, and pagination according to actual access patterns.

Reuse the existing MongoDB integration. Keep database-specific implementation inside the permitted persistence/integration boundary. Do not import Mongoose directly into domain or feature modules if the repository architecture prohibits it.

### 8.2 Supabase Storage

Verify the actual Supabase implementation and configuration before relying on it.

If approved:

* Store file bytes in Supabase Storage.
* Store file metadata in MongoDB.
* Use private buckets.
* Use opaque, unpredictable storage object keys.
* Never build storage paths directly from untrusted filenames.
* Keep service-role credentials server-side.
* Authorize every upload, download, and deletion.
* Generate short-lived signed URLs only after authorization, or use authorized streaming.
* Never expose permanent public URLs for private documents.
* Enforce upload limits and bounded processing.
* Handle provider timeouts and errors safely.
* Plan cleanup for orphaned objects and incomplete operations.
* Never log file contents, secrets, tokens, or signed URLs.

Do not silently add another paid storage provider.

### 8.3 Consistency between MongoDB and storage

MongoDB and object storage do not share a single atomic transaction by default.

Define behavior for:

* Upload failures.
* Metadata creation failures after upload.
* Storage failures before metadata creation.
* Rename operations.
* File deletion failures.
* Missing storage objects.
* Orphaned files and cleanup.
* Safe retries and recovery.

Choose a simple, reliable approach for the MVP. Do not add a queue or background worker without a documented need and approval.

## 9. File and Folder Business Rules

Before implementation, document and obtain review of these decisions:

1. Root-folder representation.
2. Duplicate names within the same parent.
3. Filename normalization and case sensitivity.
4. Supported file types.
5. Maximum upload size.
6. Whether content inspection is required.
7. Deletion of non-empty folders.
8. Permanent deletion versus lifecycle-based deletion.
9. Parent-folder ownership and validation.
10. Prevention of folder cycles.
11. Whether rename changes only metadata or also storage keys.
12. Search scope and pagination limits.
13. Metadata retention and storage cleanup.
14. Handling unsupported or oversized uploads.
15. Appropriate abuse controls or rate limits.

For unresolved decisions, document options, trade-offs, a recommendation, and approval status. Do not silently choose a rule that could affect user data or access permissions.

## 10. API Contracts and Error Handling

Follow existing Express, validation, shared-type, and error-handling conventions.

Document every new endpoint with:

* HTTP method and route.
* Authentication requirements.
* Authorization rules.
* Path, query, and body parameters.
* Request validation.
* Success status and response schema.
* Error status and stable error code.
* Pagination and result limits.
* Logging and request-correlation behavior where supported.
* Required tests.

Reuse shared API contracts rather than duplicating types across frontend and backend.

Validate untrusted input on the server. Return consistent, safe errors without stack traces, database internals, credentials, or private storage details.

Do not expose storage keys as a way to bypass authorization.

## 11. Security, Privacy, and Reliability

Security is required in every Story.

### Authorization

* Check ownership or an explicitly approved access policy on every operation.
* Validate parent-folder ownership before creating or moving a child.
* Prevent insecure direct-object-reference vulnerabilities.
* Prevent cross-user listing, reading, renaming, downloading, and deletion.
* Never rely on frontend route guards as the only security control.

### Upload security

* Validate filenames and identifiers.
* Reject invalid, unsupported, or oversized uploads.
* Avoid path traversal and unsafe storage keys.
* Do not trust the client-provided MIME type or file extension.
* Use bounded streaming/buffering.
* Never execute uploaded files.

### Secrets and privacy

* Keep secrets in server-side environment configuration or the approved secret manager.
* Never expose secrets through `<span>NEXT_PUBLIC_*</span>` variables, client bundles, responses, logs, or documentation.
* Redact sensitive values from errors and logs.
* If a credential may have been exposed, recommend revoking or rotating it without repeating its value.

### Reliability

* Define behavior for database and storage outages.
* Do not report success before the operation succeeds.
* Make retries safe where applicable.
* Handle inconsistent metadata and storage state.
* Ensure failed requests do not expose stale private file listings.
* Test partial failures and cleanup behavior.

## 12. Agile Backlog Structure

Use this hierarchy:

**Initiative → Epic → Story → Task → Subtask**

If the existing management system does not support Initiatives, use them as planning groups without pretending they are native system objects.

Reuse the existing ID convention. If none exists, propose a stable convention for approval. Never duplicate or silently change established IDs.

### 12.1 Required epics

Create and maintain these nine epics:

1. **Architecture and Foundation** — architecture, configuration, shared contracts, database and storage boundaries.
2. **Google SSO and Access Control** — identity, sessions, protected routes, authorization.
3. **File Management** — upload, metadata, listing, download, rename, deletion.
4. **Folder and Organization Management** — folder hierarchy, navigation, ownership, rename, deletion.
5. **Search and Navigation** — authorized search, pagination, empty states.
6. **Professional Frontend and UX** — layout, file/folder views, interactions, responsive design, accessibility.
7. **Security, Reliability, and Data Integrity** — isolation, provider failures, cleanup, safe errors.
8. **Automated Testing and QA** — unit, integration, authorization, regression, and applicable end-to-end tests.
9. **Documentation and Delivery** — setup, decisions, API contracts, verification, handover.

### 12.2 Every Story must include

* Unique ID and parent Epic.
* Title.
* User story: “As a [user], I want [capability], so that [value].”
* Business value.
* In-scope and out-of-scope behavior.
* Given/When/Then acceptance criteria.
* Dependencies and blockers.
* Priority and estimate using existing team conventions.
* Security and authorization considerations.
* Testing requirements.
* Definition of Done.
* Related architecture decisions and backlog items.

Acceptance criteria must be observable and testable. Avoid vague statements such as “works correctly” without measurable behavior.

### 12.3 Every Task must include

* Unique ID and parent Story.
* Objective and expected outcome.
* Dependencies.
* Relevant file paths, identified after repository inspection.
* Implementation notes and constraints.
* Verification instructions.
* Verifiable completion condition.

Subtasks must be small enough to implement and verify independently.

### 12.4 Backlog traceability

Maintain accurate statuses, dependencies, priorities, estimates, acceptance criteria, and completion evidence.

Do not mark a task complete merely because code exists. A Story is complete only when its acceptance criteria and Definition of Done are satisfied.

Keep requirements, backlog items, implementation, tests, and documentation aligned.

## 13. Architecture and Coding Principles

Follow the repository's actual rules first.

* Separation of concerns.
* Clear module boundaries.
* Single responsibility where it improves maintainability.
* Low coupling.
* Explicit dependency injection where established or useful.
* Small, focused functional modules.
* Strict TypeScript and explicit contracts.
* Avoid `<span>any</span>` unless an approved, documented exception is unavoidable.
* Avoid unnecessary classes and abstractions.
* Respect dependency rules and vendor boundaries.
* Reuse existing logging, validation, error handling, and API conventions.
* Follow established naming, export, folder, and test conventions.
* Prefer simple, testable solutions.
* Do not overengineer for speculative future features.

Do not assume example paths in this document exist. Discover actual paths and follow the repository architecture.

## 14. Definition of Done

A Story is complete only when all applicable conditions are satisfied:

* Approved acceptance criteria pass.
* Changes remain within approved scope.
* Architecture and dependency rules are respected.
* Server-side validation and authorization are implemented.
* Error handling is safe and consistent.
* Relevant tests have been added or updated.
* Relevant tests have actually been run.
* Applicable type checks, linting, and builds have been run.
* Existing functionality has not been unintentionally broken.
* No secrets or sensitive data have been exposed.
* Relevant documentation has been updated.
* Limitations and skipped checks are reported honestly.
* Git status has been reviewed and unrelated work preserved.

If a required check cannot run, report why and mark the work as blocked or partially verified according to the project's workflow.

## 15. Quality Gates and Testing

Inspect package manifests and existing scripts before choosing commands.

Run applicable checks available in the repository:

* Unit tests.
* API tests.
* Integration tests.
* Authorization and cross-user isolation tests.
* Frontend tests.
* Type checking.
* Linting.
* Production builds.
* End-to-end tests, if supported.

Cover relevant success and failure scenarios:

* Valid authenticated request.
* Missing or invalid authentication.
* Access to another user's resource.
* Invalid input and identifiers.
* Missing file or folder.
* Oversized or unsupported upload.
* Database and storage failures.
* Partial operation failure and cleanup.
* Empty results and pagination boundaries.
* Regression behavior for affected features.

Report exact commands and actual results. Distinguish passing, failing, skipped, unavailable, and not-run checks. Never fabricate test results or claim provider integration success without verification.

## 16. Documentation and Architecture Decisions

Reuse the existing documentation system and avoid duplicate documents.

Record important decisions using the repository's established ADR format. Include:

* Context and problem.
* Options considered.
* Decision and rationale.
* Security and operational implications.
* Trade-offs.
* Status and approval.
* Consequences and revisit conditions.

Maintain accurate documentation for:

* Required environment-variable names, never secret values.
* Google OAuth setup and callback URLs.
* MongoDB configuration and connectivity.
* Supabase configuration and private bucket requirements.
* Local development commands.
* API contracts and error responses.
* Test, lint, type-check, and build commands.
* File limits and supported types.
* Troubleshooting and known limitations.

## 17. Required Delivery Workflow

### Phase A — Discovery

Read-only repository inspection.

Deliver confirmed findings, existing capabilities, gaps, risks, and unresolved questions.

### Phase B — Backlog

Create or update the complete Agile backlog, including IDs, priorities, estimates, dependencies, acceptance criteria, security requirements, tests, and Definition of Done.

Separate MVP scope from future enhancements.

### Phase C — Architecture

Present proposed module boundaries, authentication, API contracts, MongoDB metadata model, storage integration, business rules, security, failure handling, and testing strategy.

Record assumptions and decisions requiring approval.

### Mandatory approval gate

Present Phases A, B, and C for review. Wait for explicit approval before application implementation.

Do not modify application code until discovery, backlog, and architecture have been reviewed and approved. If approval covers only part of the scope, implement only that approved part.

### Phase D — Incremental implementation

After approval:

1. Select one dependency-ready Story.
2. State its ID, goal, acceptance criteria, dependencies, and planned files.
3. Inspect relevant files and Git status.
4. Implement only the approved scope.
5. Add or update tests.
6. Run relevant quality checks.
7. Review security and data integrity.
8. Report changed files, actual test results, blockers, and remaining work.

Do not generate the whole application in one unreviewed operation.

### Phase E — Verification

Verify acceptance criteria and regression behavior. Run relevant checks and document limitations.

### Phase F — Delivery

Report completed and incomplete items, changed files, dependencies, setup steps, provider configuration, test results, known limitations, and recommended next steps.

## 18. Agent Behavior

* Communicate clearly and directly.
* Explain the requirement, solution, logic, affected files, and verification.
* Ask only focused questions that block a safe decision.
* Document assumptions rather than inventing facts.
* Never invent paths, dependencies, integrations, requirements, or test results.
* Do not bypass authentication or authorization to make a demo appear functional.
* Do not expose secrets.
* Avoid unrelated changes and speculative features.
* Preserve existing work and team workflows.
* Do not claim a provider is operational merely because a URL or key exists in `<span>.env</span>`.

## 19. Final Product Acceptance

The MVP is ready for delivery only when:

* Approved MVP requirements are implemented.
* Google SSO follows the reviewed authentication design.
* Protected frontend and backend behavior is correct.
* Cross-user access is prevented.
* File and folder operations satisfy approved business rules.
* MongoDB metadata persistence works.
* Private storage works through the approved integration.
* Upload limits and validation are enforced.
* Partial database/storage failures are handled as designed.
* Search and listing are authorized and bounded.
* Responsive and accessible UI states are implemented.
* Relevant security, unit, integration, and regression tests pass.
* Applicable type, lint, and build checks are reported.
* Setup, architecture, API, and operational documentation is current.
* No secrets or sensitive data are exposed.
* Known limitations and deferred features are documented.
