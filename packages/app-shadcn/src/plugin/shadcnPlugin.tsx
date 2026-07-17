import {
  createFrontendPlugin,
  createRouteRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { Home } from 'lucide-react';

const homeRouteRef = createRouteRef();

const HomePage = PageBlueprint.make({
  name: 'home',
  params: {
    path: '/',
    title: 'Home',
    icon: <Home />,
    routeRef: homeRouteRef,
    noHeader: true,
    loader: () => import('@/components/HomePage').then(m => <m.HomePage />),
  },
});

export const shadcnPlugin = createFrontendPlugin({
  pluginId: 'shadcn',
  extensions: [HomePage],
});
