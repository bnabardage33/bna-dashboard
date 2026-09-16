'use client';

import React, { useState, useRef, useEffect, use } from "react";
import {
  FileText, CheckCircle2, MessageSquare, Clock, Download,
  AlertCircle, Camera, HardHat, Send, X, Check, Bell, User, Wrench, Clipboard,
  Printer, CloudRain
} from "lucide-react";
import Image from "next/image";
import DocumentPDF, { type Entreprise, type Client, type DocumentData } from "@/components/DocumentPDF";
import RapportClientPrint from "@/components/rapports/RapportClientPrint";
import { calculerAidesITE } from "@/lib/primesCalcul";
import {
  analyserSnapshot,
  preparerEtImprimer,
  STYLES_PRINT_RAPPORT,
  type RapportClientLeger,
  type SnapshotContenu,
} from "@/lib/rapports-client";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChantierData {
  id: string;
  nom: string;
  adresse_chantier: string;
  date_fin_estimee?: string;
  created_at?: string;
  client_id?: string;
}

interface ClientData extends Client {}

interface AvancementDetails {
  nord?: Record<string, boolean>;
  sud?: Record<string, boolean>;
  est?: Record<string, boolean>;
  ouest?: Record<string, boolean>;
}

interface DevisLigne {
  qte: number;
  pu_ht: number;
}

interface DevisRow extends DocumentData {
  id: string;
}

interface FactureRow extends DocumentData {
  id: string;
}

type ActiveDoc = DocumentData & { id: string };

interface PhotoData {
  id: string;
  url_image: string;
  titre: string;
  date_ajout: string;
}

interface Intemperie {
  id: string;
  numero: string;
  motif: string;
  jour_arrete: boolean;
  cree_le: string;
  pluie_cumul?: number | null;
  rafales_max?: number | null;
  ampleur_impact?: string | null;
}

const TASKS_CATEGORIES = [
  { id: "nord", label: "Façade Nord", tasks: ["ossature", "isolation", "bardage", "finitions"] },
  { id: "sud", label: "Façade Sud", tasks: ["ossature", "isolation", "bardage", "finitions"] },
  { id: "est", label: "Façade Est", tasks: ["ossature", "isolation", "bardage", "finitions"] },
  { id: "ouest", label: "Façade Ouest", tasks: ["ossature", "isolation", "bardage", "finitions"] }
] as const;

