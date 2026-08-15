export function clampProgress(value: unknown) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function daysSince(value?: string) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
}
export function daysUntil(value?: string) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}
// Intl formatters are expensive to construct and these run inside list renders.
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const calendarNames: Record<string, string> = {
  个人: "Personal",
  工作: "Work",
  家庭: "Family",
  生日: "Birthdays",
  中国节假日: "Chinese holidays",
};

export function shortDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dayFormat.format(date);
}
export function timeLabel(iso: string) {
  return clockFormat.format(new Date(iso));
}
export function calendarDisplayName(value: string) {
  return calendarNames[value.trim()] || value;
}
export function durationMinutes(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
