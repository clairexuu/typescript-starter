import { Test, TestingModule } from '@nestjs/testing';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { EventStatus } from './event-status.enum';

describe('EventController', () => {
  let controller: EventController;
  const mockEventService = {
    create: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    mergeAllForUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventController],
      providers: [{ provide: EventService, useValue: mockEventService }],
    }).compile();

    controller = module.get<EventController>(EventController);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call eventService.create with the dto', async () => {
      const dto = {
        title: 'Meeting',
        status: EventStatus.TODO,
        startTime: '2025-01-01T14:00:00Z',
        endTime: '2025-01-01T15:00:00Z',
      };
      const event = { id: 'uuid-1', ...dto };
      mockEventService.create.mockResolvedValue(event);

      const result = await controller.create(dto);

      expect(mockEventService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(event);
    });
  });

  describe('findOne', () => {
    it('should call eventService.findOne with the id', async () => {
      const event = { id: 'uuid-1', title: 'Meeting' };
      mockEventService.findOne.mockResolvedValue(event);

      const result = await controller.findOne('uuid-1');

      expect(mockEventService.findOne).toHaveBeenCalledWith('uuid-1');
      expect(result).toEqual(event);
    });
  });

  describe('remove', () => {
    it('should call eventService.remove with the id', async () => {
      mockEventService.remove.mockResolvedValue(undefined);

      await controller.remove('uuid-1');

      expect(mockEventService.remove).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('mergeAll', () => {
    it('should call eventService.mergeAllForUser with the userId', async () => {
      const events = [{ id: 'merged-1', title: 'E1 | E2' }];
      mockEventService.mergeAllForUser.mockResolvedValue(events);

      const result = await controller.mergeAll('user-1');

      expect(mockEventService.mergeAllForUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(events);
    });
  });
});
