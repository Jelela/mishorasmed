"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { checkOnboardingStatus } from "@/lib/profileHelpers";
import { useToast } from "@/components/ToastProvider";
import { Loading } from "@/components/Loading";

type Hospital = {
  id: string;
  name: string;
  closing_day: number | null;
  to_email_default: string | null;
  notes: string | null;
};

interface UserHospital {
  id: string;
  catalog_hospital_id: string;
  hospital: Hospital[];
}

interface MedicalAct {
  id: string;
  user_id: string;
  user_hospital_id: string;
  name: string;
  unit_type: "hours" | "units";
  unit_value: number | null;
  requires_patients: boolean;
  supports_roles: boolean;
  unit_value_principal: number | null;
  unit_value_assistant: number | null;
  user_report_group_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

interface ReportGroup {
  id: string;
  user_id: string;
  user_hospital_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface HospitalWithActs extends UserHospital {
  acts: MedicalAct[];
  reportGroups?: ReportGroup[];
}

interface HospitalCatalog {
  id: string;
  name: string;
  closing_day: number | null;
  to_email_default: string | null;
  notes: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [hospitalsWithActs, setHospitalsWithActs] = useState<HospitalWithActs[]>([]);
  const [openFormFor, setOpenFormFor] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    hospitalId: string;
    hospitalName: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingUnitValue, setEditingUnitValue] = useState<{
    actId: string;
    value: string;
  } | null>(null);
  const [updatingUnitValue, setUpdatingUnitValue] = useState<string | null>(null);
  const [editingRoleValues, setEditingRoleValues] = useState<{
    actId: string;
    principal: string;
    assistant: string;
  } | null>(null);
  const [showAddHospitalModal, setShowAddHospitalModal] = useState(false);
  const [availableHospitals, setAvailableHospitals] = useState<HospitalCatalog[]>([]);
  const [hospitalSearchQuery, setHospitalSearchQuery] = useState<string>("");
  const [addingHospital, setAddingHospital] = useState<string | null>(null);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [showCustomHospitalForm, setShowCustomHospitalForm] = useState(false);
  const [customHospitalName, setCustomHospitalName] = useState<string>("");
  const [customHospitalClosingDay, setCustomHospitalClosingDay] = useState<string>("");
  const [customHospitalEmail, setCustomHospitalEmail] = useState<string>("");
  const [creatingCustomHospital, setCreatingCustomHospital] = useState(false);
  const [editingGroupFor, setEditingGroupFor] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [updatingActGroup, setUpdatingActGroup] = useState<string | null>(null);
  const [expandedHospitals, setExpandedHospitals] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<{ [hospitalId: string]: { groups: boolean; acts: boolean } }>({});
  const [editingAct, setEditingAct] = useState<MedicalAct | null>(null);
  const [updatingAct, setUpdatingAct] = useState(false);
  
  // Estados del formulario de edición
  const [editActName, setEditActName] = useState<string>("");
  const [editUnitType, setEditUnitType] = useState<"hours" | "units">("hours");
  const [editUnitValue, setEditUnitValue] = useState<string>("");
  const [editRequiresPatients, setEditRequiresPatients] = useState<boolean>(false);
  const [editSupportsRoles, setEditSupportsRoles] = useState<boolean>(false);
  const [editUnitValuePrincipal, setEditUnitValuePrincipal] = useState<string>("");
  const [editUnitValueAssistant, setEditUnitValueAssistant] = useState<string>("");
  const [editReportGroupId, setEditReportGroupId] = useState<string | null>(null);

  // Estados del formulario
  const [actType, setActType] = useState<string>("");
  const [customActName, setCustomActName] = useState<string>("");
  const [unitType, setUnitType] = useState<"hours" | "units">("hours");
  const [unitValue, setUnitValue] = useState<string>("");
  const [requiresPatients, setRequiresPatients] = useState<boolean>(false);
  const [supportsRoles, setSupportsRoles] = useState<boolean>(false);
  const [unitValuePrincipal, setUnitValuePrincipal] = useState<string>("");
  const [unitValueAssistant, setUnitValueAssistant] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      // Verificar onboarding
      const onboardingCompleted = await checkOnboardingStatus(data.user.id);
      if (!onboardingCompleted) {
        router.replace("/onboarding");
        return;
      }

      setEmail(data.user.email ?? "");

