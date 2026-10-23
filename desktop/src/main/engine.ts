/**
 * Proceso utilitario: ejecuta el motor de Autopsia (ts-morph es pesado) fuera
 * del proceso principal para que la ventana nunca se congele.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  scanProject, diagnose, initProject, measureConfigCoverage, saveBaseline, loadBaseline,
  compareReports, loadReport, generateHtml, violationEdges, analysisCoveragePercent,
  present, setLocale, format, ScanResult,
} from '@core/api';
import type { InitPreset, Lang } from '../shared/types';

type Request = { id: number; op: string; args: unknown[] };

function presentResult(result: ScanResult, lang: Lang): ScanResult {
  return {
    ...result,
    violations: result.violations.map((v) => present(v, lang)),
    tolerated: result.tolerated?.map((v) => present(v, lang)),
    analysis: result.analysis
      ? { ...result.analysis, issues: result.analysis.issues.map((i) => present(i, lang)) }
      : undefined,
  };
}

function scan(root: string, lang: Lang) {
  setLocale(lang);
  const started = Date.now();
  const outcome = scanProject(root);
  if (!outcome.ok) {
    const { error } = outcome;
    return { ok: false, error: { ...error, message: error.message.trim(), issues: error.issues?.map((i) => present(i, lang)) } };
  }
  return {
    ok: true,
    result: presentResult(outcome.result, lang),
    configPath: outcome.configPath,
    edges: violationEdges(outcome.result),
    coveragePercent: analysisCoveragePercent(outcome.result),
    hasBaseline: loadBaseline(outcome.result.root) !== null,
    durationMs: Date.now() - started,
  };
}

function doctor(root: string, lang: Lang) {
  setLocale(lang);
  const report = diagnose(root);
  return {
    status: report.status,
    configPath: report.configPath,
    tsconfigPath: report.tsconfigPath,
    typescriptVersion: report.typescriptVersion,
    totalFiles: report.totalFiles,
    classifiedFiles: report.coverage?.classifiedFiles ?? null,
    detected: report.detected.map((d) => ({ name: d.name, folders: d.folders })),
    issues: report.issues.map((issue) => {
      const shown = present(issue, lang);
      return { code: issue.code, file: issue.file, line: issue.line, message: shown.message, detail: shown.detail,
        recommendation: format(issue.recommendationCode, {}, lang) };
    }),
  };
}

const presetOption = (preset: InitPreset) => (preset === 'auto' ? undefined : preset);

function initPreview(root: string, preset: InitPreset) {
  const preview = initProject(root, false, { preset: presetOption(preset), dryRun: true });
  const config = preview.config!;
  return {
    configExists: fs.existsSync(preview.configPath),
    configPath: preview.configPath,
    json: JSON.stringify(config, null, 2),
    example: preview.example === true,
    coverage: measureConfigCoverage(root, config),
  };
}

function initWrite(root: string, preset: InitPreset, force: boolean) {
  const result = initProject(root, force, { preset: presetOption(preset) });
  if (result.status === 'exists') throw new Error('autopsia.config.json already exists');
  return { configPath: result.configPath };
}

function updateBaseline(root: string) {
  const outcome = scanProject(root, { baseline: false });
  if (!outcome.ok) throw new Error(outcome.error.message.trim());
  return { file: saveBaseline(outcome.result.root, outcome.allViolations), count: outcome.allViolations.length };
}

function compare(root: string, reportPath: string, lang: Lang) {
  setLocale(lang);
  const previous = loadReport(reportPath);
  const outcome = scanProject(root);
  if (!outcome.ok) throw new Error(outcome.error.message.trim());
  const comparison = compareReports(previous, outcome.result);
  const tr = (list: typeof comparison.added) => list.map((v) => present(v, lang));
  return { ...comparison, added: tr(comparison.added), resolved: tr(comparison.resolved), persistent: tr(comparison.persistent) };
}

function exportReport(root: string, outPath: string, kind: 'json' | 'html', lang: Lang) {
  setLocale(lang);
  const outcome = scanProject(root);
  if (!outcome.ok) throw new Error(outcome.error.message.trim());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = kind === 'html' ? generateHtml(outcome.result) : JSON.stringify(outcome.result, null, 2) + '\n';
  fs.writeFileSync(outPath, body, 'utf-8');
  return outPath;
}

const ops: Record<string, (...args: any[]) => unknown> = {
  scan, doctor, initPreview, initWrite, updateBaseline, compare, exportReport,
};

process.parentPort.on('message', (event) => {
  const { id, op, args } = event.data as Request;
  try {
    const handler = ops[op];
    if (!handler) throw new Error(`Unknown engine op: ${op}`);
    process.parentPort.postMessage({ id, ok: true, value: handler(...args) });
  } catch (error) {
    process.parentPort.postMessage({ id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
});
