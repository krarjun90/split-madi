import type { InviteLink } from "@/lib/access";
import type { GroupLedger } from "@/lib/group-view";
import type { Group, Member } from "@/lib/repo";
import { Avatar } from "../avatar";
import { CopyInviteButton, ResetInviteButton } from "./invite-link-buttons";
import { AddMemberForm, RemoveMemberButton } from "./member-forms";

function status(member: Member, joined: boolean) {
  if (joined) return "Joined";
  if (member.email) return "Invited, has not joined yet";
  return "No email, cannot sign in";
}

export function PeopleTab({
  group,
  ledger,
  me,
  inviteLinks,
  joinedIds,
}: {
  group: Group;
  ledger: GroupLedger;
  me: Member;
  inviteLinks: InviteLink[];
  joinedIds: number[];
}) {
  const tokenFor = new Map(inviteLinks.map((l) => [l.memberId, l.token]));
  const joined = new Set(joinedIds);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="font-semibold">People</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          Each person has their own invite link. It works only with their email.
        </p>
        <ul className="mt-3 divide-y divide-stone-100 dark:divide-stone-800">
          {ledger.members.map((m) => {
            const token = tokenFor.get(m.id);
            const isMe = m.id === me.id;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={m.name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.name}
                    {isMe && <span className="text-stone-400"> (you)</span>}
                  </p>
                  <p className="truncate text-sm text-stone-500">
                    {m.email ? `${m.email} · ` : ""}
                    {status(m, joined.has(m.id))}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {token && (
                    <CopyInviteButton
                      path={`/g/${group.id}/join/${token}`}
                      label={isMe ? "Copy my link" : "Copy invite"}
                      shareTitle={`Join "${group.name}" on Split Madi`}
                    />
                  )}
                  {token && !isMe && <ResetInviteButton groupId={group.id} memberId={m.id} />}
                  {!isMe && <RemoveMemberButton groupId={group.id} memberId={m.id} />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-stone-500">
          Use &quot;Copy my link&quot; to sign in on another phone or laptop. After someone joins, only they
          can see their link.
        </p>
      </section>
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="font-semibold">Add someone</h2>
        <p className="mt-0.5 text-sm text-stone-500">
          Add their email to get an invite link for them. Leave the email empty for people who never
          sign in, like kids or grandparents.
        </p>
        <AddMemberForm groupId={group.id} />
      </section>
    </div>
  );
}
