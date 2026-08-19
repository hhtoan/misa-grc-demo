"use client";

export default function StepTitle({
  index,
  title,
  note,
}: {
  index: number;
  title: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light text-[13px] font-semibold text-brand">
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        <p className="text-[12px] leading-4 text-text-secondary">{note}</p>
      </div>
    </div>
  );
}
