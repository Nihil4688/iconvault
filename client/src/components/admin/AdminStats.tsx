// The totals at the top of the admin screens, each screen with its own: Users shows how many users there are, how many are admins or members, and how many sign in with Google or Microsoft; Projects shows how many projects there are, how many are private or public, sprite or font, and how many are drafts.
import { Box, FolderKanban, Globe, Lock, Pencil, ShieldCheck, Type, Shapes, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { AdminStats } from "../../api/types";
import type { useAdminStats } from "../../hooks/useAdminStats";

function Card({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  );
}

type CardsProps = { label: string; stats: ReturnType<typeof useAdminStats>; children: (data: AdminStats) => ReactNode };

function Cards({ label, stats, children }: CardsProps) {
  if (stats.error && !stats.data) return null;
  return (
    <section aria-label={label} className={`mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 ${stats.loading && stats.data ? "opacity-60" : ""}`}>
      {stats.data ? children(stats.data) : Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true" className="h-[4.25rem] animate-pulse rounded-xl bg-muted" />)}
    </section>
  );
}

export function UserStatCards({ stats }: { stats: ReturnType<typeof useAdminStats> }) {
  return (
    <Cards label="User totals" stats={stats}>
      {(d) => (
        <>
          <Card icon={<Users aria-hidden="true" className="h-5 w-5" />} label="Users" value={d.users} />
          <Card icon={<ShieldCheck aria-hidden="true" className="h-5 w-5" />} label="Admins" value={d.admins} />
          <Card icon={<UserRound aria-hidden="true" className="h-5 w-5" />} label="Members" value={d.members} />
          <Card icon={<Globe aria-hidden="true" className="h-5 w-5" />} label="Google sign-ins" value={d.googleUsers} />
          <Card icon={<Box aria-hidden="true" className="h-5 w-5" />} label="Microsoft sign-ins" value={d.microsoftUsers} />
        </>
      )}
    </Cards>
  );
}

export function ProjectStatCards({ stats }: { stats: ReturnType<typeof useAdminStats> }) {
  return (
    <Cards label="Project totals" stats={stats}>
      {(d) => (
        <>
          <Card icon={<FolderKanban aria-hidden="true" className="h-5 w-5" />} label="Projects" value={d.projects} />
          <Card icon={<Lock aria-hidden="true" className="h-5 w-5" />} label="Private" value={d.privateProjects} />
          <Card icon={<Globe aria-hidden="true" className="h-5 w-5" />} label="Public" value={d.publicProjects} />
          <Card icon={<Shapes aria-hidden="true" className="h-5 w-5" />} label="Sprite projects" value={d.spriteProjects} />
          <Card icon={<Type aria-hidden="true" className="h-5 w-5" />} label="Font projects" value={d.fontProjects} />
          <Card icon={<Pencil aria-hidden="true" className="h-5 w-5" />} label="Drafts" value={d.draftProjects} />
        </>
      )}
    </Cards>
  );
}
