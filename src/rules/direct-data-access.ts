import { AutopsiaConfig, Dependency, FileNode, Violation } from '../types';
import { dependencySuppressed, isSuppressed } from '../ignores';

function matchesModule(imported: string, configured: string): boolean {
  return imported === configured || imported.startsWith(configured + '/');
}

/**
 * Regla 2 — Acceso directo a datos en la UI.
 * Pantallas/componentes importando axios, fetch wrappers, clientes de
 * Supabase, etc., saltándose repositorios y casos de uso.
 */
export function checkDirectDataAccess(
  nodes: FileNode[],
  config: AutopsiaConfig
): Violation[] {
  const violations: Violation[] = [];
  const forbiddenLayers = new Set(config.noDirectDataAccessIn);

  for (const node of nodes) {
    if (!node.layer || !forbiddenLayers.has(node.layer)) continue;

    const occurrences = node.dependencies
      ? node.dependencies.filter((d) => d.external && node.externalImports.includes(d.specifier))
      : node.externalImports.map((specifier) => ({ specifier }));
    for (const occurrence of occurrences) {
      const ext = occurrence.specifier;
      const hit = config.dataAccessModules.find((m) => matchesModule(ext, m));
      if (hit) {
        const evidence = 'kind' in occurrence ? occurrence as Dependency : undefined;
        const violation: Violation = {
          rule: 'direct-data-access',
          severity: 'error',
          file: node.path,
          line: evidence?.line,
          message: `Acceso directo a datos/red ("${ext}") en capa "${node.layer}"`,
          detail: 'Debe pasar por un repositorio o caso de uso',
        };
        if (evidence ? dependencySuppressed(evidence, 'direct-data-access') : isSuppressed(node, 'direct-data-access', { external: ext })) {
          violation.suppressed = true;
        }
        violations.push(violation);
      }
    }
  }

  return violations;
}
