import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang, RecentProject, ScanFail, ScanOk } from '@shared/types';
import { api } from './lib/api';
import { makeT } from './lib/i18n';
import { startTour, tourSeen } from './lib/tour';
import { Sidebar } from './components/Sidebar';
import { CaseHeader } from './components/CaseHeader';
import { Toasts, useToasts } from './components/Toasts';
import { Welcome } from './views/Welcome';
import { Findings } from './views/Findings';
import { Graph } from './views/Graph';
import { Doctor } from './views/Doctor';
import { Config } from './views/Config';

export type Tab = 'findings' | 'graph' | 'doctor' | 'config';
type ScanState =
  | { kind: 'idle' }
  | { kind: 'ok'; data: ScanOk }
  | { kind: 'fail'; error: ScanFail['error'] }
  | { kind: 'engine'; message: string };

const initialLang = (): Lang => {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'es' || saved === 'en') return saved;
  } catch {}
  return navigator.language.startsWith('es') ? 'es' : 'en';
};

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = makeT(lang);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [root, setRoot] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>({ kind: 'idle' });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('findings');
  const [watching, setWatching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const toasts = useToasts();
  const rootRef = useRef(root);
  rootRef.current = root;
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    api.recents().then(setRecents);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('lang', lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang]);

  const runScan = useCallback(async (target: string, language: Lang = lang) => {
    setLoading(true);
    const response = await api.scan(target, language);
    if (rootRef.current !== target) return;
    setLoading(false);
    if (!response.ok) {
      setScan({ kind: 'engine', message: response.message });
      return;
    }
    const value = response.value;
    if (value.ok) {
      setScan({ kind: 'ok', data: value });
      // Primera vez que se ve un resultado: ofrece el recorrido completo
      if (!tourSeen()) setTimeout(() => startTour(makeT(language), true), 700);
      const fresh = value.result.violations.length;
      setRecents(await api.rememberStatus(target, fresh > 0 ? 'issues' : 'clean', fresh));
    } else {
      setScan({ kind: 'fail', error: value.error });
      if (value.error.code === 'missing-config') setTab('config');
      setRecents(await api.rememberStatus(target, value.error.code === 'missing-config' ? 'no-config' : 'error'));
    }
  }, [lang]);

  const openProject = useCallback(async (target: string) => {
    rootRef.current = target;
    setRoot(target);
    setScan({ kind: 'idle' });
    setTab('findings');
    setWatching(false);
    await api.watch(null);
    await runScan(target);
  }, [runScan]);

  const pick = useCallback(async () => {
    const folder = await api.pickFolder();
    if (folder) openProject(folder);
  }, [openProject]);

  const toggleWatch = useCallback(async () => {
    if (!root) return;
    const next = !watching;
    await api.watch(next ? root : null);
    setWatching(next);
  }, [root, watching]);

  const exportReport = useCallback(async (kind: 'html' | 'json') => {
    if (!root) return;
    const res = kind === 'html' ? await api.exportHtml(root, lang) : await api.exportJson(root, lang);
    if (!res.ok) toasts.push(t('engineError', res.message), 'err');
    else if (res.value) {
      const file = res.value;
      toasts.push(t('saved', file.split('/').pop() ?? file), 'ok', { label: t('reveal'), run: () => api.revealInFinder(file) });
    }
  }, [root, lang, t, toasts]);

  useEffect(() => api.onOpenPath(openProject), [openProject]);
  useEffect(() => {
    api.takePendingOpen().then((target) => { if (target) openProject(target); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-escaneo automático en modo vigilancia
  useEffect(() => api.onWatchChange((file) => {
    const current = rootRef.current;
    if (!current) return;
    toasts.push(t('changed', file));
    runScan(current);
  }), [runScan, t, toasts]);

  // Menú nativo
  useEffect(() => api.onMenu((command) => {
    if (command === 'open') pick();
    else if (command === 'rescan' && rootRef.current) runScan(rootRef.current);
    else if (command === 'export') exportReport('html');
    else if (command === 'toggle-watch') toggleWatch();
    else if (command === 'tour') startTour(makeT(langRef.current), rootRef.current !== null);
    else if (command.startsWith('tab:')) setTab(command.slice(4) as Tab);
  }), [pick, runScan, exportReport, toggleWatch]);

  // Arrastrar una carpeta a la ventana
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => { e.preventDefault(); depth++; setDragging(true); };
    const leave = () => { depth = Math.max(0, depth - 1); if (depth === 0) setDragging(false); };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) openProject(api.pathForFile(file));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [openProject]);

  const changeLang = (next: Lang) => {
    setLang(next);
    if (root) runScan(root, next);
  };

  const forget = async (target: string) => {
    setRecents(await api.forgetRecent(target));
    if (target === root) { setRoot(null); setScan({ kind: 'idle' }); }
  };

  const data = scan.kind === 'ok' ? scan.data : null;

  return (
    <div className="shell">
      <Sidebar
        t={t} lang={lang} recents={recents} current={root}
        onOpen={openProject} onPick={pick} onForget={forget} onLang={changeLang}
        onTour={() => startTour(t, root !== null)}
      />
      <main className="main">
        <div className="titlebar drag" />
        {!root ? (
          <Welcome t={t} onPick={pick} dragging={dragging} />
        ) : (
          <>
            <CaseHeader
              t={t} lang={lang} root={root} data={data} loading={loading}
              noConfig={scan.kind === 'fail' && scan.error.code === 'missing-config'}
              watching={watching} onRescan={() => runScan(root)} onToggleWatch={toggleWatch} onExport={exportReport}
            />
            <nav className="tabs" role="tablist">
              {([
                ['findings', t('tabFindings'), data?.result.violations.length],
                ['graph', t('tabGraph'), undefined],
                ['doctor', t('tabDoctor'), undefined],
                ['config', t('tabConfig'), undefined],
              ] as [Tab, string, number | undefined][]).map(([id, label, count]) => (
                <button key={id} data-tour={`tab-${id}`} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}
                  {count !== undefined && count > 0 && <span className="badge bad">{count}</span>}
                </button>
              ))}
            </nav>
            <section className="view">
              {tab === 'config' || tab === 'doctor' ? (
                tab === 'config' ? (
                  <Config t={t} root={root} data={data} hasConfig={!(scan.kind === 'fail' && scan.error.code === 'missing-config')}
                    configPath={data?.configPath ?? (scan.kind === 'fail' ? scan.error.configPath : undefined)}
                    onChanged={() => runScan(root)} toast={toasts.push} />
                ) : (
                  <Doctor t={t} lang={lang} root={root} />
                )
              ) : scan.kind === 'idle' || (loading && !data) ? (
                <div className="loading"><div><div className="band"><span /></div>{t('scanning')}</div></div>
              ) : scan.kind === 'engine' ? (
                <div className="error-state"><div>
                  <h2>{t('scanFailed')}</h2><p className="selectable">{t('engineError', scan.message)}</p>
                  <button className="btn" onClick={() => runScan(root)}>{t('tryAgain')}</button>
                </div></div>
              ) : scan.kind === 'fail' ? (
                <div className="error-state"><div>
                  <h2>{t('scanFailed')}</h2>
                  <p className="selectable">{scan.error.message}</p>
                  {scan.error.issues?.map((issue, i) => <p key={i} className="selectable">{issue.message}</p>)}
                  <button className="btn" onClick={() => setTab('config')}>{t('tabConfig')}</button>
                </div></div>
              ) : tab === 'findings' ? (
                <Findings t={t} lang={lang} data={scan.data} root={root} toast={toasts.push} />
              ) : (
                <Graph t={t} data={scan.data} root={root} />
              )}
            </section>
          </>
        )}
        {dragging && root && <div className="drop-overlay">{t('dropHere')}</div>}
        <Toasts items={toasts.items} onDismiss={toasts.dismiss} />
      </main>
    </div>
  );
}
