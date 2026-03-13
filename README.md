# Event Management API — NestJS

Event management REST API built with NestJS, TypeORM, and SQLite. Supports creating, retrieving, and deleting events, managing users, and merging overlapping events for a user.

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

## How to Run the Project

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
# Development (with auto-reload)
npm run start:dev

# Or standard start
npm run start
```

The server runs at **http://localhost:3000**. A SQLite database file (`db.sqlite`) is created automatically on first run — no database setup needed.

### 3. Test the API

**Create a user:**
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}'
```

**Create an event** (replace `<userId>` with the ID returned above):
```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team Meeting",
    "description": "Weekly sync",
    "status": "TODO",
    "startTime": "2025-01-01T14:00:00Z",
    "endTime": "2025-01-01T15:00:00Z",
    "inviteeIds": ["<userId>"]
  }'
```

**Get an event by ID:**
```bash
curl http://localhost:3000/events/<eventId>
```

**Delete an event by ID:**
```bash
curl -X DELETE http://localhost:3000/events/<eventId>
```

**Get a user by ID** 
```bash
curl http://localhost:3000/users/<userId>
```

**Delete a user by ID** (cascades to events):
```bash
curl -X DELETE http://localhost:3000/users/<userId>
```

**Merge overlapping events for a user:**
```bash
curl -X POST http://localhost:3000/events/merge/<userId>
```

## How to Run Tests

### Unit tests (mocked dependencies, no database)

```bash
npm run test
```

Runs 30 unit tests covering:
- User service & controller (including delete user cascade logic)
- Event service & controller (CRUD + MergeAll algorithm)

### E2E integration tests (real in-memory SQLite database)

```bash
npm run test:e2e
```

Runs 16 integration tests covering:
- Full HTTP request lifecycle for all endpoints
- Input validation (400 for bad requests)
- Not found handling (404)
- Delete user cascade: solo events deleted, shared events updated
- MergeAll end-to-end: create users + overlapping events, merge, verify results

### Test coverage report

```bash
npm run test:cov
```

## Project Structure

```
src/
  main.ts                    # Entry point, global ValidationPipe
  app.module.ts              # Root module, TypeORM + SQLite config
  user/
    user.entity.ts           # User entity (id, name, events)
    user.service.ts          # User business logic
    user.controller.ts       # POST /users, GET /users/:id, DELETE /users/:id
    user.module.ts
    dto/create-user.dto.ts
    user.service.spec.ts     # Unit tests
    user.controller.spec.ts  # Unit tests
  event/
    event.entity.ts          # Event entity (id, title, description, status, times, invitees)
    event-status.enum.ts     # TODO | IN_PROGRESS | COMPLETED
    event.service.ts         # Event CRUD + MergeAll algorithm
    event.controller.ts      # POST/GET/DELETE /events, POST /events/merge/:userId
    event.module.ts
    dto/create-event.dto.ts
    event.service.spec.ts    # Unit tests (including MergeAll edge cases)
    event.controller.spec.ts # Unit tests
test/
  event.e2e-spec.ts          # Integration tests with real database
```

## Tech Stack

- **NestJS 11** — framework
- **TypeORM** — ORM with SQLite
- **class-validator** — input validation
- **Jest** — unit testing
- **Supertest** — E2E HTTP testing
