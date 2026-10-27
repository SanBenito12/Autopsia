import { useCallback, useEffect, useState } from 'react';
import type { DoctorView, FeatureHealth, Lang, ReadinessPhase, RemediationStep, RemediationStepId, ScanOk } from '@shared/types';
import { api } from '../lib/api';
import type { Key, T } from '../lib/i18n';
import { displayPath } from '../lib/layers';
import { buildStepAiPrompt } from '../lib/guides';
import type { PushToast } from '../components/Toasts';
import type { Category } from './Findings';

const PHASE_LABELS: Record<ReadinessPhase['id'], { title: Key; desc: Key }> = {
  foundation: { title: 'phaseFoundationTitle', desc: 'phaseFoundationDesc' },
  architecture: { title: 'phaseArchitectureTitle', desc: 'phaseArchitectureDesc' },
  flows: { title: 'phaseFlowsTitle', desc: 'phaseFlowsDesc' },
  production: { title: 'phaseProductionTitle', desc: 'phaseProductionDesc' },
};

const REMEDIATION_LABELS: Record<RemediationStepId, { title: Key; desc: Key; category: Category }> = {
  'runtime-safety': { title: 'remediationStepRuntimeSafety', desc: 'remediationStepRuntimeSafetyDesc', category: 'safety' },
  'memory-leak': { title: 'remediationStepMemoryLeak', desc: 'remediationStepMemoryLeakDesc', category: 'perf' },
  architecture: { title: 'remediationStepArchitecture', desc: 'remediationStepArchitectureDesc', category: 'arch' },
  'render-bottleneck': { title: 'remediationStepRenderBottleneck', desc: 'remediationStepRenderBottleneckDesc', category: 'perf' },
  'ui-lists-size': { title: 'remediationStepUiListsSize', desc: 'remediationStepUiListsSizeDesc', category: 'ui' },
};

export function Doctor({
  t,
  lang,
  root,
  data,
  toast,
  onSelectFlow,
  onSelectCategory,
}: {
  t: T;
  lang: Lang;
  root: string;
  data?: ScanOk | null;
  toast?: PushToast;
  onSelectFlow?: (flow: string) => void;
  onSelectCategory?: (category: Category) => void;
}) {
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
  const readiness = data?.result.readiness;
  const warnings = report.warnings ?? [];

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

        {readiness && (
          <section className="section">
            <h3>{t('readinessSectionTitle')}</h3>
            <p>{t('readinessSectionBody')}</p>
            <div className="phase-grid">
              {readiness.phases.map((phase) => {
                const statusLabel =
                  phase.status === 'pass'
                    ? t('phaseStatusPass')
                    : phase.status === 'warn'
                      ? t('phaseStatusWarn', phase.issuesCount)
                      : t('phaseStatusFail', phase.issuesCount);
                return (
                  <div key={phase.id} className={`phase-card ${phase.status}`}>
                    <div className="phase-card-head">
                      <span className="dot-ind" />
                      <strong>{t(PHASE_LABELS[phase.id].title)}</strong>
                      <span className={`tag ${phase.status === 'pass' ? 'ok' : phase.status === 'warn' ? 'warning' : 'error'}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <p>{t(PHASE_LABELS[phase.id].desc)}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {readiness && (readiness.remediationPlan?.length ?? 0) > 0 && (
          <section className="section">
            <h3>{t('remediationSectionTitle')}</h3>
            <p>{t('remediationSectionBody')}</p>
            <div className="feature-list">
              {readiness.remediationPlan!.map((step: RemediationStep) => {
                const meta = REMEDIATION_LABELS[step.id];
                const badgeClass = step.priority === 'critical' ? 'error' : step.priority === 'high' ? 'warning' : 'ok';
                const ruleSet = new Set(step.rules);
                const allViolations = [...(data?.result.violations ?? []), ...(data?.result.tolerated ?? [])];
                const stepViolations = allViolations.filter((v) => ruleSet.has(v.rule));
                return (
                  <div
                    key={step.id}
                    role="button"
                    tabIndex={0}
                    className="feature-row clickable"
                    onClick={() => onSelectCategory?.(meta.category)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectCategory?.(meta.category); }}
                  >
                    <div className="feature-main" style={{ gridColumn: '1 / 3' }}>
                      <span className="feature-name">{t(meta.title)}</span>
                      <span className="feature-meta">{t(meta.desc)}</span>
                      {step.affectedFlows.length > 0 && (
                        <span className="feature-meta" style={{ marginTop: 2 }}>
                          Flujos: {step.affectedFlows.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="feature-status" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="btn quiet"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await navigator.clipboard.writeText(buildStepAiPrompt(lang, root, t(meta.title), stepViolations));
                          toast?.(t('copiedAiPrompt'), 'ok');
                        }}
                      >
                        {t('copyStepAiPrompt', step.count)}
                      </button>
                      <span className={`tag ${badgeClass}`}>
                        {t('remediationMeta', step.count, step.filesCount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {readiness && readiness.features.length > 0 && (
          <section className="section">
            <h3>{t('featuresSectionTitle')}</h3>
            <p>{t('featuresSectionBody')}</p>
            <div className="feature-list">
              {readiness.features.map((feat: FeatureHealth) => {
                const badge =
                  feat.status === 'healthy'
                    ? t('featureHealthy')
                    : feat.status === 'warning'
                      ? t('featureWarning', feat.uiWarnings)
                      : t('featureCritical', feat.architectureViolations);
                return (
                  <button
                    key={feat.name}
                    type="button"
                    className="feature-row clickable"
                    title={t('viewFlowFindings', feat.name)}
                    onClick={() => onSelectFlow?.(feat.name)}
                  >
                    <div className="feature-main">
                      <span className="feature-name">{feat.name}</span>
                      <span className="feature-meta">
                        {t('files', feat.files)}
                        {feat.layers.length > 0 ? ` · ${feat.layers.join(', ')}` : ''}
                      </span>
                    </div>
                    <div className="feature-bar">
                      <span className="bar-track">
                        <span className="bar-ok" />
                        {feat.healthPercent < 100 && (
                          <span className="bar-bad" style={{ width: `${100 - feat.healthPercent}%` }} />
                        )}
                      </span>
                    </div>
                    <div className="feature-status">
                      <span className={`tag ${feat.status === 'healthy' ? 'ok' : feat.status === 'warning' ? 'warning' : 'error'}`}>
                        {badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {warnings.length > 0 && (
          <section className="section">
            <h3>{t('configWarningsTitle', warnings.length)}</h3>
            <p>{t('configWarningsBody')}</p>
            {warnings.map((w, i) => (
              <div className="issue selectable" key={`w-${i}`}>
                <span className="code">{w.code}</span>
                <div>
                  <div>{w.message}</div>
                  <div className="fix">{w.recommendation}</div>
                </div>
              </div>
            ))}
          </section>
        )}

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
