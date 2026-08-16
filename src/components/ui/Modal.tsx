"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { useEscapeKey, useLockBodyScroll, useMounted } from "@/lib/hooks";
import { Button } from "./Button";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE: Record<ModalSize, string> = {
  sm: "w-[420px]",
  md: "w-[600px]",
  lg: "w-[840px]",
  xl: "w-[1080px]",
  full: "w-[calc(100vw-64px)] h-[calc(100vh-64px)]",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  footer,
  children,
  closeOnOverlay = true,
  headerRight,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: string;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
  closeOnOverlay?: boolean;
  headerRight?: ReactNode;
  bodyClassName?: string;
}) {
  const mounted = useMounted();
  useEscapeKey(onClose, open);
  useLockBodyScroll(open);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-modal-in flex max-h-[calc(100vh-64px)] flex-col overflow-hidden rounded-card bg-white shadow-modal",
          SIZE[size],
        )}
      >
        {/* Header 56px */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-light px-4">
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-[16px] font-semibold text-text-primary">
              {title}
            </h2>
            {description && (
              <p className="truncate text-[12px] text-text-secondary">
                {description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-ctrl p-1.5 text-icon-neutral transition-colors hover:bg-[#F0F0F0]"
            >
              <IconX size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={cn("flex-1 overflow-y-auto p-4", bodyClassName)}>
          {children}
        </div>

        {/* Footer 56px */}
        {footer && (
          <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-border-light bg-surface-alt px-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------- Hộp thoại xác nhận --------------------- */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Đồng ý",
  cancelText = "Huỷ",
  tone = "warning",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "warning" | "danger" | "info";
  loading?: boolean;
}) {
  const icon =
    tone === "danger" ? (
      <IconTrash size={20} className="text-danger" />
    ) : tone === "info" ? (
      <IconInfoCircle size={20} className="text-info" />
    ) : (
      <IconAlertTriangle size={20} className="text-warning" />
    );

  const bg =
    tone === "danger"
      ? "bg-lv-critical-bg"
      : tone === "info"
        ? "bg-lv-info-bg"
        : "bg-lv-medium-bg";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            bg,
          )}
        >
          {icon}
        </span>
        <div className="pt-1 text-[13px] leading-5 text-text-primary">
          {message}
        </div>
      </div>
    </Modal>
  );
}
