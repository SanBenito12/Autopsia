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

export function matchingEvidence(relPath: string, config: AutopsiaConfig): { layer: string; patterns: string[]; files: string[] }[] {
  const normalized = relPath.replace(/\\/g, '/');
  return config.layers.map(layer => ({ layer: layer.name,
    patterns: (layer.patterns ?? []).filter(pattern => patternToRegex(pattern).test(normalized)),
    files: (layer.files ?? []).filter(file => file === normalized),
  })).filter(match => match.patterns.length > 0 || match.files.length > 0);
}

export function matchingLayers(relPath: string, config: AutopsiaConfig): string[] {
  return matchingEvidence(relPath, config).map(match => match.layer);
}

export function classifyFile(relPath: string, config: AutopsiaConfig): string | null {
  return matchingLayers(relPath, config)[0] ?? null;
}
