import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const cli = path.resolve(__dirname, '../src/index.ts');
let root: string;
const config = { strict: true, layers: [{ name: 'ui', patterns: ['src/*'] }], dataAccessModules: ['axios'], noDirectDataAccessIn: ['ui'] };
function write(file: string, text: string): void {
  const dest = path.join(root, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
}
function scan(...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', cli, 'scan', root, ...args], { encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-cli-strict-'));
  write('autopsia.config.json', JSON.stringify(config));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('contrato CLI de v0.4', () => {
  it.each(['', 'const target = "./missing"; import(target);'])('falla CI para análisis incompleto: %s', (source) => {
    if (source) write('src/screen.ts', source);
    const result = scan('--ci');
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).not.toContain('Arquitectura verificada');
  });
  it('pasa un proyecto sano y rechaza configuración inválida con exit 2', () => {
    write('src/screen.ts', 'export {};');
    expect(scan('--ci').status).toBe(0);
    write('autopsia.config.json', JSON.stringify({ ...config, strict: 'true' }));
    expect(scan('--ci').status).toBe(2);
  });
  it('no falla CI por warnings y respeta baseline sin tolerar duplicados nuevos', { timeout: 60_000 }, () => {
    write('src/screen.ts', 'import axios from "axios";');
    write('autopsia.config.json', JSON.stringify({ ...config, rules: { 'direct-data-access': 'warning' } }));
    expect(scan('--ci').status).toBe(0);
    write('autopsia.config.json', JSON.stringify(config));
    expect(scan('--update-baseline').status).toBe(0);
    expect(scan('--ci').status).toBe(0);
    write('src/screen.ts', 'import axios from "axios";\nconst second = require("axios");');
    expect(scan('--ci').status).toBe(1);
  });
  it('compara JSON e incluye deuda tolerada; --compare no cambia la política de CI', { timeout: 60_000 }, () => {
    write('src/screen.ts', 'import axios from "axios";');
    const before = path.join(root, 'before.json');
    const after = path.join(root, 'after.json');
    expect(scan('-o', before, '--update-baseline').status).toBe(0);
    expect(scan('--compare', before, '-o', after, '--ci').status).toBe(0);
    let result = JSON.parse(fs.readFileSync(after, 'utf8'));
    expect(result.comparison.persistent).toHaveLength(1);
    write('src/screen.ts', 'export {};');
    expect(scan('--compare', before, '-o', after, '--ci').status).toBe(0);
    result = JSON.parse(fs.readFileSync(after, 'utf8'));
    expect(result.comparison.resolved).toHaveLength(1);
    write('invalid.json', '{}');
    expect(scan('--compare', path.join(root, 'invalid.json')).status).toBe(2);
  });
});
