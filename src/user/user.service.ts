import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Event } from '../event/event.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['events'],
    });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    return user;
  }

  async remove(id: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['events', 'events.invitees'],
    });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    for (const event of user.events) {
      if (event.invitees.length === 1) {
        // This user is the only invitee — delete the event
        await this.eventRepository.remove(event);
      } else {
        // Remove this user from the event's invitees
        event.invitees = event.invitees.filter((u) => u.id !== id);
        await this.eventRepository.save(event);
      }
    }

    await this.userRepository.remove(user);
  }
}
