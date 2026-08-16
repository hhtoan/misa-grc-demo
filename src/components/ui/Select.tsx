"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { matchSearch } from "@/lib/format";
import { useClickOutside, useId } from "@/lib/hooks";
import { Field } from "./Field";
import { inputBase } from "./Input";

export interface Option<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Chấm màu bên trái, ví dụ trạng thái */
  dot?: string;
  icon?: ReactNode;
}

interface SelectProps<T extends string = string> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  placeholder?: string;
  options: Option<T>[];
  value: T | null;
  onChange: (v: T | null) => void;
  searchable?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  /** Render tuỳ biến phần hiển thị giá trị đã chọn */
  renderValue?: (opt: Option<T>) => ReactNode;
}

export function Select<T extends string = string>({
  label,
  required,
  error,
  hint,
  placeholder = "Chọn...",
  options,
  value,
  onChange,
  searchable = false,
  clearable = false,
  disabled,
  className,
  renderValue,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const id = useId("sel");

  const ref = useClickOutside<HTMLDivElement>(() => {
    setOpen(false);
    setKeyword("");
  }, open);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    if (!searchable || !keyword) return options;
    return options.filter((o) => matchSearch(o.label, keyword));
  }, [options, keyword, searchable]);

  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      error={error}
      hint={hint}
      className={className}
    >
      <div ref={ref} className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            inputBase,
            "flex items-center justify-between gap-2 pr-2 text-left",
            open && "border-brand ring-3 ring-brand/12",
            error && "border-danger",
            disabled && "bg-fill-input",
          )}
        >
          <span className={cn("truncate", !selected && "text-text-hint")}>
            {selected
              ? renderValue
                ? renderValue(selected)
                : selected.label
              : placeholder}
          </span>

          <span className="flex shrink-0 items-center gap-0.5">
            {clearable && selected && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Bỏ chọn"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="rounded p-0.5 text-icon-neutral hover:bg-[#F0F0F0]"
              >
                <IconX size={14} />
              </span>
            )}
            <IconChevronDown
              size={16}
              className={cn(
                "text-icon-neutral transition-transform",
                open && "rotate-180",
              )}
            />
          </span>
        </button>

        {open && (
          <div className="animate-fade-in absolute z-50 mt-1 w-full min-w-[180px] overflow-hidden rounded-card bg-white shadow-dropdown">
            {searchable && (
              <div className="border-b border-border-light p-2">
                <input
                  autoFocus
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className={cn(inputBase, "h-7")}
                />
              </div>
            )}

            <div className="max-h-[260px] overflow-y-auto py-1">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-[12px] text-text-hint">
                  Không có dữ liệu
                </p>
              )}

              {filtered.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setKeyword("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                      "hover:bg-brand-light disabled:cursor-not-allowed disabled:text-text-hint",
                      active && "bg-brand-light font-medium text-brand",
                    )}
                  >
                    {opt.dot && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: opt.dot }}
                      />
                    )}
                    {opt.icon}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{opt.label}</span>
                      {opt.description && (
                        <span className="truncate text-[12px] text-text-secondary">
                          {opt.description}
                        </span>
                      )}
                    </span>
                    {active && (
                      <IconCheck size={15} className="shrink-0 text-brand" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}
