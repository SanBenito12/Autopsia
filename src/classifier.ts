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

export function classifyFile(relPath: string, config: AutopsiaConfig): string | null {
  const normalized = relPath.replace(/\\/g, '/');
  for (const layer of config.layers) {
    for (const pattern of layer.patterns) {
      if (patternToRegex(pattern).test(normalized)) {
        return layer.name;
      }
    }
  }
  return null;
}
