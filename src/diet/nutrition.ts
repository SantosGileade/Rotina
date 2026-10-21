export type Per100 = { kcal_100: number; protein_100: number; carbs_100: number; fat_100: number; fiber_100: number | null };
export type Food = Per100 & { id: string; household_id: string | null; name: string; category: string; prep_state: string | null; unit_label: string | null; unit_grams: number | null; source: string };
export type MealItem = Per100 & { food_id: string | null; name: string; grams: number };
export type Totals = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
export type MealCategory = "cafe" | "almoco" | "lanche" | "jantar" | "ceia" | "outros";
export type MealLog = { id: string; log_date: string; log_time: string; category: MealCategory; name: string; items: MealItem[] };
export type SavedMeal = { id: string; name: string; category: MealCategory; items: MealItem[] };
export type Favorite = Per100 & { id: string; food_id: string | null; name: string; grams: number; unit_label: string | null };
export type Goals = { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null };

export const categories: { key: MealCategory; label: string }[] = [
  { key: "cafe", label: "Café da manhã" }, { key: "almoco", label: "Almoço" }, { key: "lanche", label: "Lanche" },
  { key: "jantar", label: "Jantar" }, { key: "ceia", label: "Ceia" }, { key: "outros", label: "Outros" },
];
export const categoryLabel = (key: string) => categories.find(item => item.key === key)?.label ?? "Outros";

export const emptyTotals = (): Totals => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

// nutriente consumido = valor por 100 g x gramas / 100 (precisao total; arredonda so na exibicao)
export const itemTotals = (item: MealItem): Totals => {
  const factor = item.grams / 100;
  return { kcal: item.kcal_100 * factor, protein: item.protein_100 * factor, carbs: item.carbs_100 * factor, fat: item.fat_100 * factor, fiber: (item.fiber_100 ?? 0) * factor };
};
export const sumTotals = (list: Totals[]): Totals => list.reduce((acc, t) => ({ kcal: acc.kcal + t.kcal, protein: acc.protein + t.protein, carbs: acc.carbs + t.carbs, fat: acc.fat + t.fat, fiber: acc.fiber + t.fiber }), emptyTotals());
export const mealTotals = (items: MealItem[]): Totals => sumTotals(items.map(itemTotals));

export const per100FromFood = (food: Per100): Per100 => ({ kcal_100: Number(food.kcal_100), protein_100: Number(food.protein_100), carbs_100: Number(food.carbs_100), fat_100: Number(food.fat_100), fiber_100: food.fiber_100 === null || food.fiber_100 === undefined ? null : Number(food.fiber_100) });
export const itemFromFood = (food: Food, grams: number): MealItem => ({ food_id: food.id, name: food.name, grams, ...per100FromFood(food) });

export const fmt = (value: number, digits = 0) => value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtMacro = (value: number) => fmt(value, value < 10 && value > 0 ? 1 : 0);

// Datas locais como texto YYYY-MM-DD, sem conversao de fuso.
export const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const localTimeKey = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
export const parseDateKey = (key: string) => new Date(`${key}T12:00:00`);
export const shiftDateKey = (key: string, days: number) => { const d = parseDateKey(key); d.setDate(d.getDate() + days); return localDateKey(d); };

export const guessCategory = (date: Date): MealCategory => {
  const hour = date.getHours();
  if (hour < 10) return "cafe";
  if (hour < 14) return "almoco";
  if (hour < 18) return "lanche";
  if (hour < 22) return "jantar";
  return "ceia";
};

export const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim();
export const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));

export const unitText = (label: string, count: number) => `${fmt(count, Number.isInteger(count) ? 0 : 1)} ${count > 1 && !label.includes(" ") ? label + "s" : label}`;
