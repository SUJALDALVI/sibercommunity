"use client";

import { useEffect, useState } from "react";
import { BarChart2, Flame, Droplets, Scale, Dumbbell, CalendarCheck } from "lucide-react";
import { fetchAttendanceRecords, computeAttendanceStats } from "@/lib/gym/attendance";
import { fetchWorkoutSessions } from "@/lib/gym/workout";
import { fetchWaterLogs, computeDailyWaterTotal } from "@/lib/gym/water";
import { fetchWeightEntries } from "@/lib/gym/weight";
import { fetchMealLogs, computeDailySummary } from "@/lib/gym/diet";
import { fetchGymProfile } from "@/lib/gym/profile";

interface Props { communityId: string; userId: string; }

export default function MyProgress({ communityId }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [data, setData] = useState<{
    stats: { total_days: number; current_streak: number; this_week: number; this_month: number; longest_streak: number } | null;
    workoutsThisMonth: number;
    latestWeight: number | null;
    weightUnit: string;
    todayWater: number;
    waterTarget: number;
    todayCalories: number;
    todayProtein: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [attendance, sessions, waterLogs, weights, meals, profile] = await Promise.all([
          fetchAttendanceRecords(communityId, thirtyDaysAgo, today),
          fetchWorkoutSessions(communityId, thirtyDaysAgo, today),
          fetchWaterLogs(communityId, today),
          fetchWeightEntries(communityId, 1),
          fetchMealLogs(communityId, today),
          fetchGymProfile(communityId),
        ]);
        if (!mounted) return;

        const stats = computeAttendanceStats(attendance);
        const summary = computeDailySummary(meals);

        setData({
          stats,
          workoutsThisMonth: sessions.length,
          latestWeight: weights[0]?.weight_value ?? null,
          weightUnit: weights[0]?.weight_unit ?? profile?.weight_unit ?? "kg",
          todayWater: computeDailyWaterTotal(waterLogs),
          waterTarget: profile?.daily_water_target_ml ?? 2500,
          todayCalories: summary.total_calories,
          todayProtein: summary.total_protein_g,
        });
      } catch (e) {
        console.error("MyProgress load error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [communityId, today, thirtyDaysAgo]);

  if (loading) return <div className="py-8 text-center text-xs text-zinc-500">Loading progress…</div>;
  if (!data) return <div className="py-8 text-center text-xs text-zinc-500">Could not load data.</div>;

  const waterPct = Math.min((data.todayWater / data.waterTarget) * 100, 100);

  const cards = [
    { icon: <CalendarCheck size={14} className="text-emerald-400" />, label: "Attendance this week", value: `${data.stats?.this_week ?? 0} days`, sub: `${data.stats?.this_month ?? 0} this month` },
    { icon: <Flame size={14} className="text-amber-400" />, label: "Current streak", value: `${data.stats?.current_streak ?? 0} days`, sub: `Longest: ${data.stats?.longest_streak ?? 0}` },
    { icon: <Dumbbell size={14} className="text-violet-400" />, label: "Workouts this month", value: `${data.workoutsThisMonth}`, sub: "Last 30 days" },
    { icon: <Scale size={14} className="text-red-400" />, label: "Latest weight", value: data.latestWeight ? `${data.latestWeight} ${data.weightUnit}` : "—", sub: "Private" },
    { icon: <Droplets size={14} className="text-cyan-400" />, label: "Water today", value: `${(data.todayWater / 1000).toFixed(2)} L`, sub: `${waterPct.toFixed(0)}% of target` },
    { icon: <BarChart2 size={14} className="text-pink-400" />, label: "Calories today", value: `${Math.round(data.todayCalories)} kcal`, sub: `Protein: ${data.todayProtein.toFixed(0)}g` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart2 size={16} className="text-red-400" />
        <p className="text-sm font-bold text-white">My Progress</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map(({ icon, label, value, sub }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#111118] p-3">
            <div className="mb-1 flex items-center gap-1.5">{icon}<p className="text-[10px] text-zinc-500">{label}</p></div>
            <p className="text-sm font-bold text-white">{value}</p>
            <p className="text-[10px] text-zinc-600">{sub}</p>
          </div>
        ))}
      </div>

      {/* Water progress bar */}
      <div className="rounded-xl border border-white/10 bg-[#111118] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-cyan-300">Hydration</p>
          <p className="text-xs text-zinc-500">{waterPct.toFixed(0)}%</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${waterPct}%` }} />
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 text-center">All data is personal and private. Use tabs above to log activity.</p>
    </div>
  );
}
