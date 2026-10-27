---
name: api-development
description: API development conventions for BE-Asado. Use when creating, modifying, debugging, or reviewing Express endpoints and HTTP behavior.
---

# BE-Asado API Development

## Before coding

For any API change:

1. Identify the domain.
2. Find similar existing endpoints.
3. Inspect the route.
4. Inspect the handler/controller.
5. Inspect authentication middleware.
6. Inspect authorization logic.
7. Inspect the affected model.
8. Search for frontend usage when available.
9. Identify relevant tests.

The existing implementation is the primary source of truth.

## Existing API contract

BE-Asado currently exposes action-oriented endpoints.

Examples include:

```text
GET    /events/getEvents
GET    /events/getPublicEvents
GET    /events/getEventById/:id

POST   /events/createEvent

PUT    /events/editEvent/:id
DELETE /events/deleteEvent/:id

PUT    /events/subscribeToAnEvent/:id/:event
PUT    /events/unsubscribeFromEvent/:id/:event
```

Do not rename existing endpoints unless explicitly requested.

Existing frontend code may depend on them.

## New endpoints

For new functionality, prefer resource-oriented REST when it fits naturally.

Prefer:

```text
GET /events
GET /events/:id
POST /events
PATCH /events/:id
DELETE /events/:id
```

over action-oriented names.

However, consistency with the existing public API is more important than theoretical REST purity.

## HTTP boundary

The HTTP layer is responsible for:

- extracting request data
- validating transport-level input
- invoking application logic
- mapping results to HTTP responses
- returning appropriate status codes

Do not put large amounts of domain logic directly in route definitions.

## Authentication

Determine whether the endpoint is:

- public
- authenticated
- authenticated + event member
- authenticated + organizer
- authenticated + shopping designee
- authenticated + resource owner

Never assume an endpoint should be public.

## Authorization

Authorization must be enforced server-side.

Before mutations, answer:

> Who owns this resource?

and:

> What relationship gives this user permission?

Examples:

```text
Event mutation
→ organizer

Purchase receipt mutation
→ shopping designee

Transfer receipt deletion
→ receipt owner

Profile mutation
→ profile owner
```

## Current user

When an operation is performed by the current user:

```text
JWT identity
    ↓
authenticated user
```

should be the source of truth.

Do not trust:

```text
req.body.user
```

or:

```text
req.params.user
```

to identify the current user when the authentication middleware already provides that identity.

## Resource ownership

Never authorize a mutation solely because the requester is authenticated.

For example:

```text
DELETE /transferReceipts/:id
```

must verify that the receipt belongs to the authenticated user when ownership is the rule.

## Input validation

Validate all external input.

### Params

Validate IDs and other path parameters.

### Body

Validate required fields and allowed values.

### Query

Validate expected query parameters.

### Files

Validate uploads before persistence.

## MongoDB IDs

BE-Asado uses MongoDB ObjectIds.

Malformed IDs should be handled intentionally.

Do not allow malformed values to accidentally become generic database errors when a clean client error is possible.

## HTTP status codes

Use the existing project's status-code conventions.

When adding a new endpoint, choose status codes based on semantics rather than blindly copying one endpoint.

Typical categories include:

- `2xx` successful operation
- `4xx` invalid/authentication/authorization/client error
- `5xx` unexpected server failure

Do not expose internal stack traces to clients.

## Response shape

Follow the response format of the affected API area.

Do not introduce a completely different response envelope for one endpoint.

When changing an existing response, search the frontend for consumers before doing so.

## Frontend compatibility

The Food-Spot frontend is a consumer of BE-Asado.

When changing:

- response properties
- status codes
- endpoint paths
- request body fields
- authentication behavior

search the frontend repository if available.

Do not assume an API change is isolated to the backend.

# Frontend Integration

The Food-Spot frontend is maintained in:

https://github.com/FrancoGaytan/foodspot-nextjs

When a backend change affects an API contract, inspect the frontend repository when available.

Search for:

- endpoint usage
- request payload construction
- response property usage
- authentication handling
- event state handling
- error handling
- upload handling

Pay particular attention to:

- authentication
- event home
- event membership
- event roles
- payment/receipt flows

Before changing an existing API response, determine whether the frontend depends on its current shape.

A backend change is not complete merely because the backend builds successfully if it breaks an existing frontend flow.

## Breaking changes

Treat these as potentially breaking:

- renaming an endpoint
- removing a response property
- changing a property type
- changing authentication requirements
- changing status codes relied upon by clients
- changing event visibility
- changing payment semantics

Do not make these changes silently.

## API checklist

Before finishing:

- [ ] endpoint path is correct
- [ ] HTTP method is correct
- [ ] authentication is correct
- [ ] authorization is correct
- [ ] params are validated
- [ ] body is validated
- [ ] IDs are validated
- [ ] resource existence is handled
- [ ] unauthorized access is rejected
- [ ] response shape is compatible
- [ ] errors are handled
- [ ] relevant tests exist
- [ ] build passes
