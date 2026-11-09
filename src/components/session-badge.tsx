import { signOutAction } from "@/app/actions";
import { getSessionId } from "@/lib/session";

export async function SessionBadge() {
  if (!(await getSessionId())) return null;
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800"
      >
        Sign out
      </button>
    </form>
  );
}
