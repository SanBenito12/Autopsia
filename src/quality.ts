import { JsxElement, JsxOpeningElement, JsxSelfClosingElement, Node, SourceFile, SyntaxKind } from 'ts-morph';
import { CodeFact, QualityLimits } from './types';

export const DEFAULT_LIMITS: Required<QualityLimits> = { componentLines: 250, hookLines: 150 };

const SCROLL_TAGS = new Set(['ScrollView', 'Animated.ScrollView']);
const LIST_TAGS = new Set(['FlatList', 'SectionList', 'FlashList', 'Animated.FlatList']);
const JSX_KINDS = [SyntaxKind.JsxElement, SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxFragment];

type Fact = Omit<CodeFact, 'suppressedRules'>;
type Opening = JsxOpeningElement | JsxSelfClosingElement;

const tagOf = (el: Opening) => el.getTagNameNode().getText();
const shorten = (text: string) => (text.length > 40 ? `${text.slice(0, 37)}…` : text);

/** Elemento JSX más cercano que sea un contenedor de scroll o de lista. */
function closestScroller(node: Node): JsxElement | undefined {
  for (let current = node.getParent(); current; current = current.getParent()) {
    if (Node.isJsxElement(current)) {
      const tag = tagOf(current.getOpeningElement());
      if (SCROLL_TAGS.has(tag) || LIST_TAGS.has(tag)) return current;
    }
  }
  return undefined;
}

const CONSTANT_NAME = /^[A-Z][A-Z0-9_]+$/;

/**
 * ¿La lista es fija? Un arreglo literal o una constante en MAYÚSCULAS, siguiendo
 * hasta 3 saltos de definición: variable → propiedad devuelta por un hook → …
 */
function isFixedList(expr: Node, depth = 0): boolean {
  let node = expr;
  while (Node.isAsExpression(node) || Node.isSatisfiesExpression(node) || Node.isParenthesizedExpression(node) || Node.isNonNullExpression(node)) {
    node = node.getExpression();
  }
  if (Node.isArrayLiteralExpression(node)) return true;
  const nameNode = Node.isIdentifier(node) ? node : Node.isPropertyAccessExpression(node) ? node.getNameNode() : undefined;
  if (!nameNode) return false;
  if (CONSTANT_NAME.test(nameNode.getText())) return true;
  if (depth >= 3) return false;
  let definitions: Node[] = [];
  try { definitions = nameNode.getDefinitionNodes(); } catch { return false; }
  return definitions.some((def) => {
    const value = Node.isBindingElement(def) ? destructuredValue(def)
      : Node.isVariableDeclaration(def) || Node.isPropertyAssignment(def) ? def.getInitializer()
      : Node.isShorthandPropertyAssignment(def) ? def.getNameNode() : undefined;
    return !!value && value !== nameNode && isFixedList(value, depth + 1);
  });
}

/** `const { tabs } = useScreen()`: la propiedad `tabs` del valor que devuelve el hook. */
function destructuredValue(binding: import('ts-morph').BindingElement): Node | undefined {
  const declaration = binding.getParent().getParent();
  if (!Node.isVariableDeclaration(declaration)) return undefined;
  const source = declaration.getInitializer();
  const name = binding.getPropertyNameNode()?.getText() ?? binding.getName();
  const property = source?.getType().getProperty(name)?.getValueDeclaration();
  if (Node.isPropertyAssignment(property)) return property.getInitializer();
  if (Node.isShorthandPropertyAssignment(property)) return property.getNameNode();
  return undefined;
}

/**
 * <ScrollView> que pinta un arreglo con .map(): monta todos los elementos a la
 * vez. Se ignoran las listas fijas (arreglos literales y constantes).
 */
