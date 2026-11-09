"use client";

import { useActionState, useTransition } from "react";
import { deletePaymentAction, recordPaymentAction } from "@/app/actions";
import { ghostButtonClass, SubmitButton } from "../ui";

export function MarkPaidButton({
  groupId,
  fromMember,
  toMember,
  amountMinor,
  paidOn,
}: {
  groupId: string;
  fromMember: number;
  toMember: number;
  amountMinor: number;
  paidOn: string;
}) {
  const [state, action] = useActionState(recordPaymentAction.bind(null, groupId), {});
  return (
    <form action={action} className="shrink-0 text-right">
      <input type="hidden" name="fromMember" value={fromMember} />
      <input type="hidden" name="toMember" value={toMember} />
      <input type="hidden" name="amountMinor" value={amountMinor} />
      <input type="hidden" name="paidOn" value={paidOn} />
      <SubmitButton
        pendingText="Saving…"
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium shadow-sm ring-1 ring-stone-200 transition hover:bg-emerald-50 hover:ring-emerald-300 disabled:opacity-60 dark:bg-stone-900 dark:ring-stone-700"
      >
        Mark paid
      </SubmitButton>
      {state.error && <p className="mt-1 text-xs text-rose-600">{state.error}</p>}
    </form>
  );
}

export function DeletePaymentButton({ groupId, paymentId }: { groupId: string; paymentId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => deletePaymentAction(groupId, paymentId).then(() => {}))}
      className={ghostButtonClass}
    >
      {pending ? "Undoing…" : "Undo"}
    </button>
  );
}
