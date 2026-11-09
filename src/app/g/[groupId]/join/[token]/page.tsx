import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/group/accept-invite-form";
import { findInvite, findSessionMember } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getSessionId } from "@/lib/session";

export default function JoinPage(props: PageProps<"/g/[groupId]/join/[token]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-72 max-w-md animate-pulse rounded-2xl bg-stone-200/50 dark:bg-stone-800/50" />}>
      <JoinContent {...props} />
    </Suspense>
  );
}

async function JoinContent({ params }: PageProps<"/g/[groupId]/join/[token]">) {
  const { groupId, token } = await params;
  const db = await getDb();
  const invite = await findInvite(db, groupId, token);
  if (!invite) notFound();

  const sessionId = await getSessionId();
  const current = sessionId ? await findSessionMember(db, sessionId, groupId) : null;
  if (current?.id === invite.memberId) redirect(`/g/${groupId}`);

  return <AcceptInviteForm groupId={groupId} token={token} name={invite.name} groupName={invite.groupName} />;
}