function isTabListScroll(element: JsxElement): boolean {
  const attrs = element.getOpeningElement().getAttributes().filter(Node.isJsxAttribute);
  const roleAttr = attrs.find((a) => a.getNameNode().getText() === 'accessibilityRole');
  if (roleAttr && /["']tablist["']/.test(roleAttr.getInitializer()?.getText() ?? '')) {
    return true;
  }
  return false;
}

function scrollViewMaps(sf: SourceFile): Fact[] {
  const facts: Fact[] = [];
  for (const element of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    if (!SCROLL_TAGS.has(tagOf(element.getOpeningElement()))) continue;
    if (isTabListScroll(element)) continue;
    const call = element.getDescendantsOfKind(SyntaxKind.CallExpression).find((c) => {
      const callee = c.getExpression();
      if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'map') return false;
      if (isFixedList(callee.getExpression())) return false;
      // Solo hijos de este ScrollView, no props ni listas anidadas
      if (c.getFirstAncestorByKind(SyntaxKind.JsxAttribute)?.getFirstAncestor((a) => a === element)) return false;
      if (closestScroller(c) !== element) return false;
      const callback = c.getArguments()[0];
      return !!callback && JSX_KINDS.some((kind) => callback.getDescendantsOfKind(kind).length > 0);
    });
    if (!call) continue;
    const receiver = (call.getExpression() as import('ts-morph').PropertyAccessExpression).getExpression().getText();
    facts.push({ kind: 'scrollview-map', line: element.getStartLineNumber(), params: { p0: shorten(receiver) } });
  }
  return facts;
}

/** FlatList y similares sin keyExtractor o con renderItem creado en cada render. */
function listProps(sf: SourceFile): Fact[] {
  const facts: Fact[] = [];
  const openings: Opening[] = [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ];
  for (const el of openings) {
    const tag = tagOf(el);
    if (!LIST_TAGS.has(tag)) continue;
    const attributes = el.getAttributes();
    const hasSpread = attributes.some((a) => Node.isJsxSpreadAttribute(a));
    const named = new Map(attributes.filter(Node.isJsxAttribute).map((a) => [a.getNameNode().getText(), a]));
    if (!hasSpread && !named.has('keyExtractor')) {
      facts.push({ kind: 'flatlist-key', line: el.getStartLineNumber(), params: { p0: tag } });
    }
    const render = named.get('renderItem')?.getInitializer();
    const fn = render && Node.isJsxExpression(render) ? render.getExpression() : undefined;
    if (fn && (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn))) {
      facts.push({ kind: 'flatlist-render', line: named.get('renderItem')!.getStartLineNumber(), params: { p0: tag } });
    }
  }
  return facts;
}

/** Componentes (Mayúscula y JSX) y hooks (useX) que superan el límite de líneas. */
function largeFunctions(sf: SourceFile, limits: Required<QualityLimits>): Fact[] {
  const facts: Fact[] = [];
  const isTsx = sf.getFilePath().endsWith('.tsx');
  const check = (name: string, fn: Node, statement: Node) => {
    const lines = fn.getEndLineNumber() - fn.getStartLineNumber() + 1;
    const isHook = /^use[A-Z0-9]/.test(name);
    const isComponent = isTsx && /^[A-Z]/.test(name) && JSX_KINDS.some((kind) => fn.getDescendantsOfKind(kind).length > 0);
    if (isHook && lines > limits.hookLines) {
      facts.push({ kind: 'hook-size', line: statement.getStartLineNumber(), params: { p0: name, p1: lines, p2: limits.hookLines } });
    } else if (isComponent && lines > limits.componentLines) {
      facts.push({ kind: 'component-size', line: statement.getStartLineNumber(), params: { p0: name, p1: lines, p2: limits.componentLines } });
    }
  };
  for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName();
    if (name) check(name, fn, fn);
  }
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    let init: Node | undefined = decl.getInitializer();
    // memo(() => …), React.memo(…), forwardRef(…)
    if (init && Node.isCallExpression(init) && /(^|\.)(memo|forwardRef)$/.test(init.getExpression().getText())) {
      init = init.getArguments()[0];
    }
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      check(decl.getName(), init, decl.getVariableStatement() ?? decl);
    }
  }
  return facts;
}

const GLOBAL_HOSTS = new Set(['globalThis', 'window', 'self']);

/** Llamadas directas a fetch() global (o window/globalThis.fetch) sin pasar por un cliente/repositorio. */
function directFetchCalls(sf: SourceFile): Fact[] {
  const facts: Fact[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (Node.isIdentifier(callee) && callee.getText() === 'fetch') {
      let localDef = false;
      try {
        localDef = callee.getDefinitionNodes().some((d) => d.getSourceFile() === sf);
      } catch {
        localDef = false;
      }
      if (!localDef) {
        facts.push({ kind: 'direct-fetch', line: call.getStartLineNumber(), params: { p0: 'fetch()' } });
      }
    } else if (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === 'fetch' &&
      GLOBAL_HOSTS.has(callee.getExpression().getText())
    ) {
      facts.push({ kind: 'direct-fetch', line: call.getStartLineNumber(), params: { p0: 'fetch()' } });
    }
  }
  return facts;
}

