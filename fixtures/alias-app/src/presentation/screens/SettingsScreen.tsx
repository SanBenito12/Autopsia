// VIOLACIÓN: presentation importando la capa data directamente (vía alias @/)
import { UserRepository } from '@/data/repositories/UserRepository';
import { GetUserUseCase } from '@/domain/usecases/GetUserUseCase';

export function SettingsScreen(): string {
  const repo = new UserRepository();
  const useCase = new GetUserUseCase();
  void repo.findById('1');
  return useCase.execute('1').name;
}
