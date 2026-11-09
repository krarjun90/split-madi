import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { findSessionMember } from "@/lib/access";
import { getExpense, getGroup, listMembers } from "@/lib/repo";
import { getSessionId } from "@/lib/session";
import { ExpenseForm } from "./expense-form";

export function ExpensePageSkeleton() {
  return <div className="h-96 animate-pulse rounded-2xl bg-stone-200/50 dark:bg-stone-800/50" />;
}

export async function ExpensePage({ params }: { params: Promise<{ groupId: string; expenseId?: string }> }) {
  const { groupId, expenseId: rawExpenseId } = await params;
  const expenseId = rawExpenseId === undefined ? null : Number(rawExpenseId);
  if (expenseId !== null && !(Number.isInteger(expenseId) && expenseId > 0)) notFound();
  const db = await getDb();
  const group = await getGroup(db, groupId);
  if (!group) notFound();

  const sessionId = await getSessionId();
  const me = sessionId ? await findSessionMember(db, sessionId, groupId) : null;
  if (!me) redirect(`/g/${groupId}`);

  const expense = expenseId ? await getExpense(db, groupId, expenseId) : null;
  if (expenseId && !expense) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/g/${groupId}`} className="text-sm font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
          ← {group.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{expense ? "Edit expense" : "Add an expense"}</h1>
      </div>
      <ExpenseForm
        groupId={groupId}
        baseCurrency={group.baseCurrency}
        members={await listMembers(db, groupId)}
        meId={me.id}
        today={new Date().toISOString().slice(0, 10)}
        expense={expense}
      />
    </div>
  );
}