export default function ClientPortalPrototype({ params }: { params: Promise<{ code_acces: string }> }) {
  const unwrappedParams = use(params);
  const codeAcces = unwrappedParams.code_acces;
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [chantierData, setChantierData] = useState<ChantierData | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [avancement, setAvancement] = useState<number>(0);
  const [avancementDetails, setAvancementDetails] = useState<AvancementDetails | null>(null);
  const [devisData, setDevisData] = useState<DevisRow[]>([]);
  const [facturesData, setFacturesData] = useState<FactureRow[]>([]);
  const [activeDoc, setActiveDoc] = useState<ActiveDoc | null>(null);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);

  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoData | null>(null);

  const [rapportsClient, setRapportsClient] = useState<RapportClientLeger[]>([]);
  const [intemperies, setIntemperies] = useState<Intemperie[]>([]);
  const [apercuRapport, setApercuRapport] = useState<{
    titre: string;
    snapshot: SnapshotContenu;
  } | null>(null);

  useEffect(() => {
    const fetchRealData = async () => {
      try {
        const res = await fetch(`/api/espace-client/${codeAcces}`, { cache: "no-store" });

        if (!res.ok) {
          setChatMessages([
            { role: 'assistant', content: "Bonjour ! Ce code d'accès semble invalide, mais vous pouvez tester le chatbot." }
          ]);
          return;
        }

        const data: {
          entreprise?: Entreprise;
          chantier?: ChantierData;
          client?: ClientData;
          avancement: number;
          avancementDetails?: AvancementDetails;
          devis?: DevisRow[];
          factures?: FactureRow[];
          rapports?: RapportClientLeger[];
          intemperies?: Intemperie[];
        } = await res.json();

        if (data.entreprise) setEntreprise(data.entreprise);
        if (data.chantier) setChantierData(data.chantier);
        if (data.client) setClientData(data.client);
        setAvancement(data.avancement);
        if (data.avancementDetails) setAvancementDetails(data.avancementDetails);
        setDevisData(data.devis || []);
        setFacturesData(data.factures || []);
        setRapportsClient(data.rapports || []);
        setIntemperies(data.intemperies || []);

        if (data.chantier?.id) {
          const photosRes = await fetch(`/api/photos-chantier?chantier_id=${data.chantier.id}`);
          const photosData: { photos?: PhotoData[] } = await photosRes.json();
          setPhotos(photosData.photos || []);
        }

        const clientName = data.client?.nom || "Client";
        const chantierNom = data.chantier?.nom || "d'Arcachon";
        setChatMessages([
          { role: 'assistant', content: `Bonjour, je suis l'assistant BNA, comment puis-je vous aider sur votre chantier ${chantierNom} ?` }
        ]);
        nouvelleSession();
      } catch {
        console.error("Failed to fetch real data");
      } finally {
        setIsPageLoading(false);
      }
    };
    
    if (codeAcces) {
      fetchRealData();
    }
  }, [codeAcces]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isChatOpen]);

  const hasSummarized = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const nouvelleSession = () => {
    sessionIdRef.current = crypto.randomUUID();
    hasSummarized.current = false;
  };

  const endConversationAndSummarize = async (finalMessages: ChatMessage[]) => {
    if (hasSummarized.current) return;
    hasSummarized.current = true;
    
    try {
      await fetch('/api/chat-client-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: finalMessages,
          clientName: clientData?.nom || "Client",
          chantierId: chantierData?.id || null,
          sessionId: sessionIdRef.current
        })
      });
    } catch {
      console.error("Failed to summarize");
    }
  };

  const closeChat = () => {
    setIsChatOpen(false);
    if (chatMessages.length > 1 && !hasSummarized.current) {
      endConversationAndSummarize(chatMessages);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: inputValue };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setInputValue("");
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages,
          clientName: clientData?.nom || "Client",
          chantierName: chantierData?.nom || "Chantier",
          chantierId: chantierData?.id || null,
          avancement: avancement,
          sessionId: sessionIdRef.current
        })
      });
      const data = await res.json();
      
      if (data.texte) {
        let botText = data.texte;
        let isFin = false;
        if (botText.includes('[FIN_CONVERSATION]')) {
          botText = botText.replace('[FIN_CONVERSATION]', '').trim();
          isFin = true;
        }
        
        const finalMessages = [...newMessages];
        if (botText) {
          finalMessages.push({ role: 'assistant', content: botText });
        }
        setChatMessages(finalMessages);
        
        if (isFin) {
          endConversationAndSummarize(finalMessages);
          setTimeout(() => {
            setIsChatOpen(false);
          }, 3000);
        }
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: "Désolé, je rencontre un problème de connexion. Je laisse un message au patron." }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Erreur de réseau." }]);
    }
    setIsLoading(false);
  };

  const displayName = clientData?.nom || "Jean Dupont";
  const initials = displayName.substring(0, 2).toUpperCase();
  const displayChantier = chantierData?.nom || "Rénovation Façade HPL";
  const displayAddress = chantierData?.adresse_chantier || "12 Rue des Lilas, Lyon";

  const [isDevisOpen, setIsDevisOpen] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, rect: DOMRect) => {
    const touch = (e as React.TouchEvent<HTMLCanvasElement>).touches?.[0];
    const clientX = touch ? touch.clientX : (e as React.MouseEvent<HTMLCanvasElement>).clientX;
    const clientY = touch ? touch.clientY : (e as React.MouseEvent<HTMLCanvasElement>).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const { x, y } = getCanvasCoords(e, rect);
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const { x, y } = getCanvasCoords(e, rect);
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL());
    }
  };
  
  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  const submitSignature = async () => {
    if (!signatureData) return;
    
    if (activeDoc) {
      try {
        const res = await fetch(`/api/espace-client/${codeAcces}/signer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId: activeDoc.id, docKind: activeDoc.kind }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error("Erreur signature", data.error || res.status);
          return;
        }
      } catch {
        console.error("Erreur signature");
        return;
      }
    }
    
    setIsSigned(true);
    setTimeout(() => {
      setIsDevisOpen(false);
    }, 2000);
  };

  const docEstSigne = isSigned || (activeDoc && (activeDoc.statut === 'accepte' || activeDoc.statut === 'payee'));

  const calculateEstimatedEndDate = () => {
    let endDateStr = chantierData?.date_fin_estimee;
    let endDate: Date;
    
    if (endDateStr) {
      endDate = new Date(endDateStr);
    } else if (chantierData?.created_at) {
      endDate = new Date(chantierData.created_at);
      endDate.setMonth(endDate.getMonth() + 2);
    } else {
      endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 2);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (endDate < today) {
      return "Date à redéfinir";
    }

    return endDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const calculateProgression = () => {
    if (!avancementDetails) return avancement;
    let total = 0;
    let checked = 0;
    
    for (const cat of TASKS_CATEGORIES) {
      for (const t of cat.tasks) {
        total++;
        if (avancementDetails[cat.id]?.[t] === true) {
          checked++;
        }
      }
    }
    return total === 0 ? 0 : Math.round((checked / total) * 100);
  };

  const avancementDynamique = avancementDetails ? calculateProgression() : avancement;

  const renderBadges = () => {
    return TASKS_CATEGORIES.map(cat => {
      let catTotal = cat.tasks.length;
      let catChecked = 0;
      cat.tasks.forEach(t => {
        if (avancementDetails?.[cat.id]?.[t] === true) {
          catChecked++;
        }
      });
      
      let status = "À commencer";
      let colorClass = "text-gray-400";
      let Icon = Clipboard;

      if (catChecked === catTotal && catTotal > 0) {
        status = "Terminée";
        colorClass = "text-[#10B981]";
        Icon = Check;
      } else if (catChecked > 0) {
        status = "En cours";
        colorClass = "text-[#F59E0B]";
        Icon = Wrench;
      }

      return (
        <div key={cat.id} className={`rounded-xl p-3 flex flex-col items-center justify-center gap-2 text-center ${catChecked > 0 ? 'bg-[#F2F2F2]' : 'bg-gray-50 border border-gray-100'}`}>
          <Icon className={colorClass} size={20} />
          <span className="text-[10px] font-bold text-[#111111] leading-tight">{cat.label}<br/>{status}</span>
        </div>
      );
    });
  };

  if (isPageLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-800" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 pb-[130px] font-sans relative">
      <style dangerouslySetInnerHTML={{__html: `
        html, body { background: white !important;
      `}} />

      <main className="p-4 pt-2 max-w-3xl mx-auto space-y-6 relative z-10">
        
        {/* CARTE TITRE */}
        <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
          <span className="bg-[#E30613] text-[#FFFFFF] px-3 py-1 rounded-full text-xs font-bold inline-block mb-3">★ CLIENT PREMIUM</span>
          <h1 className="font-black text-2xl text-[#111111] mb-1 leading-tight">Bardage métallique — {chantierData?.nom || "Villa Arcachon"}</h1>
          <p className="text-xs text-gray-500 font-medium">Résidence privée • {chantierData?.adresse_chantier || "33380 Arcachon"} • Chantier #{chantierData?.id?.substring(0,6).toUpperCase() || 'BNA-7429'}</p>
        </section>

        {/* CARTE PROGRESSION */}
        <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-[#111111]">Progression du chantier</h2>
            <span className="bg-[#E30613] text-white text-sm font-bold px-3 py-1 rounded-full">{avancementDynamique}%</span>
          </div>
          
          <div className="w-full bg-[#F2F2F2] h-3 rounded-full mb-2 overflow-hidden">
            <div className="bg-[#E30613] h-3 rounded-full transition-all duration-1000" style={{ width: `${avancementDynamique}%` }}></div>
          </div>
          
          <p className="text-xs text-gray-500 mb-5">{avancementDynamique}% terminé • Estimation fin: {calculateEstimatedEndDate()}</p>
          
          <div className="grid grid-cols-2 gap-2">
            {renderBadges()}
          </div>
        </section>

        {/* PHOTOS RÉCENTES - Carrousel */}
        {photos.length > 0 && (
          <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[#111111]">📸 Photos récentes</h3>
              <span className="text-xs text-gray-500 font-medium">{photos.length} photo{photos.length > 1 ? 's' : ''}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <style dangerouslySetInnerHTML={{__html: `.photo-scroll::-webkit-scrollbar{display:none}`}} />
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="shrink-0 w-[140px] cursor-pointer"
                  onClick={() => setLightboxPhoto(photo)}
                >
                  <div className="w-[140px] h-[140px] rounded-xl overflow-hidden border border-[#111111] shadow-sm">
                    <Image src={photo.url_image} alt={photo.titre} className="w-full h-full object-cover"  width={100} height={100} />
                  </div>
                  <p className="text-[10px] font-bold text-[#111111] mt-1.5 truncate text-center">{photo.titre}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* LIGHTBOX */}
        {lightboxPhoto && (
          <div
            className="fixed inset-0 z-[10000] bg-black/95 flex flex-col items-center justify-center p-4"
            onClick={() => setLightboxPhoto(null)}
          >
            <button
              onClick={() => setLightboxPhoto(null)}
              className="absolute top-5 right-5 w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition"
            >
              <X size={22} />
            </button>
            <Image
              src={lightboxPhoto.url_image}
              alt={lightboxPhoto.titre}
              className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="mt-4 text-center">
              <p className="text-white font-bold text-base">{lightboxPhoto.titre}</p>
              <p className="text-white/50 text-xs mt-1">
                {new Date(lightboxPhoto.date_ajout).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        )}

        {/* DOCUMENTS CARD (Détails du chantier) */}
        <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
          <h3 className="font-bold mb-4 text-[#111111]">Détails du chantier</h3>
          <div className="space-y-3">
            {devisData.length === 0 && facturesData.length === 0 ? (
              <p className="text-sm text-gray-500 italic text-center py-4">Aucun document à signer pour l'instant.</p>
            ) : (
              <>
                {devisData.map((devis) => {
                  const estSigne = isSigned || devis.statut === 'accepte';
                  const totalHT = (devis.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                  const totalTTC = totalHT * (1 + (devis.tva_pct || 20) / 100);
                  return (
                    <div key={`devis-wrapper-${devis.id}`} className="flex flex-col gap-2">
                    <div
                      onClick={() => { setActiveDoc({ ...devis, kind: 'devis' }); setIsDevisOpen(true); }}
                      className="p-4 flex items-center justify-between group cursor-pointer border border-[#111111] rounded-xl bg-[#F2F2F2]"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-white border border-[#111111]`}>
                          {estSigne ? <CheckCircle2 size={18} className="text-[#111111]" /> : <FileText size={18} className="text-[#111111]" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#111111]">{devis.numero} – {devis.objet || 'Devis'}</p>
                          {estSigne ? (
                            <p className="text-xs font-semibold text-[#111111]">Statut : Validé et Signé</p>
                          ) : (
                            <p className="text-xs font-semibold text-[#E30613]">Action requise : En attente de signature</p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5">Total TTC : {totalTTC.toFixed(2)} €</p>
                        </div>
                      </div>
                      {estSigne ? (
                        <button className="text-[#111111] text-xs font-bold px-3 py-1.5 transition">Consulter</button>
                      ) : (
                        <button className="bg-[#E30613] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition">Signer</button>
                      )}
                    </div>

                    {devis.profil_revenu && devis.profil_revenu !== "aucun" && (
                      (() => {
                        const aides = calculerAidesITE(devis.surface_m2 || 0, devis.profil_revenu as any, totalHT);
                        if (aides.totalAides > 0) {
                          const reste = Math.max(0, totalTTC - aides.totalAides);
                          return (
                            <div className="mt-2 p-4 border border-cyan-500/30 rounded-xl bg-cyan-50">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-cyan-700 font-bold text-sm">💡 Simulation de vos aides d'État (MaPrimeRénov' + CEE)</span>
                              </div>
                              <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between text-gray-600">
                                  <span>Montant global des travaux (TTC)</span>
                                  <span className="font-mono">{totalTTC.toFixed(2)} €</span>
                                </div>
                                <div className="flex justify-between text-cyan-700 font-semibold">
                                  <span>Primes estimées (Plafond Légal inclus)</span>
                                  <span className="font-mono">- {aides.totalAides.toFixed(2)} €</span>
                                </div>
                                <div className="h-px bg-cyan-200 my-1" />
                                <div className="flex justify-between font-bold text-gray-900 text-base">
                                  <span>Reste à charge net</span>
                                  <span className="font-mono text-cyan-800">{reste.toFixed(2)} €</span>
                                </div>
                              </div>
                              <p className="text-[10px] text-gray-500 mt-3 italic leading-tight">
                                Ce reste à charge peut être financé par un Éco-Prêt à Taux Zéro (Éco-PTZ). Rapprochez-vous de votre conseiller BNA.
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()
                    )}
                  </div>
                  );
                })}
                
                {facturesData.map((facture) => {
                  const estPayee = isSigned || facture.statut === 'payee';
                  const totalHT = (facture.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                  const totalTTC = totalHT * (1 + (facture.tva_pct || 20) / 100);
                  return (
                    <div
                      key={`facture-${facture.id}`}
                      onClick={() => { setActiveDoc({ ...facture, kind: 'facture' }); setIsDevisOpen(true); }}
                      className="p-4 flex items-center justify-between group cursor-pointer border border-[#111111] rounded-xl bg-[#F2F2F2]"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-white border border-[#111111]`}>
                          {estPayee ? <CheckCircle2 size={18} className="text-[#111111]" /> : <FileText size={18} className="text-[#111111]" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#111111]">{facture.numero} – {facture.objet || 'Facture'}</p>
                          {estPayee ? (
                            <p className="text-xs font-semibold text-[#111111]">Statut : Réglée / Complétée</p>
                          ) : (
                            <p className="text-xs font-semibold text-[#E30613]">Action requise : À régler</p>
                          )}
                          <p className="text-xs text-gray-500 mt-0.5">Total TTC : {totalTTC.toFixed(2)} €</p>
                        </div>
                      </div>
                      {estPayee ? (
                        <button className="text-[#111111] text-xs font-bold px-3 py-1.5 transition">Consulter</button>
                      ) : (
                        <button className="bg-[#E30613] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition">Action</button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
            
            <div className="flex items-center justify-between p-3 border border-[#111111] rounded-xl bg-[#F2F2F2] opacity-70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white text-[#111111] border border-[#111111] rounded-lg flex items-center justify-center">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#111111]">Attestation d'Assurance</p>
                  <p className="text-xs text-gray-500">Téléchargé le 12/08/2026</p>
                </div>
              </div>
              <button className="text-[#111111] text-xs font-semibold px-2 py-1">Voir</button>
            </div>
          </div>
        </section>

        {/* RAPPORTS HEBDOMADAIRES */}
        {rapportsClient.length > 0 && (
          <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
            <h3 className="font-bold mb-4 text-[#111111]">Rapports hebdomadaires</h3>
            <div className="space-y-3">
              {rapportsClient.map((rapport) => {
                const snapshot = analyserSnapshot(rapport.contenu);
                const delta = snapshot?.avancement.delta ?? 0;
                const photo = snapshot?.photos?.[0];
                return (
                  <button
                    key={rapport.id}
                    type="button"
                    onClick={() => {
                      if (snapshot) {
                        setApercuRapport({ titre: rapport.semaine_label, snapshot });
                      }
                    }}
                    className="w-full p-4 flex items-center justify-between group cursor-pointer border border-[#111111] rounded-xl bg-[#F2F2F2] text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {photo ? (
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-[#111111] shrink-0 bg-white">
                          <Image
                            src={photo.url}
                            alt={photo.legende || "Photo de chantier"}
                            width={112}
                            height={112}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-[#111111] bg-white flex items-center justify-center shrink-0">
                          <FileText size={20} className="text-[#111111]" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#111111] truncate">{rapport.semaine_label}</p>
                        <p className="text-xs font-semibold text-[#E30613]">
                          Avancement : +{delta} point{Math.abs(delta) > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-[#111111] text-xs font-bold px-3 py-1.5 shrink-0">Consulter</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* INTEMPÉRIES (justificatifs auto) */}
        <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
          <h3 className="font-bold mb-1 text-[#111111]">Intempéries & justificatifs</h3>
          <p className="text-xs text-[#111111]/70 mb-4">Arrêts de chantier dus à la météo, relevés automatiquement — envoyables à votre assurance en cas de besoin.</p>
          {intemperies.filter((intemp) => intemp.jour_arrete === true).length === 0 ? (
            <div className="p-3 rounded-xl border border-[#111111] bg-[#F2F2F2]">
              <p className="text-sm font-semibold text-[#111111]">Aucun arrêt météo signalé à ce jour.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {intemperies.filter((intemp) => intemp.jour_arrete === true).map((intemp) => {
                const dateLabel = intemp.cree_le
                  ? new Date(intemp.cree_le).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
                  : "—";
                return (
                  <div
                    key={intemp.id}
                    className="p-3 rounded-xl border bg-[#FDF1F0] border-[#E30613]/40 flex items-start gap-3"
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#E30613] text-white">
                      <CloudRain size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#111111]">
                        Chantier à l'arrêt le {dateLabel}
                      </p>
                      <p className="text-xs text-[#111111]/80 mt-0.5">{intemp.motif}</p>
                      <p className="text-[11px] font-semibold text-[#E30613] mt-1">
                        {intemp.numero ? `Justificatif ${intemp.numero} — ` : ""}Reprise prévue dès la fin des intempéries.
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* PROCHAINES ETAPES */}
        <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
          <h3 className="font-bold mb-4 text-[#111111]">Prochaines étapes</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#F2F2F2] rounded-xl border border-[#111111]">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-[#111111] text-xs border border-[#111111]">1</div>
              <p className="text-sm font-bold text-[#111111]">Livraison des matériaux complémentaires</p>
            </div>
            <div className="flex items-center gap-3 p-3 bg-[#F2F2F2] rounded-xl border border-[#111111]">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-[#111111] text-xs border border-[#111111]">2</div>
              <p className="text-sm font-bold text-[#111111]">Pose de la Façade Ouest</p>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-dashed border-[#111111] opacity-50">
              <div className="w-8 h-8 rounded-full bg-[#F2F2F2] flex items-center justify-center font-bold text-gray-400 text-xs border border-gray-300">3</div>
              <p className="text-sm font-bold text-gray-500">Nettoyage du chantier et réception</p>
            </div>
          </div>
        </section>
      </main>

      {/* Chatbot Interface - Bottom Sheet */}
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] transition-opacity duration-300 ${isChatOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={closeChat}
      />

      {/* Drawer */}
      <div className={`fixed bottom-0 left-0 right-0 h-[85vh] max-h-[800px] bg-white rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 z-[9999] ${isChatOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-[#111111] text-white p-5 flex justify-between items-center rounded-t-[32px]">
          <div className="flex items-center gap-2">
            <span className="text-[#E30613] text-xl">✦</span>
            <span className="font-bold text-lg">Assistant IA BNA</span>
          </div>
          <button onClick={closeChat} className="text-white/70 hover:text-white transition cursor-pointer w-8 h-8 flex items-center justify-center bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 p-5 overflow-y-auto bg-slate-50 flex flex-col gap-4 custom-scrollbar" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f8fafc' }}>
          <style dangerouslySetInnerHTML={{__html: `
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
          `}} />
          {chatMessages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-3 rounded-2xl max-w-[85%] text-[15px] ${msg.role === 'user' ? 'bg-[#111111] text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex flex-col items-start">
              <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-500 rounded-bl-sm flex gap-1 shadow-sm">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 pb-6 bg-white border-t border-slate-100 flex gap-3">
          <input 
            type="text" 
            placeholder="Posez votre question..." 
            className="flex-1 bg-[#F2F2F2] border border-transparent focus:bg-white focus:border-[#111111] focus:ring-1 focus:ring-[#111111] rounded-full px-5 py-3 text-[15px] outline-none transition"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || isLoading}
            className="bg-[#E30613] hover:bg-[#C00510] disabled:opacity-50 text-white w-12 h-12 rounded-full flex items-center justify-center transition cursor-pointer shadow-md shrink-0"
          >
            <Send size={20} />
          </button>
        </form>
      </div>

      {/* Footer fixe (Jumeaux WhatsApp & IA) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white h-[110px] px-4 flex items-center gap-3 z-50">
        <button 
          onClick={() => window.open(`https://wa.me/33600000000?text=${encodeURIComponent('Bonjour BNA Bardage Chantier ' + (chantierData?.id?.substring(0,6).toUpperCase() || 'F59932'))}`, '_blank')}
          className="flex-1 bg-[#E30613] text-white rounded-full h-[60px] font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg"
        >
          💬 BNA Bardage
        </button>
        <button 
          onClick={() => {
            if (isChatOpen) closeChat();
            else { setIsChatOpen(true); nouvelleSession(); }
          }}
          className="flex-1 bg-black text-white rounded-full h-[60px] font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg"
        >
          ✦ Assistant IA
        </button>
      </div>

      {/* Signature / Document Modal */}
      {isDevisOpen && (
        <div className="fixed inset-0 z-[9999] bg-[#111111]/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl bg-white rounded-3xl overflow-y-auto shadow-2xl flex flex-col max-h-[90vh]">

            {/* En-tête */}
            <div className="p-4 bg-[#111111] text-white flex justify-between items-center rounded-t-[32px]">
              <h2 className="font-bold">{docEstSigne ? "Document Signé" : "Signature du document"}</h2>
              <button onClick={() => setIsDevisOpen(false)} className="text-slate-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            {/* Récapitulatif devis — toujours visible */}
            <div className="p-6 bg-slate-50 border-b border-slate-200 overflow-y-auto">
              {entreprise && activeDoc && (
                <div className="bg-white">
                  <DocumentPDF 
                    doc={activeDoc} 
                    entreprise={entreprise} 
                    client={clientData || { nom: 'Client', societe: null, adresse_facturation: null, code_postal: null, ville: null, tel: null, email: null }} 
                  />
                </div>
              )}

              {docEstSigne && !isSigned && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3 bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200">
                    <CheckCircle2 size={22} className="text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium">Ce document a été validé. L'équipe BNA s'occupe de la suite !</p>
                  </div>
                  <button className="flex items-center justify-center gap-2 w-full py-3 bg-[#111111] text-white rounded-xl font-bold hover:bg-slate-800 transition">
                    <Download size={18} />
                    Télécharger le document signé (PDF)
                  </button>
                </div>
              )}

              {!docEstSigne && (
                <p className="text-xs text-slate-500 italic">Je soussigné(e) {displayName}, donne mon bon pour accord.</p>
              )}
            </div>

            {/* Écran de succès juste après signature */}
            {isSigned && (
              <div className="flex flex-col items-center justify-center p-10 text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                  <Check size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-1">Document signé !</h3>
                <p className="text-slate-500 text-sm">Merci, l'équipe BNA a bien reçu votre accord.</p>
              </div>
            )}

            {/* Zone de signature — uniquement si pas encore signé */}
            {!docEstSigne && !isSigned && (
              <div className="p-6 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-bold text-slate-800">Votre signature ci-dessous :</label>
                  <button onClick={clearSignature} className="text-xs text-slate-400 hover:text-slate-600 underline">Effacer</button>
                </div>
                <div className="w-full h-44 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 overflow-hidden relative touch-none">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={176}
                    className="w-full h-full cursor-crosshair touch-none absolute inset-0"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {!isDrawing && !signatureData && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-slate-300 font-medium text-lg">Signez avec le doigt</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={submitSignature}
                  disabled={!signatureData}
                  className={`mt-4 w-full py-4 rounded-xl font-bold text-white transition-all text-lg ${signatureData ? 'bg-amber-500 hover:bg-amber-400 shadow-xl shadow-amber-500/20' : 'bg-slate-300 cursor-not-allowed'}`}
                >
                  Valider ma signature
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    {/* Overlay : rapport hebdomadaire (rendu clair, imprimable) */}
      {apercuRapport && (
        <div className="fixed inset-0 z-[10001] overflow-y-auto bg-black/80 p-4 sm:p-6 print:overflow-visible print:bg-white print:p-0">
          <style>{STYLES_PRINT_RAPPORT}</style>

          <div className="mx-auto mb-4 flex max-w-[860px] items-center justify-between gap-3 print:hidden">
            <h2 className="font-bold text-white">{apercuRapport.titre}</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { void preparerEtImprimer(); }}
                className="bg-[#E30613] text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition hover:bg-[#C00510] flex items-center gap-1.5"
              >
                <Printer size={14} />
                Imprimer / PDF
              </button>
              <button
                type="button"
                onClick={() => setApercuRapport(null)}
                className="bg-white/10 text-white text-xs font-bold px-4 py-2 rounded-lg transition hover:bg-white/20 flex items-center gap-1.5"
              >
                <X size={14} />
                Fermer
              </button>
            </div>
          </div>

          <RapportClientPrint
            snapshot={apercuRapport.snapshot}
            semaineLabel={apercuRapport.titre}
            entreprise={entreprise}
          />
        </div>
      )}

    </div>
  );
}