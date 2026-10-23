# Integration Instructions

Treat each external system or vendor library as an integration boundary: databases, queues,
payment providers, email, storage, OAuth providers, caches, external APIs, and model providers.
Application and feature code depend on an explicit integration contract, not directly on a
vendor implementation hidden in `config/`, `lib/`, `utils/`, or constants.

Use ownership to choose placement:

- Reusable technical capability belongs in `packages/<capability>` after reuse is real.
- Server-wide composition belongs in `servers/<runtime>/integrations/<system>`.
- Feature-specific adapters stay with that feature.
- Operational provisioning, telemetry, and platform configuration belong in `enablers/`.

Configuration may provide validated connection inputs, but it must not initialize an external
client. Integration factories receive explicit dependencies and return functional contracts;
do not introduce service locators, mutable global clients, DI containers, or class hierarchies.

The `servers/api/integrations/mongodb` integration owns the existing MongoDB connection,
API-runtime connection lifecycle, and logging. Feature repositories own their persistence
contracts and operations; feature-specific Mongoose adapters implement those contracts and
reuse the existing shared Mongoose connection without opening another connection. Feature
services depend only on their feature repository contract. Do not introduce a generic
database or query abstraction solely to connect a feature repository to MongoDB.
