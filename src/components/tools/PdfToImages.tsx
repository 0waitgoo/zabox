import React, { useEffect, useRef, useState } from 'react';
import { Download, Archive } from 'lucide-react';
import JSZip from 'jszip';
import { useLang } from '../../i18n/useLang';
import {
  canvasToBlob,
  destroyPdfJs,
  downloadBlob,
  formatBytes,
  isPdfFile,
  loadPdfJs,
  stripExt,
  yieldFrame,
} from '../../utils/pdfTools';
import { DropZone, ErrorBox, FileChip, PrimaryButton, ProgressBar, Segmented, formatPdfError } from './shared';

interface PageImage {
  page: number;
  blob: Blob;
  url: string;
  w: number;
  h: number;
}

export default function PdfToImages({ compact = false }: { compact?: boolean }) {
  const { t } = useLang();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<PageImage[]>([]);
  const [error, setError] = useState('');
  const [zipping, setZipping] = useState(false);
  const runId = useRef(0);

  const clearResults = () => {
    setResults((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url));
      return [];
    });
  };

  const run = async (f: File, fmt: 'png' | 'jpg', sc: number) => {
    const id = ++runId.current;
    clearResults();
    setError('');
    setBusy(true);
    try {
      const doc = await loadPdfJs(f);
      if (id !== runId.current) return;
      setPageCount(doc.numPages);
      setProgress({ done: 0, total: doc.numPages });
      const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      const out: PageImage[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: sc });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('浏览器无法创建画布');
        if (fmt === 'jpg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const blob = await canvasToBlob(canvas, mime, 0.92);
        canvas.width = 0;
        canvas.height = 0;
        if (id !== runId.current) return;
        out.push({ page: p, blob, url: URL.createObjectURL(blob), w: Math.floor(viewport.width), h: Math.floor(viewport.height) });
        setResults([...out]);
        setProgress({ done: p, total: doc.numPages });
        await yieldFrame();
      }
      destroyPdfJs(doc);
    } catch (e) {
      if (id === runId.current) setError(formatPdfError(t, e));
    } finally {
      if (id === runId.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const onFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (!isPdfFile(f)) {
      setError(t('tools.notPdf'));
      return;
    }
    setFile(f);
    void run(f, format, scale);
  };

  // 选项变化后，若已有文件则按新设置重新生成
  useEffect(() => {
    if (file && !busy) void run(file, format, scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, scale]);

  useEffect(() => () => runId.current++, []);

  const ext = format === 'png' ? 'png' : 'jpg';
  const downloadOne = (r: PageImage) => {
    if (!file) return;
    downloadBlob(r.blob, `${stripExt(file.name)}-第${r.page}页.${ext}`);
  };

  const downloadZip = async () => {
    if (!file || results.length === 0 || zipping) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const base = stripExt(file.name);
      const pad = String(results.length).length;
      for (const r of results) {
        zip.file(`${base}-第${String(r.page).padStart(pad, '0')}页.${ext}`, r.blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${base}-图片.zip`);
    } catch (e) {
      setError(formatPdfError(t, e));
    } finally {
      setZipping(false);
    }
  };

  return (
    <div>
      {!file ? (
        <DropZone compact={compact} testId="drop-images" accept="application/pdf,.pdf" onFiles={onFiles} title={t('tools.dropPdfTitle')} hint={t('tools.imagesDropHint')} />
      ) : (
        <FileChip
          name={file.name}
          meta={`${pageCount ? t('tools.pageCountShort', { n: pageCount }) : ''}${formatBytes(file.size)}`}
          onRemove={() => {
            runId.current++;
            clearResults();
            setFile(null);
            setPageCount(0);
            setError('');
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented
          label={t('tools.formatLabel')}
          value={format}
          onChange={(v) => setFormat(v)}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpg', label: 'JPG' },
          ]}
        />
        <Segmented
          label={t('tools.clarityLabel')}
          value={scale}
          onChange={(v) => setScale(v)}
          options={[
            { value: 1, label: '1x' },
            { value: 2, label: '2x' },
            { value: 3, label: '3x' },
          ]}
        />
        {results.length > 0 && !busy && (
          <PrimaryButton testId="images-zip" onClick={downloadZip} disabled={zipping}>
            <Archive size={15} />
            {zipping ? t('tools.zipping') : t('tools.zipAll', { n: results.length })}
          </PrimaryButton>
        )}
      </div>

      {busy && progress && <ProgressBar done={progress.done} total={progress.total} label={t('tools.rendering')} />}
      {error && <ErrorBox msg={error} />}

      {results.length > 0 && (
        <div data-testid="images-results" className={`mt-5 grid grid-cols-2 gap-3 ${compact ? 'sm:grid-cols-3' : 'sm:grid-cols-3 lg:grid-cols-4'}`}>
          {results.map((r) => (
            <div key={r.page} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              <img src={r.url} alt={t('tools.pageLabel', { n: r.page })} className={`${compact ? 'h-28' : 'h-40'} w-full object-contain bg-black/30`} />
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-white/55">
                  {t('tools.imgPageMeta', { n: r.page, w: r.w, h: r.h })}
                </span>
                <button
                  onClick={() => downloadOne(r)}
                  data-testid={`images-download-${r.page}`}
                  className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
                >
                  <Download size={13} />
                  {t('tools.download')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
