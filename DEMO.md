# Demo Transcription

This document serves as a transcription of the demo video, walking through the 3 event APIs and unit tests.

---

## Part 1: The 3 Event APIs

### Setup

First, start the server:

```bash
npm run start:dev
```

The server is now running at http://localhost:3000. SQLite database is auto-created.

We need a user before creating events, so let's create two:

```bash
curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}' | jq
```

Response:
```json
{
  "name": "Alice",
  "id": "a1b2c3d4-...",
  "events": []
}
```

```bash
curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Bob"}' | jq
```

---

### API 1: Create a new event — `POST /events`

Create an event with title, description, status, start/end time, and invitees:

```bash
curl -s -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sprint Planning",
    "description": "Plan next sprint tasks",
    "status": "TODO",
    "startTime": "2025-06-01T14:00:00Z",
    "endTime": "2025-06-01T15:00:00Z",
    "inviteeIds": ["<alice-id>", "<bob-id>"]
  }' | jq
```

Response:
```json
{
  "title": "Sprint Planning",
  "description": "Plan next sprint tasks",
  "status": "TODO",
  "startTime": "2025-06-01T14:00:00.000Z",
  "endTime": "2025-06-01T15:00:00.000Z",
  "invitees": [
    { "id": "...", "name": "Alice" },
    { "id": "...", "name": "Bob" }
  ],
  "id": "e1f2g3h4-...",
  "createdAt": "2025-...",
  "updatedAt": "2025-..."
}
```

The event gets an auto-generated UUID, createdAt/updatedAt timestamps, and the invitees are resolved from the user IDs we passed in.

**Validation works too.** If we try to create an event with a bad status:

```bash
curl -s -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{"title": "Bad", "status": "INVALID", "startTime": "2025-06-01T14:00:00Z", "endTime": "2025-06-01T15:00:00Z"}' | jq
```

Response — 400 Bad Request:
```json
{
  "statusCode": 400,
  "message": ["status must be one of the following values: TODO, IN_PROGRESS, COMPLETED"],
  "error": "Bad Request"
}
```

---

### API 2: Retrieve an event by ID — `GET /events/:id`

```bash
curl -s http://localhost:3000/events/<event-id> | jq
```

Response:
```json
{
  "id": "e1f2g3h4-...",
  "title": "Sprint Planning",
  "description": "Plan next sprint tasks",
  "status": "TODO",
  "startTime": "2025-06-01T14:00:00.000Z",
  "endTime": "2025-06-01T15:00:00.000Z",
  "createdAt": "...",
  "updatedAt": "...",
  "invitees": [
    { "id": "...", "name": "Alice" },
    { "id": "...", "name": "Bob" }
  ]
}
```

Returns the full event with all its invitees. If the ID doesn't exist, we get a 404:

```bash
curl -s http://localhost:3000/events/non-existent-id | jq
```

Response — 404:
```json
{
  "statusCode": 404,
  "message": "Event with id \"non-existent-id\" not found"
}
```

---

### API 3: Delete an event by ID — `DELETE /events/:id`

```bash
curl -s -X DELETE http://localhost:3000/events/<event-id> | jq
```

Response — 200 (empty body, event deleted).

If we try to GET that event again, we get 404 — confirming it's gone.

---

### Bonus: MergeAll — `POST /events/merge/:userId`

This is the key feature. Let's set up a scenario with overlapping events.

Create 3 events for Alice:

```bash
# E1: 2pm - 3pm (TODO, invitees: Alice + Bob)
curl -s -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "E1",
    "description": "First meeting",
    "status": "TODO",
    "startTime": "2025-06-01T14:00:00Z",
    "endTime": "2025-06-01T15:00:00Z",
    "inviteeIds": ["<alice-id>", "<bob-id>"]
  }' | jq

# E2: 2:45pm - 4pm (IN_PROGRESS, invitees: Alice only) — OVERLAPS with E1
curl -s -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "E2",
    "description": "Second meeting",
    "status": "IN_PROGRESS",
    "startTime": "2025-06-01T14:45:00Z",
    "endTime": "2025-06-01T16:00:00Z",
    "inviteeIds": ["<alice-id>"]
  }' | jq

# E3: 6pm - 7pm (COMPLETED, invitees: Alice only) — NO overlap
curl -s -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "E3",
    "description": "Third meeting",
    "status": "COMPLETED",
    "startTime": "2025-06-01T18:00:00Z",
    "endTime": "2025-06-01T19:00:00Z",
    "inviteeIds": ["<alice-id>"]
  }' | jq
```

Now merge:

```bash
curl -s -X POST http://localhost:3000/events/merge/<alice-id> | jq
```

