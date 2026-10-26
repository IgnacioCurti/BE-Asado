---
name: node-typescript
description: Node.js and TypeScript conventions for the BE-Asado backend. Use when writing or modifying TypeScript, imports, async code, configuration, errors, or build-related code.
---

# Node.js + TypeScript

## Module system

BE-Asado uses ES Modules.

The project uses:

```json
"type": "module"
```

Use:

- `import`
- `export`

Do not introduce CommonJS patterns such as:

```typescript
require(...)
module.exports = ...
```

unless the existing file explicitly requires interoperability.

## TypeScript

Prefer strong typing.

Avoid:

- `any`
- unnecessary `as` assertions
- `@ts-ignore`
- `@ts-nocheck`

Do not silence a compiler error without understanding why it exists.

When a type is wrong, fix the underlying type or implementation.

## Existing types

Before creating a new interface/type:

1. Search the repository for an existing equivalent.
2. Reuse it if appropriate.
3. Avoid creating multiple types representing the same domain concept.

Do not duplicate domain types without a reason.

## Async code

Prefer `async/await`.

Handle rejected promises.

Do not silently ignore errors.

Avoid unnecessary Promise nesting.

## Express

Keep HTTP-specific concerns close to the HTTP boundary.

Code handling:

- `req.params`
- `req.body`
- `req.query`
- `req.file`
- `res`
- HTTP status codes

should remain in the existing HTTP/controller/route layer used by the affected feature.

Do not pass Express `Request` and `Response` through domain/business logic unless the existing architecture explicitly does so.

## Error handling

Do not hide unexpected errors.

Avoid:

```typescript
try {
  ...
} catch {
  return ...
}
```

when it loses useful diagnostic information.

Follow the existing error-handling style in the affected module.

Do not introduce a new global error-handling architecture as part of a small feature.

## Environment variables

Never hardcode secrets or environment-specific configuration.

Use the existing environment/configuration mechanism.

Never commit real:

- JWT secrets
- database credentials
- API keys
- email credentials

## Imports

Follow the existing import conventions.

Before changing imports, consider:

- ESM compatibility
- TypeScript configuration
- runtime resolution
- circular dependencies

Do not perform unrelated import cleanup.

## Dependency management

Prefer existing dependencies.

Before adding a dependency:

1. Check whether the project already provides the functionality.
2. Check whether a small implementation is more appropriate.
3. Consider bundle/runtime impact.
4. Consider whether the dependency is actually needed.

Do not add a package just because it is convenient.

## Build verification

After meaningful TypeScript changes, run:

```bash
npm run build
```

If the build fails, determine whether the failure was caused by the change before continuing.

Do not declare a task complete with known TypeScript errors.

## Refactoring

Separate feature work from architectural refactoring.

If a refactor is necessary for the feature, keep it focused.

If it is merely an improvement opportunity, mention it rather than silently doing it.

## Code quality

Prefer code that is:

- readable
- explicit
- easy to test
- consistent with the surrounding code

Do not optimize for abstraction count.

A simple function is preferable to a framework-like abstraction when the abstraction provides no real value.
