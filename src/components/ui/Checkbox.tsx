"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { useId } from "@/lib/hooks";

interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label?: ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    { label, indeterminate, className, checked, disabled, id, ...rest },
    ref,
  ) {
    const autoId = useId("cb");
    const cbId = id ?? autoId;
    const on = !!checked || !!indeterminate;

    return (
      <label
        htmlFor={cbId}
        className={cn(
          "inline-flex cursor-pointer items-center gap-2 select-none",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <span className="relative flex">
          <input
            ref={ref}
            id={cbId}
            type="checkbox"
            checked={!!checked}
            disabled={disabled}
            className="peer sr-only"
            {...rest}
          />
          <span
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors",
              "peer-focus-visible:ring-3 peer-focus-visible:ring-brand/20",
              on
                ? "border-brand bg-brand text-white"
                : "border-border-neutral bg-white hover:border-brand",
            )}
          >
            {indeterminate ? (
              <IconMinus size={12} stroke={3} />
            ) : checked ? (
              <IconCheck size={12} stroke={3} />
            ) : null}
          </span>
        </span>
        {label && (
          <span className="text-[13px] text-text-primary">{label}</span>
        )}
      </label>
    );
  },
);

/* ------------------------------ Radio ----------------------------- */

interface RadioProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  label?: ReactNode;
  description?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, className, checked, disabled, id, ...rest },
  ref,
) {
  const autoId = useId("rd");
  const rdId = id ?? autoId;

  return (
    <label
      htmlFor={rdId}
      className={cn(
        "inline-flex cursor-pointer items-start gap-2 select-none",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="relative mt-0.5 flex">
        <input
          ref={ref}
          id={rdId}
          type="radio"
          checked={checked}
          disabled={disabled}
          className="peer sr-only"
          {...rest}
        />
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
            "peer-focus-visible:ring-3 peer-focus-visible:ring-brand/20",
            checked
              ? "border-brand border-[5px] bg-white"
              : "border-border-neutral bg-white",
          )}
        />
      </span>
      <span className="flex flex-col">
        {label && (
          <span className="text-[13px] text-text-primary">{label}</span>
        )}
        {description && (
          <span className="text-[12px] text-text-secondary">{description}</span>
        )}
      </span>
    </label>
  );
});

/* ------------------------------ Switch ---------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 select-none",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[18px] w-8 shrink-0 rounded-full transition-colors outline-none",
          "focus-visible:ring-3 focus-visible:ring-brand/20",
          checked ? "bg-brand" : "bg-[#D5D7DA]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[16px]" : "left-0.5",
          )}
        />
      </button>
      {label && <span className="text-[13px] text-text-primary">{label}</span>}
    </label>
  );
}
