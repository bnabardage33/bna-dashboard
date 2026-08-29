"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Search } from "lucide-react";
import { LigneCommande } from "@/components/ZoneCard";

type Article = {
  id: string;
  reference: string;
  designation: string;
  prix_ht: number;
  unite?: string;
};

type LigneDevis = LigneCommande & {
  articleSelectionne?: Article | null;
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
  const [loading, setLoading] = useState(true);
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setLignes(lignesInitiales.map(l => ({ ...l, articleSelectionne: null, totalHT: 0 })));
      fetchCatalogue();
    }
  }, [isOpen, lignesInitiales]);

  const fetchCatalogue = async () => {
    setLoading(true);
    // On essaie "catalogue_ouvrages", si vide on essaie "articles"
    let { data, error } = await supabase.from("catalogue_ouvrages").select("*");
    if (error || !data || data.length === 0) {
      const res = await supabase.from("articles").select("*");
      data = res.data;
    }
    if (data) {
      setCatalogue(data as Article[]);
    }
    setLoading(false);
  };

  const handleSelectArticle = (index: number, article: Article) => {
    const newLignes = [...lignes];
    newLignes[index].articleSelectionne = article;
    newLignes[index].totalHT = (article.prix_ht || 0) * newLignes[index].quantite;
    setLignes(newLignes);
    setDropdownOpen({ ...dropdownOpen, [index]: false });
  };

  const totalGeneralHT = lignes.reduce((acc, l) => acc + (l.totalHT || 0), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
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
            <div className="text-center py-10 text-slate-400">Chargement du catalogue...</div>
          ) : (
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/50 text-slate-400 sticky top-0 z-10">
                <tr>
                  <th className="p-3 font-medium rounded-tl-lg">Besoin (Calepinage)</th>
                  <th className="p-3 font-medium w-32">Quantité</th>
                  <th className="p-3 font-medium w-96">Référence Catalogue</th>
                  <th className="p-3 font-medium w-32 text-right">Prix Unitaire</th>
                  <th className="p-3 font-medium w-32 text-right rounded-tr-lg">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {lignes.map((ligne, index) => {
                  const term = searchTerms[index] || "";
                  const filteredCatalog = catalogue.filter(a => 
                    a.designation?.toLowerCase().includes(term.toLowerCase()) || 
                    a.reference?.toLowerCase().includes(term.toLowerCase())
                  ).slice(0, 15);

                  return (
                    <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-medium text-slate-200">{ligne.designation}</td>
                      <td className="p-3 text-sky-400 font-bold">{ligne.quantite} {ligne.unite}</td>
                      <td className="p-3">
                        <div className="relative">
                          {ligne.articleSelectionne ? (
                            <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-400">
                              <span className="truncate pr-2">{ligne.articleSelectionne.designation}</span>
                              <button onClick={() => {
                                const newLignes = [...lignes];
                                newLignes[index].articleSelectionne = null;
                                newLignes[index].totalHT = 0;
                                setLignes(newLignes);
                              }} className="hover:text-emerald-300"><X size={14} /></button>
                            </div>
                          ) : (
                            <div>
                              <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input 
                                  type="text" 
                                  placeholder="Rechercher une référence..."
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
                                      <span className="text-slate-500 text-[10px]">Réf: {a.reference} - {a.prix_ht}€ HT</span>
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
                      </td>
                      <td className="p-3 text-right text-slate-300">
                        {ligne.articleSelectionne ? `${ligne.articleSelectionne.prix_ht?.toFixed(2) || "0.00"} €` : "—"}
                      </td>
                      <td className="p-3 text-right font-bold text-white">
                        {ligne.totalHT ? `${ligne.totalHT.toFixed(2)} €` : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 border-t border-slate-800 pt-4 flex items-center justify-between">
          <p className="text-slate-400 text-sm">
            Remplissez les correspondances catalogue pour obtenir le chiffrage.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-sm uppercase tracking-wide text-slate-500">Total Général HT</span>
            <span className="text-2xl font-black text-emerald-400">{totalGeneralHT.toFixed(2)} €</span>
          </div>
        </div>
      </div>
    </div>
  );
}
