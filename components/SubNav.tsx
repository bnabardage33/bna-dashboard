"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href: string };

export default function SubNav({ items }: { items: Item[] }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 py-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border border-red-600/40 bg-slate-800 text-red-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
