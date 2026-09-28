"use client";

import { useEffect, useState, useCallback } from "react";
import { Droplets, Plus, Trash2 } from "lucide-react";
import { fetchWaterLogs, addWaterLog, deleteWaterLog, computeDailyWaterTotal } from "@/lib/gym/water";
import { fetchGymProfile, upsertGymProfile } from "@/lib/gym/profile";
import type { WaterLog } from "@/lib/gym/types";

interface Props { communityId: string; userId: string; }

const QUICK_AMOUNTS = [150, 250, 330, 500, 750];

export default function WaterTracker({ communityId }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [target, setTarget] = useState(2500);
  const [loading, setLoading] = useState(true);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingTarget, setEditingTarget] = useState(false);
  const [newTarget, setNewTarget] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, profile] = await Promise.all([
        fetchWaterLogs(communityId, today),
        fetchGymProfile(communityId),
      ]);
      setLogs(data);
      if (profile?.daily_water_target_ml) setTarget(profile.daily_water_target_ml);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setLoading(false); }
  }, [communityId, today]);

  useEffect(() => { void load(); }, [load]);

  const addWater = async (ml: number) => {
    if (ml <= 0) return;
    setSaving(true); setError("");
    try {
      await addWaterLog(communityId, today, ml);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  };

  const handleSaveTarget = async () => {
    const val = parseInt(newTarget);
    if (!val || val <= 0) { setError("Enter a valid target."); return; }
    try {
      await upsertGymProfile(communityId, { daily_water_target_ml: val });
      setTarget(val); setEditingTarget(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
  };

  const total = computeDailyWaterTotal(logs);
  const pct = Math.min((total / target) * 100, 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Droplets size={16} className="text-cyan-400" />
        <p className="text-sm font-bold text-white">Water Tracker</p>
      </div>

      {/* Progress */}
      <div className="rounded-2xl border border-white/10 bg-[#111118] p-4 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-zinc-500">Today</p>
            <p className="text-2xl font-black text-white">{(total / 1000).toFixed(2)} <span className="text-sm text-zinc-400">L</span></p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Target</p>
            {editingTarget ? (
              <div className="flex items-center gap-1">
                <input type="number" min="0" value={newTarget} onChange={e => setNewTarget(e.target.value)}
                  className="w-20 rounded-lg border border-white/10 bg-[#0d0c12] px-2 py-1 text-xs text-white outline-none" />
                <button type="button" onClick={() => void handleSaveTarget()} className="text-[11px] text-emerald-400">✓</button>
                <button type="button" onClick={() => setEditingTarget(false)} className="text-[11px] text-zinc-500">✕</button>
              </div>
            ) : (
              <button type="button" onClick={() => { setNewTarget(String(target)); setEditingTarget(true); }}
                className="text-sm font-bold text-zinc-300 hover:text-white">{(target / 1000).toFixed(1)} L</button>
            )}
          </div>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-zinc-500">{pct.toFixed(0)}% of daily target</p>
      </div>

      {/* Quick add */}
      <div className="rounded-2xl border border-white/10 bg-[#111118] p-3 space-y-2">
        <p className="text-xs font-semibold text-zinc-400">Quick add</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_AMOUNTS.map(ml => (
            <button key={ml} type="button" onClick={() => void addWater(ml)} disabled={saving}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-60">
              +{ml} ml
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="number" min="1" placeholder="Custom ml" value={custom} onChange={e => setCustom(e.target.value)}
            className="flex-1 rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
          <button type="button" onClick={() => { void addWater(parseInt(custom) || 0); setCustom(""); }} disabled={saving}
            className="rounded-xl bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-60">
            <Plus size={13} />
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Log */}
      {loading ? <p className="text-xs text-zinc-500">Loading…</p> : (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-zinc-500">Today&apos;s log ({logs.length} entries)</p>
          {logs.length === 0 && <p className="text-xs text-zinc-600">No water logged yet today.</p>}
          {logs.map(l => (
            <div key={l.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111118] px-3 py-2">
              <p className="text-xs text-white">+{l.amount_ml} ml <span className="text-zinc-500">· {new Date(l.logged_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></p>
              <button type="button" onClick={async () => { await deleteWaterLog(l.id); await load(); }}
                className="text-zinc-600 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
