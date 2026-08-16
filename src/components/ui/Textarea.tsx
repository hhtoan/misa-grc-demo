"use client";

import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Field } from "./Field";
import { useId } from "@/lib/hooks";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  maxLength?: number;
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      required,
      error,
      hint,
      className,
      rows = 3,
      maxLength,
      showCount,
      value,
      id,
      ...rest
    },
    ref,
  ) {
    const autoId = useId("txt");
    const areaId = id ?? autoId;
    const len = typeof value === "string" ? value.length : 0;

    return (
      <Field
        label={label}
        htmlFor={areaId}
        required={required}
        error={error}
        hint={hint}
      >
        <div className="relative">
          <textarea
            ref={ref}
            id={areaId}
            rows={rows}
            maxLength={maxLength}
            value={value}
            className={cn(
              "w-full resize-y rounded-ctrl border border-border-neutral bg-white px-2.5 py-2",
              "text-[13px] leading-5 text-text-primary placeholder:text-text-hint",
              "outline-none transition-colors hover:border-[#B9BCC2]",
              "focus:border-brand focus:ring-3 focus:ring-brand/12",
              "disabled:cursor-not-allowed disabled:bg-fill-input",
              error && "border-danger focus:border-danger focus:ring-danger/12",
              className,
            )}
            {...rest}
          />
          {showCount && maxLength && (
            <span className="absolute right-2 bottom-1.5 text-[11px] text-text-hint">
              {len}/{maxLength}
            </span>
          )}
        </div>
      </Field>
    );
  },
);
