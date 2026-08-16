"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { bootstrapSeed } from "@/lib/seed";
import { Spinner } from "@/components/ui";

export function DataBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Chỉ chạy ở client vì dữ liệu nằm trên localStorage
    bootstrapSeed();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-page">
        <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-brand text-[18px] font-bold text-white">
          G
        </span>
        <p className="text-[15px] font-semibold text-text-primary">
          MISA <span className="text-brand">GRC</span>
        </p>
        <span className="flex items-center gap-2 text-[13px] text-text-secondary">
          <Spinner size={15} className="text-brand" />
          Đang chuẩn bị dữ liệu...
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
