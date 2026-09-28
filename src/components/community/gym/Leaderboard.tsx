"use client";

import { useEffect, useState } from "react";
import { Trophy, Crown } from "lucide-react";
import { fetchLeaderboard } from "@/lib/gym/competition";
import { upsertGymProfile, fetchGymProfile } from "@/lib/gym/profile";
import type { LeaderboardEntry } from "@/lib/gym/types";
import useAuth from "@/hooks/useAuth";

interface Props { communityId: string; }

type Period = "week" | "month";

function getDateRange(period: Period) {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  if (period === "week") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: mon.toISOString().split("T")[0], to: today };
  }
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return { from: monthStart, to: today };
}

export default function Leaderboard({ communityId }: Props) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("week");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [optedIn, setOptedIn] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(period);
      const [data, profile] = await Promise.all([
        fetchLeaderboard(communityId, from, to),
        fetchGymProfile(communityId),
      ]);
      setEntries(data);
      setOptedIn(profile?.competition_opted_in ?? false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [communityId, period]);

  const handleToggleOptin = async () => {
    setToggling(true);
    try {
      await upsertGymProfile(communityId, { competition_opted_in: !optedIn });
      setOptedIn(v => !v);
      await load();
    } catch (e) { console.error(e); }
    finally { setToggling(false); }
  };

  const myEntry = entries.find(e => e.user_id === user?.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-amber-400" />
        <p className="text-sm font-bold text-white">Leaderboard</p>
      </div>

      {/* Opt-in toggle */}
      <div className="rounded-xl border border-white/10 bg-[#111118] px-3 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-zinc-300">Compete publicly</p>
          <p className="text-[10px] text-zinc-600">Only attendance & workout counts are shown</p>
        </div>
        <button type="button" onClick={() => void handleToggleOptin()} disabled={toggling}
          className={`relative h-5 w-10 rounded-full transition ${optedIn ? "bg-red-500" : "bg-zinc-700"} disabled:opacity-60`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${optedIn ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Period toggle */}
      <div className="flex gap-1">
        {(["week", "month"] as Period[]).map(p => (
          <button key={p} type="button" onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${period === p ? "bg-amber-500/20 text-amber-300" : "border border-white/10 text-zinc-400 hover:text-white"}`}>
            This {p}
          </button>
        ))}
      </div>

      {/* My rank */}
      {myEntry && optedIn && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <p className="text-xs font-bold text-amber-300">Your rank: #{myEntry.rank}</p>
          <p className="text-[11px] text-zinc-400">{myEntry.total_points} pts · {myEntry.attendance_days} days · {myEntry.workout_sessions} workouts</p>
        </div>
      )}

      {/* Rankings */}
      {loading ? <p className="text-xs text-zinc-500">Loading…</p> : entries.length === 0 ? (
        <p className="text-xs text-zinc-600">No opted-in members yet for this period.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(e => (
            <div key={e.user_id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${e.rank === 1 ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-[#111118]"}`}>
              <div className="w-6 text-center">
                {e.rank === 1 ? <Crown size={14} className="text-amber-400 mx-auto" /> : <span className="text-xs font-bold text-zinc-500">#{e.rank}</span>}
              </div>
              <p className="flex-1 text-xs font-semibold text-white truncate">{e.display_name}</p>
              <div className="text-right">
                <p className="text-xs font-bold text-white">{e.total_points} pts</p>
                <p className="text-[10px] text-zinc-500">{e.attendance_days}d · {e.workout_sessions}w</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-zinc-600">Scores: 10pts/attendance day + 5pts/workout session. Max 200pts/period. Private fitness data is never shown.</p>
    </div>
  );
}
