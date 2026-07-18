import { useEffect, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef, useEntityList } from '@backstage/plugin-catalog-react';

export type FacetValue = { value: string; count: number };

/**
 * Loads the available values for a catalog facet (e.g. `spec.lifecycle` or
 * `metadata.tags`), scoped to the currently selected kind so the options stay
 * relevant. Mirrors what the stock `EntityAutocompletePicker` does internally,
 * but exposes the raw values for rendering with custom controls.
 */
export function useEntityFacet(
  path: string,
  options: { scopeByKind?: boolean } = {},
): {
  values: FacetValue[];
  loading: boolean;
} {
  const { scopeByKind = true } = options;
  const catalogApi = useApi(catalogApiRef);
  const { filters } = useEntityList();
  const kind = scopeByKind ? filters.kind?.value : undefined;
  const [state, setState] = useState<{
    values: FacetValue[];
    loading: boolean;
  }>({ values: [], loading: true });

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true }));
    catalogApi
      .getEntityFacets({ facets: [path], filter: kind ? { kind } : undefined })
      .then(response => {
        if (cancelled) return;
        const values = [...(response.facets[path] ?? [])].sort((a, b) =>
          a.value.localeCompare(b.value),
        );
        setState({ values, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ values: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [catalogApi, path, kind]);

  return state;
}
