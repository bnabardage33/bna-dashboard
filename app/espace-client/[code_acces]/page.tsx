'use client';

import React, { useState, useRef, useEffect, use } from "react";
import { 
  FileText, CheckCircle2, MessageSquare, Clock, Download,
  AlertCircle, Camera, HardHat, Send, X, Check
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
  const [entreprise, setEntreprise] = useState<any>(null);
  const [facturesData, setFacturesData] = useState<any[]>([]);
  const [activeDoc, setActiveDoc] = useState<any>(null);

  useEffect(() => {
    // Fetch real data on mount
    const fetchRealData = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: settings } = await supabase.from("entreprise_settings").select("*").eq("id", 1).single();
        if (settings) setEntreprise(settings);

        
        // Fetch chantier by code_acces
        const { data: chantiers } = await supabase
          .from('chantiers')
          .select('*, clients(*)')
          .eq('code_acces', codeAcces)
          .limit(1);
          
        if (chantiers && chantiers.length > 0) {
          const chantier = chantiers[0];
          setChantierData(chantier);
          setClientData(chantier.clients);
          
          // Initial greeting with real name
          const clientName = chantier.clients?.nom || "Client";
          setChatMessages([
            { role: 'assistant', content: `Bonjour ${clientName} ! Votre chantier avance bien. Avez-vous des questions sur les travaux en cours ?` }
          ]);

          // Fetch real progress if exists
          const { data: avancements } = await supabase
            .from('avancements_chantier')
            .select('pourcentage')
            .eq('chantier_id', chantier.id)
            .order('date', { ascending: false })
            .limit(1);
            
          if (avancements && avancements.length > 0) {
            setAvancement(avancements[0].pourcentage);
          } else {
            setAvancement(45); // Fausse progression par défaut
          }

          // Fetch devis visibles par le client (envoyés ou acceptés)
          // On cherche d'abord par chantier_id, puis par client_id en fallback
          let devisList: any[] = [];
          
          const { data: devisParChantier } = await supabase
            .from('devis')
            .select('*')
            .eq('chantier_id', chantier.id)
            .in('statut', ['envoye', 'accepte']);
          
          if (devisParChantier && devisParChantier.length > 0) {
            devisList = devisParChantier;
          } else if (chantier.client_id) {
            // Fallback : chercher par client_id si pas de chantier_id sur le devis
            const { data: devisParClient } = await supabase
              .from('devis')
              .select('*')
              .eq('client_id', chantier.client_id)
              .in('statut', ['envoye', 'accepte']);
            if (devisParClient) devisList = devisParClient;
          }
          
          setDevisData(devisList);
        } else {
          // Fallback if not found
          setChatMessages([
            { role: 'assistant', content: 'Bonjour ! Ce code d\'accès semble invalide, mais vous pouvez tester le chatbot.' }
          ]);
        }
      } catch (e) {
        console.error("Failed to fetch real data", e);
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
    
    // Si on a un vrai devis en base, on le met à jour
    if (devisData && devisData.length > 0) {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: settings } = await supabase.from("entreprise_settings").select("*").eq("id", 1).single();
        if (settings) setEntreprise(settings);

        // On met à jour le premier devis trouvé pour ce chantier
        await supabase
          .from('devis')
          .update({ statut: 'accepte' })
          .eq('id', devisData[0].id);
          
        // Dans une vraie application, on uploadrait aussi l'image (signatureData)
        // dans un bucket Storage, puis on mettrait le lien dans la table.
      } catch (e) {
        console.error("Erreur signature", e);
      }
    }
    
    setIsSigned(true);
    setTimeout(() => {
      setIsDevisOpen(false);
    }, 2000);
  };

  const devisEstSigne = isSigned || (devisData && devisData.length > 0 && devisData[0].statut === 'accepte');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 font-sans relative">
      {/* Header */}
      <header className="bg-slate-900 text-white p-6 shadow-md rounded-b-3xl">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <HardHat className="text-blue-400" size={28} />
            <span className="text-xl font-bold tracking-tight">BNA Espace Client</span>
          </div>
          <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700">
            <span className="font-semibold text-sm">{initials}</span>
          </div>
        </div>
        
        <div>
          <h1 className="text-2xl font-bold mb-1">Bonjour, {displayName}</h1>
          <p className="text-slate-400 text-sm">Bienvenue sur votre espace de suivi de chantier.</p>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-6 -mt-4 relative z-10">
        
        {/* Progress Card */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-1 rounded-md mb-2 inline-block">Chantier en cours</span>
              <h2 className="text-lg font-bold">{displayChantier}</h2>
              <p className="text-sm text-slate-500">{displayAddress}</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-slate-800">{avancement}<span className="text-lg text-slate-400">%</span></span>
            </div>
          </div>
          
          <div className="w-full bg-slate-100 rounded-full h-3 mb-6 overflow-hidden">
            <div className="bg-blue-600 h-3 rounded-full relative transition-all duration-1000" style={{ width: `${avancement}%` }}>
              <div className="absolute top-0 right-0 bottom-0 left-0 bg-white/20" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation: 'shimmer 2s infinite' }}></div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
            <div className="flex flex-col items-center gap-1">
              <CheckCircle2 className="text-green-500" size={20} />
              <span>Préparation</span>
            </div>
            <div className="flex flex-col items-center gap-1 font-semibold text-blue-700">
              <Clock className="text-blue-500" size={20} />
              <span>Pose ossature</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50">
              <AlertCircle size={20} />
              <span>Finitions</span>
            </div>
          </div>
        </section>

        {/* Documents Card */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold mb-4 text-slate-800">Mes Documents</h3>
          <div className="space-y-3">

            {devisData.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-4">Aucun document à signer pour l'instant.</p>
            ) : (
              devisData.map((devis: any) => {
                const estSigne = isSigned || devis.statut === 'accepte';
                const totalHT = (devis.lignes || []).reduce((s: number, l: any) => s + l.qte * l.pu_ht, 0);
                const totalTTC = totalHT * (1 + (devis.tva_pct || 20) / 100);
                return (
                  <div
                    key={devis.id}
                    onClick={() => { setIsDevisOpen(true); }}
                    className="p-4 flex items-center justify-between group hover:bg-slate-50 transition cursor-pointer border border-slate-100 rounded-xl bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`${estSigne ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} p-2 rounded-lg`}>
                        {estSigne ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{devis.numero} – {devis.objet || 'Devis'}</p>
                        {estSigne ? (
                          <p className="text-xs font-semibold text-emerald-600">Statut : Validé et Signé</p>
                        ) : (
                          <p className="text-xs font-semibold text-amber-600">Action requise : En attente de signature</p>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">Total TTC : {totalTTC.toFixed(2)} €</p>
                      </div>
                    </div>
                    {estSigne ? (
                      <button className="text-blue-600 text-xs font-bold px-3 py-1.5 transition">Consulter</button>
                    ) : (
                      <button className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition">Signer</button>
                    )}
                  </div>
                );
              })
            )}

            
            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50 opacity-70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Attestation d'Assurance</p>
                  <p className="text-xs text-slate-500">Téléchargé le 12/08/2026</p>
                </div>
              </div>
              <button className="text-blue-600 text-xs font-semibold px-2 py-1">Voir</button>
            </div>
          </div>
        </section>

      </main>

      {/* Chatbot Interface */}
      <div className={`fixed bottom-24 right-6 w-[320px] max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 z-[9998] origin-bottom-right ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <HardHat size={20} className="text-blue-400" />
            <span className="font-semibold text-sm">Assistant BNA</span>
          </div>
          <button onClick={closeChat} className="text-slate-400 hover:text-white transition cursor-pointer">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 p-4 h-80 overflow-y-auto bg-slate-50 flex flex-col gap-3 custom-scrollbar" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f8fafc' }}>
          <style dangerouslySetInnerHTML={{__html: `
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
          `}} />
          {chatMessages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex flex-col items-start">
              <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-500 rounded-bl-sm flex gap-1">
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex gap-2">
          <input 
            type="text" 
            placeholder="Posez votre question..." 
            className="flex-1 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-xl px-3 py-2 text-sm outline-none transition"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2 rounded-xl flex items-center justify-center transition cursor-pointer"
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-[9990]">
        {!isChatOpen && (
          <div className="bg-white p-3 rounded-2xl rounded-br-sm shadow-lg border border-slate-100 max-w-[200px] animate-bounce pointer-events-none">
            <p className="text-xs text-slate-600 font-medium">Une question sur vos travaux ? L'assistant BNA est là ! 👋</p>
          </div>
        )}
        <button 
          onClick={() => {
            if (isChatOpen) {
              closeChat();
            } else {
              setIsChatOpen(true);
              hasSummarized.current = false;
            }
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-105 cursor-pointer ${isChatOpen ? 'bg-slate-200 text-slate-600' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
        >
          {isChatOpen ? <X size={24} /> : <MessageSquare size={24} />}
        </button>
      </div>

      {/* Signature / Document Modal */}
      {isDevisOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl bg-white rounded-3xl overflow-y-auto shadow-2xl flex flex-col max-h-[90vh]">

            {/* En-tête */}
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h2 className="font-bold">{devisEstSigne ? "Document Signé" : "Signature du document"}</h2>
              <button onClick={() => setIsDevisOpen(false)} className="text-slate-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            {/* Récapitulatif devis — toujours visible */}
            <div className="p-6 bg-slate-50 border-b border-slate-200 overflow-y-auto">
              {entreprise && devisData[0] && (
                <div className="bg-white">
                  <DocumentPDF 
                    doc={{ ...devisData[0], kind: 'devis' }} 
                    entreprise={entreprise} 
                    client={clientData || { nom: 'Client' }} 
                  />
                </div>
              )}

              {devisEstSigne && !isSigned && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3 bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200">
                    <CheckCircle2 size={22} className="text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium">Ce devis a été validé et signé électroniquement par vos soins. L'équipe BNA s'occupe de la suite !</p>
                  </div>
                  <button className="flex items-center justify-center gap-2 w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition">
                    <Download size={18} />
                    Télécharger le devis signé (PDF)
                  </button>
                </div>
              )}

              {!devisEstSigne && (
                <p className="text-xs text-slate-500 italic">Je soussigné(e) {displayName}, donne mon bon pour accord.</p>
              )}
            </div>

            {/* Écran de succès juste après signature */}
            {isSigned && (
              <div className="flex flex-col items-center justify-center p-10 text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                  <Check size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-1">Devis signé !</h3>
                <p className="text-slate-500 text-sm">Merci, l'équipe BNA a bien reçu votre accord.</p>
              </div>
            )}

            {/* Zone de signature — uniquement si pas encore signé */}
            {!devisEstSigne && !isSigned && (
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
