import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, LayerConfig, RuleLevel } from './types';
import { ALL_RULES } from './rules/run';
import { buildGraph } from './scanner';

/**
 * `autopsia init` — genera un autopsia.config.json detectando la estructura
 * del proyecto: busca bajo src/ carpetas con nombres típicos de cada capa.
 */

interface LayerCandidate {
  name: string;
  folders: string[];
}

const LAYER_CANDIDATES: LayerCandidate[] = [
  { name: 'presentation', folders: ['presentation', 'ui', 'screens', 'views'] },
  { name: 'domain', folders: ['domain', 'core'] },
  { name: 'data', folders: ['data', 'repositories'] },
  { name: 'infrastructure', folders: ['infrastructure', 'infra', 'services'] },
];

const DOMAIN_FORBIDDEN = ['react', 'react-native', 'axios', '@supabase'];
const DEFAULT_DATA_ACCESS = [
  'axios',
  '@supabase/supabase-js',
  '@react-native-async-storage/async-storage',
];

export interface DetectedLayer {
  /** Nombre canónico de la capa (presentation, domain, data, infrastructure) */
  name: string;
  /** Carpetas reales bajo src/ que la componen */
  folders: string[];
}

/** Busca bajo <root>/src carpetas cuyos nombres correspondan a capas típicas. */
export function detectLayers(root: string): DetectedLayer[] {
  const srcDir = path.join(root, 'src');
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) return [];

  const dirs = fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const detected: DetectedLayer[] = [];
  for (const candidate of LAYER_CANDIDATES) {
    const folders = dirs.filter((d) => candidate.folders.includes(d.toLowerCase()));
    if (folders.length > 0) detected.push({ name: candidate.name, folders });
  }
  return detected;
}

/**
 * Regla de dirección por defecto: las dependencias apuntan HACIA ADENTRO
 * (hacia domain), nunca al revés.
 * - presentation → domain: la UI consume casos de uso
 * - data → domain + infrastructure: los repositorios implementan contratos
 *   del domain y se apoyan en clientes de infrastructure
 * - infrastructure → domain: un RepositoryImpl/adapter importa interfaces
 *   y errores del domain (prohibírselo produce falsos positivos masivos)
 * - domain → nada: es el centro, TypeScript puro
 */
function allowedFor(layerName: string, detectedNames: Set<string>): string[] {
  const wanted =
    layerName === 'presentation'
      ? ['domain']
      : layerName === 'data'
        ? ['domain', 'infrastructure']
        : layerName === 'infrastructure'
          ? ['domain']
          : [];
  return wanted.filter((n) => detectedNames.has(n));
}

/** Construye la config a partir de las capas detectadas. */
export function buildConfig(detected: DetectedLayer[]): AutopsiaConfig {
  const detectedNames = new Set(detected.map((d) => d.name));

  const layers: LayerConfig[] = detected.map((d) => {
    const layer: LayerConfig = {
      name: d.name,
      patterns: d.folders.map((f) => `src/${f}/*`),
      allowedDependencies: allowedFor(d.name, detectedNames),
    };
    if (d.name === 'domain') layer.forbiddenExternal = [...DOMAIN_FORBIDDEN];
    return layer;
  });

  const rules: Record<string, RuleLevel> = {};
  for (const rule of ALL_RULES) rules[rule] = 'error';

  return {
    layers,
    dataAccessModules: [...DEFAULT_DATA_ACCESS],
    noDirectDataAccessIn: detectedNames.has('presentation') ? ['presentation'] : [],
    rules,
    strict: true,
  };
}

/** Config de ejemplo cuando no se detecta ninguna capa. */
export function exampleConfig(): AutopsiaConfig {
  return buildConfig(LAYER_CANDIDATES.map((c) => ({ name: c.name, folders: [c.folders[0]] })));
}

export type InitStatus = 'created' | 'created-example' | 'exists';

export interface InitResult {
  status: InitStatus;
  configPath: string;
  detected: DetectedLayer[];
}

export interface InitCoverage {
  totalFiles: number;
  classifiedFiles: number;
  percent: number;
}

/** Mide qué tanto del proyecto cubre el config recién generado. */
export function measureConfigCoverage(root: string, config: AutopsiaConfig): InitCoverage {
  const graph = buildGraph(root, config);
  const classifiedFiles = graph.filter((node) => node.layer !== null).length;
  const percent = graph.length === 0
    ? 100
    : Math.round((classifiedFiles / graph.length) * 1000) / 10;
  return { totalFiles: graph.length, classifiedFiles, percent };
}

/**
 * Genera <root>/autopsia.config.json. Nunca sobrescribe un config existente
 * salvo con force=true.
 */
export function initProject(root: string, force = false): InitResult {
  const configPath = path.join(root, 'autopsia.config.json');
  const detected = detectLayers(root);

  if (fs.existsSync(configPath) && !force) {
    return { status: 'exists', configPath, detected };
  }

  const config = detected.length > 0 ? buildConfig(detected) : exampleConfig();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  return { status: detected.length > 0 ? 'created' : 'created-example', configPath, detected };
}

/** Ejecuta init desde la CLI, con salida en consola. Devuelve el exit code. */
export function runInit(root: string, force = false): number {
  console.log(chalk.gray(`\n  Analizando estructura de ${root} ...`));

  const result = initProject(root, force);

  if (result.status === 'exists') {
    console.error(chalk.red(`\n  ✖ Ya existe ${result.configPath}`));
    console.error(chalk.gray('    Usa --force para sobrescribirlo.'));
    return 1;
  }

  const generatedConfig = JSON.parse(fs.readFileSync(result.configPath, 'utf-8')) as AutopsiaConfig;
  const coverage = measureConfigCoverage(root, generatedConfig);
  const lowCoverage = coverage.totalFiles > 0 && coverage.percent < 80;

  if (result.status === 'created-example') {
    console.log(chalk.yellow('\n  ⚠ No se detectaron capas típicas bajo src/'));
    console.log(chalk.gray('    Se generó un config de EJEMPLO. Ajusta:'));
    console.log(chalk.gray('    · "patterns" de cada capa a las carpetas reales de tu proyecto'));
    console.log(chalk.gray('    · "allowedDependencies" según tu dirección de dependencias'));
    console.log(chalk.gray('    · "dataAccessModules" a los clientes de red/datos que uses'));
  } else {
    console.log(
      lowCoverage
        ? chalk.yellow('\n  ⚠ Detección parcial de capas:')
        : chalk.green('\n  ✔ Capas detectadas:')
    );
    for (const layer of result.detected) {
      console.log(`    ${layer.name.padEnd(16)} ${chalk.gray('← src/' + layer.folders.join(', src/'))}`);
    }
  }

  if (coverage.totalFiles > 0) {
    const coverageText =
      `${coverage.classifiedFiles}/${coverage.totalFiles} archivos (${coverage.percent}%)`;
    if (lowCoverage) {
      console.log(chalk.yellow(`\n  ⚠ El config generado solo cubre ${coverageText}.`));
      console.log(chalk.gray('    Ajusta los patterns antes de confiar en el resultado del scan.'));
    } else {
      console.log(chalk.green(`\n  ✔ Cobertura inicial del config: ${coverageText}`));
    }
  }

  console.log(chalk.bold(`\n  Config generado en ${result.configPath}`));
  console.log(chalk.gray('  Sección "rules": cada regla acepta "error" (falla --ci),'));
  console.log(chalk.gray('  "warning" (se reporta en amarillo, no falla) u "off" (no corre).'));
  console.log(chalk.gray(`  Pruébalo con: autopsia scan ${root}`));
  console.log('');
  return 0;
}
