import { AutopsiaConfig } from './types';

/**
 * Convierte un patrón simple con asterisco a RegExp.
 * Ej: "src/presentation/(asterisco)" matchea cualquier archivo bajo esa carpeta.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\//g, '[\\/\\\\]');
  return new RegExp(escaped, 'i');
}

export function matchingLayers(relPath: string, config: AutopsiaConfig): string[] {
  const normalized = relPath.replace(/\\/g, '/');
  return config.layers
    .filter((layer) => layer.patterns.some((pattern) => patternToRegex(pattern).test(normalized)))
    .map((layer) => layer.name);
}

export function classifyFile(relPath: string, config: AutopsiaConfig): string | null {
  return matchingLayers(relPath, config)[0] ?? null;
}
