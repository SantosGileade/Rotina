import { supabase } from "../supabase";
import type { DbPerson } from "../database";
import { type Favorite, type Food, type Goals, type MealCategory, type MealItem, type MealLog, type SavedMeal, per100FromFood } from "./nutrition";

const toItem = (row: any): MealItem => ({ food_id: row.food_id ?? null, name: row.name, grams: Number(row.grams), ...per100FromFood(row) });
const itemPayload = (items: MealItem[]) => items.map(item => ({ food_id: item.food_id, name: item.name, grams: item.grams, kcal_100: item.kcal_100, protein_100: item.protein_100, carbs_100: item.carbs_100, fat_100: item.fat_100, fiber_100: item.fiber_100 }));
const byPosition = (a: any, b: any) => a.position - b.position;
const toLog = (row: any): MealLog => ({ id: row.id, log_date: row.log_date, log_time: String(row.log_time).slice(0, 5), category: row.category, name: row.name, items: (row.diet_meal_log_items || []).slice().sort(byPosition).map(toItem) });
const toFood = (row: any): Food => ({ id: row.id, household_id: row.household_id, name: row.name, category: row.category, prep_state: row.prep_state, unit_label: row.unit_label, unit_grams: row.unit_grams === null ? null : Number(row.unit_grams), source: row.source, ...per100FromFood(row) });

export const isMissingDietSchema = (error: unknown) => {
  const message = (typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : "").toLowerCase();
  return message.includes("schema cache") || message.includes("does not exist") || message.includes("could not find");
};

export async function loadLogs(household: string, person: DbPerson, from: string, to: string): Promise<MealLog[]> {
  const { data, error } = await supabase.from("diet_meal_logs").select("*, diet_meal_log_items(*)").eq("household_id", household).eq("person", person).gte("log_date", from).lte("log_date", to).order("log_date").order("log_time");
  if (error) throw error;
  return (data || []).map(toLog);
}

export async function loadGoals(household: string, person: DbPerson): Promise<Goals> {
  const { data, error } = await supabase.from("diet_goals").select("*").eq("household_id", household).eq("person", person).maybeSingle();
  if (error) throw error;
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return { kcal: num(data?.kcal), protein: num(data?.protein), carbs: num(data?.carbs), fat: num(data?.fat), fiber: num(data?.fiber) };
}

export async function saveGoals(household: string, person: DbPerson, goals: Goals) {
  const { error } = await supabase.from("diet_goals").upsert({ household_id: household, person, ...goals, updated_at: new Date().toISOString() }, { onConflict: "household_id,person" });
  if (error) throw error;
}

export async function searchFoods(query: string): Promise<Food[]> {
  const term = query.trim().replace(/[%,()]/g, " ");
  let request = supabase.from("foods").select("*").order("name").limit(40);
  if (term) request = request.ilike("name", `%${term}%`);
  const { data, error } = await request;
  if (error) throw error;
  return (data || []).map(toFood);
}

export async function createFood(household: string, food: Omit<Food, "id" | "household_id" | "source">): Promise<Food> {
  const { data, error } = await supabase.from("foods").insert({ household_id: household, source: "Cadastro manual", ...food }).select("*").single();
  if (error) throw error;
  return toFood(data);
}

export async function updateFood(id: string, food: Omit<Food, "id" | "household_id" | "source">): Promise<Food> {
  const { data, error } = await supabase.from("foods").update(food).eq("id", id).select("*").single();
  if (error) throw error;
  return toFood(data);
}

export async function deleteFood(id: string) {
  const { error } = await supabase.from("foods").delete().eq("id", id);
  if (error) throw error;
}

export async function loadFavorites(household: string, person: DbPerson): Promise<Favorite[]> {
  const { data, error } = await supabase.from("diet_favorites").select("*").eq("household_id", household).eq("person", person).order("name");
  if (error) throw error;
  return (data || []).map(row => ({ id: row.id, food_id: row.food_id, name: row.name, grams: Number(row.grams), unit_label: row.unit_label, ...per100FromFood(row) }));
}

export async function addFavorite(household: string, person: DbPerson, item: MealItem, unitLabel: string | null) {
  const { error } = await supabase.from("diet_favorites").insert({ household_id: household, person, food_id: item.food_id, name: item.name, grams: item.grams, unit_label: unitLabel, kcal_100: item.kcal_100, protein_100: item.protein_100, carbs_100: item.carbs_100, fat_100: item.fat_100, fiber_100: item.fiber_100 });
  if (error) throw error;
}

export async function deleteFavorite(id: string) {
  const { error } = await supabase.from("diet_favorites").delete().eq("id", id);
  if (error) throw error;
}

export async function loadSavedMeals(household: string, person: DbPerson): Promise<SavedMeal[]> {
  const { data, error } = await supabase.from("diet_saved_meals").select("*, diet_saved_meal_items(*)").eq("household_id", household).eq("person", person).order("name");
  if (error) throw error;
  return (data || []).map(row => ({ id: row.id, name: row.name, category: row.category as MealCategory, items: (row.diet_saved_meal_items || []).slice().sort(byPosition).map(toItem) }));
}

export async function saveMeal(household: string, person: DbPerson, id: string | null, name: string, category: MealCategory, items: MealItem[]) {
  const { error } = await supabase.rpc("diet_save_meal", { p_id: id, p_household: household, p_person: person, p_name: name, p_category: category, p_items: itemPayload(items) });
  if (error) throw error;
}

export async function deleteSavedMeal(id: string) {
  const { error } = await supabase.from("diet_saved_meals").delete().eq("id", id);
  if (error) throw error;
}

export async function createLog(household: string, person: DbPerson, requestId: string, date: string, time: string, category: MealCategory, name: string, items: MealItem[]) {
  const { error } = await supabase.rpc("diet_create_meal_log", { p_household: household, p_person: person, p_request: requestId, p_date: date, p_time: time, p_category: category, p_name: name, p_items: itemPayload(items) });
  if (error) throw error;
}

export async function updateLog(id: string, date: string, time: string, category: MealCategory, name: string, items: MealItem[]) {
  const { error } = await supabase.rpc("diet_update_meal_log", { p_log: id, p_date: date, p_time: time, p_category: category, p_name: name, p_items: itemPayload(items) });
  if (error) throw error;
}

export async function deleteLog(id: string) {
  const { error } = await supabase.from("diet_meal_logs").delete().eq("id", id);
  if (error) throw error;
}
