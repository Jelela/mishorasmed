"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { checkOnboardingStatus } from "@/lib/profileHelpers";
import { Loading } from "@/components/Loading";

interface Actionable {
  id: string;
  type: "warning" | "info" | "success";
  message: string;
  emoji: string;
  actionLabel?: string;
  actionPath?: string;
}

type Hospital = {
  id: string;
  name: string;
  closing_day: number | null;
};

interface UserHospital {
  id: string;
  catalog_hospital_id: string;
  hospital: Hospital[];
}

export default function InicioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [actionables, setActionables] = useState<Actionable[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      const onboardingCompleted = await checkOnboardingStatus(data.user.id);
      if (!onboardingCompleted) {
        router.replace("/onboarding");
        return;
      }

      await loadActionables(data.user.id);
      setLoading(false);
    })();
  }, [router]);

  async function loadActionables(userId: string) {
    const newActionables: Actionable[] = [];

    // 1. Verificar si tiene hospitales configurados
    const { data: hospitalsData } = await supabase
      .from("user_hospitals")
      .select(
        `
        id,
        catalog_hospital_id,
        hospital:hospital_catalog (
          id,
          name,
          closing_day
        )
      `
      )
      .eq("user_id", userId);

    // Convertir hospital de objeto único a array (Supabase devuelve objeto único en join)
    const hospitals: UserHospital[] = (hospitalsData || []).map((uh: any) => ({
      ...uh,
      hospital: Array.isArray(uh.hospital) ? uh.hospital : (uh.hospital ? [uh.hospital] : []),
    }));

    if (hospitals.length === 0) {
      newActionables.push({
        id: "no-hospitals",
        type: "warning",
        message: "Todavía no configuraste un hospital",
        emoji: "🏥",
        actionLabel: "Agregar hospital",
        actionPath: "/dashboard",
      });
    } else {
      // 2. Verificar si registró actividad esta semana
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Domingo
      startOfWeek.setHours(0, 0, 0, 0);

      const { data: weekEntries } = await supabase
        .from("entries")
        .select("id")
        .eq("user_id", userId)
        .gte("date", startOfWeek.toISOString().split("T")[0])
        .limit(1);

      if (!weekEntries || weekEntries.length === 0) {
        newActionables.push({
          id: "no-week-activity",
          type: "info",
          message: "No registraste actividad esta semana",
          emoji: "📅",
          actionLabel: "Ir al calendario",
          actionPath: "/dashboard/calendario",
        });
      }

      // 3. Verificar si configuró actos médicos para todos sus hospitales
      const { data: hospitalsWithActs } = await supabase
        .from("medical_acts")
        .select("user_hospital_id")
        .eq("user_id", userId)
        .eq("is_active", true);

      const hospitalsWithActsSet = new Set(
        (hospitalsWithActs || []).map((a) => a.user_hospital_id)
      );

      const hospitalsWithoutActs = hospitals.filter(
        (h) => !hospitalsWithActsSet.has(h.id)
      );

      if (hospitalsWithoutActs.length > 0) {
        newActionables.push({
          id: "missing-medical-acts",
          type: "warning",
          message: `Aún no has configurado tus actos médicos para ${hospitalsWithoutActs.length === 1 ? "un hospital" : `${hospitalsWithoutActs.length} hospitales`}`,
          emoji: "⚕️",
          actionLabel: "Configurar actos",
          actionPath: "/dashboard",
        });
      }

      // 4. Verificar si tiene cierres para consolidar
      const { data: consolidatedData } = await supabase.auth.getUser();
      if (consolidatedData.user) {
        const savedConsolidated = localStorage.getItem(`consolidated_${consolidatedData.user.id}`);
        let consolidatedStatus: Record<string, boolean> = {};
        if (savedConsolidated) {
          try {
            consolidatedStatus = JSON.parse(savedConsolidated);
          } catch (e) {
            // Ignorar error
          }
        }

        // Calcular cierres pasados no consolidados
        const todayForConsolidation = new Date();
        todayForConsolidation.setHours(0, 0, 0, 0);
        const year2026 = new Date(2026, 0, 1);
        year2026.setHours(0, 0, 0, 0);

        let unconsolidatedCount = 0;

        hospitals.forEach((uh) => {
          const hospital = uh.hospital?.[0];
          if (!hospital?.closing_day) return;

          const closingDay = hospital.closing_day;
          const nextClosing = new Date(todayForConsolidation);
          nextClosing.setDate(closingDay);
          nextClosing.setHours(0, 0, 0, 0);

          if (nextClosing < todayForConsolidation) {
            nextClosing.setMonth(nextClosing.getMonth() + 1);
            nextClosing.setDate(closingDay);
          }

          const previousClosing = new Date(nextClosing);
          previousClosing.setMonth(previousClosing.getMonth() - 1);

          let currentClosing = new Date(previousClosing);
          currentClosing.setDate(closingDay);
          currentClosing.setHours(0, 0, 0, 0);

          while (currentClosing >= year2026 && currentClosing < todayForConsolidation) {
            const closingId = `${uh.id}-${currentClosing.toISOString().split("T")[0]}`;
            if (!consolidatedStatus[closingId]) {
              unconsolidatedCount++;
            }
            currentClosing.setMonth(currentClosing.getMonth() - 1);
          }
        });

        if (unconsolidatedCount > 0) {
          newActionables.push({
            id: "pending-consolidations",
            type: "warning",
            message: `Tenés ${unconsolidatedCount} ${unconsolidatedCount === 1 ? "cierre para consolidar" : "cierres para consolidar"}`,
            emoji: "🤝",
            actionLabel: "Ver consolidación",
            actionPath: "/dashboard/consolidacion",
          });
        }
      }

      // 5. Verificar cierres próximos (próximos 7 días)
      const todayForUpcoming = new Date();
      todayForUpcoming.setHours(0, 0, 0, 0);
      const sevenDaysFromNow = new Date(todayForUpcoming);
      sevenDaysFromNow.setDate(todayForUpcoming.getDate() + 7);
      sevenDaysFromNow.setHours(23, 59, 59, 999);

      const upcomingClosings: Array<{ hospitalName: string; closingDate: Date }> = [];

      hospitals.forEach((uh) => {
        const hospital = uh.hospital?.[0];
        if (!hospital?.closing_day) return;

        const closingDay = hospital.closing_day;
        const nextClosing = new Date(todayForUpcoming);
        nextClosing.setDate(closingDay);
        nextClosing.setHours(0, 0, 0, 0);

        if (nextClosing < todayForUpcoming) {
          nextClosing.setMonth(nextClosing.getMonth() + 1);
          nextClosing.setDate(closingDay);
        }

        if (nextClosing <= sevenDaysFromNow && nextClosing >= todayForUpcoming) {
          upcomingClosings.push({
            hospitalName: hospital.name,
            closingDate: new Date(nextClosing),
          });
        }
      });

      if (upcomingClosings.length > 0) {
        upcomingClosings.forEach((closing) => {
          const daysUntil = Math.ceil(
            (closing.closingDate.getTime() - todayForUpcoming.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          newActionables.push({
            id: `upcoming-closing-${closing.hospitalName}`,
            type: "info",
            message: `En ${daysUntil} ${daysUntil === 1 ? "día" : "días"} cierra el hospital "${closing.hospitalName}". No te olvides de cargar todas tus horas.`,
            emoji: "⏰",
            actionLabel: "Ir al calendario",
            actionPath: "/dashboard/calendario",
          });
        });
      }

      // 6. Verificar si tiene hospitales sin email configurado
      const hospitalsWithoutEmail = hospitals.filter(
        (h) => h.hospital?.[0] && !h.hospital[0].closing_day
      );

      if (hospitalsWithoutEmail.length > 0 && hospitals.length > 1) {
        newActionables.push({
          id: "missing-closing-day",
          type: "info",
          message: `Algunos de tus hospitales no tienen día de cierre configurado`,
          emoji: "📧",
          actionLabel: "Ver hospitales",
          actionPath: "/dashboard",
        });
      }

      // 7. Verificar si tiene actos sin valor configurado
      const { data: allActs } = await supabase
        .from("medical_acts")
        .select("id, unit_value, unit_value_principal, unit_value_assistant, supports_roles")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (allActs) {
        const actsWithoutValue = allActs.filter((act) => {
          const supportsRoles = act.supports_roles === true;
          if (supportsRoles) {
            return act.unit_value_principal === null || act.unit_value_assistant === null;
          }
          return act.unit_value === null;
        });

        if (actsWithoutValue.length > 0) {
          newActionables.push({
            id: "missing-act-values",
            type: "info",
            message: "Algunos de tus actos médicos aún no tienen valor configurado",
            emoji: "💰",
            actionLabel: "Configurar valores",
            actionPath: "/dashboard",
          });
        }
      }
    }

    setActionables(newActionables);
  }

  function getActionableStyles(type: string) {
    switch (type) {
      case "warning":
        return "bg-yellow-50 border-yellow-200 text-yellow-900";
      case "info":
        return "bg-blue-50 border-blue-200 text-blue-900";
      case "success":
        return "bg-green-50 border-green-200 text-green-900";
      default:
        return "bg-gray-50 border-gray-200 text-gray-900";
    }
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <main className="min-h-screen p-3 sm:p-6 pb-24 relative z-10">
      <div className="max-w-3xl mx-auto w-full">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">
          Inicio 🏠
        </h1>

        {actionables.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-black shadow-sm p-6 sm:p-8 text-center">
            <div className="text-4xl mb-4">🎉</div>
            <div className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
              ¡Todo está al día!
            </div>
            <div className="text-sm sm:text-base text-gray-600">
              No tenés acciones pendientes. ¡Excelente trabajo!
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {actionables.map((actionable) => (
              <div
                key={actionable.id}
                className={`bg-white rounded-xl border-2 ${getActionableStyles(actionable.type)} shadow-sm p-4 sm:p-6`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="text-2xl sm:text-3xl flex-shrink-0">
                    {actionable.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm sm:text-base font-medium mb-2">
                      {actionable.message}
                    </div>
                    {actionable.actionLabel && actionable.actionPath && (
                      <button
                        onClick={() => router.push(actionable.actionPath!)}
                        className="mt-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-xs sm:text-sm font-medium"
                      >
                        {actionable.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Accesos rápidos */}
        <div className="mt-8">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
            Accesos rápidos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <button
              onClick={() => router.push("/dashboard/calendario")}
              className="bg-white rounded-xl border-2 border-black shadow-sm p-4 hover:bg-gray-50 transition-colors text-center"
            >
              <div className="text-2xl sm:text-3xl mb-2">📅</div>
              <div className="text-xs sm:text-sm font-medium text-gray-900">
                Calendario
              </div>
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="bg-white rounded-xl border-2 border-black shadow-sm p-4 hover:bg-gray-50 transition-colors text-center"
            >
              <div className="text-2xl sm:text-3xl mb-2">🏥</div>
              <div className="text-xs sm:text-sm font-medium text-gray-900">
                Hospitales
              </div>
            </button>
            <button
              onClick={() => router.push("/dashboard/consolidacion")}
              className="bg-white rounded-xl border-2 border-black shadow-sm p-4 hover:bg-gray-50 transition-colors text-center"
            >
              <div className="text-2xl sm:text-3xl mb-2">🤝</div>
              <div className="text-xs sm:text-sm font-medium text-gray-900">
                Consolidación
              </div>
            </button>
            <button
              onClick={() => router.push("/dashboard/perfil")}
              className="bg-white rounded-xl border-2 border-black shadow-sm p-4 hover:bg-gray-50 transition-colors text-center"
            >
              <div className="text-2xl sm:text-3xl mb-2">🥳</div>
              <div className="text-xs sm:text-sm font-medium text-gray-900">
                Perfil
              </div>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
