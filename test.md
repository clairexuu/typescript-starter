# Test Documentation

## How to Run Tests

```bash
# Run all unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run unit tests with coverage report
npm run test:cov

# Run end-to-end (integration) tests
npm run test:e2e
```

---

## Unit Tests

Unit tests mock all external dependencies (TypeORM repositories, DataSource) so they run fast and test business logic in isolation.

### User Service Tests — `src/user/user.service.spec.ts`

| Test | Why |
|------|-----|
| `create` — should create and return a user | Verifies the service calls `repository.create()` and `repository.save()` with the correct DTO |
| `findOne` — should return a user when found | Verifies it queries with the correct ID and loads the `events` relation |
| `findOne` — should throw NotFoundException when not found | Verifies proper error handling when a user doesn't exist |
| `remove` — should throw NotFoundException when user not found | Verifies error handling for delete |
| `remove` — should delete user with no events | Verifies simple deletion without cascade side effects |
| `remove` — should delete event when user is the only invitee | Verifies cascade: solo events are fully deleted |
| `remove` — should remove user from event invitees when event has other invitees | Verifies cascade: user is removed from shared event's invitee list, event is preserved |
| `remove` — should handle mixed events | Verifies both behaviors in one call: deletes solo events AND updates shared events |

### User Controller Tests — `src/user/user.controller.spec.ts`

| Test | Why |
|------|-----|
| `create` — should call userService.create with the dto | Verifies the controller correctly delegates to the service |
| `findOne` — should call userService.findOne with the id | Verifies the controller passes the route parameter to the service |
| `remove` — should call userService.remove with the id | Verifies DELETE /users/:id delegates to service |

### Event Controller Tests — `src/event/event.controller.spec.ts`

| Test | Why |
|------|-----|
| `create` — should call eventService.create with the dto | Verifies POST /events delegates to service |
| `findOne` — should call eventService.findOne with the id | Verifies GET /events/:id delegates to service |
| `remove` — should call eventService.remove with the id | Verifies DELETE /events/:id delegates to service |
| `mergeAll` — should call eventService.mergeAllForUser with the userId | Verifies POST /events/merge/:userId delegates to service |

### Event Service Tests — `src/event/event.service.spec.ts`

These are the most comprehensive tests, covering CRUD and the MergeAll algorithm.

**CRUD tests:**

| Test | Why |
|------|-----|
| `create` — should create an event without invitees | Verifies basic event creation |
| `create` — should create an event with invitees | Verifies user lookup and invitee assignment |
| `create` — should throw NotFoundException if an invitee ID is not found | Verifies validation that all referenced users exist |
| `findOne` — should return an event when found | Verifies correct query with invitees relation |
| `findOne` — should throw NotFoundException when not found | Verifies error handling |
| `remove` — should remove an existing event | Verifies `repository.remove()` is called (not `delete()`) |
| `remove` — should throw NotFoundException when event not found | Verifies error handling |

**MergeAll algorithm tests:**

| Test | Why |
|------|-----|
| Should throw NotFoundException for non-existent user | Validates user existence check |
| Should return events unchanged when user has 0 or 1 events | Verifies the early-return optimization — no transaction is started |
| Should not merge non-overlapping events | Verifies events with no time overlap remain separate (groups of size 1 are skipped) |
| Should merge two overlapping events | Core test — verifies titles are appended with ` \| `, descriptions are joined, time range is expanded, invitees are unioned, and originals are deleted |
| Should merge chain of overlapping events into one | Tests transitive overlap: E1 overlaps E2, E2 overlaps E3 => all three merge into one |
| Should pick IN_PROGRESS status over TODO and COMPLETED | Verifies the status priority logic |
| Should deduplicate invitees across merged events | Verifies that a user appearing in multiple overlapping events only appears once in the merged event |

**Mocking strategy:**

