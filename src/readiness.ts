import { getFeatureInfo } from './rules/feature-boundaries';
import {
  AutopsiaConfig,
  CleanArchVerdict,
  FeatureHealth,
  FileNode,
  PhaseStatus,
  ProjectReadiness,
  ReadinessPhase,
  RemediationPriority,
  RemediationStep,
  RemediationStepId,
  ScanResult,
  Violation,
} from './types';

export const ARCH_RULES = new Set([
  'dependency-direction',
  'direct-data-access',
  'forbidden-external',
  'circular-deps',
  'feature-boundaries',
]);

export const UI_QUALITY_RULES = new Set([
  'scrollview-map',
  'flatlist-performance',
  'component-size',
  'memory-leak',
  'render-bottleneck',
  'runtime-safety',
]);

const DEFAULT_FEATURE_PATTERNS = [
  'src/features/*',
  'features/*',
  'src/modules/*',
  'modules/*',
];

const LAYER_SEGMENTS = new Set([
  'presentation',
  'ui',
  'domain',
  'core',
  'data',
  'infrastructure',
  'infra',
  'application',
  'shared',
  'common',
  'di',
]);

const BUCKET_SEGMENTS = new Set([
  'screens',
  'views',
  'pages',
  'components',
  'hooks',
  'context',
  'contexts',
  'usecases',
  'use-cases',
  'repositories',
  'services',
  'sources',
  'source',
  'datasources',
  'local',
  'remote',
  'network',
  'api',
  'clients',
  'storage',
  'entities',
  'models',
  'navigation',
  'theme',
  'utils',
  'constants',
]);

const NON_FEATURE_TOP_DIRS = new Set([
  'utils',
  'types',
  'config',
  'constants',
  'assets',
  'theme',
  'styles',
  'i18n',
  'mocks',
]);

const SHARED_UI_SUBDIRS = new Set([
  'components',
  'ui',
  'theme',
  'hooks',
  'utils',
  'constants',
  'assets',
  'icons',
  'modals',
  'overlays',
  'drawer',
  'navigation',
  'types',
  'forms',
]);

const APP_COMPOSITION_SUBDIRS = new Set([
  'navigation',
  'bootstrap',
  'providers',
  'di',
  'config',
  'store',
  'theme',
]);

const NON_FEATURE_FOLDERS = new Set([
  ...LAYER_SEGMENTS,
  ...BUCKET_SEGMENTS,
  ...NON_FEATURE_TOP_DIRS,
  ...SHARED_UI_SUBDIRS,
  ...APP_COMPOSITION_SUBDIRS,
  'apiqr',
  'appversion',
]);

const IGNORED_ROUTE_GROUPS = new Set(['(tabs)', '(app)', '(root)', '(main)', '(drawer)']);

const KNOWN_FLOW_KEYWORDS: [RegExp, string][] = [
  [/^(auth|login|signin|sign-in|signup|sign-up|register|session|token|password|otp|biometric)/i, 'auth'],
  [/^(home|dashboard|feed|main)/i, 'home'],
  [/^(profile|account|user|settings|preferences)/i, 'profile'],
  [/^(cart|checkout|payment|billing|order|orders)/i, 'checkout'],
  [/^(product|products|catalog|explore|item)/i, 'catalog'],
  [/^(passport)/i, 'passport'],
  [/^(coupon|coupons)/i, 'coupons'],
  [/^(station|stations)/i, 'stations'],
  [/^(bike|bikes|rental|membership)/i, 'bikes'],
  [/^(onboarding|welcome|splash)/i, 'onboarding'],
];

function inferFlowFromFileName(fileName: string, allowScreenFallback: boolean): string | null {
  if (!fileName || fileName === 'index' || fileName === 'App' || fileName === '_layout') return null;

  const stripped = fileName
    .replace(/^(use|get|create|update|delete|fetch)/i, '')
    .replace(
      /(Screen|View|Page|Modal|Component|Hook|UseCase|Repository|RepositoryImpl|Repo|Service|Source|Storage|Controller|Slice|Store|Context|Provider|DI|Headers|Types)$/i,
      ''
    );
  const candidate = stripped || fileName;

  for (const [regex, flow] of KNOWN_FLOW_KEYWORDS) {
    if (regex.test(candidate) || regex.test(fileName)) return flow;
  }

  if (allowScreenFallback && /(Screen|View|Page)$/i.test(fileName) && candidate.length >= 3) {
    const lower = candidate.toLowerCase();
    if (!NON_FEATURE_FOLDERS.has(lower)) return lower;
  }

  return null;
}

