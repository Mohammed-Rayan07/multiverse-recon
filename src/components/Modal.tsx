/** Accessible modal dialog: Esc to close, click backdrop to close, focus moved inside. */
import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  kicker?: string;
  children: ReactNode;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, kicker, children, wide }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[2000] grid place-items-center bg-void/75 p-3 backdrop-blur-sm sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`hud-panel hud-glow flex max-h-[92dvh] w-full flex-col outline-none ${wide ? 'max-w-4xl' : 'max-w-xl'}`}
            initial={{ y: 24, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-doom/15 px-5 py-4">
              <div>
                {kicker && <p className="font-mono text-[10px] tracking-[0.3em] text-doom uppercase">{kicker}</p>}
                <h2 className="text-xl font-bold tracking-wide">{title}</h2>
              </div>
              <button className="icon-btn shrink-0" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </header>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
