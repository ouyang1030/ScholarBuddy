// The language the Bridge answers in. A request carries it — the workbench
// sends the interface language as Accept-Language, the setup and pairing pages
// take ?lang= — and everything that request says is written in it, however deep
// in the Bridge the sentence is made. Work no request asked for, such as
// reminders, names its language explicitly.
import { AsyncLocalStorage } from "node:async_hooks";
import { en, zh } from "./messages.mjs";

export const LANGUAGES = ["en", "zh"];
export const MESSAGES = { en, zh };
export const HTML_LANG = { en: "en", zh: "zh-CN" };

const current = new AsyncLocalStorage();

// Anything that is not Chinese is answered in English, the language every
// message exists in first.
export function languageFrom(value) {
  const first = String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return first === "zh" || first.startsWith("zh-") ? "zh" : "en";
}

export function requestLanguage(request) {
  return languageOf(request.url, request.headers.get("accept-language"));
}

export function languageOf(url, acceptLanguage) {
  // A request line the URL parser rejects is refused later; it still gets a language.
  const chosen = URL.parse(url, "http://localhost")?.searchParams.get("lang");
  return LANGUAGES.includes(chosen) ? chosen : languageFrom(acceptLanguage);
}

export function inLanguage(language, work) {
  return current.run(LANGUAGES.includes(language) ? language : "en", work);
}

export function currentLanguage() {
  return current.getStore() || "en";
}

// `t("records.fieldDate", "dueDate")` in the current language; a message is a
// string, or a function of the values it names.
export function t(key, ...values) {
  return translate(currentLanguage(), key, ...values);
}

export function translate(language, key, ...values) {
  const lookup = (messages) =>
    key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), messages);
  const message = lookup(MESSAGES[language] || en) ?? lookup(en);
  if (message === undefined) throw new Error(`Unknown Bridge message: ${key}`);
  return typeof message === "function" ? message(...values) : message;
}

// Large counts read the way each language groups them.
export function count(value, language = currentLanguage()) {
  return value.toLocaleString(language === "zh" ? "zh-CN" : "en-US");
}
