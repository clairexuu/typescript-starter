import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { Event } from '../event/event.entity';

describe('UserService', () => {
  let service: UserService;
  const mockUserRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
  const mockEventRepository = {
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Event), useValue: mockEventRepository },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a user', async () => {
      const dto = { name: 'Alice' };
      const user = { id: 'uuid-1', name: 'Alice', events: [] };
      mockUserRepository.create.mockReturnValue(user);
      mockUserRepository.save.mockResolvedValue(user);

      const result = await service.create(dto);

      expect(mockUserRepository.create).toHaveBeenCalledWith(dto);
      expect(mockUserRepository.save).toHaveBeenCalledWith(user);
      expect(result).toEqual(user);
    });
  });

  describe('findOne', () => {
    it('should return a user when found', async () => {
      const user = { id: 'uuid-1', name: 'Alice', events: [] };
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await service.findOne('uuid-1');

      expect(result).toEqual(user);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        relations: ['events'],
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    const alice = { id: 'user-1', name: 'Alice' };
    const bob = { id: 'user-2', name: 'Bob' };

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete user with no events', async () => {
      const user = { id: 'user-1', name: 'Alice', events: [] };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.remove.mockResolvedValue(user);

      await service.remove('user-1');

      expect(mockEventRepository.remove).not.toHaveBeenCalled();
      expect(mockEventRepository.save).not.toHaveBeenCalled();
      expect(mockUserRepository.remove).toHaveBeenCalledWith(user);
    });

    it('should delete event when user is the only invitee', async () => {
      const event = {
        id: 'e1',
        title: 'Solo event',
        invitees: [alice],
      };
      const user = { ...alice, events: [event] };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockEventRepository.remove.mockResolvedValue(event);
      mockUserRepository.remove.mockResolvedValue(user);

      await service.remove('user-1');

      expect(mockEventRepository.remove).toHaveBeenCalledWith(event);
      expect(mockEventRepository.save).not.toHaveBeenCalled();
      expect(mockUserRepository.remove).toHaveBeenCalledWith(user);
    });

    it('should remove user from event invitees when event has other invitees', async () => {
      const event = {
        id: 'e1',
        title: 'Shared event',
        invitees: [alice, bob],
      };
      const user = { ...alice, events: [event] };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockEventRepository.save.mockResolvedValue({
        ...event,
        invitees: [bob],
      });
      mockUserRepository.remove.mockResolvedValue(user);

      await service.remove('user-1');

      expect(mockEventRepository.remove).not.toHaveBeenCalled();
      expect(mockEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'e1',
          invitees: [bob],
        }),
      );
      expect(mockUserRepository.remove).toHaveBeenCalledWith(user);
    });

    it('should handle mixed events: delete solo events and update shared events', async () => {
      const soloEvent = {
        id: 'e1',
        title: 'Solo',
        invitees: [alice],
      };
      const sharedEvent = {
        id: 'e2',
        title: 'Shared',
        invitees: [alice, bob],
      };
      const user = { ...alice, events: [soloEvent, sharedEvent] };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockEventRepository.remove.mockResolvedValue(soloEvent);
      mockEventRepository.save.mockResolvedValue({
        ...sharedEvent,
        invitees: [bob],
      });
      mockUserRepository.remove.mockResolvedValue(user);

      await service.remove('user-1');

      expect(mockEventRepository.remove).toHaveBeenCalledWith(soloEvent);
      expect(mockEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'e2',
          invitees: [bob],
        }),
      );
      expect(mockUserRepository.remove).toHaveBeenCalledWith(user);
    });
  });
});
