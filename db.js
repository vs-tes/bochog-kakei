const DB_NAME = "bochog-kakei";
const DB_VERSION = 1;

export const CURRENCIES = ["JPY", "PHP", "USD"];

export const DEFAULT_SETTINGS = {
  defaultCurrency: "JPY",
  theme: "light",
  rates: { JPY: 1, USD: 150, PHP: 2.65 },
  incomeCategories: [
    { id: "salary", label: "Salary" },
    { id: "business", label: "Business" },
    { id: "dividends", label: "Dividends" },
    { id: "interest", label: "Interest" },
    { id: "other-income", label: "Other Income" },
  ],
  expenseCategories: [
    { id: "food", label: "Food" },
    { id: "utilities", label: "Utilities" },
    { id: "insurance", label: "Insurance" },
    { id: "transportation", label: "Transportation" },
    { id: "housing", label: "Housing" },
    { id: "healthcare", label: "Healthcare" },
    { id: "shopping", label: "Shopping" },
    { id: "travel", label: "Travel" },
    { id: "entertainment", label: "Entertainment" },
    { id: "other-expense", label: "Other" },
  ],
  assetCategories: [
    { id: "cash", label: "Cash", liability: false, group: "in" },
    { id: "bank", label: "Bank accounts", liability: false, group: "in" },
    { id: "savings", label: "Savings", liability: false, group: "in" },
    { id: "credit-card", label: "Credit cards", liability: true, group: "out" },
    { id: "insurance", label: "Insurance", liability: true, group: "out" },
    { id: "bill", label: "Bill due", liability: true, group: "out" },
    { id: "investments", label: "Investments", liability: false, group: "other" },
    { id: "vehicles", label: "Vehicles", liability: false, group: "other" },
    { id: "real-estate", label: "Real estate", liability: false, group: "other" },
    { id: "personal", label: "Personal assets", liability: false, group: "other" },
    { id: "custom", label: "Custom", liability: false, group: "other" },
  ],
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["assets", "transactions", "goals", "snapshots", "attachments", "settings"]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function all(store) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const request = tx.objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      })
  );
}

function one(store, id) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const request = tx.objectStore(store).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      })
  );
}

function put(store, row) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(row);
        tx.oncomplete = () => resolve(row);
        tx.onerror = () => reject(tx.error);
      })
  );
}

function remove(store, id) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

export const listAssets = () => all("assets");
export const getAsset = (id) => one("assets", id);
export const saveAsset = (row) => put("assets", row);
export async function deleteAsset(id) {
  await remove("assets", id);
  await remove("attachments", `asset:${id}`);
}

export const listTransactions = () => all("transactions");
export const getTransaction = (id) => one("transactions", id);
export const saveTransaction = (row) => put("transactions", row);
export async function deleteTransaction(id) {
  await remove("transactions", id);
  await remove("attachments", `tx:${id}`);
}

export const listGoals = () => all("goals");
export const saveGoal = (row) => put("goals", row);
export const deleteGoal = (id) => remove("goals", id);

export const listSnapshots = () => all("snapshots");
export const saveSnapshot = (row) => put("snapshots", row);

export async function saveAttachment(id, blob, name, mime) {
  return put("attachments", { id, blob, name: name || "file", mime: mime || blob.type || "application/octet-stream" });
}

export async function getAttachment(id) {
  return one("attachments", id);
}

export async function getAttachmentUrl(id) {
  const row = await getAttachment(id);
  return row?.blob ? URL.createObjectURL(row.blob) : null;
}

function mergeCategories(saved, defaults) {
  const list = Array.isArray(saved) && saved.length ? [...saved] : [];
  for (const item of defaults) {
    if (!list.some((row) => row.id === item.id)) list.push(item);
  }
  return list.map((row) => {
    const fallback = defaults.find((item) => item.id === row.id);
    return fallback ? { ...fallback, ...row } : row;
  });
}

export async function getSettings() {
  const row = await one("settings", "app");
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...row,
    rates: { ...DEFAULT_SETTINGS.rates, ...(row.rates || {}) },
    incomeCategories: mergeCategories(row.incomeCategories, DEFAULT_SETTINGS.incomeCategories),
    expenseCategories: mergeCategories(row.expenseCategories, DEFAULT_SETTINGS.expenseCategories),
    assetCategories: DEFAULT_SETTINGS.assetCategories,
  };
}

export async function saveSettings(settings) {
  return put("settings", { id: "app", ...settings });
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

export async function exportAll() {
  const [assets, transactions, goals, snapshots, settings] = await Promise.all([
    listAssets(),
    listTransactions(),
    listGoals(),
    listSnapshots(),
    getSettings(),
  ]);
  const db = await openDb();
  const attachments = await new Promise((resolve, reject) => {
    const tx = db.transaction("attachments", "readonly");
    const request = tx.objectStore("attachments").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  const files = await Promise.all(
    attachments.map(async (row) => ({
      id: row.id,
      name: row.name,
      mime: row.mime,
      dataUrl: await blobToDataUrl(row.blob),
    }))
  );
  return {
    app: "bochog-kakei",
    version: 1,
    exportedAt: new Date().toISOString(),
    assets,
    transactions,
    goals,
    snapshots,
    settings,
    attachments: files,
  };
}

export async function importAll(payload) {
  if (!payload || payload.app !== "bochog-kakei" || !Array.isArray(payload.transactions)) {
    throw new Error("Invalid Bochog Kakei backup");
  }
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const names = ["assets", "transactions", "goals", "snapshots", "attachments", "settings"];
    const tx = db.transaction(names, "readwrite");
    for (const name of names) tx.objectStore(name).clear();
    for (const row of payload.assets || []) tx.objectStore("assets").put(row);
    for (const row of payload.transactions || []) tx.objectStore("transactions").put(row);
    for (const row of payload.goals || []) tx.objectStore("goals").put(row);
    for (const row of payload.snapshots || []) tx.objectStore("snapshots").put(row);
    if (payload.settings) tx.objectStore("settings").put({ id: "app", ...payload.settings });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  for (const file of payload.attachments || []) {
    const blob = await (await fetch(file.dataUrl)).blob();
    await saveAttachment(file.id, blob, file.name, file.mime);
  }
}
