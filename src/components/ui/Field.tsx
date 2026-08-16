import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  labelWidth?: number; // nếu muốn layout ngang
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-medium text-text-primary"
        >
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-text-hint">{hint}</p>
      ) : null}
    </div>
  );
}

/** Lưới form 2 cột chuẩn của màn hình thêm mới/sửa */
export function FormGrid({
  cols = 2,
  className,
  children,
}: {
  cols?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-3.5",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 md:grid-cols-2",
        cols === 3 && "grid-cols-1 md:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Nhóm trường có tiêu đề, dùng trong form dài */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-0.5 border-b border-border-light pb-2">
        <h3 className="text-[14px] font-semibold text-text-primary">{title}</h3>
        {description && (
          <p className="text-[12px] text-text-secondary">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Ô hiển thị dữ liệu ở màn hình xem chi tiết (read-only) */
export function ReadField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-[12px] text-text-secondary">{label}</span>
      <div className="text-[13px] text-text-primary">{children || "--"}</div>
    </div>
  );
}
