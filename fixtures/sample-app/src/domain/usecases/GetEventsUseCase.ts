import axios from 'axios';
import { Event } from '../entities/Event';
import { EventRepository } from '../../data/repositories/EventRepository';

export class GetEventsUseCase {
  constructor(private repo: EventRepository) {}
  async execute(): Promise<Event[]> {
    const extra = await axios.get('/health');
    return this.repo.getAll();
  }
}
