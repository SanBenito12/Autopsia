import { describe, expect, it } from 'vitest';
import { checkDependencyDirection } from '../src/rules/dependency-direction';
import { loadGraph, rel, SAMPLE_APP } from './helpers';

describe('dependency-direction', () => {
  const { graph, config } = loadGraph(SAMPLE_APP);
  const violations = checkDependencyDirection(graph, config);

  it('detecta exactamente 2 violaciones en el fixture', () => {
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.rule === 'dependency-direction')).toBe(true);
    expect(violations.every((v) => v.severity === 'error')).toBe(true);
  });

  it('detecta domain → data (usecase importando repositorio)', () => {
    const v = violations.find(
      (v) => v.file === rel('src', 'domain', 'usecases', 'GetEventsUseCase.ts')
    );
    expect(v).toBeDefined();
    expect(v!.message).toContain('"domain" no puede depender de "data"');
    expect(v!.detail).toContain(rel('src', 'data', 'repositories', 'EventRepository.ts'));
  });

  it('detecta presentation → data (screen importando repositorio)', () => {
    const v = violations.find(
      (v) => v.file === rel('src', 'presentation', 'screens', 'HomeScreen.tsx')
    );
    expect(v).toBeDefined();
    expect(v!.message).toContain('"presentation" no puede depender de "data"');
  });
});
