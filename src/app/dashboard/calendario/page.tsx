"use client";

import { useEffect, useState, useRef, ReactElement } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { checkOnboardingStatus } from "@/lib/profileHelpers";
import { Loading } from "@/components/Loading";

interface CalendarEntry {
  id: string;
  user_hospital_id: string;
  act_id: string;
  date: string;
  start_at: string;
  end_at: string;
  quantity: number;
  notes: string | null;
  patients_count: number | null;
  role: "principal" | "assistant" | null;
  total_amount: number | null;
  calculation_detail: any | null;
  hospital?: {
    hospital?: {
      name: string;
    };
  };
  act?: {
    name: string;
    unit_type: string;
  };
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

interface ClosingEvent {
  id: string; // hospital_id + date
  hospitalId: string;
  hospitalName: string;
  date: Date;
  closingDay: number;
}

interface MedicalAct {
  id: string;
  name: string;
  unit_type: "hours" | "units";
  unit_value: number | null;
  requires_patients: boolean;
  supports_roles: boolean;
  unit_value_principal: number | null;
  unit_value_assistant: number | null;
}


export default function CalendarioPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [hospitals, setHospitals] = useState<UserHospital[]>([]);
  const [acts, setActs] = useState<MedicalAct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closingEvents, setClosingEvents] = useState<ClosingEvent[]>([]);
  const [showClosingModal, setShowClosingModal] = useState<ClosingEvent | null>(null);
  interface ActTotal {
    actId: string;
    actName: string;
    unitType: string;
    totalQuantity: number;
    totalValue: number;
    totalPatients: number | null;
    entries: any[];
  }

  interface GroupData {
    groupId: string | null;
    groupName: string;
    sortOrder: number;
    acts: ActTotal[];
    totalValue: number;
  }

  const [closingPeriodData, setClosingPeriodData] = useState<GroupData[]>([]);
  const [loadingClosingData, setLoadingClosingData] = useState(false);

  // Estados del formulario
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [selectedActId, setSelectedActId] = useState("");
  const [notes, setNotes] = useState("");
  const [patientsCount, setPatientsCount] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<"principal" | "assistant" | null>(null);
  
  // Estados para agregar acto
  const [showAddActForm, setShowAddActForm] = useState(false);
  const [newActName, setNewActName] = useState("");
  const [newActUnitType, setNewActUnitType] = useState<"hours" | "units">("hours");
  const [newActUnitValue, setNewActUnitValue] = useState<string>("");
  const [savingAct, setSavingAct] = useState(false);

  // Estados para el modal de registro
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [modalStartDate, setModalStartDate] = useState<Date | null>(null);
  const [modalStartHour, setModalStartHour] = useState<number>(0);
  const [modalStartMinute, setModalStartMinute] = useState<number>(0);
  const [modalEndDate, setModalEndDate] = useState<Date | null>(null);
  const [modalEndHour, setModalEndHour] = useState<number | null>(null);
  const [modalEndMinute, setModalEndMinute] = useState<number | null>(null);

  // Estados para detección de swipe (solo mobile, vista semanal)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

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
      await loadEntries();
      setLoading(false);
    })();
  }, [router, currentDate, viewMode]);

  useEffect(() => {
    if (hospitals.length > 0) {
      generateClosingEvents(hospitals);
    }
  }, [hospitals, currentDate, viewMode]);

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
    generateClosingEvents(hospitalsData);
  }

  function generateClosingEvents(hospitalsData: any[]) {
    const { startDate, endDate } = getViewDateRange(currentDate, viewMode);
    const events: ClosingEvent[] = [];

    hospitalsData.forEach((uh) => {
      const hospital = uh.hospital?.[0];
      if (!hospital?.closing_day) return;

      const closingDay = hospital.closing_day;
      
      // Generar eventos de cierre en el rango visible
      const current = new Date(startDate);
      while (current <= endDate) {
        // Si el día del mes coincide con closing_day, crear evento
        if (current.getDate() === closingDay) {
          events.push({
            id: `${uh.id}-${formatDate(current)}`,
            hospitalId: uh.id,
            hospitalName: hospital.name,
            date: new Date(current),
            closingDay: closingDay,
          });
        }
        current.setDate(current.getDate() + 1);
      }
    });

    setClosingEvents(events);
  }

  // Calcular período de cierre: si closing_day es 15, del 15 del mes anterior al 14 del día anterior
  function getClosingPeriod(closingEvent: ClosingEvent): { startDate: Date; endDate: Date } {
    const closingDate = new Date(closingEvent.date);
    const closingDay = closingEvent.closingDay;
    
    // Fecha de inicio: closing_day del mes anterior
    const startDate = new Date(closingDate);
    startDate.setMonth(startDate.getMonth() - 1);
    startDate.setDate(closingDay);
    startDate.setHours(0, 0, 0, 0);
    
    // Fecha de fin: closing_day - 1 del mes actual (día anterior al cierre)
    const endDate = new Date(closingDate);
    endDate.setDate(closingDay - 1);
    endDate.setHours(23, 59, 59, 999);
    
    return { startDate, endDate };
  }

  async function loadClosingPeriodData(closingEvent: ClosingEvent) {
    setLoadingClosingData(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoadingClosingData(false);
      return;
    }

    const { startDate, endDate } = getClosingPeriod(closingEvent);

    // Cargar entries del período
    const { data: entriesData, error: entriesError } = await supabase
      .from("entries")
      .select(
        `
        id,
        date,
        quantity,
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
      .eq("user_hospital_id", closingEvent.hospitalId)
      .gte("date", formatDate(startDate))
      .lte("date", formatDate(endDate))
      .order("date", { ascending: true });

    if (entriesError) {
      console.error("Error al cargar entries del período:", entriesError);
      setLoadingClosingData(false);
      return;
    }

    // Cargar grupos de envío para este hospital
    const { data: groupsData } = await supabase
      .from("user_report_groups")
      .select("id, name, sort_order")
      .eq("user_hospital_id", closingEvent.hospitalId)
      .eq("is_active", true)
      .order("sort_order");

    // Agrupar por grupo de envío (user_report_group_id)
    const groupTotals: Record<string, {
      groupId: string | null;
      groupName: string;
      sortOrder: number;
      acts: Record<string, {
        actId: string;
        actName: string;
        unitType: string;
        totalQuantity: number;
        totalValue: number;
        totalPatients: number | null;
        entries: any[];
      }>;
      totalValue: number;
    }> = {};

    (entriesData || []).forEach((entry: any) => {
      const act = entry.act;
      if (!act) return;

      const groupId = act.user_report_group_id || null;
      const groupName = act.group?.name || (groupId ? groupsData?.find(g => g.id === groupId)?.name : null) || "Sin agrupar";
      const sortOrder = act.group?.sort_order ?? (groupId ? groupsData?.find(g => g.id === groupId)?.sort_order : 9999) ?? 9999;

      // Crear clave única para el grupo
      const groupKey = groupId || "null";

      if (!groupTotals[groupKey]) {
        groupTotals[groupKey] = {
          groupId: groupId,
          groupName: groupName,
          sortOrder: sortOrder,
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
      actTotal.entries.push(entry);

      // Si requiere pacientes, sumar
      if (act.requires_patients && entry.patients_count) {
        if (actTotal.totalPatients === null) {
          actTotal.totalPatients = 0;
        }
        actTotal.totalPatients += entry.patients_count;
      }

      // Calcular valor: usar total_amount si existe (tiene roles), sino calcular
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

    // Convertir a array y ordenar por sort_order
    const groupedData = Object.values(groupTotals)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(group => ({
        ...group,
        acts: Object.values(group.acts),
      }));

    console.log("Datos agrupados por grupos de envío:", groupedData);
    setClosingPeriodData(groupedData);
    setLoadingClosingData(false);
  }

  function handleClosingEventClick(closingEvent: ClosingEvent) {
    setShowClosingModal(closingEvent);
    loadClosingPeriodData(closingEvent);
  }

  async function loadActs(userHospitalId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("medical_acts")
      .select("id, name, unit_type, unit_value, requires_patients, supports_roles, unit_value_principal, unit_value_assistant")
      .eq("user_hospital_id", userHospitalId)
      .eq("is_active", true)
      .order("sort_order, name");

    if (error) {
      setError("Error al cargar actos: " + error.message);
      return;
    }

    setActs(data || []);
    setSelectedActId("");
  }

  async function loadEntries() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { startDate, endDate } = getViewDateRange(currentDate, viewMode);

    const { data, error } = await supabase
      .from("entries")
      .select(
        `
        id,
        user_hospital_id,
        act_id,
        date,
        start_at,
        end_at,
        quantity,
        notes,
        patients_count,
        role,
        total_amount,
        calculation_detail,
        hospital:user_hospitals!inner(
          hospital:hospital_catalog(name)
        ),
        act:medical_acts(name, unit_type)
      `
      )
      .eq("user_id", user.id)
      .gte("date", formatDate(startDate))
      .lte("date", formatDate(endDate))
      .order("start_at", { ascending: true });

    if (error) {
      console.error("Error al cargar entries:", error);
      return;
    }

    const processedEntries = (data || []).map((entry: any) => ({
      ...entry,
      hospital: Array.isArray(entry.hospital?.hospital)
        ? entry.hospital.hospital[0]
        : entry.hospital?.hospital,
      act: entry.act,
    }));

    setEntries(processedEntries);
  }

  function getViewDateRange(date: Date, mode: "week" | "month") {
    if (mode === "week") {
      const start = getWeekStart(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { startDate: start, endDate: end };
    } else {
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      return { startDate: start, endDate: end };
    }
  }

  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Restar días para llegar al domingo
    return new Date(d.setDate(diff));
  }

  function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  function formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  // Parsear timestamp sin conversión de zona horaria (tratar como "naive")
  function parseNaiveTimestamp(timestamp: string | null | undefined): Date {
    // timestamp viene como "YYYY-MM-DDTHH:mm:ss"
    // Crear Date en UTC para evitar conversión de zona horaria
    if (!timestamp) {
      return new Date(); // Retornar fecha actual si no hay timestamp
    }
    
    if (!timestamp.includes("T")) {
      // Si no tiene T, asumir que es solo fecha y agregar hora 00:00:00
      const datePart = timestamp;
      const [year, month, day] = datePart.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    }
    
    const parts = timestamp.split("T");
    const datePart = parts[0];
    const timePart = parts[1] || "00:00:00";
    
    const [year, month, day] = datePart.split("-").map(Number);
    const timeParts = timePart.split(":");
    const hours = Number(timeParts[0]) || 0;
    const minutes = Number(timeParts[1]) || 0;
    const seconds = Number(timeParts[2]) || 0;
    
    // Crear Date en UTC (usa Date.UTC para evitar conversión)
    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  }

  // Extraer hora y minuto de un timestamp sin conversión de zona horaria
  function extractTimeFromTimestamp(timestamp: string | null | undefined): { hours: number; minutes: number } {
    if (!timestamp) return { hours: 0, minutes: 0 };
    const match = timestamp.match(/T(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return { hours: 0, minutes: 0 };
    return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
  }

  // Extraer fecha de un timestamp sin conversión de zona horaria
  function extractDateFromTimestamp(timestamp: string | null | undefined): string {
    if (!timestamp) return formatDate(new Date());
    const parts = timestamp.split("T");
    return parts[0] || formatDate(new Date());
  }

  function formatDateTime(timestamp: string): string {
    // Extraer directamente del string sin conversión de zona horaria
    const datePart = extractDateFromTimestamp(timestamp);
    const time = extractTimeFromTimestamp(timestamp);
    return `${datePart} ${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;
  }

  function calculateHours(start_at: string, end_at: string): number {
    // Parsear como naive timestamps para evitar conversión de zona horaria
    const start = parseNaiveTimestamp(start_at);
    const end = parseNaiveTimestamp(end_at);
    const diffMs = end.getTime() - start.getTime();
    return diffMs / (1000 * 60 * 60);
  }

  function isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  function isToday(date: Date): boolean {
    return isSameDay(date, new Date());
  }

  function getWeekDays(date: Date): Date[] {
    const start = getWeekStart(date);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  }

  function getDayName(date: Date): string {
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return days[date.getDay()];
  }

  function formatMonthYear(date: Date): string {
    const months = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];
    return `${months[date.getMonth()]} de ${date.getFullYear()}`;
  }

  function navigateDate(direction: number) {
    const newDate = new Date(currentDate);
    if (viewMode === "week") {
      newDate.setDate(newDate.getDate() + direction * 7);
    } else {
      newDate.setMonth(newDate.getMonth() + direction);
    }
    setCurrentDate(newDate);
  }

  // Handlers para swipe en mobile (vista semanal y mensual)
  function handleTouchStart(e: React.TouchEvent) {
    if (viewMode !== "week" && viewMode !== "month") return; // Solo en vista semanal o mensual
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    // Prevenir scroll vertical mientras se detecta swipe
    if ((viewMode !== "week" && viewMode !== "month") || touchStartX.current === null) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - (touchStartX.current || 0);
    const deltaY = touch.clientY - (touchStartY.current || 0);
    
    // Si el movimiento horizontal es mayor que el vertical, prevenir scroll
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if ((viewMode !== "week" && viewMode !== "month") || touchStartX.current === null || touchStartY.current === null) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;
    
    // Requerir mínimo de 50px de movimiento horizontal
    // Y que el movimiento horizontal sea mayor que el vertical (para evitar confundir con scroll)
    const minSwipeDistance = 50;
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (viewMode === "week") {
        // Vista semanal: cambiar semana
        if (deltaX > 0) {
          navigateDate(-1); // Retroceder semana
        } else {
          navigateDate(1); // Avanzar semana
        }
      } else if (viewMode === "month") {
        // Vista mensual: cambiar mes
        if (deltaX > 0) {
          // Swipe hacia la derecha -> retroceder mes
          const newDate = new Date(currentDate);
          newDate.setMonth(newDate.getMonth() - 1);
          setCurrentDate(newDate);
        } else {
          // Swipe hacia la izquierda -> avanzar mes
          const newDate = new Date(currentDate);
          newDate.setMonth(newDate.getMonth() + 1);
          setCurrentDate(newDate);
        }
      }
    }

    // Reset
    touchStartX.current = null;
    touchStartY.current = null;
  }

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && showEntryModal) {
        setShowEntryModal(false);
        resetModal();
      }
    }

    if (showEntryModal) {
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [showEntryModal]);

  // Manejar click en el calendario para abrir modal
  function handleCalendarClick(e: React.MouseEvent) {
    // Ignorar si clickeamos en un entry
    if ((e.target as HTMLElement).closest('[data-entry]')) {
      return;
    }
    
    e.stopPropagation();
    
    const calendarElement = document.querySelector('[data-calendar-grid]') as HTMLElement;
    if (!calendarElement) return;
    
    const scrollContainer = calendarElement.querySelector('.overflow-y-auto') as HTMLElement;
    if (!scrollContainer) return;
    
    const containerRect = scrollContainer.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;
    
    // Calcular posición relativa AL VIEWPORT VISIBLE
    const scrollTop = scrollContainer.scrollTop;
    const absoluteY = y + scrollTop;
    
    // Calcular día y hora
    const dayWidth = containerRect.width / 8;
    const hourHeight = 64;
    
    const dayIndex = Math.floor(x / dayWidth) - 1;
    if (dayIndex < 0 || dayIndex >= 7) return;
    
    const days = getWeekDays(currentDate);
    const targetDay = days[dayIndex];
    
    const relativeHour = absoluteY / hourHeight;
    let targetHour = Math.floor(relativeHour);
    
    // Asegurar que esté en rango válido
    targetHour = Math.max(0, Math.min(23, targetHour));
    
    // Por defecto, usar la hora cerrada (00 minutos)
    // Si el usuario clickea en el bloque de las 16hs, la hora default es 16:00
    const finalHour = targetHour;
    const finalMinute = 0;
    
    // Crear una nueva fecha sin modificar la hora del día
    const clickedDate = new Date(targetDay);
    clickedDate.setHours(0, 0, 0, 0);
    
    // Abrir modal con la fecha y hora clickeada
    // Establecer los valores de forma síncrona para evitar conflictos
    setModalStartDate(clickedDate);
    setModalStartHour(finalHour);
    setModalStartMinute(finalMinute);
    setModalEndDate(null);
    setModalEndHour(null);
    setModalEndMinute(null);
    setSelectedHospitalId("");
    setSelectedActId("");
    setNotes("");
    setError(null);
    setShowEntryModal(true);
  }

  function resetModal() {
    setShowEntryModal(false);
    setEditingEntry(null);
    setModalStartDate(null);
    setModalEndDate(null);
    setModalEndHour(null);
    setModalEndMinute(null);
    setSelectedHospitalId("");
    setSelectedActId("");
    setNotes("");
    setPatientsCount("");
    setSelectedRole(null);
    setError(null);
    setShowAddActForm(false);
    setNewActName("");
    setNewActUnitType("hours");
    setNewActUnitValue("");
  }

  async function openEditModal(entry: CalendarEntry) {
    // Extraer fecha y hora de start_at
    const startTime = extractTimeFromTimestamp(entry.start_at);
    const startDate = parseNaiveTimestamp(entry.start_at);
    
    // Extraer fecha y hora de end_at
    const endTime = extractTimeFromTimestamp(entry.end_at);
    const endDate = parseNaiveTimestamp(entry.end_at);
    
    // Establecer valores del modal
    setModalStartDate(startDate);
    setModalStartHour(startTime.hours);
    setModalStartMinute(startTime.minutes);
    setModalEndDate(endDate);
    setModalEndHour(endTime.hours);
    setModalEndMinute(endTime.minutes);
    
    // Establecer hospital y acto
    setSelectedHospitalId(entry.user_hospital_id);
    await loadActs(entry.user_hospital_id);
    setSelectedActId(entry.act_id);
    
    // Establecer notas
    setNotes(entry.notes || "");
    
    // Establecer patients_count si existe
    setPatientsCount(entry.patients_count?.toString() || "");
    
    // Establecer role si existe
    setSelectedRole(entry.role || null);
    
    // Marcar que estamos editando
    setEditingEntry(entry);
    setShowEntryModal(true);
  }

  async function handleSaveEntry() {
    if (!selectedHospitalId || !selectedActId) {
      setError("Seleccioná un hospital y un acto médico");
      return;
    }

    // Validar rol si el acto soporta roles
    const selectedAct = acts.find(a => a.id === selectedActId);
    // Verificar supports_roles
    const supportsRoles = selectedAct?.supports_roles === true;
    
    // Debug: mostrar en consola
    if (selectedAct) {
      console.log("handleSaveEntry - Selected act:", selectedAct.name, "supports_roles:", selectedAct.supports_roles, "type:", typeof selectedAct.supports_roles, "supportsRoles result:", supportsRoles);
    }
    
    if (supportsRoles && !selectedRole) {
      setError("Seleccioná un rol (Principal o Ayudante)");
      return;
    }

    if (!modalStartDate) {
      setError("Seleccioná la fecha de inicio");
      return;
    }

    if (!modalEndDate || modalEndHour === null || modalEndMinute === null) {
      setError("Seleccioná la fecha y hora de fin");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Crear fecha de inicio
    const startDate = new Date(modalStartDate);
    startDate.setHours(modalStartHour, modalStartMinute, 0, 0);

    // Crear fecha de fin
    const endDate = new Date(modalEndDate);
    endDate.setHours(modalEndHour, modalEndMinute, 0, 0);

    // Validar que end_at sea posterior a start_at
    if (endDate <= startDate) {
      setError("La hora de fin debe ser posterior a la hora de inicio");
      return;
    }

    const start_at = formatTimestamp(startDate);
    const end_at = formatTimestamp(endDate);
    const date = formatDate(startDate);
    const quantity = calculateHours(start_at, end_at);

    // Determinar patients_count: solo si el acto requiere pacientes y hay valor
    // selectedAct y supportsRoles ya están declarados arriba
    let finalPatientsCount: number | null = null;
    if (selectedAct?.requires_patients === true && patientsCount.trim() !== "") {
      const count = parseInt(patientsCount);
      if (!isNaN(count) && count >= 0) {
        finalPatientsCount = count;
      }
    }

    // Determinar role, total_amount y calculation_detail si el acto soporta roles
    let finalRole: "principal" | "assistant" | null = null;
    let totalAmount: number | null = null;
    let calculationDetail: any | null = null;
    
    if (supportsRoles && selectedRole && selectedAct) {
      finalRole = selectedRole;
      const unitValue = selectedRole === "principal" 
        ? selectedAct.unit_value_principal 
        : selectedAct.unit_value_assistant;
      if (unitValue !== null && unitValue !== undefined) {
        totalAmount = quantity * unitValue;
        calculationDetail = {
          role: selectedRole,
          rate: unitValue,
          quantity: quantity,
          total: totalAmount
        };
      } else {
        setError(`Falta definir el valor para el rol ${selectedRole === "principal" ? "principal" : "ayudante"}`);
        return;
      }
    }

    let error;
    if (editingEntry) {
      // Actualizar entrada existente
      const { error: updateError } = await supabase
        .from("entries")
        .update({
          user_hospital_id: selectedHospitalId,
          act_id: selectedActId,
          date: date,
          start_at: start_at,
          end_at: end_at,
          quantity: quantity,
          notes: notes.trim() || null,
          patients_count: finalPatientsCount,
          role: finalRole,
          total_amount: totalAmount,
          calculation_detail: calculationDetail,
        })
        .eq("id", editingEntry.id)
        .eq("user_id", user.id);
      error = updateError;
    } else {
      // Crear nueva entrada
      const { error: insertError } = await supabase.from("entries").insert({
        user_id: user.id,
        user_hospital_id: selectedHospitalId,
        act_id: selectedActId,
        date: date,
        start_at: start_at,
        end_at: end_at,
        quantity: quantity,
        notes: notes.trim() || null,
        patients_count: finalPatientsCount,
        role: finalRole,
        total_amount: totalAmount,
        calculation_detail: calculationDetail,
      });
      error = insertError;
    }

    if (error) {
      console.error("Error al guardar:", error);
      setError("Error al guardar: " + error.message);
      return;
    }

    await loadEntries();
    resetModal();
  }

  // Detectar si cruza medianoche cuando se establece la fecha/hora de fin
  const crossesMidnight = modalEndDate && modalStartDate ? !isSameDay(modalStartDate, modalEndDate) : false;


  function renderEntriesInSlot(day: Date, hour: number, entries: CalendarEntry[]) {
    const dateStr = formatDate(day);

    // Solo mostrar entries que EMPIEZAN en este slot de hora específico
    const slotEntries = entries.filter((entry) => {
      // Extraer directamente del timestamp sin conversión de zona horaria
      const entryStartTime = extractTimeFromTimestamp(entry.start_at);
      const entryEndTime = extractTimeFromTimestamp(entry.end_at);
      const entryStartDate = extractDateFromTimestamp(entry.start_at);
      const entryEndDate = extractDateFromTimestamp(entry.end_at);
      
      const dayStr = formatDate(day);
      
      // Solo mostrar si el entry EMPIEZA en este slot de hora
      if (entryStartDate === dayStr) {
        // Entry empieza en este día
        return entryStartTime.hours === hour;
      } else if (entryEndDate === dayStr && entryStartDate !== dayStr) {
        // Entry empezó el día anterior y termina en este día
        // Mostrar solo si empieza en este día (00:00)
        return hour === 0 && entryStartDate !== dayStr;
      }
      
      return false;
    });

    return (
      <>
        {slotEntries.map((entry) => {
          // Extraer directamente del timestamp sin conversión de zona horaria
          const entryStartTime = extractTimeFromTimestamp(entry.start_at);
          const entryEndTime = extractTimeFromTimestamp(entry.end_at);
          const entryStartDate = extractDateFromTimestamp(entry.start_at);
          const entryEndDate = extractDateFromTimestamp(entry.end_at);
          
          const dayStr = formatDate(day);
          const crossesMidnight = entryStartDate !== entryEndDate;
          const isNextDay = entryEndDate === dayStr && entryStartDate !== dayStr;
          const isStartDay = entryStartDate === dayStr;

          // Calcular posición y altura dentro del slot
          // El bloque debe extenderse desde donde empieza hasta donde termina
          let topPercent = 0;
          let heightInHours = 0; // Duración total en horas

          if (isNextDay) {
            // Entry empezó el día anterior y termina en este día (00:00)
            // El bloque empieza desde el inicio del slot (00:00)
            topPercent = 0;
            // Altura hasta la hora de fin
            heightInHours = entryEndTime.hours + (entryEndTime.minutes / 60);
          } else if (isStartDay && !crossesMidnight) {
            // Entry completo en el mismo día
            topPercent = (entryStartTime.minutes / 60) * 100;
            // Calcular duración total en horas
            const startMinutes = entryStartTime.hours * 60 + entryStartTime.minutes;
            const endMinutes = entryEndTime.hours * 60 + entryEndTime.minutes;
            heightInHours = (endMinutes - startMinutes) / 60;
          } else if (isStartDay && crossesMidnight) {
            // Entry empieza en este día y cruza medianoche
            topPercent = (entryStartTime.minutes / 60) * 100;
            // Calcular horas hasta el final del día
            const startMinutes = entryStartTime.hours * 60 + entryStartTime.minutes;
            const endOfDayMinutes = 24 * 60;
            heightInHours = (endOfDayMinutes - startMinutes) / 60;
          }

          // Convertir altura en horas a porcentaje del slot actual
          // Pero el bloque se extiende más allá del slot actual
          const heightPercent = Math.min(100, (heightInHours / 1) * 100); // 1 = 1 hora por slot

          // Formatear hora para mostrar
          const startTimeStr = `${String(entryStartTime.hours).padStart(2, "0")}:${String(entryStartTime.minutes).padStart(2, "0")}`;
          const endTimeStr = `${String(entryEndTime.hours).padStart(2, "0")}:${String(entryEndTime.minutes).padStart(2, "0")}`;
          
          // Obtener nombre del hospital
          // La estructura de Supabase es: entry.hospital.hospital.name
          let hospitalName = "Hospital desconocido";
          if (entry.hospital?.hospital) {
            if (Array.isArray(entry.hospital.hospital)) {
              hospitalName = entry.hospital.hospital[0]?.name || "Hospital desconocido";
            } else if (entry.hospital.hospital.name) {
              hospitalName = entry.hospital.hospital.name;
            }
          }
          const actName = entry.act?.name || "Sin nombre";

          return (
            <div
              key={entry.id}
              data-entry="true"
              className={`absolute left-0 right-0 bg-blue-500 text-white text-xs p-1 sm:p-1.5 rounded z-10 cursor-pointer hover:bg-blue-600 pointer-events-auto ${
                crossesMidnight && isNextDay
                  ? "border-t-2 border-dashed border-blue-300"
                  : ""
              }`}
              style={{
                top: `${Math.max(0, topPercent)}%`,
                // Calcular altura: usar porcentaje si es menos de 1 hora, o altura fija si es más
                // La altura se ajustará automáticamente por el contenedor (h-12 en mobile, h-16 en desktop)
                height: heightInHours > 1 
                  ? `${heightInHours * 3}rem` // Aproximadamente: 3rem = 48px, se ajusta con el contenedor
                  : `${Math.min(100, Math.max(5, heightPercent))}%`,
                zIndex: 10,
              }}
              title={`${hospitalName} - ${actName} - Desde ${startTimeStr} hasta ${endTimeStr} (${entry.quantity.toFixed(1)}h)`}
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(entry);
              }}
            >
              {crossesMidnight && isStartDay ? (
                // Evento que cruza medianoche, día de inicio - mostrar info completa
                <>
                  <div className="font-semibold truncate text-[10px]">
                    {hospitalName}
                  </div>
                  <div className="font-medium truncate text-[10px] mt-0.5">
                    {actName}
                  </div>
                  <div className="text-[9px] opacity-90 mt-0.5">
                    {startTimeStr} - {endTimeStr}
                  </div>
                </>
              ) : crossesMidnight && isNextDay ? (
                // Evento que cruza medianoche, día siguiente - mostrar indicador
                <>
                  <div className="font-semibold truncate text-[10px]">
                    {hospitalName}
                  </div>
                  <div className="font-medium truncate text-[10px] mt-0.5">
                    {actName}
                  </div>
                  <div className="text-[9px] opacity-75 mt-0.5 italic">
                    (continúa)
                  </div>
                </>
              ) : (
                // Evento normal (no cruza medianoche) - mostrar Hospital, Acto y Horas
                <>
                  <div className="font-semibold truncate text-[10px]">
                    {hospitalName}
                  </div>
                  <div className="font-medium truncate text-[10px] mt-0.5">
                    {actName}
                  </div>
                  <div className="text-[9px] opacity-90 mt-0.5">
                    {startTimeStr} - {endTimeStr}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </>
    );
  }

  function WeekView() {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const days = getWeekDays(currentDate);

    return (
      <div 
        className="flex flex-col h-[calc(100vh-160px)] sm:h-[calc(100vh-250px)] bg-white border-0 sm:border border-gray-200 rounded-none sm:rounded-lg overflow-hidden" 
        data-calendar-grid
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="grid grid-cols-8 border-b border-gray-300 bg-gray-50">
          <div className="p-2 sm:p-3 border-r border-gray-300"></div>
          {days.map((day, idx) => (
            <div
              key={idx}
              className={`p-2 sm:p-3 text-center border-r border-gray-300 ${
                isToday(day) ? "bg-blue-50" : ""
              }`}
            >
              <div className="text-[10px] sm:text-xs text-gray-600 uppercase">
                {getDayName(day)}
              </div>
              <div
                className={`text-sm sm:text-lg font-semibold ${
                  isToday(day) ? "text-blue-600" : "text-gray-900"
                }`}
              >
                {day.getDate()}
              </div>
            </div>
          ))}
        </div>

        <div 
          className="flex-1 overflow-y-auto"
          onClick={handleCalendarClick}
        >
          <div className="grid grid-cols-8">
            <div className="border-r border-gray-300">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="h-12 sm:h-16 border-b border-gray-200 flex items-start justify-end pr-1 sm:pr-2 text-[10px] sm:text-xs text-gray-500"
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {days.map((day, dayIdx) => {
              const dayClosingEvents = closingEvents.filter(
                (ce) => formatDate(ce.date) === formatDate(day)
              );
              
              return (
                <div key={dayIdx} className="border-r border-gray-200 relative">
                  {hours.map((hour, hourIdx) => (
                    <div
                      key={hourIdx}
                      className="h-12 sm:h-16 border-b border-gray-100 relative group cursor-pointer hover:bg-gray-50"
                    >
                      {renderEntriesInSlot(day, hour, entries)}
                      {/* Mostrar eventos de cierre en la hora 0 */}
                      {hour === 0 && dayClosingEvents.length > 0 && (
                        <div className="absolute top-0 left-0 right-0 z-20">
                          {dayClosingEvents.map((ce) => (
                            <div
                              key={ce.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClosingEventClick(ce);
                              }}
                              className="bg-red-500 text-white text-[9px] sm:text-[10px] p-0.5 sm:p-1 rounded mb-0.5 cursor-pointer hover:bg-red-600 font-semibold"
                            >
                              🔒 Cierre: {ce.hospitalName}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function MonthView() {
    const days = getMonthDays(currentDate);
    const firstDay = days.length > 0 ? days[0] : new Date();
    const firstDayOfWeek = firstDay.getDay(); // 0 = Domingo, 1 = Lunes, etc.

    return (
      <div 
        className="grid grid-cols-7 gap-0.5 sm:gap-1 bg-white border-0 sm:border border-gray-200 rounded-none sm:rounded-lg p-1 sm:p-2"
        data-calendar-grid
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day) => (
          <div
            key={day}
            className="p-1 sm:p-2 text-center text-xs sm:text-sm font-semibold text-gray-600"
          >
            {day}
          </div>
        ))}

        {/* Celdas vacías antes del primer día del mes para alinear correctamente */}
        {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
          <div key={`empty-${idx}`} className="min-h-16 sm:min-h-24"></div>
        ))}

        {days.map((day, idx) => {
          const dayEntries = entries.filter(
            (e) => e.date === formatDate(day)
          );
          const dayClosingEvents = closingEvents.filter(
            (ce) => formatDate(ce.date) === formatDate(day)
          );
          const totalHours = dayEntries.reduce((sum, e) => {
            if (e.start_at && e.end_at) {
              return sum + calculateHours(e.start_at, e.end_at);
            }
            return sum + e.quantity;
          }, 0);

          return (
            <div
              key={idx}
              className={`min-h-16 sm:min-h-24 p-1 sm:p-2 border border-gray-200 rounded cursor-pointer hover:bg-gray-50 ${
                isToday(day) ? "bg-blue-50 border-blue-300" : ""
              }`}
              onClick={() => {
                setViewMode("week");
                setCurrentDate(day);
              }}
            >
              <div
                className={`text-xs sm:text-sm font-semibold mb-0.5 sm:mb-1 ${
                  isToday(day) ? "text-blue-600" : "text-gray-900"
                }`}
              >
                {day.getDate()}
              </div>
              {totalHours > 0 && (
                <div className="text-[10px] sm:text-xs text-gray-600">
                  {totalHours.toFixed(1)}h
                </div>
              )}
              {dayClosingEvents.map((ce) => (
                <div
                  key={ce.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClosingEventClick(ce);
                  }}
                  className="text-[9px] sm:text-xs text-red-600 font-semibold bg-red-100 px-0.5 sm:px-1 py-0.5 rounded mb-0.5 sm:mb-1 cursor-pointer hover:bg-red-200 truncate"
                >
                  🔒 {ce.hospitalName}
                </div>
              ))}
              {dayEntries.slice(0, 2).map((entry) => (
                <div
                  key={entry.id}
                  className="text-[9px] sm:text-xs p-0.5 sm:p-1 bg-blue-100 rounded mb-0.5 sm:mb-1 truncate"
                >
                  {entry.act?.name || "Sin nombre"}
                </div>
              ))}
              {dayEntries.length > 2 && (
                <div className="text-[9px] sm:text-xs text-gray-500">
                  +{dayEntries.length - 2} más
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function getMonthDays(date: Date): Date[] {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Solo devolver los días del mes actual, sin rellenar con días de otros meses
    const days: Date[] = [];
    const current = new Date(firstDay);
    while (current <= lastDay) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <main className="min-h-screen px-0 sm:px-6 pb-20 sm:pb-24 relative z-10">
      <div className="w-full">
        {/* Header con navegación - más compacto en mobile */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b-0 sm:border-b border-gray-200 px-3 sm:px-6 py-2 sm:py-3 mb-2 sm:mb-4">
          <div className="flex items-center justify-between">
            {/* En mobile: mostrar mes/año donde estaba el título. En desktop: mostrar título */}
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 sm:hidden">
              {formatMonthYear(currentDate)}
            </h1>
            <h1 className="hidden sm:block text-xl sm:text-2xl font-semibold text-gray-900">
              Calendario
            </h1>
            
            <div className="flex items-center gap-1 sm:gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("week")}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  viewMode === "week"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Semana
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  viewMode === "month"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Mes
              </button>
            </div>
          </div>

          {/* En desktop: mostrar controles de navegación y mes/año */}
          <div className="hidden sm:flex items-center justify-between mt-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={() => navigateDate(-1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ←
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs sm:text-sm font-medium transition-colors"
              >
                Hoy
              </button>
              <button
                onClick={() => navigateDate(1)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                →
              </button>

              <h2 className="text-base sm:text-xl font-semibold text-gray-900 ml-1 sm:ml-4">
                {formatMonthYear(currentDate)}
              </h2>
            </div>
          </div>
        </div>

        {/* Vista del calendario */}
        {viewMode === "week" ? <WeekView /> : <MonthView />}

        {/* Modal de registro */}
        {showEntryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-0 sm:p-4" onClick={resetModal}>
            <div 
              className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-3 sm:px-6 py-2 sm:py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <h3 className="text-base sm:text-xl font-medium text-gray-900">
                  {editingEntry ? "Editar período" : "Registrar período"}
                </h3>
                <button
                  onClick={resetModal}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-6">
                {/* Fecha y horas en una fila - ajustado para mobile */}
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                  {/* Icono de reloj */}
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    strokeWidth={1.5} 
                    stroke="currentColor" 
                    className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 flex-shrink-0"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>

                  {/* Fecha - recuadro con fondo gris */}
                  <div className="relative rounded bg-gray-100 flex-1 min-w-0">
                    <input
                      type="date"
                      value={modalStartDate ? formatDate(modalStartDate) : ""}
                      onChange={(e) => {
                        const newDate = new Date(e.target.value + "T00:00:00");
                        setModalStartDate(newDate);
                        if (modalEndDate && newDate > modalEndDate) {
                          setModalEndDate(null);
                          setModalEndHour(null);
                          setModalEndMinute(null);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      style={{ colorScheme: 'light' }}
                    />
                    <div className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-700 font-medium pointer-events-none text-center truncate">
                      {modalStartDate ? (() => {
                        const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
                        const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
                        const day = dayNames[modalStartDate.getDay()];
                        const date = modalStartDate.getDate();
                        const month = monthNames[modalStartDate.getMonth()];
                        return (
                          <>
                            <span className="hidden sm:inline">{day}, {date} de {month}</span>
                            <span className="sm:hidden">{day} {date}/{month}</span>
                          </>
                        );
                      })() : <span className="text-gray-400">Fecha</span>}
                    </div>
                  </div>

                  {/* Separador */}
                  <span className="text-gray-400 mx-0.5 sm:mx-1 text-xs">-</span>

                  {/* Hora inicio - recuadro con fondo gris */}
                  <div className="relative rounded bg-gray-100 min-w-[70px] sm:min-w-[90px]">
                    <select
                      value={`${String(modalStartHour).padStart(2, "0")}:${String(modalStartMinute).padStart(2, "0")}`}
                      onChange={(e) => {
                        if (e.target.value && e.target.value !== "") {
                          const [hour, minute] = e.target.value.split(":").map(Number);
                          if (!isNaN(hour) && !isNaN(minute)) {
                            setModalStartHour(hour);
                            setModalStartMinute(minute);
                            if (modalEndHour !== null && modalEndMinute !== null) {
                              if (hour > modalEndHour || (hour === modalEndHour && minute >= modalEndMinute)) {
                                setModalEndHour(null);
                                setModalEndMinute(null);
                                setModalEndDate(null);
                              }
                            }
                          }
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    >
                      {Array.from({ length: 24 }, (_, hourIndex) => 
                        [0, 15, 30, 45].map((minute) => {
                          const hour = hourIndex;
                          const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
                          const period = hour >= 12 ? "pm" : "am";
                          const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                          const displayTime = `${displayHour}:${String(minute).padStart(2, "0")}${period}`;
                          const uniqueKey = `start-${hour}-${minute}`;
                          return (
                            <option key={uniqueKey} value={timeStr}>
                              {displayTime}
                            </option>
                          );
                        })
                      ).flat()}
                    </select>
                    <div className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-700 font-medium pointer-events-none text-center whitespace-nowrap">
                      {(() => {
                        const period = modalStartHour >= 12 ? "pm" : "am";
                        const displayHour = modalStartHour === 0 ? 12 : modalStartHour > 12 ? modalStartHour - 12 : modalStartHour;
                        const displayMinute = String(modalStartMinute).padStart(2, "0");
                        return `${displayHour}:${displayMinute}${period}`;
                      })()}
                    </div>
                  </div>

                  {/* Separador */}
                  <span className="text-gray-400 mx-0.5 sm:mx-1 text-xs">-</span>

                  {/* Hora fin - recuadro con fondo gris */}
                  <div className="relative rounded bg-gray-100 min-w-[70px] sm:min-w-[110px]">
                    <select
                      value={(modalEndHour !== null && modalEndHour !== undefined && modalEndMinute !== null && modalEndMinute !== undefined)
                        ? `${String(modalEndHour).padStart(2, "0")}:${String(modalEndMinute).padStart(2, "0")}` 
                        : ""}
                      onChange={(e) => {
                        if (e.target.value && e.target.value !== "" && modalStartDate) {
                          const [hour, minute] = e.target.value.split(":").map(Number);
                          const startMinutes = modalStartHour * 60 + modalStartMinute;
                          const endMinutes = hour * 60 + minute;
                          let minutesDiff = endMinutes - startMinutes;
                          if (minutesDiff <= 0) {
                            minutesDiff += 24 * 60;
                          }
                          const daysAfter = Math.floor(minutesDiff / (24 * 60));
                          const endDate = new Date(modalStartDate);
                          if (daysAfter > 0) {
                            endDate.setDate(endDate.getDate() + daysAfter);
                            setModalEndDate(endDate);
                          } else {
                            setModalEndDate(new Date(modalStartDate));
                          }
                          setModalEndHour(hour);
                          setModalEndMinute(minute);
                        } else {
                          setModalEndHour(null);
                          setModalEndMinute(null);
                          setModalEndDate(null);
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    >
                      <option value="">Seleccionar...</option>
                      {(() => {
                        if (!modalStartDate) return null;
                        const startMinutes = modalStartHour * 60 + modalStartMinute;
                        const options: ReactElement[] = [];
                        const maxMinutes = 1425;
                        const startDate = new Date(modalStartDate);
                        for (let minutesAfter = 15; minutesAfter <= maxMinutes; minutesAfter += 15) {
                          const totalMinutes = startMinutes + minutesAfter;
                          let endHour = Math.floor(totalMinutes / 60) % 24;
                          let endMinute = totalMinutes % 60;
                          const daysAfter = Math.floor(totalMinutes / (24 * 60));
                          const endDate = new Date(startDate);
                          if (daysAfter > 0) {
                            endDate.setDate(endDate.getDate() + daysAfter);
                          }
                          const timeStr = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
                          const period = endHour >= 12 ? "pm" : "am";
                          const displayHour = endHour === 0 ? 12 : endHour > 12 ? endHour - 12 : endHour;
                          const displayTime = `${displayHour}:${String(endMinute).padStart(2, "0")}${period}`;
                          let durationText = "";
                          if (minutesAfter < 60) {
                            durationText = `${minutesAfter} min`;
                          } else {
                            const hours = Math.floor(minutesAfter / 60);
                            const remainingMinutes = minutesAfter % 60;
                            if (remainingMinutes === 0) {
                              durationText = `${hours} h`;
                            } else {
                              const decimalHours = (minutesAfter / 60).toFixed(1);
                              durationText = `${decimalHours} h`;
                            }
                          }
                          const uniqueKey = `end-${minutesAfter}`;
                          options.push(
                            <option key={uniqueKey} value={timeStr}>
                              {displayTime} ({durationText})
                            </option>
                          );
                        }
                        return options;
                      })()}
                    </select>
                    <div className="px-3 py-1.5 text-sm text-gray-700 font-medium pointer-events-none text-center whitespace-nowrap">
                      {modalEndHour !== null && modalEndMinute !== null ? (() => {
                        const period = modalEndHour >= 12 ? "pm" : "am";
                        const displayHour = modalEndHour === 0 ? 12 : modalEndHour > 12 ? modalEndHour - 12 : modalEndHour;
                        const displayMinute = String(modalEndMinute).padStart(2, "0");
                        return `${displayHour}:${displayMinute}${period}`;
                      })() : "Seleccionar..."}
                    </div>
                  </div>
                </div>

                {/* Indicador de día siguiente si cruza medianoche */}
                {crossesMidnight && modalEndDate && (
                  <div className="text-[10px] sm:text-xs text-blue-600 font-medium">
                    Finaliza: {(() => {
                      const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
                      const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
                      const day = dayNames[modalEndDate.getDay()];
                      const date = modalEndDate.getDate();
                      const month = monthNames[modalEndDate.getMonth()];
                      return `${day} ${date}/${month}`;
                    })()}
                  </div>
                )}

                {/* Duración resumen */}
                {modalEndDate && modalEndHour !== null && modalEndMinute !== null && (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3 sm:w-4 sm:h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      Duración: <span className="font-medium text-gray-900">
                        {(() => {
                          if (!modalStartDate || modalEndHour === null || modalEndMinute === null || !modalEndDate) return "0.00h";
                          const start = new Date(modalStartDate);
                          start.setHours(modalStartHour, modalStartMinute, 0, 0);
                          const end = new Date(modalEndDate);
                          end.setHours(modalEndHour, modalEndMinute, 0, 0);
                          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                          return `${hours.toFixed(2)}h`;
                        })()}
                      </span>
                    </span>
                  </div>
                )}

                {/* Hospitales como chips */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 sm:mb-2">
                    Hospital
                  </label>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {hospitals.map((h) => {
                      const hospital = h.hospital?.[0];
                      const isSelected = selectedHospitalId === h.id;
                      return (
                        <button
                          key={h.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedHospitalId("");
                              setSelectedActId("");
                            } else {
                              setSelectedHospitalId(h.id);
                              loadActs(h.id);
                              setSelectedActId("");
                            }
                          }}
                          className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                            isSelected
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
                          }`}
                        >
                          {hospital?.name || "Hospital no encontrado"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Actos como chips - solo si hay hospital seleccionado */}
                {selectedHospitalId && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 sm:mb-2">
                      Acto médico
                    </label>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {acts.map((a) => {
                        const isSelected = selectedActId === a.id;
                        return (
                          <button
                            key={a.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedActId("");
                                setPatientsCount("");
                                setSelectedRole(null);
                              } else {
                                setSelectedActId(a.id);
                                // Si no requiere pacientes, limpiar patientsCount
                                if (!a.requires_patients) {
                                  setPatientsCount("");
                                }
                                // Verificar supports_roles
                                const supportsRoles = a.supports_roles === true;
                                if (!supportsRoles) {
                                  setSelectedRole(null);
                                } else {
                                  // Si soporta roles, establecer default a "principal"
                                  setSelectedRole("principal");
                                  console.log("Acto seleccionado con supports_roles=true, estableciendo rol a 'principal'");
                                }
                              }
                            }}
                            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
                              isSelected
                                ? "bg-blue-600 text-white shadow-sm"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
                            }`}
                          >
                            {a.name} <span className="text-[10px] sm:text-xs opacity-75">({a.unit_type === "hours" ? "h" : "u"})</span>
                          </button>
                        );
                      })}
                      {/* Botón para agregar acto */}
                      {!showAddActForm && (
                        <button
                          onClick={() => {
                            setShowAddActForm(true);
                            setNewActName("");
                            setNewActUnitType("hours");
                            setNewActUnitValue("");
                          }}
                          className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 border-dashed"
                        >
                          + Agregar
                        </button>
                      )}
                    </div>
                    
                    {/* Formulario para agregar acto - diseño minimalista */}
                    {showAddActForm && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {/* Nombre del acto - recuadro con fondo gris */}
                        <div className="relative rounded bg-gray-100 flex-1 min-w-[150px]">
                          <input
                            type="text"
                            value={newActName}
                            onChange={(e) => setNewActName(e.target.value)}
                            placeholder="Nombre del acto"
                            className="w-full px-3 py-1.5 text-sm text-gray-700 font-medium bg-transparent outline-none placeholder:text-gray-400"
                            disabled={savingAct}
                          />
                        </div>

                        {/* Tipo de unidad - recuadro con fondo gris */}
                        <div className="relative rounded bg-gray-100">
                          <select
                            value={newActUnitType}
                            onChange={(e) => setNewActUnitType(e.target.value as "hours" | "units")}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            disabled={savingAct}
                          >
                            <option value="hours">Horas</option>
                            <option value="units">Unidades</option>
                          </select>
                          <div className="px-3 py-1.5 text-sm text-gray-700 font-medium pointer-events-none min-w-[100px] text-center">
                            {newActUnitType === "hours" ? "Horas" : "Unidades"}
                          </div>
                        </div>

                        {/* Valor por unidad - recuadro con fondo gris (opcional) */}
                        <div className="relative rounded bg-gray-100">
                          <input
                            type="number"
                            value={newActUnitValue}
                            onChange={(e) => setNewActUnitValue(e.target.value)}
                            placeholder="Valor (opc.)"
                            step="0.01"
                            min="0"
                            className="w-full px-3 py-1.5 text-sm text-gray-700 font-medium bg-transparent outline-none placeholder:text-gray-400 min-w-[100px] text-center"
                            disabled={savingAct}
                          />
                        </div>

                        {/* Botones de acción */}
                        <button
                          onClick={async () => {
                            if (!newActName.trim()) {
                              setError("Ingresá el nombre del acto");
                              return;
                            }
                            
                            // Validar valor si se ingresó
                            if (newActUnitValue && (isNaN(parseFloat(newActUnitValue)) || parseFloat(newActUnitValue) <= 0)) {
                              setError("El valor debe ser un número mayor a 0");
                              return;
                            }
                            
                            setSavingAct(true);
                            setError(null);
                            
                            const {
                              data: { user },
                            } = await supabase.auth.getUser();
                            if (!user) {
                              setError("No estás autenticado");
                              setSavingAct(false);
                              return;
                            }
                            
                            try {
                              const { error: insertError } = await supabase
                                .from("medical_acts")
                                .insert({
                                  user_id: user.id,
                                  user_hospital_id: selectedHospitalId,
                                  name: newActName.trim(),
                                  unit_type: newActUnitType,
                                  unit_value: newActUnitValue.trim() ? parseFloat(newActUnitValue) : null,
                                  is_active: true,
                                  sort_order: 0,
                                });
                              
                              if (insertError) {
                                if (insertError.code === "23505") {
                                  setError("Ese acto ya existe para este hospital");
                                } else {
                                  setError("Error al guardar: " + insertError.message);
                                }
                                setSavingAct(false);
                                return;
                              }
                              
                              // Recargar actos
                              await loadActs(selectedHospitalId);
                              
                              // Cerrar formulario
                              setShowAddActForm(false);
                              setNewActName("");
                              setNewActUnitType("hours");
                              setNewActUnitValue("");
                            } catch (err: any) {
                              setError("Error inesperado: " + err.message);
                            } finally {
                              setSavingAct(false);
                            }
                          }}
                          disabled={savingAct || !newActName.trim()}
                          className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {savingAct ? "..." : "✓"}
                        </button>
                        <button
                          onClick={() => {
                            setShowAddActForm(false);
                            setNewActName("");
                            setNewActUnitType("hours");
                            setNewActUnitValue("");
                            setError(null);
                          }}
                          disabled={savingAct}
                          className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-60"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Rol - solo si el acto soporta roles */}
                {selectedActId && (() => {
                  const selectedAct = acts.find(a => a.id === selectedActId);
                  // Verificar si supports_roles es true
                  const supportsRoles = selectedAct?.supports_roles === true;
                  // Debug temporal
                  if (selectedAct) {
                    console.log("Modal UI - Selected act:", selectedAct.name, "supports_roles:", selectedAct.supports_roles, "type:", typeof selectedAct.supports_roles, "supportsRoles result:", supportsRoles);
                  }
                  if (supportsRoles) {
                    return (
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <label className="text-xs font-medium text-gray-500 whitespace-nowrap">
                          Rol:
                        </label>
                        <div className="relative rounded bg-gray-100 flex-1 max-w-[120px] sm:max-w-none">
                          <select
                            value={selectedRole || "principal"}
                            onChange={(e) => setSelectedRole(e.target.value as "principal" | "assistant" | null)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            style={{ colorScheme: "light" }}
                          >
                            <option value="principal">Principal</option>
                            <option value="assistant">Ayudante</option>
                          </select>
                          <div className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-700 font-medium pointer-events-none text-center">
                            {selectedRole === "principal" ? "Principal" : selectedRole === "assistant" ? "Ayudante" : "Principal"}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Pacientes atendidos - solo si el acto requiere pacientes */}
                {selectedActId && (() => {
                  const selectedAct = acts.find(a => a.id === selectedActId);
                  if (selectedAct?.requires_patients === true) {
                    return (
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <label className="text-xs font-medium text-gray-500 whitespace-nowrap">
                          Pacientes:
                        </label>
                        <div className="relative rounded bg-gray-100 flex-1 max-w-[100px] sm:max-w-[150px]">
                          <input
                            type="number"
                            value={patientsCount}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "" || (parseInt(value) >= 0)) {
                                setPatientsCount(value);
                              }
                            }}
                            placeholder="0"
                            min="0"
                            className="w-full px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-gray-700 font-medium bg-transparent outline-none placeholder:text-gray-400 text-center"
                          />
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Notas */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    Notas (opcional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Agregar descripción..."
                    className="w-full rounded-lg border border-gray-300 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm outline-none text-gray-900 resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-400"
                  />
                </div>

                {error && (
                  <div className="p-2 sm:p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm">
                    {error}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-3 sm:px-6 py-2 sm:py-4 border-t border-gray-200 flex items-center justify-end gap-2 sm:gap-3 flex-shrink-0">
                <button
                  onClick={resetModal}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEntry}
                  disabled={(() => {
                    if (!selectedHospitalId || !selectedActId || !modalEndDate || modalEndHour === null || modalEndMinute === null) {
                      return true;
                    }
                    // Validar rol si el acto soporta roles
                    const selectedAct = acts.find(a => a.id === selectedActId);
                    const supportsRoles = selectedAct?.supports_roles === true;
                    if (supportsRoles && !selectedRole) {
                      return true;
                    }
                    return false;
                  })()}
                  className="px-4 sm:px-6 py-1.5 sm:py-2 text-xs sm:text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de cierre (factura) */}
        {showClosingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowClosingModal(null)}>
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Cierre de período
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {showClosingModal.hospitalName}
                  </p>
                </div>
                <button
                  onClick={() => setShowClosingModal(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Contenido */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {(() => {
                  const { startDate, endDate } = getClosingPeriod(showClosingModal);
                  const periodStart = formatDate(startDate);
                  const periodEnd = formatDate(endDate);
                  
                  return (
                    <div className="space-y-6">
                      {/* Período */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-600 mb-1">Período de facturación</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {new Date(periodStart).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })} - {new Date(periodEnd).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                      </div>

                      {/* Desglose */}
                      {loadingClosingData ? (
                        <div className="text-center py-8 text-gray-600">Cargando datos...</div>
                      ) : closingPeriodData.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          No hay registros para este período
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="text-lg font-semibold text-gray-900 mb-4">Desglose por grupos de envío</div>
                          
                          {closingPeriodData.map((groupData) => (
                            <div key={groupData.groupId || "null"} className="space-y-3">
                              {/* Header del grupo */}
                              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-base font-semibold text-blue-900">
                                    {groupData.groupName}
                                  </h4>
                                  <span className="text-sm font-medium text-blue-700">
                                    Total: ${groupData.totalValue.toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              {/* Tabla de actos del grupo */}
                              <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <table className="w-full">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Acto</th>
                                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Cantidad</th>
                                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Valor unitario</th>
                                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {groupData.acts.map((actTotal) => (
                                      <tr key={actTotal.actId} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-sm text-gray-900">
                                          {actTotal.actName}
                                          <span className="text-xs text-gray-500 ml-2">
                                            ({actTotal.unitType === "hours" ? "horas" : "unidades"})
                                          </span>
                                          {actTotal.totalPatients !== null && actTotal.totalPatients > 0 && (
                                            <div className="text-xs text-gray-600 mt-1">
                                              Pacientes: {actTotal.totalPatients}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-700 text-right">
                                          {actTotal.totalQuantity.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-700 text-right">
                                          {actTotal.entries[0]?.act?.unit_value !== null && actTotal.entries[0]?.act?.unit_value !== undefined
                                            ? `$${actTotal.entries[0].act.unit_value.toFixed(2)}`
                                            : "-"}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                                          ${actTotal.totalValue.toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot className="bg-gray-50 border-t border-gray-300">
                                    <tr>
                                      <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                                        Subtotal {groupData.groupName}:
                                      </td>
                                      <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">
                                        ${groupData.totalValue.toFixed(2)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          ))}

                          {/* Total general */}
                          <div className="bg-gray-100 border-2 border-gray-300 rounded-lg px-4 py-3">
                            <div className="flex items-center justify-between">
                              <span className="text-lg font-bold text-gray-900">Total general:</span>
                              <span className="text-xl font-bold text-gray-900">
                                ${closingPeriodData.reduce((sum, group) => sum + group.totalValue, 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end">
                <button
                  onClick={() => setShowClosingModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
