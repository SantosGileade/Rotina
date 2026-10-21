import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DbPerson } from "../database";
import { addFavorite, createFood, createLog, deleteFavorite, deleteFood, deleteLog, deleteSavedMeal, isMissingDietSchema, loadFavorites, loadGoals, loadLogs, loadSavedMeals, saveGoals, saveMeal, searchFoods, updateFood, updateLog } from "./dietApi";
import { type Favorite, type Food, type Goals, type MealCategory, type MealItem, type MealLog, type SavedMeal, categories, categoryLabel, fmt, fmtMacro, guessCategory, itemFromFood, itemTotals, localDateKey, localTimeKey, mealTotals, newRequestId, unitText, parseDateKey, shiftDateKey, sumTotals } from "./nutrition";

type Props = { householdId: string; person: DbPerson; notify: (message: string) => void; showError: (error: unknown) => void };
type Editor = { mode: "log-new" | "log-edit" | "saved-new" | "saved-edit"; id: string | null; requestId: string; date: string; time: string; category: MealCategory; name: string; items: MealItem[] };
type Cache = { logs: MealLog[]; goals: Goals; favorites: Favorite[]; saved: SavedMeal[] };

const noGoals: Goals = { kcal: null, protein: null, carbs: null, fat: null, fiber: null };
const cacheKey = (person: DbPerson) => `gym-diet-cache-${person}`;
const num = (value: string) => { const parsed = Number(value.replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; };
const pct = (value: number, goal: number | null) => (goal && goal > 0 ? Math.min(100, (value / goal) * 100) : 0);

function Sheet({ title, eyebrow, onClose, footer, children }: { title: string; eyebrow?: string; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  return createPortal(
    <div className="modal"><div className="sheet workout-editor diet-sheet"><button className="sheet-close" onClick={onClose} aria-label="Fechar">×</button>
      <div className="workout-editor-scroll">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{children}</div>{footer}</div></div>,
    document.body,
  );
}

export default function Dieta({ householdId, person, notify: notifyProp, showError: showErrorProp }: Props) {
  const callbacks = useRef({ notify: notifyProp, showError: showErrorProp });
  callbacks.current = { notify: notifyProp, showError: showErrorProp };
  const notify = useCallback((message: string) => callbacks.current.notify(message), []);
  const showError = useCallback((error: unknown) => callbacks.current.showError(error), []);
  const [today, setToday] = useState(() => localDateKey(new Date()));
  const [date, setDate] = useState(today);
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [goals, setGoals] = useState<Goals>(noGoals);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [saved, setSaved] = useState<SavedMeal[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "offline" | "missing">("loading");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [picker, setPicker] = useState(false);
  const [sheet, setSheet] = useState<null | "goals" | "favorites" | "saved">(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadId = useRef(0);
  const busyLock = useRef(false);

  useEffect(() => { const timer = window.setInterval(() => setToday(localDateKey(new Date())), 60_000); return () => window.clearInterval(timer); }, []);

  const reload = useCallback(async () => {
    const id = ++loadId.current;
    try {
      const [dayLogs, nextGoals, nextFavorites, nextSaved] = await Promise.all([loadLogs(householdId, person, shiftDateKey(date, -6), date), loadGoals(householdId, person), loadFavorites(householdId, person), loadSavedMeals(householdId, person)]);
      if (id !== loadId.current) return;
      setLogs(dayLogs); setGoals(nextGoals); setFavorites(nextFavorites); setSaved(nextSaved); setState("ready");
      try { localStorage.setItem(cacheKey(person), JSON.stringify({ logs: dayLogs, goals: nextGoals, favorites: nextFavorites, saved: nextSaved } satisfies Cache)); } catch { /* cache opcional */ }
    } catch (error) {
      if (id !== loadId.current) return;
      if (isMissingDietSchema(error)) { setState("missing"); return; }
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey(person)) || "null") as Cache | null;
        if (cached) { setLogs(cached.logs.filter(log => log.log_date >= shiftDateKey(date, -6) && log.log_date <= date)); setGoals(cached.goals); setFavorites(cached.favorites); setSaved(cached.saved); setState("offline"); return; }
      } catch { /* sem cache */ }
      setState("offline"); showError(error);
    }
  }, [householdId, person, date, showError]);

  useEffect(() => { setState("loading"); void reload(); }, [reload]);

  const dayLogs = useMemo(() => logs.filter(log => log.log_date === date), [logs, date]);
  const dayTotals = useMemo(() => sumTotals(dayLogs.map(log => mealTotals(log.items))), [dayLogs]);
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => { const key = shiftDateKey(date, index - 6); const list = logs.filter(log => log.log_date === key); return { key, count: list.length, totals: sumTotals(list.map(log => mealTotals(log.items))) }; }), [logs, date]);
  const weekWithLogs = week.filter(day => day.count > 0);
  const weekAverage = weekWithLogs.length ? sumTotals(weekWithLogs.map(day => day.totals)).kcal / weekWithLogs.length : 0;

  const openLogEditor = (items: MealItem[], category?: MealCategory, extra?: Partial<Editor>) => {
    const now = new Date();
    setEditor({ mode: "log-new", id: null, requestId: newRequestId(), date, time: localTimeKey(now), category: category ?? guessCategory(now), name: "", items, ...extra });
  };

  const run = async (action: () => Promise<void>, success?: string) => {
    if (busyLock.current) return false;
    busyLock.current = true;
    setBusy(true);
    try { await action(); if (success) notify(success); await reload(); return true; }
    catch (error) { showError(error); return false; }
    finally { busyLock.current = false; setBusy(false); }
  };

  const saveEditor = async () => {
    if (!editor || editor.items.length === 0 || editor.items.some(item => !(item.grams > 0))) return;
    const name = editor.name.trim();
    if (editor.mode === "saved-new" || editor.mode === "saved-edit") {
      if (!name) { notify("Dê um nome para a refeição salva."); return; }
      if (await run(() => saveMeal(householdId, person, editor.id, name, editor.category, editor.items), "Refeição salva!")) setEditor(null);
      return;
    }
    const ok = await run(() => editor.mode === "log-edit" && editor.id ? updateLog(editor.id, editor.date, editor.time, editor.category, name, editor.items) : createLog(householdId, person, editor.requestId, editor.date, editor.time, editor.category, name, editor.items), "Refeição registrada!");
    if (ok) { setEditor(null); if (editor.date !== date) setDate(editor.date); }
  };

  const addSavedToDay = (meal: SavedMeal) => {
    const now = new Date();
    void run(() => createLog(householdId, person, newRequestId(), date, localTimeKey(now), meal.category, meal.name, meal.items), `${meal.name} adicionado!`);
  };
  const repeatLog = (log: MealLog) => {
    const now = new Date();
    void run(() => createLog(householdId, person, newRequestId(), today, localTimeKey(now), log.category, log.name, log.items), "Copiado para hoje!").then(ok => { if (ok && date !== today) setDate(today); });
  };
  const removeLog = (log: MealLog) => { if (window.confirm("Excluir este registro?")) void run(() => deleteLog(log.id), "Registro excluído."); };

  const dateLabel = date === today ? "Hoje" : date === shiftDateKey(today, -1) ? "Ontem" : new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(parseDateKey(date));
  const goalLeft = goals.kcal !== null ? goals.kcal - dayTotals.kcal : null;

  if (state === "missing") return <section className="coming-soon"><span className="icon-badge">🥗</span><h1>Ative a Dieta no banco</h1><p>As tabelas da Dieta ainda não existem no Supabase. Rode o arquivo supabase/migrations/202610210001_diet.sql no SQL Editor e recarregue o app.</p></section>;

  return <>
    <div className="page-head workout-page-head"><p className="eyebrow">DIETA</p><h1>Dieta de {person === "gileade" ? "Gileade" : "Renata"}</h1>{state === "offline" && <p>Sem conexão: mostrando os últimos dados salvos. Para registrar, conecte-se.</p>}</div>

    <div className="diet-date"><button onClick={() => setDate(shiftDateKey(date, -1))} aria-label="Dia anterior">‹</button><label><span>{dateLabel}</span><input type="date" value={date} max={today} onChange={event => event.target.value && setDate(event.target.value)} /></label><button onClick={() => setDate(shiftDateKey(date, 1))} disabled={date >= today} aria-label="Próximo dia">›</button></div>

    <article className="diet-summary">
      <div className="diet-kcal"><div><small>CALORIAS</small><b>{fmt(dayTotals.kcal)}<em>{goals.kcal !== null ? ` / ${fmt(goals.kcal)} kcal` : " kcal"}</em></b></div>{goalLeft !== null && <span className={goalLeft < 0 ? "over" : ""}>{goalLeft >= 0 ? `${fmt(goalLeft)} restantes` : `${fmt(-goalLeft)} acima`}</span>}</div>
      {goals.kcal !== null && <div className="progress"><i className={goalLeft !== null && goalLeft < 0 ? "orange" : ""} style={{ width: `${pct(dayTotals.kcal, goals.kcal)}%` }} /></div>}
      <div className="diet-macros">{([["Proteínas", dayTotals.protein, goals.protein, "blue"], ["Carboidratos", dayTotals.carbs, goals.carbs, "green"], ["Gorduras", dayTotals.fat, goals.fat, "orange"]] as const).map(([label, value, goal, color]) => <div key={label}><small>{label}</small><b>{fmtMacro(value)}{goal !== null ? ` / ${fmt(goal)}` : ""} g</b><div className="progress"><i className={color} style={{ width: `${pct(value, goal)}%` }} /></div></div>)}</div>
      {goals.fiber !== null && <p className="diet-fiber">Fibras: {fmtMacro(dayTotals.fiber)} / {fmt(goals.fiber)} g</p>}
      <button className="diet-link" onClick={() => setSheet("goals")}>{goals.kcal === null && goals.protein === null && goals.carbs === null && goals.fat === null ? "Definir metas" : "Editar metas"}</button>
    </article>

    <div className="diet-actions">
      <button onClick={() => { openLogEditor([]); setPicker(true); }}><span>＋</span>Adicionar alimento</button>
      <button onClick={() => setSheet("favorites")}><span>★</span>Favoritos</button>
      <button onClick={() => setSheet("saved")}><span>🍽</span>Refeições salvas</button>
    </div>

    <div className="section-title"><div><p>{dateLabel.toLocaleUpperCase("pt-BR")}</p><h2>Refeições</h2></div></div>
    {state === "loading" ? <div className="empty-workout">Carregando…</div> : categories.map(category => {
      const list = dayLogs.filter(log => log.category === category.key);
      const total = sumTotals(list.map(log => mealTotals(log.items)));
      return <section className="diet-category" key={category.key}>
        <header><b>{category.label}</b><span>{list.length ? `${fmt(total.kcal)} kcal` : ""}</span><button onClick={() => openLogEditor([], category.key)} aria-label={`Adicionar em ${category.label}`}>＋</button></header>
        {list.map(log => { const t = mealTotals(log.items); return <article className="diet-log" key={log.id}>
          <button className="diet-log-main" onClick={() => setExpanded(expanded === log.id ? null : log.id)}><span><b>{log.name || log.items.map(item => item.name).join(", ")}</b><small>{log.log_time} · P {fmtMacro(t.protein)} · C {fmtMacro(t.carbs)} · G {fmtMacro(t.fat)}</small></span><em>{fmt(t.kcal)} kcal</em></button>
          {expanded === log.id && <div className="diet-log-detail">{log.items.map((item, index) => <p key={index}><span>{item.name}</span><b>{fmt(item.grams)} g · {fmt(itemTotals(item).kcal)} kcal</b></p>)}<div className="diet-log-actions"><button onClick={() => setEditor({ mode: "log-edit", id: log.id, requestId: "", date: log.log_date, time: log.log_time, category: log.category, name: log.name, items: log.items.map(item => ({ ...item })) })}>Editar</button><button onClick={() => repeatLog(log)}>{log.log_date === today ? "Duplicar" : "Copiar para hoje"}</button><button className="danger" onClick={() => removeLog(log)}>Excluir</button></div></div>}
        </article>; })}
      </section>;
    })}

    <div className="section-title"><div><p>ÚLTIMOS 7 DIAS</p><h2>Semana</h2></div>{weekWithLogs.length > 0 && <span>média {fmt(weekAverage)} kcal</span>}</div>
    <div className="diet-week">{week.map(day => <button key={day.key} className={day.key === date ? "selected" : ""} onClick={() => setDate(day.key)}><small>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(parseDateKey(day.key)).replace(".", "")}</small><b>{day.count ? fmt(day.totals.kcal) : "—"}</b></button>)}</div>
    <p className="diet-note">Valores nutricionais são estimativas. Confira quantidades, preparo e marcas.</p>

    {editor && <MealEditor editor={editor} setEditor={setEditor} busy={busy} onAddFood={() => setPicker(true)} onSave={saveEditor} onSaveAsMeal={() => { const name = editor.name.trim() || categoryLabel(editor.category); void run(() => saveMeal(householdId, person, null, name, editor.category, editor.items), "Refeição salva para reutilizar!"); }} onClose={() => setEditor(null)} />}
    {picker && <FoodPicker householdId={householdId} person={person} showError={showError} notify={notify} onClose={() => setPicker(false)} onPick={(item) => { setEditor(current => current ? { ...current, items: [...current.items, item] } : current); setPicker(false); }} onFavoritesChanged={reload} />}
    {sheet === "goals" && <GoalsSheet goals={goals} busy={busy} onClose={() => setSheet(null)} onSave={next => void run(() => saveGoals(householdId, person, next), "Metas salvas!").then(ok => ok && setSheet(null))} />}
    {sheet === "favorites" && <Sheet title="Favoritos" eyebrow="ALIMENTOS FREQUENTES" onClose={() => setSheet(null)}>
      {favorites.length === 0 ? <div className="empty-workout">Nenhum favorito ainda. Ao adicionar um alimento, toque em “Salvar como favorito”.</div> : <div className="diet-list">{favorites.map(fav => { const item: MealItem = { food_id: fav.food_id, name: fav.name, grams: fav.grams, kcal_100: fav.kcal_100, protein_100: fav.protein_100, carbs_100: fav.carbs_100, fat_100: fav.fat_100, fiber_100: fav.fiber_100 }; return <article key={fav.id}><button className="diet-list-main" onClick={() => { setSheet(null); openLogEditor([item]); }}><span><b>{fav.name}</b><small>{fav.unit_label ? `${fav.unit_label} · ` : ""}{fmt(fav.grams)} g</small></span><em>{fmt(itemTotals(item).kcal)} kcal</em></button><button className="diet-x" aria-label={`Remover ${fav.name}`} onClick={() => { if (window.confirm(`Remover ${fav.name} dos favoritos?`)) void run(() => deleteFavorite(fav.id)); }}>×</button></article>; })}</div>}
    </Sheet>}
    {sheet === "saved" && <Sheet title="Refeições salvas" eyebrow="REGISTRO COM UM TOQUE" onClose={() => setSheet(null)} footer={<button className="primary" onClick={() => { setSheet(null); const now = new Date(); setEditor({ mode: "saved-new", id: null, requestId: "", date, time: localTimeKey(now), category: guessCategory(now), name: "", items: [] }); }}>Criar refeição salva</button>}>
      {saved.length === 0 ? <div className="empty-workout">Nenhuma refeição salva. Crie uma ou use “Salvar como refeição salva” ao registrar.</div> : <div className="diet-list">{saved.map(meal => { const t = mealTotals(meal.items); return <article key={meal.id} className="saved"><div className="diet-saved-head"><span><b>{meal.name}</b><small>{categoryLabel(meal.category)} · {fmt(t.kcal)} kcal · P {fmtMacro(t.protein)} · C {fmtMacro(t.carbs)} · G {fmtMacro(t.fat)}</small></span><button className="diet-add" disabled={busy} onClick={() => { setSheet(null); addSavedToDay(meal); }}>Adicionar</button></div><p>{meal.items.map(item => `${item.name} ${fmt(item.grams)} g`).join(" · ")}</p><div className="diet-log-actions"><button onClick={() => { setSheet(null); setEditor({ mode: "saved-edit", id: meal.id, requestId: "", date, time: localTimeKey(new Date()), category: meal.category, name: meal.name, items: meal.items.map(item => ({ ...item })) }); }}>Editar</button><button onClick={() => void run(() => saveMeal(householdId, person, null, `${meal.name} (cópia)`, meal.category, meal.items), "Refeição duplicada.")}>Duplicar</button><button className="danger" onClick={() => { if (window.confirm(`Excluir a refeição salva “${meal.name}”?`)) void run(() => deleteSavedMeal(meal.id)); }}>Excluir</button></div></article>; })}</div>}
    </Sheet>}
  </>;
}

