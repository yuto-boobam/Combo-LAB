// src/utils/fileHandleStore.ts
// 「上書き保存」で選んだFileSystemFileHandleをIndexedDBに保存し、
// ページのリロードを跨いでも同じファイルへの書き込みを続けられるようにする。

const DB_NAME = 'rooted-file-handles';
const STORE_NAME = 'projectFileHandles';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getStoredFileHandle(
  projectId: string,
): Promise<FileSystemFileHandle | null> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(projectId);

    request.onsuccess = () =>
      resolve((request.result as FileSystemFileHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function setStoredFileHandle(
  projectId: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
