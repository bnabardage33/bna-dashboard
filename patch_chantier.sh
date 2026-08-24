#!/bin/sh

# Add code_acces to Chantier type
sed -i 's/clients: { nom: string } | null;/clients: { nom: string } | null;\n  code_acces: string | null;/' app/terrain/chantier/\[id\]/page.tsx

# Add Copy, Check to imports
sed -i 's/import { Sparkles, Loader2 } from "lucide-react";/import { Sparkles, Loader2, Copy, Check } from "lucide-react";/' app/terrain/chantier/\[id\]/page.tsx

# Replace title block
sed -i 's/      <div>/      <div className="flex items-start justify-between">\n        <div>/' app/terrain/chantier/\[id\]/page.tsx
sed -i 's/        <\/p>\n      <\/div>/        <\/p>\n        <\/div>\n\n        {chantier.code_acces && (\n          <button\n            onClick={() => {\n              const link = `${window.location.origin}\/espace-client\/${chantier.code_acces}`;\n              navigator.clipboard.writeText(link);\n              setCopiedLink(true);\n              setTimeout(() => setCopiedLink(false), 2000);\n            }}\n            className="flex items-center gap-1.5 rounded-xl bg-cyan-600\/20 px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-600\/30 transition-all border border-cyan-500\/20"\n          >\n            {copiedLink ? <Check size={14} \/> : <Copy size={14} \/>}\n            {copiedLink ? "Lien copié" : "Lien Espace Client"}\n          <\/button>\n        )}\n      <\/div>/' app/terrain/chantier/\[id\]/page.tsx

