import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 pt-10 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-stone-500">This group or expense does not exist. Check the link you were sent.</p>
      <Link href="/" className="inline-block font-medium text-emerald-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}
