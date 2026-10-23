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
      {data && <Verdict t={t} lang={lang} data={data} />}
      {data && <Tissue t={t} data={data} />}
    </header>
  );
}

function Verdict({ t, lang, data }: { t: T; lang: Lang; data: ScanOk }) {
  const { result } = data;
  const fresh = result.violations.length;
  const tolerated = result.tolerated?.length ?? 0;
  return (
    <div className="verdict" data-tour="verdict">
      <strong className={fresh ? 'issues' : 'clean'}>
        {fresh === 0 ? t('verdictClean') : fresh === 1 ? t('verdictOne') : t('verdictIssues', fresh)}
      </strong>
      <span className="facts">
        {tolerated > 0 && <span>{t('tolerated', tolerated)}</span>}
        {result.suppressedCount ? <span>{t('suppressed', result.suppressedCount)}</span> : null}
        <span className={result.analysis?.complete === false ? 'warn' : ''}>
          {t('coverage', data.coveragePercent)}{result.analysis?.complete === false ? ` · ${t('incomplete')}` : ''}
        </span>
        <span>{t('scannedAt', relativeTime(result.scannedAt, lang), result.totalFiles, data.durationMs)}</span>
      </span>
    </div>
  );
}

/**
 * Banda de tejido: un segmento por capa, ancho proporcional a sus archivos,
 * teñido de hematoxilina (sano) a eosina (lesionado) según su salud.
 */
function Tissue({ t, data }: { t: T; data: ScanOk }) {
  const { filesByLayer, healthByLayer, scannedAt } = data.result;
  const layers = Object.entries(filesByLayer);
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const [reveal, setReveal] = useState(true);

  // La tinción se anima solo cuando llega un escaneo nuevo
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setReveal(false);
    const id = requestAnimationFrame(() => setReveal(true));
    return () => cancelAnimationFrame(id);
  }, [scannedAt]);

  if (layers.length === 0) return null;
  return (
    <div data-tour="tissue" className={`tissue ${reveal ? 'reveal' : ''}`} ref={ref} aria-label={t('layerHealth')}>
      <div className="tissue-band">
        {layers.map(([layer, files], i) => {
          const health = healthByLayer[layer] ?? 100;
          const stain = files === 0
            ? 'var(--layer-none)'
            : `color-mix(in oklab, var(--hematoxylin) ${health}%, var(--eosin))`;
          return (
            <div key={layer} className="tissue-seg"
              style={{ flex: Math.max(files, 1), ['--stain' as string]: stain, ['--i' as string]: i }}
              title={`${layer}: ${files === 0 ? 'N/A' : health + '%'} · ${t('files', files)}`} />
          );
        })}
      </div>
      <div className="tissue-legend">
        {layers.map(([layer, files]) => {
          const health = healthByLayer[layer] ?? 100;
          return (
            <div key={layer} style={{ flex: Math.max(files, 1) }}>
              <div className="ln">{layer}</div>
              <div className={`lv ${files > 0 && health < 100 ? 'bad' : ''}`}>{files === 0 ? 'N/A' : `${health}%`}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
