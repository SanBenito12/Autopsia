import { Project, SourceFile } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, FileNode, FileSuppressions } from './types';
import { classifyFile } from './classifier';
import { parseIgnoreDirectives } from './ignores';

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
  suppressions?: FileSuppressions;
} {
  const internal: { resolved: string; typeOnly: boolean }[] = [];
  const external: string[] = [];

  // Comentarios autopsia-ignore-next-line / autopsia-ignore-file
  const ignores = parseIgnoreDirectives(sourceFile.getFullText());
  const suppressions: FileSuppressions = { internal: {}, external: {} };
  let hasSuppressions = false;
  const rulesAt = (line: number): string[] => [
    ...ignores.fileRules,
    ...(ignores.lineRules.get(line) ?? []),
  ];
  const record = (target: Record<string, string[]>, key: string, rules: string[]): void => {
    if (rules.length === 0) return;
    target[key] = [...new Set([...(target[key] ?? []), ...rules])];
    hasSuppressions = true;
  };

  for (const decl of sourceFile.getImportDeclarations()) {
    const spec = decl.getModuleSpecifierValue();
    const typeOnly = decl.isTypeOnly();
    const suppressedRules = rulesAt(decl.getStartLineNumber());

    const resolvedSource = decl.getModuleSpecifierSourceFile();
    if (resolvedSource) {
      const abs = resolvedSource.getFilePath();
      if (!abs.includes('node_modules')) {
        const resolved = path.relative(root, abs);
        internal.push({ resolved, typeOnly });
        record(suppressions.internal, resolved, suppressedRules);
        continue;
      }
      // Resuelto dentro de node_modules → externo
      external.push(spec);
      record(suppressions.external, spec, suppressedRules);
      continue;
    }

    // No resuelto por ts-morph: si empieza con . es interno roto, si no, externo
    if (spec.startsWith('.') || spec.startsWith('/')) {
      // Import interno no resoluble (p.ej. asset) — se ignora
      continue;
    }
    external.push(spec);
    record(suppressions.external, spec, suppressedRules);
  }

  return hasSuppressions ? { internal, external, suppressions } : { internal, external };
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

    const { internal, external, suppressions } = resolveImport(sf, root);

    const node: FileNode = {
      path: rel,
      layer: classifyFile(rel, config),
      internalImports: internal.filter((i) => !i.typeOnly).map((i) => i.resolved),
      typeOnlyImports: internal.filter((i) => i.typeOnly).map((i) => i.resolved),
      externalImports: external,
    };
    if (suppressions) node.suppressions = suppressions;
    nodes.push(node);
  }

  return nodes.sort((a, b) => a.path.localeCompare(b.path));
}
