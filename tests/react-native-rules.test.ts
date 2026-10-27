import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGraph } from '../src/scanner';
import { runRules } from '../src/rules/run';
import { detectConfigSmells } from '../src/smells';
import { validateConfig } from '../src/analysis';
import { scanProject } from '../src/scan';
import { AutopsiaConfig } from '../src/types';

let root: string;
const config: AutopsiaConfig = {
  layers: [
    { name: 'presentation', patterns: ['src/presentation/*'], allowedDependencies: ['domain'] },
    { name: 'domain', patterns: ['src/domain/*'], allowedDependencies: [] },
  ],
  dataAccessModules: ['axios'],
  noDirectDataAccessIn: ['presentation'],
};
function write(file: string, text: string) {
  const dest = path.join(root, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
}
const findings = (cfg: AutopsiaConfig = config) => runRules(buildGraph(root, cfg), cfg).filter((v) => !v.suppressed);
const lines = (n: number) => Array.from({ length: n }, (_, i) => `  const v${i} = ${i};`).join('\n');

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-rn-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('scrollview-map', () => {
  it('flags a ScrollView that maps a dynamic array into JSX', () => {
    write('src/presentation/List.tsx', `
import { ScrollView, Text } from 'react-native';
export const List = ({ items }: { items: string[] }) => (
  <ScrollView>
    {items.map((item) => <Text key={item}>{item}</Text>)}
  </ScrollView>
);`);
    const found = findings().filter((v) => v.rule === 'scrollview-map');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'warning', line: 4 });
    expect(found[0].message).toContain('items.map()');
  });

  it('ignores fixed array literals, maps inside props, tablists and nested FlatLists', () => {
    write('src/presentation/Fixed.tsx', `
import { FlatList, Pressable, ScrollView, Text } from 'react-native';
export const Fixed = ({ rows, categories }: { rows: string[]; categories: { id: string; label: string }[] }) => (
  <>
    <ScrollView refreshControl={rows.map((r) => <Text key={r}>{r}</Text>)[0]}>
      {['a', 'b'].map((t) => <Text key={t}>{t}</Text>)}
      <FlatList data={rows} keyExtractor={(r) => r} renderItem={renderRow} />
    </ScrollView>
    <ScrollView accessibilityRole="tablist" horizontal>
      {categories.map((c) => <Pressable key={c.id} accessibilityRole="tab"><Text>{c.label}</Text></Pressable>)}
    </ScrollView>
  </>
);
const renderRow = () => null;`);
    expect(findings().filter((v) => v.rule === 'scrollview-map')).toEqual([]);
  });
});

describe('flatlist-performance', () => {
  it('reports a missing keyExtractor and an inline renderItem separately', () => {
    write('src/presentation/Feed.tsx', `
import { FlatList, Text } from 'react-native';
export const Feed = ({ data }: { data: { id: string }[] }) => (
  <FlatList
    data={data}
    renderItem={({ item }) => <Text>{item.id}</Text>}
  />
);`);
    const found = findings().filter((v) => v.rule === 'flatlist-performance');
    expect(found.map((v) => v.diagnostic?.message.code).sort()).toEqual(['rule.listKey', 'rule.listRender']);
  });

  it('trusts spread props and stable renderItem references', () => {
    write('src/presentation/Good.tsx', `
import { FlatList } from 'react-native';
const renderItem = () => null;
export const Good = (props: object) => <FlatList {...props} data={[]} renderItem={renderItem} />;`);
    expect(findings().filter((v) => v.rule === 'flatlist-performance')).toEqual([]);
  });
});

