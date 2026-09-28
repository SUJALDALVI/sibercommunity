"use client";

import { useEffect, useState, useCallback } from "react";
import { ClipboardList, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { fetchWorkoutSessions, createWorkoutSession, deleteWorkoutSession } from "@/lib/gym/workout";
import type { WorkoutSession } from "@/lib/gym/types";

interface Props { communityId: string; userId: string; }

const WORKOUT_TYPES = ["Strength", "Cardio", "HIIT", "Yoga", "Calisthenics", "CrossFit", "Swimming", "Cycling", "General"];

interface ExerciseForm {
  name: string; sets: string; reps: string; weight: string; duration: string; notes: string;
}

const emptyExercise = (): ExerciseForm => ({ name: "", sets: "", reps: "", weight: "", duration: "", notes: "" });

export default function WorkoutLog({ communityId }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: today, type: "Strength", duration: "", notes: "" });
  const [exercises, setExercises] = useState<ExerciseForm[]>([emptyExercise()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setSessions(await fetchWorkoutSessions(communityId, thirtyDaysAgo, today)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setLoading(false); }
  }, [communityId, today, thirtyDaysAgo]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    const validExercises = exercises.filter(e => e.name.trim());
    if (validExercises.length === 0) { setError("Add at least one exercise."); return; }
    setSaving(true); setError("");
    try {
      await createWorkoutSession(
        communityId,
        { session_date: form.date, workout_type: form.type, duration_min: form.duration ? parseInt(form.duration) : null, notes: form.notes || null },
        validExercises.map(e => ({
          exercise_name: e.name,
          sets: e.sets ? parseInt(e.sets) : null,
          reps: e.reps ? parseInt(e.reps) : null,
          weight_kg: e.weight ? parseFloat(e.weight) : null,
          duration_min: e.duration ? parseInt(e.duration) : null,
          notes: e.notes || null,
        }))
      );
      setShowForm(false);
      setForm({ date: today, type: "Strength", duration: "", notes: "" });
      setExercises([emptyExercise()]);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-red-400" />
          <p className="text-sm font-bold text-white">Workout Log</p>
        </div>
        <button type="button" onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25">
          <Plus size={12} /> Log workout
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div className="rounded-2xl border border-white/10 bg-[#111118] p-4 space-y-3">
          <p className="text-xs font-bold text-zinc-300">New Workout</p>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none">
              {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" min="0" placeholder="Duration (min)" value={form.duration}
              onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
            <input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
          </div>

          <p className="text-xs font-semibold text-zinc-400">Exercises</p>
          {exercises.map((ex, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-[#0d0c12] p-3 space-y-2">
              <input placeholder="Exercise name*" value={ex.name} onChange={e => setExercises(arr => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs text-white outline-none" />
              <div className="grid grid-cols-3 gap-1">
                {[["sets","Sets"],["reps","Reps"],["weight","kg"]].map(([key, label]) => (
                  <input key={key} type="number" min="0" placeholder={label}
                    value={ex[key as keyof ExerciseForm]}
                    onChange={e => setExercises(arr => arr.map((x, j) => j === i ? { ...x, [key]: e.target.value } : x))}
                    className="rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs text-white outline-none" />
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <button type="button" onClick={() => setExercises(arr => [...arr, emptyExercise()])}
              className="text-xs text-zinc-400 hover:text-white">+ Add exercise</button>
            {exercises.length > 1 && (
              <button type="button" onClick={() => setExercises(arr => arr.slice(0, -1))}
                className="text-xs text-red-400 hover:text-red-300">- Remove last</button>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleSave()} disabled={saving}
              className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
              {saving ? "Saving…" : "Save workout"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-zinc-400 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sessions list */}
      {loading ? <p className="text-xs text-zinc-500">Loading…</p> : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500">Last 30 days ({sessions.length} sessions)</p>
          {sessions.length === 0 && <p className="text-xs text-zinc-600">No workouts logged yet.</p>}
          {sessions.map(s => (
            <div key={s.id} className="rounded-xl border border-white/10 bg-[#111118] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-white">{s.session_date} · {s.workout_type}</p>
                  <p className="text-[11px] text-zinc-500">{s.exercises.length} exercises{s.duration_min ? ` · ${s.duration_min} min` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    className="text-zinc-500 hover:text-white">
                    {expanded === s.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button type="button" onClick={async () => { if (window.confirm("Delete this workout?")) { await deleteWorkoutSession(s.id); await load(); } }}
                    className="text-zinc-600 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              </div>
              {expanded === s.id && s.exercises.length > 0 && (
                <div className="border-t border-white/10 px-3 pb-3 pt-2 space-y-1">
                  {s.exercises.map(ex => (
                    <div key={ex.id} className="text-[11px] text-zinc-400">
                      <span className="font-semibold text-zinc-200">{ex.exercise_name}</span>
                      {ex.sets ? ` · ${ex.sets} sets` : ""}
                      {ex.reps ? ` × ${ex.reps} reps` : ""}
                      {ex.weight_kg ? ` @ ${ex.weight_kg}kg` : ""}
                      {ex.duration_min ? ` · ${ex.duration_min} min` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
