import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, FileNode } from '../src/types';
import { buildGraph } from '../src/scanner';

export const SAMPLE_APP = path.resolve(__dirname, '../fixtures/sample-app');
export const ALIAS_APP = path.resolve(__dirname, '../fixtures/alias-app');

export function loadConfig(root: string): AutopsiaConfig {
  return JSON.parse(fs.readFileSync(path.join(root, 'autopsia.config.json'), 'utf-8'));
}

export function loadGraph(root: string): { graph: FileNode[]; config: AutopsiaConfig } {
  const config = loadConfig(root);
  return { graph: buildGraph(root, config), config };
}

/** Ruta relativa con el separador del SO, como las produce el scanner. */
export function rel(...segments: string[]): string {
  return path.join(...segments);
}
