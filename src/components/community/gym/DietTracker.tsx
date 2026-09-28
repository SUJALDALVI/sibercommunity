"use client";

import { useEffect, useState, useCallback } from "react";
import { Utensils, Plus, Trash2, Search } from "lucide-react";
import { fetchMealLogs, addMealLog, deleteMealLog, computeDailySummary } from "@/lib/gym/diet";
import type { MealLog, MealType } from "@/lib/gym/types";

interface Props { communityId: string; userId: string; }

interface FoodResult {
  fdc_id: string; name: string; brand: string | null;
  serving_size: number; serving_unit: string;
  calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null;
}

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const QUICK_FOODS = [
  { name: "Banana", serving_size: 118, serving_unit: "g", calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, fiber_g: 3.1 },
  { name: "Chicken Breast (100g)", serving_size: 100, serving_unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0 },
  { name: "Brown Rice (cooked, 100g)", serving_size: 100, serving_unit: "g", calories: 112, protein_g: 2.6, carbs_g: 24, fat_g: 0.9, fiber_g: 1.8 },
  { name: "Egg (1 whole)", serving_size: 50, serving_unit: "g", calories: 72, protein_g: 6.3, carbs_g: 0.4, fat_g: 5, fiber_g: 0 },
  { name: "Whey Protein Shake", serving_size: 30, serving_unit: "g", calories: 120, protein_g: 24, carbs_g: 3, fat_g: 1.5, fiber_g: 0 },
];

