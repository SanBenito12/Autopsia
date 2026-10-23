/** Paleta categórica para capas, derivada de la tinción H&E (sin rosa: el rosa es para violaciones). */
const LAYER_VARS = ['--layer-1', '--layer-2', '--layer-3', '--layer-4', '--layer-5', '--layer-6', '--layer-7', '--layer-8'];

export function layerColor(layers: string[], layer: string | null): string {
  if (!layer) return 'var(--layer-none)';
  const index = layers.indexOf(layer);
  return `var(${LAYER_VARS[(index < 0 ? 0 : index) % LAYER_VARS.length]})`;
}

export const basename = (p: string) => p.split('/').pop() ?? p;
export const dirname = (p: string) => p.split('/').slice(0, -1).join('/');
