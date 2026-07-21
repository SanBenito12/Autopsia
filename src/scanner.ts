import { CallExpression, ImportDeclaration, Node, Project, SourceFile, SyntaxKind, ts } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, Dependency, DependencyKind, FileNode, FileSuppressions } from './types';
import { classifyFile } from './classifier';
import { parseIgnoreDirectives } from './ignores';

const DEFAULT_IGNORE = [
  'node_modules', 'dist', 'build', '.git', 'coverage', '__tests__', '__mocks__',
  '*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx',
];
const ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif',
  '.ttf', '.otf', '.mp3', '.wav', '.mp4', '.mov', '.json', '.css', '.scss',
]);

function isIgnored(relPath: string, ignore: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return ignore.some((rawPattern) => {
    const pattern = rawPattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    if (!pattern.includes('/') && !pattern.includes('*')) return parts.includes(pattern);
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    if (!pattern.includes('/')) {
      const segmentRegex = new RegExp(`^${escaped}$`);
      return parts.some((part) => segmentRegex.test(part));
    }
    return new RegExp(`^${escaped}(?:/|$)`).test(normalized);
  });
}

/**
 * Resuelve un import relativo a una ruta relativa al root del proyecto,
 * siguiendo barrels (index.ts) para no dejar que "laven" violaciones.
 */
function importIsTypeOnly(decl: ImportDeclaration): boolean {
  if (decl.isTypeOnly()) return true;
  // `import { type User } from './User'` también desaparece en runtime.
  if (decl.getDefaultImport() || decl.getNamespaceImport()) return false;
  const named = decl.getNamedImports();
  return named.length > 0 && named.every((item) => item.isTypeOnly());
}

function pathAliasMatches(specifier: string, project: Project): boolean {
  const paths = project.getCompilerOptions().paths ?? {};
  return Object.keys(paths).some((pattern) => {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(specifier);
  });
}

function callSpecifier(call: CallExpression): { specifier: string; kind: DependencyKind } | null {
  const expression = call.getExpression();
  const isDynamicImport = expression.getKind() === SyntaxKind.ImportKeyword;
  const isRequire = Node.isIdentifier(expression) && expression.getText() === 'require';
  if (!isDynamicImport && !isRequire) return null;
  const first = call.getArguments()[0];
  if (!first || !Node.isStringLiteral(first)) return null;
  return {
    specifier: first.getLiteralValue(),
    kind: isDynamicImport ? 'dynamic-import' : 'require',
  };
}

function resolveDependencies(sourceFile: SourceFile, root: string): {
  internal: { resolved: string; typeOnly: boolean }[];
  external: string[];
  dependencies: Dependency[];
  suppressions?: FileSuppressions;
} {
  const internal: { resolved: string; typeOnly: boolean }[] = [];
  const external: string[] = [];
  const dependencies: Dependency[] = [];
  const project = sourceFile.getProject();

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

  const recordDependency = (
    spec: string,
    kind: DependencyKind,
    typeOnly: boolean,
    positionNode: Node,
    resolvedSource?: SourceFile,
  ): void => {
    const location = sourceFile.getLineAndColumnAtPos(positionNode.getStart());
    const suppressedRules = rulesAt(positionNode.getStartLineNumber());
    if (resolvedSource) {
      const abs = resolvedSource.getFilePath();
      if (!abs.includes('node_modules')) {
        const resolved = path.relative(root, abs);
        internal.push({ resolved, typeOnly });
        record(suppressions.internal, resolved, suppressedRules);
        dependencies.push({
          specifier: spec,
          kind,
          line: location.line,
          column: location.column,
          typeOnly,
          external: false,
          resolvedPath: resolved,
          resolved: true,
        });
        return;
      }
      external.push(spec);
      record(suppressions.external, spec, suppressedRules);
      dependencies.push({
        specifier: spec,
        kind,
        line: location.line,
        column: location.column,
        typeOnly,
        external: true,
        resolved: true,
      });
      return;
    }

    // Imports relativos/absolutos y aliases del tsconfig son internos aunque
    // estén rotos. Antes se omitían y podían esconder una violación.
    if (ASSET_EXTENSIONS.has(path.extname(spec).toLowerCase())) {
      dependencies.push({
        specifier: spec,
        kind,
        line: location.line,
        column: location.column,
        typeOnly,
        // Los assets no participan en fronteras arquitectónicas.
        external: true,
        resolved: true,
      });
      return;
    }
    const internalLooking = spec.startsWith('.') || spec.startsWith('/') || pathAliasMatches(spec, project);
    if (internalLooking) {
      dependencies.push({
        specifier: spec,
        kind,
        line: location.line,
        column: location.column,
        typeOnly,
        external: false,
        resolved: false,
      });
      return;
    }
    external.push(spec);
    record(suppressions.external, spec, suppressedRules);
    dependencies.push({
      specifier: spec,
      kind,
      line: location.line,
      column: location.column,
      typeOnly,
      external: true,
      // Un paquete no necesita estar instalado para aplicar reglas por nombre.
      resolved: true,
    });
  };

  for (const decl of sourceFile.getImportDeclarations()) {
    recordDependency(
      decl.getModuleSpecifierValue(),
      'import',
      importIsTypeOnly(decl),
      decl.getModuleSpecifier(),
      decl.getModuleSpecifierSourceFile(),
    );
  }

  // Los barrels ya no pueden "lavar" dependencias: sus reexports forman
  // aristas reales del grafo y participan en reglas de capas y ciclos.
  for (const decl of sourceFile.getExportDeclarations()) {
    const moduleSpecifier = decl.getModuleSpecifier();
    if (!moduleSpecifier) continue;
    const named = decl.getNamedExports();
    const typeOnly = decl.isTypeOnly() || (named.length > 0 && named.every((item) => item.isTypeOnly()));
    recordDependency(
      decl.getModuleSpecifierValue() as string,
      're-export',
      typeOnly,
      moduleSpecifier,
      decl.getModuleSpecifierSourceFile(),
    );
  }

  // ts-morph no ofrece getModuleSpecifierSourceFile para llamadas; usamos el
  // resolvedor oficial de TypeScript con las mismas opciones del proyecto.
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const found = callSpecifier(call);
    if (!found) continue;
    const resolved = ts.resolveModuleName(
      found.specifier,
      sourceFile.getFilePath(),
      project.getCompilerOptions(),
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    const resolvedSource = resolved ? project.getSourceFile(resolved) : undefined;
    recordDependency(found.specifier, found.kind, false, call.getArguments()[0], resolvedSource);
  }

  return hasSuppressions
    ? { internal, external, dependencies, suppressions }
    : { internal, external, dependencies };
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

    const { internal, external, dependencies, suppressions } = resolveDependencies(sf, root);

    const node: FileNode = {
      path: rel,
      layer: classifyFile(rel, config),
      internalImports: internal.filter((i) => !i.typeOnly).map((i) => i.resolved),
      typeOnlyImports: internal.filter((i) => i.typeOnly).map((i) => i.resolved),
      externalImports: external,
      dependencies,
    };
    if (suppressions) node.suppressions = suppressions;
    nodes.push(node);
  }

  return nodes.sort((a, b) => a.path.localeCompare(b.path));
}
