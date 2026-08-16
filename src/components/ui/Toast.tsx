"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/hooks";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải nằm trong <ToastProvider>");
  return ctx;
}

const STYLE: Record<ToastType, { icon: ReactNode; bar: string }> = {
  success: {
    icon: <IconCircleCheck size={20} className="text-success" />,
    bar: "bg-success",
  },
  error: {
    icon: <IconCircleX size={20} className="text-danger" />,
    bar: "bg-danger",
  },
  warning: {
    icon: <IconAlertTriangle size={20} className="text-warning" />,
    bar: "bg-warning",
  },
  info: {
    icon: <IconInfoCircle size={20} className="text-info" />,
    bar: "bg-info",
  },
};

let seed = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastItem[]>([]);
  const mounted = useMounted();

  const remove = useCallback((id: number) => {
    setList((l) => l.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, title: string, description?: string) => {
      const id = ++seed;
      setList((l) => [...l, { id, type, title, description }]);
      setTimeout(() => remove(id), 3500);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      warning: (t, d) => push("warning", t, d),
      info: (t, d) => push("info", t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed top-4 right-4 z-[120] flex w-[360px] flex-col gap-2">
            {list.map((t) => (
              <div
                key={t.id}
                className="animate-slide-in-right pointer-events-auto flex gap-2.5 overflow-hidden rounded-card bg-white p-3 shadow-dropdown"
              >
                <span
                  className={cn("w-1 shrink-0 rounded-full", STYLE[t.type].bar)}
                />
                <span className="shrink-0 pt-px">{STYLE[t.type].icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-text-primary">
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="mt-0.5 text-[12px] leading-4 text-text-secondary">
                      {t.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label="Đóng thông báo"
                  className="h-fit shrink-0 rounded p-1 text-icon-neutral hover:bg-[#F0F0F0]"
                >
                  <IconX size={14} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
