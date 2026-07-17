import chalk from 'chalk';
import * as fs from 'fs';
import { ScanResult, Violation } from './types';

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
  console.log(chalk.bold('  🔬 AUTOPSIA — Reporte de arquitectura'));
  console.log(chalk.gray(`  ${result.root} · ${result.totalFiles} archivos analizados`));
  console.log('');

  // Salud por capa
  console.log(chalk.bold('  Salud por capa'));
  for (const [layer, pct] of Object.entries(result.healthByLayer)) {
    const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
    const count = result.filesByLayer[layer] ?? 0;
    console.log(
      `  ${layer.padEnd(16)} ${healthColor(pct)(bar)} ${healthColor(pct)(pct + '%')} ${chalk.gray(`(${count} archivos)`)}`
    );
  }

  const unclassified = result.graph.filter((n) => n.layer === null).length;
  if (unclassified > 0) {
    console.log(chalk.gray(`  ${unclassified} archivos sin capa asignada (no evaluados)`));
  }
  console.log('');

  const tolerated = result.tolerated ?? [];

  // Violaciones agrupadas por regla
  if (result.violations.length === 0 && tolerated.length === 0) {
    console.log(chalk.green.bold('  ✔ Sin violaciones. Arquitectura sana.'));
    console.log('');
    return;
  }

  const byRule = new Map<string, Violation[]>();
  for (const v of result.violations) {
    byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v]);
  }

  for (const [rule, violations] of byRule) {
    console.log(chalk.bold.red(`  ✖ ${rule}`) + chalk.gray(` — ${violations.length} violación(es)`));
    for (const v of violations) {
      console.log(`    ${chalk.cyan(v.file)}`);
      console.log(`      ${v.message}`);
      if (v.detail) console.log(chalk.gray(`      ↳ ${v.detail}`));
    }
    console.log('');
  }

  // Toleradas por el baseline: en gris, no cuentan para --ci
  if (tolerated.length > 0) {
    console.log(
      chalk.gray(`  ⊘ toleradas (baseline) — ${tolerated.length} violación(es) ya registradas`)
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
    console.log(chalk.bold('  Top archivos problemáticos'));
    for (const [file, count] of top) {
      console.log(`    ${chalk.red(String(count).padStart(2))}  ${file}`);
    }
    console.log('');
  }

  if (result.tolerated) {
    const freshLabel =
      result.violations.length > 0
        ? chalk.red(`${result.violations.length} nuevas`)
        : chalk.green('0 nuevas');
    console.log(chalk.bold(`  Total: ${freshLabel} · ${chalk.gray(`${tolerated.length} toleradas (baseline)`)}`));
  } else {
    console.log(
      chalk.bold(`  Total: ${chalk.red(result.violations.length + ' violaciones')} en ${countByFile.size} archivos`)
    );
  }
  console.log('');
}

export function writeJson(result: ScanResult, outPath: string): void {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(chalk.gray(`  Reporte JSON guardado en ${outPath}`));
  console.log('');
}
