/**
 * API programática sin efectos al importarse (a diferencia de index.ts, que
 * arranca la CLI). La consume la app de escritorio.
 */
export { scanProject } from './scan';
export type { ScanProjectOptions, ScanOutcome, ScanSuccess, ScanError, ScanErrorCode } from './scan';
export { diagnose } from './doctor';
export type { DoctorReport, DoctorIssue } from './doctor';
export { initProject, measureConfigCoverage } from './init';
export type { InitOptions, InitResult, InitCoverage, DetectedLayer } from './init';
export { saveBaseline, loadBaseline, baselinePath, BASELINE_FILE } from './baseline';
export { compareReports, loadReport } from './compare';
export { generateHtml, violationEdges } from './viewer';
export { analysisCoveragePercent } from './reporter';
export { startWatcher } from './watcher';
export { ALL_RULES } from './rules/run';
export { computeReadiness, computeFeatureHealth, inferFeatureOrFlow, ARCH_RULES, UI_QUALITY_RULES } from './readiness';
export { present, setLocale, getLocale, format } from './i18n';
export type { Locale } from './i18n';
export * from './types';