describe('component-size', () => {
  it('flags components and hooks over the default limits, including memo components', () => {
    write('src/presentation/Big.tsx', `
import { memo } from 'react';
import { View } from 'react-native';
export const Big = memo(() => {
${lines(260)}
  return <View />;
});
export function useHuge() {
${lines(160)}
}
export function Small() { return <View />; }`);
    const found = findings().filter((v) => v.rule === 'component-size');
    expect(found.map((v) => v.message)).toEqual([
      expect.stringMatching(/^El componente Big tiene \d+ líneas \(límite 250\)$/),
      expect.stringMatching(/^El hook useHuge tiene \d+ líneas \(límite 150\)$/),
    ]);
  });

  it('respects configured limits and does not treat uppercase helpers without JSX as components', () => {
    write('src/presentation/Mid.tsx', `
import { View } from 'react-native';
export const Mid = () => {
${lines(60)}
  return <View />;
};
export const BuildConfig = () => {
${lines(400)}
};`);
    expect(findings().filter((v) => v.rule === 'component-size')).toEqual([]);
    const strict = findings({ ...config, limits: { componentLines: 50 } }).filter((v) => v.rule === 'component-size');
    expect(strict.map((v) => v.message)).toEqual([expect.stringContaining('Mid')]);
  });
});

describe('quality rules and the rest of Autopsia', () => {
  it('honours autopsia-ignore comments and the configured level', () => {
    write('src/presentation/Feed.tsx', `
import { FlatList } from 'react-native';
const render = () => null;
// autopsia-ignore-next-line flatlist-performance -- lista de 3 elementos fijos
export const Feed = () => <FlatList data={[]} renderItem={render} />;`);
    expect(findings().filter((v) => v.rule === 'flatlist-performance')).toEqual([]);
    write('src/presentation/Other.tsx', `
import { FlatList } from 'react-native';
const render = () => null;
export const Other = () => <FlatList data={[]} renderItem={render} />;`);
    const asError = findings({ ...config, rules: { 'flatlist-performance': 'error' } });
    expect(asError.filter((v) => v.rule === 'flatlist-performance').map((v) => v.severity)).toEqual(['error']);
    expect(findings({ ...config, rules: { 'flatlist-performance': 'off' } }).filter((v) => v.rule === 'flatlist-performance')).toEqual([]);
  });

  it('validates limits', () => {
    expect(validateConfig({ ...config, limits: { componentLines: 0 } }).map((i) => i.diagnostic?.message.code)).toContain('config.limits');
    expect(validateConfig({ ...config, limits: { hookLines: 120 } })).toEqual([]);
  });
});

describe('config smells', () => {
  const codes = (cfg: AutopsiaConfig) => detectConfigSmells(buildGraph(root, cfg), cfg).map((i) => i.diagnostic?.message.code);

  it('stays quiet for a sound configuration', () => {
    write('src/presentation/Screen.tsx', 'export const Screen = () => null;');
    write('src/domain/user.ts', 'export const user = 1;');
    expect(codes(config)).toEqual([]);
  });

  it('warns when the UI may import data, a layer is unrestricted or empty, and rules are relaxed', () => {
    write('src/presentation/Screen.tsx', 'export const Screen = () => null;');
    write('src/data/api.ts', 'export const api = 1;');
    const loose: AutopsiaConfig = {
      layers: [
        { name: 'presentation', patterns: ['src/presentation/*'], allowedDependencies: ['data', 'domain'] },
        { name: 'domain', patterns: ['src/domain/*'], allowedDependencies: ['data'] },
        { name: 'data', patterns: ['src/data/*'] },
        { name: 'composition', patterns: ['src/*'] },
      ],
      dataAccessModules: [],
      noDirectDataAccessIn: [],
      rules: { 'dependency-direction': 'off', 'circular-deps': 'warning' },
    };
    expect(codes(loose).sort()).toEqual([
      'smell.catchAll', 'smell.domainOutward', 'smell.emptyLayer', 'smell.emptyLayer', 'smell.noDataGuard',
      'smell.noDataModules', 'smell.ruleOff', 'smell.ruleWarning', 'smell.uiToData', 'smell.unrestricted',
    ].sort());
  });

  it('flags a domain that holds almost none of the code', () => {
    for (let i = 0; i < 60; i++) write(`src/presentation/S${i}.tsx`, 'export const s = 1;');
    write('src/domain/one.ts', 'export const one = 1;');
    expect(codes(config)).toEqual(['smell.thinDomain']);
  });
});