function MealEditor({ editor, setEditor, busy, onAddFood, onSave, onSaveAsMeal, onClose }: { editor: Editor; setEditor: (value: Editor | null) => void; busy: boolean; onAddFood: () => void; onSave: () => void; onSaveAsMeal: () => void; onClose: () => void }) {
  const isSaved = editor.mode.startsWith("saved");
  const totals = mealTotals(editor.items);
  const invalid = editor.items.length === 0 || editor.items.some(item => !(item.grams > 0));
  const patch = (value: Partial<Editor>) => setEditor({ ...editor, ...value });
  const title = editor.mode === "log-edit" ? "Editar refeição" : editor.mode === "log-new" ? "Nova refeição" : editor.mode === "saved-edit" ? "Editar refeição salva" : "Nova refeição salva";
  return <Sheet title={title} eyebrow={isSaved ? "REFEIÇÃO SALVA" : "REGISTRO"} onClose={onClose} footer={<button className="primary" disabled={busy || invalid} onClick={onSave}>{isSaved ? "Salvar refeição" : editor.mode === "log-edit" ? "Salvar alterações" : "Registrar refeição"}</button>}>
    <label>{isSaved ? "Nome da refeição" : "Nome (opcional)"}<input value={editor.name} maxLength={80} placeholder={isSaved ? "Ex.: Almoço padrão" : "Ex.: Almoço na empresa"} onChange={event => patch({ name: event.target.value })} /></label>
    <label>Categoria<select value={editor.category} onChange={event => patch({ category: event.target.value as MealCategory })}>{categories.map(category => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label>
    {!isSaved && <div className="diet-when"><label>Data<input type="date" value={editor.date} onChange={event => event.target.value && patch({ date: event.target.value })} /></label><label>Horário<input type="time" value={editor.time} onChange={event => event.target.value && patch({ time: event.target.value })} /></label></div>}
    <div className="diet-items">{editor.items.length === 0 && <div className="empty-workout">Nenhum alimento adicionado.</div>}{editor.items.map((item, index) => <article key={index}><span><b>{item.name}</b><small>{fmt(itemTotals(item).kcal)} kcal · P {fmtMacro(itemTotals(item).protein)} · C {fmtMacro(itemTotals(item).carbs)} · G {fmtMacro(itemTotals(item).fat)}</small></span><label className="grams"><input type="number" inputMode="decimal" min="1" step="any" value={item.grams || ""} aria-label={`Gramas de ${item.name}`} onChange={event => patch({ items: editor.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, grams: num(event.target.value) } : entry) })} /><i>g</i></label><button className="diet-x" aria-label={`Remover ${item.name}`} onClick={() => patch({ items: editor.items.filter((_, entryIndex) => entryIndex !== index) })}>×</button></article>)}</div>
    <button className="outline-add" onClick={onAddFood}>＋ Adicionar alimento</button>
    <div className="diet-editor-total"><b>{fmt(totals.kcal)} kcal</b><span>P {fmtMacro(totals.protein)} g · C {fmtMacro(totals.carbs)} g · G {fmtMacro(totals.fat)} g</span></div>
    {!isSaved && <button className="outline-add" disabled={busy || invalid} onClick={onSaveAsMeal}>⧉ Salvar como refeição salva</button>}
  </Sheet>;
}

