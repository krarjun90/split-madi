import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/lib/db";
import { listSessionGroups } from "@/lib/access";
import { getSessionId, isAdmin } from "@/lib/session";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2 pt-2">
        <h1 className="text-3xl font-semibold tracking-tight">Split costs, stay friends.</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Share trip and home costs with friends and family. Add what you spend, and Split Madi works
          out who owes whom.
        </p>
      </section>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-stone-200/50 dark:bg-stone-800/50" />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

async function HomeContent() {
  const sessionId = await getSessionId();
  const groups = sessionId ? await listSessionGroups(await getDb(), sessionId) : [];
  const admin = await isAdmin();

  return (
    <>
      {groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Your groups</h2>
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/g/${g.id}`}
                  className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white px-4 py-3.5 shadow-sm transition hover:border-emerald-300 hover:shadow dark:border-stone-800 dark:bg-stone-900 dark:hover:border-emerald-700"
                >
                  <span className="font-medium">{g.name}</span>
                  <span className="text-sm text-stone-500">
                    {g.memberCount} {g.memberCount === 1 ? "person" : "people"} · {g.baseCurrency}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups.length === 0 && (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500 dark:border-stone-700">
          To join a group, open the personal invite link you were sent.
        </p>
      )}
      <p className="text-center text-sm">
        <Link href="/admin" className="text-stone-500 underline-offset-4 hover:text-emerald-700 hover:underline">
          {admin ? "Admin: create a group" : "Admin sign in"}
        </Link>
      </p>
    </>
  );
}
