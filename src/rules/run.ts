import { AutopsiaConfig, FileNode, RuleLevel, Violation } from '../types';
import { checkDependencyDirection } from './dependency-direction';
import { checkDirectDataAccess } from './direct-data-access';
import { checkForbiddenExternal } from './forbidden-external';
import { checkCircularDeps } from './circular-deps';

/**
 * Ejecuta las reglas respetando la sección "rules" del config:
 *   "rules": { "dependency-direction": "error" | "warning" | "off" }
 * Default: todo "error" (el comportamiento de siempre). "warning" se
 * reporta pero no falla --ci; "off" ni siquiera corre la regla.
 */

export const ALL_RULES = [
  'dependency-direction',
  'direct-data-access',
  'forbidden-external',
  'circular-deps',
] as const;

export type RuleName = (typeof ALL_RULES)[number];

export function ruleLevel(config: AutopsiaConfig, rule: RuleName): RuleLevel {
  return config.rules?.[rule] ?? 'error';
}

export function runRules(graph: FileNode[], config: AutopsiaConfig): Violation[] {
  const runners: Record<RuleName, () => Violation[]> = {
    'dependency-direction': () => checkDependencyDirection(graph, config),
    'direct-data-access': () => checkDirectDataAccess(graph, config),
    'forbidden-external': () => checkForbiddenExternal(graph, config),
    'circular-deps': () => checkCircularDeps(graph),
  };

  const violations: Violation[] = [];
  for (const rule of ALL_RULES) {
    const level = ruleLevel(config, rule);
    if (level === 'off') continue;
    for (const v of runners[rule]()) {
      violations.push(level === 'warning' ? { ...v, severity: 'warning' } : v);
    }
  }
  return violations;
}
