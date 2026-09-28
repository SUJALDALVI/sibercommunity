import { supabase } from "@/lib/supabase/supabase";
import type { WeightEntry } from "./types";

export async function fetchWeightEntries(communityId: string, limit = 90): Promise<WeightEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("gym_weight_entries")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .order("entry_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as WeightEntry[];
}

export async function upsertWeightEntry(
  communityId: string,
  entryDate: string,
  weightValue: number,
  weightUnit: "kg" | "lbs",
  notes?: string
): Promise<WeightEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  if (weightValue <= 0) throw new Error("Weight must be a positive number.");

  const { data, error } = await supabase
    .from("gym_weight_entries")
    .upsert(
      {
        community_id: communityId,
        user_id: user.id,
        entry_date: entryDate,
        weight_value: weightValue,
        weight_unit: weightUnit,
        notes: notes?.trim() || null,
      },
      { onConflict: "community_id,user_id,entry_date" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as WeightEntry;
}

export async function deleteWeightEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("gym_weight_entries")
    .delete()
    .eq("id", entryId);
  if (error) throw new Error(error.message);
}
