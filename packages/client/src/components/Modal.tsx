import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../theme/tokens';

interface Props {
  titleId?: string;
  ariaLabel?: string;
  onClose?: () => void;
  z?: number;
  panelStyle?: React.CSSProperties;
  children: ReactNode;
}

function getFocusable(el: HTMLElement): HTMLElement[] {
  return Array.from(
    el.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export default function Modal({ titleId, ariaLabel, onClose, z = t.zModal, panelStyle, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const priorFocus = useRef<Element | null>(null);
  // Keep onClose stable inside the effect via ref.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    priorFocus.current = document.activeElement;
    const panel = panelRef.current;
    if (!panel) return;

    const focusable = getFocusable(panel);
    (focusable[0] ?? panel).focus();

    function handleKey(e: KeyboardEvent) {
      if (!panel) return;
      if (e.key === 'Escape') {
        if (onCloseRef.current) {
          e.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (e.key === 'Tab') {
        const items = getFocusable(panel);
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || active === panel) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      (priorFocus.current as HTMLElement | null)?.focus();
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: t.scrim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: z,
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={titleId ? undefined : ariaLabel}
        tabIndex={-1}
        style={{
          outline: 'none',
          border: `2px solid ${t.borderModal}`,
          borderRadius: t.radiusCard,
          ...panelStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
