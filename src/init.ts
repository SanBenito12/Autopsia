import { t, present } from "./i18n";
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, LayerConfig, RuleLevel } from './types';
import { ALL_RULES } from './rules/run';
import { buildGraph } from './scanner';
import { loadTsconfig } from './tsconfig';

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

const KNOWN_DATA_ACCESS_PACKAGES: { pkg: string; domainPrefix: string }[] = [
  { pkg: 'axios', domainPrefix: 'axios' },
  { pkg: '@supabase/supabase-js', domainPrefix: '@supabase' },
  { pkg: '@react-native-async-storage/async-storage', domainPrefix: '@react-native-async-storage' },
  { pkg: 'react-native-mmkv', domainPrefix: 'react-native-mmkv' },
  { pkg: 'expo-sqlite', domainPrefix: 'expo-sqlite' },
  { pkg: 'expo-secure-store', domainPrefix: 'expo-secure-store' },
  { pkg: '@apollo/client', domainPrefix: '@apollo' },
  { pkg: 'graphql-request', domainPrefix: 'graphql-request' },
  { pkg: 'ky', domainPrefix: 'ky' },
  { pkg: '@trpc/client', domainPrefix: '@trpc' },
  { pkg: 'firebase', domainPrefix: 'firebase' },
  { pkg: '@react-native-firebase/app', domainPrefix: '@react-native-firebase' },
  { pkg: '@react-native-firebase/firestore', domainPrefix: '@react-native-firebase' },
  { pkg: '@react-native-firebase/auth', domainPrefix: '@react-native-firebase' },
  { pkg: '@react-native-firebase/database', domainPrefix: '@react-native-firebase' },
  { pkg: '@nozbe/watermelondb', domainPrefix: '@nozbe/watermelondb' },
  { pkg: 'realm', domainPrefix: 'realm' },
  { pkg: 'drizzle-orm', domainPrefix: 'drizzle-orm' },
  { pkg: 'aws-amplify', domainPrefix: 'aws-amplify' },
];

/**
 * Inspecciona package.json del proyecto (si existe) para detectar librerías reales
 * de red, base de datos local o BaaS instaladas por el desarrollador.
 */
export function detectPackageJsonDataAccess(root?: string): {
  dataAccessModules: string[];
  domainForbidden: string[];
} {
  const dataAccess = new Set<string>(DEFAULT_DATA_ACCESS);
  const domainForbidden = new Set<string>(DOMAIN_FORBIDDEN);

  if (root) {
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = {
          ...(raw?.dependencies ?? {}),
          ...(raw?.devDependencies ?? {}),
        };
        for (const item of KNOWN_DATA_ACCESS_PACKAGES) {
          if (Object.prototype.hasOwnProperty.call(deps, item.pkg)) {
            dataAccess.add(item.pkg);
            domainForbidden.add(item.domainPrefix);
          }
        }
      } catch {
        // Ignorar package.json malformado y usar defaults
      }
    }
  }

  return {
    dataAccessModules: [...dataAccess],
    domainForbidden: [...domainForbidden],
  };
}

/**
 * Detecta carpetas de features o módulos (src/features/*, features/*, src/modules/*, modules/*)
 * que tengan subcarpetas de features reales.
 */