/**
 * Fugas de memoria y saturación de RAM:
 * 1. setInterval / setTimeout en componentes o hooks sin clearInterval / clearTimeout.
 * 2. Listeners / suscripciones en useEffect con cuerpo de bloque { ... } sin return de limpieza.
 * 3. Animated.loop(...).start() en useEffect sin .stop() o .reset() al desmontar.
 */
function memoryLeaks(sf: SourceFile): Fact[] {
  const facts: Fact[] = [];
  const filePath = sf.getFilePath().replace(/\\/g, '/');
  const isUiOrHookFile = filePath.endsWith('.tsx') || /\/use[A-Z]\w*\.(ts|tsx)$/.test(filePath);
  const fullText = sf.getFullText();
  const hasClearInterval = /\bclearInterval\b/.test(fullText);
  const hasClearTimeout = /\bclearTimeout\b/.test(fullText);

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();

    // 1. Timers sin limpieza
    if (/^(window\.|globalThis\.)?setInterval$/.test(exprText) && !hasClearInterval) {
      facts.push({ kind: 'timer-leak', line: call.getStartLineNumber(), params: { p0: 'setInterval' } });
    } else if (
      isUiOrHookFile &&
      /^(window\.|globalThis\.)?setTimeout$/.test(exprText) &&
      !hasClearTimeout
    ) {
      const inPromiseSleep = call.getFirstAncestor(
        (a) => Node.isNewExpression(a) && a.getExpression().getText() === 'Promise'
      );
      if (!inPromiseSleep) {
        facts.push({ kind: 'timer-leak', line: call.getStartLineNumber(), params: { p0: 'setTimeout' } });
      }
    }

    // 2. Animated.loop en useEffect sin .stop() / .reset()
    if (exprText === 'Animated.loop') {
      const useEffectCall = call.getFirstAncestor(
        (a) => Node.isCallExpression(a) && /^(React\.)?useEffect$/.test(a.getExpression().getText())
      );
      if (useEffectCall && !/\.(stop|reset)\s*\(/.test(useEffectCall.getText())) {
        facts.push({ kind: 'animation-leak', line: call.getStartLineNumber(), params: { p0: 'Animated.loop' } });
      }
    }

    // 3. Suscripciones / listeners en useEffect sin return de cleanup
    if (exprText === 'useEffect' || exprText === 'React.useEffect') {
      const arg0 = call.getArguments()[0];
      if (!arg0 || (!Node.isArrowFunction(arg0) && !Node.isFunctionExpression(arg0))) continue;
      const body = arg0.getBody();
      // Si es arrow concisa: useEffect(() => service.subscribe(...), []) ya devuelve el unsubscribe implícitamente
      if (!Node.isBlock(body)) continue;

      const hasCleanupReturn = body
        .getDescendantsOfKind(SyntaxKind.ReturnStatement)
        .some(
          (ret) =>
            ret.getExpression() !== undefined &&
            ret.getFirstAncestor((a) => Node.isFunctionLikeDeclaration(a)) === arg0
        );

      if (!hasCleanupReturn) {
        for (const inner of body.getDescendantsOfKind(SyntaxKind.CallExpression)) {
          const innerCallee = inner.getExpression();
          if (!Node.isPropertyAccessExpression(innerCallee)) continue;
          const method = innerCallee.getName();
          if (
            ['addEventListener', 'addListener', 'subscribe', 'watchPositionAsync', 'onAuthStateChange'].includes(
              method
            )
          ) {
            facts.push({
              kind: 'listener-leak',
              line: inner.getStartLineNumber(),
              params: { p0: shorten(innerCallee.getText()) },
            });
          }
        }
      }
    }
  }

  return facts;
}

/**
 * Cuellos de botella de rendimiento y fluidez (60fps):
 * 1. <Context.Provider value={{ ... }}> sin useMemo (y agravado si tiene setInterval de alta frecuencia).
 * 2. Cadenas .filter().map() o .sort() directamente en expresiones JSX fuera de useMemo.
 * 3. Animated.timing / Animated.spring sin useNativeDriver.
 * 4. console.log / console.debug dejados en código de producción.
 */
