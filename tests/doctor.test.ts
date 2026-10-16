import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { diagnose } from '../src/doctor';
import { loadTsconfig } from '../src/tsconfig';
import { buildGraph } from '../src/scanner';
import { validateConfig } from '../src/analysis';
import { matchingLayers } from '../src/classifier';
import { AutopsiaConfig } from '../src/types';
let root: string;
const config: AutopsiaConfig = { layers: [{ name: 'app', files: ['App.tsx'] }], dataAccessModules: [], noDirectDataAccessIn: [], strict: true };
function write(file: string, value: unknown) { const dest = path.join(root, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value)); }
const cli = path.resolve('src/index.ts');
const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8', cwd: process.cwd(), env: { ...process.env, FORCE_COLOR: '0' } });
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-doctor-')); write('App.tsx', 'export const App = 1;'); write('autopsia.config.json', config); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('doctor and tsconfig readiness', () => {
  it('ready means complete analysis, not absence of dependency violations', () => {
    expect(diagnose(root)).toMatchObject({ schemaVersion: 1, status: 'ready', totalFiles: 1, issues: [] });
    expect(diagnose(root).typescriptVersion).toMatch(/^\d+\./);
    write('other.ts', 'export {};');
    expect(diagnose(root)).toMatchObject({ status: 'incomplete', coverage: { unclassifiedFiles: 1 } });
  });
  it('reports absent config with structure and never creates it', () => {
    fs.unlinkSync(path.join(root, 'autopsia.config.json')); write('src/domain/model.ts', 'export {};');
    const report = diagnose(root);
    expect(report.status).toBe('incomplete'); expect(report.issues[0].code).toBe('missing-config');
    expect(report.detected[0].name).toBe('domain'); expect(report.totalFiles).toBe(2);
    expect(fs.existsSync(path.join(root, 'autopsia.config.json'))).toBe(false);
  });
  it('detects malformed configuration and empty projects', () => {
    write('autopsia.config.json', '{'); expect(diagnose(root).status).toBe('error');
    write('autopsia.config.json', config); fs.unlinkSync(path.join(root, 'App.tsx'));
    expect(diagnose(root).issues.map(i => i.code)).toContain('empty-project');
  });
  it('reports missing and circular extends, but not application type errors', () => {
    write('tsconfig.json', { extends: '@example/missing' });
    expect(diagnose(root).issues.map(i => i.code)).toContain('tsconfig-error');
    write('tsconfig.json', { extends: './base.json' }); write('base.json', { extends: './tsconfig.json' });
    expect(loadTsconfig(root).issues.some(i => /circular/i.test(i.detail!))).toBe(true);
    write('tsconfig.json', {}); write('App.tsx', 'export const x: number = "not a number";');
    expect(diagnose(root).status).toBe('ready');
    write('tsconfig.json', '{"compilerOptions": {'); expect(diagnose(root).status).toBe('error');
  });
  it('resolves inherited aliases using TypeScript and explains unresolved targets', () => {
    write('base.json', { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } });
    write('tsconfig.json', { extends: './base.json' }); write('src/model.ts', 'export const model = 1;');
    write('App.tsx', "import { model } from '@/model'; import './missing';");
    const graph = buildGraph(root, config);
    expect(graph.find(n => n.path === 'App.tsx')!.dependencies![0].resolved).toBe(true);
    expect(diagnose(root).issues.filter(i => i.code === 'unresolved-import')).toHaveLength(1);
  });
  it('includes exact match and pattern evidence for ambiguities', () => {
    write('autopsia.config.json', { ...config, layers: [...config.layers, { name: 'broad', patterns: ['*.tsx'] }] });
    expect(diagnose(root).issues.find(i => i.code === 'ambiguous-layer')!.matches).toEqual([
      { layer: 'app', files: ['App.tsx'], patterns: [] }, { layer: 'broad', files: [], patterns: ['*.tsx'] },
    ]);
  });
  it('CLI supports both languages, stable JSON, global flags and documented exit codes', () => {
    for (const lang of ['en', 'es']) {
      const output = path.join(root, `${lang}.json`);
      const result = run(['--lang', lang, 'doctor', root, '-o', output]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(lang === 'en' ? 'Ready:' : 'Listo:');
    }
    expect(fs.readFileSync(path.join(root, 'en.json'), 'utf8')).toBe(fs.readFileSync(path.join(root, 'es.json'), 'utf8'));
    write('tsconfig.json', { extends: './missing.json' });
    expect(run(['doctor', root, '--lang', 'es']).status).toBe(1);
    expect(run(['scan', root, '--ci']).status).toBe(1);
    expect(run(['scan', root]).status).toBe(0);
    expect(run(['doctor', root, '--lang', 'fr']).status).toBe(2);
    expect(run(['doctor', root, '--tsconfig', path.join(root, 'absent.json')]).status).toBe(2);
    expect(run(['init', root, '--preset', 'unknown', '--dry-run']).status).toBe(2);
    write('autopsia.config.json', '{'); expect(run(['doctor', root]).status).toBe(2);
  }, 30000);
});

describe('exact file paths', () => {
  it('does not change existing pattern semantics or match nested App.tsx', () => {
    expect(matchingLayers('App.tsx', config)).toEqual(['app']);
    expect(matchingLayers('src/App.tsx', config)).toEqual([]);
    expect(matchingLayers('app.tsx', config)).toEqual([]);
    expect(matchingLayers('src\\App.tsx', { ...config, layers: [{ name: 'nested', files: ['src/App.tsx'] }] })).toEqual(['nested']);
    expect(validateConfig(config)).toEqual([]);
  });
  it.each(['/App.tsx', '../App.tsx', './App.tsx', 'src//App.tsx', 'C:/App.tsx', 'src\\App.tsx', '*.tsx', 'src/../App.tsx'])('rejects unsafe or nonexact path %s', file => {
    expect(validateConfig({ ...config, layers: [{ name: 'app', files: [file] }] })).not.toHaveLength(0);
  });
});
