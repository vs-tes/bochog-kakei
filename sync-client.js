/** Shared multi-device sync client for Bochog apps. */

const STORAGE_KEY = "bochog-sync";
export const DEFAULT_SYNC_SERVER = "https://140.238.58.1";
const FETCH_TIMEOUT_MS = 20000;

export function loadSyncConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveSyncConfig(partial) {
  const next = { ...loadSyncConfig(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearSyncSession() {
  const cfg = loadSyncConfig();
  delete cfg.token;
  delete cfg.username;
  delete cfg.lastPullAt;
  cfg.enabled = false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function suggestedServerUrl() {
  const cfg = loadSyncConfig();
  if (cfg.serverUrl) return cfg.serverUrl;
  try {
    if (typeof location !== "undefined" && location.origin === DEFAULT_SYNC_SERVER) return "";
  } catch {
    /* ignore */
  }
  return DEFAULT_SYNC_SERVER;
}

function apiBase() {
  const cfg = loadSyncConfig();
  if (cfg.serverUrl) return cfg.serverUrl.replace(/\/$/, "");
  try {
    if (typeof location !== "undefined" && /^https?:/.test(location.origin)) {
      // Same-origin when hosted on the Oracle box; otherwise default to it.
      if (location.origin === DEFAULT_SYNC_SERVER) return "";
      return DEFAULT_SYNC_SERVER;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SYNC_SERVER;
}

async function api(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const cfg = loadSyncConfig();
  const opts = {
    method,
    headers: { ...headers },
  };
  if (cfg.token) opts.headers.Authorization = `Bearer ${cfg.token}`;
  if (body !== undefined && !raw) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (raw) {
    opts.body = body;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  opts.signal = ctrl.signal;
  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, opts);
  } catch (err) {
    const timedOut = err?.name === "AbortError";
    throw new Error(
      timedOut
        ? `Sync timed out talking to ${apiBase() || "the server"}. Check the connection and try Sync now.`
        : `Could not reach the sync server (${apiBase() || "this site"}). Open https://140.238.58.1/kakei/ or https://140.238.58.1/plant-care/ and try again. ${err.message || ""}`.trim()
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).error || "";
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  return res.json();
}

export async function login(username, password, serverUrl = "") {
  const resolved = (serverUrl || suggestedServerUrl() || "").replace(/\/$/, "");
  if (resolved) saveSyncConfig({ serverUrl: resolved });
  else if (!loadSyncConfig().serverUrl && suggestedServerUrl()) {
    saveSyncConfig({ serverUrl: suggestedServerUrl() });
  }
  const data = await api("/api/login", {
    method: "POST",
    body: { username, password },
  });
  saveSyncConfig({
    token: data.token,
    username: data.username,
    enabled: true,
  });
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters");
  }
  const data = await api("/api/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
  if (data?.token) {
    saveSyncConfig({ token: data.token, enabled: true });
  }
  return data;
}

export function isSyncEnabled() {
  const cfg = loadSyncConfig();
  return Boolean(cfg.enabled && cfg.token);
}

function newer(a, b) {
  return String(a || "") > String(b || "");
}

/**
 * Merge server records into local IndexedDB using last-write-wins on updatedAt.
 * adapters: {
 *   list(store): Promise<row[]>,
 *   put(store, row): Promise<void>,
 *   remove(store, id): Promise<void>,
 *   listPhotoMeta?: () => Promise<{id, updatedAt}[]>,
 *   putPhoto?: (id, blob, updatedAt) => Promise<void>,
 *   removePhoto?: (id) => Promise<void>,
 * }
 */
export async function syncNow(app, adapters) {
  if (!isSyncEnabled()) throw new Error("Sync is not signed in");
  const cfg = loadSyncConfig();
  const sinceKey = `lastPullAt:${app}`;
  const since = cfg[sinceKey] || "";

  const remote = await api(`/api/${app}/pull?since=${encodeURIComponent(since)}`);
  let applied = 0;

  for (const [store, items] of Object.entries(remote.records || {})) {
    const localRows = await adapters.list(store);
    const localMap = new Map(localRows.map((row) => [String(row.id), row]));
    for (const item of items) {
      const local = localMap.get(String(item.id));
      if (item.deleted) {
        if (!local || !newer(local.updatedAt, item.updatedAt)) {
          await adapters.remove(store, item.id);
          applied += 1;
        }
        continue;
      }
      if (!local || newer(item.updatedAt, local.updatedAt)) {
        await adapters.put(store, { ...item.doc, id: item.id, updatedAt: item.updatedAt });
        applied += 1;
      }
    }
  }

  if (adapters.putPhoto && remote.photos?.length) {
    for (const photo of remote.photos) {
      if (photo.deleted) {
        if (adapters.removePhoto) await adapters.removePhoto(photo.id);
        applied += 1;
        continue;
      }
      const res = await api(`/api/${app}/photos/${encodeURIComponent(photo.id)}`, { raw: true });
      const blob = await res.blob();
      await adapters.putPhoto(photo.id, blob, photo.updatedAt);
      applied += 1;
    }
  }

  const pushRecords = {};
  for (const store of adapters.stores) {
    const rows = await adapters.list(store);
    pushRecords[store] = rows.map((row) => ({
      id: row.id,
      updatedAt: row.updatedAt || new Date().toISOString(),
      deleted: false,
      doc: row,
    }));
  }
  if (adapters.deletedSince) {
    const deleted = await adapters.deletedSince(since);
    for (const item of deleted) {
      pushRecords[item.store] = pushRecords[item.store] || [];
      pushRecords[item.store].push({
        id: item.id,
        updatedAt: item.updatedAt,
        deleted: true,
        doc: null,
      });
    }
  }

  const pushResult = await api(`/api/${app}/push`, {
    method: "POST",
    body: { records: pushRecords },
  });

  if (adapters.listPhotoMeta && adapters.readPhoto) {
    const photos = await adapters.listPhotoMeta();
    for (const photo of photos) {
      const blob = await adapters.readPhoto(photo.id);
      if (!blob) continue;
      await api(`/api/${app}/photos/${encodeURIComponent(photo.id)}`, {
        method: "PUT",
        raw: true,
        body: blob,
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "X-Updated-At": photo.updatedAt || new Date().toISOString(),
        },
      });
    }
  }

  saveSyncConfig({
    [sinceKey]: remote.serverTime,
    lastSyncAt: new Date().toISOString(),
    lastSyncApp: app,
  });

  return { applied, pushResult, serverTime: remote.serverTime };
}
