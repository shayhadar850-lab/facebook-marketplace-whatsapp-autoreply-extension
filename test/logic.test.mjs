import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReply,
  buildThreadKey,
  canReplyToThread,
  DEFAULT_SETTINGS,
  normalizePhoneForWaMe,
  pickVariation,
} from "../utils.mjs";

test("normalizes Israeli WhatsApp numbers for wa.me links", () => {
  assert.equal(normalizePhoneForWaMe("053-405-2865"), "972534052865");
  assert.equal(normalizePhoneForWaMe("+972 53 405 2865"), "972534052865");
});

test("keeps five editable Hebrew reply variations", () => {
  assert.equal(DEFAULT_SETTINGS.replyVariations.length, 5);
  assert.ok(DEFAULT_SETTINGS.replyVariations.every((text) => text.includes("{whatsapp}")));
  assert.equal(DEFAULT_SETTINGS.maxRepliesPerScan, 1);
});

test("picks a deterministic variation from a thread key", () => {
  const first = pickVariation(["א", "ב", "ג", "ד", "ה"], "thread-123");
  const second = pickVariation(["א", "ב", "ג", "ד", "ה"], "thread-123");

  assert.equal(first, second);
  assert.ok(["א", "ב", "ג", "ד", "ה"].includes(first));
});

test("builds a reply by replacing the WhatsApp placeholder", () => {
  const reply = buildReply(
    {
      ...DEFAULT_SETTINGS,
      whatsappNumber: "053-405-2865",
      replyVariations: ["שלום, דברו איתי כאן: {whatsapp}"],
    },
    "abc"
  );

  assert.equal(reply, "שלום, דברו איתי כאן: https://wa.me/972534052865");
});

test("derives stable thread keys from visible conversation text", () => {
  assert.equal(
    buildThreadKey("יוליאנה · מחזיק Apple Watch בסגנון מחשב iMac קלאסי — ממתין לתשובתך. 20:15"),
    "יוליאנה|מחזיק Apple Watch בסגנון מחשב iMac קלאסי"
  );
});

test("allows only enabled, pending, unreplied threads", () => {
  const settings = { ...DEFAULT_SETTINGS, enabled: true };
  const handled = { "יוליאנה|מחזיק Apple Watch בסגנון מחשב iMac קלאסי": true };
  const pendingText = "יוליאנה · מחזיק Apple Watch בסגנון מחשב iMac קלאסי — ממתין לתשובתך. 20:15";
  const repliedText = "קבוצת מונטוזה · פריט אספנות שלום Idan! תודה שכתבתם https://wa.me/972534052865";

  assert.equal(canReplyToThread({ settings, threadText: pendingText, handledThreads: {} }).ok, true);
  assert.equal(canReplyToThread({ settings, threadText: pendingText, handledThreads: handled }).ok, false);
  assert.equal(canReplyToThread({ settings, threadText: repliedText, handledThreads: {} }).ok, false);
  assert.equal(canReplyToThread({ settings: { ...settings, enabled: false }, threadText: pendingText, handledThreads: {} }).ok, false);
});
