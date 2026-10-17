import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted">This record does not exist, or your role cannot see it.</p>
      <Link href="/" className="text-sm text-brand underline">Back to overview</Link>
    </main>
  );
}
