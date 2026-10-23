import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  editing: boolean;
  label: string;
  className?: string;
  onSave: (name: string) => void;
  onDone: () => void;
}

/** Nombre que se edita en su sitio: Enter o salir del campo guarda, Escape cancela. */
export function EditableName({ value, editing, label, className, onSave, onDone }: Props) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(value);
    requestAnimationFrame(() => input.current?.select());
  }, [editing, value]);

  if (!editing) return <span className={className}>{value}</span>;
  const commit = () => {
    if (draft.trim() !== value) onSave(draft);
    onDone();
  };
  return (
    <input
      ref={input} className={`rename-input ${className ?? ''}`} aria-label={label} value={draft} maxLength={80}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') onDone();
      }}
    />
  );
}
