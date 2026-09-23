import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { en, es, present, setLocale } from '../src/i18n';
import { runRules } from '../src/rules/run';
import { applyBaseline, toEntry } from '../src/baseline';
import { compareReports } from '../src/compare';
import { generateHtml } from '../src/viewer';
import { computeAnalysisCoverage } from '../src/analysis';
import { loadGraph, SAMPLE_APP } from './helpers';
import type { ScanResult } from '../src/types';

const cli = path.resolve(__dirname, '../src/index.ts');
const previous: ScanResult = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v0.4-report.json'), 'utf8'));
const temp: string[] = [];
const run = (args: string[], cwd = SAMPLE_APP) => spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
  cwd, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' },
});
function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-language-'));
  fs.cpSync(SAMPLE_APP, dir, { recursive: true });
  temp.push(dir);
  return dir;
}
afterEach(() => { setLocale('en'); for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('localized presentation and v0.4 compatibility', () => {
  it('catalogs have the same keys and placeholders', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      const slots = (s: string) => [...s.matchAll(/\{p\d+\}/g)].map(m => m[0]).sort();
      expect(slots(en[key]), key).toEqual(slots(es[key]));
    }
  });
  it('matches actual 0.4 report identities, preserves duplicates, and keeps legacy display text', () => {
    const { graph, config } = loadGraph(SAMPLE_APP);
    const violations = runRules(graph, config);
    expect(violations.map(toEntry)).toEqual(previous.violations.map(toEntry));
    const baseline = { version: 1 as const, updatedAt: '', violations: previous.violations.map(toEntry) };
    for (const lang of ['en', 'es'] as const) {
      setLocale(lang);
      expect(applyBaseline(violations, baseline).fresh).toHaveLength(0);
      expect(applyBaseline([...violations, violations[0]], baseline).fresh).toHaveLength(1);
      const current = { ...previous, violations };
      expect(compareReports(previous, current).added).toHaveLength(0);
      expect(compareReports(previous, current).resolved).toHaveLength(0);
      expect(present(previous.violations[0]).message).toBe(previous.violations[0].message);
    }
  });
  it('translates HTML without changing violation edges or canonical objects', () => {
    const { graph, config } = loadGraph(SAMPLE_APP);
    const report = { ...previous, graph, violations: runRules(graph, config), analysis: computeAnalysisCoverage(graph, config) };
    const original = JSON.stringify(report);
    const payload = (html: string) => JSON.parse(html.match(/id="autopsia-data" type="application\/json">([\s\S]*?)<\/script>/)![1]);
    setLocale('en'); const english = generateHtml(report);
    setLocale('es'); const spanish = generateHtml(report);
    expect(english).toContain('<html lang="en">');
    expect(spanish).toContain('<html lang="es">');
    expect(payload(english).violationEdges).toEqual(payload(spanish).violationEdges);
    expect(payload(english).violationEdges.length).toBeGreaterThan(0);
    expect(payload(english).result.violations[0].message).toContain('cannot depend');
    expect(payload(spanish).result.violations[0].message).toContain('no puede depender');
    expect(JSON.stringify(report)).toBe(original);
    expect(english).not.toMatch(/<script[^>]+src=/i);
    const hostile = { ...report, root: '</script><img src=x onerror=alert(1)>' };
    expect(generateHtml(hostile)).not.toContain('<img src=x');
  });
  it('defaults to English, accepts language on either side, and rejects invalid values with help', { timeout: 60000 }, () => {
    expect(run(['--help']).stdout).toContain('Output language');
    for (const args of [['--lang', 'es', 'scan', '--help'], ['scan', '--help', '--lang=es']]) {
      const result = run(args);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Mostrar ayuda');
      expect(result.stdout).toContain('--lang');
    }
    for (const args of [['scan', '--lang', 'fr'], ['--lang'], ['--lang=fr', '--help']]) {
      const result = run(args);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Invalid language');
      expect(result.stdout).toContain('Usage:');
    }
    expect(run(['scan', '/autopsia-path-that-does-not-exist', '--lang', 'es']).stderr).toContain('La ruta no existe');
  });
  it('initializes in both languages and localizes configuration errors', { timeout: 60000 }, () => {
    const root = workspace();
    for (const lang of ['en', 'es']) {
      const result = run(['init', root, '--force', '--lang', lang]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(lang === 'en' ? 'Detected layers' : 'Capas detectadas');
    }
    fs.writeFileSync(path.join(root, 'autopsia.config.json'), '{}');
    expect(run(['scan', root]).stderr).toContain('"layers" must contain at least one layer');
    expect(run(['scan', root, '--lang', 'es']).stderr).toContain('"layers" debe contener al menos una capa');
  });
  it('produces equal canonical JSON and CI decisions across languages, including a v1 baseline', { timeout: 60000 }, () => {
    const root = workspace();
    const english = path.join(root, 'en.json'), spanish = path.join(root, 'es.json');
    expect(run(['scan', root, '--ci', '-o', english]).status).toBe(1);
    expect(run(['scan', root, '--ci', '--lang', 'es', '-o', spanish]).status).toBe(1);
    const clean = (file: string) => { const report = JSON.parse(fs.readFileSync(file, 'utf8')); delete report.scannedAt; return report; };
    expect(clean(english)).toEqual(clean(spanish));
    fs.writeFileSync(path.join(root, 'autopsia-baseline.json'), JSON.stringify({ version: 1, updatedAt: '', violations: previous.violations.map(toEntry) }));
    for (const lang of ['en', 'es']) {
      const result = run(['scan', root, '--ci', '--lang', lang, '--compare', english]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(lang === 'en' ? '0 new · 0 resolved · 5 persistent' : '0 nuevas · 0 resueltas · 5 persistentes');
    }
    const baseline = run(['scan', root, '--update-baseline', '--lang', 'es']);
    expect(baseline.stdout).toContain('Baseline guardado');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'autopsia-baseline.json'), 'utf8')).violations).toEqual(previous.violations.map(toEntry));
  });
});
