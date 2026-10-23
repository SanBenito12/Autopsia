import { format, MessageKey } from '../i18n';
import { CodeFactKind, FileNode, Violation } from '../types';

/**
 * Reglas de calidad de React Native. No miran imports sino patrones del AST
 * que el escáner deja en FileNode.codeFacts.
 */
const MESSAGES: Record<CodeFactKind, { rule: string; message: MessageKey; detail: MessageKey }> = {
  'scrollview-map': { rule: 'scrollview-map', message: 'rule.scrollMap', detail: 'rule.scrollMapHint' },
  'flatlist-key': { rule: 'flatlist-performance', message: 'rule.listKey', detail: 'rule.listKeyHint' },
  'flatlist-render': { rule: 'flatlist-performance', message: 'rule.listRender', detail: 'rule.listRenderHint' },
  'component-size': { rule: 'component-size', message: 'rule.componentSize', detail: 'rule.componentSizeHint' },
  'hook-size': { rule: 'component-size', message: 'rule.hookSize', detail: 'rule.hookSizeHint' },
};

export function checkCodeFacts(nodes: FileNode[], rule: string): Violation[] {
  const violations: Violation[] = [];
  for (const node of nodes) {
    for (const fact of node.codeFacts ?? []) {
      const spec = MESSAGES[fact.kind];
      if (spec.rule !== rule) continue;
      const violation: Violation = {
        diagnostic: { message: { code: spec.message, params: fact.params }, detail: { code: spec.detail, params: {} } },
        rule,
        severity: 'warning',
        file: node.path,
        line: fact.line,
        message: format(spec.message, fact.params, 'es'),
        detail: format(spec.detail, {}, 'es'),
      };
      if (fact.suppressedRules?.some((r) => r === '*' || r === rule)) violation.suppressed = true;
      violations.push(violation);
    }
  }
  return violations;
}
