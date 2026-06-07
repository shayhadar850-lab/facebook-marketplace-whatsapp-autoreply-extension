const utils = window.FBMWA;
const fields = {
  enabled: document.querySelector("#enabled"),
  whatsappNumber: document.querySelector("#whatsappNumber"),
  scanIntervalSeconds: document.querySelector("#scanIntervalSeconds"),
  sendDelaySeconds: document.querySelector("#sendDelaySeconds"),
  variations: document.querySelector("#variations"),
  status: document.querySelector("#status"),
  sentCount: document.querySelector("#sentCount"),
  lastError: document.querySelector("#lastError"),
  save: document.querySelector("#save"),
  scanNow: document.querySelector("#scanNow"),
};

function variationInputs() {
  return Array.from(document.querySelectorAll("[data-variation]"));
}

function renderVariations(values) {
  fields.variations.innerHTML = "";
  values.forEach((value, index) => {
    const label = document.createElement("label");
    label.className = "variation";
    label.textContent = `נוסח ${index + 1}`;

    const textarea = document.createElement("textarea");
    textarea.dataset.variation = String(index);
    textarea.value = value;
    label.append(textarea);
    fields.variations.append(label);
  });
}

async function load() {
  const data = await chrome.storage.local.get(["settings", "stats"]);
  const settings = { ...utils.DEFAULT_SETTINGS, ...(data.settings || {}) };
  const stats = data.stats || {};

  fields.enabled.checked = Boolean(settings.enabled);
  fields.whatsappNumber.value = settings.whatsappNumber;
  fields.scanIntervalSeconds.value = settings.scanIntervalSeconds;
  fields.sendDelaySeconds.value = settings.sendDelaySeconds;
  renderVariations(settings.replyVariations);

  fields.status.textContent = stats.status || (settings.enabled ? "פעיל" : "מושהה");
  fields.sentCount.textContent = String(stats.sentCount || 0);
  fields.lastError.textContent = stats.lastError || "";
}

async function save() {
  const settings = {
    ...utils.DEFAULT_SETTINGS,
    enabled: fields.enabled.checked,
    whatsappNumber: fields.whatsappNumber.value.trim(),
    scanIntervalSeconds: Number(fields.scanIntervalSeconds.value || 20),
    sendDelaySeconds: Number(fields.sendDelaySeconds.value || 3),
    replyVariations: variationInputs().map((input) => input.value.trim()).filter(Boolean).slice(0, 5),
  };

  while (settings.replyVariations.length < 5) {
    settings.replyVariations.push(utils.DEFAULT_SETTINGS.replyVariations[settings.replyVariations.length]);
  }

  await chrome.storage.local.set({ settings });
  fields.status.textContent = settings.enabled ? "פעיל" : "מושהה";
}

async function saveError(message) {
  fields.status.textContent = "שגיאה";
  fields.lastError.textContent = message;
  const { stats = {} } = await chrome.storage.local.get("stats");
  await chrome.storage.local.set({
    stats: {
      ...stats,
      status: "שגיאה",
      lastError: message,
      lastSeenAt: new Date().toISOString(),
    },
  });
}

function assertMarketplaceTab(tab) {
  if (!tab?.id) throw new Error("לא נמצא טאב פעיל");
  if (!/^https:\/\/www\.facebook\.com\/marketplace\/inbox/.test(tab.url || "")) {
    throw new Error("פתח קודם את דף ההודעות של Marketplace ואז לחץ שוב");
  }
}

async function ensureContentScript(tab) {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "fbmwa-ping" });
    return;
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["utils.content.js", "content.js"],
    });
  }
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  assertMarketplaceTab(tab);
  await ensureContentScript(tab);
  await chrome.tabs.sendMessage(tab.id, message);
}

fields.save.addEventListener("click", async () => {
  try {
    await save();
    await sendToActiveTab({ type: "fbmwa-restart" });
  } catch (error) {
    await saveError(error.message || String(error));
  }
});

fields.scanNow.addEventListener("click", async () => {
  try {
    fields.enabled.checked = true;
    fields.status.textContent = "בודק עכשיו...";
    fields.lastError.textContent = "";
    await save();
    await sendToActiveTab({ type: "fbmwa-scan-now" });
    await load();
  } catch (error) {
    await saveError(error.message || String(error));
  }
});

fields.enabled.addEventListener("change", save);

load();
