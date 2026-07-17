import { createApp } from '@backstage/frontend-defaults';
import { coreExtensionData } from '@backstage/frontend-plugin-api';
import { UnifiedThemeProvider } from '@backstage/theme';
import appPlugin from '@backstage/plugin-app';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import { shadcnPlugin } from './plugin/shadcnPlugin';
import { shadcnNavModule } from './nav/ShadcnSidebar';
import { ModeSync, shadcnDarkTheme, shadcnLightTheme } from './themes';

/**
 * The default app layout wraps everything in the MUI-based SidebarPage, which
 * reserves space for the classic MUI sidebar drawer. Since the nav is replaced
 * with a shadcn sidebar, the layout is overridden with a plain flex row.
 */
const customizedAppPlugin = appPlugin.withOverrides({
  extensions: [
    appPlugin.getExtension('theme:app/light').override({
      params: {
        theme: {
          id: 'light',
          title: 'Light Theme',
          variant: 'light',
          Provider: ({ children }) => (
            <ModeSync mode="light">
              <UnifiedThemeProvider
                theme={shadcnLightTheme}
                children={children}
              />
            </ModeSync>
          ),
        },
      },
    }),
    appPlugin.getExtension('theme:app/dark').override({
      params: {
        theme: {
          id: 'dark',
          title: 'Dark Theme',
          variant: 'dark',
          Provider: ({ children }) => (
            <ModeSync mode="dark">
              <UnifiedThemeProvider
                theme={shadcnDarkTheme}
                children={children}
              />
            </ModeSync>
          ),
        },
      },
    }),
    appPlugin.getExtension('app/layout').override({
      factory(_originalFactory, { inputs }) {
        return [
          coreExtensionData.reactElement(
            <div className="bg-background text-foreground flex h-screen w-full overflow-hidden">
              {inputs.nav.get(coreExtensionData.reactElement)}
              <div className="min-w-0 flex-1 overflow-y-auto">
                {inputs.content.get(coreExtensionData.reactElement)}
              </div>
            </div>,
          ),
        ];
      },
    }),
  ],
});

const app = createApp({
  features: [
    customizedAppPlugin,
    catalogPlugin,
    userSettingsPlugin,
    shadcnPlugin,
    shadcnNavModule,
  ],
});

export default app.createRoot();
