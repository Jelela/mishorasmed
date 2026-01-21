"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { checkOnboardingStatus } from "@/lib/profileHelpers";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      if (!email || !password) {
        setMsg("Completá email y contraseña.");
        return;
      }

      const res =
        mode === "signup"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (res.error) {
        setMsg(res.error.message);
        return;
      }

      if (!res.data.user) {
        setMsg("Error al obtener datos del usuario.");
        return;
      }

      // Verificar estado de onboarding
      const onboardingCompleted = await checkOnboardingStatus(res.data.user.id);

      // Redirigir según el estado de onboarding
      if (onboardingCompleted) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Mis Horas Med</h1>
        <p className="text-sm text-gray-600 mt-1">
          {mode === "login" ? "Entrar" : "Crear cuenta"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            className="w-full rounded-xl bg-white border border-gray-300 px-4 py-3 outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
          <input
            className="w-full rounded-xl bg-white border border-gray-300 px-4 py-3 outline-none text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />

          {msg && <p className="text-sm text-red-600">{msg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 text-white font-medium py-3 hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {loading
              ? "Procesando..."
              : mode === "login"
              ? "Entrar"
              : "Crear cuenta"}
          </button>
        </form>

        <button
          className="mt-4 text-sm text-gray-600 underline hover:text-gray-900"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login"
            ? "¿No tenés cuenta? Crear cuenta"
            : "¿Ya tenés cuenta? Entrar"}
        </button>
      </div>
    </main>
  );
}
