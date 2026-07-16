import { describe, expect, it } from 'vitest';
import { classifyFile } from '../src/classifier';
import { AutopsiaConfig } from '../src/types';

function configWith(patterns: string[], name = 'capa'): AutopsiaConfig {
  return {
    layers: [{ name, patterns }],
    dataAccessModules: [],
    noDirectDataAccessIn: [],
  };
}

describe('classifier', () => {
  it('matchea patrón con * contra cualquier archivo bajo la carpeta', () => {
    const config = configWith(['src/presentation/*'], 'presentation');
    expect(classifyFile('src/presentation/screens/Home.tsx', config)).toBe('presentation');
    expect(classifyFile('src/presentation/hooks/useAuth.ts', config)).toBe('presentation');
  });

  it('matchea patrón sin * como substring de la ruta', () => {
    const config = configWith(['src/domain'], 'domain');
    expect(classifyFile('src/domain/entities/User.ts', config)).toBe('domain');
  });

  it('es case-insensitive', () => {
    const config = configWith(['src/Domain/*'], 'domain');
    expect(classifyFile('src/domain/entities/User.ts', config)).toBe('domain');
    expect(classifyFile('SRC/DOMAIN/x.ts', config)).toBe('domain');
  });

  it('normaliza separadores de Windows', () => {
    const config = configWith(['src/data/*'], 'data');
    expect(classifyFile('src\\data\\repos\\UserRepo.ts', config)).toBe('data');
  });

  it('sin match devuelve null', () => {
    const config = configWith(['src/presentation/*'], 'presentation');
    expect(classifyFile('src/utils/helpers.ts', config)).toBeNull();
    expect(classifyFile('App.tsx', config)).toBeNull();
  });

  it('respeta el orden de las capas: gana la primera que matchea', () => {
    const config: AutopsiaConfig = {
      layers: [
        { name: 'primera', patterns: ['src/shared/*'] },
        { name: 'segunda', patterns: ['src/*'] },
      ],
      dataAccessModules: [],
      noDirectDataAccessIn: [],
    };
    expect(classifyFile('src/shared/util.ts', config)).toBe('primera');
    expect(classifyFile('src/otra/cosa.ts', config)).toBe('segunda');
  });
});