      // Cargar hospitales y actos
      await loadHospitalsAndActs(data.user.id);
      setLoading(false);
    })();
  }, [router]);

  async function loadAvailableHospitals() {
    setLoadingHospitals(true);
    const { data, error } = await supabase
      .from("hospital_catalog")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error al cargar hospitales:", error);
      toast.showToast("Error al cargar hospitales: " + error.message, "error");
      setLoadingHospitals(false);
      return;
    }

    setAvailableHospitals(data || []);
    setLoadingHospitals(false);
  }

  function openAddHospitalModal() {
    setShowAddHospitalModal(true);
    setHospitalSearchQuery("");
    loadAvailableHospitals();
  }

  function closeAddHospitalModal() {
    setShowAddHospitalModal(false);
    setHospitalSearchQuery("");
    setAvailableHospitals([]);
    setShowCustomHospitalForm(false);
    setCustomHospitalName("");
    setCustomHospitalClosingDay("");
    setCustomHospitalEmail("");
  }

  async function addHospitalFromModal(hospitalId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    setAddingHospital(hospitalId);

    try {
      const { error: insertError } = await supabase
        .from("user_hospitals")
        .insert({
          user_id: user.id,
          catalog_hospital_id: hospitalId,
        });

      if (insertError) {
        // Si es error de unique constraint, significa que ya existe
        if (insertError.code === "23505") {
          toast.showToast("Ya agregaste este hospital", "error");
        } else {
          toast.showToast("Error al agregar hospital: " + insertError.message, "error");
        }
        return;
      }

      toast.showToast("Hospital agregado correctamente. Los actos se han configurado automáticamente.", "success");
      
      // Refrescar lista de hospitales y actos (los actos se crean automáticamente por trigger)
      await loadHospitalsAndActs(user.id);
      
      // Cerrar modal después de un breve delay
      setTimeout(() => {
        closeAddHospitalModal();
      }, 1000);
    } finally {
      setAddingHospital(null);
    }
  }

  async function createCustomHospital() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    if (!customHospitalName.trim()) {
      toast.showToast("El nombre del hospital es requerido", "error");
      return;
    }

    // Validar día de cierre si se ingresó
    if (customHospitalClosingDay.trim()) {
      const closingDay = parseInt(customHospitalClosingDay);
      if (isNaN(closingDay) || closingDay < 1 || closingDay > 31) {
        toast.showToast("El día de cierre debe ser un número entre 1 y 31", "error");
        return;
      }
    }

    // Validar email si se ingresó
    if (customHospitalEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customHospitalEmail.trim())) {
        toast.showToast("El email no es válido", "error");
        return;
      }
    }

    setCreatingCustomHospital(true);

    try {
      // Crear hospital personalizado en el catálogo
      const { data: newHospital, error: createError } = await supabase
        .from("hospital_catalog")
        .insert({
          name: customHospitalName.trim(),
          closing_day: customHospitalClosingDay.trim() ? parseInt(customHospitalClosingDay) : null,
          to_email_default: customHospitalEmail.trim() || null,
          notes: null,
        })
        .select()
        .single();

      if (createError) {
        toast.showToast("Error al crear hospital: " + createError.message, "error");
        return;
      }

      // Agregar automáticamente a user_hospitals
      const { error: insertError } = await supabase
        .from("user_hospitals")
        .insert({
          user_id: user.id,
          catalog_hospital_id: newHospital.id,
        });

      if (insertError) {
        toast.showToast("Error al agregar hospital: " + insertError.message, "error");
        return;
      }

      toast.showToast("Hospital personalizado creado y agregado correctamente", "success");

      // Refrescar lista
      await loadHospitalsAndActs(user.id);

      // Cerrar modal después de un breve delay
      setTimeout(() => {
        closeAddHospitalModal();
      }, 1000);
    } finally {
      setCreatingCustomHospital(false);
    }
  }

  async function loadHospitalsAndActs(userId: string) {
    // Cargar hospitales del usuario
    const { data: hospitalsData, error: hospitalsError } = await supabase
      .from("user_hospitals")
      .select(
        `
        id,
        catalog_hospital_id,
        hospital:hospital_catalog (
          id,
          name,
          closing_day,
          to_email_default,
          notes
        )
      `
      )
      .eq("user_id", userId);

    if (hospitalsError) {
      console.error("Error al cargar hospitales:", hospitalsError);
      return;
    }

    if (!hospitalsData || hospitalsData.length === 0) {
      setHospitalsWithActs([]);
      return;
    }

    // Cargar todos los actos del usuario
    const { data: actsData, error: actsError } = await supabase
      .from("medical_acts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("sort_order");

    if (actsError) {
      console.error("Error al cargar actos:", actsError);
    }

    // Cargar grupos de envío para todos los hospitales
    const { data: groupsData, error: groupsError } = await supabase
      .from("user_report_groups")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("sort_order");

    if (groupsError) {
      console.error("Error al cargar grupos:", groupsError);
    }

    // Agrupar actos y grupos por hospital
    const hospitalsWithActsData: HospitalWithActs[] = hospitalsData.map((uh: any) => {
      // Normalizar hospital: Supabase puede devolver como objeto único o array
      let hospitalObj = null;
      
      // Debug: ver qué estructura tiene
      console.log('Processing hospital data:', {
        id: uh.id,
        hospital: uh.hospital,
        isArray: Array.isArray(uh.hospital),
        type: typeof uh.hospital
      });
      
      if (uh.hospital) {
        if (Array.isArray(uh.hospital)) {
          hospitalObj = uh.hospital[0] || null;
        } else if (uh.hospital && typeof uh.hospital === 'object') {
          // Ya es un objeto único
          hospitalObj = uh.hospital;
        }
      }
      
      // Debug: verificar resultado
      console.log('Normalized hospital:', {
        id: uh.id,
        hospitalObj: hospitalObj,
        name: hospitalObj?.name
      });
      
      const hospitalArray = hospitalObj ? [hospitalObj] : [];
      
      const acts = (actsData || []).filter(
        (act) => act.user_hospital_id === uh.id
      );
      const reportGroups = (groupsData || []).filter(
        (group) => group.user_hospital_id === uh.id
      );

      // Debug: mostrar grupos y asignaciones
      console.log(`Hospital: ${hospitalObj?.name || 'N/A'}`);
      console.log(`  Grupos: ${reportGroups.length}`);
      reportGroups.forEach((g) => {
        console.log(`    - ${g.name} (sort: ${g.sort_order})`);
      });
      console.log(`  Actos: ${acts.length}`);
      acts.forEach((a) => {
        const groupName = reportGroups.find((g) => g.id === a.user_report_group_id)?.name || 'Sin grupo';
        console.log(`    - ${a.name} -> Grupo: ${groupName} (${a.user_report_group_id || 'null'})`);
      });

      return {
        ...uh,
        hospital: hospitalArray, // Convertir a array
        acts,
        reportGroups,
      };
    });

    setHospitalsWithActs(hospitalsWithActsData);
  }

  function openAddForm(hospitalId: string) {
    setOpenFormFor(hospitalId);
    setActType("");
    setCustomActName("");
    setUnitType("hours");
    setUnitValue("");
    setRequiresPatients(false);
    setSupportsRoles(false);
    setUnitValuePrincipal("");
    setUnitValueAssistant("");
  }

  function closeAddForm() {
    setOpenFormFor(null);
    setActType("");
    setCustomActName("");
    setUnitType("hours");
    setUnitValue("");
    setRequiresPatients(false);
    setSupportsRoles(false);
    setUnitValuePrincipal("");
    setUnitValueAssistant("");
  }

  async function saveAct(userHospitalId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    // Validar nombre del acto
    let actName = "";
    if (actType === "other") {
      actName = customActName.trim();
      if (!actName) {
        toast.showToast("Ingresá el nombre del acto", "error");
        return;
      }
    } else if (!actType) {
      toast.showToast("Seleccioná un tipo de acto", "error");
      return;
    } else {
      actName = actType;
    }

    // Validaciones según flags
    if (supportsRoles) {
      // Si supports_roles = true, unit_value_principal y unit_value_assistant son obligatorios
      if (!unitValuePrincipal.trim() || !unitValueAssistant.trim()) {
        toast.showToast("Si el acto tiene rol, debés definir valor principal y ayudante", "error");
        return;
      }
      const principalValue = parseFloat(unitValuePrincipal);
      const assistantValue = parseFloat(unitValueAssistant);
      if (isNaN(principalValue) || principalValue <= 0) {
        toast.showToast("El valor principal debe ser un número mayor a 0", "error");
        return;
      }
      if (isNaN(assistantValue) || assistantValue <= 0) {
        toast.showToast("El valor ayudante debe ser un número mayor a 0", "error");
        return;
      }
    } else if (unitType === "hours") {
      // Si supports_roles = false y unit_type = 'hours', unit_value puede ser null o > 0
      if (unitValue.trim()) {
        const value = parseFloat(unitValue);
        if (isNaN(value) || value <= 0) {
          toast.showToast("El valor debe ser un número mayor a 0", "error");
          return;
        }
      }
    } else {
      // Si supports_roles = false y unit_type = 'units', validar unit_value si se ingresó
      if (unitValue.trim()) {
        const value = parseFloat(unitValue);
        if (isNaN(value) || value <= 0) {
          toast.showToast("El valor debe ser un número mayor a 0", "error");
          return;
        }
      }
    }

    setSaving(userHospitalId);

    try {
      // Preparar datos para insertar
      const insertData: any = {
        user_id: user.id,
        user_hospital_id: userHospitalId,
        name: actName,
        unit_type: unitType,
        requires_patients: requiresPatients,
        supports_roles: supportsRoles,
        is_active: true,
        sort_order: 0,
      };

      // Si supports_roles = true, usar unit_value_principal y unit_value_assistant, y dejar unit_value null
      if (supportsRoles) {
        insertData.unit_value_principal = parseFloat(unitValuePrincipal);
        insertData.unit_value_assistant = parseFloat(unitValueAssistant);
        insertData.unit_value = null;
      } else {
        // Si supports_roles = false, usar unit_value (puede ser null)
        insertData.unit_value = unitValue.trim() ? parseFloat(unitValue) : null;
        insertData.unit_value_principal = null;
        insertData.unit_value_assistant = null;
      }

      const { error: insertError } = await supabase
        .from("medical_acts")
        .insert(insertData);

      if (insertError) {
        // Error de duplicado (unique constraint)
        if (insertError.code === "23505") {
          toast.showToast("Ese acto ya existe para este hospital", "error");
        } else {
          toast.showToast("Error al guardar: " + insertError.message, "error");
        }
        return;
      }

      toast.showToast("Acto agregado correctamente", "success");
      
      // Refrescar lista de actos
      await loadHospitalsAndActs(user.id);
      
      // Cerrar formulario después de un breve delay
      setTimeout(() => {
        closeAddForm();
      }, 1000);
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteHospital() {
    if (!deleteConfirm) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    setDeleting(true);

    try {
      const { error: deleteError } = await supabase
        .from("user_hospitals")
        .delete()
        .eq("id", deleteConfirm.hospitalId)
        .eq("user_id", user.id);

      if (deleteError) {
        toast.showToast("Error al eliminar hospital: " + deleteError.message, "error");
        return;
      }

      // Recargar hospitales
      await loadHospitalsAndActs(user.id);
      setDeleteConfirm(null);
      toast.showToast("Hospital eliminado correctamente", "success");
    } finally {
      setDeleting(false);
    }
  }

  function handleCancelDelete() {
    setDeleteConfirm(null);
  }

  async function handleSaveUnitValue(actId: string, value: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    // Validar valor
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      toast.showToast("El valor debe ser mayor a 0", "error");
      return;
    }

    setUpdatingUnitValue(actId);

    try {
      const { error: updateError } = await supabase
        .from("medical_acts")
        .update({ unit_value: numValue })
        .eq("id", actId)
        .eq("user_id", user.id);

      if (updateError) {
        toast.showToast("Error al guardar: " + updateError.message, "error");
        return;
      }

      toast.showToast("Valor actualizado correctamente", "success");
      
      // Refrescar lista
      await loadHospitalsAndActs(user.id);
      setEditingUnitValue(null);
    } finally {
      setUpdatingUnitValue(null);
    }
  }

  async function handleCreateGroup(userHospitalId: string) {
    if (!newGroupName.trim()) {
      toast.showToast("Ingresá el nombre del grupo", "error");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    setCreatingGroup(true);

    try {
      // Obtener el sort_order más alto para este hospital
      const { data: existingGroups } = await supabase
        .from("user_report_groups")
        .select("sort_order")
        .eq("user_hospital_id", userHospitalId)
        .eq("is_active", true)
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextSortOrder = existingGroups && existingGroups.length > 0
        ? (existingGroups[0].sort_order || 0) + 1
        : 1;

      const { error: insertError } = await supabase
        .from("user_report_groups")
        .insert({
          user_id: user.id,
          user_hospital_id: userHospitalId,
          name: newGroupName.trim(),
          sort_order: nextSortOrder,
          is_active: true,
        });

      if (insertError) {
        toast.showToast("Error al crear grupo: " + insertError.message, "error");
        return;
      }

      toast.showToast("Grupo creado correctamente", "success");
      setNewGroupName("");
      setEditingGroupFor(null);
      
      // Refrescar lista
      await loadHospitalsAndActs(user.id);
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleUpdateActGroup(actId: string, groupId: string | null) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    setUpdatingActGroup(actId);

    try {
      const { error: updateError } = await supabase
        .from("medical_acts")
        .update({ user_report_group_id: groupId })
        .eq("id", actId)
        .eq("user_id", user.id);

      if (updateError) {
        toast.showToast("Error al actualizar: " + updateError.message, "error");
        return;
      }

      // Refrescar lista
      await loadHospitalsAndActs(user.id);
    } finally {
      setUpdatingActGroup(null);
    }
  }

  async function handleSaveRoleValues(actId: string, principal: string, assistant: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    // Validar valores
    const principalValue = principal.trim() ? parseFloat(principal) : null;
    const assistantValue = assistant.trim() ? parseFloat(assistant) : null;

    if (principalValue !== null && (isNaN(principalValue) || principalValue <= 0)) {
      toast.showToast("El valor principal debe ser mayor a 0", "error");
      return;
    }

    if (assistantValue !== null && (isNaN(assistantValue) || assistantValue <= 0)) {
      toast.showToast("El valor ayudante debe ser mayor a 0", "error");
      return;
    }

    setUpdatingUnitValue(actId);

    try {
      const { error: updateError } = await supabase
        .from("medical_acts")
        .update({
          unit_value_principal: principalValue,
          unit_value_assistant: assistantValue,
        })
        .eq("id", actId)
        .eq("user_id", user.id);

      if (updateError) {
        toast.showToast("Error al guardar: " + updateError.message, "error");
        return;
      }

      toast.showToast("Valores actualizados correctamente", "success");
      
      // Refrescar lista
      await loadHospitalsAndActs(user.id);
      setEditingRoleValues(null);
    } finally {
      setUpdatingUnitValue(null);
    }
  }

  function openEditActModal(act: MedicalAct) {
    setEditingAct(act);
    setEditActName(act.name);
    setEditUnitType(act.unit_type);
    setEditUnitValue(act.unit_value?.toString() || "");
    setEditRequiresPatients(act.requires_patients === true);
    setEditSupportsRoles(act.supports_roles === true);
    setEditUnitValuePrincipal(act.unit_value_principal?.toString() || "");
    setEditUnitValueAssistant(act.unit_value_assistant?.toString() || "");
    setEditReportGroupId(act.user_report_group_id);
  }

  function closeEditActModal() {
    setEditingAct(null);
    setEditActName("");
    setEditUnitType("hours");
    setEditUnitValue("");
    setEditRequiresPatients(false);
    setEditSupportsRoles(false);
    setEditUnitValuePrincipal("");
    setEditUnitValueAssistant("");
    setEditReportGroupId(null);
  }

  async function handleSaveEditedAct() {
    if (!editingAct) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.showToast("No estás autenticado", "error");
      return;
    }

    // Validaciones
    if (!editActName.trim()) {
      toast.showToast("El nombre del acto es requerido", "error");
      return;
    }

    if (editSupportsRoles) {
      // Si supports_roles = true, validar unit_value_principal y unit_value_assistant
      if (!editUnitValuePrincipal.trim() || !editUnitValueAssistant.trim()) {
        toast.showToast("Valor principal y ayudante son requeridos cuando el acto tiene roles", "error");
        return;
      }
      const principalValue = parseFloat(editUnitValuePrincipal);
      const assistantValue = parseFloat(editUnitValueAssistant);
      if (isNaN(principalValue) || principalValue <= 0 || isNaN(assistantValue) || assistantValue <= 0) {
        toast.showToast("Los valores principal y ayudante deben ser números mayores a 0", "error");
        return;
      }
    } else if (editUnitType === "hours" && editUnitValue.trim()) {
      // Si supports_roles = false y unit_type = 'hours', validar unit_value si se ingresó
      const value = parseFloat(editUnitValue);
      if (isNaN(value) || value <= 0) {
        toast.showToast("El valor debe ser un número mayor a 0", "error");
        return;
      }
    }

    setUpdatingAct(true);

    try {
      // Preparar datos para actualizar
      const updateData: any = {
        name: editActName.trim(),
        unit_type: editUnitType,
        requires_patients: editRequiresPatients,
        supports_roles: editSupportsRoles,
        user_report_group_id: editReportGroupId,
      };

      // Si supports_roles = true, usar unit_value_principal y unit_value_assistant, y dejar unit_value null
      if (editSupportsRoles) {
        updateData.unit_value_principal = parseFloat(editUnitValuePrincipal);
        updateData.unit_value_assistant = parseFloat(editUnitValueAssistant);
        updateData.unit_value = null;
      } else {
        // Si supports_roles = false, usar unit_value (puede ser null)
        updateData.unit_value = editUnitValue.trim() ? parseFloat(editUnitValue) : null;
        updateData.unit_value_principal = null;
        updateData.unit_value_assistant = null;
      }

      const { error: updateError } = await supabase
        .from("medical_acts")
        .update(updateData)
        .eq("id", editingAct.id)
        .eq("user_id", user.id);

      if (updateError) {
        toast.showToast("Error al actualizar: " + updateError.message, "error");
        return;
      }

      toast.showToast("Acto actualizado correctamente", "success");
      
      // Refrescar lista
      await loadHospitalsAndActs(user.id);
      closeEditActModal();
    } finally {
      setUpdatingAct(false);
    }
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <main className="min-h-screen p-3 sm:p-6 pb-24 overflow-x-hidden relative z-10">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 truncate">
            Mis hospitales 🏥
          </h1>
          <button
            onClick={openAddHospitalModal}
            className="rounded-lg bg-black hover:bg-gray-800 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
          >
            + Agregar hospital
          </button>
        </div>

        {/* Mis Hospitales */}
        <div>
          {hospitalsWithActs.length === 0 ? (
            <div className="p-6 rounded-xl bg-white border-2 border-black text-gray-600">
              <p className="mb-3">No tenés hospitales agregados aún.</p>
              <a
                href="/onboarding"
                className="text-gray-900 underline text-sm font-medium hover:text-gray-700"
              >
                Volvé a onboarding
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hospitalsWithActs.map((hospitalData) => {
                const hospital = hospitalData.hospital?.[0];
                const acts = hospitalData.acts || [];
                const isFormOpen = openFormFor === hospitalData.id;
                const isSaving = saving === hospitalData.id;

                const isExpanded = expandedHospitals.has(hospitalData.id);
                const hospitalSections = expandedSections[hospitalData.id] || { groups: false, acts: false };

                return (
                  <div
                    key={hospitalData.id}
                    className="p-3 sm:p-6 rounded-xl bg-white border-2 border-black mb-4 shadow-sm w-full min-w-0 overflow-x-hidden"
                  >
                    {/* Header del hospital - siempre visible */}
                    <div className="mb-4 sm:mb-5 pb-3 sm:pb-4 border-b border-gray-200">
                      <div className="flex items-start justify-between mb-2 gap-2 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 text-base sm:text-xl truncate min-w-0 flex-1">
                            {hospital?.name || "Hospital no encontrado"}
                          </div>
                          {hospital?.closing_day !== null && hospital?.closing_day !== undefined && (
                            <div className="text-xs sm:text-sm text-gray-600 mt-1 truncate flex items-center gap-1">
                              <span>📅</span>
                              <span>Día {hospital.closing_day}</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedHospitals);
                            if (isExpanded) {
                              newExpanded.delete(hospitalData.id);
                            } else {
                              newExpanded.add(hospitalData.id);
                            }
                            setExpandedHospitals(newExpanded);
                          }}
                          className="text-gray-600 hover:text-gray-900 transition-colors flex-shrink-0 ml-2"
                          title={isExpanded ? "Colapsar" : "Expandir"}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({
                              show: true,
                              hospitalId: hospitalData.id,
                              hospitalName: hospital?.name || "Hospital no encontrado",
                            });
                          }}
                          className="text-gray-500 hover:text-red-600 transition-colors p-1 flex-shrink-0"
                          title="Eliminar hospital"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                      {isExpanded && hospital?.to_email_default && (
                        <div className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
                          Email: {hospital.to_email_default}
                        </div>
                      )}
                    </div>

                    {/* Contenido colapsable - solo visible si está expandido */}
                    {isExpanded && (
                      <>
                    {/* Grupos de envío */}
                    <div className="mb-4 min-w-0">
                      <button
                        onClick={() => {
                          setExpandedSections({
                            ...expandedSections,
                            [hospitalData.id]: {
                              ...hospitalSections,
                              groups: !hospitalSections.groups,
                            },
                          });
                        }}
                        className="flex items-center justify-between w-full mb-3 gap-2 min-w-0"
                      >
                        <h3 className="text-xs sm:text-sm font-semibold text-gray-900 uppercase tracking-wide truncate min-w-0">
                          Grupos de envío
                        </h3>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={`h-4 w-4 text-gray-600 transition-transform flex-shrink-0 ${hospitalSections.groups ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {hospitalSections.groups && (
                        <>
                      {editingGroupFor !== hospitalData.id && (
                        <div className="flex items-center justify-end mb-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingGroupFor(hospitalData.id);
                              setNewGroupName("");
                            }}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-medium whitespace-nowrap flex-shrink-0"
                          >
                            + Agregar grupo
                          </button>
                        </div>
                      )}

                      {editingGroupFor === hospitalData.id && (
                        <div className="mb-3 flex items-center gap-2 min-w-0">
                          <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Nombre del grupo"
                            className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            disabled={creatingGroup}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !creatingGroup) {
                                handleCreateGroup(hospitalData.id);
                              } else if (e.key === "Escape") {
                                setEditingGroupFor(null);
                                setNewGroupName("");
                              }
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleCreateGroup(hospitalData.id)}
                            disabled={creatingGroup || !newGroupName.trim()}
                            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-black text-white text-xs sm:text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 flex-shrink-0"
                          >
                            {creatingGroup ? "..." : "✓"}
                          </button>
                          <button
                            onClick={() => {
                              setEditingGroupFor(null);
                              setNewGroupName("");
                            }}
                            disabled={creatingGroup}
                            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-gray-300 text-gray-700 text-xs sm:text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-60 flex-shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {hospitalData.reportGroups && hospitalData.reportGroups.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
                          {hospitalData.reportGroups
                            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                            .map((group) => {
                              const actsInGroup = acts.filter((a) => a.user_report_group_id === group.id).length;
                              return (
                                <div
                                  key={group.id}
                                  className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 bg-blue-50 border border-blue-200 rounded-lg max-w-full min-w-0"
                                >
                                  <span className="text-xs font-medium text-blue-900 truncate">
                                    {group.name}
                                  </span>
                                  <span className="text-xs text-blue-600 whitespace-nowrap flex-shrink-0">
                                    ({actsInGroup})
                                  </span>
                                </div>
                              );
                            })}
                          {acts.filter((a) => !a.user_report_group_id).length > 0 && (
                            <div className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-100 border border-gray-300 rounded-lg">
                              <span className="text-xs font-medium text-gray-700">
                                Sin agrupar
                              </span>
                              <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">
                                ({acts.filter((a) => !a.user_report_group_id).length})
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 italic mb-3">
                          No hay grupos configurados aún
                        </div>
                      )}
                        </>
                      )}
                    </div>

                    {/* Actos del hospital */}
                    <div className="mb-4 min-w-0">
                      <button
                        onClick={() => {
                          setExpandedSections({
                            ...expandedSections,
                            [hospitalData.id]: {
                              ...hospitalSections,
                              acts: !hospitalSections.acts,
                            },
                          });
                        }}
                        className="flex items-center justify-between w-full mb-3 gap-2 min-w-0"
                      >
                        <h3 className="text-xs sm:text-sm font-semibold text-gray-900 uppercase tracking-wide truncate min-w-0">
                          Actos médicos
                        </h3>
                        <div className="flex items-center gap-2">
                          {!isFormOpen && hospitalSections.acts && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openAddForm(hospitalData.id);
                              }}
                              className="rounded-lg bg-black hover:bg-gray-800 text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
                            >
                              + Agregar acto
                            </button>
                          )}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-4 w-4 text-gray-600 transition-transform flex-shrink-0 ${hospitalSections.acts ? "rotate-180" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {hospitalSections.acts && (
                        <>
                      {acts.length === 0 ? (
                        <div className="text-xs sm:text-sm text-gray-400 italic py-2">
                          Todavía no agregaste actos
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:gap-3">
                          {acts.map((act) => {
                            return (
                              <div
                                key={act.id}
                                className="flex items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-3 bg-gray-100 rounded-lg border border-gray-600 min-w-0"
                              >
                                <div className="text-sm sm:text-base font-medium text-gray-900 truncate min-w-0 flex-1">
                                  {act.name}
                                </div>
                                <button
                                  onClick={() => openEditActModal(act)}
                                  className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors font-medium whitespace-nowrap flex-shrink-0"
                                >
                                  Editar
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Formulario para agregar acto - dentro de la sección de actos */}
                      {isFormOpen && (
                        <div className="mt-5 pt-5 border-t-2 border-black space-y-3 sm:space-y-4 min-w-0">
                        {/* Tipo de acto */}
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">
                            Tipo de acto
                          </label>
                          <select
                            value={actType}
                            onChange={(e) => {
                              setActType(e.target.value);
                              setCustomActName("");
                            }}
                            className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            disabled={isSaving}
                          >
                            <option value="">Seleccioná...</option>
                            <option value="Guardia">Guardia</option>
                            <option value="Consulta">Consulta</option>
                            <option value="Cirugía">Cirugía</option>
                            <option value="Cesárea">Cesárea</option>
                            <option value="other">Otro…</option>
                          </select>
                        </div>

                        {/* Nombre personalizado si es "Otro..." */}
                        {actType === "other" && (
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">
                              Nombre del acto
                            </label>
                            <input
                              type="text"
                              value={customActName}
                              onChange={(e) => setCustomActName(e.target.value)}
                              placeholder="Ej: Parto"
                              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              disabled={isSaving}
                            />
                          </div>
                        )}

                        {/* Unidad */}
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">
                            Unidad
                          </label>
                          <select
                            value={unitType}
                            onChange={(e) =>
                              setUnitType(e.target.value as "hours" | "units")
                            }
                            className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            disabled={isSaving}
                          >
                            <option value="hours">Horas</option>
                            <option value="units">Unidades/Actos</option>
                          </select>
                        </div>

                        {/* Checkbox: Requiere pacientes */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="requiresPatients"
                            checked={requiresPatients}
                            onChange={(e) => setRequiresPatients(e.target.checked)}
                            disabled={isSaving}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="requiresPatients" className="text-sm text-gray-700 cursor-pointer">
                            Requiere pacientes
                          </label>
                        </div>

                        {/* Checkbox: Tiene rol (principal/ayudante) */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="supportsRoles"
                            checked={supportsRoles}
                            onChange={(e) => {
                              setSupportsRoles(e.target.checked);
                              // Si se desmarca, limpiar valores de roles
                              if (!e.target.checked) {
                                setUnitValuePrincipal("");
                                setUnitValueAssistant("");
                              }
                            }}
                            disabled={isSaving}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="supportsRoles" className="text-sm text-gray-700 cursor-pointer">
                            Tiene rol (principal/ayudante)
                          </label>
                        </div>

                        {/* Si supports_roles = true: mostrar inputs para valores de roles */}
                        {supportsRoles && (
                          <>
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                Valor principal <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                value={unitValuePrincipal}
                                onChange={(e) => setUnitValuePrincipal(e.target.value)}
                                placeholder="Ej: 1500"
                                step="0.01"
                                min="0"
                                className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                disabled={isSaving}
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                Valor ayudante <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                value={unitValueAssistant}
                                onChange={(e) => setUnitValueAssistant(e.target.value)}
                                placeholder="Ej: 750"
                                step="0.01"
                                min="0"
                                className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                disabled={isSaving}
                              />
                            </div>
                          </>
                        )}

                        {/* Si supports_roles = false: mostrar input para unit_value (opcional) */}
                        {!supportsRoles && (
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">
                              Valor por unidad {unitType === "hours" ? "(opcional)" : ""}
                            </label>
                            <input
                              type="number"
                              value={unitValue}
                              onChange={(e) => setUnitValue(e.target.value)}
                              placeholder="Ej: 1500"
                              step="0.01"
                              min="0"
                              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              disabled={isSaving}
                            />
                          </div>
                        )}

                        {/* Botones */}
                        <div className="flex gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                          <button
                            onClick={() => saveAct(hospitalData.id)}
                            disabled={isSaving}
                            className="flex-1 min-w-0 rounded-lg bg-black text-white font-medium py-2 sm:py-2.5 text-sm hover:bg-gray-800 disabled:opacity-60 transition-colors shadow-sm"
                          >
                            {isSaving ? "Guardando…" : "Guardar"}
                          </button>
                          <button
                            onClick={closeAddForm}
                            disabled={isSaving}
                            className="flex-1 sm:flex-none px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg border-2 border-black text-gray-900 hover:bg-gray-50 disabled:opacity-60 transition-colors font-medium text-sm"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                      )}
                        </>
                      )}
                    </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal de confirmación para eliminar hospital */}
        {deleteConfirm && deleteConfirm.show && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Eliminar hospital
              </h3>
              <p className="text-gray-700 mb-6">
                ¿Estás seguro que querés eliminar <strong>"{deleteConfirm.hospitalName}"</strong>? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  disabled={deleting}
                  className="flex-1 rounded-lg border-2 border-black text-gray-900 font-medium py-3 hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteHospital}
                  disabled={deleting}
                  className="flex-1 rounded-lg bg-black text-white font-medium py-3 hover:bg-gray-800 transition-colors disabled:opacity-60"
                >
                  {deleting ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para agregar hospital */}
        {showAddHospitalModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeAddHospitalModal}>
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-xl font-medium text-gray-900">
                  Agregar hospital
                </h3>
                <button
                  onClick={closeAddHospitalModal}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* Botón para agregar hospital personalizado */}
                {!showCustomHospitalForm && (
                  <div className="mb-4">
                    <button
                      onClick={() => setShowCustomHospitalForm(true)}
                      className="w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      No encuentro mi hospital
                    </button>
                  </div>
                )}

                {/* Formulario de hospital personalizado */}
                {showCustomHospitalForm && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">Agregar hospital personalizado</h4>
                      <button
                        onClick={() => {
                          setShowCustomHospitalForm(false);
                          setCustomHospitalName("");
                          setCustomHospitalClosingDay("");
                          setCustomHospitalEmail("");
                        }}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                        disabled={creatingCustomHospital}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nombre del hospital <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={customHospitalName}
                          onChange={(e) => setCustomHospitalName(e.target.value)}
                          placeholder="Ej: Hospital Central"
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          disabled={creatingCustomHospital}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Día de cierre (opcional)
                        </label>
                        <input
                          type="number"
                          value={customHospitalClosingDay}
                          onChange={(e) => setCustomHospitalClosingDay(e.target.value)}
                          placeholder="Ej: 15"
                          min="1"
                          max="31"
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          disabled={creatingCustomHospital}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Día del mes en que se realiza el cierre (1-31)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email (opcional)
                        </label>
                        <input
                          type="email"
                          value={customHospitalEmail}
                          onChange={(e) => setCustomHospitalEmail(e.target.value)}
                          placeholder="ejemplo@hospital.com"
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          disabled={creatingCustomHospital}
                        />
                      </div>
                      <button
                        onClick={createCustomHospital}
                        disabled={creatingCustomHospital || !customHospitalName.trim()}
                        className="w-full rounded-lg bg-black text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {creatingCustomHospital ? "Creando..." : "Crear y agregar hospital"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Búsqueda */}
                {!showCustomHospitalForm && (
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Buscar hospital..."
                      value={hospitalSearchQuery}
                      onChange={(e) => setHospitalSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                )}

                {/* Lista de hospitales */}
                {loadingHospitals ? (
                  <div className="text-center py-8 text-gray-600">Cargando hospitales...</div>
                ) : availableHospitals.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">No hay hospitales disponibles</div>
                ) : (
                  <div className="space-y-2">
                    {availableHospitals
                      .filter((hospital) =>
                        hospital.name.toLowerCase().includes(hospitalSearchQuery.toLowerCase())
                      )
                      .map((hospital) => {
                        // Verificar si ya está agregado
                        const isAlreadyAdded = hospitalsWithActs.some(
                          (uh) => uh.catalog_hospital_id === hospital.id
                        );
                        const isAdding = addingHospital === hospital.id;

                        return (
                          <div
                            key={hospital.id}
                            className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                          >
                            <div>
                              <div className="font-medium text-gray-900">{hospital.name}</div>
                              {hospital.closing_day !== null && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Día de cierre: {hospital.closing_day}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => addHospitalFromModal(hospital.id)}
                              disabled={isAlreadyAdded || isAdding}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isAlreadyAdded
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  : "bg-black text-white hover:bg-gray-800"
                              } disabled:opacity-60`}
                            >
                              {isAdding
                                ? "Agregando..."
                                : isAlreadyAdded
                                ? "Agregado"
                                : "Agregar"}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de edición de acto */}
        {editingAct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Editar Acto Médico</h2>
                <button
                  onClick={closeEditActModal}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  disabled={updatingAct}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 sm:space-y-6">
                {/* Nombre del acto */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Nombre del acto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editActName}
                    onChange={(e) => setEditActName(e.target.value)}
                    placeholder="Ej: Guardia"
                    className="w-full rounded-lg bg-gray-50 border border-gray-300 px-3 py-2 outline-none text-gray-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    disabled={updatingAct}
                  />
                </div>

                {/* Tipo de unidad */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Tipo de unidad <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editUnitType}
                    onChange={(e) => setEditUnitType(e.target.value as "hours" | "units")}
                    className="w-full rounded-lg bg-gray-50 border border-gray-300 px-3 py-2 outline-none text-gray-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    disabled={updatingAct}
                  >
                    <option value="hours">Horas</option>
                    <option value="units">Unidades/Actos</option>
                  </select>
                </div>

                {/* Checkbox: Requiere pacientes */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editRequiresPatients"
                    checked={editRequiresPatients}
                    onChange={(e) => setEditRequiresPatients(e.target.checked)}
                    disabled={updatingAct}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="editRequiresPatients" className="text-sm text-gray-700 cursor-pointer">
                    Requiere pacientes
                  </label>
                </div>

                {/* Checkbox: Tiene rol (principal/ayudante) */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editSupportsRoles"
                    checked={editSupportsRoles}
                    onChange={(e) => {
                      setEditSupportsRoles(e.target.checked);
                      if (!e.target.checked) {
                        setEditUnitValuePrincipal("");
                        setEditUnitValueAssistant("");
                      }
                    }}
                    disabled={updatingAct}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="editSupportsRoles" className="text-sm text-gray-700 cursor-pointer">
                    Tiene rol (principal/ayudante)
                  </label>
                </div>

                {/* Si supports_roles = true: mostrar inputs para valores de roles */}
                {editSupportsRoles && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Valor principal <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={editUnitValuePrincipal}
                        onChange={(e) => setEditUnitValuePrincipal(e.target.value)}
                        placeholder="Ej: 1500"
                        step="0.01"
                        min="0"
                        className="w-full rounded-lg bg-gray-50 border border-gray-300 px-3 py-2 outline-none text-gray-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        disabled={updatingAct}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Valor ayudante <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={editUnitValueAssistant}
                        onChange={(e) => setEditUnitValueAssistant(e.target.value)}
                        placeholder="Ej: 750"
                        step="0.01"
                        min="0"
                        className="w-full rounded-lg bg-gray-50 border border-gray-300 px-3 py-2 outline-none text-gray-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        disabled={updatingAct}
                      />
                    </div>
                  </>
                )}

                {/* Si supports_roles = false: mostrar input para unit_value (opcional) */}
                {!editSupportsRoles && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Valor por unidad {editUnitType === "hours" ? "(opcional)" : ""}
                    </label>
                    <input
                      type="number"
                      value={editUnitValue}
                      onChange={(e) => setEditUnitValue(e.target.value)}
                      placeholder="Ej: 1500"
                      step="0.01"
                      min="0"
                      className="w-full rounded-lg bg-gray-50 border border-gray-300 px-3 py-2 outline-none text-gray-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      disabled={updatingAct}
                    />
                  </div>
                )}

                {/* Grupo de envío */}
                {(() => {
                  const currentHospital = hospitalsWithActs.find((h) => h.id === editingAct.user_hospital_id);
                  return currentHospital?.reportGroups && currentHospital.reportGroups.length > 0 ? (
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Grupo de envío
                      </label>
                      <select
                        value={editReportGroupId || ""}
                        onChange={(e) => setEditReportGroupId(e.target.value || null)}
                        className="w-full rounded-lg bg-gray-50 border border-gray-300 px-3 py-2 outline-none text-gray-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        disabled={updatingAct}
                      >
                        <option value="">Sin grupo</option>
                        {currentHospital.reportGroups
                          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                          .map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : null;
                })()}

                {/* Botones */}
                <div className="flex gap-3 sm:gap-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleSaveEditedAct}
                    disabled={updatingAct}
                    className="flex-1 rounded-lg bg-black text-white font-medium py-2 sm:py-2.5 text-sm hover:bg-gray-800 disabled:opacity-60 transition-colors shadow-sm"
                  >
                    {updatingAct ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    onClick={closeEditActModal}
                    disabled={updatingAct}
                    className="flex-1 sm:flex-none px-6 py-2 sm:py-2.5 rounded-lg border-2 border-black text-gray-900 hover:bg-gray-50 disabled:opacity-60 transition-colors font-medium text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
