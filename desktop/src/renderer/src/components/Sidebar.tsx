import { useState } from 'react';
import type { Lang, RecentProject } from '@shared/types';
import type { T } from '../lib/i18n';
import { EditableName } from './EditableName';

interface Props {
  t: T;
  lang: Lang;
  recents: RecentProject[];
  current: string | null;
  onOpen: (root: string) => void;
  onPick: () => void;
  onForget: (root: string) => void;
  onRename: (root: string, name: string) => void;
  onLang: (lang: Lang) => void;
  onTour: () => void;
}

export function Sidebar({ t, lang, recents, current, onOpen, onPick, onForget, onRename, onLang, onTour }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <aside className="sidebar drag">
      <h2>{t('projects')}</h2>
      <div className="recents no-drag" data-tour="projects">
        {recents.length === 0 && <p className="empty">{t('noRecents')}</p>}
        {recents.map((p) => (
          <div
            key={p.root} role="button" tabIndex={0} className="recent" title={`${p.root}\n${t('renameHint')}`}
            aria-current={p.root === current} onClick={() => { if (p.root !== current) onOpen(p.root); }}
            onDoubleClick={() => setEditing(p.root)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen(p.root);
              else if (e.key === 'F2') setEditing(p.root);
            }}
          >
            <span className={`dot ${p.status}`} />
            <EditableName className="name" value={p.name} label={t('rename')} editing={editing === p.root}
              onSave={(name) => onRename(p.root, name)} onDone={() => setEditing(null)} />
            <span className="count">
              {p.status === 'issues' && p.newCount ? p.newCount : null}
              <button className="rename-btn" aria-label={t('rename')} title={t('rename')}
                onClick={(e) => { e.stopPropagation(); setEditing(p.root); }}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z" /></svg>
              </button>
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
