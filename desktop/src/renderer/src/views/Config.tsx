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
            <h2 style={{ font: '400 34px var(--serif)', marginBottom: 8 }}>{t('noConfigTitle')}</h2>
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

  const load = useCallback(async () => {
    const res = await api.initPreview(root, preset);
    if (res.ok) setPreview(res.value); else toast(t('engineError', res.message), 'err');
  }, [root, preset, t, toast]);
  useEffect(() => { load(); }, [load]);

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
      {preview && (
        <>
          <div className="meter"><span style={{ width: `${preview.coverage.percent}%` }} /></div>
          <p style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
            {t('previewCoverage', preview.coverage.percent, preview.coverage.classifiedFiles, preview.coverage.totalFiles)}
          </p>
          {preview.example && <p className="warnline">{t('exampleWarning')}</p>}
          <pre className="json mono selectable">{preview.json}</pre>
          <button className="btn primary" onClick={create} disabled={busy}>{overwrite ? t('overwriteConfig') : t('createConfig')}</button>
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