export default function DietTracker({ communityId }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [manual, setManual] = useState({ name: "", serving: "100", unit: "g", cal: "", prot: "", carbs: "", fat: "", fiber: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadMeals = useCallback(async () => {
    setLoading(true);
    try { setMeals(await fetchMealLogs(communityId, date)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load."); }
    finally { setLoading(false); }
  }, [communityId, date]);

  useEffect(() => { void loadMeals(); }, [loadMeals]);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true); setSearchError("");
    try {
      const res = await fetch(`/api/gym/food-search?q=${encodeURIComponent(searchQuery)}&pageSize=8`);
      const json = await res.json() as { foods?: FoodResult[]; error?: string };
      if (json.error) { setSearchError(json.error); setSearchResults([]); }
      else setSearchResults(json.foods ?? []);
    } catch { setSearchError("Search failed."); }
    finally { setSearching(false); }
  };

  const addFood = async (food: Partial<FoodResult> & { name: string }) => {
    setSaving(true); setError("");
    try {
      await addMealLog(communityId, {
        log_date: date, meal_type: mealType,
        food_name: food.name, serving_size: food.serving_size ?? 100, serving_unit: food.serving_unit ?? "g",
        calories: food.calories ?? null, protein_g: food.protein_g ?? null,
        carbs_g: food.carbs_g ?? null, fat_g: food.fat_g ?? null, fiber_g: food.fiber_g ?? null,
        fdc_id: (food as FoodResult).fdc_id ?? null,
        data_source: (food as FoodResult).fdc_id ? "usda" : "manual",
      });
      setSearchResults([]); setSearchQuery("");
      setManual({ name: "", serving: "100", unit: "g", cal: "", prot: "", carbs: "", fat: "", fiber: "" });
      await loadMeals();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to add."); }
    finally { setSaving(false); }
  };

  const handleManualAdd = () => {
    if (!manual.name.trim()) { setError("Food name is required."); return; }
    void addFood({
      name: manual.name.trim(), serving_size: parseFloat(manual.serving) || 100, serving_unit: manual.unit,
      calories: manual.cal ? parseFloat(manual.cal) : null,
      protein_g: manual.prot ? parseFloat(manual.prot) : null,
      carbs_g: manual.carbs ? parseFloat(manual.carbs) : null,
      fat_g: manual.fat ? parseFloat(manual.fat) : null,
      fiber_g: manual.fiber ? parseFloat(manual.fiber) : null,
    });
  };

  const summary = computeDailySummary(meals);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Utensils size={16} className="text-red-400" />
          <p className="text-sm font-bold text-white">Diet Tracker</p>
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#111118] px-2 py-1 text-xs text-white outline-none" />
      </div>

      {/* Daily summary */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Calories", val: Math.round(summary.total_calories), unit: "kcal" },
          { label: "Protein", val: summary.total_protein_g.toFixed(1), unit: "g" },
          { label: "Carbs", val: summary.total_carbs_g.toFixed(1), unit: "g" },
          { label: "Fat", val: summary.total_fat_g.toFixed(1), unit: "g" },
        ].map(({ label, val, unit }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#111118] p-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-bold text-white">{val} <span className="text-xs text-zinc-500">{unit}</span></p>
          </div>
        ))}
      </div>

      {/* Meal type selector */}
      <div className="flex gap-1">
        {MEAL_TYPES.map(t => (
          <button key={t} type="button" onClick={() => setMealType(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${mealType === t ? "bg-red-500 text-white" : "border border-white/10 text-zinc-400 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Food search */}
      <div className="rounded-2xl border border-white/10 bg-[#111118] p-3 space-y-2">
        <p className="text-xs font-semibold text-zinc-400">Search food (USDA database)</p>
        <div className="flex gap-2">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") void handleSearch(); }}
            placeholder="e.g. chicken breast, banana…"
            className="flex-1 rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
          <button type="button" onClick={() => void handleSearch()} disabled={searching}
            className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
            <Search size={13} />
          </button>
        </div>
        {searchError && <p className="text-xs text-amber-400">{searchError}</p>}
        {searchResults.map(f => (
          <div key={f.fdc_id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white">{f.name}</p>
              <p className="text-[11px] text-zinc-500">{f.calories ?? "?"} kcal · {f.serving_size}{f.serving_unit} {f.brand ? `· ${f.brand}` : ""}</p>
            </div>
            <button type="button" onClick={() => void addFood(f)} disabled={saving}
              className="ml-2 shrink-0 rounded-full bg-red-500/15 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/30">
              <Plus size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Quick add */}
      <div className="rounded-2xl border border-white/10 bg-[#111118] p-3 space-y-2">
        <p className="text-xs font-semibold text-zinc-400">Quick add</p>
        <div className="flex flex-wrap gap-1">
          {QUICK_FOODS.map(f => (
            <button key={f.name} type="button" onClick={() => void addFood(f)} disabled={saving}
              className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5">
              {f.name}
            </button>
          ))}
        </div>
      </div>

      {/* Manual entry */}
      <div className="rounded-2xl border border-white/10 bg-[#111118] p-3 space-y-2">
        <p className="text-xs font-semibold text-zinc-400">Manual entry</p>
        <input value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))}
          placeholder="Food name*" className="w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: "cal", label: "Calories (kcal)" }, { key: "prot", label: "Protein (g)" },
            { key: "carbs", label: "Carbs (g)" }, { key: "fat", label: "Fat (g)" },
          ].map(({ key, label }) => (
            <input key={key} type="number" min="0" placeholder={label}
              value={manual[key as keyof typeof manual]}
              onChange={e => setManual(m => ({ ...m, [key]: e.target.value }))}
              className="rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-xs text-white outline-none" />
          ))}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button type="button" onClick={handleManualAdd} disabled={saving}
          className="inline-flex items-center gap-1 rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-60">
          <Plus size={12} /> {saving ? "Adding…" : "Add food"}
        </button>
      </div>

      {/* Logged meals */}
      {loading ? <p className="text-xs text-zinc-500">Loading…</p> : (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-zinc-500">Logged today ({meals.length})</p>
          {meals.length === 0 && <p className="text-xs text-zinc-600">Nothing logged yet.</p>}
          {meals.map(m => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#111118] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white capitalize">[{m.meal_type}] {m.food_name}</p>
                <p className="text-[11px] text-zinc-500">{m.calories ?? "?"} kcal · P:{m.protein_g ?? "?"} C:{m.carbs_g ?? "?"} F:{m.fat_g ?? "?"}</p>
              </div>
              <button type="button" onClick={async () => { await deleteMealLog(m.id); await loadMeals(); }}
                className="ml-2 shrink-0 text-zinc-600 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
