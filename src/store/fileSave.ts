/**
 * 数据「保存到本地文件」（第十四轮）
 * - 用户在「数据」菜单里选一次保存文件（File System Access API），之后可把完整数据 JSON
 *   直接写回那个本地文件：点按钮写一次（点击保存），或开自动保存后每次数据变化自动写回。
 * - 文件句柄存在 IndexedDB（ainav-filesave 库），元信息（开关/文件名/上次保存时间）存 localStorage；
 *   数据内容本身不进这个模块，只负责把调用方给的文本写进文件。
 * - 权限：句柄的读写权限可能在浏览器重启后失效（queryPermission 不是 granted）；
 *   自动保存遇到这种情况不静默吞，返回 'denied' 让 UI 提示用户点按钮重新授权（需要用户手势）。
 * - 不支持 File System Access 的浏览器（Safari / Firefox）：supported=false，UI 退化为下载 JSON。
 */

/* ---- File System Access API 的最小类型声明（TS 标准 DOM 库未收录） ---- */
export interface FsWritable {
  write(data: string | Blob | BufferSource): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export interface FsFileHandle {
  kind: 'file';
  name: string;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FsWritable>;
  queryPermission?(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FsFileHandle>;
  }
}

/** 当前浏览器是否支持直接写本地文件（Chrome / Edge 支持，Safari / Firefox 不支持） */
export function fsAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/* ---- 句柄的 IndexedDB 持久化 ---- */
const DB_NAME = 'ainav-filesave';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'data-file';

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

/**
 * 内存兜底：句柄优先存 IndexedDB；个别环境存不进去（如句柄不可克隆）时至少本页会话可用。
 * 真实浏览器的 FileSystemFileHandle 可结构化克隆，走 IDB 分支，刷新/重启后仍能取回。
 */
let memoryHandle: FsFileHandle | null = null;

export async function persistHandle(handle: FsFileHandle): Promise<void> {
  memoryHandle = handle;
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
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

export async function loadPersistedHandle(): Promise<FsFileHandle | null> {
  if (memoryHandle) return memoryHandle;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => {
        db.close();
        const handle = (req.result as FsFileHandle | undefined) ?? null;
        if (handle) memoryHandle = handle;
        resolve(handle);
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

export async function clearPersistedHandle(): Promise<void> {
  memoryHandle = null;
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
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

/* ---- 元信息（localStorage）：自动保存开关 / 文件名 / 上次成功保存时间 ---- */
const META_KEY = 'ainav-filesave-meta-v1';

export interface FileSaveMeta {
  autoSave: boolean;
  fileName: string;
  lastSavedAt: number | null;
}

const DEFAULT_META: FileSaveMeta = { autoSave: false, fileName: '', lastSavedAt: null };

export function loadFileSaveMeta(): FileSaveMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FileSaveMeta>;
      return {
        autoSave: parsed.autoSave === true,
        fileName: typeof parsed.fileName === 'string' ? parsed.fileName : '',
        lastSavedAt: typeof parsed.lastSavedAt === 'number' ? parsed.lastSavedAt : null,
      };
    }
  } catch {
    // 损坏时回落默认
  }
  return { ...DEFAULT_META };
}

export function saveFileSaveMeta(meta: FileSaveMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // 静默失败，不阻断使用
  }
}

/* ---- 选择 / 写入 ---- */

/** 弹系统保存对话框让用户选（或新建）保存文件；用户取消返回 null */
export async function pickDataFile(description = 'JSON 数据文件'): Promise<FsFileHandle | null> {
  if (!fsAccessSupported()) return null;
  try {
    const handle = await window.showSaveFilePicker!({
      suggestedName: 'ainav-data.json',
      types: [{ description, accept: { 'application/json': ['.json'] } }],
    });
    return handle ?? null;
  } catch {
    // 用户取消（AbortError）或环境异常，一律当作没选
    return null;
  }
}

export type WriteResult = 'ok' | 'denied' | 'error';

/**
 * 把文本写进句柄指向的文件（整文件覆盖）。
 * - request=true 时允许调用 requestPermission 争取授权（只能在用户手势里调，自动保存传 false）；
 * - 权限不足返回 'denied'（UI 据此提示重新授权），其他异常返回 'error'，不抛错、不静默吞。
 */
export async function writeToFile(handle: FsFileHandle, text: string, request: boolean): Promise<WriteResult> {
  try {
    let perm: PermissionState = 'granted';
    if (typeof handle.queryPermission === 'function') {
      perm = await handle.queryPermission({ mode: 'readwrite' });
    }
    if (perm !== 'granted') {
      if (request && typeof handle.requestPermission === 'function') {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (perm !== 'granted') return 'denied';
    }
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (e) {
      try {
        await writable.abort();
      } catch {
        // 忽略 abort 失败
      }
      throw e;
    }
    return 'ok';
  } catch (e) {
    // createWritable 在权限被收回时抛 NotAllowedError，归类为 denied 让 UI 给出可恢复入口
    if (e instanceof DOMException && e.name === 'NotAllowedError') return 'denied';
    return 'error';
  }
}

/** 上次保存时间的展示文案，如「14:02:31」 */
export function formatSavedTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
