import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # 1. Backgrounds
    content = re.sub(r'bg-\[#F2F2F2\]', 'bg-transparent', content)
    content = re.sub(r'bg-slate-900', 'bg-transparent', content)
    content = re.sub(r'bg-slate-50', 'bg-transparent', content)
    content = re.sub(r'bg-slate-100', 'bg-transparent', content)
    content = re.sub(r'min-h-screen bg-\w+-\d+', 'min-h-screen bg-transparent', content)

    # 2. Cards
    content = re.sub(r'bg-white\b', 'bg-[#1A1D24]', content)
    content = re.sub(r'bg-slate-800', 'bg-[#1A1D24]', content)

    # 3. Action buttons
    content = re.sub(r'bg-purple-600', 'bg-red-600', content)
    content = re.sub(r'hover:bg-purple-700', 'hover:bg-red-700', content)
    content = re.sub(r'bg-[#111111]', 'bg-red-600', content)
    content = re.sub(r'bg-emerald-600', 'bg-red-600', content)
    content = re.sub(r'hover:bg-emerald-700', 'hover:bg-red-700', content)
    content = re.sub(r'text-emerald-600', 'text-red-500', content)
    content = re.sub(r'text-purple-600', 'text-red-500', content)
    content = re.sub(r'text-slate-900', 'text-white', content)
    content = re.sub(r'text-slate-800', 'text-gray-300', content)
    content = re.sub(r'text-slate-700', 'text-gray-400', content)
    content = re.sub(r'text-gray-900', 'text-white', content)
    content = re.sub(r'text-[#111111]', 'text-white', content)
    content = re.sub(r'text-black', 'text-white', content)

    # Borders
    content = re.sub(r'border-slate-200', 'border-white/10', content)
    content = re.sub(r'border-slate-700', 'border-white/10', content)
    content = re.sub(r'border-gray-200', 'border-white/10', content)
    content = re.sub(r'border-[#111111]', 'border-white/10', content)

    # Headers - specific removal for some known patterns
    # Removes generic hardcoded headers with logos
    content = re.sub(r'<div className="[^"]*bg-[#111111][^"]*">.*?<h1.*?</div>', '', content, flags=re.DOTALL)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Patched {filepath}")

for root, _, files in os.walk('app'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))
