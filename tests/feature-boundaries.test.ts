import { describe, it, expect } from 'vitest';
import { checkFeatureBoundaries } from '../src/rules/feature-boundaries';
import { AutopsiaConfig, FileNode } from '../src/types';

describe('Regla feature-boundaries', () => {
  const baseConfig: AutopsiaConfig = {
    layers: [{ name: 'features', patterns: ['src/features/*'] }],
    dataAccessModules: [],
    noDirectDataAccessIn: [],
    features: {
      patterns: ['src/features/*'],
      enforcePublicApi: true,
    },
  };

  it('no produce violaciones si config.features no está definido', () => {
    const configWithoutFeatures: AutopsiaConfig = {
      layers: [{ name: 'features', patterns: ['src/features/*'] }],
      dataAccessModules: [],
      noDirectDataAccessIn: [],
    };
    const nodes: FileNode[] = [
      {
        path: 'src/features/cart/checkout.ts',
        layer: 'features',
        internalImports: ['src/features/auth/internal/token.ts'],
        externalImports: [],
        typeOnlyImports: [],
      },
    ];
    expect(checkFeatureBoundaries(nodes, configWithoutFeatures)).toEqual([]);
  });

  it('permite importaciones internas dentro de la misma feature', () => {
    const nodes: FileNode[] = [
      {
        path: 'src/features/auth/login.ts',
        layer: 'features',
        internalImports: ['src/features/auth/internal/token.ts'],
        externalImports: [],
        typeOnlyImports: [],
      },
    ];
    expect(checkFeatureBoundaries(nodes, baseConfig)).toEqual([]);
  });

  it('permite importar a través del index.ts público de otra feature', () => {
    const nodes: FileNode[] = [
      {
        path: 'src/features/cart/checkout.ts',
        layer: 'features',
        internalImports: ['src/features/auth/index.ts'],
        externalImports: [],
        typeOnlyImports: [],
      },
    ];
    expect(checkFeatureBoundaries(nodes, baseConfig)).toEqual([]);
  });

  it('falla cuando una feature importa archivos privados internos de otra feature', () => {
    const nodes: FileNode[] = [
      {
        path: 'src/features/cart/checkout.ts',
        layer: 'features',
        internalImports: ['src/features/auth/internal/token.ts'],
        externalImports: [],
        typeOnlyImports: [],
        dependencies: [
          {
            specifier: '../auth/internal/token',
            resolvedPath: 'src/features/auth/internal/token.ts',
            external: false,
            resolved: true,
            typeOnly: false,
            kind: 'import',
            line: 4,
            column: 1,
          },
        ],
      },
    ];
    const violations = checkFeatureBoundaries(nodes, baseConfig);
    expect(violations.length).toBe(1);
    expect(violations[0].rule).toBe('feature-boundaries');
    expect(violations[0].file).toBe('src/features/cart/checkout.ts');
    expect(violations[0].line).toBe(4);
    expect(violations[0].severity).toBe('error');
    expect(violations[0].suppressed).toBeFalsy();
  });

  it('falla cuando un archivo fuera de features importa archivos privados de una feature', () => {
    const nodes: FileNode[] = [
      {
        path: 'src/screens/App.tsx',
        layer: null,
        internalImports: ['src/features/auth/components/SecretModal.tsx'],
        externalImports: [],
        typeOnlyImports: [],
      },
    ];
    const violations = checkFeatureBoundaries(nodes, baseConfig);
    expect(violations.length).toBe(1);
    expect(violations[0].rule).toBe('feature-boundaries');
    expect(violations[0].file).toBe('src/screens/App.tsx');
  });

  it('respeta allowedCrossImports y bloquea dependencias no permitidas', () => {
    const configWithAllowed: AutopsiaConfig = {
      ...baseConfig,
      features: {
        patterns: ['src/features/*'],
        enforcePublicApi: true,
        allowedCrossImports: {
          cart: ['auth'], // cart puede importar auth
          auth: [], // auth no puede importar nada
        },
      },
    };

    const validNodes: FileNode[] = [
      {
        path: 'src/features/cart/checkout.ts',
        layer: 'features',
        internalImports: ['src/features/auth/index.ts'],
        externalImports: [],
        typeOnlyImports: [],
      },
    ];
    expect(checkFeatureBoundaries(validNodes, configWithAllowed)).toEqual([]);

    const invalidNodes: FileNode[] = [
      {
        path: 'src/features/auth/login.ts',
        layer: 'features',
        internalImports: ['src/features/cart/index.ts'],
        externalImports: [],
        typeOnlyImports: [],
      },
    ];
    const violations = checkFeatureBoundaries(invalidNodes, configWithAllowed);
    expect(violations.length).toBe(1);
    expect(violations[0].rule).toBe('feature-boundaries');
    expect(violations[0].file).toBe('src/features/auth/login.ts');
  });

  it('respeta comentarios autopsia-ignore-next-line', () => {
    const nodes: FileNode[] = [
      {
        path: 'src/features/cart/checkout.ts',
        layer: 'features',
        internalImports: ['src/features/auth/internal/token.ts'],
        externalImports: [],
        typeOnlyImports: [],
        dependencies: [
          {
            specifier: '../auth/internal/token',
            resolvedPath: 'src/features/auth/internal/token.ts',
            external: false,
            resolved: true,
            typeOnly: false,
            kind: 'import',
            line: 5,
            column: 1,
            suppressedRules: ['feature-boundaries'],
          },
        ],
      },
    ];
    const violations = checkFeatureBoundaries(nodes, baseConfig);
    expect(violations.length).toBe(1);
    expect(violations[0].suppressed).toBe(true);
  });

  it('excluye imports type-only (interfaces y type aliases) de violaciones entre features', () => {
    const nodes: FileNode[] = [
      {
        path: 'src/features/cart/checkout.ts',
        layer: 'features',
        internalImports: [],
        externalImports: [],
        typeOnlyImports: ['src/features/auth/internal/types.ts'],
        dependencies: [
          {
            specifier: '../auth/internal/types',
            resolvedPath: 'src/features/auth/internal/types.ts',
            external: false,
            resolved: true,
            typeOnly: true,
            kind: 'import',
            line: 2,
            column: 1,
          },
        ],
      },
    ];
    expect(checkFeatureBoundaries(nodes, baseConfig)).toEqual([]);
  });

  it('permite importar desde entrypoints públicos con sufijo de plataforma (index.native.ts, index.ios.tsx)', () => {
    const nodes: FileNode[] = [
      {
        path: 'src/features/cart/checkout.ts',
        layer: 'features',
        internalImports: ['src/features/auth/index.native.ts', 'src/features/profile/index.ios.tsx'],
        externalImports: [],
        typeOnlyImports: [],
      },
    ];
    expect(checkFeatureBoundaries(nodes, baseConfig)).toEqual([]);
  });
});
