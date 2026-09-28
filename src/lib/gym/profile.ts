import { supabase } from "@/lib/supabase/supabase";
import type { GymProfile } from "./types";

export async function fetchGymProfile(communityId: string): Promise<GymProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("gym_profiles")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as GymProfile | null;
}

export async function upsertGymProfile(
  communityId: string,
  updates: Partial<Omit<GymProfile, "id" | "community_id" | "user_id" | "created_at" | "updated_at">>
): Promise<GymProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { data, error } = await supabase
    .from("gym_profiles")
    .upsert(
      { community_id: communityId, user_id: user.id, ...updates },
      { onConflict: "community_id,user_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as GymProfile;
}
