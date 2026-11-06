export const TRANSLATE_LANGS = [
  { id: "off", label: "Aus" },
  { id: "de", label: "Deutsch" },
  { id: "en", label: "Englisch" },
  { id: "fr", label: "Französisch" },
  { id: "es", label: "Spanisch" },
  { id: "it", label: "Italienisch" },
  { id: "pl", label: "Polnisch" },
  { id: "tr", label: "Türkisch" },
  { id: "uk", label: "Ukrainisch" },
  { id: "ru", label: "Russisch" },
  { id: "ar", label: "Arabisch" },
  { id: "zh", label: "Chinesisch" },
  { id: "ja", label: "Japanisch" },
  { id: "pt", label: "Portugiesisch" },
  { id: "nl", label: "Niederländisch" },
] as const;

export type TranslateId = (typeof TRANSLATE_LANGS)[number]["id"];

export const SPEECH_LANGS = [
  { id: "de-DE", label: "Deutsch" },
  { id: "en-US", label: "Englisch" },
  { id: "fr-FR", label: "Französisch" },
  { id: "es-ES", label: "Spanisch" },
  { id: "it-IT", label: "Italienisch" },
  { id: "pl-PL", label: "Polnisch" },
  { id: "tr-TR", label: "Türkisch" },
  { id: "uk-UA", label: "Ukrainisch" },
  { id: "ru-RU", label: "Russisch" },
  { id: "ar-SA", label: "Arabisch" },
  { id: "zh-CN", label: "Chinesisch" },
  { id: "ja-JP", label: "Japanisch" },
  { id: "pt-BR", label: "Portugiesisch" },
  { id: "nl-NL", label: "Niederländisch" },
] as const;

const TRANSLATE_SET = new Set<string>(TRANSLATE_LANGS.map((item) => item.id));
const SPEECH_SET = new Set<string>(SPEECH_LANGS.map((item) => item.id));

export function isTranslateId(value: string): value is TranslateId {
  return TRANSLATE_SET.has(value);
}

export function isSpeechId(value: string): boolean {
  return SPEECH_SET.has(value);
}

export function translateLabel(id: string): string {
  return TRANSLATE_LANGS.find((item) => item.id === id)?.label ?? id;
}

export function labelForDetected(code: string): string {
  const base = code.toLowerCase().split("-")[0] ?? code;
  return TRANSLATE_LANGS.find((item) => item.id === base)?.label ?? code;
}
