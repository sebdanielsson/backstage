import { ReactNode, useEffect } from 'react';
import {
  createUnifiedTheme,
  palettes,
  UnifiedThemeOptions,
  PageTheme,
} from '@backstage/theme';

const fontFamily = "'Geist Variable', system-ui, sans-serif";

/**
 * A flat page theme replacing the default gradient page headers, using the
 * shadcn tokens for text so it follows the active color scheme.
 */
const flatPageTheme: PageTheme = {
  colors: ['var(--primary)'],
  shape: 'none',
  backgroundImage: 'none',
  fontColor: 'var(--foreground)',
};

const pageTheme = Object.fromEntries(
  [
    'home',
    'documentation',
    'tool',
    'service',
    'website',
    'library',
    'other',
    'app',
    'apis',
  ].map(key => [key, flatPageTheme]),
);

/**
 * Component style overrides applied to both MUI v4 and v5 renders. All values
 * reference the shadcn CSS variables directly, so they automatically follow
 * the preset design and flip with the `.dark` color scheme.
 */
const components: UnifiedThemeOptions['components'] = {
  MuiPaper: {
    styleOverrides: {
      root: {
        backgroundColor: 'var(--card)',
        color: 'var(--card-foreground)',
        backgroundImage: 'none',
      },
      rounded: {
        borderRadius: 'var(--radius-lg)',
      },
      elevation1: {
        boxShadow: 'none',
        border: '1px solid var(--border)',
      },
      elevation2: {
        boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.12)',
        border: '1px solid var(--border)',
      },
      elevation8: {
        boxShadow: '0 8px 24px -4px rgb(0 0 0 / 0.18)',
        border: '1px solid var(--border)',
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 500,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'none',
      },
      contained: {
        boxShadow: 'none',
        '&:hover': {
          boxShadow: 'none',
        },
      },
      outlined: {
        borderColor: 'var(--border)',
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 'var(--radius-sm)',
        fontWeight: 500,
        fontSize: '0.75rem',
        backgroundColor: 'var(--secondary)',
        color: 'var(--secondary-foreground)',
      },
      outlined: {
        borderColor: 'var(--border)',
        backgroundColor: 'transparent',
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: {
        borderBottom: '1px solid var(--border)',
        fontFamily,
      },
      head: {
        color: 'var(--muted-foreground)',
        fontWeight: 500,
        textTransform: 'none',
      },
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: 'var(--radius-md)',
      },
      notchedOutline: {
        borderColor: 'var(--input)',
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 500,
      },
    },
  },
  MuiDivider: {
    styleOverrides: {
      root: {
        backgroundColor: 'var(--border)',
      },
    },
  },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: 'var(--foreground)',
        color: 'var(--background)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.75rem',
      },
    },
  },
  BackstageHeader: {
    styleOverrides: {
      header: {
        backgroundImage: 'none',
        backgroundColor: 'transparent',
        boxShadow: 'none',
        borderBottom: '1px solid var(--border)',
      },
      title: {
        color: 'var(--foreground)',
        fontSize: '1.5rem',
        fontWeight: 600,
        letterSpacing: '-0.025em',
      },
      subtitle: {
        color: 'var(--muted-foreground)',
      },
      type: {
        color: 'var(--muted-foreground)',
      },
    },
  },
  BackstageHeaderLabel: {
    styleOverrides: {
      label: {
        color: 'var(--muted-foreground)',
      },
      value: {
        color: 'var(--foreground)',
      },
    },
  },
  BackstageContentHeader: {
    styleOverrides: {
      title: {
        fontSize: '1.25rem',
        fontWeight: 600,
        letterSpacing: '-0.025em',
      },
    },
  },
  BackstageInfoCard: {
    styleOverrides: {
      header: {
        padding: '16px 20px',
      },
    },
  },
  BackstageTableHeader: {
    styleOverrides: {
      header: {
        textTransform: 'none',
        fontWeight: 500,
        color: 'var(--muted-foreground)',
        borderTop: 'none',
        borderBottom: '1px solid var(--border)',
      },
    },
  },
  BackstageIconLinkVertical: {
    styleOverrides: {
      label: {
        textTransform: 'none',
        fontWeight: 500,
        letterSpacing: 0,
      },
    },
  },
};

/**
 * MUI themes approximating the shadcn preset tokens (the preset palette maps
 * to the Tailwind neutral scale with a blue-700 primary), so that the parts
 * of Backstage that still render through MUI blend in with the shadcn design.
 */
export const shadcnLightTheme = createUnifiedTheme({
  fontFamily,
  palette: {
    ...palettes.light,
    primary: { main: '#1d4ed8' },
    link: '#1d4ed8',
    background: { default: '#ffffff', paper: '#ffffff' },
    text: { primary: '#0a0a0a', secondary: '#737373' },
    divider: '#e5e5e5',
  },
  pageTheme,
  components,
});

export const shadcnDarkTheme = createUnifiedTheme({
  fontFamily,
  palette: {
    ...palettes.dark,
    primary: { main: '#60a5fa' },
    link: '#60a5fa',
    background: { default: '#0a0a0a', paper: '#171717' },
    text: { primary: '#fafafa', secondary: '#a1a1a1' },
    divider: 'rgba(255, 255, 255, 0.1)',
  },
  pageTheme,
  components,
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
