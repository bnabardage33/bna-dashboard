import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    content = content.replace('text-[#111111]', 'text-white')
    content = content.replace('border-[#111111]', 'border-white/10')
    content = content.replace('bg-[#111111]', 'bg-[#1A1D24]')
    content = content.replace('bg-green-50', 'bg-green-900/20')
    content = content.replace('bg-red-50', 'bg-red-900/20')
    content = content.replace('bg-gray-50', 'bg-white/5')
    content = content.replace('bg-gray-200', 'bg-white/10')
    content = content.replace('text-gray-600', 'text-gray-400')
    content = content.replace('border-gray-300', 'border-white/20')
    content = content.replace('text-red-500', 'text-red-400') # lighter for dark mode
    content = content.replace('bg-transparent', 'bg-transparent') # keep it

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Patched {filepath}")

for root, _, files in os.walk('app'):
    for file in files:
        if file.endswith('.tsx') and 'layout.tsx' not in file:
            process_file(os.path.join(root, file))
