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

/** Nivel de una regla: error (default, falla --ci), warning (no falla) u off */
export type RuleLevel = 'error' | 'warning' | 'off';

export interface AutopsiaConfig {
  layers: LayerConfig[];
  /** Módulos externos que se consideran "acceso directo a datos/red" */
  dataAccessModules: string[];
  /** Capas donde el acceso directo a datos es violación (típicamente presentation) */
  noDirectDataAccessIn: string[];
  /** Carpetas a ignorar */
  ignore?: string[];
  /** Severidad por regla. Si se omite, todas corren como "error". */
  rules?: Record<string, RuleLevel>;
  /**
   * Exige cobertura arquitectónica completa: todos los archivos deben pertenecer
   * a una sola capa y todos los imports internos deben poder resolverse.
   */
  strict?: boolean;
}

export type DependencyKind = 'import' | 'dynamic-import' | 'require' | 're-export';

/** Evidencia de una dependencia encontrada en el AST. */
export interface Dependency {
  /** Texto escrito en el módulo, p. ej. "@/domain/User". */
  specifier: string;
  kind: DependencyKind;
  line: number;
  column: number;
  typeOnly: boolean;
  external: boolean;
  /** Ruta relativa al proyecto para dependencias internas resueltas. */
  resolvedPath?: string;
  /** false significa que era un import interno, pero TypeScript no pudo resolverlo. */
  resolved: boolean;
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
  /** Dependencias completas con evidencia y estado de resolución. */
  dependencies?: Dependency[];
  /** Solo presente si el archivo tiene comentarios autopsia-ignore */
  suppressions?: FileSuppressions;
}

export type AnalysisIssueKind =
  | 'invalid-config'
  | 'ambiguous-layer'
  | 'unclassified-file'
  | 'unresolved-import';

export interface AnalysisIssue {
  kind: AnalysisIssueKind;
  message: string;
  file?: string;
  line?: number;
  detail?: string;
}

export interface AnalysisCoverage {
  classifiedFiles: number;
  unclassifiedFiles: number;
  totalDependencies: number;
  resolvedInternalDependencies: number;
  unresolvedInternalDependencies: number;
  configErrors: number;
  ambiguousFiles: number;
  /** true solo cuando no quedó ninguna parte arquitectónica sin comprobar. */
  complete: boolean;
  issues: AnalysisIssue[];
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
  /** Cobertura y problemas que pueden impedir certificar el resultado. */
  analysis?: AnalysisCoverage;
}
