import { useEffect, useRef, useCallback } from 'react';

export function SecretDJMode() {
  const seqRef = useRef('');
  const activeRef = useRef(false);

  const activate = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;

    const style = document.createElement('style');
    style.id = 'dj-mode-style';
    style.textContent = `
      @keyframes dj-bounce {
        0%, 100% { transform: scale(1) rotate(0deg); }
        25% { transform: scale(1.02) rotate(-0.5deg); }
        50% { transform: scale(0.98) rotate(0.5deg); }
        75% { transform: scale(1.01) rotate(-0.3deg); }
      }
      .dj-mode { overflow: hidden !important; }
      .dj-mode main > * {
        animation: dj-bounce 0.6s ease-in-out infinite !important;
      }
      .dj-mode main {
        animation: dj-bounce 0.8s ease-in-out infinite !important;
        animation-delay: 0.1s !important;
        overflow: hidden !important;
      }
      .dj-mode header {
        background: linear-gradient(90deg,
          rgba(139,92,246,0.15) 0%,
          rgba(6,182,212,0.15) 25%,
          rgba(236,72,153,0.15) 50%,
          rgba(34,197,94,0.15) 75%,
          rgba(139,92,246,0.15) 100%) !important;
        background-size: 200% 100% !important;
        animation: dj-header-slide 2s linear infinite !important;
      }
      @keyframes dj-header-slide {
        from { background-position: 0% 0%; }
        to { background-position: 200% 0%; }
      }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('dj-mode');

    setTimeout(() => {
      document.documentElement.classList.remove('dj-mode');
      style.remove();
      activeRef.current = false;
    }, 5000);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      seqRef.current += e.key.toLowerCase();
      if (seqRef.current.length > 10) {
        seqRef.current = seqRef.current.slice(-10);
      }
      if (seqRef.current.endsWith('dj')) {
        seqRef.current = '';
        activate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activate]);

  return null;
}
