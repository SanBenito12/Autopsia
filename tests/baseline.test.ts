import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyBaseline,
  Baseline,
  baselinePath,
  loadBaseline,
  saveBaseline,
} from '../src/baseline';
import { Violation } from '../src/types';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-baseline-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function violation(overrides: Partial<Violation> = {}): Violation {
  return {
    rule: 'dependency-direction',
    severity: 'error',
    file: path.join('src', 'presentation', 'screens', 'HomeScreen.tsx'),
    message: 'Capa "presentation" no puede depender de "data"',
    detail: `importa ${path.join('src', 'data', 'repositories', 'EventRepository.ts')}`,
    ...overrides,
  };
}

describe('saveBaseline / loadBaseline', () => {
  it('crea autopsia-baseline.json con formato estable (sin líneas, rutas POSIX)', () => {
    const v = violation({ line: 42 });
    const file = saveBaseline(tmpRoot, [v]);

    expect(file).toBe(baselinePath(tmpRoot));
    expect(fs.existsSync(file)).toBe(true);

    const baseline = loadBaseline(tmpRoot)!;
    expect(baseline.version).toBe(1);
    expect(baseline.violations).toHaveLength(1);

    const [entry] = baseline.violations;
    expect(entry).not.toHaveProperty('line');
    expect(entry).not.toHaveProperty('severity');
    expect(entry.file).toBe('src/presentation/screens/HomeScreen.tsx');
    expect(entry.detail).toBe('importa src/data/repositories/EventRepository.ts');
  });

  it('sin baseline en disco, loadBaseline devuelve null', () => {
    expect(loadBaseline(tmpRoot)).toBeNull();
  });
});

describe('applyBaseline', () => {
  it('tolera una violación que ya estaba en el baseline', () => {
    const old = violation();
    saveBaseline(tmpRoot, [old]);

    const { fresh, tolerated } = applyBaseline([old], loadBaseline(tmpRoot)!);
    expect(fresh).toHaveLength(0);
    expect(tolerated).toEqual([old]);
  });

  it('la tolera aunque la línea haya cambiado (la identidad ignora líneas)', () => {
    saveBaseline(tmpRoot, [violation({ line: 3 })]);

    const moved = violation({ line: 99 });
    const { fresh, tolerated } = applyBaseline([moved], loadBaseline(tmpRoot)!);
    expect(fresh).toHaveLength(0);
    expect(tolerated).toEqual([moved]);
  });

  it('detecta como nueva una violación que no estaba en el baseline', () => {
    saveBaseline(tmpRoot, [violation()]);

    const nueva = violation({
      rule: 'direct-data-access',
      message: 'Acceso directo a datos/red ("axios") en capa "presentation"',
      detail: 'Debe pasar por un repositorio o caso de uso',
    });
    const { fresh, tolerated } = applyBaseline([violation(), nueva], loadBaseline(tmpRoot)!);
    expect(fresh).toEqual([nueva]);
    expect(tolerated).toEqual([violation()]);
  });

  it('actualizar el baseline elimina las toleradas ya arregladas', () => {
    const a = violation();
    const b = violation({
      file: path.join('src', 'presentation', 'screens', 'ProfileScreen.tsx'),
    });
    saveBaseline(tmpRoot, [a, b]);
    expect(loadBaseline(tmpRoot)!.violations).toHaveLength(2);

    // b se arregló: al regenerar el baseline solo queda a
    saveBaseline(tmpRoot, [a]);
    const updated = loadBaseline(tmpRoot)!;
    expect(updated.violations).toHaveLength(1);
    expect(updated.violations[0].file).toBe('src/presentation/screens/HomeScreen.tsx');

    // …y b volvería a reportarse como nueva si reaparece
    const { fresh } = applyBaseline([a, b], updated);
    expect(fresh).toEqual([b]);
  });
});

describe('formato del archivo', () => {
  it('es JSON legible y diffeable (indentado, con newline final)', () => {
    saveBaseline(tmpRoot, [violation()]);
    const raw = fs.readFileSync(baselinePath(tmpRoot), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    const parsed: Baseline = JSON.parse(raw);
    expect(parsed.violations[0].rule).toBe('dependency-direction');
  });
});
