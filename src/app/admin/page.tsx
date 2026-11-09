import Link from "next/link";
import { Suspense } from "react";
import { adminOpenGroupAction, adminSignOutAction } from "@/app/actions";
import { AdminSignInForm } from "@/components/admin-sign-in-form";
import { CreateGroupForm } from "@/components/create-group-form";
import { listAllGroups, type GroupSummary } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { adminConfig, getSessionId, isAdmin } from "@/lib/session";

const accessButtonClass =
  "shrink-0 rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium transition hover:border-emerald-300 hover:text-emerald-700 dark:border-stone-700 dark:hover:border-emerald-700";

function GroupAccessButton({ group }: { group: GroupSummary }) {
  if (group.access === "open") {
    return (
      <Link href={`/g/${group.id}`} className={accessButtonClass}>
        Open
      </Link>
    );
  }
  if (group.access === "claim") {
    return (
      <form action={adminOpenGroupAction.bind(null, group.id)}>
        <button type="submit" className={accessButtonClass}>
          Sign in
        </button>
      </form>
    );
  }
  return <span className="shrink-0 text-sm text-stone-400">Not a member</span>;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-stone-200/50 dark:bg-stone-800/50" />}>
      <AdminContent />
    </Suspense>
  );
}

const cardClass =
  "rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900";

async function AdminContent() {
  const config = adminConfig();
  if (!config) {
    return (
      <div className="mx-auto max-w-md space-y-3 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin is not set up</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Set <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD_HASH</code> in the project environment, then
          redeploy. The README shows how to make the hash.
        </p>
      </div>
    );
  }

  if (!(await isAdmin())) {
    return (
      <div className="mx-auto max-w-md space-y-5 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin sign in</h1>
        <AdminSignInForm />
      </div>
    );
  }

  const groups = await listAllGroups(await getDb(), {
    sessionId: (await getSessionId())!,
    adminEmail: config.email,
  });
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-stone-500">Signed in as {config.email}</p>
        </div>
        <form action={adminSignOutAction}>
          <button
            type="submit"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Leave admin
          </button>
        </form>
      </div>

      <section className={cardClass}>
        <h2 className="mb-4 text-lg font-semibold">Create a group</h2>
        <CreateGroupForm adminEmail={config.email} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">All groups</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-stone-500">No groups yet.</p>
        ) : (
          <ul className="divide-y divide-stone-200/80 rounded-2xl border border-stone-200/80 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{g.name}</p>
                  <p className="text-sm text-stone-500">
                    {g.memberCount} people · {g.expenseCount} expenses · {g.baseCurrency}
                  </p>
                </div>
                <GroupAccessButton group={g} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
