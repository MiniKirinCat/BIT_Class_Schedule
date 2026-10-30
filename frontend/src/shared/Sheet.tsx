import { useEffect, useId, type ReactNode } from 'react';
import { Icon } from './Icon';

interface SheetProps {
  title: string;
  kicker?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ title, kicker, onClose, children }: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="sheet-handle" />
        <button
          type="button"
          className="sheet-close"
          aria-label="关闭"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        {kicker && <div className="sheet-kicker">{kicker}</div>}
        <div className="sheet-head">
          <h2 className="sheet-title" id={titleId}>
            {title}
          </h2>
        </div>
        {children}
      </section>
    </div>
  );
}
