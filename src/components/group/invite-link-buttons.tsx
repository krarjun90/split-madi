"use client";

import { useState, useTransition } from "react";
import { resetInviteLinkAction } from "@/app/actions";
import { ghostButtonClass } from "../ui";

export function CopyInviteButton({
  path,
  label,
  shareTitle,
}: {
  path: string;
  label: string;
  shareTitle: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}${path}`;
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: shareTitle, url });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function ResetInviteButton({ groupId, memberId }: { groupId: string; memberId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Make a new link. The old link stops working."
      onClick={() => startTransition(() => resetInviteLinkAction(groupId, memberId).then(() => {}))}
      className={ghostButtonClass}
    >
      {pending ? "…" : "New link"}
    </button>
  );
}
