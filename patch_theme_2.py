import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Aggressively remove any cyan, purple, amber, emerald, indigo, teal
    colors = ['cyan', 'purple', 'amber', 'emerald', 'indigo', 'teal', 'blue', 'green', 'orange', 'yellow', 'pink']
    
    for c in colors:
        # text
        content = re.sub(rf'text-{c}-[345]00', 'text-gray-400', content)
        content = re.sub(rf'text-{c}-[6789]00', 'text-red-500', content)
        content = re.sub(rf'text-{c}-\d+/\d+', 'text-gray-400', content)
        
        # bg
        content = re.sub(rf'bg-{c}-[56]00', 'bg-red-600', content)
        content = re.sub(rf'bg-{c}-[789]00', 'bg-[#1A1D24]', content)
        content = re.sub(rf'bg-{c}-\d+/\d+', 'bg-white/5', content)
        content = re.sub(rf'hover:bg-{c}-\d+', 'hover:bg-red-700', content)
        
        # border
        content = re.sub(rf'border-{c}-\d+(/\d+)?', 'border-white/10', content)
        
        # shadow
        content = re.sub(rf'shadow-{c}-\d+(/\d+)?', 'shadow-red-600/10', content)
        
        # from, to (gradients)
        content = re.sub(rf'from-{c}-\d+', 'from-[#1A1D24]', content)
        content = re.sub(rf'to-{c}-\d+(/\d+)?', 'to-[#0B0F19]', content)

    # Convert remaining slate
    content = re.sub(r'text-slate-100', 'text-white', content)
    content = re.sub(r'text-slate-200', 'text-gray-200', content)
    content = re.sub(r'text-slate-300', 'text-gray-300', content)
    content = re.sub(r'text-slate-400', 'text-gray-400', content)
    content = re.sub(r'text-slate-500', 'text-gray-500', content)
    
    content = re.sub(r'bg-slate-900/\d+', 'bg-black/20', content)
    content = re.sub(r'bg-slate-\d+', 'bg-[#1A1D24]', content)
    
    # Remove the old specific headers
    # e.g., <div className="bg-[#111111] text-white rounded-[20px] p-5 mb-4 flex items-center gap-3">
    content = re.sub(r'<div className="bg-\[#111111\].*?</div>\s*</div>', '', content, flags=re.DOTALL)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Patched {filepath}")

for root, _, files in os.walk('app'):
    for file in files:
        if file.endswith('.tsx') and 'layout.tsx' not in file:
            process_file(os.path.join(root, file))
