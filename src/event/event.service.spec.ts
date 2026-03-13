import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventService } from './event.service';
import { Event } from './event.entity';
import { User } from '../user/user.entity';
import { EventStatus } from './event-status.enum';

describe('EventService', () => {
  let service: EventService;

  const mockEventRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };

  const mockUserRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockManager = {
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((cb: (manager: typeof mockManager) => Promise<void>) =>
      cb(mockManager),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        { provide: getRepositoryToken(Event), useValue: mockEventRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<EventService>(EventService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an event without invitees', async () => {
      const dto = {
        title: 'Meeting',
        status: EventStatus.TODO,
        startTime: '2025-01-01T14:00:00Z',
        endTime: '2025-01-01T15:00:00Z',
      };
      const event = { id: 'uuid-1', ...dto, invitees: [] };
      mockEventRepository.create.mockReturnValue(event);
      mockEventRepository.save.mockResolvedValue(event);

      const result = await service.create(dto);

      expect(result).toEqual(event);
    });

    it('should create an event with invitees', async () => {
      const users = [
        { id: 'user-1', name: 'Alice' },
        { id: 'user-2', name: 'Bob' },
      ];
      const dto = {
        title: 'Meeting',
        status: EventStatus.TODO,
        startTime: '2025-01-01T14:00:00Z',
        endTime: '2025-01-01T15:00:00Z',
        inviteeIds: ['user-1', 'user-2'],
      };
      const event = { id: 'uuid-1', title: 'Meeting' };
      mockEventRepository.create.mockReturnValue(event);
      mockUserRepository.find.mockResolvedValue(users);
      mockEventRepository.save.mockResolvedValue({ ...event, invitees: users });

      const result = await service.create(dto);

      expect(mockUserRepository.find).toHaveBeenCalled();
      expect(result.invitees).toEqual(users);
    });

    it('should throw NotFoundException if an invitee ID is not found', async () => {
      const dto = {
        title: 'Meeting',
        status: EventStatus.TODO,
        startTime: '2025-01-01T14:00:00Z',
        endTime: '2025-01-01T15:00:00Z',
        inviteeIds: ['user-1', 'non-existent'],
      };
      mockEventRepository.create.mockReturnValue({});
      mockUserRepository.find.mockResolvedValue([{ id: 'user-1' }]);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return an event when found', async () => {
      const event = { id: 'uuid-1', title: 'Meeting', invitees: [] };
      mockEventRepository.findOne.mockResolvedValue(event);

      const result = await service.findOne('uuid-1');

      expect(result).toEqual(event);
    });

    it('should throw NotFoundException when not found', async () => {
      mockEventRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove an existing event', async () => {
      const event = { id: 'uuid-1', title: 'Meeting' };
      mockEventRepository.findOne.mockResolvedValue(event);
      mockEventRepository.remove.mockResolvedValue(event);

      await service.remove('uuid-1');

      expect(mockEventRepository.remove).toHaveBeenCalledWith(event);
    });

    it('should throw NotFoundException when event not found', async () => {
      mockEventRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('mergeAllForUser', () => {
    const user1 = { id: 'user-1', name: 'Alice' } as User;
    const user2 = { id: 'user-2', name: 'Bob' } as User;

    it('should throw NotFoundException for non-existent user', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.mergeAllForUser('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return events unchanged when user has 0 or 1 events', async () => {
      const singleEvent = {
        id: 'e1',
        title: 'E1',
        startTime: new Date('2025-01-01T14:00:00Z'),
        endTime: new Date('2025-01-01T15:00:00Z'),
        invitees: [user1],
      };
      mockUserRepository.findOne.mockResolvedValue({
        id: 'user-1',
        events: [singleEvent],
      });

      const result = await service.mergeAllForUser('user-1');

      expect(result).toHaveLength(1);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should not merge non-overlapping events', async () => {
      const events = [
        {
          id: 'e1',
          title: 'E1',
          startTime: new Date('2025-01-01T14:00:00Z'),
          endTime: new Date('2025-01-01T15:00:00Z'),
          status: EventStatus.TODO,
          invitees: [user1],
        },
        {
          id: 'e2',
          title: 'E2',
          startTime: new Date('2025-01-01T16:00:00Z'),
          endTime: new Date('2025-01-01T17:00:00Z'),
          status: EventStatus.TODO,
          invitees: [user1],
        },
      ];
      mockUserRepository.findOne
        .mockResolvedValueOnce({ id: 'user-1', events })
        .mockResolvedValueOnce({ id: 'user-1', events });

      const result = await service.mergeAllForUser('user-1');

      // Transaction is called but no merge happens (groups of size 1)
      expect(mockManager.create).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should merge two overlapping events', async () => {
      const events = [
        {
          id: 'e1',
          title: 'E1',
          description: 'Desc1',
          startTime: new Date('2025-01-01T14:00:00Z'),
          endTime: new Date('2025-01-01T15:00:00Z'),
          status: EventStatus.TODO,
          invitees: [user1],
        },
        {
          id: 'e2',
          title: 'E2',
          description: 'Desc2',
          startTime: new Date('2025-01-01T14:45:00Z'),
          endTime: new Date('2025-01-01T16:00:00Z'),
          status: EventStatus.IN_PROGRESS,
          invitees: [user2],
        },
      ];
      const mergedEvent = { id: 'merged-1', title: 'E1 | E2' };
      mockUserRepository.findOne
        .mockResolvedValueOnce({ id: 'user-1', events })
        .mockResolvedValueOnce({ id: 'user-1', events: [mergedEvent] });
      mockManager.create.mockReturnValue(mergedEvent);
      mockManager.save.mockResolvedValue(mergedEvent);
      mockManager.remove.mockResolvedValue(events);

      const result = await service.mergeAllForUser('user-1');

      expect(mockManager.create).toHaveBeenCalledWith(
        Event,
        expect.objectContaining({
          title: 'E1 | E2',
          description: 'Desc1 | Desc2',
          status: EventStatus.IN_PROGRESS,
        }),
      );
      expect(mockManager.save).toHaveBeenCalled();
      expect(mockManager.remove).toHaveBeenCalledWith(Event, events);
      expect(result).toHaveLength(1);
    });

    it('should merge chain of overlapping events into one', async () => {
      const events = [
        {
          id: 'e1',
          title: 'E1',
          description: null,
          startTime: new Date('2025-01-01T14:00:00Z'),
          endTime: new Date('2025-01-01T15:00:00Z'),
          status: EventStatus.COMPLETED,
          invitees: [user1],
        },
        {
          id: 'e2',
          title: 'E2',
          description: null,
          startTime: new Date('2025-01-01T14:30:00Z'),
          endTime: new Date('2025-01-01T15:30:00Z'),
          status: EventStatus.COMPLETED,
          invitees: [user1],
        },
        {
          id: 'e3',
          title: 'E3',
          description: null,
          startTime: new Date('2025-01-01T15:00:00Z'),
          endTime: new Date('2025-01-01T16:00:00Z'),
          status: EventStatus.COMPLETED,
          invitees: [user1],
        },
      ];
      const mergedEvent = { id: 'merged-1', title: 'E1 | E2 | E3' };
      mockUserRepository.findOne
        .mockResolvedValueOnce({ id: 'user-1', events })
        .mockResolvedValueOnce({ id: 'user-1', events: [mergedEvent] });
      mockManager.create.mockReturnValue(mergedEvent);
      mockManager.save.mockResolvedValue(mergedEvent);
      mockManager.remove.mockResolvedValue(events);

      const result = await service.mergeAllForUser('user-1');

      expect(mockManager.create).toHaveBeenCalledTimes(1);
      expect(mockManager.create).toHaveBeenCalledWith(
        Event,
        expect.objectContaining({
          title: 'E1 | E2 | E3',
          status: EventStatus.COMPLETED,
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should pick IN_PROGRESS status over TODO and COMPLETED', async () => {
      const events = [
        {
          id: 'e1',
          title: 'E1',
          description: null,
          startTime: new Date('2025-01-01T14:00:00Z'),
          endTime: new Date('2025-01-01T15:00:00Z'),
          status: EventStatus.COMPLETED,
          invitees: [user1],
        },
        {
          id: 'e2',
          title: 'E2',
          description: null,
          startTime: new Date('2025-01-01T14:30:00Z'),
          endTime: new Date('2025-01-01T15:30:00Z'),
          status: EventStatus.IN_PROGRESS,
          invitees: [user1],
        },
      ];
      mockUserRepository.findOne
        .mockResolvedValueOnce({ id: 'user-1', events })
        .mockResolvedValueOnce({ id: 'user-1', events: [] });
      mockManager.create.mockReturnValue({});
      mockManager.save.mockResolvedValue({});
      mockManager.remove.mockResolvedValue([]);

      await service.mergeAllForUser('user-1');

      expect(mockManager.create).toHaveBeenCalledWith(
        Event,
        expect.objectContaining({ status: EventStatus.IN_PROGRESS }),
      );
    });

    it('should deduplicate invitees across merged events', async () => {
      const events = [
        {
          id: 'e1',
          title: 'E1',
          description: null,
          startTime: new Date('2025-01-01T14:00:00Z'),
          endTime: new Date('2025-01-01T15:00:00Z'),
          status: EventStatus.TODO,
          invitees: [user1, user2],
        },
        {
          id: 'e2',
          title: 'E2',
          description: null,
          startTime: new Date('2025-01-01T14:30:00Z'),
          endTime: new Date('2025-01-01T15:30:00Z'),
          status: EventStatus.TODO,
          invitees: [user1],
        },
      ];
      mockUserRepository.findOne
        .mockResolvedValueOnce({ id: 'user-1', events })
        .mockResolvedValueOnce({ id: 'user-1', events: [] });
      mockManager.create.mockReturnValue({});
      mockManager.save.mockResolvedValue({});
      mockManager.remove.mockResolvedValue([]);

      await service.mergeAllForUser('user-1');

      expect(mockManager.create).toHaveBeenCalledWith(
        Event,
        expect.objectContaining({
          invitees: expect.arrayContaining([user1, user2]) as unknown,
        }),
      );
      // Verify exactly 2 invitees (no duplicates)
      const createCall = (
        mockManager.create.mock.calls as [typeof Event, { invitees: User[] }][]
      )[0][1];
      expect(createCall.invitees).toHaveLength(2);
    });
  });
});
