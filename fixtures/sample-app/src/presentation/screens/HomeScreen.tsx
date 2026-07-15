import React from 'react';
import axios from 'axios';
import { EventRepository } from '../../data/repositories/EventRepository';
import { Event } from '../../domain/entities/Event';

export function HomeScreen() {
  const [events, setEvents] = React.useState<Event[]>([]);
  React.useEffect(() => {
    axios.get('/events').then((r) => setEvents(r.data));
  }, []);
  return null;
}
