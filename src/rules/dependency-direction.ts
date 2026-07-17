import { AutopsiaConfig, FileNode, Violation } from '../types';
import { isSuppressed } from '../ignores';

/**
 * Regla 1 — Dirección de dependencias.
 * Cada capa solo puede importar de las capas listadas en allowedDependencies.
 * Los imports "type-only" se excluyen (no generan acoplamiento en runtime).
 */
export function checkDependencyDirection(
  nodes: FileNode[],
  config: AutopsiaConfig
): Violation[] {
  const violations: Violation[] = [];
  const layerByPath = new Map(nodes.map((n) => [n.path, n.layer]));
  const rules = new Map(
    config.layers.map((l) => [l.name, l.allowedDependencies ?? null])
  );

  for (const node of nodes) {
    if (!node.layer) continue;
    const allowed = rules.get(node.layer);
    if (allowed === null || allowed === undefined) continue;

    for (const imp of node.internalImports) {
      const targetLayer = layerByPath.get(imp);
      if (!targetLayer || targetLayer === node.layer) continue;

      if (!allowed.includes(targetLayer)) {
        const violation: Violation = {
          rule: 'dependency-direction',
          severity: 'error',
          file: node.path,
          message: `Capa "${node.layer}" no puede depender de "${targetLayer}"`,
          detail: `importa ${imp}`,
        };
        if (isSuppressed(node, 'dependency-direction', { internal: imp })) {
          violation.suppressed = true;
        }
        violations.push(violation);
      }
    }
  }

  return violations;
}
