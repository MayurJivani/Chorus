import { useRef, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';

const CLICK_MESSAGES = [
  { count: 3, message: 'You really like clicking that vinyl...', type: 'info' as const },
  { count: 5, message: 'Still going? You must really love music.', type: 'info' as const },
  { count: 7, message: 'Fun fact: the Konami code works here.', type: 'info' as const },
  { count: 10, message: 'The vinyl is getting dizzy...', type: 'info' as const },
];

const CRASH_THRESHOLD = 12;

function runNavbarCrash(logoEl: HTMLElement) {
  const header = logoEl.closest('header');
  if (!header) return;

  const nav = header.querySelector('nav');
  if (!nav) return;

  const desktopNav = nav.querySelector<HTMLElement>(
    'div.hidden.sm\\:flex, div[class*="hidden"][class*="sm:flex"]',
  );
  if (!desktopNav) return;

  const navItems = desktopNav.querySelectorAll<HTMLElement>(
    ':scope > a, :scope > div > a, :scope > div > button',
  );
  if (navItems.length === 0) return;

  const logoDisc = logoEl.querySelector<HTMLElement>('span');
  if (!logoDisc) return;

  const logoText = logoEl.querySelector<HTMLElement>(':scope > span:last-child');

  const logoRect = logoDisc.getBoundingClientRect();

  const clone = logoDisc.cloneNode(true) as HTMLElement;
  clone.style.cssText = `
    position: fixed;
    top: ${logoRect.top}px;
    left: ${logoRect.left}px;
    width: ${logoRect.width}px;
    height: ${logoRect.height}px;
    z-index: 9999;
    pointer-events: none;
    border-radius: 50%;
  `;
  document.body.appendChild(clone);
  logoDisc.style.opacity = '0';

  if (logoText) {
    logoText.style.transition = 'all 0.5s ease-out';
    logoText.style.opacity = '0';
    logoText.style.transform = 'translateX(-20px) rotate(-5deg)';
    logoText.style.filter = 'blur(4px)';
  }

  let rotation = 0;
  let speed = 5;
  const spinInterval = setInterval(() => {
    rotation += speed;
    speed = Math.min(speed + 2, 40);
    clone.style.transform = `rotate(${rotation}deg) scale(${1 + speed / 80})`;
  }, 16);

  setTimeout(() => {
    clearInterval(spinInterval);

    const targets: { el: HTMLElement; rect: DOMRect }[] = [];
    navItems.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) {
        targets.push({ el, rect: r });
      }
    });

    targets.sort((a, b) => a.rect.left - b.rect.left);

    let delay = 0;
    const crashDuration = 180;

    targets.forEach(({ el, rect }, i) => {
      setTimeout(() => {
        const cx = rect.left + rect.width / 2 - logoRect.width / 2;
        const cy = rect.top + rect.height / 2 - logoRect.height / 2;

        clone.style.transition = `all ${crashDuration}ms cubic-bezier(0.25, 0.1, 0, 1.4)`;
        clone.style.left = `${cx}px`;
        clone.style.top = `${cy}px`;
        clone.style.transform = `rotate(${rotation + (i + 1) * 360}deg) scale(1.3)`;

        setTimeout(() => {
          const angle = -25 + Math.random() * 50;
          const dist = 20 + Math.random() * 50;
          const fall = 50 + Math.random() * 100;
          el.style.transition = 'all 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)';
          el.style.transform = `translate(${dist}px, ${fall}px) rotate(${angle}deg)`;
          el.style.opacity = '0';
          el.style.filter = 'blur(2px)';

          const container = document.createElement('div');
          container.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:9998;`;
          for (let p = 0; p < 8; p++) {
            const dot = document.createElement('div');
            const a = Math.random() * Math.PI * 2;
            const d = 15 + Math.random() * 35;
            dot.style.cssText = `position:absolute;width:3px;height:3px;background:#a78bfa;border-radius:50%;left:50%;top:50%;box-shadow:0 0 6px #a78bfa;transition:all 0.5s ease-out;`;
            container.appendChild(dot);
            requestAnimationFrame(() => {
              dot.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px)`;
              dot.style.opacity = '0';
            });
          }
          document.body.appendChild(container);
          setTimeout(() => container.remove(), 600);
        }, crashDuration * 0.6);
      }, delay);
      delay += crashDuration + 60;
    });

    setTimeout(() => {
      clone.style.transition = 'all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)';
      clone.style.left = `${logoRect.left}px`;
      clone.style.top = `${logoRect.top}px`;
      clone.style.transform = 'rotate(0deg) scale(1)';

      targets.forEach(({ el }, i) => {
        setTimeout(() => {
          el.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
          el.style.transform = '';
          el.style.opacity = '';
          el.style.filter = '';
        }, i * 50);
      });

      setTimeout(() => {
        clone.remove();
        logoDisc.style.opacity = '';
        if (logoText) {
          logoText.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
          logoText.style.transform = '';
          logoText.style.opacity = '';
          logoText.style.filter = '';
        }
      }, 800);
    }, delay + 300);
  }, 700);
}

export function useLogoClickEasterEgg() {
  const clickCount = useRef(0);
  const lastClick = useRef(0);
  const crashingRef = useRef(false);
  const { toast } = useToast();

  const handleLogoClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      const now = Date.now();
      if (now - lastClick.current > 5000) {
        clickCount.current = 0;
      }
      lastClick.current = now;
      clickCount.current++;

      const msg = CLICK_MESSAGES.find((m) => m.count === clickCount.current);
      if (msg) {
        toast(msg.message, msg.type);
      }

      if (clickCount.current >= CRASH_THRESHOLD && !crashingRef.current) {
        crashingRef.current = true;
        e.preventDefault();
        runNavbarCrash(e.currentTarget);
        setTimeout(() => {
          crashingRef.current = false;
          clickCount.current = 0;
        }, 5000);
      }
    },
    [toast],
  );

  return handleLogoClick;
}