function renderBottlenecks(sf: SourceFile): Fact[] {
  const facts: Fact[] = [];
  const filePath = sf.getFilePath().replace(/\\/g, '/');
  const isTsx = filePath.endsWith('.tsx');
  const hasIntervalInFile = /\bsetInterval\s*\(/.test(sf.getFullText());
  const isLoggerOrSetup = /(^|\/)(setup|jest|scripts?|mocks?|__mocks__|.*logger)\.(ts|tsx|js|jsx)$/i.test(filePath);

  if (isTsx) {
    const openings: Opening[] = [
      ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ];
    for (const el of openings) {
      const tag = tagOf(el);
      if (!tag.endsWith('.Provider')) continue;
      for (const attr of el.getAttributes()) {
        if (!Node.isJsxAttribute(attr) || attr.getNameNode().getText() !== 'value') continue;
        const init = attr.getInitializer();
        const expr = init && Node.isJsxExpression(init) ? init.getExpression() : undefined;
        if (expr && (Node.isObjectLiteralExpression(expr) || Node.isArrayLiteralExpression(expr))) {
          facts.push({
            kind: hasIntervalInFile ? 'high-freq-context' : 'inline-context-value',
            line: attr.getStartLineNumber(),
            params: { p0: tag },
          });
        }
      }
    }

    // Pantallas o modales con >= 2 campos de texto sin KeyboardAvoidingView / KeyboardAware*
    if (/(Screen|Modal)\.tsx$/i.test(filePath)) {
      const inputElements = openings.filter((el) =>
        /^(TextInput|InputUI|FormInput|CustomInput|PasswordInput|AuthInput)$/.test(tagOf(el))
      );
      const hasKeyboardWrapper = /KeyboardAvoidingView|KeyboardAware|BottomSheetTextInput/i.test(sf.getFullText());
      if (inputElements.length >= 2 && !hasKeyboardWrapper) {
        facts.push({
          kind: 'missing-keyboard-avoiding',
          line: inputElements[0].getStartLineNumber(),
          params: { p0: String(inputElements.length) },
        });
      }
    }
  }

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const exprText = callee.getText();

    // Animated.timing / spring sin useNativeDriver
    if (exprText === 'Animated.timing' || exprText === 'Animated.spring') {
      const configArg = call.getArguments()[1];
      if (configArg && Node.isObjectLiteralExpression(configArg) && !configArg.getProperty('useNativeDriver')) {
        facts.push({
          kind: 'animated-js-driver',
          line: call.getStartLineNumber(),
          params: { p0: exprText },
        });
      }
    }

    // console.log / console.debug en producción
    if (!isLoggerOrSetup && (exprText === 'console.log' || exprText === 'console.debug')) {
      facts.push({
        kind: 'console-in-prod',
        line: call.getStartLineNumber(),
        params: { p0: exprText },
      });
    }

    // Cadenas pesadas .filter(...).map(...) en JSX sin useMemo
    if (isTsx && Node.isPropertyAccessExpression(callee) && callee.getName() === 'map') {
      const receiver = callee.getExpression();
      if (Node.isCallExpression(receiver)) {
        const receiverCallee = receiver.getExpression();
        if (
          Node.isPropertyAccessExpression(receiverCallee) &&
          ['filter', 'sort', 'flatMap', 'reduce'].includes(receiverCallee.getName())
        ) {
          const baseArray = receiverCallee.getExpression();
          if (!isFixedList(baseArray)) {
            const inMemoOrEffect = call
              .getAncestors()
              .some(
                (a) =>
                  Node.isCallExpression(a) &&
                  /^(React\.)?(useMemo|useCallback|useEffect)$/.test(a.getExpression().getText())
              );
            const inJsx = call.getFirstAncestorByKind(SyntaxKind.JsxExpression);
            if (!inMemoOrEffect && inJsx) {
              facts.push({
                kind: 'heavy-render-compute',
                line: call.getStartLineNumber(),
                params: { p0: shorten(`${baseArray.getText()}.${receiverCallee.getName()}().map()`) },
              });
            }
          }
        }
      }
    }
  }

  return facts;
}

/**
 * Comprueba si un identificador fue declarado localmente como copia fresca
 * (ej. `const copy = [...items]`, `items.slice()`, `items.filter()`, `Array.from()`).
 */
