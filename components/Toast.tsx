"use client";

import { useEffect, useState } from "react";

const TOAST_EVENT = "app:toast";
const TOAST_DURATION = 4500;

type ToastDetail = {
  title: string;
  message?: string;
  href?: string;
  hrefLabel?: string;
};

type ActiveToast = ToastDetail & { id: number };

/** Module-level trigger — callable from any client component on any route. */
export function showToast(detail: ToastDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export function ToastHost() {
  const [toast, setToast] = useState<ActiveToast | null>(null);

  useEffect(() => {
    let hideTimer: number | undefined;

    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (!detail?.title) return;
      setToast({ ...detail, id: Date.now() });
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setToast(null), TOAST_DURATION);
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!toast) return null;

  return (
    <div className="app-toast-wrap" role="status" aria-live="polite">
      <div className="app-toast" key={toast.id}>
        <span className="app-toast-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <path
              d="m5.5 10.5 3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="app-toast-text">
          <strong>{toast.title}</strong>
          {toast.message ? <span>{toast.message}</span> : null}
        </div>
        {toast.href ? (
          <a className="app-toast-action" href={toast.href}>
            {toast.hrefLabel ?? "View"}
          </a>
        ) : null}
        <button
          type="button"
          className="app-toast-close"
          aria-label="Dismiss"
          onClick={() => setToast(null)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
