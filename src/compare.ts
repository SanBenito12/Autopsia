import * as fs from 'fs';
import { applyBaseline, toEntry } from './baseline';
import { ReportComparison, ScanResult, Violation } from './types';

/** Compare all unsuppressed debt, including baseline-tolerated violations. */
export function compareReports(previous: ScanResult, current: ScanResult): ReportComparison {
  const before = [...previous.violations, ...(previous.tolerated ?? [])];
  const after = [...current.violations, ...(current.tolerated ?? [])];
  const split = (a: Violation[], b: Violation[]) => applyBaseline(a, {
    version: 1, updatedAt: '', violations: b.map(toEntry),
  });
  const changes = split(after, before);
  const percent = (r: ScanResult): number | null => r.totalFiles > 0 && r.analysis
    ? Math.round(r.analysis.classifiedFiles / r.totalFiles * 1000) / 10 : null;
  const oldCoverage = percent(previous);
  const newCoverage = percent(current);
  return {
    added: changes.fresh, persistent: changes.tolerated, resolved: split(before, after).fresh,
    coverage: { previous: oldCoverage, current: newCoverage,
      delta: oldCoverage === null || newCoverage === null ? null : Math.round((newCoverage - oldCoverage) * 10) / 10 },
  };
}

export function loadReport(file: string): ScanResult {
  const value = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const violations = (items: unknown): boolean => Array.isArray(items) && items.every((v) =>
    v && typeof v === 'object' && typeof v.rule === 'string' && typeof v.file === 'string' &&
    typeof v.message === 'string' && (v.detail === undefined || typeof v.detail === 'string') &&
    ['error', 'warning'].includes(v.severity));
  if (!value || !Number.isInteger(value.totalFiles) || value.totalFiles < 0 ||
    !violations(value.violations) || (value.tolerated !== undefined && !violations(value.tolerated)) ||
    (value.analysis !== undefined && (!value.analysis || !Number.isInteger(value.analysis.classifiedFiles) ||
      value.analysis.classifiedFiles < 0 || value.analysis.classifiedFiles > value.totalFiles))) {
    throw new Error('Reporte de comparación inválido');
  }
  return value as ScanResult;
}

export function printComparison(comparison: ReportComparison): void {
  console.log(`  Comparación: ${comparison.added.length} nuevas · ${comparison.resolved.length} resueltas · ${comparison.persistent.length} persistentes`);
  const { previous, current, delta } = comparison.coverage;
  const percent = (value: number | null): string => value === null ? 'N/A' : `${value}%`;
  console.log(`  Cobertura: ${percent(previous)} → ${percent(current)} · cambio ${delta === null ? 'N/A' : `${delta > 0 ? '+' : ''}${delta} puntos porcentuales`}`);
  for (const [label, violations] of [['Nueva', comparison.added], ['Resuelta', comparison.resolved]] as const) {
    for (const v of violations) console.log(`    ${label}: ${v.file}${v.line ? `:${v.line}` : ''} · ${v.rule} · ${v.message}`);
  }
  console.log('');
}
