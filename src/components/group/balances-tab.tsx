import type { GroupLedger } from "@/lib/group-view";
import { formatMinor } from "@/lib/money";
import type { Group, Member } from "@/lib/repo";
import { Avatar } from "../avatar";
import { DeletePaymentButton, MarkPaidButton } from "./payment-buttons";

export function BalancesTab({
  group,
  ledger,
  me,
  today,
}: {
  group: Group;
  ledger: GroupLedger;
  me: Member;
  today: string;
}) {
  const name = (id: number) =>
    id === me.id ? "You" : (ledger.members.find((m) => m.id === id)?.name ?? "Someone");
  const money = (minor: number) => formatMinor(minor, group.baseCurrency);
  const largest = Math.max(1, ...[...ledger.net.values()].map(Math.abs));

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="font-semibold">Simplified payments</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          The fewest payments that settle everyone, in {group.baseCurrency}.
        </p>
        {ledger.transfers.length === 0 ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Everyone is settled up. 🎉
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {ledger.transfers.map((t) => (
              <li
                key={`${t.from}-${t.to}`}
                className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-3 dark:bg-stone-800/60"
              >
                <p className="min-w-0 flex-1 text-[15px]">
                  <span className="font-medium">{name(t.from)}</span>
                  <span className="text-stone-500"> {t.from === me.id ? "pay" : "pays"} </span>
                  <span className="font-medium">{name(t.to)}</span>
                  <span className="block font-semibold">{money(t.amountMinor)}</span>
                </p>
                <MarkPaidButton
                  groupId={group.id}
                  fromMember={t.from}
                  toMember={t.to}
                  amountMinor={t.amountMinor}
                  paidOn={today}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="font-semibold">Balances</h2>
        <ul className="mt-4 space-y-3">
          {ledger.members.map((m) => {
            const value = ledger.net.get(m.id) ?? 0;
            return (
              <li key={m.id} className="flex items-center gap-3">
                <Avatar name={m.name} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{m.id === me.id ? `${m.name} (you)` : m.name}</span>
                    <span
                      className={
                        value > 0 ? "text-emerald-600" : value < 0 ? "text-amber-600" : "text-stone-400"
                      }
                    >
                      {value > 0 ? `gets ${money(value)}` : value < 0 ? `owes ${money(-value)}` : "settled"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div
                      className={`h-full rounded-full ${value >= 0 ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${(Math.abs(value) / largest) * 100}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {ledger.payments.length > 0 && (
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <h2 className="font-semibold">Payments made</h2>
          <ul className="mt-3 divide-y divide-stone-100 dark:divide-stone-800">
            {ledger.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-14 shrink-0 text-stone-500">
                  {new Date(`${p.paidOn}T00:00:00`).toLocaleDateString("en", { day: "numeric", month: "short" })}
                </span>
                <span className="min-w-0 flex-1">
                  {name(p.fromMember)} paid {name(p.toMember)}{" "}
                  <span className="font-semibold">{money(p.amountMinor)}</span>
                </span>
                <DeletePaymentButton groupId={group.id} paymentId={p.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
