"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type Toast = { id: number; message: string; action?: { label: string; run: () => void } };

type ToastApi = {
  toast: (message: string, action?: Toast["action"]) => void;
  error: (message: string) => void;
};

const Ctx = createContext<ToastApi | null>(null);

export function useToast() {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((message: string, action?: Toast["action"]) => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, message, action }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), action ? 7000 : 3800);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      error: (message: string) => push(message),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  setItems((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
