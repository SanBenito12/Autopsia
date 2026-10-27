import type { Lang, Violation } from '@shared/types';

/** Guía práctica por regla, con ejemplos Antes/Después para dejar la app lista para producción. */
export interface Guide {
  why: string;
  fixes: string[];
  ignoreReason: string;
  badCode?: string;
  goodCode?: string;
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
      badCode: `// ❌ En presentation/screens/LoginScreen.tsx
import { authService } from '../../data/sources/authService';`,
      goodCode: `// ✅ En presentation/screens/LoginScreen.tsx
import type { AuthRepository } from '../../domain/repositories/AuthRepository';
// Recibe el caso de uso o repositorio inyectado desde domain/di`,
    },
    'direct-data-access': {
      why: 'Cuando la UI llama a la red o al almacenamiento directamente, para probarla hay que simular esa librería, y los errores, reintentos y cambios de formato quedan repartidos por las pantallas.',
      fixes: [
        'Mueve la llamada a un repositorio o servicio fuera de esta capa.',
        'Expón un caso de uso o un hook que la pantalla consuma sin saber qué librería hay detrás.',
        'Para una pantalla interna de depuración, una excepción puntual con motivo es válida.',
      ],
      ignoreReason: 'pantalla interna, no producción',
      badCode: `// ❌ En presentation: llamada directa a red o storage
const res = await fetch('https://api.miapp.com/login');`,
      goodCode: `// ✅ En presentation: delega al caso de uso del dominio
const session = await loginUseCase.execute(email, password);`,
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
    'scrollview-map': {
      why: 'Un <ScrollView> con .map() monta y mantiene en memoria todos los elementos de la lista al mismo tiempo. Cuando la lista crece (historial, catálogo, feed), bloquea el hilo JS/UI en React Native y dispara el consumo de RAM.',
      fixes: [
        'Reemplaza <ScrollView>{items.map(...)}</ScrollView> por <FlatList data={items} keyExtractor={(item) => item.id} renderItem={renderItem} /> (o FlashList).',
        'Si necesitas cabecera o formulario encima de la lista, pásalos en ListHeaderComponent y ListFooterComponent del FlatList en vez de envolverlo en un ScrollView.',
        'Si la lista tiene un número fijo y pequeño de elementos que proviene de una variable local, conviértela en constante en MAYÚSCULAS o añade una excepción puntual.',
      ],
      ignoreReason: 'lista corta de tamaño acotado',
      badCode: `<ScrollView>
  {items.map((item) => <ItemRow key={item.id} item={item} />)}
</ScrollView>`,
      goodCode: `<FlatList
  data={items}
  keyExtractor={(item) => String(item.id)}
  renderItem={renderItem}
/>`,
    },
    'flatlist-performance': {
      why: 'Sin keyExtractor, React Native usa el índice y re-renderiza filas de más al insertar o borrar. Y si pasas una función inline en renderItem={({ item }) => ...}, se crea una referencia nueva en cada render de la pantalla, forzando trabajo extra al hacer scroll.',
      fixes: [
        'Añade un keyExtractor estable basado en el identificador único del ítem: keyExtractor={(item) => String(item.id)}.',
        'Extrae la función renderItem fuera del componente o envuélvela en useCallback, y envuelve el componente de la fila con React.memo.',
      ],
      ignoreReason: 'lista estática pequeña',
      badCode: `<FlatList
  data={items}
  renderItem={({ item }) => <Row item={item} />}
/>`,
      goodCode: `const renderItem = useCallback(({ item }: { item: Item }) => <Row item={item} />, []);
<FlatList data={items} keyExtractor={(item) => item.id} renderItem={renderItem} />`,
    },
    'component-size': {
      why: 'Cuando una pantalla (por ejemplo LoginScreen o HomeScreen) o un hook supera el límite de líneas, suele mezclar diseño visual, validación de formularios, navegación y llamadas a datos en un solo archivo difícil de probar y mantener.',
      fixes: [
        'Extrae la lógica de estado, efectos y validaciones a un hook dedicado (ej. useLoginForm) o caso de uso en domain/application.',
        'Divide la interfaz en subcomponentes cohesivos (cabecera, formulario, estados vacíos o modales) en archivos separados.',
      ],
      ignoreReason: 'componente de presentación extenso pendiente de dividir',
    },
    'memory-leak': {
      why: 'Los timers (setInterval / setTimeout), suscripciones y bucles Animated.loop que no se detienen al desmontar la pantalla siguen ejecutándose en segundo plano. Acumulan cierres (closures) en RAM, drenan la batería y provocan errores al intentar actualizar componentes ya desmontados.',
      fixes: [
        'Guarda la referencia del timer (useRef o variable local en useEffect) y llama siempre a clearTimeout / clearInterval dentro de return () => ... al desmontar.',
        'En suscripciones (subscribe, addEventListener), devuelve la función de desuscripción: return () => sub.remove() o return () => unsubscribe().',
        'En Animated.loop(...), asigna la animación a una constante (const loop = Animated.loop(...)) y deténla en el cleanup: return () => loop.stop().',
      ],
      ignoreReason: 'timer global controlado manualmente',
      badCode: `useEffect(() => {
  Animated.loop(Animated.timing(pulse, { toValue: 1, useNativeDriver: true })).start();
  const id = setTimeout(() => focusInput(), 200);
}, []);`,
      goodCode: `useEffect(() => {
  const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, useNativeDriver: true }));
  loop.start();
  const id = setTimeout(() => focusInput(), 200);
  return () => { loop.stop(); clearTimeout(id); };
}, []);`,
    },
    'render-bottleneck': {
      why: 'En React Native, crear objetos nuevos en <Context.Provider value={{ ... }}> (especialmente si hay un setInterval actualizando estados cada segundo), ejecutar .filter().map() directos en JSX o dejar console.log activos bloquea el hilo JS y tumba la fluidez por debajo de 60 fps.',
      fixes: [
        'Envuelve el objeto value del Context.Provider en useMemo(() => ({ ... }), [deps]). Si tienes un cronómetro (setInterval cada 1s), sepáralo en un contexto independiente para no re-renderizar toda la app en cada tick.',
        'Mueve las cadenas .filter().map() o .sort() del JSX a un useMemo.',
        'Elimina console.log / console.debug de producción o envuélvelos en un logger que solo imprima cuando __DEV__ sea true.',
      ],
      ignoreReason: 'optimización no crítica en esta vista',
      badCode: `// ❌ Re-renderiza a todos los consumidores en cada cambio o tick de reloj
return (
  <RentalContext.Provider value={{ activeRental, remainingSeconds, startRental }}>
    {children}
  </RentalContext.Provider>
);`,
      goodCode: `// ✅ Memoiza el value y separa estados de alta frecuencia (reloj 1s)
const value = useMemo(
  () => ({ activeRental, startRental }),
  [activeRental, startRental]
);
return <RentalContext.Provider value={value}>{children}</RentalContext.Provider>;`,
    },
    'runtime-safety': {
      why: 'Estos patrones causan los bugs más graves en producción: crashes inmediatos al abrir la app (JSON.parse sin try/catch), pantallas congeladas en "Cargando..." para siempre (setLoading(true) sin finally), corrupción de estado (.sort() in-place) y robo de sesión (tokens en AsyncStorage plano).',
      fixes: [
        'Envuelve siempre JSON.parse en un bloque try / catch y devuelve un valor seguro por defecto (null) si el dato está corrupto.',
        'Cuando actives un estado de carga (setIsLoading(true)), apágalo siempre dentro de un bloque finally { setIsLoading(false); } para que nunca quede trabado.',
        'No mutes arreglos con lista.sort() o lista.reverse(); clona primero con [...lista].sort(...).',
        'Guarda tokens de acceso/refresco en expo-secure-store o react-native-keychain en lugar de AsyncStorage.',
      ],
      ignoreReason: 'validado previamente o entorno controlado',
      badCode: `// ❌ Si falla la red, isQrLoading queda en true para siempre; JSON.parse puede crashear
const data = JSON.parse(rawStorage);
try {
  setIsQrLoading(true);
  await fetchQrImage();
  setIsQrLoading(false);
} catch {}`,
      goodCode: `// ✅ Seguro contra datos corruptos y siempre libera el estado de carga
let data = null;
try { data = JSON.parse(rawStorage); } catch (e) { logger.warn(e); }
try {
  setIsQrLoading(true);
  await fetchQrImage();
} catch (err) {
  setError(err);
} finally {
  setIsQrLoading(false);
}`,
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
      badCode: `// ❌ In presentation/screens/LoginScreen.tsx
import { authService } from '../../data/sources/authService';`,
      goodCode: `// ✅ In presentation/screens/LoginScreen.tsx
import type { AuthRepository } from '../../domain/repositories/AuthRepository';`,
    },
    'direct-data-access': {
      why: 'When UI calls the network or storage directly, testing it means mocking that library, and errors, retries and response changes end up spread across screens.',
      fixes: [
        'Move the call into a repository or service outside this layer.',
        'Expose a use case or hook the screen consumes without knowing which library is behind it.',
        'For an internal debug screen, a one-off exception with a reason is fine.',
      ],
      ignoreReason: 'internal screen, not production',
      badCode: `const res = await fetch('https://api.myapp.com/login');`,
      goodCode: `const session = await loginUseCase.execute(email, password);`,
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
    'scrollview-map': {
      why: 'A <ScrollView> with .map() mounts and keeps every list item in memory at the same time. As the list grows (feed, catalog, history), it drops frames on the React Native JS/UI threads and spikes memory usage.',
      fixes: [
        'Replace <ScrollView>{items.map(...)}</ScrollView> with <FlatList data={items} keyExtractor={(item) => item.id} renderItem={renderItem} /> (or FlashList).',
        'If you have content above or below the list, pass it via ListHeaderComponent and ListFooterComponent instead of nesting inside a ScrollView.',
        'If the array is strictly bounded to a handful of items, declare it as an UPPERCASE constant or add a one-off exception.',
      ],
      ignoreReason: 'bounded short list',
      badCode: `<ScrollView>
  {items.map((item) => <ItemRow key={item.id} item={item} />)}
</ScrollView>`,
      goodCode: `<FlatList
  data={items}
  keyExtractor={(item) => String(item.id)}
  renderItem={renderItem}
/>`,
    },
    'flatlist-performance': {
      why: 'Without keyExtractor, React Native falls back to the array index and re-renders extra rows on insert/remove. Passing an inline arrow function to renderItem creates a new function reference on every screen render.',
      fixes: [
        'Provide a stable keyExtractor based on the item ID: keyExtractor={(item) => String(item.id)}.',
        'Hoist renderItem outside the component or wrap it in useCallback, and wrap the row component in React.memo.',
      ],
      ignoreReason: 'small static list',
      badCode: `<FlatList data={items} renderItem={({ item }) => <Row item={item} />} />`,
      goodCode: `const renderItem = useCallback(({ item }: { item: Item }) => <Row item={item} />, []);
<FlatList data={items} keyExtractor={(item) => item.id} renderItem={renderItem} />`,
    },
    'component-size': {
      why: 'When a screen (such as LoginScreen or HomeScreen) or hook grows past the line limit, it usually mixes layout, form validation, navigation and data fetching in a single file that is hard to test and maintain.',
      fixes: [
        'Extract state, effects and form validation into a dedicated hook (e.g. useLoginForm) or use case in domain/application.',
        'Split the JSX into smaller subcomponents (header, form fields, empty state, modals) in separate files.',
      ],
      ignoreReason: 'large screen pending split',
    },
    'memory-leak': {
      why: 'Timers (setInterval / setTimeout), listeners and Animated.loop calls that are not cleaned up on unmount keep running in the background. They retain closures in RAM, drain battery and trigger state updates on unmounted components.',
      fixes: [
        'Store the timer ID (in a ref or local variable) and call clearTimeout / clearInterval inside useEffect’s return () => ... cleanup.',
        'For subscriptions (subscribe, addEventListener), return the cleanup: return () => sub.remove() or return () => unsubscribe().',
        'For Animated.loop(...), keep the animation reference (const loop = Animated.loop(...)) and stop it on unmount: return () => loop.stop().',
      ],
      ignoreReason: 'manually managed timer',
      badCode: `useEffect(() => {
  Animated.loop(Animated.timing(pulse, { toValue: 1, useNativeDriver: true })).start();
  const id = setTimeout(() => focusInput(), 200);
}, []);`,
      goodCode: `useEffect(() => {
  const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, useNativeDriver: true }));
  loop.start();
  const id = setTimeout(() => focusInput(), 200);
  return () => { loop.stop(); clearTimeout(id); };
}, []);`,
    },
    'render-bottleneck': {
      why: 'In React Native, passing inline objects to <Context.Provider value={{ ... }}> (especially alongside a 1s setInterval timer), running .filter().map() directly inside JSX, or leaving console.log calls in production blocks the JS thread and drops frame rates below 60 fps.',
      fixes: [
        'Wrap the Context.Provider value in useMemo(() => ({ ... }), [deps]). If a 1-second timer updates countdown state, isolate it into its own context so the whole app does not re-render every second.',
        'Move .filter().map() or .sort() transformations into useMemo.',
        'Remove console.log / console.debug from production code or guard them behind __DEV__.',
      ],
      ignoreReason: 'non-critical render path',
      badCode: `return (
  <RentalContext.Provider value={{ activeRental, remainingSeconds, startRental }}>
    {children}
  </RentalContext.Provider>
);`,
      goodCode: `const value = useMemo(
  () => ({ activeRental, startRental }),
  [activeRental, startRental]
);
return <RentalContext.Provider value={value}>{children}</RentalContext.Provider>;`,
    },
    'runtime-safety': {
      why: 'These patterns cause critical production bugs: startup crashes (unprotected JSON.parse), screens stuck on an infinite loading spinner (setLoading(true) without finally), silent state corruption (in-place .sort()) and plaintext token exposure in AsyncStorage.',
      fixes: [
        'Wrap JSON.parse in try / catch and return a safe fallback (null) when storage data is malformed.',
        'Whenever you set a loading state (setIsLoading(true)), reset it inside a finally { setIsLoading(false); } block.',
        'Never mutate state or props with list.sort() or list.reverse(); clone first with [...list].sort(...).',
        'Store access/refresh tokens in expo-secure-store or react-native-keychain instead of plaintext AsyncStorage.',
      ],
      ignoreReason: 'validated upstream or non-sensitive',
      badCode: `const data = JSON.parse(rawStorage);
try {
  setIsQrLoading(true);
  await fetchQrImage();
  setIsQrLoading(false);
} catch {}`,
      goodCode: `let data = null;
try { data = JSON.parse(rawStorage); } catch (e) { logger.warn(e); }
try {
  setIsQrLoading(true);
  await fetchQrImage();
} catch (err) {
  setError(err);
} finally {
  setIsQrLoading(false);
}`,
    },
  },
};