function FoodPicker({ householdId, person, showError, notify, onClose, onPick, onFavoritesChanged }: { householdId: string; person: DbPerson; showError: (error: unknown) => void; notify: (message: string) => void; onClose: () => void; onPick: (item: MealItem) => void; onFavoritesChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const [favorite, setFavorite] = useState(false);
  const [form, setForm] = useState<{ food: Food | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => { searchFoods(query).then(result => { if (!cancelled) setFoods(result); }).catch(showError).finally(() => { if (!cancelled) setLoading(false); }); }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, version, showError]);

  const choose = (food: Food) => { setSelected(food); setGrams(String(food.unit_grams ?? 100)); setFavorite(false); };
  const confirm = async () => {
    if (!selected) return;
    const amount = num(grams);
    if (!(amount > 0)) return;
    const item = itemFromFood(selected, amount);
    if (favorite) {
      setSaving(true);
      try { await addFavorite(householdId, person, item, selected.unit_label && selected.unit_grams && amount % selected.unit_grams === 0 ? unitText(selected.unit_label, amount / selected.unit_grams) : null); onFavoritesChanged(); notify("Adicionado aos favoritos."); }
      catch (error) { showError(error); setSaving(false); return; }
      setSaving(false);
    }
    onPick(item);
  };
  const removeFood = async (food: Food) => {
    if (!window.confirm(`Excluir “${food.name}” do seu catálogo? Registros antigos não mudam.`)) return;
    try { await deleteFood(food.id); setVersion(value => value + 1); } catch (error) { showError(error); }
  };

  if (form) return <FoodForm food={form.food} householdId={householdId} showError={showError} onClose={() => setForm(null)} onSaved={food => { setForm(null); setVersion(value => value + 1); choose(food); }} />;
  if (selected) {
    const amount = num(grams);
    const preview = itemTotals(itemFromFood(selected, amount > 0 ? amount : 0));
    return <Sheet title={selected.name} eyebrow="QUANTIDADE" onClose={() => setSelected(null)} footer={<button className="primary" disabled={saving || !(amount > 0)} onClick={() => void confirm()}>Adicionar à refeição</button>}>
      <p className="diet-note">{fmt(selected.kcal_100)} kcal · P {fmtMacro(selected.protein_100)} · C {fmtMacro(selected.carbs_100)} · G {fmtMacro(selected.fat_100)} por 100 g{selected.prep_state ? ` (${selected.prep_state})` : ""}. Fonte: {selected.source}.</p>
      <label>Quantidade em gramas<input type="number" inputMode="decimal" min="1" step="any" value={grams} onChange={event => setGrams(event.target.value)} autoFocus /></label>
      {selected.unit_grams && selected.unit_label && <div className="diet-chips">{[1, 2, 3].map(multiple => <button key={multiple} onClick={() => setGrams(String(selected.unit_grams! * multiple))}>{unitText(selected.unit_label ?? "", multiple)} ({fmt(selected.unit_grams! * multiple)} g)</button>)}</div>}
      <div className="diet-editor-total"><b>{fmt(preview.kcal)} kcal</b><span>P {fmtMacro(preview.protein)} g · C {fmtMacro(preview.carbs)} g · G {fmtMacro(preview.fat)} g</span></div>
      <button className={`diet-toggle ${favorite ? "on" : ""}`} onClick={() => setFavorite(value => !value)}>{favorite ? "★ Será salvo nos favoritos" : "☆ Salvar como favorito"}</button>
    </Sheet>;
  }
  return <Sheet title="Adicionar alimento" eyebrow="BUSCAR NA BASE" onClose={onClose} footer={<button className="primary" onClick={() => setForm({ food: null })}>Cadastrar novo alimento</button>}>
    <input className="diet-search" type="search" placeholder="Buscar: arroz, ovo, banana…" value={query} onChange={event => setQuery(event.target.value)} autoFocus />
    {loading && foods.length === 0 ? <div className="empty-workout">Buscando…</div> : foods.length === 0 ? <div className="empty-workout">Nenhum alimento encontrado. Cadastre um novo abaixo.</div> : <div className="diet-list">{foods.map(food => <article key={food.id}><button className="diet-list-main" onClick={() => choose(food)}><span><b>{food.name}</b><small>{food.category}{food.prep_state ? ` · ${food.prep_state}` : ""} · {food.household_id ? "seu cadastro" : "base inicial"}</small></span><em>{fmt(food.kcal_100)} kcal/100 g</em></button>{food.household_id && <><button className="diet-x edit" aria-label={`Editar ${food.name}`} onClick={() => setForm({ food })}>✎</button><button className="diet-x" aria-label={`Excluir ${food.name}`} onClick={() => void removeFood(food)}>×</button></>}</article>)}</div>}
    <p className="diet-note">Base inicial com valores aproximados (ref. TACO). Confira antes de depender deles.</p>
  </Sheet>;
}

