import type { Lang, Violation } from '@shared/types';

/** Guía práctica por regla, resumida de docs/rules.md. */
export interface Guide {
  why: string;
  fixes: string[];
  ignoreReason: string;
}

const guides: Record<Lang, Record<string, Guide>> = {
  es: {
    'dependency-direction': {
      why: 'Si una capa conoce a otra que no le corresponde, cada cambio en esa capa (otra API, otra base de datos, caché) obliga a tocar archivos que no deberían enterarse. También impide probar esta capa con dobles falsos.',
      fixes: [
        'Define el contrato (una interfaz) en una capa permitida, normalmente domain, e importa solo ese contrato.',
        'Haz que la capa importada implemente el contrato y conéctalos en la raíz de composición (App.tsx, src/app o src/di).',
        'Si el import es una decisión consciente, añade una excepción puntual con el motivo; no apagues la regla entera.',
      ],
      ignoreReason: 'motivo y ticket',
    },
    'direct-data-access': {
      why: 'Cuando la UI llama a la red o al almacenamiento directamente, para probarla hay que simular esa librería, y los errores, reintentos y cambios de formato quedan repartidos por las pantallas.',
      fixes: [
        'Mueve la llamada a un repositorio o servicio fuera de esta capa.',
        'Expón un caso de uso o un hook que la pantalla consuma sin saber qué librería hay detrás.',
        'Para una pantalla interna de depuración, una excepción puntual con motivo es válida.',
      ],
      ignoreReason: 'pantalla interna, no producción',
    },
    'forbidden-external': {
      why: 'Esta capa debería poder ejecutarse y probarse sin el framework ni la red. Un paquete prohibido la ata a un entorno concreto y arrastra dependencias al reutilizarla.',
      fixes: [
        'Define en esta capa una interfaz con lo que necesitas y deja la implementación con el paquete en una capa exterior.',
        'Si el paquete es puramente utilitario y la decisión es permanente, quítalo de forbiddenExternal en la configuración.',
      ],
      ignoreReason: 'paquete puro, pendiente envolver',
    },
    'circular-deps': {
      why: 'Los ciclos provocan módulos que a veces llegan como undefined según el orden de carga, sobre todo con Metro, y hacen imposible probar o mover un archivo sin arrastrar al otro.',
      fixes: [
        'Extrae lo que ambos comparten a un tercer módulo del que dependan los dos.',
        'Si uno solo necesita tipos, usa import type: no cuenta como dependencia.',
        'Si el ciclo es heredado y aún no puedes romperlo, marca una sola de sus aristas con una excepción.',
      ],
      ignoreReason: 'ciclo heredado, ticket',
    },
    'feature-boundaries': {
      why: 'Importar archivos internos de otra feature acopla ambas a detalles que pueden cambiar sin aviso. La API pública (index.ts) es el contrato estable entre features.',
      fixes: [
        'Importa desde el index.ts de la feature y exporta allí lo que realmente deba ser público.',
        'Si dos features deben depender una de otra, decláralo en features.allowedCrossImports.',
      ],
      ignoreReason: 'migración a API pública',
    },
  },
  en: {
    'dependency-direction': {
      why: 'When a layer knows about one it should not, every change there (a new API, database or cache) forces edits in files that should not care. It also stops you testing this layer with fakes.',
      fixes: [
        'Define the contract (an interface) in an allowed layer, usually domain, and import only that contract.',
        'Have the imported layer implement the contract and wire them together at the composition root (App.tsx, src/app or src/di).',
        'If the import is a deliberate decision, add a one-off exception with the reason; do not turn the whole rule off.',
      ],
      ignoreReason: 'reason and ticket',
    },
    'direct-data-access': {
      why: 'When UI calls the network or storage directly, testing it means mocking that library, and errors, retries and response changes end up spread across screens.',
      fixes: [
        'Move the call into a repository or service outside this layer.',
        'Expose a use case or hook the screen consumes without knowing which library is behind it.',
        'For an internal debug screen, a one-off exception with a reason is fine.',
      ],
      ignoreReason: 'internal screen, not production',
    },
    'forbidden-external': {
      why: 'This layer should run and be tested without the framework or the network. A forbidden package ties it to one environment and drags dependencies along when reused.',
      fixes: [
        'Define an interface for what you need in this layer and keep the package-based implementation in an outer layer.',
        'If the package is a pure utility and the decision is permanent, remove it from forbiddenExternal in the configuration.',
      ],
      ignoreReason: 'pure package, wrap later',
    },
    'circular-deps': {
      why: 'Cycles cause modules that are sometimes undefined depending on load order, especially with Metro, and make it impossible to test or move one file without the other.',
      fixes: [
        'Extract what both share into a third module they both depend on.',
        'If one side only needs types, use import type: it does not count as a dependency.',
        'If the cycle is legacy and cannot be broken yet, mark a single edge with an exception.',
      ],
      ignoreReason: 'legacy cycle, ticket',
    },
    'feature-boundaries': {
      why: 'Importing another feature’s internal files couples both to details that can change without notice. The public API (index.ts) is the stable contract between features.',
      fixes: [
        'Import from the feature’s index.ts and export there what should really be public.',
        'If two features must depend on each other, declare it in features.allowedCrossImports.',
      ],
      ignoreReason: 'moving to public API',
    },
  },
};

const crossCutting: Record<Lang, string> = {
  es: 'Esto parece una utilidad transversal (logger, analytics o similar). Lo habitual es una interfaz en domain y un hook como useLogger que la reciba desde la raíz de la app: así el cambio queda en un solo archivo en vez de en cada pantalla.',
  en: 'This looks like a cross-cutting utility (logger, analytics or similar). The usual fix is an interface in domain plus a hook such as useLogger that receives it from the app root, so the coupling lives in one file instead of every screen.',
};

export function guideFor(lang: Lang, v: Violation): (Guide & { hint?: string }) | null {
  const guide = guides[lang][v.rule];
  if (!guide) return null;
  const target = `${v.detail ?? ''}`.toLowerCase();
  const hint = v.rule === 'dependency-direction' && /logger|log\.|analytics|tracking|sentry|crashlytics/.test(target)
    ? crossCutting[lang] : undefined;
  return { ...guide, hint };
}

export function ignoreComment(lang: Lang, v: Violation): string {
  const reason = guides[lang][v.rule]?.ignoreReason ?? '';
  return `// autopsia-ignore-next-line ${v.rule} -- ${reason}`;
}

export const rulesDocUrl = (lang: Lang, rule: string) =>
  `https://github.com/SanBenito12/Autopsia/blob/main/docs/${lang === 'es' ? 'rules.es.md' : 'rules.md'}#${rule}`;
