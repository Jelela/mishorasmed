"use client";

import { usePathname, useRouter } from "next/navigation";

export function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  const tabs = [
    { name: "Inicio 🏠", path: "/dashboard/inicio" },
    { name: "Calendario 📅", path: "/dashboard/calendario" },
    { name: "Hospitales 🏥", path: "/dashboard" },
    { name: "Consolidación 🤝", path: "/dashboard/consolidacion" },
    { name: "Perfil 🥳", path: "/dashboard/perfil" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 z-40">
      {/* Mobile: slider horizontal */}
      <div className="sm:hidden overflow-x-auto scrollbar-hide">
        <div className="flex items-center h-16 gap-2 px-2 snap-x snap-mandatory min-w-max">
          {tabs.map((tab) => {
            const isActive = pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => router.push(tab.path)}
                className={`shrink-0 snap-start flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-base font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "text-blue-600 bg-blue-50"
                    : "text-gray-700 hover:bg-gray-200"
                }`}
              >
                {tab.name}
              </button>
            );
          })}
          {/* Espaciador final para que el último tab no quede pegado al borde */}
          <div className="shrink-0 w-2" />
        </div>
      </div>
      
      {/* Desktop: layout fijo */}
      <div className="hidden sm:block max-w-md mx-auto">
        <div className="flex justify-around items-center h-16 gap-2 px-2">
          {tabs.map((tab) => {
            const isActive = pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => router.push(tab.path)}
                className={`flex-1 flex items-center justify-center rounded-lg bg-gray-100 px-3 py-2 text-base font-medium transition-colors ${
                  isActive
                    ? "text-blue-600 bg-blue-50"
                    : "text-gray-700 hover:bg-gray-200"
                }`}
              >
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
