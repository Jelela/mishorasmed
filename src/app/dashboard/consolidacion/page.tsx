"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { checkOnboardingStatus } from "@/lib/profileHelpers";
import { Loading } from "@/components/Loading";
import { useToast } from "@/components/ToastProvider";

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

interface ClosingInfo {
  id: string; // hospital_id + closing_date
  hospitalId: string;
  hospitalName: string;
  closingDate: Date;
  closingDay: number;
  periodStart: Date; // calculado
  periodEnd: Date; // calculado
  isPast: boolean;
  closureId?: string; // ID de hospital_closures si existe
  periodStartEffective?: Date; // período efectivo (editable)
  periodEndEffective?: Date; // período efectivo (editable)
  isAdjusted?: boolean;
}

interface EntryDetail {
  id: string;
  date: string;
  start_at: string | null;
  end_at: string | null;
  quantity: number;
  notes: string | null;
  actName: string;
  unitType: string;
}

interface GroupedData {
  groupId: string | null;
  groupName: string;
  sortOrder: number;
  isConsolidated: boolean;
  closureGroupStatusId?: string;
  acts: Array<{
    actId: string;
    actName: string;
    unitType: string;
    totalQuantity: number;
    totalValue: number;
    totalPatients: number | null;
    entries: EntryDetail[];
  }>;
  totalValue: number;
}

