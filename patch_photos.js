const fs = require('fs');

const path = 'app/bureau/sav/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add upload function
const uploadFn = `
  const [uploading, setUploading] = useState<{avant: boolean, apres: boolean}>({avant: false, apres: false});

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avant' | 'apres') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(prev => ({ ...prev, [type]: true }));
    const fileExt = file.name.split('.').pop();
    const fileName = \`\${Math.random().toString(36).substring(2)}-\${Date.now()}.\${fileExt}\`;
    const filePath = \`\${ticket.chantier_id || 'unassigned'}/\${fileName}\`;

    const { error: uploadError } = await supabase.storage.from('sav_photos').upload(filePath, file);

    if (uploadError) {
      alert("Erreur lors de l'envoi de l'image.");
      console.error(uploadError);
    } else {
      const { data } = supabase.storage.from('sav_photos').getPublicUrl(filePath);
      setTicket(prev => ({
        ...prev,
        photos: { ...prev.photos, [type]: data.publicUrl }
      }));
    }
    setUploading(prev => ({ ...prev, [type]: false }));
  };
`;

content = content.replace('const [chantiers, setChantiers] = useState<any[]>([]);', 'const [chantiers, setChantiers] = useState<any[]>([]);\n' + uploadFn);

// Replace Photo Tuile
const photoTuileOld = `              <div className="flex gap-3">
                <button className="flex-1 border border-dashed border-slate-600 bg-slate-900/50 hover:bg-slate-800 rounded-xl h-24 flex flex-col items-center justify-center text-slate-400 transition-all">
                  <Camera size={24} className="mb-1" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Avant</span>
                </button>
                <button className="flex-1 border border-dashed border-slate-600 bg-slate-900/50 hover:bg-slate-800 rounded-xl h-24 flex flex-col items-center justify-center text-slate-400 transition-all">
                  <Camera size={24} className="mb-1" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Après</span>
                </button>
              </div>`;

const photoTuileNew = `              <div className="flex gap-3">
                <label className="flex-1 border border-dashed border-slate-600 bg-slate-900/50 hover:bg-slate-800 rounded-xl h-24 flex flex-col items-center justify-center text-slate-400 transition-all cursor-pointer relative overflow-hidden">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'avant')} disabled={uploading.avant} />
                  {uploading.avant ? (
                    <Loader2 size={24} className="animate-spin mb-1 text-sky-400" />
                  ) : ticket.photos.avant ? (
                    <img src={ticket.photos.avant} className="absolute inset-0 w-full h-full object-cover opacity-60 hover:opacity-40 transition-opacity" />
                  ) : (
                    <Camera size={24} className="mb-1" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest relative z-10 drop-shadow-md">Avant</span>
                </label>
                
                <label className="flex-1 border border-dashed border-slate-600 bg-slate-900/50 hover:bg-slate-800 rounded-xl h-24 flex flex-col items-center justify-center text-slate-400 transition-all cursor-pointer relative overflow-hidden">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'apres')} disabled={uploading.apres} />
                  {uploading.apres ? (
                    <Loader2 size={24} className="animate-spin mb-1 text-sky-400" />
                  ) : ticket.photos.apres ? (
                    <img src={ticket.photos.apres} className="absolute inset-0 w-full h-full object-cover opacity-60 hover:opacity-40 transition-opacity" />
                  ) : (
                    <Camera size={24} className="mb-1" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-widest relative z-10 drop-shadow-md">Après</span>
                </label>
              </div>`;

content = content.replace(photoTuileOld, photoTuileNew);

fs.writeFileSync(path, content);