function FoodForm({ food, householdId, showError, onClose, onSaved }: { food: Food | null; householdId: string; showError: (error: unknown) => void; onClose: () => void; onSaved: (food: Food) => void }) {
  const [name, setName] = useState(food?.name ?? "");
  const [category, setCategory] = useState(food?.category ?? "Outros");
  const [prep, setPrep] = useState(food?.prep_state ?? "");
  const [values, setValues] = useState({ kcal: String(food?.kcal_100 ?? ""), protein: String(food?.protein_100 ?? ""), carbs: String(food?.carbs_100 ?? ""), fat: String(food?.fat_100 ?? ""), fiber: food?.fiber_100 === null || food?.fiber_100 === undefined ? "" : String(food.fiber_100) });
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0 && [values.kcal, values.protein, values.carbs, values.fat].every(value => value.trim() !== "" && num(value) >= 0);
  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const payload = { name: name.trim(), category: category.trim() || "Outros", prep_state: prep.trim() || null, kcal_100: num(values.kcal), protein_100: num(values.protein), carbs_100: num(values.carbs), fat_100: num(values.fat), fiber_100: values.fiber.trim() === "" ? null : num(values.fiber), unit_label: food?.unit_label ?? null, unit_grams: food?.unit_grams ?? null };
    try { onSaved(food ? await updateFood(food.id, payload) : await createFood(householdId, payload)); }
    catch (error) { showError(error); setSaving(false); }
  };
  const field = (key: keyof typeof values, label: string) => <label>{label}<input type="number" inputMode="decimal" min="0" step="any" value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>;
  return <Sheet title={food ? "Editar alimento" : "Novo alimento"} eyebrow="VALORES POR 100 G" onClose={onClose} footer={<button className="primary" disabled={!valid || saving} onClick={() => void submit()}>Salvar alimento</button>}>
    <label>Nome<input value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="Ex.: Arroz branco cozido" /></label>
    <div className="diet-when"><label>Categoria<input value={category} onChange={event => setCategory(event.target.value)} /></label><label>Preparo<input value={prep} onChange={event => setPrep(event.target.value)} placeholder="cru, cozido…" /></label></div>
    <div className="diet-when">{field("kcal", "Calorias (kcal)")}{field("protein", "Proteínas (g)")}</div>
    <div className="diet-when">{field("carbs", "Carboidratos (g)")}{field("fat", "Gorduras (g)")}</div>
    {field("fiber", "Fibras (g, opcional)")}
    <p className="diet-note">Use os valores do rótulo ou da TACO, sempre por 100 g e para o mesmo estado de preparo (cru e cozido são diferentes).</p>
  </Sheet>;
}