/**
 * Infiere a qué feature o flujo funcional pertenece un archivo:
 * 1. Carpetas de features explícitas (`src/features/auth/*`, `src/modules/cart/*`).
 * 2. Rutas de Expo Router (`app/(auth)/login.tsx`, `src/app/checkout/index.tsx`), ignorando `src/app/navigation|bootstrap|providers`.
 * 3. Subcarpetas funcionales dentro de capas (`src/presentation/screens/auth/LoginScreen.tsx`, `src/data/sources/auth/authService.ts`).
 * 4. Ignora librerías de componentes UI compartidos (`src/shared/components/*`, `components/ui/*`, `assets/*`, `utils/*`).
 */
export function inferFeatureOrFlow(filePath: string, config: AutopsiaConfig): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const patterns =
    config.features?.patterns && config.features.patterns.length > 0
      ? config.features.patterns
      : DEFAULT_FEATURE_PATTERNS;

  const explicit = getFeatureInfo(normalized, patterns);
  if (explicit) return explicit.featureName.toLowerCase();

  const rawParts = normalized.split('/').filter(Boolean);
  const parts = rawParts[0] === 'src' ? rawParts.slice(1) : rawParts;
  if (parts.length <= 1) return null;

  const top = parts[0].toLowerCase();
  const second = parts[1]?.toLowerCase() ?? '';
  const fileName = parts[parts.length - 1].replace(/\.(ios|android|native|web)?\.(tsx?|jsx?)$/i, '');

  // Carpetas raíz puramente técnicas (src/utils/*, src/config/*, src/constants/*, src/assets/*)
  if (NON_FEATURE_TOP_DIRS.has(top)) {
    return null;
  }

  // Librería compartida (src/shared/components/*, src/shared/theme/*, etc.)
  if (top === 'shared' && SHARED_UI_SUBDIRS.has(second)) {
    return null;
  }

  // Subcarpetas de primitivos UI / iconos / modales genéricos / assets dentro de presentation
  if (
    /\/(components\/(ui|shared|common|icons|modals|overlays|drawer|navigation|forms)|assets|theme|styles|types|utils|validators|formatters)\//i.test(
      '/' + parts.join('/')
    )
  ) {
    return inferFlowFromFileName(fileName, false);
  }

  // Carpetas bajo app/: distinguir composición (src/app/navigation|bootstrap|providers) de rutas Expo Router
  if (top === 'app') {
    if (APP_COMPOSITION_SUBDIRS.has(second)) {
      return inferFlowFromFileName(fileName, false);
    }
    for (let i = 1; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (IGNORED_ROUTE_GROUPS.has(seg.toLowerCase())) continue;
      const clean = seg.replace(/^\((.+)\)$/, '$1').toLowerCase();
      if (clean && !clean.startsWith('_') && !clean.startsWith('[') && !NON_FEATURE_FOLDERS.has(clean)) {
        return clean;
      }
    }
  }

  // Layer-first con subcarpeta funcional: ej. src/presentation/screens/auth/LoginScreen.tsx,
  // src/data/sources/auth/authService.ts, src/presentation/context/bikes/RentalContext.tsx
  let idx = 0;
  while (
    idx < parts.length - 1 &&
    (LAYER_SEGMENTS.has(parts[idx].toLowerCase()) || BUCKET_SEGMENTS.has(parts[idx].toLowerCase()))
  ) {
    idx++;
  }
  if (idx > 0 && idx < parts.length - 1) {
    const folder = parts[idx].toLowerCase();
    if (!NON_FEATURE_FOLDERS.has(folder)) {
      if (folder === 'usersadmin') return 'admin';
      if (folder === 'usersgestor') return 'gestor';
      return folder;
    }
  }

  // Archivo directo dentro de una capa/bucket: inferir flujo por nombre (ej. LoginScreen.tsx -> auth, AuthContext.tsx -> auth)
  return inferFlowFromFileName(fileName, true);
}

