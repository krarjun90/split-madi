import { Suspense } from "react";
import { ExpensePage, ExpensePageSkeleton } from "@/components/expense-page";

export default function NewExpensePage({ params }: PageProps<"/g/[groupId]/expenses/new">) {
  return (
    <Suspense fallback={<ExpensePageSkeleton />}>
      <ExpensePage params={params} />
    </Suspense>
  );
}
