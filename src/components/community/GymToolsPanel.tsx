"use client";

import { useState, useEffect } from "react";
import { Dumbbell, X, Scale, Utensils, CalendarCheck, Droplets, ClipboardList, BarChart2, Trophy, Users, ChevronRight } from "lucide-react";
import WeightTracker from "./gym/WeightTracker";
import DietTracker from "./gym/DietTracker";
import AttendanceTracker from "./gym/AttendanceTracker";
import WaterTracker from "./gym/WaterTracker";
import WorkoutLog from "./gym/WorkoutLog";
import MyProgress from "./gym/MyProgress";
import MemberReports from "./gym/MemberReports";
import Leaderboard from "./gym/Leaderboard";
import CommunityChallenge from "./gym/CommunityChallenge";
import useAuth from "@/hooks/useAuth";

type Tab = "weight" | "diet" | "attendance" | "water" | "workout" | "progress" | "leaderboard" | "challenges" | "reports";

const MEMBER_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "progress", label: "My Progress", icon: <BarChart2 size={15} /> },
  { id: "attendance", label: "Attendance", icon: <CalendarCheck size={15} /> },
  { id: "workout", label: "Workout Log", icon: <ClipboardList size={15} /> },
  { id: "weight", label: "Weight", icon: <Scale size={15} /> },
  { id: "water", label: "Water", icon: <Droplets size={15} /> },
  { id: "diet", label: "Diet", icon: <Utensils size={15} /> },
];

const COMPETITION_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "leaderboard", label: "Leaderboard", icon: <Trophy size={15} /> },
  { id: "challenges", label: "Challenges", icon: <Dumbbell size={15} /> },
];

const ADMIN_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "reports", label: "Member Reports", icon: <Users size={15} /> },
];

interface Props {
  communityId: string;
  isAdmin: boolean;
  onClose: () => void;
}

export default function GymToolsPanel({ communityId, isAdmin, onClose }: Props) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("progress");

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0d0c12]">
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/15">
            <Dumbbell size={15} className="text-red-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Gym Tools</p>
            <p className="text-xs text-zinc-500">Personal fitness tracker</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white">
          <X size={13} />
        </button>
      </div>

      {/* ── Tab groups ── */}
      <div className="overflow-y-auto border-b border-white/10 px-3 py-3 space-y-3">
        {/* My Fitness */}
        <div>
          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600">My Fitness</p>
          <div className="space-y-0.5">
            {MEMBER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-red-500/15 text-red-300"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
                {activeTab === tab.id && <ChevronRight size={13} />}
              </button>
            ))}
          </div>
        </div>

        {/* Competition */}
        <div>
          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600">Competition</p>
          <div className="space-y-0.5">
            {COMPETITION_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-red-500/15 text-red-300"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
                {activeTab === tab.id && <ChevronRight size={13} />}
              </button>
            ))}
          </div>
        </div>

        {/* Admin only */}
        {isAdmin && (
          <div>
            <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-600">Admin</p>
            <div className="space-y-0.5">
              {ADMIN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? "bg-red-500/15 text-red-300"
                      : "text-zinc-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2">{tab.icon} {tab.label}</span>
                  {activeTab === tab.id && <ChevronRight size={13} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "weight" && <WeightTracker communityId={communityId} userId={user?.id ?? ""} />}
        {activeTab === "diet" && <DietTracker communityId={communityId} userId={user?.id ?? ""} />}
        {activeTab === "attendance" && <AttendanceTracker communityId={communityId} userId={user?.id ?? ""} />}
        {activeTab === "water" && <WaterTracker communityId={communityId} userId={user?.id ?? ""} />}
        {activeTab === "workout" && <WorkoutLog communityId={communityId} userId={user?.id ?? ""} />}
        {activeTab === "progress" && <MyProgress communityId={communityId} userId={user?.id ?? ""} />}
        {activeTab === "leaderboard" && <Leaderboard communityId={communityId} />}
        {activeTab === "challenges" && <CommunityChallenge communityId={communityId} isAdmin={isAdmin} />}
        {activeTab === "reports" && isAdmin && <MemberReports communityId={communityId} />}
      </div>
    </div>
  );
}
