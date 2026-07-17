import { spawnSync } from 'child_process';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_APP } from './helpers';

const TSX = path.resolve(__dirname, '../node_modules/.bin/tsx');
const CLI = path.resolve(__dirname, '../src/index.ts');

function runScan(args: string[] = []): { status: number | null; stdout: string } {
  const res = spawnSync(TSX, [CLI, 'scan', ...args], {
    cwd: SAMPLE_APP,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  return { status: res.status, stdout: res.stdout };
}

describe('autopsia scan sin argumento', () => {
  it('usa el directorio actual y produce el mismo reporte que "scan ."', { timeout: 60_000 }, () => {
    const sinArg = runScan();
    const conPunto = runScan(['.']);

    expect(sinArg.status).toBe(0);
    expect(sinArg.stdout).toContain('8 archivos analizados');
    expect(sinArg.stdout).toContain('Total: 5 violaciones');

    // mismo cwd, mismo default: el reporte debe ser idéntico
    expect(sinArg.stdout).toBe(conPunto.stdout);
  });
});
