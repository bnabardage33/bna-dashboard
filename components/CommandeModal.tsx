"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Search } from "lucide-react";
import { LigneCommande } from "@/components/ZoneCard";

type Article = {
  id: string;
  reference?: string;
  code?: string;
  code_decor?: string;
  famille_label?: string;
  couleur?: string;
  description?: string;
  designation: string;
  prix_ht?: number;
  prix_unitaire_ht?: number;
  pu_ht?: number;
  prix?: number;
  unite?: string;
};

type Fournisseur = {
  id: string;
  nom: string;
};

type LigneDevis = LigneCommande & {
  articleSelectionne?: Article | null;
  fournisseurSelectionneId?: string;
  totalHT?: number;
};

export default function CommandeModal({
  isOpen,
  onClose,
  lignesInitiales,
  chantierNom,
  zoneNom,
}: {
  isOpen: boolean;
  onClose: () => void;
  lignesInitiales: LigneCommande[];
  chantierNom: string;
  zoneNom: string;
}) {
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [catalogue, setCatalogue] = useState<Article[]>([]);
  const [fournisseursList, setFournisseursList] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setLignes(lignesInitiales.map(l => ({ ...l, articleSelectionne: null, fournisseurSelectionneId: "", totalHT: 0 })));
      fetchData();
    }
  }, [isOpen, lignesInitiales]);

  const fetchData = async () => {
    setLoading(true);
    // 1. Fetch catalogue
    let { data: catData, error: catError } = await supabase.from("catalogue_ouvrages").select("*");
    
    // Log for debugging
    if (catData && catData.length > 0) {
      console.log("TEST ARTICLE:", catData[0]);
    }

    if (catError || !catData || catData.length === 0) {
      const res = await supabase.from("articles").select("*");
      catData = res.data;
    }
    if (catData) setCatalogue(catData as Article[]);

    // 2. Fetch fournisseurs
    const { data: fournData } = await supabase.from("fournisseurs").select("id, nom");
    if (fournData) setFournisseursList(fournData);

    setLoading(false);
  };

  const getPrix = (a: Article) => a.pu_ht ?? a.prix_ht ?? a.prix_unitaire_ht ?? a.prix ?? 0;
  const getRef = (a: Article) => a.code_decor || a.reference || a.code || a.famille_label || "Sans réf";

  const handleSelectArticle = (index: number, article: Article) => {
    const newLignes = [...lignes];
    newLignes[index].articleSelectionne = article;
    newLignes[index].totalHT = getPrix(article) * newLignes[index].quantite;
    setLignes(newLignes);
    setDropdownOpen({ ...dropdownOpen, [index]: false });
  };

  const handleSelectFournisseur = (index: number, fournisseurId: string) => {
    const newLignes = [...lignes];
    newLignes[index].fournisseurSelectionneId = fournisseurId;
    setLignes(newLignes);
  };

  const handleEnregistrer = () => {
    const selection = lignes.filter(l => l.articleSelectionne).map(l => {
      const fourn = fournisseursList.find(f => f.id === l.fournisseurSelectionneId);
      return {
        besoin: l.designation,
        articleId: l.articleSelectionne!.id,
        quantiteFinale: l.quantite,
        prixUnitaire: getPrix(l.articleSelectionne!),
        totalHT: l.totalHT,
        fournisseurId: l.fournisseurSelectionneId,
        fournisseurNom: fourn ? fourn.nom : "Non spécifié"
      };
    });
    console.log("=== COMMANDE PRÊTE À L'ENREGISTREMENT ===", selection);
    alert("Chiffrage prêt ! Les données ont été tracées dans la console (Préparation BDD).");
  };

  const totalGeneralHT = lignes.reduce((acc, l) => acc + (l.totalHT || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Chiffrage / Commande</h2>
            <p className="text-sm text-slate-400">{chantierNom} — {zoneNom}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {loading ? (
            <div className="text-center py-10 text-slate-400">Chargement des catalogues et fournisseurs...</div>
          ) : (
            <div className="w-full overflow-x-auto pb-4">
              <table className="w-full text-left text-sm text-slate-300 min-w-[700px]">
                <thead className="bg-slate-800/50 text-slate-400 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 font-medium rounded-tl-lg whitespace-nowrap">Besoin (Calepinage)</th>
                    <th className="p-3 font-medium w-32 whitespace-nowrap">Quantité</th>
                    <th className="p-3 font-medium w-[450px] whitespace-nowrap">Référence Catalogue & Fournisseur</th>
                    <th className="p-3 font-medium w-32 text-right whitespace-nowrap">Prix Unitaire</th>
                    <th className="p-3 font-medium w-32 text-right rounded-tr-lg whitespace-nowrap">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {lignes.map((ligne, index) => {
                    const term = searchTerms[index] || "";
                    const lowerSearch = term.toLowerCase();
                    const filteredCatalog = catalogue.filter(o => {
                      if (!lowerSearch) return true;
                      return (
                        o.designation?.toLowerCase().includes(lowerSearch) ||
                        o.description?.toLowerCase().includes(lowerSearch) ||
                        o.couleur?.toLowerCase().includes(lowerSearch) ||
                        o.code_decor?.toLowerCase().includes(lowerSearch) ||
                        o.famille_label?.toLowerCase().includes(lowerSearch) ||
                        o.reference?.toLowerCase().includes(lowerSearch) ||
                        o.code?.toLowerCase().includes(lowerSearch)
                      );
                    }).slice(0, 15);

                    return (
                      <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-medium text-slate-200">{ligne.designation}</td>
                        <td className="p-3 text-sky-400 font-bold">{ligne.quantite} {ligne.unite}</td>
                        <td className="p-3">
                          <div className="flex flex-col gap-2 min-w-[250px]">
                            <div className="relative">
                              {ligne.articleSelectionne ? (
                                <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-400">
                                  <span className="text-sm font-medium">{ligne.articleSelectionne.designation}</span>
                                  <button onClick={() => {
                                    const newLignes = [...lignes];
                                    newLignes[index].articleSelectionne = null;
                                    newLignes[index].totalHT = 0;
                                    setLignes(newLignes);
                                  }} className="hover:text-emerald-300 ml-2 shrink-0"><X size={16} /></button>
                                </div>
                              ) : (
                                <div>
                                  <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input 
                                      type="text" 
                                      placeholder="Rechercher (désignation, couleur, code)..."
                                      value={term}
                                      onChange={e => setSearchTerms({...searchTerms, [index]: e.target.value})}
                                      onFocus={() => setDropdownOpen({...dropdownOpen, [index]: true})}
                                      className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                                    />
                                  </div>
                                  {dropdownOpen[index] && (
                                    <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
                                      {filteredCatalog.map(a => (
                                        <button
                                          key={a.id}
                                          onClick={() => handleSelectArticle(index, a)}
                                          className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0"
                                        >
                                          <span className="text-slate-200 text-xs font-semibold">{a.designation}</span>
                                          <span className="text-slate-500 text-[10px] mt-1">
                                            Réf: {getRef(a)} - {getPrix(a).toFixed(2)}€ HT
                                          </span>
                                        </button>
                                      ))}
                                      {filteredCatalog.length === 0 && (
                                        <div className="p-3 text-xs text-slate-500 text-center">Aucun résultat</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            {/* Menu déroulant du fournisseur (Indépendant de l'article) */}
                            <select 
                              value={ligne.fournisseurSelectionneId || ""}
                              onChange={(e) => handleSelectFournisseur(index, e.target.value)}
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none appearance-none"
                            >
                              <option value="">-- Choisir un fournisseur --</option>
                              {fournisseursList.map(f => (
                                <option key={f.id} value={f.id}>{f.nom}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="p-3 text-right text-slate-300 whitespace-nowrap">
                          {ligne.articleSelectionne ? `${getPrix(ligne.articleSelectionne).toFixed(2)} €` : "—"}
                        </td>
                        <td className="p-3 text-right font-bold text-white whitespace-nowrap">
                          {ligne.totalHT ? `${ligne.totalHT.toFixed(2)} €` : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-slate-800 pt-4 flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4 w-full">
          <p className="text-slate-400 text-sm hidden sm:block">
            Remplissez les correspondances catalogue et choisissez un fournisseur.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-4 sm:border-r border-slate-700 sm:pr-6 w-full sm:w-auto justify-between sm:justify-start">
              <span className="text-sm uppercase tracking-wide text-slate-500">Total Général HT</span>
              <span className="text-2xl font-black text-emerald-400 whitespace-nowrap">{totalGeneralHT.toFixed(2)} €</span>
            </div>
            <button onClick={handleEnregistrer} className="w-full sm:w-auto rounded-lg bg-sky-600 px-6 py-2.5 font-bold text-white hover:bg-sky-500 transition-colors">
              Enregistrer le chiffrage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