- `Repository<Event>` and `Repository<User>` are mocked via `getRepositoryToken()` from `@nestjs/typeorm`
- `DataSource` is mocked with a `transaction` method that immediately calls the callback with a mock entity manager
- The mock manager tracks calls to `create`, `save`, and `remove` so we can assert on merge behavior

---

## E2E Integration Tests

Integration tests use a **real in-memory SQLite database** (`database: ':memory:'`). No mocking — actual SQL queries run against a real database. This validates the full request lifecycle: HTTP request -> Controller -> Service -> TypeORM -> SQLite -> response.

### Test file: `test/event.e2e-spec.ts`

**Setup**: Each test suite creates a NestJS app with an in-memory SQLite database. The `ValidationPipe` is applied just like in production. The database is created fresh for each test run (since in-memory databases don't persist).

**User CRUD tests:**

| Test | Why |
|------|-----|
| POST /users — should create a user | Verifies 201 response with generated UUID |
| POST /users — should create a second user | Creates a second user for use in merge tests |
| GET /users/:id — should return a user | Verifies user retrieval with correct data |
| GET /users/:id — should return 404 for non-existent user | Verifies error response |

**Event CRUD tests:**

| Test | Why |
|------|-----|
| POST /events — should create an event | Verifies 201 response with invitees populated from user IDs |
| POST /events — should return 400 for missing required fields | Verifies ValidationPipe rejects incomplete payloads |
| POST /events — should return 400 for invalid status | Verifies enum validation works |
| GET /events/:id — should return an event | Verifies event retrieval with invitees loaded |
| GET /events/:id — should return 404 for non-existent event | Verifies error response |
| DELETE /events/:id — should delete an event | Verifies deletion AND confirms the event is gone (GET returns 404) |
| DELETE /events/:id — should return 404 for non-existent event | Verifies error response |

**Delete User integration tests:**

| Test | Why |
|------|-----|
| DELETE /users/:id — should return 404 for non-existent user | Verifies error response |
| DELETE /users/:id — should delete user, delete solo event, and remove user from shared event | Full cascade test: creates a user with a solo event and a shared event, deletes the user, verifies the solo event is deleted, the shared event still exists but the user is removed from its invitees |

**MergeAll integration test:**

| Test | Why |
|------|-----|
| Should merge overlapping events and leave non-overlapping ones | Full end-to-end merge test (see details below) |
| Should return 404 for non-existent user | Verifies error response |

The merge integration test is the most important test. It:

1. Creates 2 users (Alice, Bob)
2. Creates 3 events:
   - E1 (2pm-3pm, TODO, invitees: Alice + Bob)
   - E2 (2:45pm-4pm, IN_PROGRESS, invitees: Alice)
   - E3 (6pm-7pm, COMPLETED, invitees: Alice)
3. Calls `POST /events/merge/{Alice's ID}`
4. Verifies:
   - 2 events remain (merged E1|E2 and unchanged E3)
   - Merged event has title "E1 | E2", description "First event | Second event"
   - Merged event has status IN_PROGRESS (highest priority)
   - Merged event has 2 invitees (both Alice and Bob — union)
   - Original E1 and E2 no longer exist (GET returns 404)
   - E3 still exists unchanged

---

## Test Coverage Summary

| Area | Unit Tests | E2E Tests | Total |
|------|-----------|-----------|-------|
| User Service (CRUD) | 3 | — | 3 |
| User Service (Delete cascade) | 5 | — | 5 |
| User Controller | 3 | — | 3 |
| Event Service (CRUD) | 7 | — | 7 |
| Event Service (MergeAll) | 7 | — | 7 |
| Event Controller | 4 | — | 4 |
| App Controller | 1 | 1 | 2 |
| User API (e2e) | — | 4 | 4 |
| Delete User (e2e) | — | 2 | 2 |
| Event API (e2e) | — | 7 | 7 |
| MergeAll API (e2e) | — | 2 | 2 |
| **Total** | **30** | **16** | **46** |
