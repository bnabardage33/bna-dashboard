// components/SubNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href: string; icon?: React.ComponentType<any> };

export default function SubNav({ items }: { items: Item[] }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-slate-700/80 bg-slate-900/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-4 py-2.5 scrollbar-none">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/bureau" && item.href !== "/terrain" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                active
                  ? "border border-sky-500/50 bg-sky-500/15 text-sky-300 shadow-sm shadow-sky-500/10"
                  : "border border-slate-700/60 bg-slate-800/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {Icon && <Icon className="inline-block h-4 w-4 mr-1 align-middle" />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}



