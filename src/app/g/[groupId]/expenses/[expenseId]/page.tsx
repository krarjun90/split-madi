import { Suspense } from "react";
import { ExpensePage, ExpensePageSkeleton } from "@/components/expense-page";

export default function EditExpensePage({ params }: PageProps<"/g/[groupId]/expenses/[expenseId]">) {
  return (
    <Suspense fallback={<ExpensePageSkeleton />}>
      <ExpensePage params={params} />
    </Suspense>
  );
}
