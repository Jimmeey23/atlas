const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("floor-sources", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("snapshots", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function readSnapshot(key: string): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("snapshots", "readonly");
    const req = tx.objectStore("snapshots").get(key);
    req.onsuccess = () => {
      resolve(req.result);
      db.close();
    };
    req.onerror = () => {
      reject(req.error);
      db.close();
    };
  });
}
export async function writeSnapshot(value: unknown) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put(value);
    tx.oncomplete = () => {
      resolve();
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
  });
}
