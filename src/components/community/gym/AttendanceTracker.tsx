"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarCheck, CheckCircle2, XCircle, Flame } from "lucide-react";
import { fetchAttendanceRecords, markAttendance, deleteAttendance, computeAttendanceStats } from "@/lib/gym/attendance";
import type { AttendanceRecord } from "@/lib/gym/types";

interface Props { communityId: string; userId: string; }

function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function pad(n: number) { return String(n).padStart(2, "0"); }

export default function AttendanceTracker({ communityId }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = `${year}-${pad(month + 1)}-${pad(now.getDate())}`;
  const fromDate = `${year}-${pad(month + 1)}-01`;
  const toDate = `${year}-${pad(month + 1)}-${pad(daysInMonth(year, month))}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch 6 months back for streak calculation
      const sixMonthsAgo = new Date(year, month - 5, 1).toISOString().split("T")[0];
      const data = await fetchAttendanceRecords(communityId, sixMonthsAgo, toDate);
      setRecords(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setLoading(false); }
  }, [communityId, year, month, toDate]);

  useEffect(() => { void load(); }, [load]);

  const attendedSet = new Set(records.map(r => r.attendance_date));
  const todayAttended = attendedSet.has(today);
  const stats = computeAttendanceStats(records);

  const handleMarkToday = async () => {
    setSaving(true); setError("");
    try {
      await markAttendance(communityId, today, duration ? parseInt(duration) : undefined, notes);
      setDuration(""); setNotes("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm("Remove this attendance record?")) return;
    try { await deleteAttendance(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
  };

  const days = daysInMonth(year, month);
  const firstDow = new Date(year, month, 1).getDay();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarCheck size={16} className="text-red-400" />
        <p className="text-sm font-bold text-white">Gym Attendance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Total Days", val: stats.total_days },
          { label: "This Month", val: stats.this_month },
          { label: "This Week", val: stats.this_week },
          { label: "Current Streak", val: stats.current_streak, icon: <Flame size={12} className="text-amber-400" /> },
        ].map(({ label, val, icon }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#111118] p-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 flex items-center gap-1 text-lg font-bold text-white">{icon}{val}</p>
          </div>
        ))}
      </div>

      {/* Mark today */}
      <div className="rounded-2xl border border-white/10 bg-[#111118] p-3 space-y-2">
        {todayAttended ? (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={15} />
            <p className="text-sm font-semibold">Marked as attended today ✓</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-zinc-400">Mark today as attended</p>
            <div className="flex gap-2">
              <input type="number" min="0" placeholder="Duration (min)" value={duration}
                onChange={e => setDuration(e.target.value)}
                className="w-32 rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
              <input placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
            </div>
            <button type="button" onClick={() => void handleMarkToday()} disabled={saving}
              className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
              {saving ? "Saving…" : "✓ Mark Attended"}
            </button>
          </>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <p className="text-[10px] text-zinc-600">Self-reported — not verified gym entry</p>
      </div>

      {/* Calendar */}
      <div className="rounded-2xl border border-white/10 bg-[#111118] p-3">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
            className="text-zinc-400 hover:text-white">‹</button>
          <p className="text-xs font-bold text-white">{new Date(year, month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
          <button type="button" onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
            className="text-zinc-400 hover:text-white">›</button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
            <div key={d} className="text-[10px] font-bold text-zinc-600 py-1">{d}</div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const dateStr = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
            const attended = attendedSet.has(dateStr);
            const isToday = dateStr === today;
            return (
              <div key={dateStr} className={`rounded-lg py-1.5 text-xs font-semibold ${
                attended ? "bg-emerald-500/25 text-emerald-300" :
                isToday ? "border border-red-500/40 text-white" : "text-zinc-600"
              }`}>
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent records */}
      {loading ? <p className="text-xs text-zinc-500">Loading…</p> : (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-zinc-500">This month records</p>
          {records.filter(r => r.attendance_date >= fromDate && r.attendance_date <= toDate).length === 0 && (
            <p className="text-xs text-zinc-600">No attendance this month.</p>
          )}
          {records.filter(r => r.attendance_date >= fromDate).map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111118] px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-white">{r.attendance_date}</p>
                <p className="text-[11px] text-zinc-500">{r.duration_min ? `${r.duration_min} min` : ""}  {r.notes ?? ""}</p>
              </div>
              <button type="button" onClick={() => void handleRemove(r.id)} className="text-zinc-600 hover:text-red-400">
                <XCircle size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
