import { matchingLayers } from './classifier';
import { ALL_RULES } from './rules/run';
import { AnalysisCoverage, AnalysisIssue, AutopsiaConfig, FileNode } from './types';

/** Valida errores de configuración que volverían ambiguo o incompleto el scan. */
export function validateConfig(config: AutopsiaConfig): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim().length > 0);
  if (!config || !Array.isArray(config.layers) || config.layers.length === 0) {
    return [{ kind: 'invalid-config', message: '"layers" debe contener al menos una capa' }];
  }
  if (!strings(config.dataAccessModules)) {
    issues.push({ kind: 'invalid-config', message: '"dataAccessModules" debe ser un arreglo' });
  }
  if (!strings(config.noDirectDataAccessIn)) {
    issues.push({ kind: 'invalid-config', message: '"noDirectDataAccessIn" debe ser un arreglo' });
  }

  const names = new Set<string>();
  if (config.strict !== undefined && typeof config.strict !== 'boolean') issues.push({ kind: 'invalid-config', message: '"strict" debe ser booleano' });
  if (config.ignore !== undefined && !strings(config.ignore)) issues.push({ kind: 'invalid-config', message: '"ignore" debe contener strings no vacíos' });
  for (const layer of config.layers) {
    if (!layer || typeof layer !== 'object') {
      issues.push({ kind: 'invalid-config', message: 'Cada entrada de "layers" debe ser un objeto' });
      continue;
    }
    if (typeof layer.name !== 'string' || !layer.name.trim()) {
      issues.push({ kind: 'invalid-config', message: 'Cada capa debe tener un nombre' });
      continue;
    }
    if (names.has(layer.name)) {
      issues.push({ kind: 'invalid-config', message: `La capa "${layer.name}" está repetida` });
    }
    names.add(layer.name);
    if (!strings(layer.patterns) || layer.patterns.length === 0) {
      issues.push({ kind: 'invalid-config', message: `La capa "${layer.name}" no tiene patterns` });
    }
    if (layer.forbiddenExternal !== undefined && !strings(layer.forbiddenExternal)) issues.push({ kind: 'invalid-config', message: `forbiddenExternal de "${layer.name}" debe contener strings no vacíos` });
    if (layer.allowedDependencies !== undefined && !strings(layer.allowedDependencies)) {
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
  if (config.rules !== undefined && (typeof config.rules !== 'object' || config.rules === null || Array.isArray(config.rules))) {
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
  if (graph.length === 0) issues.push({ kind: 'empty-project', message: 'No hay archivos TypeScript analizables' });
  let classifiedFiles = 0;
  let ambiguousFiles = 0;
  let totalDependencies = 0;
  let unanalyzableDependencies = 0;
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
      if (dependency.unanalyzable) {
        unanalyzableDependencies++;
        issues.push({ kind: 'unanalyzable-import', file: node.path, line: dependency.line,
          message: `Dependencia no analizable estáticamente: ${dependency.specifier}`,
          detail: `${dependency.kind} en línea ${dependency.line}` });
        continue;
      }
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
    unanalyzableDependencies,
    resolvedInternalDependencies,
    unresolvedInternalDependencies,
    configErrors: configIssues.length,
    ambiguousFiles,
    complete:
      graph.length > 0 &&
      unanalyzableDependencies === 0 &&
      configIssues.length === 0 &&
      unclassifiedFiles === 0 &&
      ambiguousFiles === 0 &&
      unresolvedInternalDependencies === 0,
    issues,
  };
}
