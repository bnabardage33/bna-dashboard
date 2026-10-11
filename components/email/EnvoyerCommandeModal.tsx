"use client";

import { useEffect, useState } from "react";
import { Mail, CheckCircle, AlertCircle, Loader2, Paperclip, Clock } from "lucide-react";
import type { Database } from "@/types/supabase";

type EmailEnvoye = Database["public"]["Tables"]["emails_envoyes"]["Row"];

interface CommandePourEmail {
  id: string;
  designation: string;
  quantite: number | null;
  unite: string | null;
  montant_ht: number | null;
  date_livraison_prevue: string | null;
  fournisseurs: {
    nom: string;
    contact: string | null;
    telephone: string | null;
    email: string | null;
  } | null;
  chantiers: {
    nom: string | null;
    clients: { nom: string } | null;
  } | null;
}

interface EnvoyerCommandeModalProps {
  commande: CommandePourEmail;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EnvoyerCommandeModal({
  commande,
  isOpen,
  onClose,
  onSuccess,
}: EnvoyerCommandeModalProps) {
  const refCommande = `BC-${commande.id.slice(0, 8).toUpperCase()}`;

  const [destinataireEmail, setDestinataireEmail] = useState(
    commande.fournisseurs?.email || ""
  );
  const [destinataireNom, setDestinataireNom] = useState(
    commande.fournisseurs?.contact || commande.fournisseurs?.nom || ""
  );
  const [objet, setObjet] = useState(`Bon de commande ${refCommande}`);
  const [messagePersonnalise, setMessagePersonnalise] = useState("");

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [historique, setHistorique] = useState<EmailEnvoye[]>([]);
  const [loadingHistorique, setLoadingHistorique] = useState(true);

  // Charger l'historique des envois pour cette commande
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchHistorique() {
      try {
        setLoadingHistorique(true);
        const res = await fetch(`/api/commandes/${commande.id}/email`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.data) {
            setHistorique(json.data);
          }
        }
      } catch (err) {
        console.warn("Impossible de charger l'historique email:", err);
      } finally {
        if (isMounted) setLoadingHistorique(false);
      }
    }

    fetchHistorique();

    return () => {
      isMounted = false;
    };
  }, [isOpen, commande.id]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!destinataireEmail) {
      setFeedback({
        type: "error",
        message: "Veuillez renseigner l'adresse email du destinataire.",
      });
      return;
    }

    try {
      setLoading(true);
      setFeedback(null);

      const res = await fetch(`/api/commandes/${commande.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinataire_email: destinataireEmail,
          destinataire_nom: destinataireNom,
          objet,
          message_personnalise: messagePersonnalise,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setFeedback({
          type: "success",
          message:
            "Bon de commande envoyé avec succès au fournisseur via Outlook !",
        });
        if (onSuccess) onSuccess();

        // Rafraîchir l'historique
        const histRes = await fetch(`/api/commandes/${commande.id}/email`);
        if (histRes.ok) {
          const histJson = await histRes.json();
          if (histJson.data) setHistorique(histJson.data);
        }
      } else {
        setFeedback({
          type: "error",
          message: data.error || "Erreur lors de l'envoi de l'email.",
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setFeedback({
        type: "error",
        message: errMsg || "Erreur de connexion au serveur.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#1E1E1E] w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 shadow-2xl text-white overflow-hidden animate-in fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 shrink-0 bg-[#252525]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-400">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Envoyer le Bon de Commande
              </h2>
              <p className="text-xs text-gray-400">
                Réf : <span className="font-mono text-red-400 font-semibold">{refCommande}</span> · {commande.designation}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1E1E1E] hover:text-white transition-colors"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Corps avec scroll si nécessaire */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Badge Provider Outlook V1 */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-xs">
            <span className="text-gray-300 font-medium flex items-center gap-1.5">
              <span>📮</span> Provider actif : <strong className="text-white">Outlook Personnel (SMTP)</strong>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-2xs font-semibold">
              Actif V1
            </span>
          </div>

          {/* Alert feedback */}
          {feedback && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                feedback.type === "success"
                  ? "bg-emerald-950/40 border border-emerald-500/40 text-emerald-300"
                  : "bg-red-950/40 border border-red-500/40 text-red-300"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-semibold">
                  {feedback.type === "success" ? "Envoi réussi" : "Erreur d'envoi"}
                </p>
                <p className="mt-0.5">{feedback.message}</p>
              </div>
            </div>
          )}

          <form id="form-email-commande" onSubmit={handleSubmit} className="space-y-4">
            {/* Destinataire Email & Nom */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Email fournisseur *
                </label>
                <input
                  type="email"
                  required
                  value={destinataireEmail}
                  onChange={(e) => setDestinataireEmail(e.target.value)}
                  placeholder="contact@fournisseur.fr"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Nom / Contact
                </label>
                <input
                  type="text"
                  value={destinataireNom}
                  onChange={(e) => setDestinataireNom(e.target.value)}
                  placeholder="Ex : M. Dupont (Commercial)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Objet */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                Objet de l&apos;email
              </label>
              <input
                type="text"
                required
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              />
            </div>

            {/* Message personnalisé */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                Message personnalisé (facultatif)
              </label>
              <textarea
                rows={3}
                value={messagePersonnalise}
                onChange={(e) => setMessagePersonnalise(e.target.value)}
                placeholder="Précisions de livraison, code d'accès chantier ou contact chef de chantier..."
                className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              />
            </div>

            {/* Badge Pièce Jointe PDF */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl border border-white/10 bg-black/20 text-xs text-gray-300">
              <Paperclip className="h-4 w-4 text-red-400 shrink-0" />
              <div className="flex-1 truncate">
                <span className="font-semibold text-white">Bon_de_Commande_{refCommande}.pdf</span>
                <span className="text-gray-400 ml-1.5">(Généré automatiquement)</span>
              </div>
              <span className="text-2xs bg-red-600/20 text-red-300 px-2 py-0.5 rounded font-mono font-bold">
                PDF officiel
              </span>
            </div>
          </form>

          {/* Section Historique des envois */}
          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Historique des envois
              </span>
              <span className="text-3xs text-gray-500">
                {historique.length} envoi(s)
              </span>
            </div>

            {loadingHistorique ? (
              <p className="text-xs text-gray-500 italic">Chargement de l&apos;historique…</p>
            ) : historique.length === 0 ? (
              <p className="text-xs text-gray-500 italic">
                Aucun email envoyé pour le moment pour cette commande.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {historique.map((h) => {
                  const estSucces = h.statut === "envoye";
                  const dateStr = new Date(h.envoye_le).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={h.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5 text-2xs"
                    >
                      <div className="truncate">
                        <span className="text-gray-300 font-medium">
                          {h.destinataire_email}
                        </span>
                        <span className="text-gray-500 ml-2">{dateStr}</span>
                      </div>
                      <div className="shrink-0">
                        {estSucces ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                            ✅ Envoyé
                          </span>
                        ) : h.statut === "erreur" ? (
                          <span
                            className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-semibold border border-red-500/20"
                            title={h.erreur_detail || "Erreur"}
                          >
                            ⚠️ Échec
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
                            ⏳ En cours
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#252525] shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#1E1E1E] transition-colors disabled:opacity-50"
          >
            Fermer
          </button>
          <button
            type="submit"
            form="form-email-commande"
            disabled={loading || !destinataireEmail}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-md shadow-red-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Envoi en cours…</span>
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                <span>Envoyer au Fournisseur</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
