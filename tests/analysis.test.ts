import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeAnalysisCoverage, validateConfig } from '../src/analysis';
import { buildGraph } from '../src/scanner';
import { AutopsiaConfig } from '../src/types';

let root: string;

const config: AutopsiaConfig = {
  strict: true,
  layers: [
    { name: 'presentation', patterns: ['src/presentation/*'], allowedDependencies: ['domain'] },
    { name: 'domain', patterns: ['src/domain/*'], allowedDependencies: [] },
  ],
  dataAccessModules: ['axios'],
  noDirectDataAccessIn: ['presentation'],
};

function write(rel: string, content: string): void {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf-8');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-analysis-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('dependencias completas del scanner', () => {
  it('registra imports, reexports, require e import dinámico con línea', () => {
    write('src/domain/value.ts', 'export const value = 1;\n');
    write(
      'src/presentation/screen.ts',
      [
        "import { value } from '../domain/value';",
        "export { value as publicValue } from '../domain/value';",
        "const required = require('../domain/value');",
        "const lazy = import('../domain/value');",
      ].join('\n'),
    );

    const node = buildGraph(root, config).find((item) => item.path.endsWith('screen.ts'))!;
    expect(node.dependencies?.map((dependency) => dependency.kind)).toEqual([
      'import',
      're-export',
      'require',
      'dynamic-import',
    ]);
    expect(node.dependencies?.every((dependency) => dependency.resolved)).toBe(true);
    expect(node.dependencies?.map((dependency) => dependency.line)).toEqual([1, 2, 3, 4]);
  });

  it('marca imports internos rotos y no certifica el análisis', () => {
    write('src/presentation/screen.ts', "import { missing } from './missing';\n");
    const graph = buildGraph(root, config);
    const coverage = computeAnalysisCoverage(graph, config);

    expect(coverage.complete).toBe(false);
    expect(coverage.unresolvedInternalDependencies).toBe(1);
    expect(coverage.issues[0]).toMatchObject({
      kind: 'unresolved-import',
      file: path.join('src', 'presentation', 'screen.ts'),
      line: 1,
    });
  });

  it('no trata assets como dependencias arquitectónicas sin resolver', () => {
    write('src/presentation/screen.ts', "const logo = require('./logo.png');\n");
    const coverage = computeAnalysisCoverage(buildGraph(root, config), config);
    expect(coverage.unresolvedInternalDependencies).toBe(0);
    expect(coverage.complete).toBe(true);
  });

  it('respeta rutas completas en ignore', () => {
    write('src/presentation/screen.ts', 'export const Screen = true;\n');
    write('src/legacy/old.ts', 'export const Old = true;\n');
    const graph = buildGraph(root, { ...config, ignore: ['src/legacy'] });
    expect(graph.map((node) => node.path)).toEqual([
      path.join('src', 'presentation', 'screen.ts'),
    ]);
  });
});

describe('validación y cobertura estricta', () => {
  it('detecta capas inexistentes y reglas desconocidas', () => {
    const invalid = {
      ...config,
      layers: [{ name: 'domain', patterns: ['src/*'], allowedDependencies: ['missing'] }],
      rules: { invented: 'error' },
    } as unknown as AutopsiaConfig;
    const messages = validateConfig(invalid).map((issue) => issue.message);
    expect(messages.some((message) => message.includes('capa inexistente'))).toBe(true);
    expect(messages.some((message) => message.includes('Regla desconocida'))).toBe(true);
  });

  it('detecta archivos sin capa y coincidencias ambiguas', () => {
    write('src/shared/helper.ts', 'export const helper = true;\n');
    write('src/presentation/screen.ts', 'export const Screen = true;\n');
    write('lib/orphan.ts', 'export const orphan = true;\n');
    const ambiguous: AutopsiaConfig = {
      ...config,
      layers: [
        ...config.layers,
        { name: 'all-src', patterns: ['src/*'], allowedDependencies: [] },
      ],
    };
    const coverage = computeAnalysisCoverage(buildGraph(root, ambiguous), ambiguous);
    expect(coverage.complete).toBe(false);
    expect(coverage.ambiguousFiles).toBe(1);
    expect(coverage.unclassifiedFiles).toBe(1);
    expect(coverage.issues.some((issue) => issue.kind === 'ambiguous-layer')).toBe(true);
    expect(coverage.issues.some((issue) => issue.kind === 'unclassified-file')).toBe(true);
  });
});
