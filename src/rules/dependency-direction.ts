import { format } from "../i18n";
import { AutopsiaConfig, Dependency, FileNode, Violation } from '../types';
import { dependencySuppressed, isSuppressed } from '../ignores';

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

    const occurrences = node.dependencies
      ? node.dependencies.filter((d) => !d.external && d.resolvedPath && !d.typeOnly)
      : node.internalImports.map((resolvedPath) => ({ resolvedPath }));
    for (const occurrence of occurrences) {
      const imp = occurrence.resolvedPath!;
      const targetLayer = layerByPath.get(imp);
      if (!targetLayer || targetLayer === node.layer) continue;

      if (!allowed.includes(targetLayer)) {
        const evidence = 'kind' in occurrence ? occurrence as Dependency : undefined;
        const violation: Violation = { diagnostic: { message: { code: "rule.direction", params: {p0: node.layer, p1: targetLayer} }, detail: { code: "rule.import", params: {p0: imp} } },
          rule: 'dependency-direction',
          severity: 'error',
          file: node.path,
          line: evidence?.line,
          message: format("rule.direction", {p0: node.layer, p1: targetLayer}, "es"),
          detail: format("rule.import", {p0: imp}, "es"),
        };
        if (evidence ? dependencySuppressed(evidence, 'dependency-direction') : isSuppressed(node, 'dependency-direction', { internal: imp })) {
          violation.suppressed = true;
        }
        violations.push(violation);
      }
    }
  }

  return violations;
}
