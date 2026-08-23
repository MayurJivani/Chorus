import { useCallback, useEffect, useRef, useState } from 'react';

interface SongPreviewButtonProps {
  previewUrl: string;
}

export function SongPreviewButton({ previewUrl }: SongPreviewButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        const saved = localStorage.getItem('snippet-volume');
        if (saved != null) audio.volume = parseFloat(saved);
      } catch {}
      audio.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlaying(false);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <span>{playing ? '⏸' : '▶'}</span>
        <span>{playing ? 'Pause' : 'Play preview'}</span>
      </button>
      <audio ref={audioRef} src={previewUrl} preload="none" />
    </>
  );
}