Response — 2 events remain:
```json
[
  {
    "id": "new-merged-id-...",
    "title": "E1 | E2",
    "description": "First meeting | Second meeting",
    "status": "IN_PROGRESS",
    "startTime": "2025-06-01T14:00:00.000Z",
    "endTime": "2025-06-01T16:00:00.000Z",
    "invitees": [
      { "id": "...", "name": "Alice" },
      { "id": "...", "name": "Bob" }
    ]
  },
  {
    "id": "e3-original-id-...",
    "title": "E3",
    "description": "Third meeting",
    "status": "COMPLETED",
    "startTime": "2025-06-01T18:00:00.000Z",
    "endTime": "2025-06-01T19:00:00.000Z",
    "invitees": [
      { "id": "...", "name": "Alice" }
    ]
  }
]
```

What happened:
- **E1 and E2 overlapped** (E1 ends at 3pm, E2 starts at 2:45pm) — they were merged into one event
- The merged event has: title "E1 | E2", time range 2pm-4pm, status IN_PROGRESS (highest priority), and both Alice and Bob as invitees (union of invitees from both events)
- **E3 did not overlap** with anything — it stays unchanged
- The original E1 and E2 are **deleted from the database** and replaced by the new merged event

---

### Delete User — `DELETE /users/:id`

Deleting a user cascades to their events. Let's demonstrate.

Setup: Create a user "Charlie" and two events — one where Charlie is the only invitee, and one shared with Alice:

```bash
# Create Charlie
curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Charlie"}' | jq
# => { "id": "<charlie-id>", "name": "Charlie" }

# Solo event: only Charlie
curl -s -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Solo Meeting",
    "status": "TODO",
    "startTime": "2025-06-01T10:00:00Z",
    "endTime": "2025-06-01T11:00:00Z",
    "inviteeIds": ["<charlie-id>"]
  }' | jq
# => { "id": "<solo-event-id>", ... }

# Shared event: Charlie + Alice
curl -s -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team Sync",
    "status": "TODO",
    "startTime": "2025-06-01T14:00:00Z",
    "endTime": "2025-06-01T15:00:00Z",
    "inviteeIds": ["<charlie-id>", "<alice-id>"]
  }' | jq
# => { "id": "<shared-event-id>", "invitees": [Charlie, Alice] }
```

Now delete Charlie:

```bash
curl -s -X DELETE http://localhost:3000/users/<charlie-id> | jq
```

Response — 200 (user deleted).

What happened:
- **Charlie is gone** — `GET /users/<charlie-id>` returns 404
- **Solo Meeting is deleted** — Charlie was the only invitee, so the event was deleted. `GET /events/<solo-event-id>` returns 404
- **Team Sync still exists** but Charlie is removed from invitees — `GET /events/<shared-event-id>` now shows only Alice as invitee

```bash
# Verify shared event only has Alice now
curl -s http://localhost:3000/events/<shared-event-id> | jq
```

Response:
```json
{
  "id": "<shared-event-id>",
  "title": "Team Sync",
  "invitees": [
    { "id": "...", "name": "Alice" }
  ]
}
```

---

## Part 2: Unit Tests

Run unit tests:

```bash
npm test
```

Output:
```
PASS src/app.controller.spec.ts
PASS src/user/user.service.spec.ts
PASS src/user/user.controller.spec.ts
PASS src/event/event.controller.spec.ts
PASS src/event/event.service.spec.ts

Test Suites: 5 passed, 5 total
Tests:       30 passed, 30 total
```

### What the unit tests cover

**User tests (11 tests):**
- UserService: creating a user, finding a user, throwing 404 for non-existent user
- UserService delete: deleting user with no events, deleting solo events, removing user from shared events, handling mixed scenarios
- UserController: verifying all 3 endpoints delegate to the service correctly

**Event CRUD tests (11 tests):**
- EventService: creating events with and without invitees, finding events, deleting events, error handling for missing invitees or non-existent events
- EventController: verifying all 4 endpoints delegate to the correct service methods

**MergeAll algorithm tests (7 tests):**
- Throws 404 for non-existent user
- Returns events unchanged when user has 0 or 1 event (nothing to merge)
- Non-overlapping events stay separate
- Two overlapping events merge correctly (title appended, time range expanded, invitees unioned)
- Chain of 3 overlapping events all merge into one
- Status priority: IN_PROGRESS > TODO > COMPLETED
- Invitees are deduplicated (a user in both events appears only once after merge)

All unit tests use **mocked** TypeORM repositories — no database required, tests run in under 3 seconds.

### E2E integration tests

```bash
npm run test:e2e
```

Output:
```
PASS test/app.e2e-spec.ts
PASS test/event.e2e-spec.ts

Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
```

These tests use a **real in-memory SQLite database** and make actual HTTP requests to verify the full request lifecycle from HTTP -> Controller -> Service -> Database -> Response.
