export interface LayerConfig {
  /** Nombre de la capa, p. ej. "presentation" */
  name: string;
  /** Patrones de ruta (substring o glob simple con *) que identifican la capa */
  patterns: string[];
  /**
   * Capas de las que ESTA capa puede depender.
   * Si es null/omitido, no hay restricción.
   */
  allowedDependencies?: string[];
  /**
   * Módulos externos (npm) prohibidos en esta capa.
   * Soporta prefijos: "@supabase" bloquea "@supabase/supabase-js".
   */
  forbiddenExternal?: string[];
}

export interface AutopsiaConfig {
  layers: LayerConfig[];
  /** Módulos externos que se consideran "acceso directo a datos/red" */
  dataAccessModules: string[];
  /** Capas donde el acceso directo a datos es violación (típicamente presentation) */
  noDirectDataAccessIn: string[];
  /** Carpetas a ignorar */
  ignore?: string[];
}

/**
 * Reglas suprimidas por comentarios `autopsia-ignore-*`, por import.
 * La clave es la ruta resuelta (internos) o el especificador (externos);
 * el valor es la lista de reglas suprimidas, donde "*" significa todas.
 */
export interface FileSuppressions {
  internal: Record<string, string[]>;
  external: Record<string, string[]>;
}

export interface FileNode {
  /** Ruta relativa al root escaneado */
  path: string;
  layer: string | null;
  /** Imports internos resueltos (rutas relativas al root) */
  internalImports: string[];
  /** Imports externos (paquetes npm / react-native) */
  externalImports: string[];
  /** Solo imports de tipos (import type ...) — se excluyen de reglas de dependencia */
  typeOnlyImports: string[];
  /** Solo presente si el archivo tiene comentarios autopsia-ignore */
  suppressions?: FileSuppressions;
}

export type Severity = 'error' | 'warning';

export interface Violation {
  rule: string;
  severity: Severity;
  file: string;
  line?: number;
  message: string;
  detail?: string;
  /** true si un comentario autopsia-ignore la suprime (se cuenta, no se reporta) */
  suppressed?: boolean;
}

export interface ScanResult {
  scannedAt: string;
  root: string;
  totalFiles: number;
  filesByLayer: Record<string, number>;
  /** Violaciones activas (nuevas respecto al baseline, si existe) */
  violations: Violation[];
  /** Violaciones ya registradas en autopsia-baseline.json — no fallan --ci */
  tolerated?: Violation[];
  /** Violaciones suprimidas con comentarios autopsia-ignore (solo conteo) */
  suppressedCount?: number;
  healthByLayer: Record<string, number>;
  graph: FileNode[];
}
