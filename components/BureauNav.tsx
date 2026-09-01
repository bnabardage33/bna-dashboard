"use client";

import SubNav from "@/components/SubNav";
import { BookOpen, Camera, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Item = { label: string; href: string; icon?: LucideIcon };

const items: Item[] = [
  { label: "Clients", href: "/bureau/clients" },
  { label: "Devis", href: "/bureau/devis-factures" },
  { label: "Factures", href: "/bureau/factures" },
  { label: "Fournisseurs & Achats", href: "/bureau/fournisseurs" },
  { label: "Rapports Intempéries", href: "/bureau/rapports-intemperies" },
  { label: "Fin de chantier", href: "/bureau/fin-chantier" },
  { label: "SAV & Garantie", href: "/bureau/sav" },
  { label: "Catalogue", href: "/bureau/catalogue", icon: BookOpen },
  { label: "Photos Chantier", href: "/bureau/photos-chantier", icon: Camera },
  { label: "Docs Compta", href: "/bureau/documents-compta", icon: Receipt },
];

export default function BureauNav() {
  return <SubNav items={items} />;
}
