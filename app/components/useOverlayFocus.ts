"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Traps focus inside the overlay `ref` points at. Overlays can legitimately
 * stack — the AI workflow drawer opens Connections without closing itself — so
 * the caller decides which one is on top and passes the ref only to that one,
 * instead of guessing from document order.
 */
export function useOverlayFocus(ref: RefObject<HTMLElement | null>, topOverlay: string) {
  useEffect(() => {
    const dialog = topOverlay ? ref.current : null;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = document.querySelector<HTMLElement>(".main-shell");
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (shell) shell.inert = true;
    if (sidebar) sidebar.inert = true;
    const frame = window.requestAnimationFrame(() => {
      (
        dialog.querySelector<HTMLElement>("[autofocus], button, input, textarea, select, [href]") ||
        dialog
      ).focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => !item.hidden,
      );
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trap);
      if (shell) shell.inert = false;
      if (sidebar) sidebar.inert = false;
      previous?.focus();
    };
  }, [ref, topOverlay]);
}
