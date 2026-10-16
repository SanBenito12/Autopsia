import { format } from '../i18n';
import { AutopsiaConfig, Dependency, FileNode, Violation } from '../types';
import { dependencySuppressed, isSuppressed } from '../ignores';

export interface FeatureInfo {
  featureName: string;
  featureDir: string;
}

/**
 * Determina si una ruta pertenece a una feature según los patrones configurados.
 * Patrones típicos: ["src/features/*", "features/*", "src/modules/*"]
 */
export function getFeatureInfo(filePath: string, patterns: string[]): FeatureInfo | null {
  const normalized = filePath.replace(/\\/g, '/');
  for (const rawPattern of patterns) {
    const pattern = rawPattern.replace(/\\/g, '/');
    let prefix = pattern;
    if (prefix.endsWith('/*')) {
      prefix = prefix.slice(0, -2);
    } else if (prefix.endsWith('/')) {
      prefix = prefix.slice(0, -1);
    }

    const checkPrefix = prefix ? prefix + '/' : '';
    if (checkPrefix === '' || normalized.startsWith(checkPrefix)) {
      const rest = normalized.slice(checkPrefix.length);
      const segments = rest.split('/');
      if (segments.length >= 1 && segments[0].length > 0) {
        const featureName = segments[0];
        const featureDir = prefix ? `${prefix}/${featureName}` : featureName;
        return { featureName, featureDir };
      }
    }
  }
  return null;
}

/**
 * Determina si una ruta corresponde al punto de entrada público de una feature.
 * Ejemplos válidos: features/auth/index.ts, features/auth/index.tsx, features/auth/public.ts
 */
export function isPublicApiFile(filePath: string, featureDir: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized === featureDir) return true;
  if (!normalized.startsWith(featureDir + '/')) return false;
  const rel = normalized.slice(featureDir.length + 1);
  return /^(index|public)(\.(ios|android|native|web))?\.(ts|tsx|js|jsx|d\.ts)$/.test(rel);
}

/**
 * Regla: Aislamiento entre Features y Protección de API Pública.
 * - Impide importar submódulos privados de otra feature (debe pasar por su index.ts).
 * - Respeta allowedCrossImports si está configurado.
 */
export function checkFeatureBoundaries(
  nodes: FileNode[],
  config: AutopsiaConfig
): Violation[] {
  if (!config.features) return [];

  const patterns = config.features.patterns && config.features.patterns.length > 0
    ? config.features.patterns
    : ['src/features/*', 'features/*'];

  const enforcePublicApi = config.features.enforcePublicApi !== false;
  const allowedCross = config.features.allowedCrossImports ?? null;

  const violations: Violation[] = [];

  for (const node of nodes) {
    const sourceFeature = getFeatureInfo(node.path, patterns);

    const occurrences = node.dependencies
      ? node.dependencies.filter((d) => !d.external && d.resolvedPath && !d.typeOnly)
      : node.internalImports.map((resolvedPath) => ({ resolvedPath }));

    for (const occurrence of occurrences) {
      const imp = occurrence.resolvedPath!;
      const targetFeature = getFeatureInfo(imp, patterns);

      // Si el destino no es una feature, no aplica esta regla
      if (!targetFeature) continue;

      // Si ambos están en la misma feature, la importación interna es completamente válida
      if (sourceFeature && sourceFeature.featureName === targetFeature.featureName) continue;

      const evidence = 'kind' in occurrence ? (occurrence as Dependency) : undefined;

      // 1. Validar si los imports cruzados entre estas features están permitidos
      if (sourceFeature && allowedCross) {
        const allowedForSource = allowedCross[sourceFeature.featureName];
        if (allowedForSource !== undefined && !allowedForSource.includes(targetFeature.featureName)) {
          const violation: Violation = {
            diagnostic: {
              message: {
                code: 'rule.featureBoundaries.disallowed',
                params: { p0: sourceFeature.featureName, p1: targetFeature.featureName },
              },
              detail: { code: 'rule.import', params: { p0: imp } },
            },
            rule: 'feature-boundaries',
            severity: 'error',
            file: node.path,
            line: evidence?.line,
            message: format(
              'rule.featureBoundaries.disallowed',
              { p0: sourceFeature.featureName, p1: targetFeature.featureName },
              'es'
            ),
            detail: format('rule.import', { p0: imp }, 'es'),
          };

          if (
            evidence
              ? dependencySuppressed(evidence, 'feature-boundaries')
              : isSuppressed(node, 'feature-boundaries', { internal: imp })
          ) {
            violation.suppressed = true;
          }

          violations.push(violation);
          continue;
        }
      }

      // 2. Validar que se use la API pública (index.ts) y no archivos privados
      if (enforcePublicApi && !isPublicApiFile(imp, targetFeature.featureDir)) {
        const callerName = sourceFeature ? sourceFeature.featureName : node.path;
        const violation: Violation = {
          diagnostic: {
            message: {
              code: 'rule.featureBoundaries.private',
              params: { p0: callerName, p1: targetFeature.featureName },
            },
            detail: {
              code: 'rule.featureBoundaries.publicHint',
              params: { p0: targetFeature.featureName, p1: imp },
            },
          },
          rule: 'feature-boundaries',
          severity: 'error',
          file: node.path,
          line: evidence?.line,
          message: format(
            'rule.featureBoundaries.private',
            { p0: callerName, p1: targetFeature.featureName },
            'es'
          ),
          detail: format(
            'rule.featureBoundaries.publicHint',
            { p0: targetFeature.featureName, p1: imp },
            'es'
          ),
        };

        if (
          evidence
            ? dependencySuppressed(evidence, 'feature-boundaries')
            : isSuppressed(node, 'feature-boundaries', { internal: imp })
        ) {
          violation.suppressed = true;
        }

        violations.push(violation);
      }
    }
  }

  return violations;
}
