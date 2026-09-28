"use client";

import { useEffect, useState } from "react";
import { Scale, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { fetchWeightEntries, upsertWeightEntry, deleteWeightEntry } from "@/lib/gym/weight";
import type { WeightEntry } from "@/lib/gym/types";

interface Props { communityId: string; userId: string; }

export default function WeightTracker({ communityId }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: today, value: "", unit: "kg" as "kg" | "lbs", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchWeightEntries(communityId, 90);
      setEntries(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [communityId]);

  const handleSave = async () => {
    const val = parseFloat(form.value);
    if (!val || val <= 0) { setError("Enter a valid weight."); return; }
    setSaving(true); setError("");
    try {
      await upsertWeightEntry(communityId, form.date, val, form.unit, form.notes);
      setForm(f => ({ ...f, value: "", notes: "" }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this entry?")) return;
    try { await deleteWeightEntry(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to delete."); }
  };

  const latest = entries[0];
  const first = entries[entries.length - 1];
  const diff = latest && first && latest.id !== first.id ? latest.weight_value - first.weight_value : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-red-400" />
        <p className="text-sm font-bold text-white">Weight Tracker</p>
      </div>

      {/* Latest reading */}
      {latest && (
        <div className="rounded-2xl border border-white/10 bg-[#111118] p-4">
          <p className="text-xs text-zinc-500">Latest</p>
          <p className="mt-1 text-2xl font-black text-white">{latest.weight_value} <span className="text-sm text-zinc-400">{latest.weight_unit}</span></p>
          <p className="text-xs text-zinc-500">{latest.entry_date}</p>
          {diff !== null && (
            <div className={`mt-2 flex items-center gap-1 text-xs font-semibold ${diff < 0 ? "text-emerald-400" : diff > 0 ? "text-red-400" : "text-zinc-400"}`}>
              {diff < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
              {diff > 0 ? "+" : ""}{diff.toFixed(1)} {latest.weight_unit} since first entry
            </div>
          )}
        </div>
      )}

      {/* Add entry */}
      <div className="rounded-2xl border border-white/10 bg-[#111118] p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-400">Add / update entry</p>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-sm text-white outline-none" />
          <div className="flex gap-1">
            <input type="number" step="0.1" min="0" placeholder="Weight" value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              className="flex-1 rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-sm text-white outline-none" />
            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value as "kg" | "lbs" }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-2 py-2 text-sm text-white outline-none">
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </select>
          </div>
        </div>
        <input type="text" placeholder="Notes (optional)" value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-sm text-white outline-none" />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="button" onClick={() => void handleSave()} disabled={saving}
          className="inline-flex items-center gap-1 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
          <Plus size={13} /> {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* History */}
      {loading ? <p className="text-xs text-zinc-500">Loading…</p> : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500">History ({entries.length})</p>
          {entries.length === 0 && <p className="text-xs text-zinc-600">No entries yet.</p>}
          {entries.map(e => (
            <div key={e.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111118] px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-white">{e.weight_value} {e.weight_unit}</p>
                <p className="text-xs text-zinc-500">{e.entry_date}{e.notes ? ` · ${e.notes}` : ""}</p>
              </div>
              <button type="button" onClick={() => void handleDelete(e.id)} className="text-zinc-600 hover:text-red-400">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
