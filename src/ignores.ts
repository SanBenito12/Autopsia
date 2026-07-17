import { FileNode } from './types';

/**
 * Comentarios de escape para excepciones documentadas:
 *
 *   // autopsia-ignore-next-line <regla> [-- razón]   → suprime en la línea siguiente
 *   // autopsia-ignore-file <regla> [-- razón]        → suprime en todo el archivo
 *
 * Sin nombre de regla se suprimen TODAS (mala práctica: mejor nombrar la
 * regla y dejar la razón tras "--" para que la excepción quede documentada).
 */

const DIRECTIVE_RE = /^\s*\/\/\s*autopsia-ignore-(next-line|file)(?:\s+(.*))?$/;

export interface IgnoreDirectives {
  /** Reglas suprimidas en todo el archivo ("*" = todas) */
  fileRules: string[];
  /** Línea (1-indexed) → reglas suprimidas en esa línea */
  lineRules: Map<number, string[]>;
}

/** Extrae la regla del texto tras la directiva: primer token antes de "--". */
function parseRule(rest: string | undefined): string {
  const beforeReason = (rest ?? '').split('--')[0].trim();
  return beforeReason === '' ? '*' : beforeReason.split(/\s+/)[0];
}

export function parseIgnoreDirectives(sourceText: string): IgnoreDirectives {
  const fileRules: string[] = [];
  const lineRules = new Map<number, string[]>();

  sourceText.split(/\r?\n/).forEach((line, idx) => {
    const m = line.match(DIRECTIVE_RE);
    if (!m) return;
    const rule = parseRule(m[2]);
    if (m[1] === 'file') {
      fileRules.push(rule);
    } else {
      // idx es 0-indexed; la directiva aplica a la línea siguiente (idx + 2 en 1-indexed)
      const target = idx + 2;
      lineRules.set(target, [...(lineRules.get(target) ?? []), rule]);
    }
  });

  return { fileRules, lineRules };
}

/** ¿Está la regla suprimida para este import por un comentario autopsia-ignore? */
export function isSuppressed(
  node: FileNode,
  rule: string,
  imp: { internal?: string; external?: string }
): boolean {
  const s = node.suppressions;
  if (!s) return false;
  const rules =
    imp.internal !== undefined ? s.internal[imp.internal] : s.external[imp.external ?? ''];
  return rules !== undefined && (rules.includes('*') || rules.includes(rule));
}
