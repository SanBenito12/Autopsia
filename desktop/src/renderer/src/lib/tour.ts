import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { T } from './i18n';

const SEEN_KEY = 'tour-seen-v1';

export function tourSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
function markSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
}

/**
 * Tour guiado. Con un proyecto abierto recorre la pantalla del caso; sin
 * proyecto, explica cómo empezar. Los pasos cuyo elemento no existe se omiten.
 */
export function startTour(t: T, hasProject: boolean): void {
  const step = (selector: string, title: string, description: string, side: 'top' | 'bottom' | 'left' | 'right' = 'bottom'): DriveStep =>
    ({ element: selector, popover: { title, description, side, align: 'start' } });

  const candidates: DriveStep[] = hasProject
    ? [
        step('[data-tour="title"]', t('tourCaseTitle'), t('tourCaseBody')),
        step('[data-tour="verdict"]', t('tourVerdictTitle'), t('tourVerdictBody')),
        step('[data-tour="tissue"]', t('tourTissueTitle'), t('tourTissueBody')),
        step('[data-tour="tab-findings"]', t('tourFindingsTitle'), t('tourFindingsBody')),
        step('[data-tour="tab-graph"]', t('tourGraphTitle'), t('tourGraphBody')),
        step('[data-tour="tab-doctor"]', t('tourDoctorTitle'), t('tourDoctorBody')),
        step('[data-tour="tab-config"]', t('tourConfigTitle'), t('tourConfigBody')),
        step('[data-tour="watch"]', t('tourWatchTitle'), t('tourWatchBody'), 'left'),
        step('[data-tour="export"]', t('tourExportTitle'), t('tourExportBody'), 'left'),
        step('[data-tour="projects"]', t('tourProjectsTitle'), t('tourProjectsBody'), 'right'),
      ]
    : [
        step('[data-tour="dropzone"]', t('tourStartTitle'), t('tourStartBody')),
        step('[data-tour="projects"]', t('tourProjectsTitle'), t('tourProjectsBody'), 'right'),
        step('[data-tour="lang"]', t('tourLangTitle'), t('tourLangBody'), 'right'),
      ];
  const steps = candidates.filter((s) => document.querySelector(s.element as string));
  if (!steps.length) return;

  const tour = driver({
    steps,
    showProgress: true,
    progressText: t('tourProgress'),
    nextBtnText: t('tourNext'),
    prevBtnText: t('tourPrev'),
    doneBtnText: t('tourDone'),
    popoverClass: 'autopsia-tour',
    stagePadding: 6,
    stageRadius: 10,
    overlayOpacity: 0.55,
    smoothScroll: true,
    onDestroyed: markSeen,
  });
  tour.drive();
}
