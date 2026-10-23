import * as fs from 'fs';
import * as path from 'path';
import { ts } from 'ts-morph';
import { AnalysisCoverage, AnalysisIssue, AutopsiaConfig } from './types';
import { computeAnalysisCoverage, validateConfig } from './analysis';
import { buildGraph } from './scanner';
import { detectLayers } from './init';
import { matchingEvidence } from './classifier';
import { loadTsconfig } from './tsconfig';
import { detectConfigSmells } from './smells';
import { format, MessageKey, present, t } from './i18n';

export interface DoctorIssue extends Omit<AnalysisIssue, 'kind'> {
  code: AnalysisIssue['kind'] | 'missing-config';
  recommendation: string;
  recommendationCode: MessageKey;
  matches?: ReturnType<typeof matchingEvidence>;
}
export interface DoctorReport {
  schemaVersion: 1;
  root: string;
  configPath: string;
  tsconfigPath: string;
  typescriptVersion: string;
  status: 'ready' | 'incomplete' | 'error';
  totalFiles: number;
  coverage: AnalysisCoverage | null;
  detected: ReturnType<typeof detectLayers>;
  issues: DoctorIssue[];
  /** Configuración válida pero sospechosa: no cambia el estado, avisa. */
  warnings: DoctorIssue[];
}
export function resolveConfigPath(root: string, config = 'autopsia.config.json'): string {
  if (path.isAbsolute(config)) return config;
  const inRoot = path.join(root, config);
  // The default config always belongs to the scanned project: never borrow the one in cwd.
  if (config === 'autopsia.config.json' || fs.existsSync(inRoot)) return inRoot;
  return path.resolve(config);
}
const recommendations: Record<AnalysisIssue['kind'] | 'missing-config', MessageKey> = {
  'missing-config': 'doctor.initFix', 'invalid-config': 'doctor.configFix',
  'tsconfig-error': 'doctor.tsconfigFix', 'empty-project': 'doctor.emptyFix',
  'unclassified-file': 'doctor.classifyFix', 'ambiguous-layer': 'doctor.ambiguousFix',
  'unresolved-import': 'doctor.importFix', 'unanalyzable-import': 'doctor.computedFix',
  'config-smell': 'doctor.smellFix',
};
export function diagnose(root: string, configFile?: string, tsconfigFile?: string): DoctorReport {
  if (!fs.statSync(root).isDirectory()) throw new Error(t('cli.missingPath', { p0: root }));
  if (tsconfigFile && !fs.existsSync(path.resolve(tsconfigFile))) throw new Error(t('cli.missingTsconfig', { p0: path.resolve(tsconfigFile) }));
  const configPath = resolveConfigPath(root, configFile);
  const loaded = loadTsconfig(root, tsconfigFile);
  const report: DoctorReport = { schemaVersion: 1, root, configPath, tsconfigPath: loaded.path, typescriptVersion: ts.version,
    status: 'incomplete', totalFiles: 0, coverage: null, detected: detectLayers(root), issues: [], warnings: [] };
  const add = (issue: AnalysisIssue | (Omit<AnalysisIssue, 'kind'> & { kind: 'missing-config' }), config?: AutopsiaConfig) => {
    const { kind, ...rest } = issue;
    const recommendationCode = recommendations[kind];
    report.issues.push({ ...rest, code: kind, recommendationCode,
      recommendation: format(recommendationCode, {}, 'es'),
      ...(kind === 'ambiguous-layer' && issue.file && config ? { matches: matchingEvidence(issue.file, config) } : {}) });
  };
  if (!fs.existsSync(configPath)) {
    add({ kind: 'missing-config', message: format('doctor.missing', {}, 'es'),
      diagnostic: { message: { code: 'doctor.missing', params: {} } } });
    loaded.issues.forEach(i => add(i));
    report.status = loaded.malformed ? 'error' : 'incomplete';
    report.totalFiles = buildGraph(root, { layers: [], dataAccessModules: [], noDirectDataAccessIn: [] }, tsconfigFile).length;
    return report;
  }
  let config: AutopsiaConfig;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (error) {
    report.status = 'error';
    add({ kind: 'invalid-config', file: configPath, message: format('cli.invalidConfig', {}, 'es').trim(),
      diagnostic: { message: { code: 'cli.invalidConfig', params: {} } }, detail: String(error) });
    return report;
  }
  const invalid = validateConfig(config);
  if (invalid.length) {
    report.status = 'error';
    invalid.forEach(i => add(i));
    return report;
  }
  const graph = buildGraph(root, config, tsconfigFile);
  report.totalFiles = graph.length;
  report.coverage = computeAnalysisCoverage(graph, config, loaded.issues);
  report.coverage.issues.forEach(i => add(i, config));
  for (const smell of detectConfigSmells(graph, config)) {
    report.warnings.push({ ...smell, code: smell.kind, recommendationCode: 'doctor.smellFix',
      recommendation: format('doctor.smellFix', {}, 'es') });
  }
  report.status = loaded.malformed ? 'error' : report.coverage.complete ? 'ready' : 'incomplete';
  return report;
}
export function printDoctor(report: DoctorReport): void {
  console.log(t('doctor.title', { p0: report.root }));
  console.log(t('doctor.config', { p0: report.configPath }));
  console.log(t('doctor.tsconfig', { p0: report.tsconfigPath }));
  console.log(`TypeScript: ${report.typescriptVersion}`);
  console.log(t('doctor.coverage', { p0: report.totalFiles, p1: report.coverage?.classifiedFiles ?? 'N/A' }));
  console.log(t('doctor.detected', { p0: report.detected.map(d => `${d.name}: ${d.folders.join(', ')}`).join('; ') || '—' }));
  console.log(report.status === 'ready' ? t('doctor.ready') : t('doctor.incomplete', { p0: report.issues.length }));
  for (const issue of report.issues.slice(0, 10)) {
    const display = present(issue);
    console.log(`\n[${issue.code}] ${issue.file ?? ''}${issue.line ? ':' + issue.line : ''} ${display.message}`);
    if (display.detail) console.log(display.detail);
    if (issue.matches) console.log(t('doctor.matches', { p0: JSON.stringify(issue.matches) }));
    console.log(t(issue.recommendationCode));
  }
  if (report.issues.length > 10) console.log(t('doctor.more'));
  if (report.warnings.length > 0) {
    console.log(`\n${t('doctor.warnings', { p0: report.warnings.length })}`);
    for (const warning of report.warnings) console.log(`[${warning.code}] ${present(warning).message}`);
    console.log(t('doctor.smellFix'));
  }
}
