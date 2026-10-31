import React, { useRef, useState } from 'react';
import { Download, ScanText } from 'lucide-react';
import { useLang } from '../../i18n/useLang';
import {
  destroyPdfJs,
  downloadBlob,
  formatBytes,
  isPdfFile,
  loadPdfJs,
  stripExt,
  yieldFrame,
} from '../../utils/pdfTools';
import { DropZone, ErrorBox, FileChip, PrimaryButton, ProgressBar, formatPdfError } from './shared';

export default function PdfToTxt({ compact = false }: { compact?: boolean }) {
  const { t } = useLang();
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [noTextLayer, setNoTextLayer] = useState(false);
  const [error, setError] = useState('');
  const runId = useRef(0);

  const run = async (f: File) => {
    const id = ++runId.current;
    setError('');
    setText(null);
    setNoTextLayer(false);
    setBusy(true);
    try {
      const doc = await loadPdfJs(f);
      if (id !== runId.current) return;
      setPageCount(doc.numPages);
      setProgress({ done: 0, total: doc.numPages });
      const blocks: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const lines: string[] = [];
        let line = '';
        for (const item of content.items) {
          if (!('str' in item)) continue;
          line += (item as { str: string }).str;
          if ((item as { hasEOL?: boolean }).hasEOL) {
            lines.push(line);
            line = '';
          }
        }
        if (line) lines.push(line);
        blocks.push(`--- 第 ${p} 页 ---\n${lines.join('\n')}`);
        if (id !== runId.current) return;
        setProgress({ done: p, total: doc.numPages });
        await yieldFrame();
      }
      const full = blocks.join('\n\n');
      // 去掉分页标记与空白后一个字都没有 = 没有文字层（多半是扫描件/纯图片 PDF）
      const letterCount = full.replace(/--- 第 \d+ 页 ---/g, '').replace(/\s/g, '').length;
      if (letterCount === 0) {
        setNoTextLayer(true);
      } else {
        setText(full);
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
    void run(f);
  };

  const charCount = text ? text.replace(/\s/g, '').length : 0;

  return (
    <div>
      {!file ? (
        <DropZone compact={compact} testId="drop-txt" accept="application/pdf,.pdf" onFiles={onFiles} title={t('tools.dropPdfTitle')} hint={t('tools.dropPdfTxtHint')} />
      ) : (
        <FileChip
          name={file.name}
          meta={`${pageCount ? t('tools.pageCountShort', { n: pageCount }) : ''}${formatBytes(file.size)}`}
          onRemove={() => {
            runId.current++;
            setFile(null);
            setPageCount(0);
            setText(null);
            setNoTextLayer(false);
            setError('');
          }}
        />
      )}

      {busy && progress && <ProgressBar done={progress.done} total={progress.total} label={t('tools.extractingText')} />}
      {error && <ErrorBox msg={error} />}

      {noTextLayer && (
        <div data-testid="txt-scanned" className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <ScanText size={16} className="mt-0.5 shrink-0" />
          <span>{t('tools.scannedNotice')}</span>
        </div>
      )}

      {text && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-4">
            <PrimaryButton
              testId="txt-download"
              onClick={() => file && downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${stripExt(file.name)}.txt`)}
            >
              <Download size={15} />
              {t('tools.downloadTxt')}
            </PrimaryButton>
            <span data-testid="txt-meta" className="text-xs text-white/55">
              {t('tools.extractedMeta', { n: charCount })}
            </span>
          </div>
          <pre data-testid="txt-preview" className={`mt-3 ${compact ? 'max-h-40' : 'max-h-64'} overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-white/70`}>
            {text.slice(0, 1500)}
            {text.length > 1500 ? `\n${t('tools.previewTruncated')}` : ''}
          </pre>
        </div>
      )}
    </div>
  );
}
