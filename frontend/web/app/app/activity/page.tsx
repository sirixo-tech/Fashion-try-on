import {
  ActivityIcon,
  LogInIcon,
  MonitorIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StoreIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";

import { PageContainer, PageHeader, PageSection, StatusBadge } from "@selfx/ui";

const activityEvents = [
  {
    title: "Kiosk added",
    proof: "Front Display",
    actor: "platform.superadmin@selfx.test",
    ip: "49.37.243.78",
    occurredAt: "2026-08-17, 18:42:10",
    relative: "12m ago",
    icon: MonitorIcon,
    tone: "text-primary",
  },
  {
    title: "Try-On generated",
    proof: "run_01k2-selfx-demo",
    actor: "Store kiosk session",
    ip: "Store network",
    occurredAt: "2026-08-17, 18:31:05",
    relative: "23m ago",
    icon: SparklesIcon,
    tone: "text-violet-600",
  },
  {
    title: "Store updated",
    proof: "SelfX Demo Store",
    actor: "platform.superadmin@selfx.test",
    ip: "49.37.243.78",
    occurredAt: "2026-08-17, 17:58:44",
    relative: "55m ago",
    icon: StoreIcon,
    tone: "text-primary",
  },
  {
    title: "Account created",
    proof: "store.owner@example.com",
    actor: "SelfX platform",
    ip: "System",
    occurredAt: "2026-08-17, 16:20:13",
    relative: "2h ago",
    icon: UserPlusIcon,
    tone: "text-sky-600",
  },
  {
    title: "Signed in",
    proof: "platform.superadmin@selfx.test",
    actor: "platform.superadmin@selfx.test",
    ip: "49.37.243.78",
    occurredAt: "2026-08-17, 13:06:25",
    relative: "6h ago",
    icon: LogInIcon,
    tone: "text-emerald-600",
  },
  {
    title: "Kiosk deleted",
    proof: "Retired display",
    actor: "platform.superadmin@selfx.test",
    ip: "49.37.243.78",
    occurredAt: "2026-08-16, 19:41:02",
    relative: "1d ago",
    icon: Trash2Icon,
    tone: "text-destructive",
  },
];

export default function ActivityPage() {
  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Workspace"
        title="Activity"
        description="A proof-ready record of Store, kiosk, account and Try-On actions."
        status={<StatusBadge status="ACTIVE" label="Audit surface" />}
      />
      <PageSection>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <ActivityIcon className="text-primary" aria-hidden="true" />
                <h2 className="text-xl font-semibold">Recent Activity</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Proof fields include actor, resource, IP/source and timestamp.
              </p>
            </div>
            <span className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
              {activityEvents.length} events
            </span>
          </div>

          <ol className="relative space-y-0">
            {activityEvents.map((event, index) => {
              const Icon = event.icon;
              return (
                <li
                  key={`${event.title}-${event.occurredAt}`}
                  className="relative flex gap-5 pb-7 last:pb-0"
                >
                  {index < activityEvents.length - 1 ? (
                    <span className="absolute left-[22px] top-12 h-[calc(100%-3rem)] w-px bg-border" />
                  ) : null}
                  <span className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border bg-background">
                    <Icon className={event.tone} size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{event.title}</h3>
                      <code className="max-w-full truncate rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
                        {event.proof}
                      </code>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>{event.relative}</span>
                      <span>Actor: {event.actor}</span>
                      <span>IP/source: {event.ip}</span>
                      <span>{event.occurredAt}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-7 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <ShieldCheckIcon
              className="mr-2 inline text-primary"
              size={16}
              aria-hidden="true"
            />
            Live Activity should read from the backend audit log when that API
            is exposed; this screen defines the proof layout for those records.
          </div>
        </div>
      </PageSection>
    </PageContainer>
  );
}
