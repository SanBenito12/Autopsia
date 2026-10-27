import { format, MessageKey } from '../i18n';
import { CodeFactKind, FileNode, Violation } from '../types';

/**
 * Reglas de calidad de React Native. No miran imports sino patrones del AST
 * que el escáner deja en FileNode.codeFacts.
 */
const MESSAGES: Partial<Record<CodeFactKind, { rule: string; message: MessageKey; detail: MessageKey }>> = {
  'scrollview-map': { rule: 'scrollview-map', message: 'rule.scrollMap', detail: 'rule.scrollMapHint' },
  'flatlist-key': { rule: 'flatlist-performance', message: 'rule.listKey', detail: 'rule.listKeyHint' },
  'flatlist-render': { rule: 'flatlist-performance', message: 'rule.listRender', detail: 'rule.listRenderHint' },
  'component-size': { rule: 'component-size', message: 'rule.componentSize', detail: 'rule.componentSizeHint' },
  'hook-size': { rule: 'component-size', message: 'rule.hookSize', detail: 'rule.hookSizeHint' },
  'timer-leak': { rule: 'memory-leak', message: 'rule.timerLeak', detail: 'rule.timerLeakHint' },
  'listener-leak': { rule: 'memory-leak', message: 'rule.listenerLeak', detail: 'rule.listenerLeakHint' },
  'animation-leak': { rule: 'memory-leak', message: 'rule.animationLeak', detail: 'rule.animationLeakHint' },
  'inline-context-value': { rule: 'render-bottleneck', message: 'rule.inlineContext', detail: 'rule.inlineContextHint' },
  'high-freq-context': { rule: 'render-bottleneck', message: 'rule.highFreqContext', detail: 'rule.highFreqContextHint' },
  'heavy-render-compute': { rule: 'render-bottleneck', message: 'rule.heavyRender', detail: 'rule.heavyRenderHint' },
  'animated-js-driver': { rule: 'render-bottleneck', message: 'rule.animatedJsDriver', detail: 'rule.animatedJsDriverHint' },
  'console-in-prod': { rule: 'render-bottleneck', message: 'rule.consoleInProd', detail: 'rule.consoleInProdHint' },
  'async-use-effect': { rule: 'runtime-safety', message: 'rule.asyncUseEffect', detail: 'rule.asyncUseEffectHint' },
  'unsafe-json-parse': { rule: 'runtime-safety', message: 'rule.unsafeJsonParse', detail: 'rule.unsafeJsonParseHint' },
  'silent-catch': { rule: 'runtime-safety', message: 'rule.silentCatch', detail: 'rule.silentCatchHint' },
  'stuck-loading': { rule: 'runtime-safety', message: 'rule.stuckLoading', detail: 'rule.stuckLoadingHint' },
  'state-mutation': { rule: 'runtime-safety', message: 'rule.stateMutation', detail: 'rule.stateMutationHint' },
  'insecure-token-storage': { rule: 'runtime-safety', message: 'rule.insecureTokenStorage', detail: 'rule.insecureTokenStorageHint' },
  'cleartext-http': { rule: 'runtime-safety', message: 'rule.cleartextHttp', detail: 'rule.cleartextHttpHint' },
  'hardcoded-secret': { rule: 'runtime-safety', message: 'rule.hardcodedSecret', detail: 'rule.hardcodedSecretHint' },
  'async-effect-race': { rule: 'runtime-safety', message: 'rule.asyncEffectRace', detail: 'rule.asyncEffectRaceHint' },
  'missing-keyboard-avoiding': { rule: 'render-bottleneck', message: 'rule.missingKeyboardAvoiding', detail: 'rule.missingKeyboardAvoidingHint' },
};

export function checkCodeFacts(nodes: FileNode[], rule: string): Violation[] {
  const violations: Violation[] = [];
  for (const node of nodes) {
    for (const fact of node.codeFacts ?? []) {
      const spec = MESSAGES[fact.kind];
      if (!spec || spec.rule !== rule) continue;
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
