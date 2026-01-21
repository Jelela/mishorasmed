import { supabase } from "./supabaseClient";

export async function getOrCreateProfile(userId: string) {
  // Intentar obtener el perfil existente
  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  // Si existe, retornarlo
  if (existingProfile) {
    return { data: existingProfile, error: null };
  }

  // Si no existe, crearlo
  const { data: newProfile, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      onboarding_completed: false,
    })
    .select()
    .single();

  return { data: newProfile, error: createError || fetchError };
}

export async function checkOnboardingStatus(userId: string): Promise<boolean> {
  const { data, error } = await getOrCreateProfile(userId);
  
  if (error || !data) {
    return false;
  }

  return data.onboarding_completed ?? false;
}
