import {
  Activity,
  ArrowUpRight,
  Boxes,
  GitPullRequest,
  Layers,
  MoreHorizontal,
  Plus,
  Rocket,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const stats = [
  {
    title: 'Components',
    value: '128',
    change: '+6 this week',
    icon: Boxes,
  },
  {
    title: 'Deployments',
    value: '842',
    change: '+12% vs last week',
    icon: Rocket,
  },
  {
    title: 'Open PRs',
    value: '37',
    change: '9 awaiting review',
    icon: GitPullRequest,
  },
  {
    title: 'Teams',
    value: '14',
    change: '3 platform squads',
    icon: Users,
  },
];

const services = [
  {
    name: 'artist-web',
    owner: 'team-alpha',
    ownerInitials: 'TA',
    type: 'website',
    status: 'Healthy',
    lifecycle: 'production',
  },
  {
    name: 'petstore-api',
    owner: 'team-beta',
    ownerInitials: 'TB',
    type: 'service',
    status: 'Healthy',
    lifecycle: 'production',
  },
  {
    name: 'queue-proxy',
    owner: 'team-infra',
    ownerInitials: 'TI',
    type: 'service',
    status: 'Degraded',
    lifecycle: 'production',
  },
  {
    name: 'search-indexer',
    owner: 'team-search',
    ownerInitials: 'TS',
    type: 'service',
    status: 'Healthy',
    lifecycle: 'experimental',
  },
  {
    name: 'billing-worker',
    owner: 'team-money',
    ownerInitials: 'TM',
    type: 'service',
    status: 'Incident',
    lifecycle: 'production',
  },
];

function statusBadge(status: string) {
  if (status === 'Healthy') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        {status}
      </Badge>
    );
  }
  if (status === 'Degraded') {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
        {status}
      </Badge>
    );
  }
  return <Badge className="bg-destructive/10 text-destructive">{status}</Badge>;
}

export function HomePage() {
  return (
    <main className="bg-background text-foreground min-h-full flex-1">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Good morning, Sebastian
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Here's what's happening across your developer portal today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenuTrigger>
              <Button variant="outline">
                <MoreHorizontal data-icon="inline-start" />
                Actions
              </Button>
              <DropdownMenu placement="bottom end">
                <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                <DropdownMenuItem>Register existing component</DropdownMenuItem>
                <DropdownMenuItem>Open API explorer</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  Report an incident
                </DropdownMenuItem>
              </DropdownMenu>
            </DropdownMenuTrigger>
            <Button>
              <Plus data-icon="inline-start" />
              Create component
            </Button>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(stat => (
            <Card key={stat.title} className="gap-2">
              <CardHeader>
                <CardDescription className="flex items-center gap-2">
                  <stat.icon className="size-4" />
                  {stat.title}
                </CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums">
                  {stat.value}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">{stat.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Software catalog</CardTitle>
              <CardDescription>
                Recently active components across the organization.
              </CardDescription>
              <CardAction>
                <LinkButton
                  variant="ghost"
                  href="/catalog"
                  className="text-primary"
                >
                  Open catalog
                  <ArrowUpRight data-icon="inline-end" />
                </LinkButton>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Tabs defaultSelectedKey="all">
                <TabsList variant="line">
                  <TabsTrigger id="all">All</TabsTrigger>
                  <TabsTrigger id="services">Services</TabsTrigger>
                  <TabsTrigger id="websites">Websites</TabsTrigger>
                </TabsList>
                <TabsContent id="all">
                  <ServiceTable rows={services} />
                </TabsContent>
                <TabsContent id="services">
                  <ServiceTable
                    rows={services.filter(s => s.type === 'service')}
                  />
                </TabsContent>
                <TabsContent id="websites">
                  <ServiceTable
                    rows={services.filter(s => s.type === 'website')}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-4" />
                  Platform status
                </CardTitle>
                <CardDescription>Live signals from your infra.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {[
                  { label: 'CI pipeline', status: 'Healthy' },
                  { label: 'Kubernetes fleet', status: 'Healthy' },
                  { label: 'Artifact registry', status: 'Degraded' },
                ].map(row => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{row.label}</span>
                    {statusBadge(row.status)}
                  </div>
                ))}
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full">
                  View status page
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="size-4" />
                  Golden paths
                </CardTitle>
                <CardDescription>
                  Scaffold something new from a template.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {[
                  'React SSR website',
                  'Node.js backend service',
                  'Documentation site',
                ].map(template => (
                  <Link
                    key={template}
                    to="/catalog"
                    className="border-border hover:bg-muted flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors"
                  >
                    {template}
                    <ArrowUpRight className="text-muted-foreground size-4" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function ServiceTable({ rows }: { rows: typeof services }) {
  return (
    <Table aria-label="Software catalog components">
      <TableHeader>
        <TableHead isRowHeader>Name</TableHead>
        <TableHead>Owner</TableHead>
        <TableHead>Lifecycle</TableHead>
        <TableHead className="text-right">Status</TableHead>
      </TableHeader>
      <TableBody>
        {rows.map(service => (
          <TableRow key={service.name}>
            <TableCell className="font-medium">{service.name}</TableCell>
            <TableCell>
              <span className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="text-[10px]">
                    {service.ownerInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground">{service.owner}</span>
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{service.lifecycle}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {statusBadge(service.status)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
