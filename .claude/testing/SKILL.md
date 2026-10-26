---
name: testing
description: Testing strategy for BE-Asado. Use when adding features, fixing bugs, reviewing backend changes, or deciding what behavior needs coverage.
---

# Testing BE-Asado

## Goal

Tests should protect business behavior, not implementation details.

A good test should answer:

> Does Food-Spot behave correctly from the perspective of its API/domain?

rather than:

> Did this particular function execute?

## Before writing tests

First inspect the existing testing setup.

Do not introduce Jest, Vitest, Supertest, mocks, fixtures, or another testing tool without checking what the repository already uses.

Follow the existing test conventions.

## Feature changes

When adding or modifying behavior, identify the important cases before coding.

At minimum consider:

1. successful operation
2. invalid input
3. unauthenticated access
4. unauthorized access
5. resource not found
6. business rule violation

Not every endpoint needs every case, but every relevant failure mode should be considered.

## Authentication tests

For protected endpoints, verify that an unauthenticated request cannot perform the operation.

Do not test only the happy path.

## Authorization tests

Authorization is particularly important in Food-Spot because permissions depend on relationships.

Examples:

### Event

Test that:

- organizer can perform organizer-only mutations
- non-organizer cannot perform organizer-only mutations
- non-member cannot access member-only information

### Purchase receipts

Test that:

- event members can read when allowed
- shopping designee can create
- non-shopping-designee cannot create
- shopping designee can delete
- non-shopping-designee cannot delete

### Transfer receipts

Test that:

- receipt owner can delete their receipt
- another participant cannot delete it
- shopping designee can approve
- unauthorized users cannot approve

### Users

Test that:

- user can modify their own profile
- user cannot modify another user's profile
- user cannot delete another user's account

## Validation tests

Include invalid inputs relevant to the endpoint:

- malformed ObjectId
- missing required fields
- invalid enum/state
- invalid rating score
- invalid amount
- invalid participant IDs
- invalid uploaded file

## Domain tests

Important domain rules should be tested independently when the architecture allows it.

Examples:

- member limit
- duplicate membership
- event role assignment
- voting rules
- cost calculations
- payment approval
- debtor detection

## Regression tests

When fixing a bug:

1. Reproduce the bug in a test.
2. Verify the test fails before the fix when practical.
3. Implement the fix.
4. Verify the test passes.

Do not fix a bug without considering whether the same behavior can regress.

## Test isolation

Tests should be independent.

Avoid:

```text
test A creates state
test B assumes state from test A
```

Each test should establish the state it requires.

## Mocks

Mock external boundaries when useful.

Do not mock everything.

Excessive mocking can produce tests that pass while the actual application behavior is broken.

## Database tests

When testing database behavior, distinguish between:

### Unit tests

Useful for isolated business rules and transformations.

### Integration tests

Useful when correctness depends on:

- Mongoose behavior
- MongoDB queries
- document relationships
- persistence

Do not force database logic into unit tests merely to avoid integration tests.

## API tests

API tests should verify behavior at the HTTP boundary when appropriate:

- request
- authentication
- authorization
- response status
- response body
- persistence effects

## Test naming

Test names should describe behavior.

Prefer:

```text
rejects deleting a transfer receipt owned by another user
```

over:

```text
calls deleteTransferReceipt
```

## What not to test

Avoid tests that are tightly coupled to:

- private implementation details
- exact internal function calls
- irrelevant mock interactions
- framework internals

Unless those details are themselves part of the required behavior.

## Test checklist

Before finishing a feature:

- [ ] happy path covered
- [ ] authorization considered
- [ ] invalid input considered
- [ ] not-found behavior considered
- [ ] relevant business rules covered
- [ ] regression coverage added for bug fixes
- [ ] tests are isolated
- [ ] existing test suite passes
- [ ] build passes
