import type { AnalysisIssue, ReportComparison, ScanResult, Violation } from '../../../src/types';

export type { AnalysisIssue, ReportComparison, ScanResult, Violation };
export type Lang = 'es' | 'en';
export type InitPreset = 'auto' | 'react-native' | 'expo';

export type ProjectStatus = 'clean' | 'issues' | 'no-config' | 'error' | 'unknown';

export interface RecentProject {
  root: string;
  name: string;
  lastOpenedAt: string;
  status: ProjectStatus;
  newCount?: number;
}

/** Mensajes ya traducidos al idioma pedido; el renderer solo los muestra. */
export interface ScanOk {
  ok: true;
  result: ScanResult;
  configPath: string;
  /** Aristas source|target que violan reglas (para pintar el grafo). */
  edges: string[];
  coveragePercent: number;
  hasBaseline: boolean;
  durationMs: number;
}
export interface ScanFail {
  ok: false;
  error: { code: string; message: string; configPath?: string; issues?: AnalysisIssue[] };
}
export type ScanResponse = ScanOk | ScanFail;

export interface DoctorIssueView {
  code: string;
  file?: string;
  line?: number;
  message: string;
  detail?: string;
  recommendation: string;
}
export interface DoctorView {
  status: 'ready' | 'incomplete' | 'error';
  configPath: string;
  tsconfigPath: string;
  typescriptVersion: string;
  totalFiles: number;
  classifiedFiles: number | null;
  detected: { name: string; folders: string[] }[];
  issues: DoctorIssueView[];
}

export interface InitPreview {
  configExists: boolean;
  configPath: string;
  json: string;
  example: boolean;
  coverage: { totalFiles: number; classifiedFiles: number; percent: number; unclassifiedExamples: string[] };
}

export type EngineResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface AutopsiaApi {
  pickFolder(): Promise<string | null>;
  scan(root: string, lang: Lang): Promise<EngineResult<ScanResponse>>;
  doctor(root: string, lang: Lang): Promise<EngineResult<DoctorView>>;
  initPreview(root: string, preset: InitPreset): Promise<EngineResult<InitPreview>>;
  initWrite(root: string, preset: InitPreset, force: boolean): Promise<EngineResult<{ configPath: string }>>;
  updateBaseline(root: string): Promise<EngineResult<{ file: string; count: number }>>;
  compare(root: string, lang: Lang): Promise<EngineResult<ReportComparison | null>>;
  exportJson(root: string, lang: Lang): Promise<EngineResult<string | null>>;
  exportHtml(root: string, lang: Lang): Promise<EngineResult<string | null>>;
  openInEditor(root: string, file: string, line?: number): Promise<void>;
  revealInFinder(target: string): Promise<void>;
  takePendingOpen(): Promise<string | null>;
  recents(): Promise<RecentProject[]>;
  forgetRecent(root: string): Promise<RecentProject[]>;
  renameRecent(root: string, name: string): Promise<RecentProject[]>;
  rememberStatus(root: string, status: ProjectStatus, newCount?: number): Promise<RecentProject[]>;
  watch(root: string | null): Promise<void>;
  onWatchChange(listener: (file: string) => void): () => void;
  onMenu(listener: (command: MenuCommand) => void): () => void;
  onOpenPath(listener: (root: string) => void): () => void;
  pathForFile(file: File): string;
}

export type MenuCommand = 'open' | 'rescan' | 'export' | 'tab:findings' | 'tab:graph' | 'tab:doctor' | 'tab:config' | 'toggle-watch' | 'tour';
