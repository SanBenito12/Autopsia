import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { Violation } from './types';

/**
 * Baseline de violaciones para adopción en proyectos legacy.
 *
 * `autopsia scan . --update-baseline` guarda las violaciones actuales en
 * autopsia-baseline.json. En scans posteriores, las violaciones que ya
 * estaban en el baseline se reportan como "toleradas" y no fallan --ci;
 * solo las nuevas cuentan.
 *
 * Formato estable: regla + archivo + mensaje + detalle, SIN números de
 * línea (para que el baseline no se invalide con cualquier edición) y con
 * separadores POSIX (para que sea portable entre SO).
 */

export const BASELINE_FILE = 'autopsia-baseline.json';

export interface BaselineEntry {
  rule: string;
  file: string;
  message: string;
  detail?: string;
}

export interface Baseline {
  version: 1;
  updatedAt: string;
  violations: BaselineEntry[];
}

/** Normaliza separadores de Windows para que el baseline sea portable. */
function posix(s: string): string {
  return s.replace(/\\/g, '/');
}

function toEntry(v: Violation): BaselineEntry {
  const entry: BaselineEntry = {
    rule: v.rule,
    file: posix(v.file),
    message: posix(v.message),
  };
  if (v.detail) entry.detail = posix(v.detail);
  return entry;
}

/** Identidad estable de una violación (sin severidad ni línea). */
function keyOf(v: BaselineEntry): string {
  return [v.rule, v.file, v.message, v.detail ?? ''].join('|');
}

export function baselinePath(root: string): string {
  return path.join(root, BASELINE_FILE);
}

export function loadBaseline(root: string): Baseline | null {
  const file = baselinePath(root);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

/** Guarda el snapshot de violaciones actuales como baseline tolerado. */
export function saveBaseline(root: string, violations: Violation[]): string {
  const baseline: Baseline = {
    version: 1,
    updatedAt: new Date().toISOString(),
    violations: violations.map(toEntry),
  };
  const file = baselinePath(root);
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
  return file;
}

/**
 * Separa las violaciones en nuevas (no estaban en el baseline) y
 * toleradas (ya registradas — no cuentan para --ci).
 */
export function applyBaseline(
  violations: Violation[],
  baseline: Baseline
): { fresh: Violation[]; tolerated: Violation[] } {
  const known = new Set(baseline.violations.map(keyOf));
  const fresh: Violation[] = [];
  const tolerated: Violation[] = [];

  for (const v of violations) {
    (known.has(keyOf(toEntry(v))) ? tolerated : fresh).push(v);
  }
  return { fresh, tolerated };
}

/** Salida en consola tras guardar el baseline. */
export function printBaselineSaved(file: string, count: number): void {
  console.log(chalk.green(`  ✔ Baseline guardado en ${file}`));
  console.log(
    chalk.gray(
      `    ${count} violación(es) tolerada(s). Los próximos scans solo fallarán con violaciones NUEVAS.`
    )
  );
  console.log('');
}
