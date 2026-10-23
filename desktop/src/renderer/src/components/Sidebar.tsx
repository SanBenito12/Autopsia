import type { Lang, RecentProject } from '@shared/types';
import type { T } from '../lib/i18n';

interface Props {
  t: T;
  lang: Lang;
  recents: RecentProject[];
  current: string | null;
  onOpen: (root: string) => void;
  onPick: () => void;
  onForget: (root: string) => void;
  onLang: (lang: Lang) => void;
  onTour: () => void;
}

export function Sidebar({ t, lang, recents, current, onOpen, onPick, onForget, onLang, onTour }: Props) {
  return (
    <aside className="sidebar drag">
      <h2>{t('projects')}</h2>
      <div className="recents no-drag" data-tour="projects">
        {recents.length === 0 && <p className="empty">{t('noRecents')}</p>}
        {recents.map((p) => (
          <div
            key={p.root} role="button" tabIndex={0} className="recent" title={p.root}
            aria-current={p.root === current} onClick={() => onOpen(p.root)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.root); }}
          >
            <span className={`dot ${p.status}`} />
            <span className="name">{p.name}</span>
            <span className="count">
              {p.status === 'issues' && p.newCount ? p.newCount : null}
              <button className="forget" aria-label={t('forget')} title={t('forget')}
                onClick={(e) => { e.stopPropagation(); onForget(p.root); }}>×</button>
            </span>
          </div>
        ))}
      </div>
      <div className="sidebar-foot no-drag">
        <button className="btn quiet" onClick={onPick}>＋ {t('openProject')}</button>
        <button className="btn quiet" onClick={onTour}>? {t('tour')}</button>
        <div className="lang" data-tour="lang" role="group" aria-label={t('language')}>
          {(['es', 'en'] as Lang[]).map((l) => (
            <button key={l} aria-pressed={lang === l} onClick={() => onLang(l)}>{l === 'es' ? 'Español' : 'English'}</button>
          ))}
        </div>
      </div>
    </aside>
  );
}
