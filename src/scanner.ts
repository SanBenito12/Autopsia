import { Project, SourceFile } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, FileNode } from './types';
import { classifyFile } from './classifier';

const DEFAULT_IGNORE = ['node_modules', 'dist', 'build', '.git', 'coverage', '__tests__', '__mocks__'];

function isIgnored(relPath: string, ignore: string[]): boolean {
  const parts = relPath.split(path.sep);
  return parts.some((p) => ignore.includes(p));
}

/**
 * Resuelve un import relativo a una ruta relativa al root del proyecto,
 * siguiendo barrels (index.ts) para no dejar que "laven" violaciones.
 */
function resolveImport(sourceFile: SourceFile, root: string): {
  internal: { resolved: string; typeOnly: boolean }[];
  external: string[];
} {
  const internal: { resolved: string; typeOnly: boolean }[] = [];
  const external: string[] = [];

  for (const decl of sourceFile.getImportDeclarations()) {
    const spec = decl.getModuleSpecifierValue();
    const typeOnly = decl.isTypeOnly();

    const resolvedSource = decl.getModuleSpecifierSourceFile();
    if (resolvedSource) {
      const abs = resolvedSource.getFilePath();
      if (!abs.includes('node_modules')) {
        internal.push({ resolved: path.relative(root, abs), typeOnly });
        continue;
      }
      // Resuelto dentro de node_modules → externo
      external.push(spec);
      continue;
    }

    // No resuelto por ts-morph: si empieza con . es interno roto, si no, externo
    if (spec.startsWith('.') || spec.startsWith('/')) {
      // Import interno no resoluble (p.ej. asset) — se ignora
      continue;
    }
    external.push(spec);
  }

  return { internal, external };
}

export function buildGraph(root: string, config: AutopsiaConfig, tsconfigPath?: string): FileNode[] {
  const ignore = [...DEFAULT_IGNORE, ...(config.ignore ?? [])];

  // Usar el tsconfig del proyecto analizado (si existe) para que ts-morph
  // resuelva sus path aliases (p. ej. "@/*": ["src/*"]).
  const resolvedTsconfig = tsconfigPath
    ? path.resolve(tsconfigPath)
    : path.join(root, 'tsconfig.json');

  const project = fs.existsSync(resolvedTsconfig)
    ? new Project({
        tsConfigFilePath: resolvedTsconfig,
        skipAddingFilesFromTsConfig: true,
      })
    : new Project({
        compilerOptions: {
          allowJs: false,
          jsx: 4, // react-jsx
          esModuleInterop: true,
          resolveJsonModule: true,
          skipLibCheck: true,
        },
        skipAddingFilesFromTsConfig: true,
      });

  project.addSourceFilesAtPaths([
    path.join(root, '**/*.ts'),
    path.join(root, '**/*.tsx'),
    `!${path.join(root, '**/node_modules/**')}`,
    `!${path.join(root, '**/*.d.ts')}`,
  ]);

  const nodes: FileNode[] = [];

  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(root, sf.getFilePath());
    if (isIgnored(rel, ignore)) continue;

    const { internal, external } = resolveImport(sf, root);

    nodes.push({
      path: rel,
      layer: classifyFile(rel, config),
      internalImports: internal.filter((i) => !i.typeOnly).map((i) => i.resolved),
      typeOnlyImports: internal.filter((i) => i.typeOnly).map((i) => i.resolved),
      externalImports: external,
    });
  }

  return nodes.sort((a, b) => a.path.localeCompare(b.path));
}