const crossCutting: Record<Lang, string> = {
  es: 'Esto parece una utilidad transversal (logger, analytics o similar). Lo habitual es una interfaz en domain y un hook como useLogger que la reciba desde la raíz de la app: así el cambio queda en un solo archivo en vez de en cada pantalla.',
  en: 'This looks like a cross-cutting utility (logger, analytics or similar). The usual fix is an interface in domain plus a hook such as useLogger that receives it from the app root, so the coupling lives in one file instead of every screen.',
};

const directFetchHint: Record<Lang, string> = {
  es: 'Esta pantalla o componente llama a fetch() directamente. En flujos como Login o carga de datos, encapsula la petición en un servicio/repositorio de infrastructure o data y expón un caso de uso en domain para poder probar el flujo sin red.',
  en: 'This screen or component calls fetch() directly. In flows like Login or data loading, move the request into an infrastructure/data repository and expose a domain use case so you can test the flow without network calls.',
};

export function guideFor(lang: Lang, v: Violation): (Guide & { hint?: string }) | null {
  const guide = guides[lang][v.rule];
  if (!guide) return null;
  const target = `${v.detail ?? ''}`.toLowerCase();
  const msg = `${v.message ?? ''}`.toLowerCase();
  const hint =
    v.rule === 'dependency-direction' && /logger|log\.|analytics|tracking|sentry|crashlytics/.test(target)
      ? crossCutting[lang]
      : v.rule === 'direct-data-access' && msg.includes('fetch()')
        ? directFetchHint[lang]
        : undefined;

  if (msg.includes('keyboardavoidingview')) {
    return {
      ...guide,
      hint,
      badCode: `<View style={styles.form}>\n  <TextInput value={email} />\n  <TextInput value={password} />\n</View>`,
      goodCode: `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>\n  <View style={styles.form}>\n    <TextInput value={email} />\n    <TextInput value={password} />\n  </View>\n</KeyboardAvoidingView>`,
    };
  }
  if (msg.includes('condición de carrera') || msg.includes('race condition')) {
    return {
      ...guide,
      hint,
      badCode: `useEffect(() => {\n  const load = async () => {\n    const data = await fetchHistory();\n    setHistory(data);\n  };\n  void load();\n}, []);`,
      goodCode: `useEffect(() => {\n  let cancelled = false;\n  const load = async () => {\n    const data = await fetchHistory();\n    if (!cancelled) setHistory(data);\n  };\n  void load();\n  return () => { cancelled = true; };\n}, []);`,
    };
  }
  if (msg.includes('http://')) {
    return {
      ...guide,
      hint,
      badCode: `const API_URL = 'http://api.miapp.com/v1';`,
      goodCode: `const API_URL = 'https://api.miapp.com/v1';`,
    };
  }

  return { ...guide, hint };
}

