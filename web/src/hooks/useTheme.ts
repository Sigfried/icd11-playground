import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const LS_KEY = 'icd11-theme';

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(LS_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return getSystemTheme();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Listen for OS preference changes when no explicit preference stored
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    function onChange() {
      if (!localStorage.getItem(LS_KEY)) {
        const t = mq.matches ? 'light' : 'dark';
        setTheme(t);
        applyTheme(t);
      }
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(LS_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
