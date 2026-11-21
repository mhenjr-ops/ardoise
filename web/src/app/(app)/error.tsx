"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
      <p className="font-semibold">Une erreur est survenue · Something went wrong</p>
      <button type="button" onClick={reset} className="mt-3 font-medium underline">
        Réessayer · Try again
      </button>
    </div>
  );
}
