import * as fs from 'fs';
import * as path from 'path';

export interface WatcherOptions {
  root: string;
  ignoredFolders?: string[];
  onChange: (changedRelativePath: string) => void;
}

const DEFAULT_IGNORED = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.expo',
  'artifacts',
  '.gemini',
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);

/**
 * Observador de archivos ligero usando fs.watch recursivo con debouncing.
 */
export function startWatcher(options: WatcherOptions): { close: () => void } {
  const ignored = new Set([...DEFAULT_IGNORED, ...(options.ignoredFolders ?? [])]);
  let debounceTimer: NodeJS.Timeout | null = null;
  let lastChangedFile = '';

  const watcher = fs.watch(
    options.root,
    { recursive: true },
    (_eventType, rawFilename) => {
      if (!rawFilename) return;
      const filename = String(rawFilename).replace(/\\/g, '/');

      // Ignorar archivos de reporte autogenerados
      if (filename.includes('autopsia-report.html') || filename.includes('autopsia-baseline.json')) {
        return;
      }

      // Ignorar carpetas excluidas
      const segments = filename.split('/');
      if (segments.some((seg) => ignored.has(seg))) return;

      // Filtrar extensiones relevantes
      const ext = path.extname(filename).toLowerCase();
      if (!EXTENSIONS.has(ext)) return;

      lastChangedFile = filename;
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        options.onChange(lastChangedFile);
      }, 200);
    }
  );

  return {
    close: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
    },
  };
}
