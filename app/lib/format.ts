import { en } from "../i18n/en";
import { LOCALES, type Locale } from "../i18n/locale";
import { zh } from "../i18n/zh";

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
// Intl formatters are expensive to construct and these run inside list renders,
// so there is one of each per language.
const TAGS: Record<Locale, string> = { en: "en-GB", zh: "zh-CN" };
const formatters = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    {
      day: new Intl.DateTimeFormat(TAGS[locale], {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      clock: new Intl.DateTimeFormat(TAGS[locale], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      number: new Intl.NumberFormat(TAGS[locale]),
      compact: new Intl.NumberFormat(TAGS[locale], {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    },
  ]),
) as Record<
  Locale,
  {
    day: Intl.DateTimeFormat;
    clock: Intl.DateTimeFormat;
    number: Intl.NumberFormat;
    compact: Intl.NumberFormat;
  }
>;
// macOS names its default calendars in the system language. An English interface
// shows them in English; a Chinese one keeps them as they are.
const calendarNames: Record<string, string> = {
  个人: "Personal",
  工作: "Work",
  家庭: "Family",
  生日: "Birthdays",
  中国节假日: "Chinese holidays",
};

export function shortDate(value: string | undefined, locale: Locale = "en") {
  if (!value) return locale === "zh" ? zh.common.notSet : en.common.notSet;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatters[locale].day.format(date);
}
export function timeLabel(iso: string, locale: Locale = "en") {
  return formatters[locale].clock.format(new Date(iso));
}
export function formatNumber(value: number, locale: Locale = "en") {
  return formatters[locale].number.format(value);
}
// 1.2K in English, 1.2万 in Chinese: each language groups large numbers its own way.
export function compactNumber(value: number, locale: Locale = "en") {
  return formatters[locale].compact.format(value);
}
export function calendarDisplayName(value: string, locale: Locale = "en") {
  return locale === "zh" ? value : calendarNames[value.trim()] || value;
}
export function durationMinutes(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
