import { useEffect, useRef, useState } from 'react';
import type { Lang, ScanOk } from '@shared/types';
import { api } from '../lib/api';
import { relativeTime, type T } from '../lib/i18n';

interface Props {
  t: T;
  lang: Lang;
  root: string;
  data: ScanOk | null;
  loading: boolean;
  noConfig: boolean;
  watching: boolean;
  onRescan: () => void;
  onToggleWatch: () => void;
  onExport: (kind: 'html' | 'json') => void;
}

export function CaseHeader({ t, lang, root, data, loading, noConfig, watching, onRescan, onToggleWatch, onExport }: Props) {
  const [menu, setMenu] = useState(false);
  const name = root.split('/').pop() || root;
  const home = root.replace(/^\/Users\/[^/]+/, '~');

  return (
    <header className="case">
      <div className="case-top">
        <div className="case-title" data-tour="title">
          <h1 className="selectable">{name}</h1>
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
          <Verdict t={t} lang={lang} data={data} />
          {data.result.totalFiles > 0 && <LayerBars t={t} data={data} />}
        </div>
      )}
    </header>
  );
}

function Verdict({ t, lang, data }: { t: T; lang: Lang; data: ScanOk }) {
  const { result } = data;
  const fresh = result.violations.length;
  const tolerated = result.tolerated?.length ?? 0;
  const incomplete = result.analysis?.complete === false;
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
