import { t, present } from "./i18n";
import chalk from 'chalk';
import * as fs from 'fs';
import { AnalysisIssue, AnalysisIssueKind, ScanResult, Violation } from './types';

const issueLabels = (): Record<AnalysisIssueKind, string> => ({
  'empty-project': t("report.empty", {}),
  'unanalyzable-import': t("report.unanalyzable", {}),
  'unclassified-file': t("report.unclassified", {}),
  'unresolved-import': t("report.unresolved", {}),
  'ambiguous-layer': t("report.ambiguous", {}),
  'invalid-config': t("report.config", {}),
});

export function analysisCoveragePercent(result: ScanResult): number {
  if (result.totalFiles === 0) return 0;
  return Math.round(((result.analysis?.classifiedFiles ?? result.totalFiles) / result.totalFiles) * 1000) / 10;
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function printIssueGroups(issues: AnalysisIssue[]): void {
  const order: AnalysisIssueKind[] = [
    'empty-project',
    'unanalyzable-import',
    'unclassified-file',
    'unresolved-import',
    'ambiguous-layer',
    'invalid-config',
  ];
  for (const kind of order) {
    const group = issues.filter((issue) => issue.kind === kind);
    if (group.length === 0) continue;
    console.log(chalk.bold(`    ${issueLabels()[kind]} — ${group.length}`));
    for (const issue of group.slice(0, 5)) {
      const location = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : '';
      console.log(`      ${location ? chalk.cyan(location) + ' · ' : ''}${present(issue).message}`);
    }
    if (group.length > 5) console.log(chalk.gray(t("report.more", {p0: group.length - 5})));
  }
}

export function computeHealth(result: Omit<ScanResult, 'healthByLayer'>): Record<string, number> {
  const filesWithViolations = new Set(result.violations.map((v) => v.file));
  const health: Record<string, number> = {};

  for (const [layer, total] of Object.entries(result.filesByLayer)) {
    if (total === 0) { health[layer] = 100; continue; }
    const dirty = result.graph.filter(
      (n) => n.layer === layer && filesWithViolations.has(n.path)
    ).length;
    health[layer] = Math.round(((total - dirty) / total) * 100);
  }
  return health;
}

function healthColor(pct: number): (s: string) => string {
  if (pct >= 90) return chalk.green;
  if (pct >= 70) return chalk.yellow;
  return chalk.red;
}

export function printReport(result: ScanResult): void {
  console.log('');
  console.log(chalk.bold(t("report.title", {})));
  console.log(chalk.gray(t("report.analyzed", {p0: result.root, p1: result.totalFiles})));
  console.log('');

  // La salud solo describe archivos que sí pertenecen a una capa.
  console.log(chalk.bold(t("report.health", {})));
  for (const [layer, pct] of Object.entries(result.healthByLayer)) {
    const count = result.filesByLayer[layer] ?? 0;
    if (count === 0) {
      console.log(`  ${layer.padEnd(16)} ${chalk.gray(t("report.na", {}))}`);
      continue;
    }
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
    console.log(
      `  ${layer.padEnd(16)} ${healthColor(pct)(bar)} ${healthColor(pct)(pct + '%')} ${chalk.gray(t("report.files", {p0: count}))}`
    );
  }

  const unclassified = result.graph.filter((n) => n.layer === null).length;
  if (unclassified > 0) {
    console.log(chalk.gray(t("report.unassigned", {p0: unclassified})));
  }
  console.log('');

  if (result.analysis) {
    const analysis = result.analysis;
    const coveragePct = analysisCoveragePercent(result);
    console.log(chalk.bold(t("report.coverageTitle", {})));
    console.log(
      t("report.coverage", {p0: formatPercent(coveragePct).padStart(5)}) +
      t("report.fraction", {p0: analysis.classifiedFiles, p1: result.totalFiles})
    );
    console.log(
      t("report.internal", {p0: String(analysis.resolvedInternalDependencies).padStart(5)}) +
      t("report.unresolvedCount", {p0: analysis.unresolvedInternalDependencies})
    );
    if (analysis.complete) {
      console.log(chalk.green.bold(t("report.complete", {})));
    } else {
      const status = result.totalFiles === 0 ? t("report.emptyStatus", {})
        : coveragePct < 50 ? t("report.insufficient", {}) : t("report.incomplete", {});
      const color = coveragePct < 50 ? chalk.red.bold : chalk.yellow.bold;
      console.log(color(t("report.issues", {p0: status, p1: analysis.issues.length})));
      printIssueGroups(analysis.issues);
    }
    console.log('');
  }

  const tolerated = result.tolerated ?? [];
  const suppressedNote = (): void => {
    if (result.suppressedCount) {
      console.log(chalk.gray(t("report.suppressed", {p0: result.suppressedCount})));
    }
  };

  // Violaciones agrupadas por regla
  if (result.violations.length === 0 && tolerated.length === 0) {
    const verified = result.analysis?.complete !== false;
    console.log(
      verified
        ? chalk.green.bold(t("report.clean", {}))
        : chalk.yellow.bold(t("report.cleanIncomplete", {}))
    );
    suppressedNote();
    console.log('');
    return;
  }

  const byRule = new Map<string, Violation[]>();
  for (const v of result.violations) {
    byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v]);
  }

  for (const [rule, violations] of byRule) {
    // Las reglas configuradas como "warning" se reportan en amarillo y no fallan --ci
    const isWarning = violations.every((v) => v.severity === 'warning');
    const header = isWarning ? chalk.bold.yellow(`  ⚠ ${rule}`) : chalk.bold.red(`  ✖ ${rule}`);
    console.log(header + chalk.gray(t("report.violations", {p0: violations.length})));
    for (const v of violations) {
      console.log(`    ${chalk.cyan(v.file + (v.line ? `:${v.line}` : ''))}`);
      console.log(`      ${present(v).message}`);
      if (v.detail) console.log(chalk.gray(`      ↳ ${present(v).detail}`));
    }
    console.log('');
  }

  // Toleradas por el baseline: en gris, no cuentan para --ci
  if (tolerated.length > 0) {
    console.log(
      chalk.gray(t("report.tolerated", {p0: tolerated.length}))
    );
    for (const v of tolerated) {
      console.log(chalk.gray(`    ${v.file} · ${v.rule}`));
    }
    console.log('');
  }

  // Top archivos problemáticos
  const countByFile = new Map<string, number>();
  for (const v of result.violations) {
    countByFile.set(v.file, (countByFile.get(v.file) ?? 0) + 1);
  }
  const top = [...countByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length > 1) {
    console.log(chalk.bold(t("report.top", {})));
    for (const [file, count] of top) {
      console.log(`    ${chalk.red(String(count).padStart(2))}  ${file}`);
    }
    console.log('');
  }

  if (result.tolerated) {
    const freshLabel =
      result.violations.length > 0
        ? chalk.red(t("report.new", {p0: result.violations.length}))
        : chalk.green(t("report.zero", {}));
    console.log(chalk.bold(`  Total: ${freshLabel} · ${chalk.gray(t("report.toleratedCount", {p0: tolerated.length}))}`));
  } else {
    console.log(
      chalk.bold(t("report.total", {p0: chalk.red(result.violations.length + t("report.violationSuffix", {})), p1: countByFile.size}))
    );
  }
  suppressedNote();
  console.log('');
}

export function writeJson(result: ScanResult, outPath: string): void {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(chalk.gray(t("report.json", {p0: outPath})));
  console.log('');
}
