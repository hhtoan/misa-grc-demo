"use client";

import { useMemo, useState } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { matchSearch } from "@/lib/format";
import { useClickOutside } from "@/lib/hooks";
import type { Option } from "./Select";

interface BaseProps {
  /** Nhãn tĩnh luôn hiển thị, ví dụ "Trạng thái:" */
  label: string;
  options: Option[];
  searchable?: boolean;
  width?: number;
  className?: string;
  allLabel?: string;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  value: string | null;
  onChange: (v: string | null) => void;
}

interface MultiProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (v: string[]) => void;
}

export function FilterCombobox(props: SingleProps | MultiProps) {
  const {
    label,
    options,
    searchable = false,
    width = 200,
    className,
    allLabel = "Tất cả",
  } = props;

  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  const filtered = useMemo(() => {
    if (!searchable || !keyword) return options;
    return options.filter((o) => matchSearch(o.label, keyword));
  }, [options, keyword, searchable]);

  const display = (() => {
    if (props.multiple) {
      if (props.value.length === 0) return allLabel;
      if (props.value.length === 1)
        return (
          options.find((o) => o.value === props.value[0])?.label ?? allLabel
        );
      return `${props.value.length} mục đã chọn`;
    }
    if (!props.value) return allLabel;
    return options.find((o) => o.value === props.value)?.label ?? allLabel;
  })();

  const isDirty = props.multiple ? props.value.length > 0 : !!props.value;

  function toggle(v: string) {
    if (props.multiple) {
      const set = new Set(props.value);
      set.has(v) ? set.delete(v) : set.add(v);
      props.onChange([...set]);
    } else {
      props.onChange(props.value === v ? null : v);
      setOpen(false);
    }
  }

  return (
    <div
      ref={ref}
      className={cn("relative shrink-0", className)}
      style={{ width }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-full items-center gap-1 rounded-ctrl border bg-white px-2.5 text-[13px]",
          "transition-colors outline-none hover:border-[#B9BCC2]",
          open || isDirty ? "border-brand" : "border-border-neutral",
        )}
      >
        <span className="shrink-0 text-text-secondary">{label}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left font-medium",
            isDirty ? "text-brand" : "text-text-primary",
          )}
        >
          {display}
        </span>
        <IconChevronDown
          size={16}
          className={cn(
            "shrink-0 text-icon-neutral transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="animate-fade-in absolute z-50 mt-1 w-full min-w-[200px] overflow-hidden rounded-card bg-white shadow-dropdown">
          {searchable && (
            <div className="border-b border-border-light p-2">
              <input
                autoFocus
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm kiếm..."
                className="h-7 w-full rounded-ctrl border border-border-neutral px-2 text-[13px] outline-none focus:border-brand"
              />
            </div>
          )}

          <div className="max-h-[280px] overflow-y-auto py-1">
            {!props.multiple && (
              <button
                type="button"
                onClick={() => {
                  props.onChange(null);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-brand-light",
                  !props.value && "font-medium text-brand",
                )}
              >
                {allLabel}
                {!props.value && <IconCheck size={15} />}
              </button>
            )}

            {filtered.map((opt) => {
              const checked = props.multiple
                ? props.value.includes(opt.value)
                : props.value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-brand-light"
                >
                  {props.multiple && (
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-brand bg-brand text-white"
                          : "border-border-neutral",
                      )}
                    >
                      {checked && <IconCheck size={12} stroke={3} />}
                    </span>
                  )}
                  {opt.dot && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: opt.dot }}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {!props.multiple && checked && (
                    <IconCheck size={15} className="text-brand" />
                  )}
                </button>
              );
            })}
          </div>

          {props.multiple && (
            <div className="flex items-center justify-between border-t border-border-light px-2 py-1.5">
              <button
                type="button"
                onClick={() => props.onChange([])}
                className="text-[12px] text-text-secondary hover:text-brand"
              >
                Bỏ chọn tất cả
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] font-medium text-brand"
              >
                Xong
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
