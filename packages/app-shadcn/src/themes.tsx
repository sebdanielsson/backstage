import { ReactNode, useEffect } from 'react';
import { createUnifiedTheme, palettes } from '@backstage/theme';

const fontFamily = "'Geist Variable', system-ui, sans-serif";

/**
 * MUI themes approximating the shadcn preset tokens, so that the parts of
 * Backstage that still render through MUI blend in with the shadcn design.
 */
export const shadcnLightTheme = createUnifiedTheme({
  fontFamily,
  palette: {
    ...palettes.light,
    primary: { main: '#1d4ed8' },
    link: '#1d4ed8',
    background: { default: '#ffffff', paper: '#ffffff' },
  },
});

export const shadcnDarkTheme = createUnifiedTheme({
  fontFamily,
  palette: {
    ...palettes.dark,
    primary: { main: '#60a5fa' },
    link: '#60a5fa',
    background: { default: '#0a0a0a', paper: '#1b1b1b' },
  },
});

/**
 * Keeps the shadcn (`.dark` class) and Backstage UI (`data-theme-mode`)
 * color-scheme switches in sync with the active Backstage app theme.
 */
export function ModeSync({
  mode,
  children,
}: {
  mode: 'light' | 'dark';
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.setAttribute('data-theme-mode', mode);
  }, [mode]);
  return <>{children}</>;
}
