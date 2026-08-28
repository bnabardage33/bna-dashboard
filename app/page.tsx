import Link from "next/link";
import { Building2, HardHat, CircleDollarSign, Users, Settings } from "lucide-react";

export default function Home() {
  const apps = [
    {
      name: "Bureau d'études",
      description: "Devis, catalogue matériaux, facturation et suivi client",
      href: "/bureau",
      icon: Building2,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      border: "hover:border-blue-500/50"
    },
    {
      name: "Terrain & Chantier",
      description: "Météo, pointages, rapports journaliers",
      href: "/terrain",
      icon: HardHat,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      border: "hover:border-amber-500/50"
    },
    {
      name: "Finance & Pilotage",
      description: "Trésorerie, marges, export comptable",
      href: "/finance",
      icon: CircleDollarSign,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
      border: "hover:border-emerald-500/50"
    },
    {
      name: "Espace Client",
      description: "Portail partagé avec vos clients",
      href: "/bureau/portails-clients",
      icon: Users,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
      border: "hover:border-purple-500/50"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            BNA Dashboard
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Bienvenue sur votre espace de gestion. Sélectionnez une application pour commencer.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {apps.map((app) => (
            <Link 
              key={app.name} 
              href={app.href}
              className={`group flex items-start gap-4 p-6 rounded-2xl bg-slate-800/50 border border-slate-700 transition-all ${app.border} hover:bg-slate-800`}
            >
              <div className={`p-4 rounded-xl ${app.bg} ${app.color}`}>
                <app.icon className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-200 group-hover:text-white transition-colors">
                  {app.name}
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  {app.description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div className="flex justify-center pt-8">
          <Link 
            href="/parametres" 
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Paramètres de l'application
          </Link>
        </div>
      </div>
    </div>
  );
}
