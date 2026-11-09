"use client";

import { useActionState } from "react";
import { adminSignInAction } from "@/app/actions";
import { ErrorText, Field, inputClass, SubmitButton } from "./ui";

export function AdminSignInForm() {
  const [state, action] = useActionState(adminSignInAction, {});
  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <Field label="Email">
        <input name="email" type="email" required autoComplete="username" className={inputClass} />
      </Field>
      <Field label="Password">
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      <ErrorText error={state.error} />
      <SubmitButton pendingText="Signing in…" className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60">
        Sign in
      </SubmitButton>
    </form>
  );
}
