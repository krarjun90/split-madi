"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { acceptInvite, findSessionMember, grantMember, resetInviteLink } from "@/lib/access";
import {
  addMember,
  createGroup,
  deleteExpense,
  deletePayment,
  recordPayment,
  removeMember,
  saveExpense,
  updateGroup,
  UserError,
  type Member,
} from "@/lib/repo";
import { parseAmountToMinor } from "@/lib/money";
import { headers } from "next/headers";
import { claimAdminMembership } from "@/lib/admin";
import {
  adminConfig,
  endSession,
  ensureSessionId,
  getSessionId,
  isAdmin,
  signInAdmin,
  signOutAdmin,
} from "@/lib/session";
import type { SplitType } from "@/lib/split";

export type ActionState = { error?: string; ok?: boolean };

async function attempt(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    throw error;
  }
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function requireMember(groupId: string): Promise<{ email: string; member: Member }> {
  const sessionId = await getSessionId();
  const member = sessionId ? await findSessionMember(await getDb(), sessionId, groupId) : null;
  if (!member) throw new UserError("Open your invite link to use this group");
  return { email: member.email ?? member.name, member };
}

async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || "unknown";
}

export async function adminSignInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await attempt(async () => {
    await signInAdmin({
      email: text(form, "email"),
      password: String(form.get("password") ?? ""),
      ip: await clientIp(),
    });
  });
  if (result.error) return result;
  redirect("/admin");
}

export async function adminOpenGroupAction(groupId: string): Promise<void> {
  const config = adminConfig();
  const sessionId = await getSessionId();
  if (!config || !sessionId || !(await isAdmin())) redirect("/admin");
  await claimAdminMembership(await getDb(), { groupId, adminEmail: config.email, sessionId });
  redirect(`/g/${groupId}`);
}

export async function adminSignOutAction(): Promise<void> {
  await signOutAdmin();
  redirect("/");
}

export async function createGroupAction(_: ActionState, form: FormData): Promise<ActionState> {
  let groupId = "";
  const result = await attempt(async () => {
    const config = adminConfig();
    if (!config || !(await isAdmin())) throw new UserError("Only the admin can create groups");
    const db = await getDb();
    const created = await createGroup(db, {
      name: text(form, "name"),
      baseCurrency: text(form, "baseCurrency"),
      creatorName: text(form, "yourName"),
      creatorEmail: config.email,
    });
    await grantMember(db, await ensureSessionId(), created.memberId);
    groupId = created.groupId;
  });
  if (result.error) return result;
  redirect(`/g/${groupId}`);
}

export async function acceptInviteAction(
  groupId: string,
  token: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await attempt(async () => {
    const db = await getDb();
    const member = await acceptInvite(db, { groupId, token, email: text(form, "email") });
    await grantMember(db, await ensureSessionId(), member.id);
  });
  if (result.error) return result;
  redirect(`/g/${groupId}`);
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

function readExpenseForm(form: FormData) {
  const currency = text(form, "currency");
  const amountMinor = parseAmountToMinor(text(form, "amount"), currency);
  if (amountMinor === null) throw new UserError("Amount is not valid for " + currency);
  const parts = JSON.parse(text(form, "parts") || "[]") as { memberId: number; shares: number }[];
  return {
    description: text(form, "description"),
    amountMinor,
    currency,
    fxRate: Number(text(form, "fxRate") || "1"),
    paidBy: Number(text(form, "paidBy")),
    splitType: text(form, "splitType") as SplitType,
    spentOn: text(form, "spentOn"),
    parts: parts.map((p) => ({ memberId: Number(p.memberId), shares: Number(p.shares) })),
  };
}

export async function saveExpenseAction(
  groupId: string,
  expenseId: number | null,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await attempt(async () => {
    const { email } = await requireMember(groupId);
    await saveExpense(await getDb(), groupId, readExpenseForm(form), email, expenseId ?? undefined);
  });
  if (result.error) return result;
  redirect(`/g/${groupId}`);
}

export async function deleteExpenseAction(groupId: string, expenseId: number): Promise<ActionState> {
  const result = await attempt(async () => {
    await requireMember(groupId);
    await deleteExpense(await getDb(), groupId, expenseId);
  });
  if (result.error) return result;
  redirect(`/g/${groupId}`);
}

export async function recordPaymentAction(
  groupId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await attempt(async () => {
    const { email } = await requireMember(groupId);
    await recordPayment(
      await getDb(),
      groupId,
      {
        fromMember: Number(text(form, "fromMember")),
        toMember: Number(text(form, "toMember")),
        amountMinor: Number(text(form, "amountMinor")),
        paidOn: text(form, "paidOn"),
      },
      email,
    );
  });
  if (result.ok) refresh();
  return result;
}

export async function deletePaymentAction(groupId: string, paymentId: number): Promise<ActionState> {
  const result = await attempt(async () => {
    await requireMember(groupId);
    await deletePayment(await getDb(), groupId, paymentId);
  });
  if (result.ok) refresh();
  return result;
}

export async function addMemberAction(
  groupId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await attempt(async () => {
    await requireMember(groupId);
    await addMember(await getDb(), groupId, {
      name: text(form, "name"),
      email: text(form, "email") || undefined,
    });
  });
  if (result.ok) refresh();
  return result;
}

export async function removeMemberAction(groupId: string, memberId: number): Promise<ActionState> {
  const result = await attempt(async () => {
    const { member } = await requireMember(groupId);
    if (member.id === memberId) throw new UserError("You cannot remove yourself");
    await removeMember(await getDb(), groupId, memberId);
  });
  if (result.ok) refresh();
  return result;
}

export async function resetInviteLinkAction(groupId: string, memberId: number): Promise<ActionState> {
  const result = await attempt(async () => {
    await requireMember(groupId);
    await resetInviteLink(await getDb(), groupId, memberId);
  });
  if (result.ok) refresh();
  return result;
}

export async function updateGroupAction(
  groupId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await attempt(async () => {
    await requireMember(groupId);
    await updateGroup(await getDb(), groupId, {
      name: text(form, "name"),
      baseCurrency: text(form, "baseCurrency"),
    });
  });
  if (result.ok) refresh();
  return result;
}
