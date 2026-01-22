"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { checkOnboardingStatus } from "@/lib/profileHelpers";

interface Hospital {
  id: string;
  name: string;
  closing_day: number | null;
  to_email_default: string | null;
  notes: string | null;
}

interface UserHospital {
  id: string;
  catalog_hospital_id: string;
  hospital: Hospital[];
}

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [userHospitals, setUserHospitals] = useState<UserHospital[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [addingHospital, setAddingHospital] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Verificar autenticación
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      // Verificar si ya completó onboarding
      const completed = await checkOnboardingStatus(user.id);
      if (completed) {
        router.replace("/dashboard/inicio");
        return;
      }

      // Cargar catálogo de hospitales
      await loadHospitals();
      await loadUserHospitals(user.id);
      setLoading(false);
    })();
  }, [router]);

  async function loadHospitals() {
    const { data, error } = await supabase
      .from("hospital_catalog")
      .select("*")
      .order("name");

    if (error) {
      setError("Error al cargar hospitales: " + error.message);
      return;
    }

    setHospitals(data || []);
  }

  async function loadUserHospitals(userId: string) {
    const { data, error } = await supabase
      .from("user_hospitals")
      .select(`
        id,
        catalog_hospital_id,
        hospital:hospital_catalog (
          id,
          name,
          closing_day,
          to_email_default,
          notes
        )
      `)
      .eq("user_id", userId);

    if (error) {
      console.error("Error al cargar hospitales del usuario:", error);
      return;
    }

    // Convertir hospital de objeto único a array (Supabase devuelve objeto único en join)
    const userHospitalsData: UserHospital[] = (data || []).map((uh: any) => ({
      ...uh,
      hospital: Array.isArray(uh.hospital) ? uh.hospital : (uh.hospital ? [uh.hospital] : []),
    }));

    setUserHospitals(userHospitalsData);
  }

  async function addHospital(hospitalId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No estás autenticado");
      return;
    }

    setAddingHospital(hospitalId);
    setError(null);
    setSuccessMsg(null);

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
          setSuccessMsg("Ya agregaste este hospital");
        } else {
          setError("Error al agregar hospital: " + insertError.message);
        }
        return;
      }

      // Recargar lista de hospitales del usuario (los actos se crean automáticamente por trigger)
      await loadUserHospitals(user.id);
      setSuccessMsg("Hospital agregado correctamente. Los actos se han configurado automáticamente.");
    } finally {
      setAddingHospital(null);
    }
  }

  async function finishOnboarding() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No estás autenticado");
      return;
    }

    if (userHospitals.length === 0) {
      setError("Debés agregar al menos un hospital");
      return;
    }

    setFinishing(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      if (updateError) {
        setError("Error al finalizar onboarding: " + updateError.message);
        return;
      }

      router.push("/dashboard/inicio");
    } finally {
      setFinishing(false);
    }
  }

  // Filtrar hospitales por búsqueda
  const filteredHospitals = hospitals.filter((hospital) =>
    hospital.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Verificar si un hospital ya está agregado
  const isHospitalAdded = (hospitalId: string) => {
    return userHospitals.some(
      (uh) => uh.catalog_hospital_id === hospitalId
    );
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-white/70">Cargando...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">
          ¿Dónde estás trabajando?
        </h1>
        <p className="text-sm text-white/70 mb-6">
          Elegí los hospitales donde trabajás
        </p>

        {/* Búsqueda */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar hospital..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 outline-none"
          />
        </div>

        {/* Mensajes */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-300 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-green-500/20 border border-green-500/50 text-green-300 text-sm">
            {successMsg}
          </div>
        )}

        {/* Lista de hospitales */}
        {hospitals.length === 0 ? (
          <div className="text-white/70 text-center py-12">
            No hay hospitales cargados
          </div>
        ) : filteredHospitals.length === 0 ? (
          <div className="text-white/70 text-center py-12">
            No se encontraron hospitales con ese nombre
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {filteredHospitals.map((hospital) => {
              const isAdded = isHospitalAdded(hospital.id);
              const isAdding = addingHospital === hospital.id;

              return (
                <div
                  key={hospital.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/10"
                >
                  <span className="text-white">{hospital.name}</span>
                  <button
                    onClick={() => addHospital(hospital.id)}
                    disabled={isAdded || isAdding}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${
                      isAdded
                        ? "bg-green-500/20 text-green-300 cursor-not-allowed"
                        : "bg-white text-black hover:bg-white/90"
                    } disabled:opacity-60`}
                  >
                    {isAdding
                      ? "Agregando..."
                      : isAdded
                      ? "Agregado"
                      : "Agregar"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Contador y botón finalizar */}
        <div className="mt-6 pt-6 border-t border-white/10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white/70">
              {userHospitals.length === 0
                ? "Agregá al menos un hospital para continuar"
                : `${userHospitals.length} hospital${
                    userHospitals.length !== 1 ? "es" : ""
                  } agregado${userHospitals.length !== 1 ? "s" : ""}`}
            </span>
          </div>
          <button
            onClick={finishOnboarding}
            disabled={userHospitals.length === 0 || finishing}
            className="w-full rounded-xl bg-white text-black font-medium py-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {finishing ? "Finalizando..." : "Finalizar onboarding"}
          </button>
        </div>
      </div>
    </main>
  );
}
