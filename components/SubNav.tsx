// components/SubNav.tsx
"use client";

import type { LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";

type Item = { label: string; href: string; icon?: LucideIcon };

export default function SubNav({ items }: { items: Item[] }) {
  const pathname = usePathname();

  return (
    <div className="mb-4">
      <div className="flex w-full overflow-x-auto gap-3 pb-2 scrollbar-hide">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/bureau" && item.href !== "/terrain" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm whitespace-nowrap ${
                active
                  ? "bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md"
                  : "bg-[#1A1D24]/80 text-gray-400 hover:text-white rounded-full px-4 py-2 border border-white/5 transition-all"
              }`}
            >
              {Icon && <Icon className="inline-block h-4 w-4 mr-1.5 align-middle" />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}



