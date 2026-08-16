"use client";

import { forwardRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { Field } from "./Field";
import { useId } from "@/lib/hooks";
import { formatMoney } from "@/lib/format";

export const inputBase = cn(
  "h-8 w-full rounded-ctrl border border-border-neutral bg-white px-2.5",
  "text-[13px] text-text-primary placeholder:text-text-hint",
  "transition-colors outline-none",
  "hover:border-[#B9BCC2]",
  "focus:border-brand focus:ring-3 focus:ring-brand/12",
  "disabled:cursor-not-allowed disabled:bg-fill-input disabled:text-text-hint",
);

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  prefixIcon?: ReactNode;
  suffix?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    required,
    error,
    hint,
    prefixIcon,
    suffix,
    className,
    wrapperClassName,
    id,
    ...rest
  },
  ref,
) {
  const autoId = useId("inp");
  const inputId = id ?? autoId;

  const control = (
    <div className="relative flex items-center">
      {prefixIcon && (
        <span className="pointer-events-none absolute left-2.5 flex text-icon-neutral">
          {prefixIcon}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          inputBase,
          prefixIcon && "pl-8",
          suffix && "pr-8",
          error && "border-danger focus:border-danger focus:ring-danger/12",
          className,
        )}
        {...rest}
      />
      {suffix && (
        <span className="absolute right-2.5 flex items-center text-text-secondary">
          {suffix}
        </span>
      )}
    </div>
  );

  if (!label && !error && !hint)
    return <div className={wrapperClassName}>{control}</div>;

  return (
    <Field
      label={label}
      htmlFor={inputId}
      required={required}
      error={error}
      hint={hint}
      className={wrapperClassName}
    >
      {control}
    </Field>
  );
});

/* --------------------------- Ô tìm kiếm --------------------------- */

export function SearchInput({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
  className,
  width = 240,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  width?: number;
}) {
  return (
    <div className={cn("relative", className)} style={{ width }}>
      <IconSearch
        size={16}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-icon-neutral"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputBase, "pr-8 pl-8")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Xoá từ khoá"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-icon-neutral hover:bg-[#F0F0F0]"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------- Ô ngày ------------------------------ */

export function DateInput({
  label,
  required,
  error,
  hint,
  value,
  onChange,
  min,
  max,
  disabled,
  className,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  value: string; // yyyy-MM-dd
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId("date");
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <input
        id={id}
        type="date"
        value={value ?? ""}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputBase, error && "border-danger")}
      />
    </Field>
  );
}

/* ------------------- Ô tiền tệ (1.200.000) ------------------------ */

export function MoneyInput({
  label,
  required,
  error,
  hint,
  value,
  onChange,
  unit = "VNĐ",
  disabled,
  placeholder = "0",
  className,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const id = useId("money");
  const [focused, setFocused] = useState(false);

  const display = focused
    ? value === null || value === undefined
      ? ""
      : String(value)
    : formatMoney(value);

  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <div className="relative flex items-center">
        <input
          id={id}
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={display}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, "");
            onChange(raw === "" ? null : Number(raw));
          }}
          className={cn(
            inputBase,
            "pr-12 text-right",
            error && "border-danger",
          )}
        />
        <span className="pointer-events-none absolute right-2.5 text-[12px] text-text-secondary">
          {unit}
        </span>
      </div>
    </Field>
  );
}
