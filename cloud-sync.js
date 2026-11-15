import {
  changePassword,
  clearSyncSession,
  isSyncEnabled,
  loadSyncConfig,
  login,
  saveSyncConfig,
  suggestedServerUrl,
  syncNow,
} from "./sync-client.js";
import {
  deleteAsset,
  deleteGoal,
  deleteTransaction,
  getSettings,
  listAssets,
  listGoals,
  listTransactions,
  saveAsset,
  saveGoal,
  saveSettings,
  saveTransaction,
} from "./db.js";

const TOMBSTONE_KEY = "bochog-kakei-tombstones";

function readTombstones() {
  try {
    return JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeTombstones(rows) {
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(rows.slice(-500)));
}

export function rememberDelete(store, id) {
  const rows = readTombstones().filter((row) => !(row.store === store && row.id === id));
  rows.push({ store, id, updatedAt: new Date().toISOString() });
  writeTombstones(rows);
}

export {
  changePassword,
  clearSyncSession,
  isSyncEnabled,
  loadSyncConfig,
  login,
  saveSyncConfig,
  suggestedServerUrl,
};

export async function runKakeiSync() {
  return syncNow("kakei", {
    stores: ["assets", "transactions", "goals", "settings"],
    list: async (store) => {
      if (store === "assets") return listAssets();
      if (store === "transactions") return listTransactions();
      if (store === "goals") return listGoals();
      if (store === "settings") {
        const settings = await getSettings();
        return [{ id: "app", ...settings, updatedAt: settings.updatedAt || new Date(0).toISOString() }];
      }
      return [];
    },
    put: async (store, row) => {
      if (store === "assets") return saveAsset(row);
      if (store === "transactions") return saveTransaction(row);
      if (store === "goals") return saveGoal(row);
      if (store === "settings") return saveSettings({ ...row, id: "app" });
    },
    remove: async (store, id) => {
      if (store === "assets") return deleteAsset(id);
      if (store === "transactions") return deleteTransaction(id);
      if (store === "goals") return deleteGoal(id);
    },
    deletedSince: async (since) => readTombstones().filter((row) => !since || row.updatedAt > since),
  });
}
