"use client";

import { useEffect, useState } from "react";
import { Users, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase/supabase";
import { fetchAttendanceRecords, computeAttendanceStats } from "@/lib/gym/attendance";
import { fetchWorkoutSessions } from "@/lib/gym/workout";
import { fetchWeightEntries } from "@/lib/gym/weight";
import { fetchMealLogsByRange, computeDailySummary } from "@/lib/gym/diet";
import { fetchWaterLogsByRange } from "@/lib/gym/water";

interface Props { communityId: string; }

interface MemberOption { user_id: string; full_name: string | null; }

type Period = "week" | "month";

function getRange(period: Period) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  if (period === "week") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: mon.toISOString().split("T")[0], to: today };
  }
  const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return { from: m, to: today };
}

export default function MemberReports({ communityId }: Props) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [period, setPeriod] = useState<Period>("week");
  const [report, setReport] = useState<{
    attendanceStats: ReturnType<typeof computeAttendanceStats> | null;
    workouts: number;
    totalWorkoutMin: number;
    latestWeight: number | null;
    weightUnit: string;
    avgCalories: number;
    avgProtein: number;
    waterDays: number;
    consentGiven: boolean;
    generatedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Load community members with consented gym profiles
  useEffect(() => {
    async function load() {
      setLoadingMembers(true);
      try {
        const { data } = await supabase
          .from("community_members")
          .select("user_id, profiles:user_id ( full_name )")
          .eq("community_id", communityId);

        setMembers((data ?? []).map((m) => ({
          user_id: m.user_id as string,
          full_name: (m.profiles as { full_name?: string | null } | null)?.full_name ?? null,
        })));
      } finally { setLoadingMembers(false); }
    }
    void load();
  }, [communityId]);

  const loadReport = async () => {
    if (!selected) return;
    setLoading(true);
    setReport(null);
    try {
      const { from, to } = getRange(period);

      // Check consent via gym_profiles (RLS will block if no consent)
      const { data: profileData } = await supabase
        .from("gym_profiles")
        .select("admin_report_consent, weight_unit")
        .eq("community_id", communityId)
        .eq("user_id", selected)
        .maybeSingle();

      if (!profileData?.admin_report_consent) {
        setReport({
          attendanceStats: null, workouts: 0, totalWorkoutMin: 0,
          latestWeight: null, weightUnit: "kg", avgCalories: 0, avgProtein: 0,
          waterDays: 0, consentGiven: false, generatedAt: new Date().toLocaleString(),
        });
        return;
      }

      // Fetch via client — RLS enforces admin + consent check
      const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
      const [attendance, sessions, weights, meals, water] = await Promise.all([
        supabase.from("gym_attendance").select("*").eq("community_id", communityId).eq("user_id", selected).gte("attendance_date", sixMonthsAgo).lte("attendance_date", to),
        supabase.from("gym_workout_sessions").select("id, duration_min, session_date").eq("community_id", communityId).eq("user_id", selected).gte("session_date", from).lte("session_date", to),
        supabase.from("gym_weight_entries").select("weight_value, weight_unit, entry_date").eq("community_id", communityId).eq("user_id", selected).order("entry_date", { ascending: false }).limit(1),
        supabase.from("gym_meal_logs").select("calories, protein_g, log_date").eq("community_id", communityId).eq("user_id", selected).gte("log_date", from).lte("log_date", to),
        supabase.from("gym_water_logs").select("log_date").eq("community_id", communityId).eq("user_id", selected).gte("log_date", from).lte("log_date", to),
      ]);

      const stats = computeAttendanceStats(
        (attendance.data ?? []).map(r => ({ ...r, community_id: communityId, user_id: selected }))
      );

      const totalWorkoutMin = (sessions.data ?? []).reduce((s, w) => s + (w.duration_min ?? 0), 0);
      const mealDays = new Set((meals.data ?? []).map(m => m.log_date));
      const avgCalories = mealDays.size > 0
        ? (meals.data ?? []).reduce((s, m) => s + (m.calories ?? 0), 0) / mealDays.size
        : 0;
      const avgProtein = mealDays.size > 0
        ? (meals.data ?? []).reduce((s, m) => s + (m.protein_g ?? 0), 0) / mealDays.size
        : 0;
      const waterDays = new Set((water.data ?? []).map(w => w.log_date)).size;

      setReport({
        attendanceStats: stats,
        workouts: sessions.data?.length ?? 0,
        totalWorkoutMin,
        latestWeight: weights.data?.[0]?.weight_value ?? null,
        weightUnit: weights.data?.[0]?.weight_unit ?? profileData?.weight_unit ?? "kg",
        avgCalories,
        avgProtein,
        waterDays,
        consentGiven: true,
        generatedAt: new Date().toLocaleString(),
      });
    } catch (e) { console.error("MemberReport error:", e); }
    finally { setLoading(false); }
  };

  const selectedMember = members.find(m => m.user_id === selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-red-400" />
        <p className="text-sm font-bold text-white">Member Reports</p>
        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">Admin only</span>
      </div>

      <p className="text-[11px] text-zinc-500">Only members who have consented to admin report access in their gym profile will have full data shown.</p>

      {/* Member selector */}
      <div className="rounded-xl border border-white/10 bg-[#111118] p-3 space-y-2">
        <label className="text-xs font-semibold text-zinc-400">Select member</label>
        {loadingMembers ? <p className="text-xs text-zinc-500">Loading members…</p> : (
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none">
            <option value="">— Choose member —</option>
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.full_name || m.user_id.slice(0, 8)}</option>
            ))}
          </select>
        )}
        <div className="flex gap-1">
          {(["week", "month"] as Period[]).map(p => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${period === p ? "bg-red-500/20 text-red-300" : "border border-white/10 text-zinc-400 hover:text-white"}`}>
              This {p}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void loadReport()} disabled={!selected || loading}
          className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
          {loading ? "Loading…" : "View Report"}
        </button>
      </div>

      {/* Report */}
      {report && (
        <div className="rounded-2xl border border-white/10 bg-[#111118] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">{selectedMember?.full_name ?? "Member"}</p>
            <p className="text-[10px] text-zinc-600">Generated {report.generatedAt}</p>
          </div>

          {!report.consentGiven ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold text-amber-300">No consent</p>
              <p className="text-[11px] text-zinc-400">This member has not enabled admin report access in their gym profile.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Attendance (all time)", val: `${report.attendanceStats?.total_days ?? 0} days` },
                { label: "Current streak", val: `${report.attendanceStats?.current_streak ?? 0} days` },
                { label: `Workouts (${period})`, val: `${report.workouts}` },
                { label: "Total workout time", val: `${report.totalWorkoutMin} min` },
                { label: "Latest weight", val: report.latestWeight ? `${report.latestWeight} ${report.weightUnit}` : "—" },
                { label: `Avg calories (${period})`, val: `${Math.round(report.avgCalories)} kcal/day` },
                { label: `Avg protein (${period})`, val: `${report.avgProtein.toFixed(0)}g/day` },
                { label: `Days with water (${period})`, val: `${report.waterDays} days` },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-[#0d0c12] p-2">
                  <p className="text-[10px] text-zinc-500">{label}</p>
                  <p className="text-sm font-bold text-white">{val}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
