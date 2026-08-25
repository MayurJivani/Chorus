import { useRef, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';

const CLICK_MESSAGES = [
  { count: 5, message: '🎵 You really like clicking that vinyl...', type: 'info' as const },
  { count: 10, message: '🎶 Still going? You must really love music!', type: 'info' as const },
  {
    count: 15,
    message: '🔥 15 clicks! You unlocked... nothing. But nice dedication.',
    type: 'success' as const,
  },
  {
    count: 20,
    message: '💎 20 clicks! Fun fact: the Konami code works here.',
    type: 'success' as const,
  },
  {
    count: 30,
    message: '🏆 30 clicks! You are now officially a vinyl enthusiast.',
    type: 'success' as const,
  },
  {
    count: 50,
    message: '👑 50 clicks! Legendary persistence. We salute you.',
    type: 'success' as const,
  },
];

export function useLogoClickEasterEgg() {
  const clickCount = useRef(0);
  const lastClick = useRef(0);
  const { toast } = useToast();

  const handleLogoClick = useCallback(() => {
    const now = Date.now();
    if (now - lastClick.current > 3000) {
      clickCount.current = 0;
    }
    lastClick.current = now;
    clickCount.current++;

    const msg = CLICK_MESSAGES.find((m) => m.count === clickCount.current);
    if (msg) {
      toast(msg.message, msg.type);
    }
  }, [toast]);

  return handleLogoClick;
}
