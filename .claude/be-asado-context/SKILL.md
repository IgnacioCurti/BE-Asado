---
name: be-asado-context
description: Domain and product context for Food-Spot / BE-Asado. Use when implementing or reviewing business logic involving users, events, memberships, roles, options, voting, expenses, payments, receipts, ratings, or privacy.
---

# Food-Spot Domain Context

## Product

Food-Spot is a social application for organizing group food events.

The central concept is the **Event**.

An event brings together a group of users who need to:

1. organize a meal
2. decide what food/options they want
3. assign responsibilities
4. organize purchases
5. distribute costs
6. track payments
7. resolve outstanding payments
8. rate the event

BE-Asado provides the backend API that enforces these rules.

## Core entities

The main domain entities are:

- User
- Event
- Option
- PurchaseReceipt
- TransferReceipt
- Rating
- Image

Relationships between these entities are important. Do not modify one entity without checking how the related entities are used.

---

# User

A User represents a person participating in Food-Spot.

Relevant user information includes:

- `name`
- `lastName`
- `email`
- `alternativeEmail`
- `password`
- `profilePicture`
- `specialDiet`
- `cbu`
- `alias`

Supported special diets include:

- `celiac`
- `hypertensive`
- `vegan`
- `vegetarian`

Users can:

- register
- log in
- edit their profile
- change their profile picture
- delete their account
- participate in events
- vote through event options
- create ratings
- create transfer receipts

Never expose password hashes or recovery codes through normal API responses.

---

# Event

The Event is the central aggregate of Food-Spot.

An event represents a group meal.

Relevant fields include:

- `title`
- `description`
- `datetime`
- `memberLimit`
- `members`
- `organizer`
- `chef`
- `shoppingDesignee`
- `isPrivate`
- `state`
- `penalization`
- `penalizationStartDate`

An event may also be related to:

- options
- purchase receipts
- transfer receipts
- ratings

## Event organizer

The organizer owns the event's administrative operations.

The organizer can perform operations such as:

- editing the event
- deleting the event

When implementing event mutations, verify organizer authorization on the backend.

Do not trust an organizer ID supplied by the client when the authenticated JWT already identifies the user.

## Chef

The chef is an event responsibility.

Do not assume that the chef is the organizer.

The chef must be an appropriate event member when the existing business logic requires this.

## Shopping designee

The shopping designee is responsible for event purchases.

This role is particularly important for:

- purchase receipts
- payment approval workflows

Do not confuse the shopping designee with the organizer.

---

# Event privacy

Events can be public or private.

## Public events

Public events can be discovered without authentication.

Public event responses intentionally expose limited information.

For example, public event representations:

- do not expose the organizer
- represent `members` as a member count
- represent the chef using limited information
- expose rating aggregate information rather than individual rating data

## Private events

Private events should only be visible to users who are allowed to access them.

Authenticated users can retrieve public events and private events that include them.

Never expose private event data through public endpoints.

---

# Event membership

A user can subscribe to or unsubscribe from an event.

Membership affects authorization and access to event data.

When changing membership:

- verify the target user
- verify the event
- prevent duplicate membership
- respect `memberLimit`
- consider the event state
- ensure the authenticated user is allowed to perform the operation

For self-subscription/unsubscription, the JWT identity must correspond to the user being modified.

Do not allow:

```text
authenticated user A
    ->
modifies membership of user B
```

when the endpoint is intended to operate on the current user.

---

# Event lifecycle

Known event states:

- `closed`
- `available`
- `readyforpayment`
- `cancelled`
- `finished`

Treat event state as domain data.

When implementing operations, consider whether the operation makes sense in the current state.

Do not arbitrarily change state values.

Do not introduce a new state without understanding every consumer of the existing states.

---

# Options and voting

An Event can contain Options.

An Option represents a possible choice within the event.

Relevant Option fields include:

- `title`
- `participants`

Users can participate in options.

The backend can determine which event members have not voted.

When modifying option logic:

- verify the event relationship
- verify user membership where required
- validate participant IDs
- avoid duplicate participants
- keep event/option relationships consistent

Do not implement voting constraints exclusively in the frontend.

---

# PurchaseReceipt

A PurchaseReceipt represents an expense incurred for an event.

Relevant information includes:

- `description`
- `amount`
- event
- participants
- uploaded file/image

Purchase receipts are associated with the shopping responsibility.

The shopping designee is authorized to create and delete purchase receipts.

