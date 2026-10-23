import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGraph } from '../src/scanner';
import { runRules } from '../src/rules/run';
import { detectConfigSmells } from '../src/smells';
import { validateConfig } from '../src/analysis';
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

  it('ignores fixed array literals, maps inside props and nested FlatLists', () => {
    write('src/presentation/Fixed.tsx', `
import { FlatList, ScrollView, Text } from 'react-native';
export const Fixed = ({ rows }: { rows: string[] }) => (
  <ScrollView refreshControl={rows.map((r) => <Text key={r}>{r}</Text>)[0]}>
    {['a', 'b'].map((t) => <Text key={t}>{t}</Text>)}
    <FlatList data={rows} keyExtractor={(r) => r} renderItem={renderRow} />
  </ScrollView>
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
