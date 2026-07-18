import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import type {
  NavContentNavItem,
  NavContentNavItems,
} from '@backstage/plugin-app-react';
import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { appThemeApiRef, useApi } from '@backstage/core-plugin-api';
import { Moon, Sparkles, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function ThemeToggle() {
  const appThemeApi = useApi(appThemeApiRef);
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  const toggle = () => {
    const next = !dark;
    // The theme Providers in themes.tsx sync the `.dark` class and
    // `data-theme-mode` attribute whenever the active app theme changes.
    appThemeApi.setActiveThemeId(next ? 'dark' : 'light');
    setDark(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onPress={toggle}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function SidebarNavItem(item: NavContentNavItem) {
  return (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
        )
      }
    >
      <span className="[&>svg]:size-4 flex size-4 items-center justify-center">
        {item.icon}
      </span>
      {item.title}
    </NavLink>
  );
}

function ShadcnSidebar({ navItems }: { navItems: NavContentNavItems }) {
  const nav = navItems.withComponent(SidebarNavItem);

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-60 shrink-0 flex-col border-r">
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
          <Sparkles className="size-4" />
        </span>
        <span className="text-base font-semibold tracking-tight">
          Backstage
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
        <span className="text-sidebar-foreground/50 px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider">
          Platform
        </span>
        {nav.take('page:shadcn')}
        {nav.take('page:catalog')}
        {nav.take('page:search')}
        {nav.rest({ sortBy: 'title' })}
      </nav>
      <div className="border-sidebar-border flex items-center justify-between gap-2 border-t px-2 py-2">
        <div className="flex-1">{nav.take('page:user-settings')}</div>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export const shadcnNavModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    NavContentBlueprint.make({
      params: {
        component: props => <ShadcnSidebar navItems={props.navItems} />,
      },
    }),
  ],
});
