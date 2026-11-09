"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121212] text-gray-300 p-6">
      <div className="bg-[#1E1E1E] p-8 rounded-2xl border border-white/5 max-w-md text-center space-y-4">
        <h2 className="text-xl font-bold text-red-400">Une erreur est survenue</h2>
        <p className="text-sm text-gray-400">
          {error.message || "Erreur inattendue. Veuillez réessayer."}
        </p>
        <button
          onClick={() => reset()}
          className="w-full py-3 bg-[#B85B2B] text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
