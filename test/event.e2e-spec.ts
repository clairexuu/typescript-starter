import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventModule } from '../src/event/event.module';
import { UserModule } from '../src/user/user.module';
import { Event } from '../src/event/event.entity';
import { User } from '../src/user/user.entity';
import { EventStatus } from '../src/event/event-status.enum';

interface EventBody {
  id: string;
  title: string;
  description: string | null;
  status: string;
  invitees: { id: string; name: string }[];
}

describe('Event (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Event, User],
          synchronize: true,
        }),
        EventModule,
        UserModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let userId1: string;
  let userId2: string;

  describe('User CRUD', () => {
    it('POST /users - should create a user', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Alice' })
        .expect(201);

      const body = res.body as { id: string; name: string };
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Alice');
      userId1 = body.id;
    });

    it('POST /users - should create a second user', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Bob' })
        .expect(201);

      userId2 = (res.body as { id: string }).id;
    });

    it('GET /users/:id - should return a user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${userId1}`)
        .expect(200);

      expect((res.body as { name: string }).name).toBe('Alice');
    });

    it('GET /users/:id - should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .get('/users/non-existent-id')
        .expect(404);
    });
  });

  describe('Event CRUD', () => {
    let eventId: string;

    it('POST /events - should create an event', async () => {
      const res = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Team Meeting',
          description: 'Weekly sync',
          status: EventStatus.TODO,
          startTime: '2025-01-01T14:00:00Z',
          endTime: '2025-01-01T15:00:00Z',
          inviteeIds: [userId1],
        })
        .expect(201);

      const body = res.body as EventBody;
      expect(body.id).toBeDefined();
      expect(body.title).toBe('Team Meeting');
      expect(body.invitees).toHaveLength(1);
      eventId = body.id;
    });

    it('POST /events - should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send({ description: 'No title' })
        .expect(400);
    });

    it('POST /events - should return 400 for invalid status', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Bad Event',
          status: 'INVALID',
          startTime: '2025-01-01T14:00:00Z',
          endTime: '2025-01-01T15:00:00Z',
        })
        .expect(400);
    });

    it('GET /events/:id - should return an event', async () => {
      const res = await request(app.getHttpServer())
        .get(`/events/${eventId}`)
        .expect(200);

      const body = res.body as EventBody;
      expect(body.title).toBe('Team Meeting');
      expect(body.invitees).toHaveLength(1);
    });

    it('GET /events/:id - should return 404 for non-existent event', async () => {
      await request(app.getHttpServer())
        .get('/events/non-existent-id')
        .expect(404);
    });

    it('DELETE /events/:id - should delete an event', async () => {
      await request(app.getHttpServer())
        .delete(`/events/${eventId}`)
        .expect(200);

      // Verify it's gone
      await request(app.getHttpServer()).get(`/events/${eventId}`).expect(404);
    });

    it('DELETE /events/:id - should return 404 for non-existent event', async () => {
      await request(app.getHttpServer())
        .delete('/events/non-existent-id')
        .expect(404);
    });
  });

  describe('MergeAll', () => {
    it('should merge overlapping events and leave non-overlapping ones', async () => {
      // Create 3 events: E1(2pm-3pm), E2(2:45pm-4pm) overlap; E3(6pm-7pm) separate
      const e1Res = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'E1',
          description: 'First event',
          status: EventStatus.TODO,
          startTime: '2025-01-01T14:00:00Z',
          endTime: '2025-01-01T15:00:00Z',
          inviteeIds: [userId1, userId2],
        })
        .expect(201);

      const e2Res = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'E2',
          description: 'Second event',
          status: EventStatus.IN_PROGRESS,
          startTime: '2025-01-01T14:45:00Z',
          endTime: '2025-01-01T16:00:00Z',
          inviteeIds: [userId1],
        })
        .expect(201);

      const e3Res = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'E3',
          description: 'Third event',
          status: EventStatus.COMPLETED,
          startTime: '2025-01-01T18:00:00Z',
          endTime: '2025-01-01T19:00:00Z',
          inviteeIds: [userId1],
        })
        .expect(201);

      // Merge events for user1
      const mergeRes = await request(app.getHttpServer())
        .post(`/events/merge/${userId1}`)
        .expect(201);

      const mergedEvents = mergeRes.body as EventBody[];
      expect(mergedEvents).toHaveLength(2);

      // Find the merged event (the one with combined title)
      const merged = mergedEvents.find((e) => e.title.includes('|'));
      const unchanged = mergedEvents.find((e) => e.title === 'E3');

      expect(merged).toBeDefined();
      expect(merged.title).toBe('E1 | E2');
      expect(merged.description).toBe('First event | Second event');
      expect(merged.status).toBe(EventStatus.IN_PROGRESS);
      expect(merged.invitees).toHaveLength(2); // both Alice and Bob

      expect(unchanged).toBeDefined();
      expect(unchanged.title).toBe('E3');

      // Verify original E1 and E2 no longer exist
      const e1Id = (e1Res.body as EventBody).id;
      const e2Id = (e2Res.body as EventBody).id;
      const e3Id = (e3Res.body as EventBody).id;

      await request(app.getHttpServer()).get(`/events/${e1Id}`).expect(404);
      await request(app.getHttpServer()).get(`/events/${e2Id}`).expect(404);

      // Verify E3 still exists
      await request(app.getHttpServer()).get(`/events/${e3Id}`).expect(200);
    });

    it('should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/events/merge/non-existent-id')
        .expect(404);
    });
  });

  describe('Delete User', () => {
    let delUserId: string;
    let otherUserId: string;
    let soloEventId: string;
    let sharedEventId: string;

    beforeAll(async () => {
      // Create two users
      const u1 = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Charlie' })
        .expect(201);
      delUserId = (u1.body as { id: string }).id;

      const u2 = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Diana' })
        .expect(201);
      otherUserId = (u2.body as { id: string }).id;

      // Solo event: only Charlie
      const solo = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Solo Event',
          status: EventStatus.TODO,
          startTime: '2025-03-01T10:00:00Z',
          endTime: '2025-03-01T11:00:00Z',
          inviteeIds: [delUserId],
        })
        .expect(201);
      soloEventId = (solo.body as EventBody).id;

      // Shared event: Charlie + Diana
      const shared = await request(app.getHttpServer())
        .post('/events')
        .send({
          title: 'Shared Event',
          status: EventStatus.TODO,
          startTime: '2025-03-01T14:00:00Z',
          endTime: '2025-03-01T15:00:00Z',
          inviteeIds: [delUserId, otherUserId],
        })
        .expect(201);
      sharedEventId = (shared.body as EventBody).id;
    });

    it('DELETE /users/:id - should return 404 for non-existent user', async () => {
      await request(app.getHttpServer())
        .delete('/users/non-existent-id')
        .expect(404);
    });

    it('DELETE /users/:id - should delete user, delete solo event, and remove user from shared event', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${delUserId}`)
        .expect(200);

      // User is gone
      await request(app.getHttpServer()).get(`/users/${delUserId}`).expect(404);

      // Solo event is deleted
      await request(app.getHttpServer())
        .get(`/events/${soloEventId}`)
        .expect(404);

      // Shared event still exists but Charlie is removed from invitees
      const sharedRes = await request(app.getHttpServer())
        .get(`/events/${sharedEventId}`)
        .expect(200);

      const sharedEvent = sharedRes.body as EventBody;
      expect(sharedEvent.invitees).toHaveLength(1);
      expect(sharedEvent.invitees[0].id).toBe(otherUserId);
    });
  });
});
