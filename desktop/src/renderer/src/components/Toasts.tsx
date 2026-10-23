import { useCallback, useMemo, useState } from 'react';

export type ToastKind = 'ok' | 'err';
export interface ToastAction { label: string; run: () => void }
interface Toast { id: number; text: string; kind: ToastKind; action?: ToastAction }
export type PushToast = (text: string, kind?: ToastKind, action?: ToastAction) => void;

let nextId = 1;

export function useToasts() {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((x) => x.id !== id)), []);
  const push = useCallback<PushToast>((text, kind = 'ok', action) => {
    const id = nextId++;
    setItems((list) => [...list.slice(-2), { id, text, kind, action }]);
    setTimeout(() => dismiss(id), action ? 6000 : 3200);
  }, [dismiss]);
  return useMemo(() => ({ items, push, dismiss }), [items, push, dismiss]);
}

export function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind === 'err' ? 'err' : ''}`}>
          <span>{toast.text}</span>
          {toast.action && (
            <button onClick={() => { toast.action!.run(); onDismiss(toast.id); }}>{toast.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}
