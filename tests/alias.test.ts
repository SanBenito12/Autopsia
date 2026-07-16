import { describe, expect, it } from 'vitest';
import { checkDependencyDirection } from '../src/rules/dependency-direction';
import { ALIAS_APP, loadGraph, rel } from './helpers';

describe('resolución de path aliases (@/*) vía tsconfig del proyecto', () => {
  const { graph, config } = loadGraph(ALIAS_APP);

  it('resuelve los imports @/ como imports internos, no externos', () => {
    const screen = graph.find(
      (n) => n.path === rel('src', 'presentation', 'screens', 'SettingsScreen.tsx')
    );
    expect(screen).toBeDefined();
    expect(screen!.internalImports).toContain(
      rel('src', 'data', 'repositories', 'UserRepository.ts')
    );
    expect(screen!.internalImports).toContain(
      rel('src', 'domain', 'usecases', 'GetUserUseCase.ts')
    );
    expect(screen!.externalImports).toHaveLength(0);
  });

  it('las reglas ven la violación presentation → data a través del alias', () => {
    const violations = checkDependencyDirection(graph, config);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(rel('src', 'presentation', 'screens', 'SettingsScreen.tsx'));
    expect(violations[0].message).toContain('"presentation" no puede depender de "data"');
  });
});
