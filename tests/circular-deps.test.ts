import { describe, expect, it } from 'vitest';
import { checkCircularDeps } from '../src/rules/circular-deps';
import { loadGraph, rel, SAMPLE_APP } from './helpers';

describe('circular-deps', () => {
  const { graph } = loadGraph(SAMPLE_APP);
  const violations = checkCircularDeps(graph);

  it('detecta exactamente 1 ciclo: helperA ↔ helperB', () => {
    expect(violations).toHaveLength(1);
    const [v] = violations;
    expect(v.rule).toBe('circular-deps');
    expect(v.severity).toBe('error');
    expect(v.message).toContain('2 archivos');
    expect(v.detail).toContain(rel('src', 'presentation', 'screens', 'helperA.ts'));
    expect(v.detail).toContain(rel('src', 'presentation', 'screens', 'helperB.ts'));
  });

  it('reporta el ciclo una sola vez aunque sea alcanzable desde ambos nodos', () => {
    const cycleViolations = violations.filter((v) => v.detail?.includes('helperA'));
    expect(cycleViolations).toHaveLength(1);
  });

  it('el detail describe el ciclo completo cerrado (A → B → A)', () => {
    const chain = violations[0].detail!.split(' → ');
    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe(chain[chain.length - 1]);
  });
});