export function computeFeatureHealth(
  graph: FileNode[],
  allViolations: Violation[],
  config: AutopsiaConfig
): FeatureHealth[] {
  const byFeature = new Map<string, FileNode[]>();
  for (const node of graph) {
    const flow = inferFeatureOrFlow(node.path, config);
    if (!flow) continue;
    byFeature.set(flow, [...(byFeature.get(flow) ?? []), node]);
  }

  const violationsByFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    violationsByFile.set(v.file, [...(violationsByFile.get(v.file) ?? []), v]);
  }

  const layerOrder = config.layers.map((l) => l.name);
  const features: FeatureHealth[] = [];

  for (const [name, nodes] of byFeature.entries()) {
    const presentLayers = new Set<string>();
    let architectureViolations = 0;
    let uiWarnings = 0;
    let dirtyFiles = 0;

    for (const node of nodes) {
      if (node.layer) presentLayers.add(node.layer);
      const fileViolations = violationsByFile.get(node.path) ?? [];
      if (fileViolations.length > 0) dirtyFiles++;
      for (const v of fileViolations) {
        if (ARCH_RULES.has(v.rule)) architectureViolations++;
        else if (UI_QUALITY_RULES.has(v.rule)) uiWarnings++;
      }
    }

    const layers = [
      ...layerOrder.filter((l) => presentLayers.has(l)),
      ...[...presentLayers].filter((l) => !layerOrder.includes(l)),
    ];

    const files = nodes.length;
    const healthPercent = files === 0 ? 100 : Math.round(((files - dirtyFiles) / files) * 100);
    const status: FeatureHealth['status'] =
      architectureViolations > 0 ? 'critical' : uiWarnings > 0 ? 'warning' : 'healthy';

    features.push({
      name,
      files,
      layers,
      architectureViolations,
      uiWarnings,
      healthPercent,
      status,
    });
  }

  const statusWeight: Record<FeatureHealth['status'], number> = {
    critical: 0,
    warning: 1,
    healthy: 2,
  };

  return features.sort(
    (a, b) =>
      statusWeight[a.status] - statusWeight[b.status] ||
      b.architectureViolations + b.uiWarnings - (a.architectureViolations + a.uiWarnings) ||
      b.files - a.files ||
      a.name.localeCompare(b.name)
  );
}

