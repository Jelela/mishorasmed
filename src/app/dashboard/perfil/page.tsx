"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { checkOnboardingStatus } from "@/lib/profileHelpers";
import { useToast } from "@/components/ToastProvider";
import { Loading } from "@/components/Loading";

export default function PerfilPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [loggingOut, setLoggingOut] = useState(false);

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
      setLoading(false);
    })();
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      toast.showToast("Sesión cerrada correctamente", "success");
      router.push("/login");
    } catch (error) {
      toast.showToast("Error al cerrar sesión", "error");
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <main className="min-h-screen p-6 pb-24 relative z-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6 text-gray-900">
          Mi Perfil
        </h1>

        <div className="space-y-6">
          {/* Información del usuario */}
          <div className="p-6 rounded-xl bg-gray-50 border border-gray-200">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">
              Información
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Email
                </label>
                <p className="text-gray-900">{email}</p>
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="p-6 rounded-xl bg-gray-50 border border-gray-200">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">
              Acciones
            </h2>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full rounded-lg bg-red-600 text-white font-medium py-3 hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {loggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
