import { Pin, PinOff } from 'lucide-react';

export default function PinButton({ pinned, busy, light, onToggle }: {
  pinned: boolean;
  busy: boolean;
  light: boolean;
  onToggle: () => void;
}) {
  const label = pinned ? '取消置顶' : '窗口置顶';
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={pinned}
      disabled={busy} onClick={onToggle}
      className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
        pinned ? (light ? 'bg-indigo-500/15 text-indigo-600 hover:bg-indigo-500/25' : 'bg-indigo-500/25 text-indigo-300 hover:bg-indigo-500/40')
          : light ? 'text-zinc-600 hover:bg-black/10' : 'text-white/70 hover:bg-white/10'
      }`}>
      {pinned ? <Pin size={14} /> : <PinOff size={14} />}
    </button>
  );
}
