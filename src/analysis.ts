import { matchingLayers } from './classifier';
import { ALL_RULES } from './rules/run';
import { AnalysisCoverage, AnalysisIssue, AutopsiaConfig, FileNode } from './types';

/** Valida errores de configuración que volverían ambiguo o incompleto el scan. */
export function validateConfig(config: AutopsiaConfig): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  if (!config || !Array.isArray(config.layers) || config.layers.length === 0) {
    return [{ kind: 'invalid-config', message: '"layers" debe contener al menos una capa' }];
  }
  if (!Array.isArray(config.dataAccessModules)) {
    issues.push({ kind: 'invalid-config', message: '"dataAccessModules" debe ser un arreglo' });
  }
  if (!Array.isArray(config.noDirectDataAccessIn)) {
    issues.push({ kind: 'invalid-config', message: '"noDirectDataAccessIn" debe ser un arreglo' });
  }

  const names = new Set<string>();
  for (const layer of config.layers) {
    if (!layer || typeof layer !== 'object') {
      issues.push({ kind: 'invalid-config', message: 'Cada entrada de "layers" debe ser un objeto' });
      continue;
    }
    if (!layer.name || typeof layer.name !== 'string') {
      issues.push({ kind: 'invalid-config', message: 'Cada capa debe tener un nombre' });
      continue;
    }
    if (names.has(layer.name)) {
      issues.push({ kind: 'invalid-config', message: `La capa "${layer.name}" está repetida` });
    }
    names.add(layer.name);
    if (!Array.isArray(layer.patterns) || layer.patterns.length === 0) {
      issues.push({ kind: 'invalid-config', message: `La capa "${layer.name}" no tiene patterns` });
    }
    if (layer.allowedDependencies !== undefined && !Array.isArray(layer.allowedDependencies)) {
      issues.push({
        kind: 'invalid-config',
        message: `allowedDependencies de "${layer.name}" debe ser un arreglo`,
      });
    }
  }

  for (const layer of config.layers) {
    if (!layer || typeof layer !== 'object' || !Array.isArray(layer.allowedDependencies)) continue;
    for (const dependency of layer.allowedDependencies) {
      if (!names.has(dependency)) {
        issues.push({
          kind: 'invalid-config',
          message: `La capa "${layer.name}" permite una capa inexistente: "${dependency}"`,
        });
      }
    }
  }
  for (const layer of Array.isArray(config.noDirectDataAccessIn) ? config.noDirectDataAccessIn : []) {
    if (!names.has(layer)) {
      issues.push({
        kind: 'invalid-config',
        message: `noDirectDataAccessIn contiene una capa inexistente: "${layer}"`,
      });
    }
  }
  if (config.rules !== undefined && (typeof config.rules !== 'object' || config.rules === null)) {
    issues.push({ kind: 'invalid-config', message: '"rules" debe ser un objeto' });
  }
  for (const [rule, level] of Object.entries(
    config.rules && typeof config.rules === 'object' ? config.rules : {},
  )) {
    if (!(ALL_RULES as readonly string[]).includes(rule)) {
      issues.push({ kind: 'invalid-config', message: `Regla desconocida en config: "${rule}"` });
    }
    if (!['error', 'warning', 'off'].includes(level)) {
      issues.push({ kind: 'invalid-config', message: `Nivel inválido para "${rule}": "${level}"` });
    }
  }
  return issues;
}

export function computeAnalysisCoverage(
  graph: FileNode[],
  config: AutopsiaConfig,
  configIssues: AnalysisIssue[] = validateConfig(config),
): AnalysisCoverage {
  const issues = [...configIssues];
  let classifiedFiles = 0;
  let ambiguousFiles = 0;
  let totalDependencies = 0;
  let resolvedInternalDependencies = 0;
  let unresolvedInternalDependencies = 0;

  for (const node of graph) {
    const matches = matchingLayers(node.path, config);
    if (node.layer) classifiedFiles++;
    else {
      issues.push({
        kind: 'unclassified-file',
        file: node.path,
        message: 'El archivo no pertenece a ninguna capa',
      });
    }
    if (matches.length > 1) {
      ambiguousFiles++;
      issues.push({
        kind: 'ambiguous-layer',
        file: node.path,
        message: `El archivo coincide con varias capas: ${matches.join(', ')}`,
        detail: `Se usó "${matches[0]}" por ser la primera coincidencia`,
      });
    }

    for (const dependency of node.dependencies ?? []) {
      totalDependencies++;
      if (dependency.external) continue;
      if (dependency.resolved) resolvedInternalDependencies++;
      else {
        unresolvedInternalDependencies++;
        issues.push({
          kind: 'unresolved-import',
          file: node.path,
          line: dependency.line,
          message: `No se pudo resolver el import interno "${dependency.specifier}"`,
          detail: `${dependency.kind} en línea ${dependency.line}`,
        });
      }
    }
  }

  const unclassifiedFiles = graph.length - classifiedFiles;
  return {
    classifiedFiles,
    unclassifiedFiles,
    totalDependencies,
    resolvedInternalDependencies,
    unresolvedInternalDependencies,
    configErrors: configIssues.length,
    ambiguousFiles,
    complete:
      configIssues.length === 0 &&
      unclassifiedFiles === 0 &&
      ambiguousFiles === 0 &&
      unresolvedInternalDependencies === 0,
    issues,
  };
}