export function buildFindingAiPrompt(
  lang: Lang,
  root: string,
  v: Violation,
  snippetLines?: { num: number; text: string; active: boolean }[]
): string {
  const g = guideFor(lang, v);
  const codeBlock =
    snippetLines && snippetLines.length > 0
      ? `\n\`\`\`tsx\n${snippetLines.map((l) => `${l.num}${l.active ? ' > ' : '   '}${l.text}`).join('\n')}\n\`\`\`\n`
      : '';
  if (lang === 'es') {
    return [
      `Corrige este hallazgo detectado por Autopsia en el proyecto \`${root}\`:`,
      `- **Archivo**: \`${v.file}\`${v.line ? ` (línea ${v.line})` : ''}`,
      `- **Regla**: \`${v.rule}\``,
      `- **Problema**: ${v.message}${v.detail ? ` — ${v.detail}` : ''}`,
      codeBlock,
      g ? `**Cómo debe resolverse**:\n${g.fixes.map((f) => `- ${f}`).join('\n')}` : '',
      g?.goodCode ? `\n**Patrón esperado**:\n\`\`\`tsx\n${g.goodCode}\n\`\`\`` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `Fix this finding detected by Autopsia in project \`${root}\`:`,
    `- **File**: \`${v.file}\`${v.line ? ` (line ${v.line})` : ''}`,
    `- **Rule**: \`${v.rule}\``,
    `- **Issue**: ${v.message}${v.detail ? ` — ${v.detail}` : ''}`,
    codeBlock,
    g ? `**How to fix**:\n${g.fixes.map((f) => `- ${f}`).join('\n')}` : '',
    g?.goodCode ? `\n**Expected pattern**:\n\`\`\`tsx\n${g.goodCode}\n\`\`\`` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildStepAiPrompt(lang: Lang, root: string, stepTitle: string, violations: Violation[]): string {
  const list = violations
    .slice(0, 25)
    .map((v) => `- \`${v.file}${v.line ? `:${v.line}` : ''}\` [\`${v.rule}\`]: ${v.message}${v.detail ? ` (${v.detail})` : ''}`)
    .join('\n');
  const more = violations.length > 25 ? `\n- ... (${violations.length - 25} more)` : '';
  if (lang === 'es') {
    return `En el proyecto \`${root}\`, corrige los siguientes hallazgos de **${stepTitle}** detectados por Autopsia sin romper la funcionalidad existente:\n\n${list}${more}`;
  }
  return `In project \`${root}\`, fix the following **${stepTitle}** findings detected by Autopsia without breaking existing behavior:\n\n${list}${more}`;
}

export function ignoreComment(lang: Lang, v: Violation): string {
  const reason = guides[lang][v.rule]?.ignoreReason ?? '';
  return `// autopsia-ignore-next-line ${v.rule} -- ${reason}`;
}

export const rulesDocUrl = (lang: Lang, rule: string) =>
  `https://github.com/SanBenito12/Autopsia/blob/main/docs/${lang === 'es' ? 'rules.es.md' : 'rules.md'}#${rule}`;
