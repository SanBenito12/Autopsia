import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildConfig, detectLayers, initProject, measureConfigCoverage } from '../src/init';
import { AutopsiaConfig } from '../src/types';

let tmpRoot: string;

function mkdirs(...dirs: string[]): void {
  for (const dir of dirs) fs.mkdirSync(path.join(tmpRoot, dir), { recursive: true });
}

function readConfig(): AutopsiaConfig {
  return JSON.parse(fs.readFileSync(path.join(tmpRoot, 'autopsia.config.json'), 'utf-8'));
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-init-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('detectLayers', () => {
  it('detecta las cuatro capas con nombres canónicos', () => {
    mkdirs('src/presentation', 'src/domain', 'src/data', 'src/infrastructure');
    const detected = detectLayers(tmpRoot);
    expect(detected.map((d) => d.name)).toEqual(['presentation', 'domain', 'data', 'infrastructure']);
  });

  it('detecta nombres alternativos (screens, core, repositories, services)', () => {
    mkdirs('src/screens', 'src/core', 'src/repositories', 'src/services');
    const detected = detectLayers(tmpRoot);
    expect(detected).toEqual([
      { name: 'presentation', folders: ['screens'] },
      { name: 'domain', folders: ['core'] },
      { name: 'data', folders: ['repositories'] },
      { name: 'infrastructure', folders: ['services'] },
    ]);
  });

  it('agrupa varias carpetas de la misma capa', () => {
    mkdirs('src/screens', 'src/ui', 'src/domain');
    const detected = detectLayers(tmpRoot);
    const presentation = detected.find((d) => d.name === 'presentation');
    expect(presentation?.folders.sort()).toEqual(['screens', 'ui']);
  });

  it('sin src/ no detecta nada', () => {
    expect(detectLayers(tmpRoot)).toEqual([]);
  });

  it('ignora carpetas que no corresponden a ninguna capa', () => {
    mkdirs('src/utils', 'src/assets');
    expect(detectLayers(tmpRoot)).toEqual([]);
  });
});

describe('buildConfig', () => {
  it('genera reglas por defecto: dependencias hacia adentro (todas → domain)', () => {
    mkdirs('src/presentation', 'src/domain', 'src/data', 'src/infrastructure');
    const config = buildConfig(detectLayers(tmpRoot));

    const byName = Object.fromEntries(config.layers.map((l) => [l.name, l]));
    expect(byName['presentation'].allowedDependencies).toEqual(['domain']);
    expect(byName['domain'].allowedDependencies).toEqual([]);
    expect(byName['domain'].forbiddenExternal).toEqual(['react', 'react-native', 'axios', '@supabase']);
    expect(byName['data'].allowedDependencies).toEqual(['domain', 'infrastructure']);
    // infrastructure implementa contratos del domain (RepositoryImpl importa
    // interfaces y errores) — prohibirlo generaba falsos positivos masivos
    expect(byName['infrastructure'].allowedDependencies).toEqual(['domain']);
    expect(config.noDirectDataAccessIn).toEqual(['presentation']);
    expect(config.dataAccessModules).toContain('axios');
    expect(config.strict).toBe(true);
  });

  it('solo permite depender de capas realmente detectadas', () => {
    mkdirs('src/screens', 'src/data');
    const config = buildConfig(detectLayers(tmpRoot));

    const byName = Object.fromEntries(config.layers.map((l) => [l.name, l]));
    // no hay domain ni infrastructure: las listas se filtran
    expect(byName['presentation'].allowedDependencies).toEqual([]);
    expect(byName['data'].allowedDependencies).toEqual([]);
  });

  it('los patterns apuntan a las carpetas reales', () => {
    mkdirs('src/views', 'src/core');
    const config = buildConfig(detectLayers(tmpRoot));

    const byName = Object.fromEntries(config.layers.map((l) => [l.name, l]));
    expect(byName['presentation'].patterns).toEqual(['src/views/*']);
    expect(byName['domain'].patterns).toEqual(['src/core/*']);
  });

  it('mide cuando el config generado cubre muy poco de un proyecto feature-first', () => {
    mkdirs('src/infrastructure', 'src/features/auth');
    fs.writeFileSync(path.join(tmpRoot, 'src/infrastructure/client.ts'), 'export {};\n');
    fs.writeFileSync(path.join(tmpRoot, 'src/features/auth/Login.tsx'), 'export {};\n');
    const config = buildConfig(detectLayers(tmpRoot));

    expect(measureConfigCoverage(tmpRoot, config)).toEqual({
      totalFiles: 2,
      classifiedFiles: 1,
      percent: 50,
    });
  });
});

describe('initProject', () => {
  it('crea autopsia.config.json con las capas detectadas', () => {
    mkdirs('src/presentation', 'src/domain');
    const result = initProject(tmpRoot);

    expect(result.status).toBe('created');
    expect(fs.existsSync(result.configPath)).toBe(true);
    expect(readConfig().layers.map((l) => l.name)).toEqual(['presentation', 'domain']);
  });

  it('sin capas detectadas genera un config de ejemplo con las 4 capas', () => {
    mkdirs('src/utils');
    const result = initProject(tmpRoot);

    expect(result.status).toBe('created-example');
    expect(readConfig().layers.map((l) => l.name)).toEqual([
      'presentation',
      'domain',
      'data',
      'infrastructure',
    ]);
  });

  it('nunca sobrescribe un config existente sin force', () => {
    mkdirs('src/domain');
    fs.writeFileSync(path.join(tmpRoot, 'autopsia.config.json'), '{"custom": true}', 'utf-8');

    const result = initProject(tmpRoot);
    expect(result.status).toBe('exists');
    expect(fs.readFileSync(path.join(tmpRoot, 'autopsia.config.json'), 'utf-8')).toBe('{"custom": true}');
  });

  it('con force sí sobrescribe', () => {
    mkdirs('src/domain');
    fs.writeFileSync(path.join(tmpRoot, 'autopsia.config.json'), '{"custom": true}', 'utf-8');

    const result = initProject(tmpRoot, true);
    expect(result.status).toBe('created');
    expect(readConfig().layers.map((l) => l.name)).toEqual(['domain']);
  });
});
