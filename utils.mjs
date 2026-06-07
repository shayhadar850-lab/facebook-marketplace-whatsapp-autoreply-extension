export const DEFAULT_SETTINGS = {
  enabled: false,
  whatsappNumber: "053-405-2865",
  scanIntervalSeconds: 20,
  sendDelaySeconds: 3,
  maxRepliesPerScan: 1,
  replyVariations: [
    "היי, תודה שפנית 🙂 להמשך מהיר ושליחת פרטים/תמונות אפשר לדבר איתי בוואטסאפ: {whatsapp}",
    "שלום! ראיתי את ההודעה שלך. הכי נוח לי להמשיך בוואטסאפ, כאן: {whatsapp}",
    "היי 🙂 אשמח לעזור. כדי לענות מהר יותר תכתוב/י לי בוואטסאפ: {whatsapp}",
    "שלום ותודה על הפנייה! אפשר להמשיך איתי בוואטסאפ לפרטים מהירים: {whatsapp}",
    "היי, קיבלתי את ההודעה. שלח/י לי וואטסאפ ואענה מהר יותר: {whatsapp}"
  ],
};

export function normalizePhoneForWaMe(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function whatsappUrl(phone) {
  return `https://wa.me/${normalizePhoneForWaMe(phone)}`;
}

export function hashString(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function pickVariation(variations, seed) {
  const usable = (variations || []).map((text) => String(text || "").trim()).filter(Boolean);
  if (!usable.length) return "";
  return usable[hashString(seed) % usable.length];
}

export function buildReply(settings, threadKey) {
  const template = pickVariation(settings.replyVariations, threadKey);
  return template.replaceAll("{whatsapp}", whatsappUrl(settings.whatsappNumber));
}

export function buildThreadKey(threadText) {
  const clean = String(threadText || "")
    .replace(/\s+/g, " ")
    .replace(/‏/g, "")
    .trim();
  const [name = "", rest = ""] = clean.split("·").map((part) => part.trim());
  const item = rest
    .replace(/ממתין לתשובתך\.?/g, "")
    .replace(/קיבלת הודעה.*$/g, "")
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/\b(היום|אתמול|שבת|ראשון|שני|שלישי|רביעי|חמישי|שישי)\b/g, "")
    .replace(/[—–-]\s*$/g, "")
    .trim();
  return `${name}|${item}`.slice(0, 160);
}

export function canReplyToThread({ settings, threadText, handledThreads }) {
  if (!settings?.enabled) return { ok: false, reason: "disabled" };
  if (!/ממתין לתשובתך|קיבלת הודעה/.test(threadText || "")) return { ok: false, reason: "not_pending" };
  if (/wa\.me|וואטסאפ|whatsapp/i.test(threadText || "")) return { ok: false, reason: "already_mentions_whatsapp" };

  const threadKey = buildThreadKey(threadText);
  if (!threadKey || handledThreads?.[threadKey]) return { ok: false, reason: "handled", threadKey };
  return { ok: true, threadKey };
}
