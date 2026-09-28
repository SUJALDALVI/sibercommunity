import { supabase } from "@/lib/supabase/supabase";
import type { GymChallenge, ChallengeParticipant, LeaderboardEntry, ChallengeType } from "./types";

// ── Challenges ────────────────────────────────────────────────────────────────

export async function fetchChallenges(communityId: string): Promise<GymChallenge[]> {
  const { data, error } = await supabase
    .from("gym_challenges")
    .select("*")
    .eq("community_id", communityId)
    .order("start_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as GymChallenge[];
}

export async function createChallenge(
  communityId: string,
  challenge: {
    title: string;
    description?: string | null;
    challenge_type: ChallengeType;
    target_value: number;
    start_date: string;
    end_date: string;
  }
): Promise<GymChallenge> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { data, error } = await supabase
    .from("gym_challenges")
    .insert({ community_id: communityId, created_by: user.id, ...challenge })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as GymChallenge;
}

export async function publishChallenge(challengeId: string): Promise<void> {
  const { error } = await supabase
    .from("gym_challenges")
    .update({ is_published: true })
    .eq("id", challengeId);
  if (error) throw new Error(error.message);
}

export async function closeChallenge(challengeId: string): Promise<void> {
  const { error } = await supabase
    .from("gym_challenges")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", challengeId);
  if (error) throw new Error(error.message);
}

export async function joinChallenge(challengeId: string): Promise<ChallengeParticipant> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { data, error } = await supabase
    .from("gym_challenge_participants")
    .insert({ challenge_id: challengeId, user_id: user.id })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as ChallengeParticipant;
}

export async function fetchMyParticipation(challengeId: string): Promise<ChallengeParticipant | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("gym_challenge_participants")
    .select("*")
    .eq("challenge_id", challengeId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data as ChallengeParticipant | null;
}

export async function fetchChallengeParticipants(challengeId: string): Promise<ChallengeParticipant[]> {
  const { data, error } = await supabase
    .from("gym_challenge_participants")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("progress", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ChallengeParticipant[];
}

// ── Leaderboard (computed client-side from opted-in data) ─────────────────────

export async function fetchLeaderboard(
  communityId: string,
  fromDate: string,
  toDate: string
): Promise<LeaderboardEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Only include opted-in profiles
  const { data: optedIn } = await supabase
    .from("gym_profiles")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("competition_opted_in", true);

  if (!optedIn || optedIn.length === 0) return [];
  const optedInIds = optedIn.map((p) => p.user_id as string);

  // Fetch attendance and workouts for opted-in members
  const [attendanceRes, workoutsRes, profilesRes] = await Promise.all([
    supabase
      .from("gym_attendance")
      .select("user_id, attendance_date")
      .eq("community_id", communityId)
      .in("user_id", optedInIds)
      .gte("attendance_date", fromDate)
      .lte("attendance_date", toDate),
    supabase
      .from("gym_workout_sessions")
      .select("user_id, session_date")
      .eq("community_id", communityId)
      .in("user_id", optedInIds)
      .gte("session_date", fromDate)
      .lte("session_date", toDate),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", optedInIds),
  ]);

  const nameMap = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    nameMap.set(p.id, p.full_name ?? "Siber Member");
  }

  const attendanceByUser = new Map<string, number>();
  for (const a of attendanceRes.data ?? []) {
    attendanceByUser.set(a.user_id, (attendanceByUser.get(a.user_id) ?? 0) + 1);
  }

  const workoutsByUser = new Map<string, number>();
  for (const w of workoutsRes.data ?? []) {
    workoutsByUser.set(w.user_id, (workoutsByUser.get(w.user_id) ?? 0) + 1);
  }

  const entries: LeaderboardEntry[] = optedInIds.map((uid) => {
    const attendance = attendanceByUser.get(uid) ?? 0;
    const workouts = workoutsByUser.get(uid) ?? 0;
    // Points: 10 per attendance day, 5 per workout session (cap 200/period)
    const points = Math.min(attendance * 10 + workouts * 5, 200);
    return {
      user_id: uid,
      display_name: nameMap.get(uid) ?? "Siber Member",
      attendance_days: attendance,
      workout_sessions: workouts,
      total_points: points,
      rank: 0,
    };
  });

  entries.sort((a, b) => b.total_points - a.total_points);
  entries.forEach((e, i) => { e.rank = i + 1; });

  return entries;
}
