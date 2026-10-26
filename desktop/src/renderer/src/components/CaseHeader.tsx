import { useEffect, useRef, useState } from 'react';
import type { CleanArchVerdict, Lang, ReadinessPhase, ScanOk } from '@shared/types';
import { api } from '../lib/api';
import { relativeTime, type Key, type T } from '../lib/i18n';
import { EditableName } from './EditableName';

interface Props {
  t: T;
  lang: Lang;
  root: string;
  name: string;
  data: ScanOk | null;
  loading: boolean;
  noConfig: boolean;
  watching: boolean;
  onRescan: () => void;
  onToggleWatch: () => void;
  onExport: (kind: 'html' | 'json') => void;
  onRename: (name: string) => void;
  onSelectTab?: (tab: 'findings' | 'doctor') => void;
}

export function CaseHeader({ t, lang, root, name, data, loading, noConfig, watching, onRescan, onToggleWatch, onExport, onRename, onSelectTab }: Props) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const home = root.replace(/^\/Users\/[^/]+/, '~');

  return (
    <header className="case">
      <div className="case-top">
        <div className="case-title" data-tour="title">
          <h1 className="no-drag" title={t('renameHint')} onDoubleClick={() => setEditing(true)}>
            <EditableName value={name} label={t('rename')} editing={editing} onSave={onRename} onDone={() => setEditing(false)} />
            {!editing && (
              <button className="rename-btn" aria-label={t('rename')} title={t('rename')} onClick={() => setEditing(true)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z" /></svg>
              </button>
            )}
          </h1>
          <button className="path no-drag" onClick={() => api.revealInFinder(root)} title={t('reveal')}>{home}</button>
        </div>
        <div className="case-actions no-drag">
          <button data-tour="watch" className={`btn ${watching ? 'on' : ''}`} onClick={onToggleWatch} disabled={noConfig} aria-pressed={watching}>
            {watching && <span className="pulse" />}
            {watching ? t('watching') : t('watch')}
          </button>
          <button className="btn" onClick={onRescan} disabled={loading}>{t('rescan')}</button>
          <div className="menu-wrap" data-tour="export">
            <button className="btn" onClick={() => setMenu((m) => !m)} disabled={!data} aria-expanded={menu}>{t('export')}</button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => { setMenu(false); onExport('html'); }}>{t('exportHtml')}</button>
                <button onClick={() => { setMenu(false); onExport('json'); }}>{t('exportJson')}</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {data && (
        <div className="summary">
          <Verdict t={t} lang={lang} data={data} onSelectTab={onSelectTab} />
          {data.result.totalFiles > 0 && <LayerBars t={t} data={data} />}
        </div>
      )}
    </header>
  );
}

const VERDICT_KEYS: Record<CleanArchVerdict, Key> = {
  verified: 'verdictBadgeVerified',
  partial: 'verdictBadgePartial',
  failing: 'verdictBadgeFailing',
  unverified: 'verdictBadgeUnverified',
};

const PHASE_KEYS: Record<ReadinessPhase['id'], { short: Key; desc: Key }> = {
  foundation: { short: 'phaseFoundation', desc: 'phaseFoundationDesc' },
  architecture: { short: 'phaseArchitecture', desc: 'phaseArchitectureDesc' },
  flows: { short: 'phaseFlows', desc: 'phaseFlowsDesc' },
  production: { short: 'phaseProduction', desc: 'phaseProductionDesc' },
};

