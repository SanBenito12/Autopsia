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
function scrollViewMaps(sf: SourceFile): Fact[] {
  const facts: Fact[] = [];
  for (const element of sf.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    if (!SCROLL_TAGS.has(tagOf(element.getOpeningElement()))) continue;
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

export function collectCodeFacts(sf: SourceFile, limits: QualityLimits = {}): Fact[] {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  return [...scrollViewMaps(sf), ...listProps(sf), ...largeFunctions(sf, resolved)]
    .sort((a, b) => a.line - b.line);
}
