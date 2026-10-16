import * as fs from 'fs';
import * as path from 'path';
import { ts } from 'ts-morph';
import { AnalysisIssue } from './types';
import { format } from './i18n';

export interface LoadedTsconfig {
  path: string;
  options: ts.CompilerOptions;
  issues: AnalysisIssue[];
  malformed: boolean;
}

const RN_MODULE_SUFFIXES = ['', '.ios', '.android', '.native', '.web'];

/** Resolve configuration through TypeScript, without typechecking application code. */
export function loadTsconfig(root: string, explicit?: string): LoadedTsconfig {
  const filename = (explicit ? path.resolve(explicit) : path.join(root, 'tsconfig.json')).replace(/\\/g, '/');
  const fallback: ts.CompilerOptions = {
    allowJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    moduleSuffixes: RN_MODULE_SUFFIXES,
  };
  if (!fs.existsSync(filename) && !explicit) return { path: filename, options: fallback, issues: [], malformed: false };
  const read = ts.readConfigFile(filename, ts.sys.readFile);
  const basePath = path.dirname(filename).replace(/\\/g, '/');
  const parsed = read.error ? undefined : ts.parseJsonConfigFileContent(read.config, ts.sys, basePath, undefined, filename);
  // Autopsia selects its own TS/TSX files: an empty include/files set is not a loading failure.
  const diagnostics = read.error ? [read.error] : (parsed?.errors ?? []).filter(d => d.code !== 18003 && d.code !== 18002);
  const options: ts.CompilerOptions = parsed?.options
    ? { ...parsed.options, moduleSuffixes: parsed.options.moduleSuffixes ?? RN_MODULE_SUFFIXES }
    : fallback;
  return { path: filename, options,
    malformed: diagnostics.some(d => d.code < 2000 || d.code === 5023 || d.code === 5024),
    issues: diagnostics.map(d => {
      const detail = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      return { kind: 'tsconfig-error', file: d.file?.fileName ?? filename,
        ...(d.file && d.start !== undefined ? { line: d.file.getLineAndCharacterOfPosition(d.start).line + 1 } : {}),
        message: format('doctor.tsconfigError', { p0: d.code }, 'es'), detail,
        diagnostic: { message: { code: 'doctor.tsconfigError', params: { p0: d.code } } } };
    }) };
}
