import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisCoveragePercent, printReport } from '../src/reporter';
import { ScanResult } from '../src/types';

function result(): ScanResult {
  return {
    scannedAt: '2026-07-21T00:00:00.000Z',
    root: '/project',
    totalFiles: 10,
    filesByLayer: { presentation: 2, domain: 0 },
    violations: [],
    healthByLayer: { presentation: 100, domain: 100 },
    graph: [
      { path: 'src/presentation/a.ts', layer: 'presentation', internalImports: [], externalImports: [], typeOnlyImports: [] },
      { path: 'src/presentation/b.ts', layer: 'presentation', internalImports: [], externalImports: [], typeOnlyImports: [] },
    ],
    analysis: {
      classifiedFiles: 2,
      unclassifiedFiles: 8,
      totalDependencies: 1,
      resolvedInternalDependencies: 0,
      unresolvedInternalDependencies: 1,
      configErrors: 0,
      ambiguousFiles: 0,
      complete: false,
      issues: [
        ...Array.from({ length: 8 }, (_, index) => ({
          kind: 'unclassified-file' as const,
          file: `src/feature-${index}.ts`,
          message: 'El archivo no pertenece a ninguna capa',
        })),
        {
          kind: 'unresolved-import',
          file: 'src/presentation/a.ts',
          line: 1,
          message: 'No se pudo resolver el import interno "./missing"',
        },
      ],
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('reporte de cobertura', () => {
  it('calcula el porcentaje clasificado', () => {
    expect(analysisCoveragePercent(result())).toBe(20);
  });

  it('muestra N/A, configuración insuficiente y grupos separados', () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => output.push(args.join(' ')));
    printReport(result());
    const text = output.join('\n');

    expect(text).toContain('N/A (0 archivos)');
    expect(text).toContain('CONFIGURACIÓN INSUFICIENTE');
    expect(text).toContain('Archivos sin capa — 8');
    expect(text).toContain('Imports internos sin resolver — 1');
    expect(text).toContain('20% (2 / 10 archivos)');
  });
});
