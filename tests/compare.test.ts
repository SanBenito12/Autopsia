import { describe, expect, it } from 'vitest';
import { compareReports } from '../src/compare';
import { ScanResult, Violation } from '../src/types';

const v: Violation = { rule: 'direct-data-access', severity: 'error', file: 'src/screen.ts', message: 'axios', line: 1 };
function report(violations: Violation[], tolerated: Violation[] = [], classifiedFiles = 1): ScanResult {
  return { totalFiles: 2, violations, tolerated, analysis: { classifiedFiles } } as ScanResult;
}
describe('comparación histórica', () => {
  it('distingue duplicados nuevos, deuda resuelta y persistente aunque cambie de baseline o línea', () => {
    const fixed = { ...v, file: 'src/fixed.ts' };
    const comparison = compareReports(report([fixed], [v]), report([{ ...v, line: 20 }, { ...v, line: 30 }], [], 2));
    expect(comparison.added).toEqual([{ ...v, line: 30 }]);
    expect(comparison.resolved).toEqual([fixed]);
    expect(comparison.persistent).toEqual([{ ...v, line: 20 }]);
    expect(comparison.coverage).toEqual({ previous: 50, current: 100, delta: 50 });
  });
  it('no inventa cobertura para reportes antiguos o vacíos', () => {
    const old = { ...report([]), analysis: undefined };
    const current = { ...report([]), totalFiles: 0 };
    expect(compareReports(old, current).coverage).toEqual({ previous: null, current: null, delta: null });
  });
});