Event members can retrieve purchase receipts for events they belong to.

When modifying purchase receipt logic:

- verify event membership for reads
- verify shopping-designee authorization for mutations
- validate amount
- validate participants
- validate uploaded files
- preserve event relationships

---

# TransferReceipt

A TransferReceipt represents a payment made by a participant.

Relevant information includes:

- `description`
- `amount`
- `user`
- `event`
- `paymentMethod`
- `hasPaid`
- `datetime`
- uploaded receipt

Transfer receipts are different from purchase receipts.

## Participant

The participant is the user making the payment.

## Approval

The shopping designee can approve a transfer receipt.

There is also an operation for approving a payment without a receipt.

## Ownership

The owner of a transfer receipt can delete it.

Do not allow another participant to delete someone else's transfer receipt unless an explicit business rule says so.

---

# Payment model

Food-Spot tracks event costs and participant payments.

The backend exposes functionality to determine:

- individual event cost
- members and their payment information
- pending transfers
- debtor status

When modifying financial logic:

- use persisted data as the source of truth
- do not trust client-calculated totals
- avoid duplicated formulas
- inspect existing calculations before changing them
- consider rounding and numeric precision
- consider incomplete/pending payments

A change to payment calculations can affect multiple endpoints.

Search all usages before changing a financial rule.

---

# Ratings

Users can rate events.

Ratings use a score from:

- 1
- 2
- 3
- 4
- 5

A user can create or modify their rating for an event.

When modifying ratings:

- validate the score
- verify the user/event relationship
- prevent unauthorized ratings
- preserve update behavior for existing ratings

Public event responses may expose:

- average score
- rating count

Do not expose individual private rating information through public event responses.

---

# Images and uploads

Images/files are associated with users and receipts.

Multer is used for file uploads.

Known upload use cases include:

- user profile pictures
- purchase receipt files
- transfer receipt files

Receipt uploads support:

- PNG
- JPEG
- PDF

Profile pictures support image formats such as PNG/JPEG.

When processing uploads:

- validate the file
- validate the associated resource
- enforce authorization
- do not trust filenames
- do not expose unrelated private files

---

# Authentication

Authentication uses JWT.

The JWT identifies the current user.

Always use the authenticated identity for operations involving "me", "my event membership", "my receipt", or similar concepts.

Do not allow a request body or URL parameter to override the authenticated identity when the operation is user-owned.

---

# Authorization matrix

Before implementing a protected operation, determine which relationship applies.

| Operation | Typical authorization |
|---|---|
| Read private event | Event member |
| Edit event | Organizer |
| Delete event | Organizer |
| Subscribe as current user | Authenticated user matching target user |
| Unsubscribe as current user | Authenticated user matching target user |
| Create purchase receipt | Shopping designee |
| Delete purchase receipt | Shopping designee |
| Approve transfer receipt | Shopping designee |
| Delete transfer receipt | Receipt owner |
| Edit profile | User owning profile |
| Delete account | User owning account |
| Upload profile picture | User owning profile |

This table describes the intended domain behavior. Always verify the existing implementation before changing it.

---

# Business invariants

When implementing new functionality, look for violations of these invariants:

- a user cannot modify another user's private resources
- private event information must not leak
- event members must remain consistent
- event roles must refer to appropriate users
- event options must belong to the correct event
- receipt participants must be valid users associated with the event
- payment records must belong to the appropriate event/user
- rating scores must be between 1 and 5
- invalid ObjectIds must not reach database operations blindly
- client-side calculations must not become the financial source of truth

---

# Cross-entity changes

Be especially careful when changing:

- Event membership
- Event roles
- Event deletion
- Option participants
- PurchaseReceipt participants
- TransferReceipt approval
- User deletion

These operations can affect multiple documents or calculations.

Before modifying them, search for all references to the affected entity/field.

---

# Product mindset

Do not think of BE-Asado as a collection of CRUD endpoints.

Think in terms of the user workflow:

```text
User
  ↓
discovers/creates Event
  ↓
joins Event
  ↓
participates in Options
  ↓
event assigns responsibilities
  ↓
Shopping Designee purchases items
  ↓
PurchaseReceipts record expenses
  ↓
members owe their share
  ↓
members create TransferReceipts
  ↓
Shopping Designee approves payments
  ↓
event finishes
  ↓
members rate the event
```

A backend change should preserve the integrity of this workflow.
