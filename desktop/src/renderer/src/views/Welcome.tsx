import type { T } from '../lib/i18n';

export function Welcome({ t, onPick, dragging }: { t: T; onPick: () => void; dragging: boolean }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>{t('welcomeTitle')}</h1>
        <p>{t('welcomeBody')}</p>
        <div data-tour="dropzone" className={`dropzone ${dragging ? 'over' : ''}`}>
          <svg className="drop-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
            <path d="M12 11v5m-2.5-2.5L12 16l2.5-2.5" />
          </svg>
          <div className="drop-text">
            <strong>{t('dropHere')}</strong>
            <small>{t('dropHint')}</small>
          </div>
          <button className="btn primary" onClick={onPick}>{t('openProject')}</button>
        </div>
      </div>
    </div>
  );
}
