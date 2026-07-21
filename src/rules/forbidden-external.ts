import { AutopsiaConfig, FileNode, Violation } from '../types';
import { isSuppressed } from '../ignores';

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

    for (const ext of node.externalImports) {
      const hit = forbidden.find((f) => matchesModule(ext, f));
      if (hit) {
        const evidence = node.dependencies?.find((dependency) => dependency.specifier === ext);
        const violation: Violation = {
          rule: 'forbidden-external',
          severity: 'error',
          file: node.path,
          line: evidence?.line,
          message: `Capa "${node.layer}" importa módulo prohibido "${ext}"`,
          detail: `La capa debe mantenerse libre de "${hit}"`,
        };
        if (isSuppressed(node, 'forbidden-external', { external: ext })) {
          violation.suppressed = true;
        }
        violations.push(violation);
      }
    }
  }

  return violations;
}
