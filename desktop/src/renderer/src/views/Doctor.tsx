import { useCallback, useEffect, useState } from 'react';
import type { DoctorView, Lang } from '@shared/types';
import { api } from '../lib/api';
import type { T } from '../lib/i18n';
import { displayPath } from '../lib/layers';

export function Doctor({ t, lang, root }: { t: T; lang: Lang; root: string }) {
  const [report, setReport] = useState<DoctorView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    const res = await api.doctor(root, lang);
    setRunning(false);
    if (res.ok) { setReport(res.value); setError(null); } else setError(res.message);
  }, [root, lang]);

  useEffect(() => { run(); }, [run]);

  if (!report) {
    return error
      ? <div className="error-state"><div><h2>{t('scanFailed')}</h2><p>{error}</p><button className="btn" onClick={run}>{t('tryAgain')}</button></div></div>
      : <div className="loading"><div><div className="band"><span /></div>{t('doctorRunning')}</div></div>;
  }

  const title = report.status === 'ready' ? t('doctorReady') : report.status === 'error' ? t('doctorError') : t('doctorIncomplete');
  return (
    <div className="page">
      <div className="page-inner">
        <div className="status-line">
          <h2 className={report.status}>{title}</h2>
          <button className="btn quiet" onClick={run} disabled={running}>{running ? t('doctorRunning') : t('doctorRun')}</button>
        </div>
        <p className="lead">
          {report.status === 'ready' ? t('doctorReadyBody') : t('doctorIssues', report.issues.length)}
        </p>
        {report.classifiedFiles !== null && report.totalFiles > 0 && (
          <>
            <div className="meter"><span style={{ width: `${(report.classifiedFiles / report.totalFiles) * 100}%` }} /></div>
            <p style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{t('classified', report.classifiedFiles, report.totalFiles)}</p>
          </>
        )}
        <dl className="kv selectable">
          <dt>autopsia.config.json</dt><dd className="mono" title={report.configPath}>{displayPath(root, report.configPath)}</dd>
          <dt>tsconfig</dt><dd className="mono" title={report.tsconfigPath}>{displayPath(root, report.tsconfigPath)}</dd>
          <dt>TypeScript</dt><dd>{report.typescriptVersion}</dd>
          <dt>{t('detectedLayers')}</dt>
          <dd>{report.detected.length ? report.detected.map((d) => `${d.name} (${d.folders.join(', ')})`).join(' · ') : '—'}</dd>
        </dl>
        {report.issues.map((issue, i) => (
          <div className="issue selectable" key={i}>
            <span className="code">{issue.code}</span>
            <div>
              {issue.file && (
                <button className="loc mono" title={issue.file} onClick={() => api.openInEditor(root, issue.file!, issue.line)}>
                  {displayPath(root, issue.file)}{issue.line ? `:${issue.line}` : ''}
                </button>
              )}
              <div>{issue.message}</div>
              {issue.detail && <div className="fix mono">{issue.detail}</div>}
              <div className="fix">{issue.recommendation}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
