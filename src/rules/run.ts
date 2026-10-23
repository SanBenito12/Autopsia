import { AutopsiaConfig, FileNode, RuleLevel, Violation } from '../types';
import { checkDependencyDirection } from './dependency-direction';
import { checkDirectDataAccess } from './direct-data-access';
import { checkForbiddenExternal } from './forbidden-external';
import { checkCircularDeps } from './circular-deps';
import { checkFeatureBoundaries } from './feature-boundaries';
import { checkCodeFacts } from './react-native';

/**
 * Ejecuta las reglas respetando la sección "rules" del config:
 *   "rules": { "dependency-direction": "error" | "warning" | "off" }
 * Default: "error" para las reglas de arquitectura y "warning" para las de
 * calidad de React Native. "warning" se reporta pero no falla --ci; "off" ni
 * siquiera corre la regla.
 */

export const ALL_RULES = [
  'dependency-direction',
  'direct-data-access',
  'forbidden-external',
  'circular-deps',
  'feature-boundaries',
  'scrollview-map',
  'flatlist-performance',
  'component-size',
] as const;

export type RuleName = (typeof ALL_RULES)[number];

/** Las reglas de calidad son recomendaciones: avisan sin romper el CI salvo que se pidan como error. */
const DEFAULT_LEVELS: Partial<Record<RuleName, RuleLevel>> = {
  'scrollview-map': 'warning',
  'flatlist-performance': 'warning',
  'component-size': 'warning',
};

export const defaultLevel = (rule: RuleName): RuleLevel => DEFAULT_LEVELS[rule] ?? 'error';

export function ruleLevel(config: AutopsiaConfig, rule: RuleName): RuleLevel {
  return config.rules?.[rule] ?? defaultLevel(rule);
}

export function runRules(graph: FileNode[], config: AutopsiaConfig): Violation[] {
  const runners: Record<RuleName, () => Violation[]> = {
    'dependency-direction': () => checkDependencyDirection(graph, config),
    'direct-data-access': () => checkDirectDataAccess(graph, config),
    'forbidden-external': () => checkForbiddenExternal(graph, config),
    'circular-deps': () => checkCircularDeps(graph),
    'feature-boundaries': () => checkFeatureBoundaries(graph, config),
    'scrollview-map': () => checkCodeFacts(graph, 'scrollview-map'),
    'flatlist-performance': () => checkCodeFacts(graph, 'flatlist-performance'),
    'component-size': () => checkCodeFacts(graph, 'component-size'),
  };

  const violations: Violation[] = [];
  for (const rule of ALL_RULES) {
    const level = ruleLevel(config, rule);
    if (level === 'off') continue;
    for (const v of runners[rule]()) {
      violations.push({ ...v, severity: level });
    }
  }
  return violations;
}