export function computeReadiness(
  result: Omit<ScanResult, 'readiness'>,
  config: AutopsiaConfig
): ProjectReadiness {
  const fresh = result.violations;
  const tolerated = result.tolerated ?? [];
  const allViolations = [...fresh, ...tolerated];
  const smells = result.configWarnings ?? [];
  const analysis = result.analysis;

  const coveragePct =
    result.totalFiles === 0
      ? 0
      : Math.round(((analysis?.classifiedFiles ?? result.totalFiles) / result.totalFiles) * 1000) / 10;

  // Verificar que existan al menos 2 capas arquitectónicas con archivos reales (además de composition)
  const nonCompositionActiveLayers = Object.entries(result.filesByLayer ?? {}).filter(
    ([layer, count]) => !/^(composition|app|di|root|bootstrap)$/i.test(layer) && count > 0
  ).length;
  const hasRealArchitectureLayers = nonCompositionActiveLayers >= 2;

  const freshArch = fresh.filter((v) => ARCH_RULES.has(v.rule));
  const toleratedArch = tolerated.filter((v) => ARCH_RULES.has(v.rule));
  const allUi = allViolations.filter((v) => UI_QUALITY_RULES.has(v.rule));
  const freshUiErrors = fresh.filter((v) => UI_QUALITY_RULES.has(v.rule) && v.severity === 'error');

  // 1. Veredicto de Clean Architecture
  let cleanArchVerdict: CleanArchVerdict;
  if (result.totalFiles === 0 || coveragePct < 70 || !hasRealArchitectureLayers) {
    cleanArchVerdict = 'unverified';
  } else if (freshArch.length > 0) {
    cleanArchVerdict = 'failing';
  } else if (toleratedArch.length > 0 || smells.length > 0 || coveragePct < 90 || analysis?.complete === false) {
    cleanArchVerdict = 'partial';
  } else {
    cleanArchVerdict = 'verified';
  }

  // 2. Semáforo de 4 Fases
  const foundationIssues = (analysis?.issues.length ?? 0) + (hasRealArchitectureLayers ? 0 : 1);
  const foundationStatus: PhaseStatus =
    result.totalFiles === 0 || coveragePct < 70 || (analysis?.configErrors ?? 0) > 0 || (analysis?.ambiguousFiles ?? 0) > 0
      ? 'fail'
      : analysis?.complete === false || !hasRealArchitectureLayers
        ? 'warn'
        : 'pass';

  const archIssues = freshArch.length + smells.length + toleratedArch.length + (hasRealArchitectureLayers ? 0 : 1);
  const archStatus: PhaseStatus =
    result.totalFiles === 0 || freshArch.length > 0
      ? 'fail'
      : smells.length > 0 || toleratedArch.length > 0 || !hasRealArchitectureLayers
        ? 'warn'
        : 'pass';

  const flowsIssues = allUi.length;
  const flowsStatus: PhaseStatus =
    result.totalFiles === 0 || freshUiErrors.length > 0
      ? 'fail'
      : allUi.length > 0
        ? 'warn'
        : 'pass';

  const prodStatuses = [foundationStatus, archStatus, flowsStatus];
  const productionStatus: PhaseStatus = prodStatuses.includes('fail')
    ? 'fail'
    : prodStatuses.includes('warn')
      ? 'warn'
      : 'pass';
  const productionIssues = foundationIssues + freshArch.length + smells.length + allUi.length;

  const phases: ReadinessPhase[] = [
    { id: 'foundation', status: foundationStatus, issuesCount: foundationIssues },
    { id: 'architecture', status: archStatus, issuesCount: archIssues },
    { id: 'flows', status: flowsStatus, issuesCount: flowsIssues },
    { id: 'production', status: productionStatus, issuesCount: productionIssues },
  ];

  // 3. Salud por Feature / Flujo
  const features = computeFeatureHealth(result.graph, allViolations, config);
  const flowByFile: Record<string, string> = {};
  for (const node of result.graph) {
    const flow = inferFeatureOrFlow(node.path, config);
    if (flow) flowByFile[node.path] = flow;
  }

  // 4. Plan de Acción Priorizado cuando hay hallazgos pendientes
  const stepSpecs: { id: RemediationStepId; priority: RemediationPriority; rules: string[] }[] = [
    { id: 'runtime-safety', priority: 'critical', rules: ['runtime-safety'] },
    { id: 'memory-leak', priority: 'critical', rules: ['memory-leak'] },
    {
      id: 'architecture',
      priority: 'high',
      rules: [
        'dependency-direction',
        'direct-data-access',
        'forbidden-external',
        'circular-deps',
        'feature-boundaries',
      ],
    },
    { id: 'render-bottleneck', priority: 'high', rules: ['render-bottleneck'] },
    {
      id: 'ui-lists-size',
      priority: 'medium',
      rules: ['scrollview-map', 'flatlist-performance', 'component-size'],
    },
  ];

  const remediationPlan: RemediationStep[] = [];
  for (const spec of stepSpecs) {
    const ruleSet = new Set(spec.rules);
    const matching = allViolations.filter((v) => ruleSet.has(v.rule));
    if (matching.length === 0) continue;
    const filesSet = new Set<string>();
    const flowCounts = new Map<string, number>();
    for (const v of matching) {
      filesSet.add(v.file);
      const flow = flowByFile[v.file];
      if (flow) flowCounts.set(flow, (flowCounts.get(flow) ?? 0) + 1);
    }
    const affectedFlows = [...flowCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name]) => name);

    remediationPlan.push({
      id: spec.id,
      priority: spec.priority,
      count: matching.length,
      filesCount: filesSet.size,
      affectedFlows,
      rules: spec.rules,
    });
  }

  return {
    cleanArchVerdict,
    phases,
    features,
    flowByFile,
    remediationPlan,
  };
}