function isLocalFreshArray(node: Node): boolean {
  if (!Node.isIdentifier(node)) return false;
  let defs: Node[] = [];
  try {
    defs = node.getDefinitionNodes();
  } catch {
    return false;
  }
  return defs.some((def) => {
    if (!Node.isVariableDeclaration(def)) return false;
    const init = def.getInitializer();
    if (!init) return false;
    if (Node.isArrayLiteralExpression(init)) return true;
    if (Node.isCallExpression(init)) {
      const text = init.getExpression().getText();
      if (/\.(slice|filter|map|concat|flatMap)$/.test(text) || /^Array\.from$/.test(text) || /^Object\.(keys|values|entries)$/.test(text)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Seguridad en tiempo de ejecución, prevención de crashes y 0-bugs:
 * 1. useEffect(async () => ...)
 * 2. JSON.parse() sin try/catch
 * 3. Bloques catch {} vacíos que tragan errores silenciosamente
 * 4. Estados de carga colgados (setLoading(true) sin setLoading(false) en catch/finally)
 * 5. Mutación in-place de estado/props con .sort() o .reverse()
 * 6. Tokens o credenciales guardados en AsyncStorage sin cifrar
 */
function runtimeSafety(sf: SourceFile): Fact[] {
  const facts: Fact[] = [];

  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const exprText = callee.getText();

    // 1. useEffect(async () => ...)
    if (exprText === 'useEffect' || exprText === 'React.useEffect') {
      const arg0 = call.getArguments()[0];
      if (arg0 && (Node.isArrowFunction(arg0) || Node.isFunctionExpression(arg0)) && arg0.isAsync()) {
        facts.push({
          kind: 'async-use-effect',
          line: call.getStartLineNumber(),
          params: { p0: 'useEffect(async () => …)' },
        });
      }
    }

    // 2. JSON.parse sin try/catch
    if (exprText === 'JSON.parse') {
      const inTry = call.getFirstAncestorByKind(SyntaxKind.TryStatement);
      if (!inTry) {
        facts.push({
          kind: 'unsafe-json-parse',
          line: call.getStartLineNumber(),
          params: { p0: 'JSON.parse()' },
        });
      }
    }

    // 5. Mutación in-place con .sort() / .reverse() sobre estado o props
    if (Node.isPropertyAccessExpression(callee)) {
      const method = callee.getName();
      if (method === 'sort' || method === 'reverse') {
        const target = callee.getExpression();
        if (
          (Node.isIdentifier(target) || Node.isPropertyAccessExpression(target)) &&
          !isLocalFreshArray(target) &&
          !isFixedList(target)
        ) {
          facts.push({
            kind: 'state-mutation',
            line: call.getStartLineNumber(),
            params: { p0: shorten(`${target.getText()}.${method}()`) },
          });
        }
      }
    }

    // 6. Tokens sensibles en AsyncStorage plano
    if (exprText === 'AsyncStorage.setItem') {
      const keyArg = call.getArguments()[0];
      const keyText = keyArg?.getText() ?? '';
      if (/token|refresh|password|secret|jwt|credential/i.test(keyText)) {
        facts.push({
          kind: 'insecure-token-storage',
          line: call.getStartLineNumber(),
          params: { p0: shorten(keyText) },
        });
      }
    }
  }

  // 3. Bloques catch {} completamente vacíos
  for (const catchClause of sf.getDescendantsOfKind(SyntaxKind.CatchClause)) {
    const block = catchClause.getBlock();
    if (block.getStatements().length === 0) {
      const innerText = block.getText().slice(1, -1).trim();
      if (innerText.length === 0) {
        facts.push({
          kind: 'silent-catch',
          line: catchClause.getStartLineNumber(),
          params: { p0: 'catch {}' },
        });
      }
    }
  }

  // 4. Estados de carga colgados (setLoading(true) seguido de await sin setLoading(false) en catch/finally)
  const LOADING_SETTER = /^set[A-Z]\w*(Loading|Submitting|Fetching|Processing|Refreshing)$/;
  for (const tryStmt of sf.getDescendantsOfKind(SyntaxKind.TryStatement)) {
    const tryBlock = tryStmt.getTryBlock();
    const awaits = tryBlock.getDescendantsOfKind(SyntaxKind.AwaitExpression);
    if (awaits.length === 0) continue;
    const lastAwaitPos = awaits[awaits.length - 1].getEnd();

    for (const call of tryBlock.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const setterName = call.getExpression().getText();
      if (!LOADING_SETTER.test(setterName)) continue;
      if (call.getArguments()[0]?.getText() !== 'true') continue;
      // Debe haber al menos un await después de activar el loading dentro del try
      if (call.getStart() >= lastAwaitPos) continue;

      const resetPattern = new RegExp(`\\b${setterName}\\s*\\(\\s*false\\s*\\)`);
      const finallyText = tryStmt.getFinallyBlock()?.getText() ?? '';
      const catchText = tryStmt.getCatchClause()?.getBlock().getText() ?? '';
      if (!resetPattern.test(finallyText) && !resetPattern.test(catchText)) {
        facts.push({
          kind: 'stuck-loading',
          line: call.getStartLineNumber(),
          params: { p0: setterName },
        });
      }
    }
  }

  // 7. URLs http:// sin SSL (bloqueadas por iOS ATS / Android 9+) y llaves/secretos en duro
  const stringNodes = [
    ...sf.getDescendantsOfKind(SyntaxKind.StringLiteral),
    ...sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
  ];
  for (const strNode of stringNodes) {
    const val = strNode.getLiteralValue();
    if (
      /^http:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.|0\.0\.0\.0|schemas\.|www\.w3\.org)/i.test(
        val
      )
    ) {
      facts.push({
        kind: 'cleartext-http',
        line: strNode.getStartLineNumber(),
        params: { p0: shorten(val) },
      });
    } else if (
      /^(AIzaSy[A-Za-z0-9_-]{30,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})$/.test(
        val
      )
    ) {
      facts.push({
        kind: 'hardcoded-secret',
        line: strNode.getStartLineNumber(),
        params: { p0: `${val.slice(0, 12)}…` },
      });
    }
  }

  // 8. Condiciones de carrera en red/datos dentro de useEffect (await seguido de setState sin cleanup/AbortController)
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (exprText !== 'useEffect' && exprText !== 'React.useEffect') continue;
    const arg0 = call.getArguments()[0];
    if (!arg0 || (!Node.isArrowFunction(arg0) && !Node.isFunctionExpression(arg0))) continue;
    const body = arg0.getBody();
    if (!Node.isBlock(body)) continue;

    const hasCleanupReturn = body
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .some(
        (ret) =>
          ret.getExpression() !== undefined &&
          ret.getFirstAncestor((a) => Node.isFunctionLikeDeclaration(a)) === arg0
      );
    const effectText = body.getText();
    if (hasCleanupReturn || /AbortController|abort\(|cancelled|canceled|isMounted|mounted|active/i.test(effectText)) {
      continue;
    }

    const asyncFns = [
      ...body.getDescendantsOfKind(SyntaxKind.ArrowFunction).filter((f) => f.isAsync()),
      ...body.getDescendantsOfKind(SyntaxKind.FunctionExpression).filter((f) => f.isAsync()),
      ...body.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).filter((f) => f.isAsync()),
    ];
    for (const afn of asyncFns) {
      const awaits = afn.getDescendantsOfKind(SyntaxKind.AwaitExpression);
      if (awaits.length === 0) continue;
      const firstAwaitStart = awaits[0].getStart();
      // Solo reportar cuando el await invoca carga de red/datos/historial/casos de uso (no simples lecturas de permisos/flags locales)
      const awaitText = awaits.map((a) => a.getText()).join(' ');
      if (/isEnabled|getPermission|checkPermission|hasHardware|isEnrolled/i.test(awaitText)) continue;

      const settersAfterAwait = afn
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((c) => c.getStart() > firstAwaitStart && /^set[A-Z]\w*$/.test(c.getExpression().getText()));
      if (settersAfterAwait.length > 0) {
        facts.push({
          kind: 'async-effect-race',
          line: call.getStartLineNumber(),
          params: { p0: settersAfterAwait[0].getExpression().getText() },
        });
        break;
      }
    }
  }

  return facts;
}

export function collectCodeFacts(sf: SourceFile, limits: QualityLimits = {}): Fact[] {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  return [
    ...scrollViewMaps(sf),
    ...listProps(sf),
    ...largeFunctions(sf, resolved),
    ...directFetchCalls(sf),
    ...memoryLeaks(sf),
    ...renderBottlenecks(sf),
    ...runtimeSafety(sf),
  ].sort((a, b) => a.line - b.line);
}
