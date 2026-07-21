import { AutopsiaConfig, FileNode, Violation } from '../types';
import { isSuppressed } from '../ignores';

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

    for (const ext of node.externalImports) {
      const hit = config.dataAccessModules.find((m) => matchesModule(ext, m));
      if (hit) {
        const evidence = node.dependencies?.find((dependency) => dependency.specifier === ext);
        const violation: Violation = {
          rule: 'direct-data-access',
          severity: 'error',
          file: node.path,
          line: evidence?.line,
          message: `Acceso directo a datos/red ("${ext}") en capa "${node.layer}"`,
          detail: 'Debe pasar por un repositorio o caso de uso',
        };
        if (isSuppressed(node, 'direct-data-access', { external: ext })) {
          violation.suppressed = true;
        }
        violations.push(violation);
      }
    }
  }

  return violations;
}
