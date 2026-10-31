import React, { useRef, useState } from 'react';
import { Download } from 'lucide-react';
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

/**
 * 长图安全上限（浏览器 canvas 的硬限制附近留余量）：
 * - 单边最大 16384 px（Chrome/Firefox 的 canvas 单边上限即 16384，Safari 更小）
 * - 总面积最大 1.2 亿 px（约 16384×7324；再大会在部分浏览器上画布静默变空白或直接崩溃）
 * 目标倍率 2x，若拼图超过任一上限就按 0.85 逐档降低实际渲染倍率，
 * 并把实际倍率如实显示在界面上，绝不静默降质。
 */
const MAX_SIDE = 16384;
const MAX_PIXELS = 120_000_000;
const TARGET_SCALE = 2;

export default function PdfToLongImage({ compact = false }: { compact?: boolean }) {
  const { t } = useLang();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string; w: number; h: number; scale: number } | null>(null);
  const [error, setError] = useState('');
  const runId = useRef(0);

  /** 按上限策略算实际可用倍率 */
  const fitScale = (sizes: { w: number; h: number }[]): number => {
    let scale = TARGET_SCALE;
    const maxW = Math.max(...sizes.map((s) => s.w));
    const totalH = sizes.reduce((a, s) => a + s.h, 0);
    while (scale > 0.15) {
      const w = maxW * scale;
      const h = totalH * scale;
      if (w <= MAX_SIDE && h <= MAX_SIDE && w * h <= MAX_PIXELS) break;
      scale *= 0.85;
    }
    return scale;
  };

  const run = async (f: File, fmt: 'png' | 'jpg') => {
    const id = ++runId.current;
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setError('');
    setBusy(true);
    try {
      const doc = await loadPdfJs(f);
      if (id !== runId.current) return;
      setPageCount(doc.numPages);
      setProgress({ done: 0, total: doc.numPages });

      // 第一遍只读尺寸，定倍率
      const pages = [];
      const sizes: { w: number; h: number }[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        pages.push(page);
        const v = page.getViewport({ scale: 1 });
        sizes.push({ w: v.width, h: v.height });
      }
      const scale = fitScale(sizes);
      const width = Math.floor(Math.max(...sizes.map((s) => s.w)) * scale);
      const height = Math.floor(sizes.reduce((a, s) => a + s.h, 0) * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器无法创建画布');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      let y = 0;
      for (let i = 0; i < pages.length; i++) {
        const viewport = pages[i].getViewport({ scale });
        const pw = Math.floor(viewport.width);
        const ph = Math.floor(viewport.height);
        const x = Math.floor((width - pw) / 2);
        await pages[i].render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: [1, 0, 0, 1, x, Math.floor(y)],
        }).promise;
        y += ph;
        if (id !== runId.current) return;
        setProgress({ done: i + 1, total: doc.numPages });
        await yieldFrame();
      }
      const blob = await canvasToBlob(canvas, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92);
      canvas.width = 0;
      canvas.height = 0;
      if (id !== runId.current) return;
      setResult({ blob, url: URL.createObjectURL(blob), w: width, h: height, scale });
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
    void run(f, format);
  };

  const reduced = result !== null && result.scale < TARGET_SCALE - 0.001;

  return (
    <div>
      {!file ? (
        <DropZone compact={compact} testId="drop-long" accept="application/pdf,.pdf" onFiles={onFiles} title={t('tools.dropPdfTitle')} hint={t('tools.longDropHint')} />
      ) : (
        <FileChip
          name={file.name}
          meta={`${pageCount ? t('tools.pageCountShort', { n: pageCount }) : ''}${formatBytes(file.size)}`}
          onRemove={() => {
            runId.current++;
            setFile(null);
            setPageCount(0);
            setResult(null);
            setError('');
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented
          label={t('tools.formatLabel')}
          value={format}
          onChange={(v) => {
            setFormat(v);
            if (file && !busy) void run(file, v);
          }}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpg', label: 'JPG' },
          ]}
        />
        {result && !busy && (
          <PrimaryButton
            testId="long-download"
            onClick={() => file && downloadBlob(result.blob, `${stripExt(file.name)}-长图.${format === 'png' ? 'png' : 'jpg'}`)}
          >
            <Download size={15} />
            {t('tools.downloadLong', { size: formatBytes(result.blob.size) })}
          </PrimaryButton>
        )}
      </div>

      {busy && progress && <ProgressBar done={progress.done} total={progress.total} label={t('tools.stitching')} />}
      {error && <ErrorBox msg={error} />}

      {result && (
        <div className="mt-5">
          <p data-testid="long-meta" className="text-xs text-white/55">
            {t('tools.longMeta', { w: result.w, h: result.h, scale: result.scale.toFixed(2) })}
            {reduced && (
              <span className="text-amber-300/90">
                {t('tools.longReduced', { target: TARGET_SCALE, scale: result.scale.toFixed(2) })}
              </span>
            )}
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30 p-3">
            <img data-testid="long-result" src={result.url} alt={t('tools.longPreviewAlt')} className={`mx-auto ${compact ? 'max-h-[240px]' : 'max-h-[480px]'} w-auto object-contain`} />
          </div>
        </div>
      )}
    </div>
  );
}
