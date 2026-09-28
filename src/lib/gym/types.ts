// ── Shared Gym Tools types ────────────────────────────────────────────────────

export type WeightUnit = "kg" | "lbs";

export type FitnessGoal =
  | "general"
  | "strength"
  | "muscle_gain"
  | "endurance"
  | "weight_management"
  | "custom";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type ChallengeType =
  | "attendance"
  | "workout_count"
  | "streak"
  | "duration"
  | "community";

// ── Gym Profile ───────────────────────────────────────────────────────────────

export interface GymProfile {
  id: string;
  community_id: string;
  user_id: string;
  weight_unit: WeightUnit;
  height_cm: number | null;
  current_weight: number | null;
  target_weight: number | null;
  fitness_goal: FitnessGoal | string;
  daily_water_target_ml: number;
  weekly_workout_target: number;
  daily_calories_target: number | null;
  daily_protein_target: number | null;
  daily_carbs_target: number | null;
  daily_fat_target: number | null;
  competition_opted_in: boolean;
  admin_report_consent: boolean;
  created_at: string;
  updated_at: string;
}

// ── Weight ────────────────────────────────────────────────────────────────────

export interface WeightEntry {
  id: string;
  community_id: string;
  user_id: string;
  entry_date: string;
  weight_value: number;
  weight_unit: WeightUnit;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Diet ──────────────────────────────────────────────────────────────────────

export interface MealLog {
  id: string;
  community_id: string;
  user_id: string;
  log_date: string;
  meal_type: MealType;
  food_name: string;
  serving_size: number;
  serving_unit: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  fdc_id: string | null;
  data_source: string;
  notes: string | null;
  created_at: string;
}

export interface DailyNutritionSummary {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_fiber_g: number;
  meal_count: number;
}

// ── Attendance ────────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  community_id: string;
  user_id: string;
  attendance_date: string;
  duration_min: number | null;
  notes: string | null;
  created_at: string;
}

export interface AttendanceStats {
  total_days: number;
  current_streak: number;
  longest_streak: number;
  this_week: number;
  this_month: number;
}

// ── Water ─────────────────────────────────────────────────────────────────────

export interface WaterLog {
  id: string;
  community_id: string;
  user_id: string;
  log_date: string;
  amount_ml: number;
  logged_at: string;
  notes: string | null;
  created_at: string;
}

// ── Workout ───────────────────────────────────────────────────────────────────

export interface WorkoutExercise {
  id: string;
  session_id: string;
  exercise_name: string;
  sets: number | null;
  reps: number | null;
  weight_kg: number | null;
  duration_min: number | null;
  distance_km: number | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface WorkoutSession {
  id: string;
  community_id: string;
  user_id: string;
  session_date: string;
  workout_type: string;
  duration_min: number | null;
  notes: string | null;
  exercises: WorkoutExercise[];
  created_at: string;
}

// ── Challenges ────────────────────────────────────────────────────────────────

export interface GymChallenge {
  id: string;
  community_id: string;
  created_by: string;
  title: string;
  description: string | null;
  challenge_type: ChallengeType;
  target_value: number;
  start_date: string;
  end_date: string;
  is_published: boolean;
  closed_at: string | null;
  created_at: string;
}

export interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  user_id: string;
  joined_at: string;
  progress: number;
  completed: boolean;
  completed_at: string | null;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  attendance_days: number;
  workout_sessions: number;
  total_points: number;
  rank: number;
}
