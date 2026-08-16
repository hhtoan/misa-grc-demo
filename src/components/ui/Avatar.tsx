import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const PALETTE = [
  "#245FDF",
  "#12B76A",
  "#F79009",
  "#F04438",
  "#7A5AF8",
  "#0BA5EC",
  "#EE46BC",
  "#EF6820",
];

function colorOf(name: string) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return PALETTE[sum % PALETTE.length];
}

export function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: colorOf(name),
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Người dùng kèm tên, dùng trong bảng và card */
export function UserCell({
  name,
  sub,
  size = 28,
  className,
}: {
  name: string;
  sub?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar name={name} size={size} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] text-text-primary">{name}</span>
        {sub && (
          <span className="truncate text-[12px] text-text-secondary">
            {sub}
          </span>
        )}
      </span>
    </span>
  );
}

export function AvatarGroup({
  names,
  max = 3,
  size = 24,
}: {
  names: string[];
  max?: number;
  size?: number;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((n, i) => (
        <Avatar
          key={`${n}-${i}`}
          name={n}
          size={size}
          className={cn("ring-2 ring-white", i > 0 && "-ml-2")}
        />
      ))}
      {rest > 0 && (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-[#F0F0F0] font-semibold text-text-secondary ring-2 ring-white"
          style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
