"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { deleteExpenseAction, saveExpenseAction } from "@/app/actions";
import { convertMinor, CURRENCIES, formatMinor, minorToInput, parseAmountToMinor } from "@/lib/money";
import type { Expense, Member } from "@/lib/repo";
import { allocateByShares, type SplitType } from "@/lib/split";
import { Avatar } from "./avatar";
import { ErrorText, Field, inputClass, secondaryButtonClass, SubmitButton } from "./ui";

type Props = {
  groupId: string;
  baseCurrency: string;
  members: Member[];
  meId: number;
  today: string;
  expense: Expense | null;
};

type RateStatus = { state: "idle" | "loading" | "fetched" | "failed"; date?: string };

export function ExpenseForm({ groupId, baseCurrency, members, meId, today, expense }: Props) {
  const [state, action] = useActionState(
    saveExpenseAction.bind(null, groupId, expense?.id ?? null),
    {},
  );
  const [currency, setCurrency] = useState(expense?.currency ?? baseCurrency);
  const [amount, setAmount] = useState(expense ? minorToInput(expense.amountMinor, expense.currency) : "");
  const [fxRate, setFxRate] = useState(expense && expense.currency !== baseCurrency ? String(expense.fxRate) : "");
  const [rateLookup, setRateLookup] = useState<{ currency: string; status: RateStatus }>({
    currency: "",
    status: { state: "idle" },
  });
  const [splitType, setSplitType] = useState<SplitType>(expense?.splitType ?? "equal");
  const [shares, setShares] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      members.map((m) => {
        const split = expense?.splits.find((s) => s.memberId === m.id);
        return [m.id, expense ? String(split?.shares ?? 0) : "1"];
      }),
    ),
  );

  const isForeign = currency !== baseCurrency;

  const keepsSavedRate = expense !== null && expense.currency === currency;
  const shouldFetchRate = isForeign && !keepsSavedRate;
  const rateStatus: RateStatus = !shouldFetchRate
    ? { state: "idle" }
    : rateLookup.currency === currency
      ? rateLookup.status
      : { state: "loading" };

  useEffect(() => {
    if (!shouldFetchRate) return;
    const controller = new AbortController();
    fetch(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=${baseCurrency}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { date: string; rates: Record<string, number> }) => {
        const rate = data.rates[baseCurrency];
        if (!rate) throw new Error(`No ${baseCurrency} rate for ${currency}`);
        setFxRate(String(rate));
        setRateLookup({ currency, status: { state: "fetched", date: data.date } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRateLookup({ currency, status: { state: "failed" } });
      });
    return () => controller.abort();
  }, [currency, baseCurrency, shouldFetchRate]);

  const parts = members.map((m) => {
    const value = Number(shares[m.id] || "0");
    const whole = Number.isInteger(value) && value > 0 ? value : 0;
    return { memberId: m.id, shares: splitType === "equal" ? Math.min(whole, 1) : whole };
  });

  const preview = useMemo(() => {
    const minor = parseAmountToMinor(amount, currency);
    const rate = isForeign ? Number(fxRate) : 1;
    if (!minor || !(rate > 0) || parts.every((p) => p.shares === 0)) return null;
    const baseMinor = convertMinor(minor, currency, baseCurrency, rate);
    if (baseMinor <= 0) return null;
    return { baseMinor, byMember: new Map(allocateByShares(baseMinor, parts).map((a) => [a.memberId, a.amountMinor])) };
  }, [amount, currency, fxRate, isForeign, baseCurrency, parts]);

  const totalParts = parts.reduce((sum, p) => sum + p.shares, 0);

  function setShare(memberId: number, value: string) {
    setShares((prev) => ({ ...prev, [memberId]: value }));
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <Field label="What was it for?">
          <input
            name="description"
            required
            maxLength={120}
            defaultValue={expense?.description}
            placeholder="Dinner at the beach shack"
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Amount">
            <input
              name="amount"
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} text-lg font-semibold`}
            />
          </Field>
          <Field label="Currency">
            <select
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        {isForeign && (
          <Field
            label={`1 ${currency} = ? ${baseCurrency}`}
            hint={
              rateStatus.state === "loading"
                ? "Getting today's rate…"
                : rateStatus.state === "fetched"
                  ? `Reference rate from ${rateStatus.date}. Change it to match what you paid.`
                  : rateStatus.state === "failed"
                    ? "Could not get a rate for this currency. Type the rate you paid."
                    : "Balances are kept in " + baseCurrency + "."
            }
          >
            <input
              name="fxRate"
              required
              inputMode="decimal"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by">
            <select name="paidBy" defaultValue={expense?.paidBy ?? meId} className={inputClass}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === meId ? `${m.name} (you)` : m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              name="spentOn"
              type="date"
              required
              defaultValue={expense?.spentOn ?? today}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Split</h2>
          <div className="flex rounded-lg bg-stone-100 p-0.5 text-sm dark:bg-stone-800">
            {(["equal", "shares"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  splitType === type ? "bg-white shadow-sm dark:bg-stone-900" : "text-stone-500"
                }`}
              >
                {type === "equal" ? "Equally" : "By parts"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-stone-500">
          {splitType === "equal"
            ? "Pick who shares this expense."
            : `Give each person a number of parts. ${totalParts} parts in total.`}
        </p>
        <ul className="space-y-1">
          {members.map((m) => {
            const part = parts.find((p) => p.memberId === m.id)!;
            const share = preview?.byMember.get(m.id);
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                {splitType === "equal" ? (
                  <input
                    type="checkbox"
                    aria-label={`Include ${m.name}`}
                    checked={part.shares > 0}
                    onChange={(e) => setShare(m.id, e.target.checked ? "1" : "0")}
                    className="h-5 w-5 accent-emerald-600"
                  />
                ) : (
                  <div className="flex items-center rounded-lg border border-stone-200 dark:border-stone-700">
                    <button
                      type="button"
                      aria-label={`Fewer parts for ${m.name}`}
                      onClick={() => setShare(m.id, String(Math.max(0, part.shares - 1)))}
                      className="px-2.5 py-1 text-stone-500 hover:text-stone-900 dark:hover:text-white"
                    >
                      −
                    </button>
                    <input
                      inputMode="numeric"
                      aria-label={`Parts for ${m.name}`}
                      value={shares[m.id]}
                      onChange={(e) => setShare(m.id, e.target.value.replace(/\D/g, ""))}
                      className="w-9 bg-transparent text-center text-sm font-semibold outline-none"
                    />
                    <button
                      type="button"
                      aria-label={`More parts for ${m.name}`}
                      onClick={() => setShare(m.id, String(part.shares + 1))}
                      className="px-2.5 py-1 text-stone-500 hover:text-stone-900 dark:hover:text-white"
                    >
                      +
                    </button>
                  </div>
                )}
                <Avatar name={m.name} size={28} />
                <span className={`flex-1 truncate ${part.shares ? "" : "text-stone-400"}`}>
                  {m.id === meId ? `${m.name} (you)` : m.name}
                </span>
                <span className="text-sm font-medium tabular-nums text-stone-600 dark:text-stone-300">
                  {share !== undefined ? formatMinor(share, baseCurrency) : ""}
                </span>
              </li>
            );
          })}
        </ul>
        {preview && isForeign && (
          <p className="text-sm text-stone-500">
            Total in {baseCurrency}: <span className="font-medium">{formatMinor(preview.baseMinor, baseCurrency)}</span>
          </p>
        )}
      </div>

      <input type="hidden" name="splitType" value={splitType} />
      <input type="hidden" name="parts" value={JSON.stringify(parts)} />
      <ErrorText error={state.error} />
      <div className="flex items-center gap-3">
        <SubmitButton className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">
          {expense ? "Save changes" : "Add expense"}
        </SubmitButton>
        {expense && <DeleteExpenseButton groupId={groupId} expenseId={expense.id} />}
      </div>
    </form>
  );
}

function DeleteExpenseButton({ groupId, expenseId }: { groupId: string; expenseId: number }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!armed) return setArmed(true);
        startTransition(() => deleteExpenseAction(groupId, expenseId).then(() => {}));
      }}
      onBlur={() => setArmed(false)}
      className={`${secondaryButtonClass} py-3 ${armed ? "border-rose-300 text-rose-600" : ""}`}
    >
      {pending ? "Deleting…" : armed ? "Tap again to delete" : "Delete"}
    </button>
  );
}
