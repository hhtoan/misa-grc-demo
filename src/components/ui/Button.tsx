"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "text"
  | "danger"
  | "danger-outline"
  | "ai";

export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Bỏ min-width 84px (dùng cho nút trong toolbar chật) */
  compact?: boolean;
  full?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover active:bg-brand-hover disabled:bg-[#B6C9F2]",
  secondary:
    "bg-white text-text-primary border border-border-neutral hover:bg-[#F5F5F5] active:bg-[#EDEDED] disabled:text-text-hint",
  text: "bg-transparent text-text-primary hover:bg-[#F0F0F0] active:bg-[#E6E6E6] disabled:text-text-hint",
  danger: "bg-danger text-white hover:brightness-95 active:brightness-90",
  "danger-outline":
    "bg-white text-danger border border-danger/40 hover:bg-[#FEF3F2]",
  ai: "btn-ai-outline text-ai hover:brightness-105",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1",
  md: "h-8 px-3 text-[13px] gap-1.5",
  lg: "h-9 px-4 text-[13px] gap-1.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      iconRight,
      compact = false,
      full = false,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-ctrl font-medium whitespace-nowrap",
          "transition-colors duration-150 outline-none",
          "focus-visible:ring-3 focus-visible:ring-brand/20",
          "disabled:cursor-not-allowed disabled:opacity-70",
          SIZE[size],
          VARIANT[variant],
          !compact && children ? "min-w-[84px]" : "",
          full && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner size={14} /> : icon}
        {children}
        {iconRight}
      </button>
    );
  },
);

/* ------------------------------------------------------------------ */

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "ghost" | "outline" | "brand";
  size?: ButtonSize;
  label: string; // bắt buộc cho accessibility
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { variant = "ghost", size = "md", label, className, children, ...rest },
    ref,
  ) {
    const box =
      size === "sm" ? "h-7 w-7" : size === "lg" ? "h-9 w-9" : "h-8 w-8";
    const style =
      variant === "outline"
        ? "border border-border-neutral bg-white hover:bg-[#F5F5F5]"
        : variant === "brand"
          ? "bg-brand text-white hover:bg-brand-hover"
          : "hover:bg-[#F0F0F0] text-icon-neutral";

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-ctrl transition-colors",
          "outline-none focus-visible:ring-3 focus-visible:ring-brand/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          box,
          style,
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
