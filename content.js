(function () {
  if (window.__FBMWA_CONTENT_LOADED) return;
  window.__FBMWA_CONTENT_LOADED = true;

  const STORAGE_KEYS = ["settings", "handledThreads", "stats"];
  const utils = window.FBMWA;
  let scanTimer = null;
  let busy = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  }

  async function getState() {
    const data = await chrome.storage.local.get(STORAGE_KEYS);
    return {
      settings: { ...utils.DEFAULT_SETTINGS, ...(data.settings || {}) },
      handledThreads: data.handledThreads || {},
      stats: data.stats || {},
    };
  }

  async function saveStats(update) {
    const { stats = {} } = await chrome.storage.local.get("stats");
    await chrome.storage.local.set({
      stats: {
        ...stats,
        ...update,
        lastSeenAt: new Date().toISOString(),
      },
    });
  }

  async function reserveThread(threadKey, reply) {
    const { handledThreads = {}, stats = {} } = await chrome.storage.local.get(["handledThreads", "stats"]);
    await chrome.storage.local.set({
      handledThreads: {
        ...handledThreads,
        [threadKey]: {
          status: "sending",
          reservedAt: new Date().toISOString(),
          reply,
        },
      },
      stats: {
        ...stats,
        lastThreadKey: threadKey,
        lastError: "",
      },
    });
  }

  async function completeThread(threadKey, reply) {
    const { handledThreads = {}, stats = {} } = await chrome.storage.local.get(["handledThreads", "stats"]);
    await chrome.storage.local.set({
      handledThreads: {
        ...handledThreads,
        [threadKey]: {
          status: "sent",
          repliedAt: new Date().toISOString(),
          reply,
        },
      },
      stats: {
        ...stats,
        sentCount: (stats.sentCount || 0) + 1,
        lastReplyAt: new Date().toISOString(),
        lastThreadKey: threadKey,
        lastError: "",
      },
    });
  }

  function hasBlueUnreadDot(button) {
    const candidates = Array.from(button.querySelectorAll("div, span, i"));
    return candidates.some((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 5 || rect.width > 14 || rect.height < 5 || rect.height > 14) return false;
      const style = getComputedStyle(element);
      const color = `${style.backgroundColor} ${style.color}`;
      return /24,\s*119,\s*242|8,\s*102,\s*255|0,\s*132,\s*255/.test(color);
    });
  }

  function looksLikeThreadButton(button) {
    const text = (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length < 20 || !text.includes("·")) return false;
    if (/הכול|בהמתנה לתשלום|התקבל התשלום|בהמתנה למשלוח|נשלחה|הושלמה/.test(text)) return false;
    return /ממתין לתשובתך|קיבלת הודעה/.test(text) || hasBlueUnreadDot(button);
  }

  function findCandidateThreads(settings, handledThreads) {
    const buttons = Array.from(document.querySelectorAll('div[role="button"]')).filter(visible);
    return buttons
      .map((button) => {
        const threadText = (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim();
        const decision = utils.canReplyToThread({ settings, threadText, handledThreads });
        return { button, threadText, decision };
      })
      .filter(({ button, decision }) => decision.ok && looksLikeThreadButton(button));
  }

  function findComposer() {
    const editors = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], div[contenteditable="true"]'))
      .filter(visible)
      .filter((element) => {
        const label = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-lexical-editor") || ""}`;
        const rect = element.getBoundingClientRect();
        return rect.top > window.innerHeight * 0.35 && (/הודעה|message|Message/i.test(label) || rect.height >= 20);
      });
    return editors.at(-1) || null;
  }

  function setComposerText(editor, text) {
    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, text);
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  function findSendButton(editor) {
    const editorRect = editor.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'))
      .filter(visible)
      .filter((button) => {
        const aria = button.getAttribute("aria-label") || "";
        const text = (button.innerText || button.textContent || "").trim();
        const rect = button.getBoundingClientRect();
        const nearComposer = Math.abs(rect.top - editorRect.top) < 120 || rect.top > editorRect.top - 40;
        return nearComposer && /יש ללחוץ על Enter לשליחה|שלח|שליחה|Send|Press Enter/i.test(`${aria} ${text}`);
      })
      .sort((a, b) => {
        const exactA = /יש ללחוץ על Enter לשליחה/.test(`${a.getAttribute("aria-label") || ""} ${a.innerText || ""}`) ? 0 : 1;
        const exactB = /יש ללחוץ על Enter לשליחה/.test(`${b.getAttribute("aria-label") || ""} ${b.innerText || ""}`) ? 0 : 1;
        return exactA - exactB;
      });
    return buttons[0] || null;
  }

  async function pressComposerEnter(editor) {
    editor.focus();
    for (const type of ["keydown", "keypress", "keyup"]) {
      editor.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }));
    }
    await sleep(300);
  }

  function findConversationRoot(editor) {
    let current = editor;
    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      if (rect.width >= 260 && rect.width <= 430 && rect.height >= 220 && rect.bottom > window.innerHeight * 0.55) {
        return current;
      }
      current = current.parentElement;
    }
    return editor.closest('[role="dialog"]') || document;
  }

  async function closeConversation(editor) {
    const root = findConversationRoot(editor);
    const editorRect = editor.getBoundingClientRect();
    const buttons = Array.from(root.querySelectorAll('div[role="button"], button'))
      .filter(visible)
      .filter((button) => {
        const label = `${button.getAttribute("aria-label") || ""} ${(button.innerText || button.textContent || "").trim()}`;
        const rect = button.getBoundingClientRect();
        const aboveComposer = rect.bottom < editorRect.top;
        const likelyClose = /סגור|סגירה|Close|close/i.test(label) || (rect.width <= 34 && rect.height <= 34 && aboveComposer);
        return likelyClose;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.top - br.top || ar.left - br.left;
      });

    const closeButton = buttons[0];
    if (closeButton) {
      closeButton.click();
      await sleep(300);
    }
  }

  async function sendReplyToThread(candidate, settings) {
    const threadKey = candidate.decision.threadKey;
    const reply = utils.buildReply(settings, threadKey);

    await reserveThread(threadKey, reply);
    candidate.button.scrollIntoView({ block: "center" });
    candidate.button.click();
    await sleep(Math.max(500, settings.sendDelaySeconds * 1000));

    const editor = findComposer();
    if (!editor) throw new Error("לא נמצא שדה כתיבת הודעה בשיחה");

    setComposerText(editor, reply);
    await sleep(300);

    const sendButton = findSendButton(editor);
    if (!sendButton) throw new Error("לא נמצא כפתור שליחה לאחר הכנסת הטקסט");

    sendButton.click();
    await pressComposerEnter(editor);
    await completeThread(threadKey, reply);
    await sleep(1000);
    await closeConversation(editor);
  }

  async function scanOnce() {
    if (busy || !location.href.includes("/marketplace/inbox")) return;
    busy = true;

    try {
      const { settings, handledThreads } = await getState();
      if (!settings.enabled) {
        await saveStats({ status: "paused" });
        return;
      }

      const candidates = findCandidateThreads(settings, handledThreads).slice(0, settings.maxRepliesPerScan);
      await saveStats({ status: `נמצאו ${candidates.length} שיחות לטיפול`, lastError: "" });

      for (const candidate of candidates) {
        await sendReplyToThread(candidate, settings);
      }
    } catch (error) {
      await saveStats({ status: "שגיאה", lastError: error.message || String(error) });
    } finally {
      busy = false;
    }
  }

  async function startLoop() {
    if (scanTimer) clearInterval(scanTimer);
    const { settings } = await getState();
    scanTimer = setInterval(scanOnce, Math.max(8, settings.scanIntervalSeconds) * 1000);
    await scanOnce();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "fbmwa-ping") {
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "fbmwa-scan-now") {
      scanOnce().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === "fbmwa-restart") {
      startLoop().then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) startLoop();
  });

  startLoop();
})();