function GoalsSheet({ goals, busy, onClose, onSave }: { goals: Goals; busy: boolean; onClose: () => void; onSave: (goals: Goals) => void }) {
  const [values, setValues] = useState({ kcal: goals.kcal?.toString() ?? "", protein: goals.protein?.toString() ?? "", carbs: goals.carbs?.toString() ?? "", fat: goals.fat?.toString() ?? "", fiber: goals.fiber?.toString() ?? "" });
  const parse = (value: string) => (value.trim() === "" ? null : Math.max(0, num(value)));
  const field = (key: keyof typeof values, label: string) => <label>{label}<input type="number" inputMode="decimal" min="0" step="any" value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })} placeholder="sem meta" /></label>;
  return <Sheet title="Metas diárias" eyebrow="SOMENTE ACOMPANHAMENTO" onClose={onClose} footer={<button className="primary" disabled={busy} onClick={() => onSave({ kcal: parse(values.kcal), protein: parse(values.protein), carbs: parse(values.carbs), fat: parse(values.fat), fiber: parse(values.fiber) })}>Salvar metas</button>}>
    <p className="editor-intro">Cada pessoa tem suas próprias metas. Deixe em branco o que não quiser acompanhar. São referências pessoais, não prescrição; defina com orientação profissional se necessário.</p>
    {field("kcal", "Calorias (kcal)")}{field("protein", "Proteínas (g)")}{field("carbs", "Carboidratos (g)")}{field("fat", "Gorduras (g)")}{field("fiber", "Fibras (g, opcional)")}
  </Sheet>;
}
