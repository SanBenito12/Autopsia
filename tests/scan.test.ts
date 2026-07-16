import { describe, expect, it } from 'vitest';
import { ScanResult } from '../src/types';
import { checkDependencyDirection } from '../src/rules/dependency-direction';
import { checkDirectDataAccess } from '../src/rules/direct-data-access';
import { checkForbiddenExternal } from '../src/rules/forbidden-external';
import { checkCircularDeps } from '../src/rules/circular-deps';
import { computeHealth } from '../src/reporter';
import { loadGraph, SAMPLE_APP } from './helpers';

// Réplica del pipeline de `autopsia scan` (src/index.ts) sobre el fixture.
function scan(root: string): ScanResult {
  const { graph, config } = loadGraph(root);

  const violations = [
    ...checkDependencyDirection(graph, config),
    ...checkDirectDataAccess(graph, config),
    ...checkForbiddenExternal(graph, config),
    ...checkCircularDeps(graph),
  ];

  const filesByLayer: Record<string, number> = {};
  for (const layer of config.layers) filesByLayer[layer.name] = 0;
  for (const node of graph) {
    if (node.layer) filesByLayer[node.layer] = (filesByLayer[node.layer] ?? 0) + 1;
  }

  const partial = {
    scannedAt: new Date().toISOString(),
    root,
    totalFiles: graph.length,
    filesByLayer,
    violations,
    graph,
  };

  return { ...partial, healthByLayer: computeHealth(partial) };
}

describe('scan completo del fixture sample-app', () => {
  const result = scan(SAMPLE_APP);

  it('analiza los 8 archivos del fixture', () => {
    expect(result.totalFiles).toBe(8);
    expect(result.graph).toHaveLength(8);
  });

  it('clasifica los archivos por capa', () => {
    expect(result.filesByLayer).toEqual({
      presentation: 4,
      domain: 2,
      data: 1,
      infrastructure: 1,
    });
  });

  it('todos los archivos del fixture quedan clasificados', () => {
    const classified = Object.values(result.filesByLayer).reduce((a, b) => a + b, 0);
    expect(classified).toBe(result.totalFiles);
  });

  it('encuentra las 5 violaciones esperadas', () => {
    expect(result.violations).toHaveLength(5);
    const byRule = new Map<string, number>();
    for (const v of result.violations) {
      byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
    }
    expect(byRule.get('dependency-direction')).toBe(2);
    expect(byRule.get('direct-data-access')).toBe(1);
    expect(byRule.get('forbidden-external')).toBe(1);
    expect(byRule.get('circular-deps')).toBe(1);
  });

  it('healthByLayer es coherente con las violaciones', () => {
    // presentation: 4 archivos, 2 con violaciones (HomeScreen, helperA) → 50%
    // domain: 2 archivos, 1 con violaciones (GetEventsUseCase) → 50%
    // data e infrastructure: sin violaciones → 100%
    expect(result.healthByLayer).toEqual({
      presentation: 50,
      domain: 50,
      data: 100,
      infrastructure: 100,
    });
  });

  it('la salud está siempre entre 0 y 100', () => {
    for (const pct of Object.values(result.healthByLayer)) {
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});
