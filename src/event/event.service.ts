import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Event } from './event.entity';
import { User } from '../user/user.entity';
import { EventStatus } from './event-status.enum';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async create(createEventDto: CreateEventDto): Promise<Event> {
    const { inviteeIds, ...eventData } = createEventDto;

    const event = this.eventRepository.create(eventData);

    if (inviteeIds && inviteeIds.length > 0) {
      const users = await this.userRepository.find({
        where: { id: In(inviteeIds) },
      });
      if (users.length !== inviteeIds.length) {
        throw new NotFoundException('One or more invitee IDs not found');
      }
      event.invitees = users;
    }

    return this.eventRepository.save(event);
  }

  async findOne(id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['invitees'],
    });
    if (!event) {
      throw new NotFoundException(`Event with id "${id}" not found`);
    }
    return event;
  }

  async remove(id: string): Promise<void> {
    const event = await this.findOne(id);
    await this.eventRepository.remove(event);
  }

  async mergeAllForUser(userId: string): Promise<Event[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['events', 'events.invitees'],
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }

    const events = user.events;
    if (events.length <= 1) {
      return events;
    }

    // Sort by startTime ascending
    events.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    // Group overlapping events
    const groups: Event[][] = [];
    let currentGroup: Event[] = [events[0]];

    for (let i = 1; i < events.length; i++) {
      const currentGroupMaxEnd = Math.max(
        ...currentGroup.map((e) => new Date(e.endTime).getTime()),
      );
      if (new Date(events[i].startTime).getTime() <= currentGroupMaxEnd) {
        currentGroup.push(events[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [events[i]];
      }
    }
    groups.push(currentGroup);

    // Merge overlapping groups in a transaction
    await this.dataSource.transaction(async (manager) => {
      for (const group of groups) {
        if (group.length <= 1) continue;

        const mergedTitle = group.map((e) => e.title).join(' | ');
        const mergedDescription =
          group
            .map((e) => e.description)
            .filter(Boolean)
            .join(' | ') || null;
        const mergedStartTime = new Date(
          Math.min(...group.map((e) => new Date(e.startTime).getTime())),
        );
        const mergedEndTime = new Date(
          Math.max(...group.map((e) => new Date(e.endTime).getTime())),
        );
        const mergedStatus = this.pickMergedStatus(group);
        const mergedInvitees = this.deduplicateInvitees(group);

        const mergedEvent = manager.create(Event, {
          title: mergedTitle,
          description: mergedDescription,
          status: mergedStatus,
          startTime: mergedStartTime,
          endTime: mergedEndTime,
          invitees: mergedInvitees,
        });
        await manager.save(Event, mergedEvent);

        // Delete original events
        await manager.remove(Event, group);
      }
    });

    // Re-fetch updated events
    const updatedUser = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['events', 'events.invitees'],
    });
    return updatedUser.events;
  }

  private pickMergedStatus(events: Event[]): EventStatus {
    const statuses = events.map((e) => e.status);
    if (statuses.includes(EventStatus.IN_PROGRESS))
      return EventStatus.IN_PROGRESS;
    if (statuses.includes(EventStatus.TODO)) return EventStatus.TODO;
    return EventStatus.COMPLETED;
  }

  private deduplicateInvitees(events: Event[]): User[] {
    const seen = new Map<string, User>();
    for (const event of events) {
      for (const user of event.invitees) {
        if (!seen.has(user.id)) {
          seen.set(user.id, user);
        }
      }
    }
    return Array.from(seen.values());
  }
}