export function detectFeaturesPatterns(root?: string): string[] {
  if (!root) return [];
  const candidates = ['src/features', 'features', 'src/modules', 'modules'];
  const patterns: string[] = [];
  for (const rel of candidates) {
    const full = path.join(root, rel);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      const hasSubdirs = fs.readdirSync(full, { withFileTypes: true }).some((e) => e.isDirectory());
      if (hasSubdirs) patterns.push(`${rel}/*`);
    }
  }
  return patterns;
}

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

  // Layer-first and one feature level: stop at the layer boundary so nested
  // folders such as domain/services do not become overlapping layers.
  for (const container of ['features', 'modules']) {
    const featuresDir = path.join(srcDir, container);
    if (fs.existsSync(featuresDir) && fs.statSync(featuresDir).isDirectory()) {
      for (const feature of fs.readdirSync(featuresDir, { withFileTypes: true })) {
        if (!feature.isDirectory()) continue;
        for (const layer of fs.readdirSync(path.join(featuresDir, feature.name), { withFileTypes: true })) {
          if (layer.isDirectory()) dirs.push(`${container}/${feature.name}/${layer.name}`);
        }
      }
    }
  }

  const detected: DetectedLayer[] = [];
  for (const candidate of LAYER_CANDIDATES) {
    const folders = dirs.filter((d) => candidate.folders.includes(d.split('/').pop()!.toLowerCase())).sort();
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
export function buildConfig(detected: DetectedLayer[], root?: string): AutopsiaConfig {
  const detectedNames = new Set(detected.map((d) => d.name));
  const { dataAccessModules, domainForbidden } = detectPackageJsonDataAccess(root);

  const layers: LayerConfig[] = detected.map((d) => {
    const layer: LayerConfig = {
      name: d.name,
      patterns: d.folders.map((f) => `src/${f}/*`),
      allowedDependencies: allowedFor(d.name, detectedNames),
    };
    if (d.name === 'domain') layer.forbiddenExternal = [...domainForbidden];
    return layer;
  });

  const rules: Record<string, RuleLevel> = {};
  for (const rule of ALL_RULES) rules[rule] = 'error';

  const config: AutopsiaConfig = {
    layers,
    dataAccessModules,
    noDirectDataAccessIn: detectedNames.has('presentation') ? ['presentation'] : [],
    rules,
    strict: true,
  };

  const featurePatterns = detectFeaturesPatterns(root);
  if (featurePatterns.length > 0) {
    config.features = {
      patterns: featurePatterns,
      enforcePublicApi: true,
    };
  }

  return config;
}

/** Config de ejemplo cuando no se detecta ninguna capa. */
export function exampleConfig(root?: string): AutopsiaConfig {
  return buildConfig(
    LAYER_CANDIDATES.map((c) => ({ name: c.name, folders: [c.folders[0]] })),
    root
  );
}

export interface InitOptions { preset?: 'react-native' | 'expo'; dryRun?: boolean }

/** Genera configuración adaptada a Expo Router y estructuras por carpetas. */
export function buildExpoConfig(root: string): AutopsiaConfig {
  const hasSrc = fs.existsSync(path.join(root, 'src')) && fs.statSync(path.join(root, 'src')).isDirectory();
  const baseDir = hasSrc && fs.existsSync(path.join(root, 'src', 'app')) ? 'src' : '';
  const prefix = baseDir ? `${baseDir}/` : '';

  const check = (name: string) => {
    const p = path.join(root, prefix + name);
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  };

  const layers: LayerConfig[] = [];
  const addLayer = (name: string, folders: string[], allowed?: string[]) => {
    const existing = folders.filter((f) => check(f));
    if (existing.length > 0) {
      layers.push({
        name,
        patterns: existing.map((f) => `${prefix}${f}/*`),
        allowedDependencies: allowed,
      });
    }
  };

  addLayer('routes', ['app'], ['features', 'components', 'services', 'hooks', 'constants']);
  addLayer('features', ['features', 'modules'], ['components', 'services', 'hooks', 'constants']);
  addLayer('components', ['components'], ['hooks', 'constants']);
  addLayer('services', ['services', 'api'], ['constants']);
  addLayer('hooks', ['hooks'], ['constants']);
  addLayer('constants', ['constants', 'utils']);

  const layerNames = new Set(layers.map((l) => l.name));
  for (const layer of layers) {
    if (layer.allowedDependencies) {
      layer.allowedDependencies = layer.allowedDependencies.filter((d) => layerNames.has(d));
    }
  }

  const rules: Record<string, RuleLevel> = {};
  for (const rule of ALL_RULES) rules[rule] = 'error';
  const { dataAccessModules } = detectPackageJsonDataAccess(root);

  const config: AutopsiaConfig = {
    layers:
      layers.length > 0
        ? layers
        : [
            {
              name: 'routes',
              patterns: [`${prefix}app/*`],
              allowedDependencies: ['components', 'services'],
            },
            { name: 'components', patterns: [`${prefix}components/*`] },
            { name: 'services', patterns: [`${prefix}services/*`] },
          ],
    dataAccessModules,
    noDirectDataAccessIn: ['routes', 'components'].filter((n) => layerNames.has(n)),
    rules,
    strict: true,
  };

  if (check('features')) {
    config.features = {
      patterns: [`${prefix}features/*`],
      enforcePublicApi: true,
    };
  } else if (check('modules')) {
    config.features = {
      patterns: [`${prefix}modules/*`],
      enforcePublicApi: true,
    };
  }

  return config;
}

/** Explicit opt-in proposal; unknown shared folders never become a catch-all layer. */
export function buildReactNativeConfig(root: string): AutopsiaConfig {
  const detected = detectLayers(root);
  const add = (name: string, folder: string) => {
    const found = detected.find(layer => layer.name === name);
    if (found) { if (!found.folders.includes(folder)) found.folders.push(folder); }
    else detected.push({ name, folders: [folder] });
  };
  const children = (folder: string): string[] => fs.existsSync(folder) && fs.statSync(folder).isDirectory()
    ? fs.readdirSync(folder, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() : [];
  const scopes = [
    '',
    ...children(path.join(root, 'src/features')).map(f => `features/${f}/`),
    ...children(path.join(root, 'src/modules')).map(m => `modules/${m}/`),
  ];
  for (const scope of scopes) {
    const scopeChildren = children(path.join(root, 'src', scope));
    for (const appFolder of ['application', 'usecases', 'use-cases']) {
      if (scopeChildren.includes(appFolder)) add('application', `${scope}${appFolder}`);
    }
    for (const uiFolder of ['components', 'hooks', 'navigation']) {
      if (scopeChildren.includes(uiFolder)) add('presentation', `${scope}${uiFolder}`);
    }
    for (const infraFolder of ['api', 'clients', 'storage']) {
      if (scopeChildren.includes(infraFolder)) add('infrastructure', `${scope}${infraFolder}`);
    }
    for (const name of children(path.join(root, 'src', scope, 'shared'))) {
      if (['presentation', 'domain', 'data', 'infrastructure', 'application'].includes(name)) add(name, `${scope}shared/${name}`);
    }
  }
  for (const folder of ['app', 'di']) if (children(path.join(root, 'src')).includes(folder)) add('composition', folder);
  const hasApp = fs.existsSync(path.join(root, 'App.tsx')) && fs.statSync(path.join(root, 'App.tsx')).isFile();
  const config = detected.length ? buildConfig(detected, root) : hasApp ? buildConfig([], root) : exampleConfig(root);
  if (hasApp) {
    const composition = config.layers.find(l => l.name === 'composition');
    if (composition) composition.files = ['App.tsx'];
    else config.layers.push({ name: 'composition', files: ['App.tsx'] });
  }
  const directions: Record<string, string[]> = { presentation: ['application', 'domain'], application: ['domain'],
    data: ['infrastructure', 'domain'], infrastructure: ['domain'], domain: [] };
  const names = config.layers.map(l => l.name);
  for (const layer of config.layers) {
    layer.allowedDependencies = layer.name === 'composition' ? names.filter(n => n !== 'composition')
      : (directions[layer.name] ?? []).filter(n => names.includes(n));
  }
  return config;
}

export type InitStatus = 'created' | 'created-example' | 'exists' | 'preview';

export interface InitResult {
  status: InitStatus;
  configPath: string;
  detected: DetectedLayer[];
  config?: AutopsiaConfig;
  example?: boolean;
}

export interface InitCoverage {
  unclassifiedExamples: string[];
  totalFiles: number;
  classifiedFiles: number;
  percent: number;
}

/** Mide qué tanto del proyecto cubre el config recién generado. */
export function measureConfigCoverage(root: string, config: AutopsiaConfig): InitCoverage {
  const graph = buildGraph(root, config);
  const classifiedFiles = graph.filter((node) => node.layer !== null).length;
  const percent = graph.length === 0
    ? 0
    : Math.round((classifiedFiles / graph.length) * 1000) / 10;
  return { totalFiles: graph.length, classifiedFiles, percent,
    unclassifiedExamples: graph.filter((node) => node.layer === null).slice(0, 5).map((node) => node.path) };
}

/**
 * Genera <root>/autopsia.config.json. Nunca sobrescribe un config existente
 * salvo con force=true.
 */
export function initProject(root: string, force = false, options: InitOptions = {}): InitResult {
  const configPath = path.join(root, 'autopsia.config.json');
  const detected = detectLayers(root);

  if (fs.existsSync(configPath) && !force && !options.dryRun) {
    return { status: 'exists', configPath, detected };
  }

  const isExpo =
    options.preset === 'expo' ||
    (options.preset === undefined &&
      detected.length === 0 &&
      (fs.existsSync(path.join(root, 'app')) || fs.existsSync(path.join(root, 'src', 'app'))));

  const config =
    options.preset === 'react-native'
      ? buildReactNativeConfig(root)
      : isExpo
      ? buildExpoConfig(root)
      : detected.length > 0
      ? buildConfig(detected, root)
      : fs.existsSync(path.join(root, 'App.tsx'))
      ? buildReactNativeConfig(root)
      : exampleConfig(root);
  const example = !config.layers.some(layer => (layer.files ?? []).some(file => fs.existsSync(path.join(root, file))) ||
    (layer.patterns ?? []).some(pattern => fs.existsSync(path.join(root, pattern.replace(/\*$/, '')))));
  if (options.dryRun) return { status: 'preview', configPath, detected, config, example };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  return { status: example ? 'created-example' : 'created', configPath, detected, example };
}

/** Ejecuta init desde la CLI, con salida en consola. Devuelve el exit code. */
export function runInit(root: string, force = false, options: InitOptions = {}): number {
  console.log(chalk.gray(t("init.inspect", {p0: root})));

  const result = initProject(root, force, options);

  if (result.status === 'exists') {
    console.error(chalk.red(t("init.exists", {p0: result.configPath})));
    console.error(chalk.gray(t("init.forceHint", {})));
    return 1;
  }

  const generatedConfig = result.config ?? JSON.parse(fs.readFileSync(result.configPath, 'utf-8')) as AutopsiaConfig;
  if (options.dryRun) {
    console.log(t('init.preview'));
    if (fs.existsSync(result.configPath)) console.log(t('init.existingPreview'));
  }
  if (options.preset || options.dryRun) {
    console.log(t('init.policy'));
    console.log(JSON.stringify(generatedConfig, null, 2));
  }
  for (const issue of loadTsconfig(root).issues) {
    console.log(present(issue).message);
    console.log(issue.detail);
    console.log(t('doctor.tsconfigFix'));
  }
  const coverage = measureConfigCoverage(root, generatedConfig);
  const lowCoverage = coverage.totalFiles > 0 && coverage.percent < 80;

  if (result.example) {
    console.log(chalk.yellow(t("init.noLayers", {})));
    console.log(chalk.gray(t("init.example", {})));
    console.log(chalk.gray(t("init.patterns", {})));
    console.log(chalk.gray(t("init.allowed", {})));
    console.log(chalk.gray(t("init.modules", {})));
  } else {
    console.log(
      lowCoverage
        ? chalk.yellow(t("init.partial", {}))
        : chalk.green(t("init.detected", {}))
    );
    for (const layer of generatedConfig.layers) {
      console.log(`    ${layer.name.padEnd(16)} ${chalk.gray([...(layer.patterns ?? []), ...(layer.files ?? [])].join(', '))}`);
    }
  }

  if (coverage.totalFiles > 0) {
    const coverageText =
      t("init.coverage", {p0: coverage.classifiedFiles, p1: coverage.totalFiles, p2: coverage.percent});
    if (lowCoverage) {
      console.log(chalk.yellow(t("init.low", {p0: coverageText})));
      console.log(chalk.gray(t("init.adjust", {})));
    } else {
      console.log(chalk.green(t("init.initial", {p0: coverageText})));
    }
  }

  for (const file of coverage.unclassifiedExamples) console.log(chalk.gray(t("init.unclassified", {p0: file})));
  if (!options.dryRun) console.log(chalk.bold(t("init.saved", {p0: result.configPath})));
  console.log(chalk.gray(t("init.rules", {})));
  console.log(chalk.gray(t("init.levels", {})));
  console.log(chalk.gray(t("init.try", {p0: root})));
  console.log('');
  return 0;
}
