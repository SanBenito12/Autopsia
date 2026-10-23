import { useCallback, useEffect, useState } from 'react';
import type { InitPreset, InitPreview, ScanOk } from '@shared/types';
import { api } from '../lib/api';
import type { T } from '../lib/i18n';
import type { PushToast } from '../components/Toasts';

interface Props {
  t: T;
  root: string;
  data: ScanOk | null;
  hasConfig: boolean;
  configPath?: string;
  onChanged: () => void;
  toast: PushToast;
}

export function Config({ t, root, data, hasConfig, configPath, onChanged, toast }: Props) {
  const [showInit, setShowInit] = useState(!hasConfig);
  useEffect(() => setShowInit(!hasConfig), [hasConfig]);

  return (
    <div className="page">
      <div className="page-inner">
        {hasConfig ? (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{t('configFile')}</h3>
            <p className="mono selectable" style={{ color: 'var(--ink-2)', margin: '4px 0 12px' }}>{configPath}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {configPath && <button className="btn" onClick={() => api.openInEditor(root, configPath)}>{t('openConfig')}</button>}
              <button className="btn quiet" onClick={() => setShowInit((s) => !s)}>{t('regenerate')}</button>
            </div>
            {showInit && <InitPanel t={t} root={root} overwrite onCreated={onChanged} toast={toast} />}
            {data && <Baseline t={t} root={root} data={data} onChanged={onChanged} toast={toast} />}
          </>
        ) : (
          <>
            <h2 className="page-title">{t('noConfigTitle')}</h2>
            <p className="lead" style={{ color: 'var(--ink-2)', maxWidth: '64ch' }}>{t('noConfigBody')}</p>
            <InitPanel t={t} root={root} overwrite={false} onCreated={onChanged} toast={toast} />
          </>
        )}
      </div>
    </div>
  );
}

function InitPanel({ t, root, overwrite, onCreated, toast }: { t: T; root: string; overwrite: boolean; onCreated: () => void; toast: PushToast }) {
  const [preset, setPreset] = useState<InitPreset>('auto');
  const [preview, setPreview] = useState<InitPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<{ preset: InitPreset; percent: number } | null>(null);
  const labels: Record<InitPreset, string> = { auto: t('presetAuto'), 'react-native': t('presetRN'), expo: t('presetExpo') };

  const load = useCallback(async () => {
    setPreview(null);
    const res = await api.initPreview(root, preset);
    if (res.ok) setPreview(res.value); else toast(t('engineError', res.message), 'err');
  }, [root, preset, t, toast]);
  useEffect(() => { load(); }, [load]);

  // Si otro punto de partida clasifica más archivos que "Detectar", se sugiere
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all((['auto', 'react-native', 'expo'] as InitPreset[]).map(async (p) => {
        const res = await api.initPreview(root, p);
        return res.ok && !res.value.example ? { preset: p, percent: res.value.coverage.percent } : null;
      }));
      if (cancelled) return;
      const valid = results.filter((r): r is { preset: InitPreset; percent: number } => r !== null);
      const auto = valid.find((r) => r.preset === 'auto')?.percent ?? 0;
      const best = valid.sort((a, b) => b.percent - a.percent)[0];
      setSuggestion(best && best.preset !== 'auto' && best.percent > auto + 1 ? best : null);
    })();
    return () => { cancelled = true; };
  }, [root]);

  const create = async () => {
    setBusy(true);
    const res = await api.initWrite(root, preset, overwrite);
    setBusy(false);
    if (!res.ok) { toast(t('engineError', res.message), 'err'); return; }
    toast(t('configCreated'));
    onCreated();
  };

  return (
    <div className="section">
      <h3>{t('preset')}</h3>
      <div className="seg" role="group" style={{ margin: '6px 0 4px' }}>
        {([['auto', t('presetAuto')], ['react-native', t('presetRN')], ['expo', t('presetExpo')]] as [InitPreset, string][]).map(([id, label]) => (
          <button key={id} aria-pressed={preset === id} onClick={() => setPreset(id)}>{label}</button>
        ))}
      </div>
      {suggestion && suggestion.preset !== preset && (
        <div className="confirm" style={{ margin: '10px 0' }}>
          <span>{t('betterPreset', labels[suggestion.preset], suggestion.percent)}</span>
          <button className="btn primary" onClick={() => setPreset(suggestion.preset)}>{t('usePreset', labels[suggestion.preset])}</button>
        </div>
      )}
      {!preview && <div className="loading" style={{ placeItems: 'start', padding: '16px 0' }}><div><div className="band" style={{ margin: '0 0 10px' }}><span /></div>{t('initLoading')}</div></div>}
      {preview && (
        <>
          <div className="meter"><span style={{ width: `${preview.coverage.percent}%` }} /></div>
          <p style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
            {t('previewCoverage', preview.coverage.percent, preview.coverage.classifiedFiles, preview.coverage.totalFiles)}
          </p>
          {preview.coverage.totalFiles === 0 ? (
            <p className="warnline">{t('initNoFiles')}</p>
          ) : (
            <>
              {preview.example && <p className="warnline">{t('exampleWarning')}</p>}
              <pre className="json mono selectable">{preview.json}</pre>
              <button className="btn primary" onClick={create} disabled={busy}>{overwrite ? t('overwriteConfig') : t('createConfig')}</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Baseline({ t, root, data, onChanged, toast }: { t: T; root: string; data: ScanOk; onChanged: () => void; toast: PushToast }) {
  const [confirming, setConfirming] = useState(false);
  const total = data.result.violations.length + (data.result.tolerated?.length ?? 0);

  const save = async () => {
    setConfirming(false);
    const res = await api.updateBaseline(root);
    if (!res.ok) { toast(t('engineError', res.message), 'err'); return; }
    toast(t('baselineSaved', res.value.count));
    onChanged();
  };

  return (
    <div className="section">
      <h3>{t('baselineTitle')}</h3>
      <p>{t('baselineBody')}</p>
      <p style={{ color: 'var(--ink)' }}>
        {data.hasBaseline ? t('baselineHas', data.result.tolerated?.length ?? 0) : t('baselineNone')}
      </p>
      {confirming ? (
        <div className="confirm">
          <span>{t('baselineConfirm', total)}</span>
          <button className="btn quiet" onClick={() => setConfirming(false)}>{t('cancel')}</button>
          <button className="btn primary" onClick={save}>{t('confirm')}</button>
        </div>
      ) : (
        <button className="btn" onClick={() => setConfirming(true)} disabled={total === 0}>{t('baselineAccept')}</button>
      )}
    </div>
  );
}
