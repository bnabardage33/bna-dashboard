'use client';

import React, { useState, useRef, useEffect, use } from "react";
import { 
  FileText, CheckCircle2, MessageSquare, Clock, Download,
  AlertCircle, Camera, HardHat, Send, X, Check, Bell, User, Wrench, Clipboard
} from "lucide-react";
import DocumentPDF from "@/components/DocumentPDF";

export default function ClientPortalPrototype({ params }: { params: Promise<{ code_acces: string }> }) {
  const unwrappedParams = use(params);
  const codeAcces = unwrappedParams.code_acces;
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Real data states
  const [chantierData, setChantierData] = useState<any>(null);
  const [clientData, setClientData] = useState<any>(null);
  const [avancement, setAvancement] = useState<number>(0);
  const [devisData, setDevisData] = useState<any[]>([]);
  const [facturesData, setFacturesData] = useState<any[]>([]);
  const [activeDoc, setActiveDoc] = useState<any>(null);
  const [entreprise, setEntreprise] = useState<any>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);

  // Photos
  const [photos, setPhotos] = useState<any[]>([]);
  const [lightboxPhoto, setLightboxPhoto] = useState<any>(null);

  useEffect(() => {
    // Fetch real data on mount
    const fetchRealData = async () => {
      try {
        const res = await fetch(`/api/espace-client/${codeAcces}`, { cache: "no-store" });

        if (!res.ok) {
          setChatMessages([
            { role: 'assistant', content: "Bonjour ! Ce code d'accès semble invalide, mais vous pouvez tester le chatbot." }
          ]);
          return;
        }

        const data = await res.json();
        console.log("=== DATA REÇUE CLIENT ===", data);

        if (data.entreprise) setEntreprise(data.entreprise);
        setChantierData(data.chantier);
        setClientData(data.client);
        setAvancement(data.avancement);
        setDevisData(data.devis || []);
        setFacturesData(data.factures || []);

        // Charger les photos du chantier
        if (data.chantier?.id) {
          const photosRes = await fetch(`/api/photos-chantier?chantier_id=${data.chantier.id}`);
          const photosData = await photosRes.json();
          setPhotos(photosData.photos || []);
        }

        const clientName = data.client?.nom || "Client";
        const chantierNom = data.chantier?.nom || "d'Arcachon";
        setChatMessages([
          { role: 'assistant', content: `Bonjour, je suis l'assistant BNA, comment puis-je vous aider sur votre chantier ${chantierNom} ?` }
        ]);
      } catch (e) {
        console.error("Failed to fetch real data", e);
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

  const endConversationAndSummarize = async (finalMessages: any[]) => {
    if (hasSummarized.current) return;
    hasSummarized.current = true;
    
    try {
      await fetch('/api/chat-client-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: finalMessages,
          clientName: clientData?.nom || "Client"
        })
      });
    } catch (e) {
      console.error("Failed to summarize", e);
    }
  };

  const closeChat = () => {
    setIsChatOpen(false);
    // Send background request to summarize when the user manually closes the chat
    if (chatMessages.length > 1 && !hasSummarized.current) {
      endConversationAndSummarize(chatMessages);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMsg = { role: 'user', content: inputValue };
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
          avancement: avancement
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
          // Auto close the chat after 3 seconds
          setTimeout(() => {
            setIsChatOpen(false);
          }, 3000);
        }
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: "Désolé, je rencontre un problème de connexion. Je laisse un message au patron." }]);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Erreur de réseau." }]);
    }
    setIsLoading(false);
  };

  // Variables d'affichage dynamique
  const displayName = clientData?.nom || "Jean Dupont";
  const initials = displayName.substring(0, 2).toUpperCase();
  const displayChantier = chantierData?.nom || "Rénovation Façade HPL";
  const displayAddress = chantierData?.adresse_chantier || "12 Rue des Lilas, Lyon";

  // Signature states
  const [isDevisOpen, setIsDevisOpen] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    
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
      } catch (e) {
        console.error("Erreur signature", e);
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
    let endDate;
    
    if (endDateStr) {
      endDate = new Date(endDateStr);
    } else if (chantierData?.created_at) {
      // Fallback : +2 mois après la création si pas de date de fin
      endDate = new Date(chantierData.created_at);
      endDate.setMonth(endDate.getMonth() + 2);
    } else {
      // Fallback sécurité : +2 mois après aujourd'hui
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
        html, body { background: white !important; }
        div[class*="bg-slate-900"], div[class*="bg-[#0"] { display: none !important; }
      `}} />
      {/* Header */}
      <header className="bg-black h-[88px] px-4 flex items-center justify-between rounded-b-[28px] relative z-0">
        <img
          src="/logo-bna.png"
          alt="BNA Bardage"
          className="h-[74px] w-auto object-contain"
        />
        <span className="text-white font-bold text-[13.5px] tracking-wide whitespace-nowrap">BNA - Service Client</span>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-6 -mt-4 relative z-10">
        
        {/* CARTE TITRE */}
        <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
          <span className="bg-[#E30613] text-[#FFFFFF] px-3 py-1 rounded-full text-xs font-bold inline-block mb-3">★ CLIENT PREMIUM</span>
          <h1 className="font-black text-2xl text-[#111111] mb-1 leading-tight">Bardage métallique — {chantierData?.nom || "Villa Arcachon"}</h1>
          <p className="text-xs text-gray-500 font-medium">Résidence privée • {chantierData?.adresse || "33380 Arcachon"} • Chantier #{chantierData?.id?.substring(0,6).toUpperCase() || 'BNA-7429'}</p>
        </section>

        {/* CARTE PROGRESSION */}
        <section className="bg-[#FFFFFF] border border-[#111111] rounded-[16px] p-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-[#111111]">Progression du chantier</h2>
            <span className="bg-[#E30613] text-white text-sm font-bold px-3 py-1 rounded-full">{avancement}%</span>
          </div>
          
          <div className="w-full bg-[#F2F2F2] h-3 rounded-full mb-2 overflow-hidden">
            <div className="bg-[#E30613] h-3 rounded-full transition-all duration-1000" style={{ width: `${avancement}%` }}></div>
          </div>
          
          <p className="text-xs text-gray-500 mb-5">{avancement}% terminé • Estimation fin: {calculateEstimatedEndDate()}</p>
          
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#F2F2F2] rounded-xl p-3 flex flex-col items-center justify-center gap-2 text-center">
              <Check className="text-[#111111]" size={20} />
              <span className="text-[10px] font-bold text-[#111111] leading-tight">Façade Nord Terminée</span>
            </div>
            <div className="bg-[#F2F2F2] rounded-xl p-3 flex flex-col items-center justify-center gap-2 text-center">
              <Wrench className="text-[#E30613]" size={20} />
              <span className="text-[10px] font-bold text-[#111111] leading-tight">Façade Sud En cours</span>
            </div>
            <div className="bg-[#F2F2F2] rounded-xl p-3 flex flex-col items-center justify-center gap-2 text-center">
              <Clipboard className="text-[#E30613]" size={20} />
              <span className="text-[10px] font-bold text-[#111111] leading-tight">Contrôle qualité Prévu</span>
            </div>
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
              {photos.map((photo: any) => (
                <div
                  key={photo.id}
                  className="shrink-0 w-[140px] cursor-pointer"
                  onClick={() => setLightboxPhoto(photo)}
                >
                  <div className="w-[140px] h-[140px] rounded-xl overflow-hidden border border-[#111111] shadow-sm">
                    <img src={photo.url_image} alt={photo.titre} className="w-full h-full object-cover" />
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
            <img
              src={lightboxPhoto.url_image}
              alt={lightboxPhoto.titre}
              className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
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
                {devisData.map((devis: any) => {
                  const estSigne = isSigned || devis.statut === 'accepte';
                  const totalHT = (devis.lignes || []).reduce((s: number, l: any) => s + l.qte * l.pu_ht, 0);
                  const totalTTC = totalHT * (1 + (devis.tva_pct || 20) / 100);
                  return (
                    <div
                      key={`devis-${devis.id}`}
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
                  );
                })}
                
                {facturesData.map((facture: any) => {
                  const estPayee = isSigned || facture.statut === 'payee';
                  const totalHT = (facture.lignes || []).reduce((s: number, l: any) => s + l.qte * l.pu_ht, 0);
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
            else { setIsChatOpen(true); hasSummarized.current = false; }
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
            <div className="p-4 bg-[#111111] text-white flex justify-between items-center">
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
                    client={clientData || { nom: 'Client' }} 
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

    </div>
  );
}
