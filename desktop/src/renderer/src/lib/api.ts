import type { AutopsiaApi } from '@shared/types';

declare global {
  interface Window {
    autopsia: AutopsiaApi;
  }
}

export const api = window.autopsia;
