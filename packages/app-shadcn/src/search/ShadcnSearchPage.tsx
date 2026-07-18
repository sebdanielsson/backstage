import {
  SearchContextProvider,
  useSearch,
} from '@backstage/plugin-search-react';
import type { SearchDocument } from '@backstage/plugin-search-common';
import { Link } from 'react-router-dom';
import { Boxes, FileText, Search as SearchIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TYPE_TABS = [
  { id: 'all', label: 'All', types: [] as string[] },
  { id: 'software-catalog', label: 'Catalog', types: ['software-catalog'] },
  { id: 'techdocs', label: 'Docs', types: ['techdocs'] },
];

function typeMeta(type: string) {
  if (type === 'techdocs') {
    return { icon: FileText, label: 'Docs' };
  }
  if (type === 'software-catalog') {
    return { icon: Boxes, label: 'Catalog' };
  }
  return { icon: SearchIcon, label: type };
}

function highlightless(text: string) {
  // Search documents may embed highlight markers; strip them for plain display.
  return text.replace(/<\/?(tag|match)[^>]*>/g, '');
}

function ResultCard({
  result,
}: {
  result: { type: string; document: SearchDocument };
}) {
  const { type, document } = result;
  const meta = typeMeta(type);
  const Icon = meta.icon;
  return (
    <Link
      to={document.location}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-ring hover:bg-muted/40"
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {document.title}
          </span>
          <Badge variant="outline" className="shrink-0">
            {meta.label}
          </Badge>
        </span>
        {document.text && (
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {highlightless(document.text)}
          </span>
        )}
      </span>
    </Link>
  );
}

function SearchResults() {
  const { result, term } = useSearch();
  const results = result.value?.results ?? [];

  if (result.loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (result.error) {
    return (
      <p className="text-sm text-destructive">
        Search failed: {result.error.message}
      </p>
    );
  }

  if (!term) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <SearchIcon className="size-8" />
        <p className="text-sm">Start typing to search across Backstage.</p>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
        <SearchIcon className="size-8" />
        <p className="text-sm">No results for “{term}”.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {results.length} result{results.length === 1 ? '' : 's'}
      </p>
      {results.map(item => (
        <ResultCard
          key={`${item.type}-${item.document.location}`}
          result={item}
        />
      ))}
    </div>
  );
}

function SearchControls() {
  const { term, setTerm, types, setTypes } = useSearch();
  const activeTab =
    TYPE_TABS.find(
      tab =>
        tab.types.length === types.length &&
        tab.types.every(t => types.includes(t)),
    )?.id ?? 'all';

  return (
    <div className="flex flex-col gap-4">
      <InputGroup className="h-11">
        <InputGroupAddon>
          <SearchIcon className="size-4 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search for components, docs, and more…"
          value={term}
          onChange={e => setTerm(e.target.value)}
          className="text-base"
        />
      </InputGroup>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={key => {
          const tab = TYPE_TABS.find(t => t.id === key);
          setTypes(tab?.types ?? []);
        }}
      >
        <TabsList variant="line">
          {TYPE_TABS.map(tab => (
            <TabsTrigger key={tab.id} id={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

export function ShadcnSearchPage() {
  return (
    <SearchContextProvider initialState={{ term: '', types: [], filters: {} }}>
      <main className="min-h-full flex-1 bg-background text-foreground">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
          <header>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Search
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Find components, APIs, and documentation across your portal.
            </p>
          </header>
          <SearchControls />
          <SearchResults />
        </div>
      </main>
    </SearchContextProvider>
  );
}
