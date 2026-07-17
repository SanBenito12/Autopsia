import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseIgnoreDirectives } from '../src/ignores';
import { buildGraph } from '../src/scanner';
import { checkDependencyDirection } from '../src/rules/dependency-direction';
import { checkDirectDataAccess } from '../src/rules/direct-data-access';
import { checkCircularDeps } from '../src/rules/circular-deps';
import { AutopsiaConfig } from '../src/types';

describe('parseIgnoreDirectives', () => {
  it('extrae next-line con regla y razón', () => {
    const { fileRules, lineRules } = parseIgnoreDirectives(
      [
        'import x from "x";',
        '// autopsia-ignore-next-line direct-data-access -- API legacy, migración en curso',
        'import axios from "axios";',
      ].join('\n')
    );
    expect(fileRules).toEqual([]);
    expect(lineRules.get(3)).toEqual(['direct-data-access']);
  });

  it('next-line sin regla suprime todas ("*")', () => {
    const { lineRules } = parseIgnoreDirectives('// autopsia-ignore-next-line\nimport a from "a";');
    expect(lineRules.get(2)).toEqual(['*']);
  });

  it('extrae ignore-file con y sin regla', () => {
    expect(parseIgnoreDirectives('// autopsia-ignore-file circular-deps\n').fileRules).toEqual([
      'circular-deps',
    ]);
    expect(parseIgnoreDirectives('// autopsia-ignore-file\n').fileRules).toEqual(['*']);
  });

  it('ignora comentarios normales', () => {
    const { fileRules, lineRules } = parseIgnoreDirectives('// un comentario cualquiera\n');
    expect(fileRules).toEqual([]);
    expect(lineRules.size).toBe(0);
  });
});

describe('supresión de violaciones vía comentarios (integración)', () => {
  let tmpRoot: string;

  const config: AutopsiaConfig = {
    layers: [
      { name: 'presentation', patterns: ['src/presentation/*'], allowedDependencies: ['domain'] },
      { name: 'domain', patterns: ['src/domain/*'], allowedDependencies: [] },
      { name: 'data', patterns: ['src/data/*'], allowedDependencies: ['domain'] },
    ],
    dataAccessModules: ['axios'],
    noDirectDataAccessIn: ['presentation'],
  };

  function write(relPath: string, content: string): void {
    const abs = path.join(tmpRoot, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-ignores-'));
    write('src/data/Repo.ts', 'export const repo = 1;\n');
    write('src/domain/Entity.ts', 'export const entity = 1;\n');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('ignore-next-line con regla suprime SOLO esa violación', () => {
    write(
      'src/presentation/Screen.ts',
      [
        '// autopsia-ignore-next-line direct-data-access -- legacy',
        "import axios from 'axios';",
        "import { repo } from '../data/Repo';",
        'export const s = { axios, repo };',
      ].join('\n')
    );
    const graph = buildGraph(tmpRoot, config);

    const dataAccess = checkDirectDataAccess(graph, config);
    expect(dataAccess).toHaveLength(1);
    expect(dataAccess[0].suppressed).toBe(true);

    // la violación de dependency-direction (presentation → data) NO se suprime
    const direction = checkDependencyDirection(graph, config);
    expect(direction).toHaveLength(1);
    expect(direction[0].suppressed).toBeUndefined();
  });

  it('la regla nombrada no suprime imports de otras reglas en otra línea', () => {
    write(
      'src/presentation/Screen.ts',
      [
        '// autopsia-ignore-next-line dependency-direction',
        "import axios from 'axios';",
        'export const s = axios;',
      ].join('\n')
    );
    const graph = buildGraph(tmpRoot, config);
    const dataAccess = checkDirectDataAccess(graph, config);
    expect(dataAccess).toHaveLength(1);
    expect(dataAccess[0].suppressed).toBeUndefined();
  });

  it('ignore-next-line sin regla suprime todas las reglas de esa línea', () => {
    write(
      'src/presentation/Screen.ts',
      [
        '// autopsia-ignore-next-line',
        "import axios from 'axios';",
        'export const s = axios;',
      ].join('\n')
    );
    const graph = buildGraph(tmpRoot, config);
    const dataAccess = checkDirectDataAccess(graph, config);
    expect(dataAccess).toHaveLength(1);
    expect(dataAccess[0].suppressed).toBe(true);
  });

  it('ignore-file con regla suprime esa regla en todo el archivo', () => {
    write(
      'src/presentation/Screen.ts',
      [
        '// autopsia-ignore-file dependency-direction -- refactor pendiente',
        "import { repo } from '../data/Repo';",
        "import axios from 'axios';",
        'export const s = { repo, axios };',
      ].join('\n')
    );
    const graph = buildGraph(tmpRoot, config);

    const direction = checkDependencyDirection(graph, config);
    expect(direction).toHaveLength(1);
    expect(direction[0].suppressed).toBe(true);

    // otras reglas siguen activas
    const dataAccess = checkDirectDataAccess(graph, config);
    expect(dataAccess).toHaveLength(1);
    expect(dataAccess[0].suppressed).toBeUndefined();
  });

  it('ignore-file sin regla suprime todas las violaciones del archivo', () => {
    write(
      'src/presentation/Screen.ts',
      [
        '// autopsia-ignore-file',
        "import { repo } from '../data/Repo';",
        "import axios from 'axios';",
        'export const s = { repo, axios };',
      ].join('\n')
    );
    const graph = buildGraph(tmpRoot, config);
    const all = [...checkDependencyDirection(graph, config), ...checkDirectDataAccess(graph, config)];
    expect(all).toHaveLength(2);
    expect(all.every((v) => v.suppressed === true)).toBe(true);
  });

  it('suprime un ciclo cuando una de sus aristas tiene ignore-next-line circular-deps', () => {
    write(
      'src/presentation/a.ts',
      [
        '// autopsia-ignore-next-line circular-deps -- acoplamiento conocido',
        "import { b } from './b';",
        'export const a = () => b;',
      ].join('\n')
    );
    write('src/presentation/b.ts', "import { a } from './a';\nexport const b = () => a;\n");
    const graph = buildGraph(tmpRoot, config);

    const cycles = checkCircularDeps(graph);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].suppressed).toBe(true);
  });

  it('sin comentarios no se suprime nada (el fixture base sigue igual)', () => {
    write(
      'src/presentation/Screen.ts',
      ["import axios from 'axios';", 'export const s = axios;'].join('\n')
    );
    const graph = buildGraph(tmpRoot, config);
    const node = graph.find((n) => n.path === path.join('src', 'presentation', 'Screen.ts'));
    expect(node?.suppressions).toBeUndefined();
  });
});
