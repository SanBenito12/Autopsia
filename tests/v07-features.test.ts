import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printGitHubAnnotations, writeGitHubSummary } from '../src/reporter';
import { buildExpoConfig, detectPackageJsonDataAccess, initProject } from '../src/init';
import { buildGraph } from '../src/scanner';
import { computeAnalysisCoverage } from '../src/analysis';
import { generateHtml } from '../src/viewer';
import { checkFeatureBoundaries } from '../src/rules/feature-boundaries';
import { AutopsiaConfig, ScanResult, Violation } from '../src/types';

describe('Funcionalidades v0.6.0', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-v06-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('GitHub Actions Annotations & Summary', () => {
    it('imprime anotaciones en formato workflow ::error y ::warning', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const violations: Violation[] = [
        {
          rule: 'dependency-direction',
          severity: 'error',
          file: 'src/presentation/Login.tsx',
          line: 12,
          message: 'presentation cannot import data directly',
          detail: 'importa src/data/api.ts',
        },
        {
          rule: 'feature-boundaries',
          severity: 'warning',
          file: 'src/features/cart/index.ts',
          line: 5,
          message: 'cart should use public API of auth',
        },
      ];

      printGitHubAnnotations(violations);

      expect(consoleSpy).toHaveBeenCalledWith(
        '::error file=src/presentation/Login.tsx,line=12,title=Autopsia: dependency-direction::presentation cannot import data directly — importa src/data/api.ts'
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '::warning file=src/features/cart/index.ts,line=5,title=Autopsia: feature-boundaries::cart should use public API of auth'
      );

      consoleSpy.mockRestore();
    });

    it('escribe resumen markdown en GITHUB_STEP_SUMMARY cuando la variable existe', () => {
      const summaryFile = path.join(tmpRoot, 'step-summary.md');
      process.env.GITHUB_STEP_SUMMARY = summaryFile;

      const mockResult: ScanResult = {
        scannedAt: new Date().toISOString(),
        root: tmpRoot,
        totalFiles: 10,
        filesByLayer: { presentation: 5, domain: 5 },
        violations: [
          {
            rule: 'circular-deps',
            severity: 'error',
            file: 'src/domain/user.ts',
            line: 1,
            message: 'Ciclo detectado',
          },
        ],
        healthByLayer: { presentation: 100, domain: 80 },
        graph: [],
        analysis: {
          classifiedFiles: 10,
          unclassifiedFiles: 0,
          totalDependencies: 15,
          resolvedInternalDependencies: 15,
          unresolvedInternalDependencies: 0,
          configErrors: 0,
          ambiguousFiles: 0,
          complete: true,
          issues: [],
        },
      };

      writeGitHubSummary(mockResult);

      expect(fs.existsSync(summaryFile)).toBe(true);
      const content = fs.readFileSync(summaryFile, 'utf-8');
      expect(content).toContain('🔬 Autopsia Architecture Report');
      expect(content).toContain('`presentation` | 100%');
      expect(content).toContain('`domain` | 80%');
      expect(content).toContain('circular-deps');

      delete process.env.GITHUB_STEP_SUMMARY;
    });
  });

  describe('Expo Router y Estructuras en Raíz', () => {
    it('genera configuración adaptada con buildExpoConfig', () => {
      fs.mkdirSync(path.join(tmpRoot, 'app'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'components'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'services'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'features'), { recursive: true });

      const config = buildExpoConfig(tmpRoot);

      const layerNames = config.layers.map((l) => l.name);
      expect(layerNames).toContain('routes');
      expect(layerNames).toContain('components');
      expect(layerNames).toContain('services');
      expect(layerNames).toContain('features');

      const routes = config.layers.find((l) => l.name === 'routes');
      expect(routes?.patterns).toEqual(['app/*']);

      expect(config.features?.patterns).toEqual(['features/*']);
      expect(config.features?.enforcePublicApi).toBe(true);
    });

    it('autodetecta Expo Router en initProject cuando existe carpeta app/ en raíz', () => {
      fs.mkdirSync(path.join(tmpRoot, 'app'), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, 'app/index.tsx'), 'export default function App() {}');

      const result = initProject(tmpRoot);
      expect(result.status).toBe('created');

      const saved = JSON.parse(fs.readFileSync(result.configPath, 'utf-8'));
      expect(saved.layers.some((l: any) => l.name === 'routes')).toBe(true);
    });
  });

  describe('Resolución de sufijos de plataforma React Native (.ios, .android, .native, .web)', () => {
    it('resuelve imports hacia archivos con sufijo de plataforma sin marcar unresolved-import', () => {
      fs.mkdirSync(path.join(tmpRoot, 'src/presentation'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'src/infrastructure'), { recursive: true });

      fs.writeFileSync(
        path.join(tmpRoot, 'src/infrastructure/storage.native.ts'),
        'export const saveItem = (k: string, v: string) => {};'
      );
      fs.writeFileSync(
        path.join(tmpRoot, 'src/presentation/MapView.ios.tsx'),
        'export const MapView = () => null;'
      );
      fs.writeFileSync(
        path.join(tmpRoot, 'src/presentation/HomeScreen.tsx'),
        "import { MapView } from './MapView';\nimport { saveItem } from '../infrastructure/storage';\nexport const Home = () => { saveItem('a', 'b'); return MapView(); };"
      );

      const config: AutopsiaConfig = {
        layers: [
          { name: 'presentation', patterns: ['src/presentation/*'], allowedDependencies: ['infrastructure'] },
          { name: 'infrastructure', patterns: ['src/infrastructure/*'], allowedDependencies: [] },
        ],
        dataAccessModules: [],
        noDirectDataAccessIn: [],
        strict: true,
      };

      const graph = buildGraph(tmpRoot, config);
      const coverage = computeAnalysisCoverage(graph, config);

      expect(coverage.unresolvedInternalDependencies).toBe(0);
      expect(coverage.complete).toBe(true);

      const homeNode = graph.find((n) => n.path.endsWith('HomeScreen.tsx'));
      expect(homeNode?.internalImports).toContain(path.join('src', 'presentation', 'MapView.ios.tsx'));
      expect(homeNode?.internalImports).toContain(path.join('src', 'infrastructure', 'storage.native.ts'));
    });
  });

  describe('Auto-detección de librerías reales desde package.json y features en init', () => {
    it('detecta react-native-mmkv, firebase, expo-sqlite y @apollo/client desde package.json', () => {
      fs.writeFileSync(
        path.join(tmpRoot, 'package.json'),
        JSON.stringify({
          dependencies: {
            'react-native-mmkv': '^3.0.0',
            '@react-native-firebase/firestore': '^20.0.0',
            'expo-sqlite': '~14.0.0',
          },
          devDependencies: {
            '@apollo/client': '^3.11.0',
          },
        })
      );

      const detected = detectPackageJsonDataAccess(tmpRoot);
      expect(detected.dataAccessModules).toContain('react-native-mmkv');
      expect(detected.dataAccessModules).toContain('@react-native-firebase/firestore');
      expect(detected.dataAccessModules).toContain('expo-sqlite');
      expect(detected.dataAccessModules).toContain('@apollo/client');
      expect(detected.domainForbidden).toContain('react-native-mmkv');
      expect(detected.domainForbidden).toContain('@react-native-firebase');
      expect(detected.domainForbidden).toContain('@apollo');

      fs.mkdirSync(path.join(tmpRoot, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'src/presentation'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'src/features/auth'), { recursive: true });

      const res = initProject(tmpRoot);
      expect(res.status).toBe('created');
      const saved: AutopsiaConfig = JSON.parse(fs.readFileSync(res.configPath, 'utf-8'));
      expect(saved.dataAccessModules).toContain('react-native-mmkv');
      expect(saved.features?.patterns).toEqual(['src/features/*']);
      expect(saved.features?.enforcePublicApi).toBe(true);
    });
  });

  describe('Visor HTML Interactivo 2.0 (filtros y aristas de feature-boundaries)', () => {
    it('incluye controles de búsqueda/filtro y colorea aristas de feature-boundaries', () => {
      const config: AutopsiaConfig = {
        layers: [{ name: 'features', patterns: ['src/features/*'] }],
        dataAccessModules: [],
        noDirectDataAccessIn: [],
        features: { patterns: ['src/features/*'], enforcePublicApi: true },
      };

      const nodes = [
        {
          path: 'src/features/cart/checkout.ts',
          layer: 'features',
          internalImports: ['src/features/auth/internal/secret.ts'],
          externalImports: [],
          typeOnlyImports: [],
        },
        {
          path: 'src/features/auth/internal/secret.ts',
          layer: 'features',
          internalImports: [],
          externalImports: [],
          typeOnlyImports: [],
        },
      ];

      const violations = checkFeatureBoundaries(nodes, config);
      expect(violations).toHaveLength(1);

      const scanResult: ScanResult = {
        scannedAt: new Date().toISOString(),
        root: tmpRoot,
        totalFiles: 2,
        filesByLayer: { features: 2 },
        violations,
        healthByLayer: { features: 50 },
        graph: nodes,
      };

      const html = generateHtml(scanResult);
      expect(html).toContain('id="search-input"');
      expect(html).toContain('id="layer-filter"');
      expect(html).toContain('id="only-violations"');
      expect(html).toContain('id="reset-zoom"');
      expect(html).toContain('src/features/cart/checkout.ts|src/features/auth/internal/secret.ts');
    });
  });
});