export default function ConsolidacionPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<UserHospital[]>([]);
  const [upcomingClosings, setUpcomingClosings] = useState<ClosingInfo[]>([]);
  const [pastClosings, setPastClosings] = useState<ClosingInfo[]>([]);
  const [expandedClosing, setExpandedClosing] = useState<string | null>(null);
  const [closingData, setClosingData] = useState<Record<string, GroupedData[]>>({});
  const [loadingClosingData, setLoadingClosingData] = useState<Record<string, boolean>>({});
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [consolidatedStatus, setConsolidatedStatus] = useState<Record<string, boolean>>({});
  const [updatingConsolidated, setUpdatingConsolidated] = useState<string | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null);
  const [editPeriodStart, setEditPeriodStart] = useState<string>("");
  const [editPeriodEnd, setEditPeriodEnd] = useState<string>("");
  const [editAdjustReason, setEditAdjustReason] = useState<string>("");
  const [savingPeriod, setSavingPeriod] = useState<string | null>(null);

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

      await loadHospitals(data.user.id);
      await loadConsolidatedStatus(data.user.id);
      setLoading(false);
    })();
  }, [router]);

  async function loadHospitals(userId: string) {
    const { data, error } = await supabase
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

    if (error) {
      console.error("Error al cargar hospitales:", error);
      return;
    }

    // Convertir hospital de objeto único a array (Supabase devuelve objeto único en join)
    const hospitalsData: UserHospital[] = (data || []).map((uh: any) => ({
      ...uh,
      hospital: Array.isArray(uh.hospital) ? uh.hospital : (uh.hospital ? [uh.hospital] : []),
    }));

    setHospitals(hospitalsData);
    calculateClosings(hospitalsData);
  }

  function calculateClosings(hospitalsData: UserHospital[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming: ClosingInfo[] = [];
    const past: ClosingInfo[] = [];

    hospitalsData.forEach((uh) => {
      const hospital = uh.hospital?.[0];
      if (!hospital?.closing_day) return;

      const closingDay = hospital.closing_day;
      
      // Calcular el próximo cierre
      const nextClosing = new Date(today);
      nextClosing.setDate(closingDay);
      nextClosing.setHours(0, 0, 0, 0);
      
      // Si el cierre de este mes ya pasó, el próximo es el del mes siguiente
      if (nextClosing < today) {
        nextClosing.setMonth(nextClosing.getMonth() + 1);
        nextClosing.setDate(closingDay);
      }

      // Calcular el período
      const { startDate, endDate } = getClosingPeriod(nextClosing, closingDay);

      upcoming.push({
        id: `${uh.id}-${formatDate(nextClosing)}`,
        hospitalId: uh.id,
        hospitalName: hospital.name,
        closingDate: nextClosing,
        closingDay: closingDay,
        periodStart: startDate,
        periodEnd: endDate,
        isPast: false,
      });

      // Calcular cierres pasados (solo desde 2026)
      const year2026 = new Date(2026, 0, 1);
      year2026.setHours(0, 0, 0, 0);
      
      // Generar cierres pasados desde 2026 hasta el cierre anterior al próximo
      const previousClosing = new Date(nextClosing);
      previousClosing.setMonth(previousClosing.getMonth() - 1);
      
      let currentClosing = new Date(previousClosing);
      currentClosing.setDate(closingDay);
      currentClosing.setHours(0, 0, 0, 0);
      
      // Mientras el cierre sea >= 2026 y < hoy
      while (currentClosing >= year2026 && currentClosing < today) {
        const { startDate: pastStart, endDate: pastEnd } = getClosingPeriod(currentClosing, closingDay);
        
        past.push({
          id: `${uh.id}-${formatDate(currentClosing)}`,
          hospitalId: uh.id,
          hospitalName: hospital.name,
          closingDate: new Date(currentClosing),
          closingDay: closingDay,
          periodStart: pastStart,
          periodEnd: pastEnd,
          isPast: true,
        });
        
        // Retroceder un mes
        currentClosing.setMonth(currentClosing.getMonth() - 1);
      }
    });

    // Ordenar: próximos por fecha ascendente, pasados por fecha descendente
    upcoming.sort((a, b) => a.closingDate.getTime() - b.closingDate.getTime());
    past.sort((a, b) => b.closingDate.getTime() - a.closingDate.getTime());

    setUpcomingClosings(upcoming);
    setPastClosings(past);
  }

  function getClosingPeriod(closingDate: Date, closingDay: number): { startDate: Date; endDate: Date } {
    const startDate = new Date(closingDate);
    startDate.setMonth(startDate.getMonth() - 1);
    startDate.setDate(closingDay);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(closingDate);
    endDate.setDate(closingDay - 1);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  function formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  async function loadClosingData(closing: ClosingInfo) {
    if (closingData[closing.id]) return; // Ya cargado

    setLoadingClosingData((prev) => ({ ...prev, [closing.id]: true }));

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoadingClosingData((prev) => ({ ...prev, [closing.id]: false }));
      return;
    }

    // 1. Asegurar que existe hospital_closures
    const periodStartCalc = formatDate(closing.periodStart);
    const periodEndCalc = formatDate(closing.periodEnd);

    let { data: closureData, error: closureError } = await supabase
      .from("hospital_closures")
      .select("*")
      .eq("user_hospital_id", closing.hospitalId)
      .eq("period_start_calc", periodStartCalc)
      .eq("period_end_calc", periodEndCalc)
      .maybeSingle();

    // Si no existe, crearlo
    if (!closureData) {
      const { data: newClosure, error: createError } = await supabase
        .from("hospital_closures")
        .insert({
          user_id: user.id,
          user_hospital_id: closing.hospitalId,
          period_start_calc: periodStartCalc,
          period_end_calc: periodEndCalc,
          period_start: periodStartCalc,
          period_end: periodEndCalc,
          is_adjusted: false,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error al crear closure:", createError);
        toast.showToast("Error al crear cierre: " + createError.message, "error");
        setLoadingClosingData((prev) => ({ ...prev, [closing.id]: false }));
        return;
      }
      closureData = newClosure;
    } else if (closureError && closureError.code !== "PGRST116") {
      console.error("Error al cargar closure:", closureError);
      toast.showToast("Error al cargar cierre: " + closureError.message, "error");
      setLoadingClosingData((prev) => ({ ...prev, [closing.id]: false }));
      return;
    }

    if (!closureData) {
      console.error("No se pudo obtener o crear closure");
      setLoadingClosingData((prev) => ({ ...prev, [closing.id]: false }));
      return;
    }

    // Actualizar closing con closureId y período efectivo
    closing.closureId = closureData.id;
    closing.periodStartEffective = new Date(closureData.period_start);
    closing.periodEndEffective = new Date(closureData.period_end);
    closing.isAdjusted = closureData.is_adjusted;

    // Actualizar estado de cierres para reflejar cambios en la UI
    if (closing.isPast) {
      setPastClosings((prev) =>
        prev.map((c) => (c.id === closing.id ? { ...c, ...closing } : c))
      );
    } else {
      setUpcomingClosings((prev) =>
        prev.map((c) => (c.id === closing.id ? { ...c, ...closing } : c))
      );
    }

    // Usar período efectivo para cargar entries
    const periodStartEffective = closing.periodStartEffective || closing.periodStart;
    const periodEndEffective = closing.periodEndEffective || closing.periodEnd;

    // Cargar entries del período efectivo
    const { data: entriesData, error: entriesError } = await supabase
      .from("entries")
      .select(
        `
        id,
        date,
        start_at,
        end_at,
        quantity,
        notes,
        patients_count,
        role,
        total_amount,
        act:medical_acts(
          id,
          name,
          unit_type,
          unit_value,
          pricing_rules,
          requires_patients,
          user_report_group_id,
          group:user_report_groups(
            id,
            name,
            sort_order
          )
        )
      `
      )
      .eq("user_id", user.id)
      .eq("user_hospital_id", closing.hospitalId)
      .gte("date", formatDate(periodStartEffective))
      .lte("date", formatDate(periodEndEffective))
      .order("date", { ascending: true });

    if (entriesError) {
      console.error("Error al cargar entries:", entriesError);
      setLoadingClosingData((prev) => ({ ...prev, [closing.id]: false }));
      return;
    }

    // Cargar grupos de envío
    const { data: groupsData } = await supabase
      .from("user_report_groups")
      .select("id, name, sort_order")
      .eq("user_hospital_id", closing.hospitalId)
      .eq("is_active", true)
      .order("sort_order");

    // 2. Asegurar que existen hospital_closure_group_status para todos los grupos
    const allGroupIds = [
      ...(groupsData || []).map(g => g.id),
      null, // Para el grupo "Sin agrupar"
    ];

    // Cargar estados existentes
    const { data: existingStatuses } = await supabase
      .from("hospital_closure_group_status")
      .select("*")
      .eq("closure_id", closureData.id);

    const existingGroupIds = new Set((existingStatuses || []).map(s => s.user_report_group_id));

    // Crear estados faltantes
    const missingGroupIds = allGroupIds.filter(gid => !existingGroupIds.has(gid));
    if (missingGroupIds.length > 0) {
      const newStatuses = missingGroupIds.map(groupId => ({
        closure_id: closureData.id,
        user_report_group_id: groupId,
        is_consolidated: false,
      }));

      await supabase
        .from("hospital_closure_group_status")
        .insert(newStatuses);
    }

    // Cargar todos los estados actualizados
    const { data: allStatuses } = await supabase
      .from("hospital_closure_group_status")
      .select("*")
      .eq("closure_id", closureData.id);

    // Crear mapa de estados de consolidación por grupo
    const consolidationStatusMap = new Map<string, { id: string; isConsolidated: boolean }>();
    (allStatuses || []).forEach((status: any) => {
      const groupKey = status.user_report_group_id || "null";
      consolidationStatusMap.set(groupKey, {
        id: status.id,
        isConsolidated: status.is_consolidated || false,
      });
    });

    // Agrupar por grupo de envío
    const groupTotals: Record<string, {
      groupId: string | null;
      groupName: string;
      sortOrder: number;
      isConsolidated: boolean;
      closureGroupStatusId?: string;
      acts: Record<string, {
        actId: string;
        actName: string;
        unitType: string;
        totalQuantity: number;
        totalValue: number;
        totalPatients: number | null;
        entries: EntryDetail[];
      }>;
      totalValue: number;
    }> = {};

    (entriesData || []).forEach((entry: any) => {
      const act = entry.act;
      if (!act) return;

      const groupId = act.user_report_group_id || null;
      const groupName = act.group?.name || (groupId ? groupsData?.find(g => g.id === groupId)?.name : null) || "Sin agrupar";
      const sortOrder = act.group?.sort_order ?? (groupId ? groupsData?.find(g => g.id === groupId)?.sort_order : 9999) ?? 9999;

      const groupKey = groupId || "null";

      if (!groupTotals[groupKey]) {
        const consolidationStatus = consolidationStatusMap.get(groupKey);
        groupTotals[groupKey] = {
          groupId: groupId,
          groupName: groupName,
          sortOrder: sortOrder,
          isConsolidated: consolidationStatus?.isConsolidated || false,
          closureGroupStatusId: consolidationStatus?.id,
          acts: {},
          totalValue: 0,
        };
      }

      const actId = act.id;
      if (!groupTotals[groupKey].acts[actId]) {
        groupTotals[groupKey].acts[actId] = {
          actId: actId,
          actName: act.name,
          unitType: act.unit_type,
          totalQuantity: 0,
          totalValue: 0,
          totalPatients: null,
          entries: [],
        };
      }

      const actTotal = groupTotals[groupKey].acts[actId];
      actTotal.totalQuantity += entry.quantity;
      
      // Agregar entry con todos los detalles
      actTotal.entries.push({
        id: entry.id,
        date: entry.date,
        start_at: entry.start_at,
        end_at: entry.end_at,
        quantity: entry.quantity,
        notes: entry.notes,
        actName: act.name,
        unitType: act.unit_type,
      });

      if (act.requires_patients && entry.patients_count) {
        if (actTotal.totalPatients === null) {
          actTotal.totalPatients = 0;
        }
        actTotal.totalPatients += entry.patients_count;
      }

      // Calcular valor
      let entryValue = 0;
      if (entry.total_amount !== null && entry.total_amount !== undefined) {
        entryValue = entry.total_amount;
      } else if (act.unit_value !== null) {
        if (act.pricing_rules?.nocturnidad) {
          entryValue = entry.quantity * act.unit_value * act.pricing_rules.nocturnidad.multiplier;
        } else {
          entryValue = entry.quantity * act.unit_value;
        }
      }

      actTotal.totalValue += entryValue;
      groupTotals[groupKey].totalValue += entryValue;
    });

    const groupedData = Object.values(groupTotals)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(group => ({
        ...group,
        acts: Object.values(group.acts),
      }));

    setClosingData((prev) => ({ ...prev, [closing.id]: groupedData }));
    setLoadingClosingData((prev) => ({ ...prev, [closing.id]: false }));
  }

  async function loadConsolidatedStatus(userId: string) {
    // Ya no usamos localStorage, se carga desde la base de datos
    // Este método se mantiene por compatibilidad pero no hace nada
  }

  async function toggleConsolidated(closingId: string, groupId: string | null, closureGroupStatusId?: string) {
    if (!closureGroupStatusId) {
      toast.showToast("Error: no se encontró el estado del grupo", "error");
      return;
    }

    setUpdatingConsolidated(`${closingId}-${groupId || "null"}`);

    // Obtener estado actual
    const { data: currentStatus, error: fetchError } = await supabase
      .from("hospital_closure_group_status")
      .select("is_consolidated")
      .eq("id", closureGroupStatusId)
      .single();

    if (fetchError) {
      console.error("Error al obtener estado:", fetchError);
      setUpdatingConsolidated(null);
      return;
    }

    const newStatus = !currentStatus.is_consolidated;

    // Actualizar en base de datos
    const updateData: any = {
      is_consolidated: newStatus,
    };

    if (newStatus) {
      updateData.consolidated_at = new Date().toISOString();
    } else {
      updateData.consolidated_at = null;
    }

    const { error: updateError } = await supabase
      .from("hospital_closure_group_status")
      .update(updateData)
      .eq("id", closureGroupStatusId);

    if (updateError) {
      console.error("Error al actualizar estado:", updateError);
      toast.showToast("Error al actualizar estado de consolidación", "error");
    } else {
      // Actualizar estado local
      const groupKey = groupId || "null";
      const statusKey = `${closingId}-${groupKey}`;
      setConsolidatedStatus((prev) => ({
        ...prev,
        [statusKey]: newStatus,
      }));

      // Actualizar datos del cierre
      if (closingData[closingId]) {
        const updatedData = closingData[closingId].map((group) => {
          if ((group.groupId || null) === (groupId || null)) {
            return {
              ...group,
              isConsolidated: newStatus,
            };
          }
          return group;
        });
        setClosingData((prev) => ({
          ...prev,
          [closingId]: updatedData,
        }));
      }
    }

    setUpdatingConsolidated(null);
  }

  async function savePeriodEdit(closingId: string, closureId: string) {
    if (!editPeriodStart || !editPeriodEnd) {
      toast.showToast("Las fechas de inicio y fin son requeridas", "error");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    setSavingPeriod(closingId);

    try {
      // Obtener closure para comparar con período calculado
      const { data: closure, error: fetchError } = await supabase
        .from("hospital_closures")
        .select("period_start_calc, period_end_calc")
        .eq("id", closureId)
        .single();

      if (fetchError) {
        toast.showToast("Error al obtener datos del cierre", "error");
        return;
      }

      const isAdjusted = editPeriodStart !== closure.period_start_calc || editPeriodEnd !== closure.period_end_calc;

      const { error: updateError } = await supabase
        .from("hospital_closures")
        .update({
          period_start: editPeriodStart,
          period_end: editPeriodEnd,
          is_adjusted: isAdjusted,
          adjust_reason: editAdjustReason.trim() || null,
        })
        .eq("id", closureId);

      if (updateError) {
        toast.showToast("Error al actualizar período: " + updateError.message, "error");
        return;
      }

      toast.showToast("Período actualizado correctamente", "success");

      // Cerrar modal de edición
      setEditingPeriod(null);
      setEditPeriodStart("");
      setEditPeriodEnd("");
      setEditAdjustReason("");

      // Recargar datos del cierre
      const closing = [...upcomingClosings, ...pastClosings].find(c => c.id === closingId);
      if (closing) {
        // Limpiar datos para forzar recarga
        setClosingData((prev) => {
          const newData = { ...prev };
          delete newData[closingId];
          return newData;
        });
        // Recargar
        await loadClosingData(closing);
      }
    } finally {
      setSavingPeriod(null);
    }
  }

  // Extraer fecha de un timestamp sin conversión de zona horaria
  function extractDateFromTimestamp(timestamp: string | null | undefined): string {
    if (!timestamp) return "";
    const parts = timestamp.split("T");
    return parts[0] || "";
  }

  // Extraer hora y minuto de un timestamp sin conversión de zona horaria
  function extractTimeFromTimestamp(timestamp: string | null | undefined): { hours: number; minutes: number } {
    if (!timestamp) return { hours: 0, minutes: 0 };
    const match = timestamp.match(/T(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return { hours: 0, minutes: 0 };
    return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
  }

  // Formatear fecha sin conversión de zona horaria
  function formatDateSafe(dateString: string | null): string {
    if (!dateString) return "";
    
    // Si es un timestamp, extraer solo la parte de fecha
    let datePart = dateString;
    if (dateString.includes("T")) {
      datePart = extractDateFromTimestamp(dateString);
    }
    
    // Parsear directamente sin conversión de zona horaria
    const [year, month, day] = datePart.split("-").map(Number);
    
    // Formatear directamente sin usar Date para evitar conversión de zona horaria
    const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${day} de ${monthNames[month - 1]} de ${year}`;
  }

  function formatTime(dateString: string | null): string {
    if (!dateString) return "";
    const time = extractTimeFromTimestamp(dateString);
    const period = time.hours >= 12 ? "p. m." : "a. m.";
    const displayHour = time.hours === 0 ? 12 : time.hours > 12 ? time.hours - 12 : time.hours;
    const displayMinute = String(time.minutes).padStart(2, "0");
    return `${String(displayHour).padStart(2, "0")}:${displayMinute} ${period}`;
  }

  function calculateHours(startAt: string | null, endAt: string | null, quantity: number): number {
    if (startAt && endAt) {
      // Parsear como naive timestamps para evitar conversión de zona horaria
      const startTime = extractTimeFromTimestamp(startAt);
      const endTime = extractTimeFromTimestamp(endAt);
      
      // Calcular diferencia en minutos
      const startMinutes = startTime.hours * 60 + startTime.minutes;
      const endMinutes = endTime.hours * 60 + endTime.minutes;
      
      // Si end es menor que start, asumir que cruza medianoche
      let diffMinutes = endMinutes - startMinutes;
      if (diffMinutes < 0) {
        diffMinutes += 24 * 60; // Agregar 24 horas
      }
      
      return diffMinutes / 60;
    }
    return quantity;
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <main className="min-h-screen p-3 sm:p-6 pb-24 relative z-10">
      <div className="max-w-4xl mx-auto w-full">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">
          Consolidación 🤝
        </h1>

        {/* Próximos cierres */}
        {upcomingClosings.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
              Próximos cierres
            </h2>
            <div className="space-y-4">
              {upcomingClosings.map((closing) => (
                <div
                  key={closing.id}
                  className="bg-white rounded-xl border-2 border-black shadow-sm overflow-hidden"
                >
                  <button
                    onClick={() => {
                      if (expandedClosing === closing.id) {
                        setExpandedClosing(null);
                      } else {
                        setExpandedClosing(closing.id);
                        loadClosingData(closing);
                      }
                    }}
                    className="w-full px-4 sm:px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate mb-1">
                        {closing.hospitalName}
                      </div>
                      <div className="text-sm text-gray-600">
                        Cierre: {closing.closingDate.toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Período: {(closing.periodStartEffective || closing.periodStart).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                        })} - {(closing.periodEndEffective || closing.periodEnd).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {closing.isAdjusted && (
                          <span className="ml-2 text-orange-600">(Ajustado)</span>
                        )}
                      </div>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-5 w-5 text-gray-600 transition-transform flex-shrink-0 ml-4 ${
                        expandedClosing === closing.id ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {expandedClosing === closing.id && (
                    <div className="px-4 sm:px-6 py-4 border-t border-gray-200">
                      {loadingClosingData[closing.id] ? (
                        <div className="text-sm text-gray-600 py-4">Cargando datos...</div>
                      ) : closingData[closing.id] && closingData[closing.id].length > 0 ? (
                        <div className="space-y-6">
                          {/* Botón para editar período */}
                          {closing.closureId && (
                            <div className="mb-4 flex justify-end">
                              <button
                                onClick={() => {
                                  setEditingPeriod(closing.id);
                                  if (closing.periodStartEffective && closing.periodEndEffective) {
                                    setEditPeriodStart(formatDate(closing.periodStartEffective));
                                    setEditPeriodEnd(formatDate(closing.periodEndEffective));
                                  } else {
                                    setEditPeriodStart(formatDate(closing.periodStart));
                                    setEditPeriodEnd(formatDate(closing.periodEnd));
                                  }
                                  // Cargar adjust_reason si existe
                                  if (closing.closureId) {
                                    supabase
                                      .from("hospital_closures")
                                      .select("adjust_reason")
                                      .eq("id", closing.closureId)
                                      .single()
                                      .then(({ data }) => {
                                        if (data) {
                                          setEditAdjustReason(data.adjust_reason || "");
                                        }
                                      });
                                  }
                                }}
                                className="text-xs sm:text-sm px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-medium"
                              >
                                Editar período
                              </button>
                            </div>
                          )}
                          {closingData[closing.id].map((group) => (
                            <div key={group.groupId || "null"}>
                              <h3 className="font-semibold text-gray-900 mb-3">
                                {group.groupName}
                              </h3>
                              <div className="space-y-3">
                                {group.acts.map((act) => {
                                  // Para actos de tipo "hours", calcular horas trabajadas
                                  // Para actos de tipo "units", usar directamente totalQuantity (cantidad)
                                  const displayValue = act.unitType === "hours" 
                                    ? act.entries.reduce((sum, e) => {
                                        return sum + calculateHours(e.start_at, e.end_at, e.quantity);
                                      }, 0)
                                    : act.totalQuantity;
                                  const detailsKey = `${closing.id}-${act.actId}`;
                                  const showDetails = expandedDetails.has(detailsKey);

                                  return (
                                    <div
                                      key={act.actId}
                                      className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200"
                                    >
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                          <div className="font-medium text-gray-900">
                                            {act.actName}
                                          </div>
                                          <div className="text-sm text-gray-600 mt-1">
                                            {act.unitType === "hours" 
                                              ? `${displayValue.toFixed(2)} h`
                                              : `${displayValue.toFixed(0)} cantidad`}
                                            {act.totalValue > 0 && (
                                              <span className="ml-2">
                                                - ${act.totalValue.toFixed(2)}
                                              </span>
                                            )}
                                            {act.totalPatients !== null && (
                                              <span className="ml-2">
                                                - {act.totalPatients} pacientes
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => {
                                            const newExpanded = new Set(expandedDetails);
                                            if (showDetails) {
                                              newExpanded.delete(detailsKey);
                                            } else {
                                              newExpanded.add(detailsKey);
                                            }
                                            setExpandedDetails(newExpanded);
                                          }}
                                          className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors font-medium ml-2 flex-shrink-0"
                                        >
                                          {showDetails ? "Ocultar" : "Detalle"}
                                        </button>
                                      </div>

                                      {showDetails && (
                                        <div className="mt-3 pt-3 border-t border-gray-300 space-y-2">
                                          {act.entries.map((entry) => {
                                            const hours = calculateHours(entry.start_at, entry.end_at, entry.quantity);
                                            return (
                                              <div
                                                key={entry.id}
                                                className="text-xs sm:text-sm text-gray-700 bg-white rounded p-2 border border-gray-200"
                                              >
                                                <div className="font-medium">
                                                  {formatDateSafe(entry.start_at || entry.date)}
                                                </div>
                                                <div className="text-gray-600 mt-1">
                                                  {entry.start_at && entry.end_at ? (
                                                    <>
                                                      {formatTime(entry.start_at)} - {formatTime(entry.end_at)}
                                                      <span className="ml-2">
                                                        ({entry.unitType === "hours" 
                                                          ? `${hours.toFixed(2)}h` 
                                                          : `${entry.quantity.toFixed(0)}`})
                                                      </span>
                                                    </>
                                                  ) : (
                                                    <>
                                                      {entry.quantity} {entry.unitType === "hours" ? "h" : "cantidad"}
                                                    </>
                                                  )}
                                                </div>
                                                {entry.notes && (
                                                  <div className="text-gray-500 mt-1 italic">
                                                    {entry.notes}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              {group.totalValue > 0 && (
                                <div className="mt-3 text-sm font-semibold text-gray-900">
                                  Total grupo: ${group.totalValue.toFixed(2)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600 py-4">
                          No hay registros para este período
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cierres pasados */}
        {pastClosings.length > 0 && (
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">
              Cierres pasados
            </h2>
            <div className="space-y-4">
              {pastClosings.map((closing) => {
                const isConsolidated = consolidatedStatus[closing.id] || false;
                return (
                  <div
                    key={closing.id}
                    className="bg-white rounded-xl border-2 border-black shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        if (expandedClosing === closing.id) {
                          setExpandedClosing(null);
                        } else {
                          setExpandedClosing(closing.id);
                          loadClosingData(closing);
                        }
                      }}
                      className="w-full px-4 sm:px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate mb-1">
                          {closing.hospitalName}
                        </div>
                        <div className="text-sm text-gray-600">
                          Cierre: {closing.closingDate.toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Período: {(closing.periodStartEffective || closing.periodStart).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                          })} - {(closing.periodEndEffective || closing.periodEnd).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {closing.isAdjusted && (
                            <span className="ml-2 text-orange-600">(Ajustado)</span>
                          )}
                        </div>
                      </div>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-5 w-5 text-gray-600 transition-transform flex-shrink-0 ml-4 ${
                          expandedClosing === closing.id ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedClosing === closing.id && (
                      <div className="px-4 sm:px-6 py-4 border-t border-gray-200">
                        {loadingClosingData[closing.id] ? (
                          <div className="text-sm text-gray-600 py-4">Cargando datos...</div>
                        ) : closingData[closing.id] && closingData[closing.id].length > 0 ? (
                          <div className="space-y-6">
                            {/* Botón para editar período */}
                            {closing.closureId && (
                              <div className="mb-4 flex justify-end">
                                <button
                                  onClick={() => {
                                    setEditingPeriod(closing.id);
                                    if (closing.periodStartEffective && closing.periodEndEffective) {
                                      setEditPeriodStart(formatDate(closing.periodStartEffective));
                                      setEditPeriodEnd(formatDate(closing.periodEndEffective));
                                    } else {
                                      setEditPeriodStart(formatDate(closing.periodStart));
                                      setEditPeriodEnd(formatDate(closing.periodEnd));
                                    }
                                    // Cargar adjust_reason si existe
                                    if (closing.closureId) {
                                      supabase
                                        .from("hospital_closures")
                                        .select("adjust_reason")
                                        .eq("id", closing.closureId)
                                        .single()
                                        .then(({ data }) => {
                                          if (data) {
                                            setEditAdjustReason(data.adjust_reason || "");
                                          }
                                        });
                                    }
                                  }}
                                  className="text-xs sm:text-sm px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-medium"
                                >
                                  Editar período
                                </button>
                              </div>
                            )}
                            {closingData[closing.id].map((group) => {
                              const groupStatusKey = `${closing.id}-${group.groupId || "null"}`;
                              const isGroupConsolidated = group.isConsolidated || false;
                              const isUpdating = updatingConsolidated === groupStatusKey;
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const periodEnd = closing.periodEndEffective || closing.periodEnd;
                              const isPast = periodEnd < today;

                              return (
                                <div key={group.groupId || "null"}>
                                  <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold text-gray-900">
                                      {group.groupName}
                                    </h3>
                                    {isPast && group.closureGroupStatusId && (
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={isGroupConsolidated}
                                          onChange={() => toggleConsolidated(closing.id, group.groupId, group.closureGroupStatusId)}
                                          disabled={isUpdating}
                                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <span className="text-xs sm:text-sm text-gray-700 whitespace-nowrap">
                                          Consolidado con el hospital
                                        </span>
                                      </label>
                                    )}
                                  </div>
                                <div className="space-y-3">
                                  {group.acts.map((act) => {
                                    // Para actos de tipo "hours", calcular horas trabajadas
                                    // Para actos de tipo "units", usar directamente totalQuantity (cantidad)
                                    const displayValue = act.unitType === "hours" 
                                      ? act.entries.reduce((sum, e) => {
                                          return sum + calculateHours(e.start_at, e.end_at, e.quantity);
                                        }, 0)
                                      : act.totalQuantity;
                                    const detailsKey = `${closing.id}-${act.actId}`;
                                    const showDetails = expandedDetails.has(detailsKey);

                                    return (
                                      <div
                                        key={act.actId}
                                        className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200"
                                      >
                                        <div className="flex items-start justify-between mb-2">
                                          <div className="flex-1">
                                            <div className="font-medium text-gray-900">
                                              {act.actName}
                                            </div>
                                            <div className="text-sm text-gray-600 mt-1">
                                              {act.unitType === "hours" 
                                                ? `${displayValue.toFixed(2)} h`
                                                : `${displayValue.toFixed(0)} cantidad`}
                                              {act.totalValue > 0 && (
                                                <span className="ml-2">
                                                  - ${act.totalValue.toFixed(2)}
                                                </span>
                                              )}
                                              {act.totalPatients !== null && (
                                                <span className="ml-2">
                                                  - {act.totalPatients} pacientes
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => {
                                              const newExpanded = new Set(expandedDetails);
                                              if (showDetails) {
                                                newExpanded.delete(detailsKey);
                                              } else {
                                                newExpanded.add(detailsKey);
                                              }
                                              setExpandedDetails(newExpanded);
                                            }}
                                            className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors font-medium ml-2 flex-shrink-0"
                                          >
                                            {showDetails ? "Ocultar" : "Detalle"}
                                          </button>
                                        </div>

                                        {showDetails && (
                                          <div className="mt-3 pt-3 border-t border-gray-300 space-y-2">
                                            {act.entries.map((entry) => {
                                              const hours = calculateHours(entry.start_at, entry.end_at, entry.quantity);
                                              return (
                                                <div
                                                  key={entry.id}
                                                  className="text-xs sm:text-sm text-gray-700 bg-white rounded p-2 border border-gray-200"
                                                >
                                                  <div className="font-medium">
                                                    {formatDateSafe(entry.start_at || entry.date)}
                                                  </div>
                                                  <div className="text-gray-600 mt-1">
                                                    {entry.start_at && entry.end_at ? (
                                                      <>
                                                        {formatTime(entry.start_at)} - {formatTime(entry.end_at)}
                                                        <span className="ml-2">
                                                          ({entry.unitType === "hours" 
                                                            ? `${hours.toFixed(2)}h` 
                                                            : `${entry.quantity.toFixed(0)}`})
                                                        </span>
                                                      </>
                                                    ) : (
                                                      <>
                                                        {entry.quantity} {entry.unitType === "hours" ? "h" : "cantidad"}
                                                      </>
                                                    )}
                                                  </div>
                                                  {entry.notes && (
                                                    <div className="text-gray-500 mt-1 italic">
                                                      {entry.notes}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              {group.totalValue > 0 && (
                                <div className="mt-3 text-sm font-semibold text-gray-900">
                                  Total grupo: ${group.totalValue.toFixed(2)}
                                </div>
                              )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-600 py-4">
                            No hay registros para este período
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {upcomingClosings.length === 0 && pastClosings.length === 0 && (
          <div className="text-center py-12 text-gray-600">
            No hay cierres configurados
          </div>
        )}

        {/* Modal de edición de período */}
        {editingPeriod && (() => {
          const closing = [...upcomingClosings, ...pastClosings].find(c => c.id === editingPeriod);
          if (!closing || !closing.closureId) return null;

          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4" onClick={() => {
              setEditingPeriod(null);
              setEditPeriodStart("");
              setEditPeriodEnd("");
              setEditAdjustReason("");
            }}>
              <div 
                className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-md w-full h-full sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
                    Editar período
                  </h3>
                  <button
                    onClick={() => {
                      setEditingPeriod(null);
                      setEditPeriodStart("");
                      setEditPeriodEnd("");
                      setEditAdjustReason("");
                    }}
                    className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors"
                    disabled={savingPeriod === editingPeriod}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 pb-20 sm:pb-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Desde <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={editPeriodStart}
                      onChange={(e) => setEditPeriodStart(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      disabled={savingPeriod === editingPeriod}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hasta <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={editPeriodEnd}
                      onChange={(e) => setEditPeriodEnd(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                      disabled={savingPeriod === editingPeriod}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Motivo del ajuste (opcional)
                    </label>
                    <textarea
                      value={editAdjustReason}
                      onChange={(e) => setEditAdjustReason(e.target.value)}
                      placeholder="Ej: El hospital ajustó las fechas del período"
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                      disabled={savingPeriod === editingPeriod}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex items-center justify-end gap-2 sm:gap-3 flex-shrink-0 bg-white">
                  <button
                    onClick={() => {
                      setEditingPeriod(null);
                      setEditPeriodStart("");
                      setEditPeriodEnd("");
                      setEditAdjustReason("");
                    }}
                    disabled={savingPeriod === editingPeriod}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => savePeriodEdit(editingPeriod, closing.closureId!)}
                    disabled={savingPeriod === editingPeriod || !editPeriodStart || !editPeriodEnd}
                    className="px-4 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                  >
                    {savingPeriod === editingPeriod ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
