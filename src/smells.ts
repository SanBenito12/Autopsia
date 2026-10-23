import { format, MessageKey, MessageParams } from './i18n';
import { ruleLevel, ALL_RULES } from './rules/run';
import { AnalysisIssue, AutopsiaConfig, FileNode } from './types';

/**
 * Configuraciones que no son inválidas pero pueden dar un resultado limpio
 * aunque la arquitectura no lo esté. No bloquean el análisis: avisan.
 */
type Role = 'presentation' | 'domain' | 'data' | 'composition';

const ROLES: [Role, RegExp][] = [
  ['presentation', /^(presentation|ui|screens?|views?|components)$/i],
  ['domain', /^(domain|core|entities|model|business)$/i],
  ['data', /^(data|infrastructure|infra|api|services|repositories|network|persistence)$/i],
  ['composition', /^(composition|app|di|main|bootstrap|root)$/i],
];
const roleOf = (name: string): Role | undefined => ROLES.find(([, re]) => re.test(name))?.[0];
const ARCHITECTURE_RULES = ['dependency-direction', 'direct-data-access', 'forbidden-external', 'circular-deps'];
const CATCH_ALL = /^(\*|src\/?\*?|\.\/?\*?|src\/\*\*?)$/;
/** Por debajo de esta fracción de archivos, la capa de dominio se considera vacía de lógica. */
const THIN_DOMAIN_SHARE = 0.05;
const THIN_DOMAIN_MIN_FILES = 50;

function smell(code: MessageKey, params: MessageParams = {}): AnalysisIssue {
  return { kind: 'config-smell', diagnostic: { message: { code, params } }, message: format(code, params, 'es') };
}

export function detectConfigSmells(graph: FileNode[], config: AutopsiaConfig): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const layers = config.layers ?? [];
  const files = new Map<string, number>();
  for (const node of graph) if (node.layer) files.set(node.layer, (files.get(node.layer) ?? 0) + 1);
  const classified = [...files.values()].reduce((a, b) => a + b, 0);

  for (const layer of layers) {
    const role = roleOf(layer.name);
    const allowed = layer.allowedDependencies;
    if (allowed === undefined && role !== 'composition') {
      issues.push(smell('smell.unrestricted', { p0: layer.name }));
    }
    for (const target of allowed ?? []) {
      const targetRole = roleOf(target);
      if (role === 'presentation' && targetRole === 'data') issues.push(smell('smell.uiToData', { p0: layer.name, p1: target }));
      if (role === 'domain' && (targetRole === 'presentation' || targetRole === 'data')) {
        issues.push(smell('smell.domainOutward', { p0: layer.name, p1: target }));
      }
    }
    for (const pattern of layer.patterns ?? []) {
      if (CATCH_ALL.test(pattern.trim())) issues.push(smell('smell.catchAll', { p0: layer.name, p1: pattern }));
    }
    const count = files.get(layer.name) ?? 0;
    if (graph.length > 0 && count === 0) issues.push(smell('smell.emptyLayer', { p0: layer.name }));
    else if (role === 'domain' && classified >= THIN_DOMAIN_MIN_FILES && count / classified < THIN_DOMAIN_SHARE) {
      issues.push(smell('smell.thinDomain', { p0: layer.name, p1: count, p2: classified }));
    }
  }

  const uiLayers = layers.filter((l) => roleOf(l.name) === 'presentation').map((l) => l.name);
  if (uiLayers.length > 0 && Array.isArray(config.noDirectDataAccessIn) && !uiLayers.some((l) => config.noDirectDataAccessIn.includes(l))) {
    issues.push(smell('smell.noDataGuard', { p0: uiLayers.join(', ') }));
  }
  if (Array.isArray(config.dataAccessModules) && config.dataAccessModules.length === 0) {
    issues.push(smell('smell.noDataModules'));
  }
  for (const rule of ALL_RULES) {
    if (!ARCHITECTURE_RULES.includes(rule)) continue;
    const level = ruleLevel(config, rule);
    if (level !== 'error') issues.push(smell(level === 'off' ? 'smell.ruleOff' : 'smell.ruleWarning', { p0: rule }));
  }
  return issues;
}
