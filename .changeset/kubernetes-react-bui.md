---
'@backstage/plugin-kubernetes-react': patch
---

The Kubernetes resource views now use Backstage UI. Resource rows are Backstage UI accordions, with the button that opens the resource drawer placed next to the expand trigger rather than inside it. Namespace and image labels are badges, and the drawer contents, pod cards, error and event lists, and dialog contents use Backstage UI components. The resource drawers, the dialogs themselves and the rollout steps still use Material UI. The package no longer depends on `@material-ui/icons` and `@material-ui/lab`.
