#!/bin/bash

# Add DocumentPDF import
sed -i 's/import {/import DocumentPDF from "@/components\/DocumentPDF";\nimport {/' app/espace-client/\[code_acces\]/page.tsx

# Add entreprise state
sed -i 's/const \[devisData, setDevisData\] = useState<any\[\]>(\[\]);/const [devisData, setDevisData] = useState<any[]>([]);\n  const [entreprise, setEntreprise] = useState<any>(null);/' app/espace-client/\[code_acces\]/page.tsx

# Add entreprise fetch in fetchRealData
sed -i '/const { supabase } = await import/a \
        const { data: settings } = await supabase.from("entreprise_settings").select("*").eq("id", 1).single();\
        if (settings) setEntreprise(settings);\
' app/espace-client/\[code_acces\]/page.tsx

# Modify modal width
sed -i 's/w-full max-w-md bg-white rounded-3xl overflow-hidden/w-full max-w-4xl bg-white rounded-3xl overflow-y-auto/' app/espace-client/\[code_acces\]/page.tsx

