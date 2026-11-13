export default function LoadingTerrasse() {
  return (
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] px-4 py-6 sm:py-8 transition-colors">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 md:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)] animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-[#B85B2B]/10" />
            <div className="space-y-2">
              <div className="h-6 w-44 rounded-lg bg-gray-200" />
              <div className="h-4 w-64 rounded-md bg-gray-100" />
            </div>
          </div>
        </header>

        <div className="flex min-h-72 items-center justify-center rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#D97732] border-t-transparent" />
            <p className="text-sm font-medium text-[#777777]">Chargement des chantiers terrasse...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
