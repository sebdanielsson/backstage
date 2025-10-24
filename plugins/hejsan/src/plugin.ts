import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const hejsanPlugin = createPlugin({
  id: 'hejsan',
  routes: {
    root: rootRouteRef,
  },
});

export const HejsanPage = hejsanPlugin.provide(
  createRoutableExtension({
    name: 'HejsanPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