describe('readiness phases and feature/flow health', () => {
  it('evaluates Clean Architecture verdict, 4 phases and per-flow health (auth/login vs home)', () => {
    write('autopsia.config.json', JSON.stringify(config, null, 2));
    write('src/domain/auth/loginUseCase.ts', 'export const loginUseCase = () => true;');
    write('src/presentation/screens/auth/LoginScreen.tsx', `
import { loginUseCase } from '../../../domain/auth/loginUseCase';
export const LoginScreen = () => loginUseCase();
`);
    write('src/presentation/screens/home/HomeScreen.tsx', `
import { ScrollView, Text } from 'react-native';
export const HomeScreen = ({ items }: { items: string[] }) => (
  <ScrollView>{items.map((x) => <Text key={x}>{x}</Text>)}</ScrollView>
);
`);

    const outcome = scanProject(root);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const readiness = outcome.result.readiness!;
    expect(readiness.cleanArchVerdict).toBe('verified');
    expect(readiness.phases).toEqual([
      { id: 'foundation', status: 'pass', issuesCount: 0 },
      { id: 'architecture', status: 'pass', issuesCount: 0 },
      { id: 'flows', status: 'warn', issuesCount: 1 },
      { id: 'production', status: 'warn', issuesCount: 1 },
    ]);

    const auth = readiness.features.find((f) => f.name === 'auth');
    const home = readiness.features.find((f) => f.name === 'home');
    expect(auth).toMatchObject({
      name: 'auth',
      files: 2,
      architectureViolations: 0,
      uiWarnings: 0,
      status: 'healthy',
    });
    expect(home).toMatchObject({
      name: 'home',
      files: 1,
      architectureViolations: 0,
      uiWarnings: 1,
      status: 'warning',
    });
  });

  it('marks 1-file skeleton apps as unverified and ignores shared UI primitives in feature list', () => {
    const skeletonCfg: AutopsiaConfig = {
      layers: [{ name: 'composition', files: ['App.tsx'], allowedDependencies: [] }],
      dataAccessModules: ['axios'],
      noDirectDataAccessIn: [],
    };
    write('autopsia.config.json', JSON.stringify(skeletonCfg, null, 2));
    write('App.tsx', 'export const App = () => null;');
    const skeletonScan = scanProject(root);
    expect(skeletonScan.ok).toBe(true);
    if (skeletonScan.ok) {
      expect(skeletonScan.result.readiness?.cleanArchVerdict).toBe('unverified');
      expect(skeletonScan.result.readiness?.phases.find((p) => p.id === 'production')?.status).toBe('warn');
    }

    // Ahora añadimos archivos reales de auth + componentes UI compartidos
    const fullCfg: AutopsiaConfig = {
      layers: [
        { name: 'presentation', patterns: ['src/presentation/*', 'src/shared/components/*'], allowedDependencies: ['domain'] },
        { name: 'domain', patterns: ['src/domain/*'], allowedDependencies: [] },
        { name: 'data', patterns: ['src/data/*'], allowedDependencies: ['domain'] },
      ],
      dataAccessModules: ['axios'],
      noDirectDataAccessIn: ['presentation'],
    };
    write('autopsia.config.json', JSON.stringify(fullCfg, null, 2));
    write('src/shared/components/ButtonUI/ButtonUI.tsx', 'export const ButtonUI = () => null;');
    write('src/presentation/components/ui/SearchBarUI.tsx', 'export const SearchBarUI = () => null;');
    write('src/presentation/contexts/AuthContext.tsx', 'export const AuthContext = () => null;');
    write('src/data/sources/auth/authService.ts', 'export const authService = () => null;');
    write('src/domain/auth/Session.ts', 'export interface Session { token: string }');

    const fullScan = scanProject(root);
    expect(fullScan.ok).toBe(true);
    if (fullScan.ok) {
      const featureNames = fullScan.result.readiness?.features.map((f) => f.name) ?? [];
      expect(featureNames).toEqual(['auth']);
      expect(fullScan.result.readiness?.features[0]).toMatchObject({
        name: 'auth',
        files: 3,
        layers: ['presentation', 'domain', 'data'],
      });
    }
  });

  it('detects memory-leak, render-bottleneck and runtime-safety issues without false positives and builds remediationPlan', () => {
    const cfg: AutopsiaConfig = {
      layers: [
        { name: 'presentation', patterns: ['src/presentation/*'], allowedDependencies: ['domain'] },
        { name: 'domain', patterns: ['src/domain/*'], allowedDependencies: [] },
        { name: 'data', patterns: ['src/data/*'], allowedDependencies: ['domain'] },
      ],
      dataAccessModules: ['axios'],
      noDirectDataAccessIn: ['presentation'],
    };
    write('autopsia.config.json', JSON.stringify(cfg, null, 2));
    write('src/domain/Bike.ts', 'export interface Bike { id: string; valid: boolean }');

    // 1. Archivo con problemas reales de RAM, 60fps y 0-Bugs
    write(
      'src/presentation/screens/bikes/RentalScreen.tsx',
      `import React, { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import type { Bike } from '../../../domain/Bike';

const RentalContext = { Provider: ({ value, children }: any) => children };

export function RentalScreen({ bikes, eventBus }: { bikes: Bike[]; eventBus: any }) {
  const [isQrLoading, setIsQrLoading] = useState(false);
  const pulse = new Animated.Value(0);

  // memory-leak: Animated.loop sin .stop() + listener sin cleanup return + setInterval sin clearInterval
  useEffect(() => {
    Animated.loop(Animated.timing(pulse, { toValue: 1, useNativeDriver: true })).start();
    eventBus.subscribe(() => {});
    setInterval(() => {}, 1000);
  }, []);

  // runtime-safety: async directo en useEffect
  useEffect(async () => {}, []);

  const loadQr = async () => {
    try {
      setIsQrLoading(true);
      await Promise.resolve();
    } catch {}
  };

  console.log('rendering rental screen', loadQr);
  bikes.sort((a, b) => a.id.localeCompare(b.id));

  return (
    <RentalContext.Provider value={{ bikes, isQrLoading }}>
      <View>{bikes.filter((b) => b.valid).map((b) => <View key={b.id} />)}</View>
    </RentalContext.Provider>
  );
}
`
    );

    // 2. Archivo en data con JSON.parse sin try/catch y AsyncStorage con token
    write(
      'src/data/storage/tokenStorage.ts',
      `const AsyncStorage = { getItem: async (k: string) => '', setItem: async (k: string, v: string) => {} };
export async function saveAndReadToken(token: string) {
  await AsyncStorage.setItem('ACCESS_TOKEN', token);
  const raw = await AsyncStorage.getItem('ACCESS_TOKEN');
  return raw ? JSON.parse(raw) : null;
}
`
    );

    // 3. Archivo limpio que usa patrones seguros (no debe generar falsos positivos)
    write(
      'src/presentation/screens/auth/SafeLoginScreen.tsx',
      `import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

export function SafeLoginScreen({ items, bus }: { items: string[]; bus: { subscribe: (cb: () => void) => () => void } }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Retorno implícito de cleanup en arrow concisa: válido
  useEffect(() => bus.subscribe(() => {}), [bus]);

  // Sleep con new Promise(r => setTimeout): válido
  const delay = () => new Promise((r) => setTimeout(r, 100));

  const submit = async () => {
    try {
      setIsSubmitting(true);
      await delay();
    } catch {
      // ignore controlled error
    } finally {
      setIsSubmitting(false);
    }
  };

  const sorted = useMemo(() => [...items].sort(), [items]);
  return <View onTouchStart={submit}>{sorted.length}</View>;
}
`
    );

    const outcome = scanProject(root);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const rulesInRental = outcome.result.violations
      .filter((v) => v.file.endsWith('RentalScreen.tsx'))
      .map((v) => v.rule);
    expect(rulesInRental).toContain('memory-leak');
    expect(rulesInRental).toContain('render-bottleneck');
    expect(rulesInRental).toContain('runtime-safety');

    const rulesInStorage = outcome.result.violations
      .filter((v) => v.file.endsWith('tokenStorage.ts'))
      .map((v) => v.rule);
    expect(rulesInStorage).toContain('runtime-safety');

    const safeViolations = outcome.result.violations.filter((v) => v.file.endsWith('SafeLoginScreen.tsx'));
    expect(safeViolations).toEqual([]);

    const planIds = outcome.result.readiness?.remediationPlan?.map((s) => s.id) ?? [];
    expect(planIds).toEqual(['runtime-safety', 'memory-leak', 'render-bottleneck']);
  });

  it('detects cleartext-http, hardcoded-secret, async-effect-race and missing-keyboard-avoiding without false positives', () => {
    const cfg: AutopsiaConfig = {
      layers: [
        { name: 'presentation', patterns: ['src/presentation/*'], allowedDependencies: ['domain'] },
        { name: 'domain', patterns: ['src/domain/*'], allowedDependencies: [] },
        { name: 'data', patterns: ['src/data/*'], allowedDependencies: ['domain'] },
      ],
      dataAccessModules: ['axios'],
      noDirectDataAccessIn: ['presentation'],
    };
    write('autopsia.config.json', JSON.stringify(cfg, null, 2));

    // 1. Pantalla con formulario sin KeyboardAvoidingView + race condition en useEffect
    write(
      'src/presentation/screens/auth/ForgotPasswordModal.tsx',
      `import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

export function ForgotPasswordModal({ fetchUser }: { fetchUser: () => Promise<string> }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    const load = async () => {
      const result = await fetchUser();
      setEmail(result);
    };
    load();
  }, [fetchUser]);

  return (
    <View>
      <TextInput value={email} onChangeText={setEmail} />
      <TextInput value={code} onChangeText={setCode} />
    </View>
  );
}
`
    );

    // 2. Servicio con http:// inseguro y llave de prueba generada en memoria (sin prefijos literales en el repo)
    const dummySecret = ['AI', 'za', 'Sy', '0'.repeat(33)].join('');
    write(
      'src/data/api/legacyClient.ts',
      `export const LEGACY_ENDPOINT = 'http://api.production-app.com/v1/users';
export const MAPS_KEY = '${dummySecret}';
`
    );

    // 3. Pantalla segura con KeyboardAwareScreen, localhost http y cleanup flag
    write(
      'src/presentation/screens/auth/SafeRegisterScreen.tsx',
      `import React, { useEffect, useState } from 'react';
import { TextInput } from 'react-native';

const KeyboardAwareScreen = ({ children }: any) => children;
const DEV_URL = 'http://localhost:3000/health';

export function SafeRegisterScreen({ fetchProfile }: { fetchProfile: () => Promise<string> }) {
  const [name, setName] = useState(DEV_URL);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchProfile();
      if (!cancelled) setName(res);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchProfile]);

  return (
    <KeyboardAwareScreen>
      <TextInput value={name} onChangeText={setName} />
      <TextInput value={phone} onChangeText={setPhone} />
    </KeyboardAwareScreen>
  );
}
`
    );

    const outcome = scanProject(root);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const modalViolations = outcome.result.violations.filter((v) => v.file.endsWith('ForgotPasswordModal.tsx'));
    expect(modalViolations.map((v) => v.rule)).toContain('render-bottleneck');
    expect(modalViolations.map((v) => v.rule)).toContain('runtime-safety');

    const apiViolations = outcome.result.violations.filter((v) => v.file.endsWith('legacyClient.ts'));
    expect(apiViolations.length).toBeGreaterThanOrEqual(2);
    expect(apiViolations.every((v) => v.rule === 'runtime-safety')).toBe(true);

    const safeViolations = outcome.result.violations.filter((v) => v.file.endsWith('SafeRegisterScreen.tsx'));
    expect(safeViolations).toEqual([]);
  });
});
