'use client';

import React, { useState, useRef, useEffect } from "react";
import { 
  FileText, CheckCircle2, MessageSquare, Clock, Download,
  AlertCircle, Camera, HardHat, Send, X, Check
} from "lucide-react";
import { Surface } from '@/components/ui/Surface';

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChantierData = {
  id: string;
  nom: string | null;
  adresse_chantier: string | null;
  clients?: { nom: string | null } | null;
};
type ClientData = { nom: string | null };
type SignatureEvent =
  | React.MouseEvent<HTMLCanvasElement>
  | React.TouchEvent<HTMLCanvasElement>;

export default function ClientPortalPrototype() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Real data states
  const [chantierData, setChantierData] = useState<ChantierData | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [avancement, setAvancement] = useState<number>(0);

  useEffect(() => {
    // Fetch real data on mount
    const fetchRealData = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        
        // Fetch a real chantier (preferably en_cours or latest)
        const { data: chantiers } = await supabase
          .from('chantiers')
          .select('*, clients(*)')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (chantiers && chantiers.length > 0) {
          const chantier = chantiers[0];
          setChantierData(chantier);
          setClientData(chantier.clients);
          
          // Initial greeting with real name
          const clientName = chantier.clients?.nom || "Client";
          setChatMessages([
            { role: 'assistant', content: `Bonjour ${clientName} ! Votre chantier avance bien. Avez-vous des questions sur les travaux en cours ?` }
          ] as ChatMessage[]);

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
            // Fausse progression si aucune en base
            setAvancement(45);
          }
        } else {
          // Fallback if DB is completely empty
          setChatMessages([
            { role: 'assistant', content: 'Bonjour ! Votre chantier avance bien. Avez-vous des questions sur les travaux en cours ?' }
          ] as ChatMessage[]);
        }
      } catch (e) {
        console.error("Failed to fetch real data", e);
      }
    };
    
    fetchRealData();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isChatOpen]);

  const hasSummarized = useRef(false);

  const endConversationAndSummarize = async (finalMessages: ChatMessage[]) => {
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

    const userMsg: ChatMessage = { role: "user", content: inputValue };
    const newMessages: ChatMessage[] = [...chatMessages, userMsg];
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
        
        const finalMessages: ChatMessage[] = [...newMessages];
        if (botText) {
          finalMessages.push({ role: "assistant", content: botText });
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
        setChatMessages(prev => [...prev, { role: 'assistant' as const, content: "Désolé, je rencontre un problème de connexion. Je laisse un message au patron." }]);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant' as const, content: "Erreur de réseau." }]);
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

  const startDrawing = (e: SignatureEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e ? e.touches[0]?.clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0]?.clientY : e.clientY) - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: SignatureEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e ? e.touches[0]?.clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0]?.clientY : e.clientY) - rect.top;
    
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

  const submitSignature = () => {
    if (!signatureData) return;
    // Here we would upload the signatureData (base64 image) to Supabase Storage
    // and update the devis status in the database.
    // For the demo, we just show a success state.
    setIsSigned(true);
    setTimeout(() => {
      setIsDevisOpen(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-transparent text-white pb-24 font-sans relative">
      {/* Header */}
      <header className="bg-transparent text-white p-6 shadow-md rounded-b-3xl">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <HardHat className="text-gray-400" size={28} />
            <span className="text-xl font-bold tracking-tight">BNA Espace Client</span>
          </div>
          <div className="w-10 h-10 bg-[#1A1D24] rounded-full flex items-center justify-center border border-white/10">
            <span className="font-semibold text-sm">{initials}</span>
          </div>
        </div>
        
        <div>
          <h1 className="text-2xl font-bold mb-1">Bonjour, {displayName}</h1>
          <p className="text-gray-400 text-sm">Bienvenue sur votre espace de suivi de chantier.</p>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-6 -mt-4 relative z-10">
        
        {/* Progress Card */}
        <section className="bg-[#1A1D24] rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-red-400 bg-blue-50 px-2 py-1 rounded-md mb-2 inline-block">Chantier en cours</span>
              <h2 className="text-lg font-bold">{displayChantier}</h2>
              <p className="text-sm text-gray-500">{displayAddress}</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-gray-300">{avancement}<span className="text-lg text-gray-400">%</span></span>
            </div>
          </div>
          
          <div className="w-full bg-transparent rounded-full h-3 mb-6 overflow-hidden">
            <div className="bg-red-600 h-3 rounded-full relative transition-all duration-1000" style={{ width: `${avancement}%` }}>
              <div className="absolute top-0 right-0 bottom-0 left-0 bg-[#1A1D24]/20" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation: 'shimmer 2s infinite' }}></div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
            <div className="flex flex-col items-center gap-1">
              <CheckCircle2 className="text-gray-400" size={20} />
              <span>Préparation</span>
            </div>
            <div className="flex flex-col items-center gap-1 font-semibold text-red-400">
              <Clock className="text-gray-400" size={20} />
              <span>Pose ossature</span>
            </div>
            <div className="flex flex-col items-center gap-1 opacity-50">
              <AlertCircle size={20} />
              <span>Finitions</span>
            </div>
          </div>
        </section>

        {/* Action Required */}
        <section className="bg-orange-50 border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 p-2 rounded-full text-red-400">
              <FileText size={20} />
            </div>
            <div>
              <p className="font-semibold text-red-400 text-sm">Devis Supplémentaire</p>
              <p className="text-xs text-red-400">En attente de votre signature</p>
            </div>
          </div>
          <button className="bg-red-600 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            Consulter
          </button>
        </section>

        {/* Latest Documents */}
        <section>
          <div className="flex justify-between items-end mb-3 px-1">
            <h3 className="font-bold text-gray-300">Vos documents</h3>
            <button className="text-red-400 text-sm font-medium">Tout voir</button>
          </div>
          <div className="bg-[#1A1D24] rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-50 flex items-center justify-between group hover:bg-transparent transition cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="bg-red-900/20 text-red-400 p-2 rounded-lg">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium">Facture d'acompte (30%)</p>
                  <p className="text-xs text-gray-500">22 Août 2026 • Payée</p>
                </div>
              </div>
              <Download size={18} className="text-gray-400 group-hover:text-red-400" />
            </div>
            <div 
              onClick={() => setIsDevisOpen(true)}
              className="p-4 flex items-center justify-between group hover:bg-transparent transition cursor-pointer border-t border-slate-100"
            >
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 text-red-400 p-2 rounded-lg">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-300">Avenant Devis #DEV-2026-08</p>
                  <p className="text-xs text-gray-500 font-semibold text-red-400">Action requise : En attente de signature</p>
                </div>
              </div>
              <button className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition">
                Signer
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* Chatbot Interface */}
      <Surface className={`fixed bottom-24 right-6 w-[320px] max-w-[calc(100vw-3rem)] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 z-[9998] origin-bottom-right ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`} radius="2xl">
        <div className="bg-transparent text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <HardHat size={20} className="text-gray-400" />
            <span className="font-semibold text-sm">Assistant BNA</span>
          </div>
          <button onClick={closeChat} className="text-gray-400 hover:text-white transition cursor-pointer" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 p-4 h-80 overflow-y-auto bg-transparent flex flex-col gap-3 custom-scrollbar" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f8fafc' }}>
          <style dangerouslySetInnerHTML={{__html: `
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
          `}} />
          {chatMessages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-red-600 text-white rounded-br-sm' : 'bg-[#1A1D24] border border-white/10 text-gray-400 rounded-bl-sm'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-start">
              <Surface className="px-4 py-2 text-gray-500 rounded-bl-sm flex gap-1 items-center h-9" radius="2xl">
                <div className="w-1.5 h-1.5 bg-[#1A1D24] rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-[#1A1D24] rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-1.5 h-1.5 bg-[#1A1D24] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
              </Surface>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-3 bg-[#1A1D24] border-t border-slate-100 flex gap-2">
          <input 
            type="text" 
            placeholder="Posez votre question..." 
            className="flex-1 bg-transparent border-transparent focus:bg-[#1A1D24] focus:border-white/10 focus:ring-2 focus:ring-blue-200 rounded-xl px-3 py-2 text-sm outline-none transition"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || isLoading}
            className="bg-red-600 hover:bg-[#1A1D24] disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-xl flex items-center justify-center transition cursor-pointer"
            aria-label="Envoyer le message"
          >
            <Send size={18} />
          </button>
        </form>
      </Surface>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-[9990]">
        {!isChatOpen && (
          <div className="bg-[#1A1D24] p-3 rounded-2xl rounded-br-sm shadow-lg border border-slate-100 max-w-[200px] animate-bounce pointer-events-none">
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
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-105 cursor-pointer ${isChatOpen ? 'bg-[#1A1D24] text-slate-600' : 'bg-transparent text-white hover:bg-[#1A1D24]'}`}
          aria-label="Assistant BNA"
        >
          {isChatOpen ? <X size={24} /> : <MessageSquare size={24} />}
        </button>
      </div>

      {/* Signature Modal */}
      {isDevisOpen && (
        <div className="fixed inset-0 z-[9999] bg-transparent flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-md bg-[#1A1D24] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 bg-transparent text-white flex justify-between items-center">
              <h2 className="font-bold">Signature du document</h2>
              <button onClick={() => setIsDevisOpen(false)} className="text-gray-400 hover:text-white transition" aria-label="Fermer">
                <X size={24} />
              </button>
            </div>
            
            {isSigned ? (
              <div className="flex flex-col items-center justify-center p-12 text-center h-80">
                <div className="w-20 h-20 bg-emerald-100 text-gray-400 rounded-full flex items-center justify-center mb-6">
                  <Check size={40} />
                </div>
                <h3 className="text-2xl font-bold text-gray-300 mb-2">Devis signé !</h3>
                <p className="text-gray-500">Merci, l'équipe BNA a bien reçu votre accord.</p>
              </div>
            ) : (
              <>
                <div className="p-6 bg-transparent border-b border-white/10 overflow-y-auto">
                  <h3 className="font-bold text-gray-300 mb-2 text-lg">Avenant Devis #DEV-2026-08</h3>
                  <Surface className="space-y-3 text-sm text-slate-600 mb-4 p-4">
                    <div className="flex justify-between border-b border-slate-100 pb-2">
                      <span>Fourniture et pose Pare-pluie</span>
                      <span className="font-medium text-gray-300">450 €</span>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="font-bold text-gray-300">TOTAL TTC</span>
                      <span className="font-black text-red-400 text-lg">450 €</span>
                    </div>
                  </Surface>
                  <p className="text-xs text-gray-500 italic">Je soussigné(e) {displayChantier}, donne mon bon pour accord.</p>
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-bold text-gray-300">Votre signature ci-dessous :</label>
                    <button onClick={clearSignature} className="text-xs text-gray-400 hover:text-slate-600 underline">Effacer</button>
                  </div>
                  
                  <div className="w-full h-48 border-2 border-dashed border-slate-300 rounded-xl bg-transparent overflow-hidden relative touch-none">
                    <canvas
                      ref={canvasRef}
                      width={400}
                      height={200}
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
                        <span className="text-gray-300 font-medium text-lg">Signez avec le doigt</span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={submitSignature}
                    disabled={!signatureData}
                    className={`mt-6 w-full py-4 rounded-xl font-bold text-white transition-all text-lg ${signatureData ? 'bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/10' : 'bg-[#1A1D24] cursor-not-allowed'}`}
                  >
                    Valider ma signature
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
