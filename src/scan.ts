import * as fs from 'fs';
import * as path from 'path';
import { t } from './i18n';
import { AnalysisIssue, AutopsiaConfig, ScanResult, Violation } from './types';
import { applyBaseline, loadBaseline } from './baseline';
import { buildGraph } from './scanner';
import { runRules } from './rules/run';
import { computeHealth } from './reporter';
import { computeAnalysisCoverage, validateConfig } from './analysis';
import { loadTsconfig } from './tsconfig';
import { resolveConfigPath } from './doctor';

/**
 * Núcleo del escaneo sin salida por consola. Lo usan la CLI (executeScan)
 * y la app de escritorio.
 */
export interface ScanProjectOptions {
  /** Ruta del config (relativa al root o absoluta). Default: autopsia.config.json */
  config?: string;
  tsconfig?: string;
  /** false ignora autopsia-baseline.json */
  baseline?: boolean;
  /** Se llama justo antes de construir el grafo (tras validar la entrada). */
  onScanStart?: (root: string) => void;
}

export type ScanErrorCode = 'missing-path' | 'missing-config' | 'read-error' | 'invalid-config' | 'missing-tsconfig';

export interface ScanError {
  code: ScanErrorCode;
  message: string;
  configPath?: string;
  issues?: AnalysisIssue[];
}

export interface ScanSuccess {
  ok: true;
  result: ScanResult;
  config: AutopsiaConfig;
  configPath: string;
  /** Todas las violaciones no suprimidas, incluidas las toleradas por el baseline. */
  allViolations: Violation[];
}

export type ScanOutcome = ScanSuccess | { ok: false; error: ScanError };

export function scanProject(scanPath: string, opts: ScanProjectOptions = {}): ScanOutcome {
  const root = path.resolve(scanPath);
  const fail = (error: ScanError): ScanOutcome => ({ ok: false, error });

  if (!fs.existsSync(root)) return fail({ code: 'missing-path', message: t('cli.missingPath', { p0: root }) });

  const configPath = resolveConfigPath(root, opts.config ?? 'autopsia.config.json');
  if (!fs.existsSync(configPath)) {
    return fail({ code: 'missing-config', message: t('cli.missingConfig', { p0: root }), configPath });
  }

  let config: AutopsiaConfig;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AutopsiaConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail({ code: 'read-error', message: t('cli.readError', { p0: message }), configPath });
  }
  const configIssues = validateConfig(config);
  if (configIssues.length > 0) {
    return fail({ code: 'invalid-config', message: t('cli.invalidConfig', {}), configPath, issues: configIssues });
  }

  if (opts.tsconfig && !fs.existsSync(path.resolve(opts.tsconfig))) {
    return fail({ code: 'missing-tsconfig', message: t('cli.missingTsconfig', { p0: path.resolve(opts.tsconfig) }) });
  }

  opts.onScanStart?.(root);
  const graph = buildGraph(root, config, opts.tsconfig);
  const analysis = computeAnalysisCoverage(graph, config, [
    ...configIssues,
    ...loadTsconfig(root, opts.tsconfig).issues,
  ]);

  const rawViolations = runRules(graph, config);

  // Comentarios autopsia-ignore: las suprimidas solo se cuentan
  const suppressedCount = rawViolations.filter((v) => v.suppressed).length;
  const allViolations = rawViolations.filter((v) => !v.suppressed);

  // Baseline: las violaciones ya registradas se toleran; solo las nuevas cuentan
  let violations = allViolations;
  let tolerated: Violation[] | undefined;
  const baseline = opts.baseline === false ? null : loadBaseline(root);
  if (baseline) {
    const split = applyBaseline(allViolations, baseline);
    violations = split.fresh;
    tolerated = split.tolerated;
  }

  const filesByLayer: Record<string, number> = {};
  for (const layer of config.layers) filesByLayer[layer.name] = 0;
  for (const node of graph) {
    if (node.layer) filesByLayer[node.layer] = (filesByLayer[node.layer] ?? 0) + 1;
  }

  const partial = {
    scannedAt: new Date().toISOString(),
    root,
    totalFiles: graph.length,
    filesByLayer,
    violations,
    tolerated,
    suppressedCount: suppressedCount > 0 ? suppressedCount : undefined,
    graph,
    analysis,
  };

  // La salud refleja TODAS las violaciones (también las toleradas)
  const result: ScanResult = {
    ...partial,
    healthByLayer: computeHealth({ ...partial, violations: allViolations }),
  };

  return { ok: true, result, config, configPath, allViolations };
}
