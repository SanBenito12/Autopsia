import { useEffect, useMemo, useState } from 'react';
import type { Lang, ReportComparison, ScanOk, Violation } from '@shared/types';
import { api } from '../lib/api';
import { ruleName, type T } from '../lib/i18n';
import { basename, dirname } from '../lib/layers';
import type { PushToast } from '../components/Toasts';

type Filter = 'all' | 'new' | 'tolerated';
interface Item { v: Violation; tolerated: boolean; key: string }

export function Findings({ t, lang, data, root, toast }: { t: T; lang: Lang; data: ScanOk; root: string; toast: PushToast }) {
  const { result } = data;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ReportComparison | null>(null);

  const items = useMemo<Item[]>(() => {
    const make = (list: Violation[] | undefined, tolerated: boolean) =>
      (list ?? []).map((v, i) => ({ v, tolerated, key: `${tolerated ? 't' : 'n'}:${v.rule}:${v.file}:${v.line ?? ''}:${i}` }));
    return [...make(result.violations, false), ...make(result.tolerated, true)];
  }, [result]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(({ v, tolerated }) =>
      (filter === 'all' || (filter === 'new') !== tolerated) &&
      (!q || v.file.toLowerCase().includes(q) || v.message.toLowerCase().includes(q) || (v.detail ?? '').toLowerCase().includes(q)));
  }, [items, filter, query]);

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

  const issues = result.analysis?.issues ?? [];
  const current = items.find((i) => i.key === selected);

  if (items.length === 0) {
    return (
      <div className="clean-state"><div>
        <h2>{t('cleanTitle')}</h2>
        <p>{t('cleanBody')}</p>
        {issues.length > 0 && <AnalysisNotes t={t} issues={issues} />}
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
        {issues.length > 0 && <AnalysisNotes t={t} issues={issues} />}
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
        {current ? <Detail t={t} lang={lang} item={current} root={root} /> : <p className="placeholder">{t('selectFinding')}</p>}
      </div>
    </div>
  );
}

function Detail({ t, lang, item, root }: { t: T; lang: Lang; item: Item; root: string }) {
  const { v, tolerated } = item;
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
    </div>
  );
}

function AnalysisNotes({ t, issues }: { t: T; issues: { message: string; file?: string; line?: number }[] }) {
  return (
    <details className="notes">
      <summary>{t('analysisIssues')} ({issues.length})</summary>
      <ul className="selectable">
        {issues.slice(0, 30).map((issue, i) => (
          <li key={i}>{issue.file ? <code>{issue.file}{issue.line ? `:${issue.line}` : ''}</code> : null} {issue.message}</li>
        ))}
      </ul>
    </details>
  );
}
