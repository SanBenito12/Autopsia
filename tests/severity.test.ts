import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runRules, ruleLevel, ALL_RULES } from '../src/rules/run';
import { buildConfig, detectLayers, initProject } from '../src/init';
import { AutopsiaConfig } from '../src/types';
import { loadGraph, SAMPLE_APP } from './helpers';

describe('severidad configurable por regla', () => {
  const { graph, config: baseConfig } = loadGraph(SAMPLE_APP);

  function withRules(rules: AutopsiaConfig['rules']): AutopsiaConfig {
    return { ...baseConfig, rules };
  }

  it('sin sección rules todo corre como error (comportamiento v0.1)', () => {
    const violations = runRules(graph, baseConfig);
    expect(violations).toHaveLength(5);
    expect(violations.every((v) => v.severity === 'error')).toBe(true);
    for (const rule of ALL_RULES) expect(ruleLevel(baseConfig, rule)).toBe('error');
  });

  it('nivel "error" explícito equivale al default', () => {
    const violations = runRules(
      graph,
      withRules(Object.fromEntries(ALL_RULES.map((r) => [r, 'error' as const])))
    );
    expect(violations).toHaveLength(5);
    expect(violations.every((v) => v.severity === 'error')).toBe(true);
  });

  it('nivel "warning" reporta la violación pero sin severidad error (no falla --ci)', () => {
    const violations = runRules(graph, withRules({ 'dependency-direction': 'warning' }));
    expect(violations).toHaveLength(5);

    const direction = violations.filter((v) => v.rule === 'dependency-direction');
    expect(direction).toHaveLength(2);
    expect(direction.every((v) => v.severity === 'warning')).toBe(true);

    // el resto sigue en error
    const others = violations.filter((v) => v.rule !== 'dependency-direction');
    expect(others.every((v) => v.severity === 'error')).toBe(true);
  });

  it('con todas las reglas en "warning" no queda ninguna violación que falle --ci', () => {
    const violations = runRules(
      graph,
      withRules(Object.fromEntries(ALL_RULES.map((r) => [r, 'warning' as const])))
    );
    expect(violations).toHaveLength(5);
    expect(violations.some((v) => v.severity === 'error')).toBe(false);
  });

  it('nivel "off" no corre la regla', () => {
    const violations = runRules(graph, withRules({ 'circular-deps': 'off' }));
    expect(violations).toHaveLength(4);
    expect(violations.some((v) => v.rule === 'circular-deps')).toBe(false);
  });
});

describe('autopsia init genera la sección rules', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-rules-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('buildConfig incluye todas las reglas con default "error" explícito', () => {
    fs.mkdirSync(path.join(tmpRoot, 'src/domain'), { recursive: true });
    const config = buildConfig(detectLayers(tmpRoot));
    expect(config.rules).toEqual({
      'dependency-direction': 'error',
      'direct-data-access': 'error',
      'forbidden-external': 'error',
      'circular-deps': 'error',
    });
  });

  it('el config escrito en disco incluye la sección rules', () => {
    fs.mkdirSync(path.join(tmpRoot, 'src/presentation'), { recursive: true });
    initProject(tmpRoot);
    const written: AutopsiaConfig = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, 'autopsia.config.json'), 'utf-8')
    );
    expect(Object.keys(written.rules ?? {})).toEqual([...ALL_RULES]);
  });
});
