import { format } from "./i18n";
import { matchingLayers } from './classifier';
import { ALL_RULES } from './rules/run';
import { AnalysisCoverage, AnalysisIssue, AutopsiaConfig, FileNode } from './types';

/** Valida errores de configuración que volverían ambiguo o incompleto el scan. */
export function validateConfig(config: AutopsiaConfig): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim().length > 0);
  if (!config || !Array.isArray(config.layers) || config.layers.length === 0) {
    return [{ diagnostic: { message: { code: "config.layers", params: {} } }, kind: 'invalid-config', message: format("config.layers", {}, "es") }];
  }
  if (!strings(config.dataAccessModules)) {
    issues.push({ diagnostic: { message: { code: "config.dataModules", params: {} } }, kind: 'invalid-config', message: format("config.dataModules", {}, "es") });
  }
  if (!strings(config.noDirectDataAccessIn)) {
    issues.push({ diagnostic: { message: { code: "config.noData", params: {} } }, kind: 'invalid-config', message: format("config.noData", {}, "es") });
  }

  const names = new Set<string>();
  if (config.strict !== undefined && typeof config.strict !== 'boolean') issues.push({ diagnostic: { message: { code: "config.strict", params: {} } }, kind: 'invalid-config', message: format("config.strict", {}, "es") });
  if (config.ignore !== undefined && !strings(config.ignore)) issues.push({ diagnostic: { message: { code: "config.ignore", params: {} } }, kind: 'invalid-config', message: format("config.ignore", {}, "es") });
  for (const layer of config.layers) {
    if (!layer || typeof layer !== 'object') {
      issues.push({ diagnostic: { message: { code: "config.layerObject", params: {} } }, kind: 'invalid-config', message: format("config.layerObject", {}, "es") });
      continue;
    }
    if (typeof layer.name !== 'string' || !layer.name.trim()) {
      issues.push({ diagnostic: { message: { code: "config.name", params: {} } }, kind: 'invalid-config', message: format("config.name", {}, "es") });
      continue;
    }
    if (names.has(layer.name)) {
      issues.push({ diagnostic: { message: { code: "config.duplicate", params: {p0: layer.name} } }, kind: 'invalid-config', message: format("config.duplicate", {p0: layer.name}, "es") });
    }
    names.add(layer.name);
    if (!strings(layer.patterns) || layer.patterns.length === 0) {
      issues.push({ diagnostic: { message: { code: "config.patterns", params: {p0: layer.name} } }, kind: 'invalid-config', message: format("config.patterns", {p0: layer.name}, "es") });
    }
    if (layer.forbiddenExternal !== undefined && !strings(layer.forbiddenExternal)) issues.push({ diagnostic: { message: { code: "config.external", params: {p0: layer.name} } }, kind: 'invalid-config', message: format("config.external", {p0: layer.name}, "es") });
    if (layer.allowedDependencies !== undefined && !strings(layer.allowedDependencies)) {
      issues.push({ diagnostic: { message: { code: "config.allowed", params: {p0: layer.name} } },
        kind: 'invalid-config',
        message: format("config.allowed", {p0: layer.name}, "es"),
      });
    }
  }

  for (const layer of config.layers) {
    if (!layer || typeof layer !== 'object' || !Array.isArray(layer.allowedDependencies)) continue;
    for (const dependency of layer.allowedDependencies) {
      if (!names.has(dependency)) {
        issues.push({ diagnostic: { message: { code: "config.unknownDependency", params: {p0: layer.name, p1: dependency} } },
          kind: 'invalid-config',
          message: format("config.unknownDependency", {p0: layer.name, p1: dependency}, "es"),
        });
      }
    }
  }
  for (const layer of Array.isArray(config.noDirectDataAccessIn) ? config.noDirectDataAccessIn : []) {
    if (!names.has(layer)) {
      issues.push({ diagnostic: { message: { code: "config.unknownLayer", params: {p0: layer} } },
        kind: 'invalid-config',
        message: format("config.unknownLayer", {p0: layer}, "es"),
      });
    }
  }
  if (config.rules !== undefined && (typeof config.rules !== 'object' || config.rules === null || Array.isArray(config.rules))) {
    issues.push({ diagnostic: { message: { code: "config.rules", params: {} } }, kind: 'invalid-config', message: format("config.rules", {}, "es") });
  }
  for (const [rule, level] of Object.entries(
    config.rules && typeof config.rules === 'object' ? config.rules : {},
  )) {
    if (!(ALL_RULES as readonly string[]).includes(rule)) {
      issues.push({ diagnostic: { message: { code: "config.unknownRule", params: {p0: rule} } }, kind: 'invalid-config', message: format("config.unknownRule", {p0: rule}, "es") });
    }
    if (!['error', 'warning', 'off'].includes(level)) {
      issues.push({ diagnostic: { message: { code: "config.level", params: {p0: rule, p1: level} } }, kind: 'invalid-config', message: format("config.level", {p0: rule, p1: level}, "es") });
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
  if (graph.length === 0) issues.push({ diagnostic: { message: { code: "analysis.empty", params: {} } }, kind: 'empty-project', message: format("analysis.empty", {}, "es") });
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
      issues.push({ diagnostic: { message: { code: "analysis.unclassified", params: {} } },
        kind: 'unclassified-file',
        file: node.path,
        message: format("analysis.unclassified", {}, "es"),
      });
    }
    if (matches.length > 1) {
      ambiguousFiles++;
      issues.push({ diagnostic: { message: { code: "analysis.ambiguous", params: {p0: matches.join(', ')} }, detail: { code: "analysis.first", params: {p0: matches[0]} } },
        kind: 'ambiguous-layer',
        file: node.path,
        message: format("analysis.ambiguous", {p0: matches.join(', ')}, "es"),
        detail: format("analysis.first", {p0: matches[0]}, "es"),
      });
    }

    for (const dependency of node.dependencies ?? []) {
      totalDependencies++;
      if (dependency.unanalyzable) {
        unanalyzableDependencies++;
        issues.push({ diagnostic: { message: { code: "analysis.computed", params: {p0: dependency.specifier} }, detail: { code: "analysis.line", params: {p0: dependency.kind, p1: dependency.line} } }, kind: 'unanalyzable-import', file: node.path, line: dependency.line,
          message: format("analysis.computed", {p0: dependency.specifier}, "es"),
          detail: format("analysis.line", {p0: dependency.kind, p1: dependency.line}, "es") });
        continue;
      }
      if (dependency.external) continue;
      if (dependency.resolved) resolvedInternalDependencies++;
      else {
        unresolvedInternalDependencies++;
        issues.push({ diagnostic: { message: { code: "analysis.unresolved", params: {p0: dependency.specifier} }, detail: { code: "analysis.line", params: {p0: dependency.kind, p1: dependency.line} } },
          kind: 'unresolved-import',
          file: node.path,
          line: dependency.line,
          message: format("analysis.unresolved", {p0: dependency.specifier}, "es"),
          detail: format("analysis.line", {p0: dependency.kind, p1: dependency.line}, "es"),
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
