import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0F19] text-gray-300 p-6">
      <div className="bg-[#1A1D24] p-8 rounded-2xl border border-white/5 max-w-md text-center space-y-4">
        <h2 className="text-4xl font-bold text-[#E30613]">404</h2>
        <p className="text-gray-400">Page introuvable</p>
        <Link
          href="/"
          className="inline-block w-full py-3 bg-[#E30613] text-white rounded-xl font-bold text-center hover:bg-red-700 transition-colors"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
