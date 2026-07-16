import { describe, expect, it } from 'vitest';
import { checkDirectDataAccess } from '../src/rules/direct-data-access';
import { loadGraph, rel, SAMPLE_APP } from './helpers';

describe('direct-data-access', () => {
  const { graph, config } = loadGraph(SAMPLE_APP);
  const violations = checkDirectDataAccess(graph, config);

  it('detecta exactamente 1 violación: HomeScreen usando axios', () => {
    expect(violations).toHaveLength(1);
    const [v] = violations;
    expect(v.rule).toBe('direct-data-access');
    expect(v.severity).toBe('error');
    expect(v.file).toBe(rel('src', 'presentation', 'screens', 'HomeScreen.tsx'));
    expect(v.message).toContain('"axios"');
    expect(v.message).toContain('"presentation"');
  });

  it('no marca capas fuera de noDirectDataAccessIn (infrastructure usa axios y es válido)', () => {
    const files = violations.map((v) => v.file);
    expect(files).not.toContain(rel('src', 'infrastructure', 'api', 'client.ts'));
  });
});
