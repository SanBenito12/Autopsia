import { useEffect, useMemo, useState } from 'react';
import type { Lang, ReportComparison, ScanOk, Violation } from '@shared/types';
import { api } from '../lib/api';
import { ruleName, type T } from '../lib/i18n';
import { basename, dirname, displayPath } from '../lib/layers';
import type { PushToast } from '../components/Toasts';
import { guideFor, ignoreComment, rulesDocUrl } from '../lib/guides';

type Filter = 'all' | 'new' | 'tolerated';
export type Category = 'all' | 'arch' | 'perf' | 'safety' | 'ui';
const ARCH_RULES = new Set([
  'dependency-direction',
  'direct-data-access',
  'forbidden-external',
  'circular-deps',
  'feature-boundaries',
]);
const PERF_RULES = new Set([
  'memory-leak',
  'render-bottleneck',
  'scrollview-map',
  'flatlist-performance',
]);
const SAFETY_RULES = new Set(['runtime-safety']);
const UI_RULES = new Set([
  'scrollview-map',
  'flatlist-performance',
  'component-size',
  'memory-leak',
  'render-bottleneck',
  'runtime-safety',
]);
interface Item { v: Violation; tolerated: boolean; key: string }

export function Findings({
  t,
  lang,
  data,
  root,
  toast,
  onDoctor,
  flowFilter,
  onFlowFilter,
  categoryFilter,
  onCategoryFilter,
}: {
  t: T;
  lang: Lang;
  data: ScanOk;
  root: string;
  toast: PushToast;
  onDoctor: () => void;
  flowFilter?: string | null;
  onFlowFilter?: (flow: string | null) => void;
  categoryFilter?: Category;
  onCategoryFilter?: (cat: Category) => void;
}) {
  const { result } = data;
  const [filter, setFilter] = useState<Filter>('all');
  const [localCategory, setLocalCategory] = useState<Category>('all');
  const category = categoryFilter ?? localCategory;
  const setCategory = onCategoryFilter ?? setLocalCategory;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ReportComparison | null>(null);
  const flowByFile = result.readiness?.flowByFile ?? {};
  const flows = result.readiness?.features ?? [];

  const items = useMemo<Item[]>(() => {
    const make = (list: Violation[] | undefined, tolerated: boolean) =>
      (list ?? []).map((v, i) => ({ v, tolerated, key: `${tolerated ? 't' : 'n'}:${v.rule}:${v.file}:${v.line ?? ''}:${i}` }));
    return [...make(result.violations, false), ...make(result.tolerated, true)];
  }, [result]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(({ v, tolerated }) => {
      const catOk =
        category === 'all' ||
        (category === 'arch' && ARCH_RULES.has(v.rule)) ||
        (category === 'perf' && PERF_RULES.has(v.rule)) ||
        (category === 'safety' && SAFETY_RULES.has(v.rule)) ||
        (category === 'ui' && UI_RULES.has(v.rule));
      const flowOk = !flowFilter || flowByFile[v.file] === flowFilter;
      return (
        catOk &&
        flowOk &&
        (filter === 'all' || (filter === 'new') !== tolerated) &&
        (!q || v.file.toLowerCase().includes(q) || v.message.toLowerCase().includes(q) || (v.detail ?? '').toLowerCase().includes(q))
      );
    });
  }, [items, filter, category, flowFilter, flowByFile, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of visible) map.set(item.v.rule, [...(map.get(item.v.rule) ?? []), item]);
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visible]);

  useEffect(() => {
    if (!visible.some((i) => i.key === selected)) setSelected(visible[0]?.key ?? null);
  }, [visible, selected]);

  // Navegación con flechas por la lista
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      const ordered = groups.flatMap(([, list]) => list);
      const index = ordered.findIndex((i) => i.key === selected);
      const next = ordered[Math.min(ordered.length - 1, Math.max(0, index + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) {
        setSelected(next.key);
        document.getElementById(`f-${next.key}`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groups, selected]);

  const compare = async () => {
    const res = await api.compare(root, lang);
    if (!res.ok) toast(t('engineError', res.message), 'err');
    else if (res.value) setComparison(res.value);
  };

  const issues = [...(result.analysis?.issues ?? []), ...(result.configWarnings ?? [])];
  const current = items.find((i) => i.key === selected);

  if (items.length === 0) {
    return (
      <div className="clean-state"><div>
        <h2>{t('cleanTitle')}</h2>
        <p>{t('cleanBody')}</p>
        {issues.length > 0 && <AnalysisNotes t={t} root={root} issues={issues} onDoctor={onDoctor} />}
      </div></div>
    );
  }

  return (
    <div className="findings">
      <div className="list-pane">
        <div className="toolbar">
          <div className="seg" role="group">
            {(['all', 'new', 'tolerated'] as Filter[]).map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? t('filterAll') : f === 'new' ? t('filterNew') : t('filterTolerated')}
              </button>
            ))}
          </div>
          <div className="seg" role="group">
            {(['all', 'arch', 'perf', 'safety', 'ui'] as Category[]).map((c) => (
              <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>
                {c === 'all'
                  ? t('categoryAll')
                  : c === 'arch'
                    ? t('categoryArch')
                    : c === 'perf'
                      ? t('categoryPerf')
                      : c === 'safety'
                        ? t('categorySafety')
                        : t('categoryUi')}
              </button>
            ))}
          </div>
          {flows.length > 0 && (
            <select
              className="flow-select"
              value={flowFilter ?? ''}
              onChange={(e) => onFlowFilter?.(e.target.value || null)}
            >
              <option value="">{t('allFlows')}</option>
              {flows.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.architectureViolations + f.uiWarnings})
                </option>
              ))}
            </select>
          )}
          <input className="search" placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn quiet" onClick={compare}>{t('compare')}</button>
        </div>
        {comparison && (
          <div className="banner">
            <span className="t">{t('compareTitle')}</span>
            <span className="add">{t('added', comparison.added.length)}</span>
            <span className="res">{t('resolved', comparison.resolved.length)}</span>
            <span>{t('persistent', comparison.persistent.length)}</span>
            <button className="btn quiet x" onClick={() => setComparison(null)}>{t('dismiss')}</button>
          </div>
        )}
        {issues.length > 0 && <AnalysisNotes t={t} root={root} issues={issues} onDoctor={onDoctor} />}
        <div className="list" role="listbox">
          {groups.length === 0 && <p className="placeholder" style={{ color: 'var(--muted)', padding: 16 }}>{t('noFindings')}</p>}
          {groups.map(([rule, list]) => (
            <div className="group" key={rule}>
              <h3><span>{ruleName(lang, rule)}</span><span>{list.length}</span></h3>
              {list.map((item) => (
                <button key={item.key} id={`f-${item.key}`} role="option" className="finding"
                  aria-selected={item.key === selected} onClick={() => setSelected(item.key)}>
                  <span className={`bar ${item.tolerated ? 'tolerated' : item.v.severity}`} />
                  <span style={{ minWidth: 0 }}>
                    <span className="file">{basename(item.v.file)}{item.v.line ? `:${item.v.line}` : ''} <span>{dirname(item.v.file)}</span></span>
                    <span className="msg">{item.v.message}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="detail">
        {current ? <Detail t={t} lang={lang} item={current} root={root} toast={toast} /> : <p className="placeholder">{t('selectFinding')}</p>}
      </div>
    </div>
  );
}

function Detail({ t, lang, item, root, toast }: { t: T; lang: Lang; item: Item; root: string; toast: PushToast }) {
  const { v, tolerated } = item;
  const guide = guideFor(lang, v);
  const copyIgnore = async () => {
    await navigator.clipboard.writeText(ignoreComment(lang, v));
    toast(t('copied', v.line ?? 1));
  };
  const chain = v.rule === 'circular-deps' && v.detail?.includes(' → ') ? v.detail.split(' → ') : null;
  return (
    <div className="selectable">
      <div className="tags">
        <span className="tag">{ruleName(lang, v.rule)}</span>
        <span className={`tag ${v.severity}`}>{v.severity === 'error' ? t('error') : t('warning')}</span>
        <span className={`tag ${tolerated ? '' : 'new'}`}>{tolerated ? t('isTolerated') : t('isNew')}</span>
      </div>
      <h2>{basename(v.file)}</h2>
      <p className="where mono">{v.file}{v.line ? ` · ${t('line', v.line)}` : ''}</p>
      <p className="msg">{v.message}</p>
      {chain ? (
        <>
          <p className="sub">{t('chain')}</p>
          <ol className="chain mono">{chain.map((step, i) => <li key={i}>{step}</li>)}</ol>
        </>
      ) : v.detail ? <p className="sub">{v.detail}</p> : null}
      <div className="actions">
        <button className="btn primary" onClick={() => api.openInEditor(root, v.file, v.line)}>{t('openInEditor')}</button>
        <button className="btn" onClick={() => api.revealInFinder(`${root}/${v.file}`)}>{t('reveal')}</button>
      </div>
      {guide && (
        <section className="guide">
          <h3>{t('howToFix')}</h3>
          {guide.hint && <p className="hint">{guide.hint}</p>}
          <ul>{guide.fixes.map((fix, i) => <li key={i}>{fix}</li>)}</ul>
          {(guide.badCode || guide.goodCode) && (
            <div className="code-diff">
              <h4>{t('codeExampleTitle')}</h4>
              {guide.badCode && (
                <div className="code-box bad">
                  <span className="code-label">{t('codeBadLabel')}</span>
                  <pre className="mono">{guide.badCode}</pre>
                </div>
              )}
              {guide.goodCode && (
                <div className="code-box good">
                  <span className="code-label">{t('codeGoodLabel')}</span>
                  <pre className="mono">{guide.goodCode}</pre>
                </div>
              )}
            </div>
          )}
          <h4>{t('whyMatters')}</h4>
          <p>{guide.why}</p>
          <pre className="mono">{ignoreComment(lang, v)}</pre>
          <div className="actions">
            <button className="btn" onClick={copyIgnore}>{t('copyIgnore')}</button>
            <a className="btn quiet" href={rulesDocUrl(lang, v.rule)} target="_blank" rel="noreferrer">{t('fullGuide')}</a>
          </div>
        </section>
      )}
    </div>
  );
}

function AnalysisNotes({ t, root, issues, onDoctor }: { t: T; root: string; issues: { message: string; file?: string; line?: number }[]; onDoctor?: () => void }) {
  return (
    <details className="notes">
      <summary>{t('analysisIssues')} ({issues.length})</summary>
      <ul className="selectable">
        {issues.slice(0, 30).map((issue, i) => (
          <li key={i}>{issue.file ? <code title={issue.file}>{displayPath(root, issue.file)}{issue.line ? `:${issue.line}` : ''}</code> : null} {issue.message}</li>
        ))}
      </ul>
      {onDoctor && <button className="btn quiet" style={{ marginTop: 6 }} onClick={onDoctor}>{t('seeDoctor')}</button>}
    </details>
  );
}
