import { createDevApp } from '@backstage/dev-utils';
import { hejsanPlugin, HejsanPage } from '../src/plugin';

createDevApp()
  .registerPlugin(hejsanPlugin)
  .addPage({
    element: <HejsanPage />,
    title: 'Root Page',
    path: '/hejsan',
  })
  .render();
