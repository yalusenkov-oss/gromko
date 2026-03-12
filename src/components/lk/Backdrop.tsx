import { useRef, useCallback, type ReactNode } from "react";

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

  const sheetRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeDown(sheetRef, onClose);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 animate-fade-in" />
      <div
        ref={sheetRef}
        className={`relative z-10 w-full ${maxW} sm:mx-4 animate-modal-in max-h-[92vh] sm:max-h-[85vh] overflow-y-auto overscroll-contain will-change-transform`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
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

/**
 * Shared swipe-down-to-close hook.
 * Uses RAF to batch transform updates → no jank.
 */
export function useSwipeDown(
  sheetRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
  scrollRef?: React.RefObject<HTMLElement | null>,
) {
  const startY = useRef<number | null>(null);
  const dy = useRef(0);
  const rafId = useRef(0);

  const applyTransform = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy.current}px)`;
    }
  }, [sheetRef]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow swipe when scrolled to top
    const scrollEl = scrollRef?.current ?? e.currentTarget;
    if (scrollEl.scrollTop > 5) return;
    startY.current = e.touches[0].clientY;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }, [scrollRef, sheetRef]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null) return;
    dy.current = Math.max(0, e.touches[0].clientY - startY.current);
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(applyTransform);
  }, [applyTransform]);

  const onTouchEnd = useCallback(() => {
    if (startY.current === null) return;
    cancelAnimationFrame(rafId.current);
    startY.current = null;

    if (dy.current > 100) {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.25s ease-out';
        sheetRef.current.style.transform = 'translateY(100%)';
      }
      setTimeout(onClose, 250);
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.2s ease-out';
        sheetRef.current.style.transform = 'translateY(0)';
      }
    }
    dy.current = 0;
  }, [sheetRef, onClose]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
