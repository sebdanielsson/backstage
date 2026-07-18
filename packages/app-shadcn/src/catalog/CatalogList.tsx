import { RELATION_OWNED_BY, RELATION_PART_OF } from '@backstage/catalog-model';
import {
  EntityRefLink,
  EntityRefLinks,
  getEntityRelations,
  useEntityList,
} from '@backstage/plugin-catalog-react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const COLUMNS = ['Name', 'System', 'Owner', 'Type', 'Lifecycle', 'Tags'];

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

export function CatalogList() {
  const { entities, loading, error, pageInfo, totalItems, paginationMode } =
    useEntityList();

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-base font-semibold">
          Components
          {totalItems !== undefined && (
            <span className="ml-1.5 text-muted-foreground">({totalItems})</span>
          )}
        </h2>
      </div>

      <div className="overflow-x-auto">
        <Table aria-label="Catalog entities">
          <TableHeader>
            {COLUMNS.map((col, i) => (
              <TableHead key={col} isRowHeader={i === 0}>
                {col}
              </TableHead>
            ))}
          </TableHeader>
          <TableBody>
            {loading
              ? [0, 1, 2, 3, 4].map(i => (
                  <TableRow key={`skeleton-${i}`} id={`skeleton-${i}`}>
                    {COLUMNS.map(col => (
                      <TableCell key={col}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : entities.map(entity => {
                  const ref = `${entity.kind}:${
                    entity.metadata.namespace ?? 'default'
                  }/${entity.metadata.name}`;
                  const owners = getEntityRelations(entity, RELATION_OWNED_BY);
                  const systems = getEntityRelations(entity, RELATION_PART_OF, {
                    kind: 'system',
                  });
                  const tags = entity.metadata.tags ?? [];
                  return (
                    <TableRow key={ref} id={ref}>
                      <TableCell className="font-medium">
                        <span className="block max-w-[240px] truncate">
                          <EntityRefLink
                            entityRef={entity}
                            defaultKind="Component"
                          />
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {systems.length ? (
                          <EntityRefLinks
                            entityRefs={systems}
                            defaultKind="system"
                          />
                        ) : (
                          <Dash />
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {owners.length ? (
                          <EntityRefLinks
                            entityRefs={owners}
                            defaultKind="group"
                          />
                        ) : (
                          <Dash />
                        )}
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {entity.spec?.type ? String(entity.spec.type) : '—'}
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {entity.spec?.lifecycle
                          ? String(entity.spec.lifecycle)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>

      {!loading && !error && entities.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Inbox className="size-8" />
          <p className="text-sm">No entities match the current filters.</p>
        </div>
      )}

      {error && (
        <div className="px-5 py-16 text-center text-sm text-destructive">
          Failed to load entities: {error.message}
        </div>
      )}

      {paginationMode === 'cursor' && (pageInfo?.prev || pageInfo?.next) && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            isDisabled={!pageInfo?.prev}
            onPress={() => pageInfo?.prev?.()}
          >
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            isDisabled={!pageInfo?.next}
            onPress={() => pageInfo?.next?.()}
          >
            Next
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      )}
    </div>
  );
}
