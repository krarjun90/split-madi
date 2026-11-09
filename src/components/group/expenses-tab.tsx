import Link from "next/link";
import type { GroupLedger } from "@/lib/group-view";
import { formatMinor } from "@/lib/money";
import type { Expense, Group, Member } from "@/lib/repo";
import { Avatar } from "../avatar";

function myPosition(expense: Expense, meId: number) {
  const myShare = expense.splits.find((s) => s.memberId === meId)?.amountMinor ?? 0;
  if (expense.paidBy === meId) return { kind: "lent" as const, amount: expense.baseAmountMinor - myShare };
  if (myShare > 0) return { kind: "borrowed" as const, amount: myShare };
  return { kind: "none" as const, amount: 0 };
}

function formatDay(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en", { day: "numeric", month: "short" });
}

export function ExpensesTab({ group, ledger, me }: { group: Group; ledger: GroupLedger; me: Member }) {
  const names = new Map(ledger.members.map((m) => [m.id, m.id === me.id ? "You" : m.name]));

  if (ledger.expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-stone-700">
        <p className="text-4xl">🧾</p>
        <p className="mt-3 font-medium">No expenses yet</p>
        <p className="mt-1 text-sm text-stone-500">Add the first one, then share the invite link.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
      {ledger.expenses.map((e) => {
        const position = myPosition(e, me.id);
        const payer = names.get(e.paidBy) ?? "Someone";
        return (
          <li key={e.id}>
            <Link
              href={`/g/${group.id}/expenses/${e.id}`}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-stone-50 dark:hover:bg-stone-800/50"
            >
              <div className="w-11 shrink-0 text-center text-xs leading-tight text-stone-500">
                {formatDay(e.spentOn)}
              </div>
              <Avatar name={ledger.members.find((m) => m.id === e.paidBy)?.name ?? "?"} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.description}</p>
                <p className="truncate text-sm text-stone-500">
                  {payer} paid {formatMinor(e.amountMinor, e.currency)}
                  {e.currency !== group.baseCurrency && (
                    <> · {formatMinor(e.baseAmountMinor, group.baseCurrency)}</>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right text-sm">
                {position.kind === "lent" && (
                  <>
                    <p className="text-xs text-stone-500">you lent</p>
                    <p className="font-semibold text-emerald-600">
                      {formatMinor(position.amount, group.baseCurrency)}
                    </p>
                  </>
                )}
                {position.kind === "borrowed" && (
                  <>
                    <p className="text-xs text-stone-500">you owe</p>
                    <p className="font-semibold text-amber-600">
                      {formatMinor(position.amount, group.baseCurrency)}
                    </p>
                  </>
                )}
                {position.kind === "none" && <p className="text-xs text-stone-400">not involved</p>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
