import { useEffect, useState } from 'react';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import {
  EntityKindFilter,
  EntityLifecycleFilter,
  EntityTagFilter,
  EntityTextFilter,
  EntityUserFilter,
  useEntityList,
  useEntityTypeFilter,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import { Check, Search, Star, User, Users } from 'lucide-react';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useEntityFacet } from './useEntityFacet';

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/60"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
            checked
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input',
          )}
        >
          {checked && <Check className="size-3" />}
        </span>
        <span className="truncate text-sm capitalize">{label}</span>
      </span>
      {count !== undefined && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

function CheckList({
  values,
  selected,
  onToggle,
  loading,
  showCount = true,
}: {
  values: { value: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
  loading: boolean;
  showCount?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 py-1">
        {[0, 1, 2].map(i => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }
  if (!values.length) {
    return <p className="py-1 text-sm text-muted-foreground">No options</p>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {values.map(({ value, count }) => (
        <CheckRow
          key={value}
          label={value}
          count={showCount ? count : undefined}
          checked={selected.includes(value)}
          onToggle={() => onToggle(value)}
        />
      ))}
    </div>
  );
}

const PERSONAL_OPTIONS = [
  { key: 'owned', label: 'Owned', icon: User },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'all', label: 'All', icon: Users },
] as const;

function PersonalFilter() {
  const { filters, updateFilters } = useEntityList();
  const { starredEntities } = useStarredEntities();
  const identityApi = useApi(identityApiRef);
  const [ownershipRefs, setOwnershipRefs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    identityApi.getBackstageIdentity().then(identity => {
      if (!cancelled) setOwnershipRefs(identity.ownershipEntityRefs);
    });
    return () => {
      cancelled = true;
    };
  }, [identityApi]);

  const current = filters.user?.value ?? 'all';

  const select = (key: 'owned' | 'starred' | 'all') => {
    let user = EntityUserFilter.all();
    if (key === 'owned') {
      user = EntityUserFilter.owned(ownershipRefs);
    } else if (key === 'starred') {
      user = EntityUserFilter.starred([...starredEntities]);
    }
    updateFilters({ user });
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-1">
      {PERSONAL_OPTIONS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => select(key)}
          className={cn(
            'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
            current === key
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function CatalogFilters() {
  const { filters, updateFilters } = useEntityList();
  const kinds = useEntityFacet('kind', { scopeByKind: false });
  const { availableTypes, selectedTypes, setSelectedTypes } =
    useEntityTypeFilter();
  const lifecycles = useEntityFacet('spec.lifecycle');
  const tags = useEntityFacet('metadata.tags');

  const kindValue = filters.kind?.value ?? 'component';
  const kindOptions = kinds.values.map(({ value }) => ({
    value: value.toLowerCase(),
    label: value,
  }));

  const selectedLifecycles = filters.lifecycles?.values ?? [];
  const selectedTags = filters.tags?.values ?? [];

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6">
      <InputGroup>
        <InputGroupAddon>
          <Search className="size-4 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search"
          value={filters.text?.value ?? ''}
          onChange={e =>
            updateFilters({
              text: e.target.value
                ? new EntityTextFilter(e.target.value)
                : undefined,
            })
          }
        />
      </InputGroup>

      <PersonalFilter />

      <FilterGroup label="Kind">
        <Select
          aria-label="Kind"
          selectedKey={kindValue}
          onSelectionChange={key => {
            const value = String(key);
            const label =
              kindOptions.find(k => k.value === value)?.label ?? value;
            updateFilters({ kind: new EntityKindFilter(value, label) });
          }}
          className="w-full"
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kindOptions.map(({ value, label }) => (
              <SelectItem key={value} id={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterGroup>

      {availableTypes.length > 0 && (
        <FilterGroup label="Type">
          <CheckList
            loading={false}
            showCount={false}
            values={availableTypes.map(value => ({ value, count: 0 }))}
            selected={selectedTypes}
            onToggle={value => setSelectedTypes(toggle(selectedTypes, value))}
          />
        </FilterGroup>
      )}

      <FilterGroup label="Lifecycle">
        <CheckList
          loading={lifecycles.loading}
          values={lifecycles.values}
          selected={selectedLifecycles}
          onToggle={value => {
            const next = toggle(selectedLifecycles, value);
            updateFilters({
              lifecycles: next.length
                ? new EntityLifecycleFilter(next)
                : undefined,
            });
          }}
        />
      </FilterGroup>

      <FilterGroup label="Tags">
        <CheckList
          loading={tags.loading}
          values={tags.values}
          selected={selectedTags}
          onToggle={value => {
            const next = toggle(selectedTags, value);
            updateFilters({
              tags: next.length ? new EntityTagFilter(next) : undefined,
            });
          }}
        />
      </FilterGroup>
    </aside>
  );
}
