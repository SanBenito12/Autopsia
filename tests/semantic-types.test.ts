import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildGraph } from '../src/scanner';
import { runRules } from '../src/rules/run';
import { AutopsiaConfig } from '../src/types';

let root: string;
const config: AutopsiaConfig = { layers: [{ name: 'all', patterns: ['*'] }], dataAccessModules: ['client'], noDirectDataAccessIn: ['all'] };
function write(file: string, content: string) { const dest = path.join(root, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content); }
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-types-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const dependency = (file: string) => buildGraph(root, config).find(n => n.path === file)!.dependencies!;

describe('semantic type-only dependencies', () => {
  it('removes apparent cycles through ordinary imports of interfaces and type aliases', () => {
    write('store.ts', "import { Form as Renamed } from './hook'; export const store: Renamed = {};\n");
    write('hook.ts', "import { store } from './store'; export interface Form {} export const useForm = () => store;\n");
    expect(dependency('store.ts')[0]).toMatchObject({ typeOnly: true, resolved: true });
    expect(runRules(buildGraph(root, config), config)).toHaveLength(0);
    expect(buildGraph(root, config).find(n => n.path === 'store.ts')!.internalImports).toEqual([]);
  });
  it('follows aliases through named reexports and preserves dependency evidence', () => {
    write('types.ts', 'export type Form = { value: string };');
    write('barrel.ts', "export { Form as Fields } from './types';");
    write('consumer.ts', "import { Fields as Form } from './barrel'; export let fields: Form;");
    expect(dependency('barrel.ts')[0]).toMatchObject({ typeOnly: true, kind: 're-export' });
    expect(dependency('consumer.ts')[0]).toMatchObject({ typeOnly: true, specifier: './barrel' });
  });
  it('supports default interfaces but conservatively retains namespace and star reexports', () => {
    write('types.ts', 'export default interface Fields {} export interface Other {}');
    write('consumer.ts', "import Fields from './types'; import * as Types from './types'; export * from './types';");
    expect(dependency('consumer.ts').map(d => d.typeOnly)).toEqual([true, false, false]);
  });
  it('retains mixed imports, classes, enums, declaration merging, side effects and unresolved symbols', () => {
    write('source.ts', 'export interface Shape {} export class Model {} export enum Flag { One } export const value = 1; export interface Merged {} export const Merged = 1;');
    write('consumer.ts', "import { Shape, value } from './source'; import { Model } from './source'; import { Flag } from './source'; import { Merged } from './source'; import './source'; import { Missing } from './missing'; export { Shape, value } from './source';");
    expect(dependency('consumer.ts').every(d => !d.typeOnly)).toBe(true);
    expect(dependency('consumer.ts')[5].resolved).toBe(false);
  });
  it('excludes proven external types from data access and forbidden external rules', () => {
    write('node_modules/client/package.json', '{"name":"client","types":"index.d.ts"}');
    write('node_modules/client/index.d.ts', 'export interface Response {} export const client: () => Response;');
    write('consumer.ts', "import { Response } from 'client'; import type { Response as Explicit } from 'client'; export let result: Response;");
    const strict = { ...config, layers: [{ name: 'all', patterns: ['*'], forbiddenExternal: ['client'] }] };
    expect(runRules(buildGraph(root, strict), strict)).toHaveLength(0);
    write('consumer.ts', "import { Response, client } from 'client'; client();");
    expect(runRules(buildGraph(root, strict), strict).map(v => v.rule)).toEqual(['direct-data-access', 'forbidden-external']);
  });
});
