import { useEffect, type RefObject } from "react";

export function usePullToRefresh(
  handler: () => void | Promise<void>,
  enabled: boolean,
  scrollContainerRef?: RefObject<HTMLElement | null>,
  threshold = 80
) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    let isExecuting = false;
    const getScrollTop = () =>
      scrollContainerRef?.current?.scrollTop ?? window.scrollY;

    const handleTouchStart = (event: TouchEvent) => {
      if (getScrollTop() > 0 || isExecuting) return;
      startY = event.touches[0]?.clientY ?? 0;
      currentY = startY;
      isPulling = true;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!isPulling || isExecuting) return;
      if (getScrollTop() > 0) {
        isPulling = false;
        return;
      }
      currentY = event.touches[0]?.clientY ?? 0;
      if (currentY - startY > 0) event.preventDefault();
    };
    const handleTouchEnd = () => {
      if (!isPulling || isExecuting) {
        isPulling = false;
        return;
      }
      const delta = currentY - startY;
      isPulling = false;
      if (delta < threshold || getScrollTop() > 0) return;
      isExecuting = true;
      Promise.resolve(handler()).finally(() => {
        isExecuting = false;
      });
    };

    const handleTouchCancel = () => {
      isPulling = false;
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchCancel);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [enabled, handler, scrollContainerRef, threshold]);
}
