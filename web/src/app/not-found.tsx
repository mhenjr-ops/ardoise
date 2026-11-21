import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page introuvable · Page not found</h1>
        <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          ← Tableau de bord · Dashboard
        </Link>
      </div>
    </main>
  );
}
