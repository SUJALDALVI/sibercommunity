import { supabase } from "@/lib/supabase/supabase";
import type { WorkoutSession, WorkoutExercise } from "./types";

export async function fetchWorkoutSessions(
  communityId: string,
  fromDate: string,
  toDate: string
): Promise<WorkoutSession[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("gym_workout_sessions")
    .select(`
      id, community_id, user_id, session_date, workout_type, duration_min, notes, created_at,
      gym_workout_exercises ( id, session_id, exercise_name, sets, reps, weight_kg, duration_min, distance_km, notes, sort_order, created_at )
    `)
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .gte("session_date", fromDate)
    .lte("session_date", toDate)
    .order("session_date", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => ({
    ...s,
    exercises: ((s.gym_workout_exercises ?? []) as WorkoutExercise[]).sort((a, b) => a.sort_order - b.sort_order),
  })) as WorkoutSession[];
}

export async function createWorkoutSession(
  communityId: string,
  session: {
    session_date: string;
    workout_type: string;
    duration_min?: number | null;
    notes?: string | null;
  },
  exercises: Array<{
    exercise_name: string;
    sets?: number | null;
    reps?: number | null;
    weight_kg?: number | null;
    duration_min?: number | null;
    distance_km?: number | null;
    notes?: string | null;
  }>
): Promise<WorkoutSession> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { data: sessionData, error: sessionError } = await supabase
    .from("gym_workout_sessions")
    .insert({ community_id: communityId, user_id: user.id, ...session })
    .select("id, community_id, user_id, session_date, workout_type, duration_min, notes, created_at")
    .single();

  if (sessionError) throw new Error(sessionError.message);

  if (exercises.length > 0) {
    const rows = exercises.map((ex, idx) => ({
      session_id: sessionData.id,
      exercise_name: ex.exercise_name.trim(),
      sets: ex.sets ?? null,
      reps: ex.reps ?? null,
      weight_kg: ex.weight_kg ?? null,
      duration_min: ex.duration_min ?? null,
      distance_km: ex.distance_km ?? null,
      notes: ex.notes?.trim() || null,
      sort_order: idx,
    }));

    const { error: exError } = await supabase.from("gym_workout_exercises").insert(rows);
    if (exError) throw new Error(exError.message);
  }

  return { ...sessionData, exercises: [] } as WorkoutSession;
}

export async function deleteWorkoutSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("gym_workout_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}
