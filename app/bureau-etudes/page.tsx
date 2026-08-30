import Link from "next/link";

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-3xl p-8 max-w-sm w-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="w-16 h-16 rounded-2xl bg-[#E30613]/15 border border-[#E30613]/20 flex items-center justify-center mx-auto mb-5">
          <span className="text-[#ff5a5a] text-2xl">🚧</span>
        </div>
        <h1 className="text-white font-black text-[22px] leading-tight">Bureau d'études</h1>
        <p className="text-white/50 text-[14px] mt-2 leading-relaxed">
          Cette section est en cours de construction.
          <br />Elle sera bientôt disponible.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 bg-[#E30613] text-white font-bold text-[13px] px-5 py-3 rounded-2xl hover:bg-[#c50510] transition-all"
        >
          ← Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
