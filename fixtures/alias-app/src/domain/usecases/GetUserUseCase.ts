import { User, displayName } from '@/domain/entities/User';

export class GetUserUseCase {
  execute(id: string): User {
    const user: User = { id, name: 'Ada Lovelace' };
    return { ...user, name: displayName(user) };
  }
}
