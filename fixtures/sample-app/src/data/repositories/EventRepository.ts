import { Event } from '../../domain/entities/Event';
import { apiClient } from '../../infrastructure/api/client';

export class EventRepository {
  async getAll(): Promise<Event[]> {
    const res = await apiClient.get('/events');
    return res.data;
  }
}
