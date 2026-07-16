import { User } from '@/domain/entities/User';

export class UserRepository {
  async findById(id: string): Promise<User> {
    return { id, name: 'Ada Lovelace' };
  }
}
