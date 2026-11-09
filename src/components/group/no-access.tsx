import Link from "next/link";

export function NoAccess() {
  return (
    <div className="mx-auto max-w-md space-y-3 pt-10 text-center">
      <p className="text-4xl">🔒</p>
      <h1 className="text-2xl font-semibold tracking-tight">This group is private</h1>
      <p className="text-stone-600 dark:text-stone-400">
        Ask someone in the group for your personal invite link. Each link works only with the email
        it was made for.
      </p>
      <Link href="/" className="inline-block pt-2 font-medium text-emerald-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}
