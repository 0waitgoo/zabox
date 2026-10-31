/**
 * PDF 文件工具共用底层（第六十一轮）：pdf.js（Apache-2.0）读取/渲染/抽文字，
 * pdf-lib（MIT）拼装/拆合，全部在浏览器本地运行，文件不离开用户设备。
 * worker 用 Vite 标准 ?url 方式引入，生产构建后随产物一起发出。
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocument } from 'pdf-lib';

export type { PDFDocumentProxy };

/** 每页处理后让出一帧，保证大文件时界面不假死 */
export const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/** PDF 报错分类（i18n 批 C）：只返回稳定码 + 原始细节，文案由调用处用 t() 翻译，
 *  不再直接拼中文——调用处见 components/tools/shared.tsx 的 formatPdfError。 */
export type PdfErrorCode = 'password' | 'invalid' | 'encrypted' | 'canvas' | 'convert' | 'failed';

export interface PdfErrorInfo {
  code: PdfErrorCode;
  /** 原始报错细节（多为英文库报错原文），仅 failed 时有值 */
  detail: string;
}

export function pdfErrorInfo(err: unknown): PdfErrorInfo {
  const name = (err as { name?: string } | null)?.name ?? '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (name === 'PasswordException' || /password/i.test(msg)) {
    return { code: 'password', detail: '' };
  }
  if (name === 'InvalidPDFException' || /invalid pdf|not a pdf|header/i.test(msg)) {
    return { code: 'invalid', detail: '' };
  }
  if (/encrypt/i.test(msg)) {
    return { code: 'encrypted', detail: '' };
  }
  if (/无法创建画布|生成图片失败/.test(msg)) {
    return { code: 'canvas', detail: '' };
  }
  if (/图片转换失败/.test(msg)) {
    return { code: 'convert', detail: '' };
  }
  return { code: 'failed', detail: msg };
}

/** 用 pdf.js 打开 PDF（渲染/抽文字用）。失败时抛原始错误，调用方用 pdfErrorInfo 分类后翻译（见 tools/shared.tsx 的 formatPdfError） */
export async function loadPdfJs(file: File | Blob): Promise<PDFDocumentProxy> {
  const [pdfjs, buffer] = await Promise.all([import('pdfjs-dist'), file.arrayBuffer()]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(buffer);
  return pdfjs.getDocument({ data }).promise;
}

/** 释放 pdf.js 文档占用的 worker 资源（v5 起 destroy 挂在 loadingTask 上） */
export function destroyPdfJs(doc: PDFDocumentProxy): void {
  void doc.loadingTask.destroy().catch(() => undefined);
}

/** 用 pdf-lib 打开 PDF（合并/拆分用）；加密文件会抛错 */
export async function loadPdfLib(file: File | Blob): Promise<PDFDocument> {
  const [{ PDFDocument }, buffer] = await Promise.all([import('pdf-lib'), file.arrayBuffer()]);
  return PDFDocument.load(new Uint8Array(buffer));
}

export function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

export function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
}

/** 去掉扩展名，用作导出文件名的基名 */
export function stripExt(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.[^.]+$/, '') || '未命名';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 触发浏览器下载一个 Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('生成图片失败'))), type, quality);
  });
}

/** 页码范围解析失败：抛带稳定 key 的错误，调用处用 t(key, vars) 翻译后显示。 */
export class PageRangeError extends Error {
  key: string;
  vars: Record<string, string | number>;
  constructor(key: string, vars: Record<string, string | number> = {}) {
    super(key);
    this.name = 'PageRangeError';
    this.key = key;
    this.vars = vars;
  }
}

/**
 * 解析页码范围写法（如「1-3,5」），返回 1 起的页码数组（按书写顺序、去重）。
 * 写错时抛 PageRangeError（带稳定 key，调用处翻译）。
 */
export function parsePageRanges(input: string, total: number): number[] {
  const norm = input.replace(/[，、；;]/g, ',').replace(/\s+/g, '');
  if (!norm) throw new PageRangeError('tools.rangeEmpty');
  const out: number[] = [];
  const push = (p: number) => {
    if (p < 1 || p > total) throw new PageRangeError('tools.rangeOutOfBounds', { p, total });
    if (!out.includes(p)) out.push(p);
  };
  for (const part of norm.split(',')) {
    if (!part) continue;
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > b) throw new PageRangeError('tools.rangeReversed', { part });
      for (let p = a; p <= b; p++) push(p);
    } else if (/^\d+$/.test(part)) {
      push(Number(part));
    } else {
      throw new PageRangeError('tools.rangeUnparsed', { part });
    }
  }
  if (!out.length) throw new PageRangeError('tools.rangeNone');
  return out;
}
