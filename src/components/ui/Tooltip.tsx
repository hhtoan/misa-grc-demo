"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/hooks";

type Placement = "top" | "bottom" | "left" | "right";

export function Tooltip({
  content,
  placement = "top",
  delay = 150,
  children,
  className,
}: {
  content: ReactNode;
  placement?: Placement;
  delay?: number;
  children: ReactNode;
  className?: string;
}) {
  const mounted = useMounted();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);

  function show() {
    timer.current = setTimeout(() => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const map: Record<Placement, { top: number; left: number }> = {
        top: { top: r.top - 8, left: r.left + r.width / 2 },
        bottom: { top: r.bottom + 8, left: r.left + r.width / 2 },
        left: { top: r.top + r.height / 2, left: r.left - 8 },
        right: { top: r.top + r.height / 2, left: r.right + 8 },
      };
      setPos(map[placement]);
    }, delay);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  }

  const transform: Record<Placement, string> = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0)",
    left: "translate(-100%, -50%)",
    right: "translate(0, -50%)",
  };

  return (
    <>
      <span
        ref={anchor}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={cn("inline-flex", className)}
      >
        {children}
      </span>

      {mounted &&
        pos &&
        content &&
        createPortal(
          <div
            role="tooltip"
            className="animate-fade-in pointer-events-none fixed z-[100] max-w-[280px] rounded-[6px] bg-[#101828] px-2 py-1 text-[12px] leading-4 text-white shadow-dropdown"
            style={{
              top: pos.top,
              left: pos.left,
              transform: transform[placement],
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
