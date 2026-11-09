"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/actions";
import { Avatar } from "../avatar";
import { ErrorText, Field, inputClass, SubmitButton } from "../ui";

export function AcceptInviteForm({
  groupId,
  token,
  name,
  groupName,
}: {
  groupId: string;
  token: string;
  name: string;
  groupName: string;
}) {
  const [state, action] = useActionState(acceptInviteAction.bind(null, groupId, token), {});
  return (
    <div className="mx-auto max-w-md space-y-5 pt-4">
      <div className="flex flex-col items-center text-center">
        <Avatar name={name} size={48} />
        <p className="mt-3 text-sm font-medium text-emerald-600">Hi {name}, you are invited to</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{groupName}</h1>
      </div>
      <form
        action={action}
        className="space-y-4 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900"
      >
        <Field label="Your email" hint="Enter the email this invite was sent to. This browser then stays signed in.">
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={inputClass} />
        </Field>
        <ErrorText error={state.error} />
        <SubmitButton pendingText="Checking…" className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60">
          Join group
        </SubmitButton>
      </form>
    </div>
  );
}
