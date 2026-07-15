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
}

export type Severity = 'error' | 'warning';

export interface Violation {
  rule: string;
  severity: Severity;
  file: string;
  line?: number;
  message: string;
  detail?: string;
}

export interface ScanResult {
  scannedAt: string;
  root: string;
  totalFiles: number;
  filesByLayer: Record<string, number>;
  violations: Violation[];
  healthByLayer: Record<string, number>;
  graph: FileNode[];
}
