"use client";

import { useActionState } from "react";
import { updateGroupAction } from "@/app/actions";
import { CURRENCIES } from "@/lib/money";
import type { Group } from "@/lib/repo";
import { ErrorText, Field, inputClass, SubmitButton } from "../ui";

export function SettingsTab({ group, hasActivity }: { group: Group; hasActivity: boolean }) {
  const [state, action] = useActionState(updateGroupAction.bind(null, group.id), {});
  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 className="font-semibold">Group settings</h2>
      <Field label="Group name">
        <input name="name" required maxLength={120} defaultValue={group.name} className={inputClass} />
      </Field>
      <Field
        label="Base currency"
        hint={
          hasActivity
            ? "Locked, because balances are already kept in this currency."
            : "Expenses default to this currency, and balances are shown in it."
        }
      >
        <select
          name="baseCurrency"
          defaultValue={group.baseCurrency}
          disabled={hasActivity}
          className={`${inputClass} disabled:opacity-60`}
        >
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {hasActivity && <input type="hidden" name="baseCurrency" value={group.baseCurrency} />}
      </Field>
      <ErrorText error={state.error} />
      {state.ok && <p className="text-sm text-emerald-600">Saved.</p>}
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
