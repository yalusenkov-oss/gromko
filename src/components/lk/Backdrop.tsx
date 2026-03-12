import { useRef, type ReactNode } from "react";

export function Backdrop({
  onClose,
  children,
  size = "sm",
}: {
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
}) {
  const maxW = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-xl",
    full: "max-w-2xl",
  }[size];

  /* ── Swipe-down to close on mobile ── */
  const startY = useRef<number | null>(null);
  const deltaY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    // only start swipe if at the top of scroll
    const el = e.currentTarget;
    if (el.scrollTop > 5) return;
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    deltaY.current = e.touches[0].clientY - startY.current;
    if (deltaY.current < 0) deltaY.current = 0;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${deltaY.current}px)`;
      sheetRef.current.style.transition = 'none';
    }
  };
  const onTouchEnd = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (deltaY.current > 100) {
      // dismiss
      if (sheetRef.current) {
        sheetRef.current.style.transform = 'translateY(100%)';
        sheetRef.current.style.transition = 'transform 0.25s ease-out';
      }
      setTimeout(onClose, 250);
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transform = 'translateY(0)';
        sheetRef.current.style.transition = 'transform 0.2s ease-out';
      }
    }
    deltaY.current = 0;
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        ref={sheetRef}
        className={`relative z-10 w-full ${maxW} sm:mx-4 animate-modal-in max-h-[92vh] sm:max-h-[85vh] overflow-y-auto overscroll-contain`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

export function DragHandle() {
  return (
    <div className="flex justify-center pt-2 pb-1 sm:hidden">
      <div className="w-10 h-1 bg-gromq-border rounded-full" />
    </div>
  );
}
