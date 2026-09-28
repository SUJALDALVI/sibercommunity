"use client";

import { useEffect, useState } from "react";
import { Dumbbell, Plus, Users, CheckCircle, Clock } from "lucide-react";
import {
  fetchChallenges, createChallenge, publishChallenge, closeChallenge,
  joinChallenge, fetchMyParticipation, fetchChallengeParticipants,
} from "@/lib/gym/competition";
import type { GymChallenge, ChallengeType } from "@/lib/gym/types";
import useAuth from "@/hooks/useAuth";

interface Props { communityId: string; isAdmin: boolean; }

const CHALLENGE_TYPES: { value: ChallengeType; label: string }[] = [
  { value: "attendance", label: "Attend gym N days" },
  { value: "workout_count", label: "Complete N workouts" },
  { value: "streak", label: "Maintain N-day streak" },
  { value: "duration", label: "Log N total minutes" },
  { value: "community", label: "Community-wide attendance" },
];

function ChallengeCard({ challenge, communityId, userId }: { challenge: GymChallenge; communityId: string; userId: string }) {
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState(0);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    void fetchMyParticipation(challenge.id).then(p => setJoined(!!p));
    void fetchChallengeParticipants(challenge.id).then(list => setParticipants(list.length));
  }, [challenge.id, userId]);

  const isClosed = !!challenge.closed_at;
  const isActive = !isClosed && new Date(challenge.start_date) <= new Date() && new Date(challenge.end_date) >= new Date();
  const isUpcoming = new Date(challenge.start_date) > new Date();

  const handleJoin = async () => {
    setJoining(true);
    try { await joinChallenge(challenge.id); setJoined(true); setParticipants(p => p + 1); }
    catch (e) { console.error(e); }
    finally { setJoining(false); }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#111118] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-white">{challenge.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          isClosed ? "bg-zinc-700 text-zinc-400" :
          isActive ? "bg-emerald-500/15 text-emerald-300" :
          isUpcoming ? "bg-amber-500/15 text-amber-300" :
          "bg-zinc-700 text-zinc-400"
        }`}>
          {isClosed ? "Closed" : isActive ? "Active" : isUpcoming ? "Upcoming" : "Ended"}
        </span>
      </div>
      {challenge.description && <p className="text-xs text-zinc-400">{challenge.description}</p>}
      <p className="text-[11px] text-zinc-500">Target: {challenge.target_value} · {challenge.start_date} → {challenge.end_date}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] text-zinc-500">
          <Users size={11} />{participants} participants
        </div>
        {!joined && !isClosed && (
          <button type="button" onClick={() => void handleJoin()} disabled={joining}
            className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-60">
            {joining ? "Joining…" : "Join challenge"}
          </button>
        )}
        {joined && (
          <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={11} /> Joined</span>
        )}
      </div>
    </div>
  );
}

export default function CommunityChallenge({ communityId, isAdmin }: Props) {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<GymChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", desc: "", type: "attendance" as ChallengeType, target: "", start: "", end: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try { setChallenges(await fetchChallenges(communityId)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [communityId]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.target || !form.start || !form.end) { setError("Fill all required fields."); return; }
    setSaving(true); setError("");
    try {
      await createChallenge(communityId, {
        title: form.title.trim(), description: form.desc || null,
        challenge_type: form.type, target_value: parseInt(form.target),
        start_date: form.start, end_date: form.end,
      });
      setShowForm(false);
      setForm({ title: "", desc: "", type: "attendance", target: "", start: "", end: "" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  };

  const active = challenges.filter(c => !c.closed_at && c.is_published && new Date(c.end_date) >= new Date());
  const upcoming = challenges.filter(c => !c.closed_at && c.is_published && new Date(c.start_date) > new Date());
  const closed = challenges.filter(c => !!c.closed_at || new Date(c.end_date) < new Date());
  const drafts = isAdmin ? challenges.filter(c => !c.is_published) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell size={16} className="text-red-400" />
          <p className="text-sm font-bold text-white">Challenges</p>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setShowForm(v => !v)}
            className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25">
            <Plus size={12} /> Create
          </button>
        )}
      </div>

      {/* Admin create form */}
      {showForm && isAdmin && (
        <div className="rounded-2xl border border-white/10 bg-[#111118] p-4 space-y-2">
          <p className="text-xs font-bold text-zinc-300">New Challenge</p>
          <input placeholder="Title*" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
          <textarea placeholder="Description" value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} rows={2}
            className="w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ChallengeType }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none">
              {CHALLENGE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="number" min="1" placeholder="Target value*" value={form.target}
              onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
            <input type="date" placeholder="Start*" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
            <input type="date" placeholder="End*" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void handleCreate()} disabled={saving}
              className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
              {saving ? "Creating…" : "Create (draft)"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-zinc-400">Cancel</button>
          </div>
        </div>
      )}

      {/* Admin drafts */}
      {isAdmin && drafts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500">Drafts</p>
          {drafts.map(c => (
            <div key={c.id} className="rounded-xl border border-dashed border-white/10 bg-[#111118] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-300">{c.title}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={async () => { await publishChallenge(c.id); await load(); }}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300">Publish</button>
                  <button type="button" onClick={async () => { if (window.confirm("Close?")) { await closeChallenge(c.id); await load(); } }}
                    className="text-[11px] text-zinc-500 hover:text-white">Close</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? <p className="text-xs text-zinc-500">Loading…</p> : (
        <>
          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500">Active</p>
              {active.map(c => <ChallengeCard key={c.id} challenge={c} communityId={communityId} userId={user?.id ?? ""} />)}
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1"><Clock size={11} /> Upcoming</p>
              {upcoming.map(c => <ChallengeCard key={c.id} challenge={c} communityId={communityId} userId={user?.id ?? ""} />)}
            </div>
          )}
          {closed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500">Past</p>
              {closed.map(c => <ChallengeCard key={c.id} challenge={c} communityId={communityId} userId={user?.id ?? ""} />)}
            </div>
          )}
          {challenges.filter(c => c.is_published).length === 0 && <p className="text-xs text-zinc-600">No challenges yet.{isAdmin ? " Create one above." : ""}</p>}
        </>
      )}
    </div>
  );
}
