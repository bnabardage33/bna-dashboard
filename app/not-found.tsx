import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121212] text-gray-300 p-6">
      <div className="bg-[#1E1E1E] p-8 rounded-2xl border border-white/5 max-w-md text-center space-y-4">
        <h2 className="text-4xl font-bold text-[#B85B2B]">404</h2>
        <p className="text-gray-400">Page introuvable</p>
        <Link
          href="/"
          className="inline-block w-full py-3 bg-[#B85B2B] text-white rounded-xl font-bold text-center hover:bg-red-700 transition-colors"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
