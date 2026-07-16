import { describe, expect, it } from 'vitest';
import { checkForbiddenExternal } from '../src/rules/forbidden-external';
import { loadGraph, rel, SAMPLE_APP } from './helpers';

describe('forbidden-external', () => {
  const { graph, config } = loadGraph(SAMPLE_APP);
  const violations = checkForbiddenExternal(graph, config);

  it('detecta exactamente 1 violación: usecase de domain importando axios', () => {
    expect(violations).toHaveLength(1);
    const [v] = violations;
    expect(v.rule).toBe('forbidden-external');
    expect(v.severity).toBe('error');
    expect(v.file).toBe(rel('src', 'domain', 'usecases', 'GetEventsUseCase.ts'));
    expect(v.message).toContain('"axios"');
    expect(v.message).toContain('"domain"');
  });

  it('no marca capas sin forbiddenExternal (presentation importa react y axios sin restricción)', () => {
    const files = violations.map((v) => v.file);
    expect(files).not.toContain(rel('src', 'presentation', 'screens', 'HomeScreen.tsx'));
  });
});
