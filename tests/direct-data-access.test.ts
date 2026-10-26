import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { checkDirectDataAccess } from '../src/rules/direct-data-access';
import { buildGraph } from '../src/scanner';
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

  it('detecta llamadas globales directas a fetch() en pantallas como LoginScreen y respeta autopsia-ignore', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-fetch-'));
    try {
      const loginPath = path.join(tmp, 'src/presentation/screens/LoginScreen.tsx');
      fs.mkdirSync(path.dirname(loginPath), { recursive: true });
      fs.writeFileSync(
        loginPath,
        `export async function LoginScreen() {
  const res = await fetch('https://api.example.com/login');
  // autopsia-ignore-next-line direct-data-access -- healthcheck puntual
  await globalThis.fetch('https://api.example.com/ping');
  return res;
}
`
      );
      const scanned = buildGraph(tmp, config);
      const found = checkDirectDataAccess(scanned, config);
      const active = found.filter((v) => !v.suppressed);
      const suppressed = found.filter((v) => v.suppressed);
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({
        rule: 'direct-data-access',
        line: 2,
      });
      expect(active[0].message).toContain('"fetch()"');
      expect(suppressed).toHaveLength(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
