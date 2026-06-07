import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("manifest allows popup to inject content scripts into an already-open Facebook tab", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(manifest.permissions.includes("activeTab"));
});

test("popup injects content scripts before sending scan messages", () => {
  const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");

  assert.match(popup, /ensureContentScript/);
  assert.match(popup, /chrome\.scripting\.executeScript/);
  assert.match(popup, /utils\.content\.js/);
  assert.match(popup, /content\.js/);
});

test("content script is guarded against duplicate injection", () => {
  const content = fs.readFileSync(path.join(root, "content.js"), "utf8");

  assert.match(content, /__FBMWA_CONTENT_LOADED/);
  assert.match(content, /fbmwa-ping/);
});

test("content script reserves a thread before sending to prevent duplicate replies", () => {
  const content = fs.readFileSync(path.join(root, "content.js"), "utf8");
  const reserveIndex = content.indexOf("await reserveThread(threadKey, reply)");
  const sendIndex = content.indexOf("sendButton.click()");

  assert.notEqual(reserveIndex, -1);
  assert.notEqual(sendIndex, -1);
  assert.ok(reserveIndex < sendIndex);
});

test("content script closes the chat after a successful send", () => {
  const content = fs.readFileSync(path.join(root, "content.js"), "utf8");

  assert.match(content, /closeConversation/);
  assert.match(content, /await closeConversation\(editor\)/);
});
