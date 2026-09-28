import { supabase } from "@/lib/supabase/supabase";
import type { MealLog, DailyNutritionSummary, MealType } from "./types";

export async function fetchMealLogs(communityId: string, date: string): Promise<MealLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("gym_meal_logs")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .eq("log_date", date)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as MealLog[];
}

export async function fetchMealLogsByRange(
  communityId: string,
  fromDate: string,
  toDate: string
): Promise<MealLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("gym_meal_logs")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .gte("log_date", fromDate)
    .lte("log_date", toDate)
    .order("log_date", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as MealLog[];
}

export async function addMealLog(
  communityId: string,
  entry: {
    log_date: string;
    meal_type: MealType;
    food_name: string;
    serving_size: number;
    serving_unit: string;
    calories?: number | null;
    protein_g?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
    fiber_g?: number | null;
    fdc_id?: string | null;
    data_source?: string;
    notes?: string | null;
  }
): Promise<MealLog> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { data, error } = await supabase
    .from("gym_meal_logs")
    .insert({ community_id: communityId, user_id: user.id, ...entry })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as MealLog;
}

export async function updateMealLog(
  logId: string,
  updates: Partial<Pick<MealLog, "food_name" | "serving_size" | "serving_unit" | "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g" | "notes" | "meal_type">>
): Promise<void> {
  const { error } = await supabase
    .from("gym_meal_logs")
    .update(updates)
    .eq("id", logId);
  if (error) throw new Error(error.message);
}

export async function deleteMealLog(logId: string): Promise<void> {
  const { error } = await supabase.from("gym_meal_logs").delete().eq("id", logId);
  if (error) throw new Error(error.message);
}

export function computeDailySummary(meals: MealLog[]): DailyNutritionSummary {
  const date = meals[0]?.log_date ?? new Date().toISOString().split("T")[0];
  return {
    date,
    total_calories: meals.reduce((s, m) => s + (m.calories ?? 0), 0),
    total_protein_g: meals.reduce((s, m) => s + (m.protein_g ?? 0), 0),
    total_carbs_g: meals.reduce((s, m) => s + (m.carbs_g ?? 0), 0),
    total_fat_g: meals.reduce((s, m) => s + (m.fat_g ?? 0), 0),
    total_fiber_g: meals.reduce((s, m) => s + (m.fiber_g ?? 0), 0),
    meal_count: meals.length,
  };
}
