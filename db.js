const DB_NAME = "bochog-plant-care";
const DB_VERSION = 3;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("plants")) {
        db.createObjectStore("plants", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("logs")) {
        const logs = db.createObjectStore("logs", { keyPath: "id" });
        logs.createIndex("plantId", "plantId", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listPlants() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("plants", "readonly");
    const request = tx.objectStore("plants").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getPlant(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("plants", "readonly");
    const request = tx.objectStore("plants").get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function savePlant(plant) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("plants", "readwrite");
    tx.objectStore("plants").put(plant);
    tx.oncomplete = () => resolve(plant);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePlant(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["plants", "photos", "logs"], "readwrite");
    tx.objectStore("plants").delete(id);
    tx.objectStore("photos").delete(id);
    const index = tx.objectStore("logs").index("plantId");
    const range = IDBKeyRange.only(id);
    index.openCursor(range).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePhoto(id, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function copyPhoto(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    const store = tx.objectStore("photos");
    const request = store.get(fromId);
    request.onsuccess = () => {
      const row = request.result;
      if (row?.blob) store.put({ id: toId, blob: row.blob });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPhotoUrl(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const request = tx.objectStore("photos").get(id);
    request.onsuccess = () => {
      const row = request.result;
      resolve(row?.blob ? URL.createObjectURL(row.blob) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function addLog(entry) {
  const row = {
    id: crypto.randomUUID(),
    plantId: entry.plantId,
    type: entry.type,
    date: entry.date,
    createdAt: new Date().toISOString(),
  };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("logs", "readwrite");
    tx.objectStore("logs").put(row);
    tx.oncomplete = () => resolve(row);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listLogs(plantId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("logs", "readonly");
    const request = tx.objectStore("logs").index("plantId").getAll(plantId);
    request.onsuccess = () => {
      const rows = request.result || [];
      rows.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

async function listAllLogs() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("logs", "readonly");
    const request = tx.objectStore("logs").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getConfig() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains("settings")) {
      resolve(null);
      return;
    }
    const tx = db.transaction("settings", "readonly");
    const request = tx.objectStore("settings").get("app");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveConfig(config) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({
      id: "app",
      locations: config.locations,
      plantTypes: config.plantTypes,
      theme: config.theme || "light",
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function exportData() {
  const plants = await listPlants();
  const logs = await listAllLogs();
  const config = await getConfig();
  const db = await openDb();
  const photos = await new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const request = tx.objectStore("photos").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  const encodedPhotos = await Promise.all(
    photos.map(
      (row) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ id: row.id, dataUrl: reader.result });
          reader.readAsDataURL(row.blob);
        })
    )
  );
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    plants,
    photos: encodedPhotos,
    logs,
    config: config
      ? { locations: config.locations, plantTypes: config.plantTypes, theme: config.theme || "light" }
      : null,
  };
}

export async function importData(payload) {
  if (!payload?.plants) throw new Error("Invalid backup file");
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const stores = ["plants", "photos", "logs"];
    const tx = db.transaction(stores, "readwrite");
    tx.objectStore("plants").clear();
    tx.objectStore("photos").clear();
    tx.objectStore("logs").clear();
    for (const plant of payload.plants) tx.objectStore("plants").put(plant);
    for (const log of payload.logs || []) tx.objectStore("logs").put(log);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  for (const photo of payload.photos || []) {
    const blob = await (await fetch(photo.dataUrl)).blob();
    await savePhoto(photo.id, blob);
  }
  if (payload.config?.locations && payload.config?.plantTypes) {
    await saveConfig(payload.config);
  }
}
