---
name: mongodb-mongoose
description: MongoDB and Mongoose conventions for BE-Asado. Use when modifying schemas, models, queries, relationships, aggregation, persistence, or database-related business logic.
---

# MongoDB + Mongoose

## General rule

BE-Asado uses MongoDB through Mongoose.

Do not apply relational-database assumptions without verifying that they make sense for the existing document model.

Before modifying persistence:

1. inspect the model/schema
2. search all usages
3. inspect related models
4. inspect queries
5. inspect business logic depending on the data

## ObjectIds

MongoDB ObjectIds are used for entity identifiers and relationships.

Validate externally supplied IDs when appropriate.

Typical sources:

- `req.params`
- `req.body`
- `req.query`

Do not blindly pass user input into Mongoose queries.

## Relationships

Before changing a relationship, determine whether the existing implementation uses:

- embedded data
- ObjectId references
- arrays of ObjectIds
- populated references
- separate queries

Follow the existing model.

Do not introduce a different relationship strategy for one feature without a strong reason.

## Event relationships

Events can be related to:

- users
- options
- purchase receipts
- transfer receipts
- ratings

Changing event membership or deletion can therefore affect multiple pieces of data.

Search for all affected relationships before modifying Event persistence.

## Query design

Prefer database filtering over retrieving a large collection and filtering it in JavaScript when the database can perform the operation efficiently.

Consider:

- query predicates
- projection
- population
- sorting
- result size
- number of database round trips

## N+1 queries

Watch for patterns such as:

```text
for each user
    query database
```

or:

```text
for each receipt
    query database
```

Before implementing such a pattern, check whether a single query, populate, or aggregation can retrieve the required information.

Do not prematurely optimize trivial operations.

## Updates

Before modifying a document:

- verify it exists
- verify the requester has permission
- validate the new data
- consider related documents
- consider whether existing values must be preserved

Avoid updates that accidentally overwrite unrelated fields.

## Arrays

When modifying arrays such as event members or option participants:

- prevent unintended duplicates
- preserve unrelated entries
- handle removals deliberately
- validate referenced users
- consider concurrency

Do not blindly replace an array when the intended operation is adding/removing one element.

## Delete operations

Before deleting a document, determine:

- who is allowed to delete it
- whether other documents reference it
- whether references must be removed
- whether derived calculations depend on it
- whether the frontend expects a particular deletion behavior

Do not assume MongoDB automatically maintains application-level relationships.

## Financial data

Purchase receipts and transfer receipts participate in financial calculations.

When modifying them:

- preserve numeric semantics
- validate amounts
- understand who pays
- understand who receives
- understand approval state
- inspect cost calculation functions

Do not duplicate payment calculations.

## Aggregation

Use MongoDB aggregation when it provides a clear benefit for:

- grouping
- counting
- averages
- joining related data
- transforming data

Do not replace a simple query with a complex aggregation without a concrete reason.

## Schema changes

Before changing a Mongoose schema:

1. search all references to the field
2. inspect existing documents assumptions
3. inspect API responses
4. inspect frontend consumers
5. consider backwards compatibility
6. update tests

If existing production documents may be incompatible, explicitly identify the migration/data implications.

## Indexes

When adding a query that will be used frequently on a large collection, consider whether an index is appropriate.

Do not add indexes blindly.

Consider:

- query frequency
- cardinality
- sort patterns
- write overhead

## Persistence vs business logic

Do not put unrelated business workflows into Mongoose schemas merely because a schema method can technically perform the work.

Follow the architecture already used by the affected module.

## Database checklist

Before finishing database-related work:

- [ ] model/schema reviewed
- [ ] relationships reviewed
- [ ] ObjectIds validated
- [ ] authorization checked
- [ ] duplicate relationships considered
- [ ] related documents considered
- [ ] financial calculations checked if relevant
- [ ] query count considered
- [ ] tests updated
