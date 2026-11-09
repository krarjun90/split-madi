import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { BalancesTab } from "@/components/group/balances-tab";
import { ExpensesTab } from "@/components/group/expenses-tab";
import { NoAccess } from "@/components/group/no-access";
import { PeopleTab } from "@/components/group/people-tab";
import { SettingsTab } from "@/components/group/settings-tab";
import { getDb } from "@/lib/db";
import { loadGroupLedger } from "@/lib/group-view";
import { formatMinor } from "@/lib/money";
import { findSessionMember, listJoinedMemberIds, listVisibleInviteLinks } from "@/lib/access";
import { getGroup } from "@/lib/repo";
import { getSessionId } from "@/lib/session";

const TABS = [
  { id: "expenses", label: "Expenses" },
  { id: "balances", label: "Settle up" },
  { id: "people", label: "People" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function GroupPage(props: PageProps<"/g/[groupId]">) {
  return (
    <Suspense fallback={<GroupSkeleton />}>
      <GroupContent {...props} />
    </Suspense>
  );
}

function GroupSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-2xl bg-stone-200/50 dark:bg-stone-800/50" />
      <div className="h-64 animate-pulse rounded-2xl bg-stone-200/50 dark:bg-stone-800/50" />
    </div>
  );
}

async function GroupContent({ params, searchParams }: PageProps<"/g/[groupId]">) {
  const { groupId } = await params;
  const { tab: rawTab } = await searchParams;
  const db = await getDb();
  const group = await getGroup(db, groupId);
  if (!group) notFound();

  const sessionId = await getSessionId();
  const me = sessionId ? await findSessionMember(db, sessionId, groupId) : null;
  if (!me) return <NoAccess />;

  const ledger = await loadGroupLedger(group);
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "expenses";
  const myNet = ledger.net.get(me.id) ?? 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{group.name}</h1>
            <p className="mt-1 text-sm text-stone-500">
              {ledger.members.length} {ledger.members.length === 1 ? "person" : "people"} · Total spent{" "}
              {formatMinor(ledger.totalSpentMinor, group.baseCurrency)}
            </p>
          </div>
          <Link
            href={`/g/${group.id}?tab=people`}
            replace
            scroll={false}
            className="shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
          >
            Invite
          </Link>
        </div>
        <div className="mt-4 flex -space-x-2">
          {ledger.members.slice(0, 8).map((m) => (
            <span key={m.id} title={m.name} className="rounded-full ring-2 ring-white dark:ring-stone-900">
              <Avatar name={m.name} size={30} />
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-stone-50 px-4 py-3 dark:bg-stone-800/60">
          <p className="text-sm text-stone-500">Your balance</p>
          <p
            className={`text-xl font-semibold ${
              myNet > 0 ? "text-emerald-600" : myNet < 0 ? "text-amber-600" : ""
            }`}
          >
            {myNet > 0
              ? `You get back ${formatMinor(myNet, group.baseCurrency)}`
              : myNet < 0
                ? `You owe ${formatMinor(-myNet, group.baseCurrency)}`
                : "You are all settled up"}
          </p>
        </div>
      </section>

      <nav className="flex gap-1 rounded-xl bg-stone-200/50 p-1 dark:bg-stone-800/60">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "expenses" ? `/g/${group.id}` : `/g/${group.id}?tab=${t.id}`}
            replace
            scroll={false}
            className={`flex-1 rounded-lg px-2 py-2 text-center text-sm font-medium transition ${
              tab === t.id
                ? "bg-white shadow-sm dark:bg-stone-900"
                : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "expenses" && <ExpensesTab group={group} ledger={ledger} me={me} />}
      {tab === "balances" && <BalancesTab group={group} ledger={ledger} me={me} today={today} />}
      {tab === "people" && (
        <PeopleTab
          group={group}
          ledger={ledger}
          me={me}
          inviteLinks={await listVisibleInviteLinks(db, group.id, me.id)}
          joinedIds={await listJoinedMemberIds(db, group.id)}
        />
      )}
      {tab === "settings" && <SettingsTab group={group} hasActivity={ledger.expenses.length + ledger.payments.length > 0} />}

      <Link
        href={`/g/${group.id}/expenses/new`}
        className="fixed bottom-6 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-medium text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700"
      >
        <span className="text-lg leading-none">+</span> Add expense
      </Link>
    </div>
  );
}
