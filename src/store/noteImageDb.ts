/**
 * 待办笔记附件的 IndexedDB 小封装（2026-11-20：笔记气泡里的图片/视频/音乐/文件）。
 * - 与 bgImageDb.ts 同口径：附件 Blob 只存在用户自己设备的浏览器里，不发网络请求、不上服务器；
 *   store 里只记 id，附件本体按 id 存在这里；删笔记消息时顺带删附件。
 * - 隐私模式/配额等异常一律静默失败，调用方直接跳过这条附件消息。
 * - 限额按登录方式分档，见 src/store/noteRemote.ts（GitHub 100 MB/4 GB、Gitee 50 MB/400 MB）；
 *   登录了同步时附件改存仓库、不走这里（远端直读、不缓存）。
 */

const DB_NAME = 'ainav-note-images';
const STORE_NAME = 'images';

/** 把附件库升级为持久存储（2026-11-20）：避免磁盘紧张时浏览器把整个 origin 的数据清掉；Chrome 按互动历史静默批准，不弹提示 */
function ensurePersistent() {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* 忽略 */
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** 保存一个笔记附件；成功返回 true */
export async function saveNoteImage(id: string, blob: Blob): Promise<boolean> {
  ensurePersistent();
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, id);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

/** 读取一张笔记图片；没有或读失败返回 null */
export async function loadNoteImage(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as Blob | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/** 删除一张笔记图片 */
export async function deleteNoteImage(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
