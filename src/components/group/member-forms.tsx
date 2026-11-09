"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addMemberAction, removeMemberAction } from "@/app/actions";
import { ErrorText, ghostButtonClass, inputClass, SubmitButton } from "../ui";

export function AddMemberForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(addMemberAction.bind(null, groupId), {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required maxLength={60} placeholder="Name" aria-label="Name" className={inputClass} />
        <input name="email" type="email" placeholder="Email (optional)" aria-label="Email" className={inputClass} />
      </div>
      <ErrorText error={state.error} />
      <SubmitButton pendingText="Adding…">Add person</SubmitButton>
    </form>
  );
}

export function RemoveMemberButton({ groupId, memberId }: { groupId: string; memberId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeMemberAction(groupId, memberId);
            setError(result.error);
          })
        }
        className={ghostButtonClass}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error && <p className="max-w-48 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
