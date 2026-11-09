"use client";

import { useActionState } from "react";
import { createGroupAction } from "@/app/actions";
import { CURRENCIES } from "@/lib/money";
import { ErrorText, Field, inputClass, SubmitButton } from "./ui";

export function CreateGroupForm({ adminEmail }: { adminEmail: string }) {
  const [state, action] = useActionState(createGroupAction, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Group name">
        <input name="name" required maxLength={120} placeholder="Goa trip 2026" className={inputClass} />
      </Field>
      <Field label="Base currency" hint="New expenses use this currency unless you pick another one.">
        <select name="baseCurrency" defaultValue="INR" className={inputClass}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Your name in this group" hint={`You join it as ${adminEmail}.`}>
        <input name="yourName" required maxLength={60} placeholder="Arjun" className={inputClass} />
      </Field>
      <ErrorText error={state.error} />
      <SubmitButton pendingText="Creating…" className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">
        Create group
      </SubmitButton>
    </form>
  );
}
