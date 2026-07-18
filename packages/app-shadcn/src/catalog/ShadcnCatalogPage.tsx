import { useEffect, useRef } from 'react';
import {
  EntityKindFilter,
  EntityListProvider,
  EntityUserFilter,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import { CatalogFilters } from './CatalogFilters';
import { CatalogList } from './CatalogList';

/**
 * Seeds sensible default filters on first mount (kind=component, personal=all)
 * unless they were already restored from the URL query string, so the list
 * shows data immediately rather than waiting for a filter selection.
 */
function EntityListSeed() {
  const { filters, queryParameters, updateFilters } = useEntityList();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const updates: Parameters<typeof updateFilters>[0] = {};
    if (!filters.kind && !queryParameters.kind) {
      updates.kind = new EntityKindFilter('component', 'Component');
    }
    if (!filters.user && !queryParameters.user) {
      updates.user = EntityUserFilter.all();
    }
    if (Object.keys(updates).length) {
      updateFilters(updates);
    }
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function ShadcnCatalogPage() {
  return (
    <EntityListProvider pagination={{ mode: 'cursor', limit: 20 }}>
      <EntityListSeed />
      <main className="min-h-full flex-1 bg-background text-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 p-8">
          <header>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Catalog
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse the components, services, and resources in your
              organization.
            </p>
          </header>
          <div className="flex gap-8">
            <CatalogFilters />
            <CatalogList />
          </div>
        </div>
      </main>
    </EntityListProvider>
  );
}
