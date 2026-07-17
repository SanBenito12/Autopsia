import { FileNode, Violation } from '../types';
import { isSuppressed } from '../ignores';

/**
 * Regla 4 — Dependencias circulares.
 * DFS con detección de back-edges. Reporta cada ciclo una sola vez.
 */
export function checkCircularDeps(nodes: FileNode[]): Violation[] {
  const graph = new Map<string, string[]>(
    nodes.map((n) => [n.path, n.internalImports.filter((i) => graphHas(nodes, i))])
  );

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seenCycles = new Set<string>();

  function graphHas(all: FileNode[], p: string): boolean {
    return all.some((n) => n.path === p);
  }

  function dfs(node: string): void {
    color.set(node, GRAY);
    stack.push(node);

    for (const next of graph.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(next);
        const cycle = stack.slice(start);
        const key = [...cycle].sort().join('→');
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          cycles.push([...cycle, next]);
        }
      } else if (c === WHITE) {
        dfs(next);
      }
    }

    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) dfs(node);
  }

  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));

  // Un ciclo queda suprimido si cualquiera de sus aristas (import) tiene
  // un comentario autopsia-ignore para esta regla.
  const cycleSuppressed = (cycle: string[]): boolean => {
    for (let i = 0; i < cycle.length - 1; i++) {
      const from = nodeByPath.get(cycle[i]);
      if (from && isSuppressed(from, 'circular-deps', { internal: cycle[i + 1] })) return true;
    }
    return false;
  };

  return cycles.map((cycle) => {
    const violation: Violation = {
      rule: 'circular-deps',
      severity: 'error',
      file: cycle[0],
      message: `Dependencia circular detectada (${cycle.length - 1} archivos)`,
      detail: cycle.join(' → '),
    };
    if (cycleSuppressed(cycle)) violation.suppressed = true;
    return violation;
  });
}
