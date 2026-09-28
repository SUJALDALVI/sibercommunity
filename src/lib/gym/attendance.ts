import { supabase } from "@/lib/supabase/supabase";
import type { AttendanceRecord, AttendanceStats } from "./types";

export async function fetchAttendanceRecords(
  communityId: string,
  fromDate: string,
  toDate: string
): Promise<AttendanceRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("gym_attendance")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .gte("attendance_date", fromDate)
    .lte("attendance_date", toDate)
    .order("attendance_date", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as AttendanceRecord[];
}

export async function markAttendance(
  communityId: string,
  attendanceDate: string,
  durationMin?: number,
  notes?: string
): Promise<AttendanceRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { data, error } = await supabase
    .from("gym_attendance")
    .upsert(
      {
        community_id: communityId,
        user_id: user.id,
        attendance_date: attendanceDate,
        duration_min: durationMin ?? null,
        notes: notes?.trim() || null,
      },
      { onConflict: "community_id,user_id,attendance_date" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as AttendanceRecord;
}

export async function deleteAttendance(recordId: string): Promise<void> {
  const { error } = await supabase.from("gym_attendance").delete().eq("id", recordId);
  if (error) throw new Error(error.message);
}

export function computeAttendanceStats(records: AttendanceRecord[]): AttendanceStats {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Week boundaries (Mon–Sun)
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = (dayOfWeek + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - mondayOffset);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const dateSet = new Set(records.map((r) => r.attendance_date));
  const sortedDates = [...dateSet].sort();

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const d of sortedDates) {
    const cur = new Date(d);
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diff = (cur.getTime() - prevDate.getTime()) / 86400000;
      if (diff === 1) {
        tempStreak += 1;
      } else {
        tempStreak = 1;
      }
    }
    if (tempStreak > longestStreak) longestStreak = tempStreak;
    prevDate = cur;
  }

  // Current streak: count back from today
  let checkDate = new Date(todayStr);
  while (dateSet.has(checkDate.toISOString().split("T")[0])) {
    currentStreak += 1;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  const thisWeek = records.filter((r) => r.attendance_date >= weekStartStr && r.attendance_date <= todayStr).length;
  const thisMonth = records.filter((r) => r.attendance_date >= monthStart).length;

  return {
    total_days: dateSet.size,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    this_week: thisWeek,
    this_month: thisMonth,
  };
}
