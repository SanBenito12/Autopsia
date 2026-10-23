import type { T } from '../lib/i18n';

export function Welcome({ t, onPick, dragging }: { t: T; onPick: () => void; dragging: boolean }) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>{t('welcomeTitle')}</h1>
        <p>{t('welcomeBody')}</p>
        <div data-tour="dropzone" className={`dropzone ${dragging ? 'over' : ''}`}>
          <button className="btn primary" onClick={onPick}>{t('openProject')}</button>
          <div>
            {t('dropHere')}
            <small>{t('dropHint')}</small>
          </div>
        </div>
      </div>
    </div>
  );
}
