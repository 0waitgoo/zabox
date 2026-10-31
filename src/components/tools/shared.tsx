import React, { useRef, useState } from 'react';
import { Upload, TriangleAlert, LoaderCircle } from 'lucide-react';
import { useLang } from '../../i18n/useLang';
import { pdfErrorInfo, type PdfErrorCode } from '../../utils/pdfTools';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const PDF_ERROR_KEYS: Record<PdfErrorCode, string> = {
  password: 'tools.pdfErrPassword',
  invalid: 'tools.pdfErrInvalid',
  encrypted: 'tools.pdfErrEncrypted',
  canvas: 'tools.pdfErrCanvas',
  convert: 'tools.imgConvertFailed',
  failed: 'tools.pdfErrFailed',
};

/** pdfTools 报错码 → 用户可见文案（调用处传当前语言的 t，util 层不直接拼中文） */
export function formatPdfError(t: TFn, err: unknown): string {
  const info = pdfErrorInfo(err);
  if (info.code === 'failed') {
    return t(PDF_ERROR_KEYS.failed, { detail: info.detail || t('tools.unknownError') });
  }
  return t(PDF_ERROR_KEYS[info.code]);
}

/** 拖拽投放区 + 点击选择，6 个工具共用。
 * compact（第八十六轮）：主页组件工作区内的紧凑形态——只收投放区内边距，
 * 选文件/拖拽/校验逻辑与页面形态逐项一致 */
export function DropZone({
  accept,
  multiple = false,
  onFiles,
  title,
  hint,
  testId,
  compact = false,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title: string;
  hint: string;
  testId: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCount = useRef(0);

  const pick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      data-testid={testId}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        dragCount.current += 1;
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCount.current -= 1;
        if (dragCount.current <= 0) setDragging(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragCount.current = 0;
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
      className={`cursor-pointer rounded-2xl border-2 border-dashed text-center transition-colors ${
        compact ? 'px-4 py-5' : 'px-6 py-10'
      } ${
        dragging ? 'border-indigo-400/70 bg-indigo-500/10' : 'border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        data-testid={`${testId}-input`}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <Upload size={compact ? 22 : 28} className="mx-auto text-white/40" />
      <p className={`${compact ? 'mt-2' : 'mt-3'} text-sm font-medium text-white/85`}>{title}</p>
      <p className="mt-1 text-xs text-white/45">{hint}</p>
    </div>
  );
}

/** 页级进度条 */
export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const { t } = useLang();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div data-testid="tool-progress" className="mt-4">
      <div className="flex items-center gap-2 text-xs text-white/55">
        <LoaderCircle size={13} className="animate-spin shrink-0" />
        <span>{t('tools.progressPages', { label: label ?? t('tools.processing'), done, total, pct })}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-400 transition-all duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ErrorBox({ msg }: { msg: string }) {
  return (
    <div data-testid="tool-error" className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** 分段选择器（格式 / 倍率等小选项） */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs text-white/50 shrink-0">{label}</span>
      <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              value === o.value ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 已选单文件的信息条（文件名 + 页数/大小 + 移除） */
export function FileChip({
  name,
  meta,
  onRemove,
}: {
  name: string;
  meta: string;
  onRemove: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/90">{name}</p>
        <p className="text-xs text-white/45">{meta}</p>
      </div>
      <button onClick={onRemove} className="text-xs text-white/45 hover:text-white shrink-0 px-1">
        {t('tools.remove')}
      </button>
    </div>
  );
}
