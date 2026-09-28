import { supabase } from "@/lib/supabase/supabase";
import type { WaterLog } from "./types";

export async function fetchWaterLogs(communityId: string, date: string): Promise<WaterLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("gym_water_logs")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .eq("log_date", date)
    .order("logged_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as WaterLog[];
}

export async function fetchWaterLogsByRange(
  communityId: string,
  fromDate: string,
  toDate: string
): Promise<WaterLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("gym_water_logs")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .gte("log_date", fromDate)
    .lte("log_date", toDate)
    .order("log_date", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as WaterLog[];
}

export async function addWaterLog(
  communityId: string,
  date: string,
  amountMl: number,
  notes?: string
): Promise<WaterLog> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");
  if (amountMl <= 0) throw new Error("Amount must be positive.");

  const { data, error } = await supabase
    .from("gym_water_logs")
    .insert({
      community_id: communityId,
      user_id: user.id,
      log_date: date,
      amount_ml: amountMl,
      notes: notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as WaterLog;
}

export async function deleteWaterLog(logId: string): Promise<void> {
  const { error } = await supabase.from("gym_water_logs").delete().eq("id", logId);
  if (error) throw new Error(error.message);
}

export function computeDailyWaterTotal(logs: WaterLog[]): number {
  return logs.reduce((sum, l) => sum + l.amount_ml, 0);
}
