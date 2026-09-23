import { format } from "../i18n";
import { AutopsiaConfig, Dependency, FileNode, Violation } from '../types';
import { dependencySuppressed, isSuppressed } from '../ignores';

function matchesModule(imported: string, configured: string): boolean {
  return imported === configured || imported.startsWith(configured + '/');
}

/**
 * Regla 3 — Módulos externos prohibidos por capa.
 * Caso típico: domain importando react, react-native, axios o @supabase/*.
 * El domain debe ser TypeScript puro.
 */
export function checkForbiddenExternal(
  nodes: FileNode[],
  config: AutopsiaConfig
): Violation[] {
  const violations: Violation[] = [];
  const forbiddenByLayer = new Map(
    config.layers
      .filter((l) => l.forbiddenExternal && l.forbiddenExternal.length > 0)
      .map((l) => [l.name, l.forbiddenExternal as string[]])
  );

  for (const node of nodes) {
    if (!node.layer) continue;
    const forbidden = forbiddenByLayer.get(node.layer);
    if (!forbidden) continue;

    const occurrences = node.dependencies
      ? node.dependencies.filter((d) => d.external && node.externalImports.includes(d.specifier))
      : node.externalImports.map((specifier) => ({ specifier }));
    for (const occurrence of occurrences) {
      const ext = occurrence.specifier;
      const hit = forbidden.find((f) => matchesModule(ext, f));
      if (hit) {
        const evidence = 'kind' in occurrence ? occurrence as Dependency : undefined;
        const violation: Violation = { diagnostic: { message: { code: "rule.external", params: {p0: node.layer, p1: ext} }, detail: { code: "rule.free", params: {p0: hit} } },
          rule: 'forbidden-external',
          severity: 'error',
          file: node.path,
          line: evidence?.line,
          message: format("rule.external", {p0: node.layer, p1: ext}, "es"),
          detail: format("rule.free", {p0: hit}, "es"),
        };
        if (evidence ? dependencySuppressed(evidence, 'forbidden-external') : isSuppressed(node, 'forbidden-external', { external: ext })) {
          violation.suppressed = true;
        }
        violations.push(violation);
      }
    }
  }

  return violations;
}
