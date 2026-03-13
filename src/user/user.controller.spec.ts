import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController', () => {
  let controller: UserController;
  const mockUserService = {
    create: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    }).compile();

    controller = module.get<UserController>(UserController);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call userService.create with the dto', async () => {
      const dto = { name: 'Alice' };
      const user = { id: 'uuid-1', name: 'Alice' };
      mockUserService.create.mockResolvedValue(user);

      const result = await controller.create(dto);

      expect(mockUserService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(user);
    });
  });

  describe('findOne', () => {
    it('should call userService.findOne with the id', async () => {
      const user = { id: 'uuid-1', name: 'Alice', events: [] };
      mockUserService.findOne.mockResolvedValue(user);

      const result = await controller.findOne('uuid-1');

      expect(mockUserService.findOne).toHaveBeenCalledWith('uuid-1');
      expect(result).toEqual(user);
    });
  });

  describe('remove', () => {
    it('should call userService.remove with the id', async () => {
      mockUserService.remove.mockResolvedValue(undefined);

      await controller.remove('uuid-1');

      expect(mockUserService.remove).toHaveBeenCalledWith('uuid-1');
    });
  });
});