function Verdict({ t, lang, data, onSelectTab }: { t: T; lang: Lang; data: ScanOk; onSelectTab?: (tab: 'findings' | 'doctor') => void }) {
  const { result } = data;
  const fresh = result.violations.length;
  const tolerated = result.tolerated?.length ?? 0;
  const incomplete = result.analysis?.complete === false;
  const readiness = result.readiness;
  if (result.totalFiles === 0) {
    return (
      <div className="verdict" data-tour="verdict">
        <p className="verdict-empty">{t('emptyVerdict')}</p>
      </div>
    );
  }
  return (
    <div className="verdict" data-tour="verdict">
      <div className="stat-main">
        <span className={`stat-num ${fresh ? 'issues' : 'clean'}`}>{fresh}</span>
        <span className="stat-label">{fresh === 1 ? t('statNewOne') : t('statNew')}</span>
      </div>
      {readiness && (
        <div className="readiness-strip">
          <button
            className={`arch-pill ${readiness.cleanArchVerdict}`}
            onClick={() => onSelectTab?.('doctor')}
          >
            <span className="dot-ind" />
            {t(VERDICT_KEYS[readiness.cleanArchVerdict])}
          </button>
          <div className="phase-pills">
            {readiness.phases.map((p) => (
              <button
                key={p.id}
                className={`phase-pill ${p.status}`}
                title={t(PHASE_KEYS[p.id].desc)}
                onClick={() => onSelectTab?.(p.id === 'architecture' || p.id === 'flows' ? 'findings' : 'doctor')}
              >
                <span className="dot-ind" />
                <span>{t(PHASE_KEYS[p.id].short)}</span>
                {p.issuesCount > 0 && <span className="p-count">{p.issuesCount}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <dl className="stats">
        <div className={incomplete ? 'warn' : ''} title={incomplete ? t('incomplete') : undefined}>
          <dt>{t('statCoverage')}</dt><dd>{data.coveragePercent}%</dd>
        </div>
        <div><dt>{t('statFiles')}</dt><dd>{result.totalFiles}</dd></div>
      </dl>
      <p className="facts">
        {incomplete && <span className="warn">{t('incomplete')}</span>}
        {tolerated > 0 && <span>{t('tolerated', tolerated)}</span>}
        {result.suppressedCount ? <span>{t('suppressed', result.suppressedCount)}</span> : null}
        <span title={t('duration', data.durationMs)}>{t('scannedAt', relativeTime(result.scannedAt, lang))}</span>
      </p>
    </div>
  );
}

/** Archivos con alguna violación (nueva o tolerada) por capa, igual que computeHealth. */
function lesionsByLayer(data: ScanOk): Record<string, number> {
  const { violations, tolerated = [], graph } = data.result;
  const hurt = new Set([...violations, ...tolerated].map((v) => v.file));
  const counts: Record<string, number> = {};
  for (const node of graph) if (node.layer && hurt.has(node.path)) counts[node.layer] = (counts[node.layer] ?? 0) + 1;
  return counts;
}

/** Una barra por capa: violeta lo sano, rosa la fracción real de archivos con violaciones. */
function LayerBars({ t, data }: { t: T; data: ScanOk }) {
  const { filesByLayer, scannedAt } = data.result;
  const layers = Object.entries(filesByLayer);
  const lesions = lesionsByLayer(data);
  const first = useRef(true);
  const [reveal, setReveal] = useState(true);

  // Las barras crecen solo cuando llega un escaneo nuevo
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setReveal(false);
    const id = requestAnimationFrame(() => setReveal(true));
    return () => cancelAnimationFrame(id);
  }, [scannedAt]);

  if (layers.length === 0) return null;
  return (
    <ul data-tour="tissue" className={`layer-bars ${reveal ? 'reveal' : ''}`} aria-label={t('layerHealth')}>
      {layers.map(([layer, files], i) => {
        const hurt = lesions[layer] ?? 0;
        return (
          <li key={layer} style={{ ['--i' as string]: i }}>
            <span className="ln">{layer}</span>
            <span className={`bar-track ${files === 0 ? 'empty' : ''}`}>
              {files > 0 && <span className="bar-ok" />}
              {hurt > 0 && <span className="bar-bad" style={{ width: `${(hurt / files) * 100}%` }} />}
            </span>
            <span className={`lv ${hurt > 0 ? 'bad' : ''}`}>
              {files === 0 ? t('layerEmpty') : hurt > 0 ? t('layerHurt', hurt, files) : t('files', files)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
