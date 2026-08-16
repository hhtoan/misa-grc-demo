/** Định dạng số tiền: 1200000 -> "1.200.000" */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("vi-VN").format(value);
}

/** Định dạng số thường: 1234.5 -> "1.234,5" */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("vi-VN").format(value);
}

/** ISO date -> "12/08/2026" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** ISO date -> "12/08/2026 14:30" */
export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(d)} ${new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)}`;
}

/** Date -> "2026-08-16" dùng cho input type=date */
export function toInputDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** "Nguyễn Văn Bình" -> "NB" (dùng cho avatar tròn) */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Số ngày quá hạn so với hôm nay (âm = còn hạn) */
export function daysOverdue(
  deadline: string | Date | null | undefined,
): number {
  if (!deadline) return 0;
  const d = typeof deadline === "string" ? new Date(deadline) : deadline;
  if (Number.isNaN(d.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

/** Bỏ dấu tiếng Việt, phục vụ tìm kiếm không dấu */
export function removeDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** So khớp tìm kiếm: không phân biệt hoa thường, không phân biệt dấu */
export function matchSearch(haystack: string, needle: string): boolean {
  if (!needle.trim()) return true;
  return removeDiacritics(haystack.toLowerCase()).includes(
    removeDiacritics(needle.toLowerCase().trim()),
  );
}
