"use client";

import { useEffect, useRef, useState } from "react";
import { ensureAnonymousSession, supabaseConfigured } from "./supabase";
import Dieta from "./diet/Dieta";
import { currentHousehold, finishWorkout, finishWorkoutForDate, loadRotina, pairHousehold, saveClasses, saveDaySwaps, saveWorkoutPlan, updateExerciseWeight } from "./database";

type Person = "gileade" | "renata";
type WorkoutExercise = { id: string; name: string; sets: number; reps: string; muscle: string; weight: number };
type WorkoutDay = { title: string; muscles: string; duration: number; exercises: WorkoutExercise[] };
type WeeklyPlan = Record<number, WorkoutDay>;
type GroupClass = { id: string; day: string; name: string; time: string };
type GroupSchedule = Record<Person, GroupClass[]>;
type Tab = "treino" | "dieta";
type ActiveWorkoutProgress = { day: number; activeExercise: number; series: number; ready: boolean; completedExercises: string[]; exerciseProgress: Record<string, { series: number; ready: boolean }> };
type DaySwaps = Record<number, number>;

const Progress = ({ value, color = "purple" }: { value: number; color?: string }) => (
  <div className="progress"><i className={color} style={{ width: `${value}%` }} /></div>
);

const defaultGroupClasses: GroupSchedule = {
  gileade: [{ id:"g-1", day: "Sexta-feira", name: "Muay Thai", time: "18:30" }, { id:"g-2", day: "Sábado", name: "Funcional", time: "09:00" }],
  renata: [{ id:"r-1", day: "Sexta-feira", name: "Pilates", time: "17:30" }, { id:"r-2", day: "Sábado", name: "Fit Dance", time: "10:00" }],
};

const weekday = (date: Date) => new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);

const makeExercise = (id: string, name: string, sets: number, reps: string, muscle: string, weight: number): WorkoutExercise => ({ id, name, sets, reps, muscle, weight });
const defaultWeeklyPlan: WeeklyPlan = {
  0: { title: "Descanso", muscles: "Recuperação", duration: 0, exercises: [] },
  1: { title: "Treino A", muscles: "Peito + tríceps", duration: 60, exercises: [makeExercise("seg-1","Supino reto",4,"12","Peito",20),makeExercise("seg-2","Supino inclinado",4,"12","Peito",16),makeExercise("seg-3","Crucifixo",3,"12","Peito",10),makeExercise("seg-4","Tríceps pulley",3,"15","Tríceps",18)] },
  2: { title: "Treino B", muscles: "Costas + bíceps", duration: 55, exercises: [makeExercise("ter-1","Puxada frontal",4,"12","Costas",25),makeExercise("ter-2","Remada baixa",4,"12","Costas",22),makeExercise("ter-3","Rosca direta",3,"12","Bíceps",10)] },
  3: { title: "Treino C", muscles: "Pernas + glúteos", duration: 65, exercises: [makeExercise("qua-1","Agachamento",4,"10","Pernas",30),makeExercise("qua-2","Leg press",4,"12","Pernas",60),makeExercise("qua-3","Cadeira extensora",3,"15","Quadríceps",25)] },
  4: { title: "Treino D", muscles: "Ombros + abdômen", duration: 50, exercises: [makeExercise("qui-1","Desenvolvimento",4,"12","Ombros",12),makeExercise("qui-2","Elevação lateral",3,"15","Ombros",7),makeExercise("qui-3","Prancha",3,"45 seg","Abdômen",0)] },
  5: { title: "Treino E", muscles: "Posterior + glúteos", duration: 60, exercises: [makeExercise("sex-1","Stiff",4,"10","Posterior",24),makeExercise("sex-2","Mesa flexora",4,"12","Posterior",25),makeExercise("sex-3","Elevação pélvica",4,"12","Glúteos",35)] },
  6: { title: "Treino leve", muscles: "Cardio + mobilidade", duration: 40, exercises: [makeExercise("sab-1","Esteira",1,"20 min","Cardio",0),makeExercise("sab-2","Mobilidade",3,"10","Corpo todo",0)] },
};
const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dayNamesLong = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const weekStartKey = (date: Date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function Home() {
  const [databaseState,setDatabaseState]=useState<"loading"|"ready"|"error">("loading");
  const [databaseError,setDatabaseError]=useState("");
  const [householdId,setHouseholdId]=useState("");
  const [toast, setToast] = useState("");
  const [detailExercise, setDetailExercise] = useState<{ exercise: WorkoutExercise; index: number; total: number } | null>(null);
  const [workout, setWorkout] = useState(false);
  const [series, setSeries] = useState(1);
  const [rest, setRest] = useState(0);
  const [activeExercise, setActiveExercise] = useState(0);
  const [completedExercises, setCompletedExercises] = useState<string[]>([]);
  const [exerciseReady, setExerciseReady] = useState(false);
  const [exerciseProgress, setExerciseProgress] = useState<Record<string,{ series:number; ready:boolean }>>({});
  const [workoutDay, setWorkoutDay] = useState(() => new Date().getDay());
  const [workoutDayIds,setWorkoutDayIds]=useState<Record<Person,Record<number,string>>>({gileade:{},renata:{}});
  const [workoutDone, setWorkoutDone] = useState(false);
  const [completedWorkouts,setCompletedWorkouts]=useState<Record<Person,boolean>>({gileade:false,renata:false});
  const [trainedWorkoutDays,setTrainedWorkoutDays]=useState<Record<Person,number[]>>({gileade:[],renata:[]});
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<number | null>(null);
  const [editingClasses, setEditingClasses] = useState(false);
  const [honorDay, setHonorDay] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState<Tab>("treino");
  const [previewMode, setPreviewMode] = useState(false);
  const [activeWorkoutByPerson, setActiveWorkoutByPerson] = useState<Record<Person, ActiveWorkoutProgress | null>>(() => {
    try { return JSON.parse(localStorage.getItem("gym-active-workout") || "null") || { gileade: null, renata: null }; }
    catch { return { gileade: null, renata: null }; }
  });
  const [daySwaps, setDaySwaps] = useState<Record<Person, DaySwaps>>(() => {
    try { return JSON.parse(localStorage.getItem("gym-day-swaps") || "null") || { gileade: {}, renata: {} }; }
    catch { return { gileade: {}, renata: {} }; }
  });
  const [swapMode, setSwapMode] = useState(false);
  const [swapSourceDay, setSwapSourceDay] = useState<number | null>(null);
  const [swapFlashDays, setSwapFlashDays] = useState<number[]>([]);
  const longPressTimer = useRef<number | null>(null);
  const suppressClickForDay = useRef<number | null>(null);
  const [weeklyPlans, setWeeklyPlans] = useState<Record<Person,WeeklyPlan>>(() => {
    try { const saved=JSON.parse(localStorage.getItem("gym-weekly-plans")||"null");return saved||{gileade:defaultWeeklyPlan,renata:defaultWeeklyPlan}; }
    catch { return {gileade:defaultWeeklyPlan,renata:defaultWeeklyPlan}; }
  });
  const [groupSchedule, setGroupSchedule] = useState<GroupSchedule>(() => {
    try { return JSON.parse(localStorage.getItem("gym-group-classes") || "null") || defaultGroupClasses; }
    catch { return defaultGroupClasses; }
  });
  const [person, setPerson] = useState<Person>(() => (localStorage.getItem("gym-person") as Person) || "gileade");
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDragging, setSwipeDragging] = useState(false);
  const edgeSwipe = useRef({ active: false, startX: 0, startY: 0 });
  const weeklyPlan=weeklyPlans[person];
  const activeWorkout=activeWorkoutByPerson[person];
  const personSwaps=daySwaps[person]||{};
  const effectiveSource=(day:number)=>personSwaps[day]??day;
  const selectPerson = (next: Person) => { setPerson(next);setWorkoutDone(completedWorkouts[next]); localStorage.setItem("gym-person", next); };
  const saveWeeklyPlan = (next: WeeklyPlan) => { const all={...weeklyPlans,[person]:next};setWeeklyPlans(all);localStorage.setItem("gym-weekly-plans",JSON.stringify(all));if(householdId)void saveWorkoutPlan(householdId,person,next).catch(error=>showDatabaseError(error)); };
  const saveGroupSchedule = (next: GroupSchedule) => { setGroupSchedule(next); localStorage.setItem("gym-group-classes", JSON.stringify(next));if(householdId)void saveClasses(householdId,person,next[person]).catch(error=>showDatabaseError(error)); };

  function showDatabaseError(error:unknown){const message=error instanceof Error?error.message:typeof error==="object"&&error!==null&&"message" in error?String(error.message):"Não foi possível sincronizar com o Supabase.";setToast(`Erro: ${message}`);window.setTimeout(()=>setToast(""),4200);}
  function notify(message:string){setToast(message);window.setTimeout(()=>setToast(""),message.length>42?4200:2600);}

  async function hydrate(household:string){
    const data=await loadRotina(household);
    const plans:Record<Person,WeeklyPlan>={gileade:structuredClone(defaultWeeklyPlan),renata:structuredClone(defaultWeeklyPlan)};
    const ids:Record<Person,Record<number,string>>={gileade:{},renata:{}};
    for(const row of data.days as any[]){const owner=row.person as Person;ids[owner][row.day_of_week]=row.id;plans[owner][row.day_of_week]={title:row.title,muscles:row.muscles,duration:row.duration_minutes,exercises:(data.exercises as any[]).filter(item=>item.workout_day_id===row.id).map(item=>({id:item.id,name:item.name,sets:item.sets,reps:item.reps,muscle:item.muscle,weight:Number(item.weight)}))};}
    setWeeklyPlans(plans);setWorkoutDayIds(ids);localStorage.setItem("gym-weekly-plans",JSON.stringify(plans));
    const schedules:GroupSchedule={gileade:[],renata:[]};const dayNames=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
    (data.classes as any[]).forEach(item=>schedules[item.person as Person].push({id:item.id,day:dayNames[item.day_of_week],name:item.name,time:item.class_time.slice(0,5)}));setGroupSchedule(schedules);localStorage.setItem("gym-group-classes",JSON.stringify(schedules));
    const swaps:Record<Person,DaySwaps>={gileade:{},renata:{}};
    (data.swaps as any[]).forEach(row=>{swaps[row.person as Person][row.day_of_week]=row.source_day;});
    setDaySwaps(swaps);localStorage.setItem("gym-day-swaps",JSON.stringify(swaps));
    const todayStr=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}`;
    const completed={gileade:(data.sessions as any[]).some(item=>item.person==="gileade"&&item.completion_date===todayStr),renata:(data.sessions as any[]).some(item=>item.person==="renata"&&item.completion_date===todayStr)};setCompletedWorkouts(completed);setWorkoutDone(completed[person]);
    const trained:Record<Person,number[]>={gileade:[],renata:[]};
    (data.sessions as any[]).forEach(item=>{const owner=item.person as Person;const weekday=new Date(`${item.completion_date}T12:00:00`).getDay();if(!trained[owner].includes(weekday))trained[owner].push(weekday);});
    setTrainedWorkoutDays(trained);
    setDatabaseState("ready");
  }

  useEffect(()=>{void(async()=>{try{if(!supabaseConfigured)throw new Error("As variáveis do Supabase não foram configuradas.");await ensureAnonymousSession();const existingHousehold=await currentHousehold();const household=existingHousehold||await pairHousehold("rotina-gileade-renata-2026");setHouseholdId(household);await hydrate(household);}catch(error){const message=error instanceof Error?error.message:typeof error==="object"&&error!==null&&"message" in error?String(error.message):"Falha ao conectar ao Supabase.";setDatabaseError(message);setDatabaseState("error");}})();},[]);
  useEffect(()=>{if(databaseState!=="ready"||!householdId)return;const refresh=()=>{if(document.visibilityState==="visible")void hydrate(householdId).catch(showDatabaseError);};window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);return()=>{window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};},[databaseState,householdId]);

  useEffect(() => {
    if (!rest) return;
    const timer = window.setInterval(() => setRest((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [rest]);

  useEffect(() => {
    document.body.classList.toggle("scroll-locked", workout);
    return () => document.body.classList.remove("scroll-locked");
  }, [workout]);

  useEffect(() => {
    const refreshClock = () => setNow(new Date());
    const timer = window.setInterval(refreshClock, 30_000);
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", refreshClock);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshClock); document.removeEventListener("visibilitychange", refreshClock); };
  }, []);

  useEffect(() => {
    if (!workout || previewMode) return;
    setActiveWorkoutByPerson(current => {
      const next = { ...current, [person]: { day: workoutDay, activeExercise, series, ready: exerciseReady, completedExercises, exerciseProgress } };
      localStorage.setItem("gym-active-workout", JSON.stringify(next));
      return next;
    });
  }, [workout, previewMode, workoutDay, activeExercise, series, exerciseReady, completedExercises, exerciseProgress, person]);

  const clearActiveWorkout = () => setActiveWorkoutByPerson(current => { const next={...current,[person]:null}; localStorage.setItem("gym-active-workout",JSON.stringify(next)); return next; });

  const startWorkout = (day: number, preview: boolean) => {
    const source = effectiveSource(day);
    if (!weeklyPlan[source].exercises.length) return;
    window.scrollTo({top:0,behavior:"instant"});
    setWorkoutDay(day);
    setPreviewMode(preview);
    const resume = !preview && activeWorkout && activeWorkout.day === day ? activeWorkout : null;
    if (resume) {
      setActiveExercise(resume.activeExercise); setCompletedExercises(resume.completedExercises); setExerciseProgress(resume.exerciseProgress); setSeries(resume.series); setExerciseReady(resume.ready);
    } else {
      setActiveExercise(0); setCompletedExercises([]); setExerciseProgress({}); setSeries(1); setExerciseReady(false);
    }
    setRest(0);
    setWorkout(true);
  };

  const concludeSeries = () => {
    const source = effectiveSource(workoutDay);
    const dayExercises = weeklyPlan[source].exercises;
    const exercise = dayExercises[activeExercise];
    if (exerciseReady) {
      const completed = [...completedExercises, exercise.id];
      setCompletedExercises(completed);
      let nextIndex = -1;
      for (let offset = 1; offset <= dayExercises.length; offset += 1) {
        const candidate = (activeExercise + offset) % dayExercises.length;
        if (!completed.includes(dayExercises[candidate].id)) { nextIndex = candidate; break; }
      }
      if (nextIndex === -1) {
        const dayId=workoutDayIds[person][source];
        if(!dayId){showDatabaseError(new Error("O treino ainda não foi sincronizado."));return;}
        void finishWorkout(dayId,person).then(awarded=>{if(awarded)notify("Treino completo! 💪");const nextCompleted={...completedWorkouts,[person]:workoutDay===now.getDay()||completedWorkouts[person]};setCompletedWorkouts(nextCompleted);setWorkoutDone(nextCompleted[person]);setTrainedWorkoutDays(current=>({...current,[person]:current[person].includes(workoutDay)?current[person]:[...current[person],workoutDay]}));clearActiveWorkout();setWorkout(false);setSeries(1);setExerciseReady(false);}).catch(showDatabaseError);return;
      }
      setActiveExercise(nextIndex); setSeries(1); setRest(0); setExerciseReady(false); return;
    }
    if (series < exercise.sets) { const nextSeries=series+1; setRest(60); setSeries(nextSeries); setExerciseProgress(current=>({...current,[exercise.id]:{series:nextSeries,ready:false}})); }
    else { setRest(0); setExerciseReady(true); setExerciseProgress(current=>({...current,[exercise.id]:{series,ready:true}})); }
  };

  const changeWeight = (amount: number) => {
    const source = effectiveSource(workoutDay);
    const exercise = weeklyPlan[source].exercises[activeExercise];
    const nextWeight = Math.max(0, exercise.weight + amount);
    const next = { ...weeklyPlan, [source]: { ...weeklyPlan[source], exercises: weeklyPlan[source].exercises.map((item, index) => index === activeExercise ? { ...item, weight: nextWeight } : item) } };
    const all = { ...weeklyPlans, [person]: next };
    setWeeklyPlans(all);
    localStorage.setItem("gym-weekly-plans", JSON.stringify(all));
    if (householdId) void updateExerciseWeight(exercise.id, nextWeight).catch(error => showDatabaseError(error));
  };

  const onDayPressStart = (day: number) => {
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      suppressClickForDay.current = day;
      setSwapMode(true);
      setSwapSourceDay(day);
    }, 450);
  };
  const onDayPressEnd = () => { if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; } };

  const persistDaySwaps = (next: DaySwaps) => {
    const merged = { ...daySwaps, [person]: next };
    setDaySwaps(merged);
    localStorage.setItem("gym-day-swaps", JSON.stringify(merged));
    if (householdId) { const weekStart = weekStartKey(now); void saveDaySwaps(householdId, person, weekStart, Object.entries(next).map(([day, source]) => ({ day: Number(day), source }))).catch(showDatabaseError); }
  };

  const performSwap = (pressedDay: number, tappedDay: number) => {
    if (pressedDay === tappedDay) { setSwapMode(false); setSwapSourceDay(null); return; }
    const current = personSwaps;
    const pressedSource = current[pressedDay] ?? pressedDay;
    const tappedSource = current[tappedDay] ?? tappedDay;
    const next: DaySwaps = {};
    Object.entries(current).forEach(([key, value]) => { const k = Number(key); if (k !== pressedDay && k !== tappedDay) next[k] = value; });
    if (tappedSource !== pressedDay) next[pressedDay] = tappedSource;
    if (pressedSource !== tappedDay) next[tappedDay] = pressedSource;
    persistDaySwaps(next);
    setSwapMode(false); setSwapSourceDay(null);
    setSwapFlashDays([pressedDay, tappedDay]);
    window.setTimeout(() => setSwapFlashDays([]), 500);
    setWorkoutDay(tappedDay);
    notify(`Esse treino era de ${dayNamesLong[pressedSource]}, mas essa semana veio para ${dayNamesLong[tappedDay]}.`);
  };

  const onDayTap = (day: number) => {
    const suppressed = suppressClickForDay.current === day;
    suppressClickForDay.current = null;
    if (suppressed) return;
    if (swapMode) {
      if (swapSourceDay === day) { setSwapMode(false); setSwapSourceDay(null); return; }
      performSwap(swapSourceDay as number, day);
      return;
    }
    setWorkoutDay(day);
  };

  const undoSwap = (day: number) => {
    const current = personSwaps;
    if (current[day] === undefined) return;
    const next: DaySwaps = {};
    Object.entries(current).forEach(([key, value]) => { const k = Number(key); if (k !== day && value !== day) next[k] = value; });
    persistDaySwaps(next);
  };

  const confirmHonorWorkout = (day: number) => {
    const dayId = workoutDayIds[person][day];
    if (!dayId) { showDatabaseError(new Error("O treino ainda não foi sincronizado.")); return; }
    const target = new Date(now);
    target.setHours(12, 0, 0, 0);
    target.setDate(target.getDate() + (day - target.getDay()));
    const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
    void finishWorkoutForDate(dayId, person, dateStr).then(awarded => {
      if (awarded) notify("Treino registrado!");
      setTrainedWorkoutDays(current => ({ ...current, [person]: current[person].includes(day) ? current[person] : [...current[person], day] }));
      setHonorDay(null);
    }).catch(showDatabaseError);
  };

  const goBack = () => {
    if (detailExercise) return setDetailExercise(null);
    if (workout) return setWorkout(false);
    if (editingWorkout !== null) return setEditingWorkout(null);
    if (editingClasses) return setEditingClasses(false);
    if (honorDay !== null) return setHonorDay(null);
    if (menuOpen) return setMenuOpen(false);
  };

  const overlayOpen = detailExercise!==null||editingWorkout!==null||editingClasses||honorDay!==null||menuOpen;

  const startEdgeSwipe = (event: React.PointerEvent) => {
    const canGoBack=detailExercise!==null||workout||editingWorkout!==null||editingClasses||honorDay!==null||menuOpen;
    edgeSwipe.current = { active: canGoBack&&event.clientX <= 24, startX: event.clientX, startY: event.clientY };
    if(edgeSwipe.current.active)setSwipeDragging(true);
  };
  const moveEdgeSwipe=(event:React.PointerEvent)=>{const swipe=edgeSwipe.current;if(!swipe.active)return;const dx=event.clientX-swipe.startX,dy=event.clientY-swipe.startY;if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>18){swipe.active=false;setSwipeDragging(false);setSwipeOffset(0);return;}setSwipeOffset(Math.max(0,Math.min(dx,window.innerWidth*.82)));};
  const endEdgeSwipe = (event: React.PointerEvent) => {
    const swipe = edgeSwipe.current;
    const shouldReturn=swipe.active&&event.clientX-swipe.startX>85&&Math.abs(event.clientY-swipe.startY)<70;
    swipe.active = false;
    setSwipeDragging(false);
    if(shouldReturn){setSwipeOffset(window.innerWidth);window.setTimeout(()=>{goBack();setSwipeOffset(0);},170);}else setSwipeOffset(0);
  };

  if(databaseState!=="ready")return <DatabaseGate state={databaseState} error={databaseError}/>;

  const treinoScreen = <Treino now={now} person={person} plan={weeklyPlan} classes={groupSchedule[person]} selectedDay={workoutDay} workoutDone={workoutDone} trainedDays={trainedWorkoutDays[person]} activeWorkout={activeWorkout} daySwaps={personSwaps} swapMode={swapMode} swapSourceDay={swapSourceDay} swapFlashDays={swapFlashDays} onDayPressStart={onDayPressStart} onDayPressEnd={onDayPressEnd} onDayTap={onDayTap} onUndoSwap={undoSwap} onDetail={(exercise,index,total) => setDetailExercise({exercise,index,total})} onStart={(day)=>startWorkout(day,false)} onPreview={(day)=>startWorkout(day,true)} onEdit={() => setEditingWorkout(effectiveSource(workoutDay))} onEditClasses={() => setEditingClasses(true)} onMarkDone={(day) => setHonorDay(day)} />;

  return (
    <main className={`app-shell ${swipeOffset>0?"edge-moving":""} ${swipeDragging?"edge-dragging":""} ${overlayOpen?"edge-modal-mode":""}`} style={{"--edge-swipe":`${swipeOffset}px`,"--edge-progress":swipeOffset?Math.min(1,swipeOffset/(window.innerWidth*.82)):0} as React.CSSProperties} onPointerDown={startEdgeSwipe} onPointerMove={moveEdgeSwipe} onPointerUp={endEdgeSwipe} onPointerCancel={endEdgeSwipe}>
      <div className="ambient one" /><div className="ambient two" />
      <header className={`topbar ${workout?"workout-topbar":""}`}>
        {!workout && <div className="brand-group"><button className="menu-trigger" onClick={() => setMenuOpen(true)} aria-label="Abrir configurações"><i/><i/><i/></button><span className="brand text-brand">Gym</span></div>}
        {workout && <button className="workout-exit-top" onClick={()=>setWorkout(false)}>‹ Sair</button>}
      </header>

      {!overlayOpen && (swipeDragging||swipeOffset>0) && workout && <section className="content underlay-screen" aria-hidden="true">{activeTab==="treino"?treinoScreen:<Dieta householdId={householdId} person={person} notify={notify} showError={showDatabaseError}/>}</section>}
      <section className="content">
        {!workout && activeTab==="treino" && treinoScreen}
        {!workout && activeTab==="dieta" && <Dieta householdId={householdId} person={person} notify={notify} showError={showDatabaseError}/>}
        {workout && <WorkoutMode plan={weeklyPlan[effectiveSource(workoutDay)]} preview={previewMode} activeExercise={activeExercise} completed={completedExercises} series={series} rest={rest} ready={exerciseReady} onSeries={concludeSeries} onRestDone={()=>setRest(0)} onExitPreview={()=>setWorkout(false)} onChoose={(index) => { const source=effectiveSource(workoutDay); const exercises=weeklyPlan[source].exercises; const current=exercises[activeExercise]; setExerciseProgress(progress=>({...progress,[current.id]:{series,ready:exerciseReady}})); const target=exerciseProgress[exercises[index].id]; setActiveExercise(index); setSeries(target?.series||1); setRest(0); setExerciseReady(target?.ready||false); }} onWeight={changeWeight} />}
      </section>

      {!workout && (
        <nav className="bottom-nav">
          <button className={activeTab==="treino"?"active":""} onClick={() => setActiveTab("treino")}><span className="icon">🏋️</span><small>Treinos</small></button>
          <button className={activeTab==="dieta"?"active":""} onClick={() => setActiveTab("dieta")}><span className="icon">🥗</span><small>Dieta</small></button>
        </nav>
      )}

      <div className="overlay-stack">
        {detailExercise && <ExerciseDetail target={detailExercise} onClose={() => setDetailExercise(null)} />}
        {menuOpen && <PersonMenu person={person} onSelect={selectPerson} onClose={() => setMenuOpen(false)} />}
        {editingWorkout !== null && <WorkoutEditor day={editingWorkout} plan={weeklyPlan} onClose={() => setEditingWorkout(null)} onSave={(next) => { saveWeeklyPlan(next); setEditingWorkout(null); }} />}
        {editingClasses && <GroupClassEditor person={person} schedule={groupSchedule} onClose={() => setEditingClasses(false)} onSave={(next) => { saveGroupSchedule(next); setEditingClasses(false); }} />}
        {honorDay !== null && <WorkoutHonorModal day={honorDay} onClose={() => setHonorDay(null)} onConfirm={() => confirmHonorWorkout(honorDay)} />}
      </div>
      {toast && <div className={`toast ${!toast.startsWith("Erro") ? "success" : ""} ${toast.length>42?"wide":""}`}><span>✦</span>{toast}</div>}
    </main>
  );
}

function DatabaseGate({state,error}:{state:"loading"|"ready"|"error";error:string}){
  if(state==="loading")return <main className="database-gate"><div className="database-loader"/><h1>Preparando o Gym</h1><p>Conectando seus dados com segurança.</p></main>;
  if(state==="error"&&error.toLocaleLowerCase("pt-BR").includes("anonymous"))return <main className="database-gate"><span className="gate-icon">!</span><h1>Ative o acesso anônimo</h1><p>No Supabase, abra Authentication → Providers → Anonymous Sign-Ins e ative a opção. Depois atualize o aplicativo.</p></main>;
  return <main className="database-gate"><span className="gate-icon">!</span><h1>Não foi possível conectar</h1><p>{error||"Atualize o aplicativo e tente novamente."}</p></main>;
}

function Treino({ now, person, plan, classes, selectedDay, workoutDone, trainedDays, activeWorkout, daySwaps, swapMode, swapSourceDay, swapFlashDays, onDayPressStart, onDayPressEnd, onDayTap, onUndoSwap, onDetail, onStart, onPreview, onEdit, onEditClasses, onMarkDone }: { now:Date; person:Person; plan:WeeklyPlan; classes:GroupClass[]; selectedDay:number; workoutDone:boolean; trainedDays:number[]; activeWorkout:ActiveWorkoutProgress|null; daySwaps:DaySwaps; swapMode:boolean; swapSourceDay:number|null; swapFlashDays:number[]; onDayPressStart:(day:number)=>void; onDayPressEnd:()=>void; onDayTap:(day:number)=>void; onUndoSwap:(day:number)=>void; onDetail:(exercise:WorkoutExercise,index:number,total:number)=>void; onStart:(day:number)=>void; onPreview:(day:number)=>void; onEdit:()=>void; onEditClasses:()=>void; onMarkDone:(day:number)=>void }) {
  const today = now.getDay();
  const source = (day:number) => daySwaps[day] ?? day;
  const nextTrainingDay = Array.from({length:7},(_,index)=>(today+index+1)%7).find(day=>plan[source(day)].exercises.length>0) ?? (today+1)%7;
  const shownSource = source(selectedDay);
  const shown = plan[shownSource];
  const swapped = shownSource !== selectedDay;
  const [expandedCompleted,setExpandedCompleted]=useState(false);
  const [expandedClasses,setExpandedClasses]=useState(false);
  const hideCompletedList = workoutDone && selectedDay === today && !expandedCompleted;
  const todayName=weekday(now).toLocaleLowerCase("pt-BR");
  const todayClasses=classes.filter(item=>item.day.toLocaleLowerCase("pt-BR")===todayName);
  const visibleClasses=expandedClasses?classes:todayClasses;
  const continuing = !!activeWorkout && activeWorkout.day===selectedDay && activeWorkout.completedExercises.length<shown.exercises.length;
  return <>
    <div className="page-head workout-page-head"><p className="eyebrow">{selectedDay === today ? "TREINO DE HOJE" : weekdayLabels[selectedDay].toLocaleUpperCase("pt-BR")}</p><h1>Treino de {person === "gileade" ? "Gileade" : "Renata"}</h1><p>{workoutDone&&selectedDay===today?"Treino concluído. Bom trabalho!":shown.exercises.length ? `Foco em ${shown.muscles}.` : "Dia de recuperação e descanso."}</p></div>
    <div className="workout-week">{weekdayLabels.map((label,day)=>{const trained=trainedDays.includes(day);const daySource=source(day);return <button key={label} className={`${selectedDay===day?"selected":""} ${day===today?"today":""} ${trained?"trained":""} ${swapMode?"swap-jiggle":""} ${swapMode&&swapSourceDay===day?"swap-source":""} ${swapFlashDays.includes(day)?"swap-flash":""}`} onPointerDown={()=>onDayPressStart(day)} onPointerUp={onDayPressEnd} onPointerLeave={onDayPressEnd} onPointerCancel={onDayPressEnd} onClick={()=>onDayTap(day)}><small>{label}</small><span>{trained?"✓":plan[daySource].exercises.length ? plan[daySource].title.replace("Treino ","") : "—"}</span></button>;})}</div>
    <article className={`workout-hero compact-workout ${workoutDone && selectedDay===today?"completed-workout":""}`}><div className="workout-art has-image"><img src={`${import.meta.env.BASE_URL}rotina-casal.png`} alt="Casal construindo sua rotina de treino" /><span>{shown.muscles.toLocaleUpperCase("pt-BR")}</span>{workoutDone&&selectedDay===today&&<b className="workout-done-badge">✓ CONCLUÍDO</b>}</div><div className="workout-copy"><p>{shown.title.toLocaleUpperCase("pt-BR")}</p><h2>{shown.muscles}</h2><div className="workout-meta"><span>◉ {shown.exercises.length} exercícios</span><span>◷ {shown.duration} min</span></div>{swapped && <p className="swap-note"><span>Esse treino era de {dayNamesLong[shownSource]}, mas essa semana veio para {dayNamesLong[selectedDay]}.</span><button className="swap-undo" onClick={()=>onUndoSwap(selectedDay)}>Desfazer</button></p>}{shown.exercises.length>0 && <div className="workout-actions">{selectedDay===today && !workoutDone && <button className="primary" onClick={()=>onStart(selectedDay)}>{continuing?"Continuar treino":"Iniciar treino"}</button>}<button className={selectedDay===today && !workoutDone?"outline-add":"primary"} onClick={()=>onPreview(selectedDay)}>Visualizar treino</button></div>}{shown.exercises.length>0 && selectedDay<today && !trainedDays.includes(selectedDay) && <button className="outline-add honor-trigger" onClick={()=>onMarkDone(selectedDay)}>Já treinei, marcar como concluído</button>}</div></article>
    {workoutDone&&selectedDay===today&&<article className="next-workout-preview"><small>PRÓXIMO TREINO · {weekdayLabels[nextTrainingDay].toLocaleUpperCase("pt-BR")}</small><div><span><b>{plan[source(nextTrainingDay)].title}</b><em>{plan[source(nextTrainingDay)].muscles}</em></span><strong>{plan[source(nextTrainingDay)].exercises.length} exercícios</strong></div></article>}
    <div className="section-title workout-list-title"><div><p>{selectedDay===today?"PROGRAMAÇÃO DO DIA":weekdayLabels[selectedDay].toLocaleUpperCase("pt-BR")}</p><h2>Exercícios</h2></div><button onClick={onEdit}>Editar</button></div>
    {workoutDone&&selectedDay===today&&<button className="completed-expand" onClick={()=>setExpandedCompleted(value=>!value)}>{expandedCompleted?"Ocultar exercícios":"Ver treino concluído"}<i className={expandedCompleted?"open":""}/></button>}
    {!hideCompletedList&&<div className="exercise-list">{shown.exercises.length ? shown.exercises.map((exercise,index)=><button key={exercise.id} onClick={()=>onDetail(exercise,index,shown.exercises.length)}><span className="exercise-num">{String(index+1).padStart(2,"0")}</span><span><b>{exercise.name}</b><small>{exercise.sets} séries × {exercise.reps} · {exercise.muscle}</small></span><em>{exercise.weight ? `${exercise.weight} kg` : "—"}</em></button>) : <div className="empty-workout">Nenhum exercício configurado para este dia.</div>}</div>}
    <section className="group-classes" id="aulas-coletivas"><div className="section-title"><div><p>AGENDA DE {person === "gileade" ? "GILEADE" : "RENATA"}</p><h2>Aulas coletivas</h2></div><button onClick={onEditClasses}>Editar</button></div><div className="class-calendar">{visibleClasses.length ? visibleClasses.map((item,index)=><article key={item.id} className={index===0&&!expandedClasses?"next-class":""}><span>{item.day}</span><div><b>{item.name}</b><small>{item.time}</small></div></article>) : <div className="empty-workout">Nenhuma aula coletiva para hoje.</div>}</div>{classes.length>todayClasses.length&&<button className="classes-expand" onClick={()=>setExpandedClasses(value=>!value)} aria-label={expandedClasses?"Mostrar somente as aulas de hoje":"Mostrar aulas de todos os dias"}><i className={expandedClasses?"open":""}/><span>{expandedClasses?"Mostrar somente hoje":"Ver todos os dias"}</span></button>}</section>
  </>;
}

function PersonMenu({ person, onSelect, onClose }: { person:Person; onSelect:(person:Person)=>void; onClose:()=>void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="person-drawer" onClick={event=>event.stopPropagation()}><div className="drawer-head"><div><small>CONFIGURAÇÕES</small><h2>Pessoa ativa</h2></div><button onClick={onClose}>×</button></div><p>Escolha de quem você quer visualizar o treino e as aulas.</p><div className={`person-switch ${person}`}><button className={person==="gileade"?"active":""} onClick={()=>onSelect("gileade")}><span>G</span>Gileade</button><button className={person==="renata"?"active":""} onClick={()=>onSelect("renata")}><span>R</span>Renata</button><i/></div></aside></div>;
}

function ExerciseDetail({ target, onClose }: { target:{ exercise:WorkoutExercise; index:number; total:number }; onClose:()=>void }) {
  const { exercise, index, total } = target;
  const guide = getExerciseGuide(exercise.name);
  return <div className="modal"><div className="sheet"><button className="sheet-close" onClick={onClose}>×</button><p className="eyebrow">EXERCÍCIO {String(index+1).padStart(2,"0")} DE {String(total).padStart(2,"0")}</p><h1>{exercise.name}</h1><div className={`exercise-orb ${guide?"has-guide":""}`}>{guide?<img src={exerciseImageSrc(guide.image)} alt={`Demonstração de ${exercise.name}`}/>:<span className="orb-placeholder"><i>🏋️</i>Foto em breve</span>}</div><p className="description">{guide?guide.tip:"Ainda não temos uma dica cadastrada para este exercício."}</p><div className="detail-grid"><div><small>Séries</small><b>{exercise.sets}</b></div><div><small>Repetições</small><b>{exercise.reps}</b></div><div><small>Músculo</small><b>{exercise.muscle}</b></div><div><small>Carga</small><b>{exercise.weight?`${exercise.weight} kg`:"—"}</b></div></div></div></div>;
}

const exerciseGuides = [
  { names:["supino inclinado"], image:"supino-inclinado.jpg", tip:"Banco inclinado, pés firmes e barra descendo na parte alta do peito." },
  { names:["supino na maquina","supino maquina"], image:"supino-maquina.jpg", tip:"Ajuste o banco na altura do peito e empurre sem tirar as costas do apoio." },
  { names:["supino reto"], image:"supino-reto.jpg", tip:"Pés firmes, escápulas apoiadas e barra descendo na linha do peito." },
  { names:["crucifixo na maquina","crucifixo maquina","peck deck","pec deck"], image:"crucifixo-maquina.jpg", tip:"Cotovelos levemente flexionados; feche os braços sem projetar os ombros." },
  { names:["crossover"], image:"crossover.jpg", tip:"Incline pouco o tronco e una as mãos à frente mantendo os cotovelos suaves." },
  { names:["flexao de braco","flexao"], image:"flexao.jpg", tip:"Corpo alinhado; desça o peito entre as mãos sem deixar o quadril cair." },
  { names:["triceps pulley com corda","triceps corda"], image:"triceps-corda.jpg", tip:"Cotovelos presos ao corpo; estenda e afaste as pontas da corda no final." },
  { names:["triceps pulley com barra","triceps barra"], image:"triceps-barra.jpg", tip:"Cotovelos imóveis ao lado do tronco; empurre a barra até estender os braços." },
  { names:["triceps frances"], image:"triceps-frances.jpg", tip:"Mantenha os cotovelos apontados para frente e estenda o peso sobre a cabeça." },
  { names:["triceps testa"], image:"triceps-testa.jpg", tip:"Deitado, mantenha os braços firmes e leve a barra com controle perto da testa." },
  { names:["puxada frontal"], image:"puxada-frontal.jpg", tip:"Peito aberto; puxe a barra até a parte alta do peito sem balançar o tronco." },
  { names:["remada baixa"], image:"remada-baixa.jpg", tip:"Coluna neutra; puxe a alça em direção ao abdômen aproximando as escápulas." },
  { names:["remada unilateral com halter","remada unilateral"], image:"remada-unilateral.jpg", tip:"Apoie mão e joelho no banco e puxe o halter em direção ao quadril." },
  { names:["pulldown na polia","pulldown polia"], image:"pulldown-polia.jpg", tip:"Braços quase estendidos; leve a barra até as coxas usando as costas." },
  { names:["rosca direta"], image:"rosca-direta.jpg", tip:"Cotovelos junto ao corpo; eleve a barra sem impulsionar o tronco." },
  { names:["rosca martelo"], image:"rosca-martelo.jpg", tip:"Palmas voltadas uma para a outra e cotovelos parados durante a subida." },
  { names:["rosca alternada com halteres","rosca alternada"], image:"rosca-alternada.jpg", tip:"Suba um halter de cada vez sem girar ou inclinar o tronco." },
  { names:["rosca scott"], image:"rosca-scott.jpg", tip:"Apoie totalmente os braços no banco Scott e faça a rosca sem tirar os cotovelos do suporte." },
  { names:["agachamento bulgaro","bulgaro"], image:"agachamento-bulgaro.jpg", tip:"Apoie o pé de trás no banco e desça com controle, mantendo o joelho da frente alinhado." },
  { names:["coice na polia","coice polia","gluteo na polia"], image:"coice-polia.jpg", tip:"Mantenha o tronco firme e leve a perna para trás sem arquear a lombar." },
  { names:["afundo","avanco","avanço"], image:"afundo.jpg", tip:"Dê um passo à frente e desça os dois joelhos, mantendo o tronco ereto e o pé da frente firme." },
  { names:["agachamento sumo","agachamento sumô"], image:"agachamento-sumo.jpg", tip:"Pés bem abertos e pontas para fora; desça mantendo o peso nos calcanhares." },
  { names:["agachamento"], image:"agachamento.jpg", tip:"Pés na largura dos ombros; desça controlado mantendo o peito erguido." },
  { names:["leg press"], image:"leg-press.jpg", tip:"Pés na largura dos ombros na plataforma; não trave os joelhos no topo." },
  { names:["cadeira abdutora","abducao lateral","abdução lateral"], image:"cadeira-abdutora.jpg", tip:"Empurre os joelhos (ou a perna) para fora com controle, sem impulso." },
  { names:["cadeira extensora"], image:"cadeira-extensora.jpg", tip:"Estenda as pernas sem tirar as costas do encosto e desça devagar." },
  { names:["cadeira adutora","aducao de quadril","adução de quadril"], image:"cadeira-adutora.jpg", tip:"Aproxime os joelhos com controle, mantendo as costas apoiadas e sem bater os pesos." },
  { names:["cadeira"], image:"cadeira-generica.jpg", tip:"Ajuste o banco e mantenha a postura firme durante todo o movimento." },
  { names:["desenvolvimento"], image:"desenvolvimento.jpg", tip:"Empurre o peso para cima sem hiperestender a lombar." },
  { names:["elevacao de pernas","elevação de pernas"], image:"elevacao-pernas.jpg", tip:"Eleve as pernas com controle, sem balançar o corpo." },
  { names:["elevacao lateral","elevação lateral"], image:"elevacao-lateral.jpg", tip:"Suba os braços até a linha dos ombros com os cotovelos levemente flexionados." },
  { names:["elevacao pelvica","elevação pélvica"], image:"elevacao-pelvica.jpg", tip:"Apoie a parte de cima das costas e suba o quadril contraindo o glúteo." },
  { names:["esteira"], image:"esteira.jpg", tip:"Mantenha um ritmo constante e postura ereta durante a corrida ou caminhada." },
  { names:["mesa flexora"], image:"mesa-flexora.jpg", tip:"Deitado de bruços, flexione os joelhos trazendo os calcanhares em direção ao glúteo." },
  { names:["mobilidade"], image:"mobilidade.jpg", tip:"Movimente as articulações com calma, sem forçar além do conforto." },
  { names:["panturrilha"], image:"panturrilha.jpg", tip:"Suba na ponta dos pés e desça controlado até alongar bem a panturrilha." },
  { names:["prancha"], image:"prancha.jpg", tip:"Corpo alinhado da cabeça aos pés, abdômen contraído durante todo o tempo." },
  { names:["stiff"], image:"stiff.jpg", tip:"Pernas quase retas; desça a barra rente às pernas mantendo as costas retas." },
  { names:["abdominal na maquina","abdominal máquina"], image:"abdominal-maquina.jpg", tip:"Flexione o tronco contraindo o abdômen, sem puxar com o pescoço." },
];
const normalizeExerciseName=(value:string)=>value.normalize("NFD").replace(/[̀-ͯ]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
function getExerciseGuide(name:string){const normalized=normalizeExerciseName(name);return exerciseGuides.find(item=>item.names.some(alias=>normalized.includes(alias)));}
const exerciseImageSrc=(image:string)=>image.startsWith("http")?image:`${import.meta.env.BASE_URL}exercises/${image}`;

function WorkoutMode({ plan, preview, activeExercise, completed, series, rest, ready, onSeries, onRestDone, onExitPreview, onChoose, onWeight }: { plan:WorkoutDay; preview:boolean; activeExercise:number; completed:string[]; series:number; rest:number; ready:boolean; onSeries:()=>void; onRestDone:()=>void; onExitPreview:()=>void; onChoose:(index:number)=>void; onWeight:(amount:number)=>void }) {
  const exercise = plan.exercises[activeExercise];
  const guide = getExerciseGuide(exercise.name);
  const completedCount = completed.length;
  const finalAction=ready;
  return <div className="workout-mode"><div className="mode-top">{preview?<span className="preview-badge">MODO VISUALIZAÇÃO</span>:<><span>EXERCÍCIO {activeExercise+1} DE {plan.exercises.length}</span><b>{completedCount}/{plan.exercises.length} feitos</b></>}</div>{!preview&&<Progress value={completedCount/plan.exercises.length*100}/>}<div className="mode-center"><div className={`exercise-orb ${guide?"has-guide":""}`}>{guide?<img src={exerciseImageSrc(guide.image)} alt={`Demonstração de ${exercise.name}`}/>:<span className="orb-placeholder"><i>🏋️</i>Foto em breve</span>}</div>{guide&&<p className="exercise-quick-tip">{guide.tip}</p>}{!preview&&<p className="series-indicator">SÉRIE <strong>{series}</strong> DE {exercise.sets}</p>}<h1>{exercise.name}</h1><div className="rep-number">{exercise.reps}<small>{exercise.reps.includes("min")||exercise.reps.includes("seg")?"duração":"repetições"}</small></div><div className="load-control"><button className="step-small" onClick={()=>onWeight(-5)} aria-label="Diminuir 5kg">−5</button><button onClick={()=>onWeight(-1)} aria-label="Diminuir carga">−</button><div><b>{exercise.weight}</b><small>{exercise.weight ? "kg de cada lado" : "sem carga"}</small></div><button onClick={()=>onWeight(1)} aria-label="Aumentar carga">＋</button><button className="step-small" onClick={()=>onWeight(5)} aria-label="Aumentar 5kg">+5</button></div>{!preview&&rest>0&&<div className="rest active-rest"><span>Descanso</span><b>00:{String(rest).padStart(2,"0")}</b></div>}</div><div className="exercise-order"><small>TROCAR ORDEM</small><div>{plan.exercises.map((item,index)=><button key={item.id} disabled={!preview&&completed.includes(item.id)} className={index===activeExercise?"active":""} onClick={()=>onChoose(index)}><span>{!preview&&completed.includes(item.id)?"✓":index+1}</span>{item.name}</button>)}</div></div>{preview?<button className="primary fixed-action" onClick={onExitPreview}>Fechar visualização</button>:<button className={`primary fixed-action ${finalAction?"finish-action":"series-action"}`} onClick={rest>0?onRestDone:onSeries}>{rest>0?`Iniciar série ${series}`:ready ? (completedCount===plan.exercises.length-1?"Finalizar treino":"Finalizar exercício") : series===exercise.sets?"Concluir última série":"Concluir série"}</button>}</div>;
}

function parseWorkoutPrompt(text: string, current: WeeklyPlan, defaultDay?: number): WeeklyPlan {
  const next: WeeklyPlan = JSON.parse(JSON.stringify(current));
  const aliases: Record<string,number> = { domingo:0, dom:0, segunda:1, "segunda-feira":1, seg:1, terça:2, "terça-feira":2, terca:2, ter:2, quarta:3, "quarta-feira":3, qua:3, quinta:4, "quinta-feira":4, qui:4, sexta:5, "sexta-feira":5, sex:5, sábado:6, sabado:6, sáb:6, sab:6 };
  let activeDay: number | null = defaultDay ?? null;
  const collected: Record<number,WorkoutExercise[]> = {};
  text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).forEach((line,index) => {
    const normalized = line.toLocaleLowerCase("pt-BR");
    const dayEntry = Object.entries(aliases).find(([name]) => new RegExp(`(^|\\b)${name}(\\b|:)`,"i").test(normalized));
    if (dayEntry && (/treino|feira|:|descanso/.test(normalized))) {
      activeDay = Number(dayEntry[1]); collected[activeDay] ||= [];
      if (normalized.includes("descanso")) collected[activeDay] = [];
      return;
    }
    if (activeDay === null) return;
    const cleaned = line.replace(/^[-•*\d.)\s]+/,"").trim();
    const match = cleaned.match(/^(.+?)\s*[-–:]\s*(\d+)\s*[xX×]\s*(.+?)(?:\s+[-–]\s+(\d+(?:[.,]\d+)?)\s*kg)?$/i);
    if (!match) return;
    const name = match[1].trim();
    const sets = Number(match[2]);
    const reps = match[3].replace(/\s*(rep|reps)$/i,"").trim();
    const weight = match[4] ? Number(match[4].replace(",",".")) : 0;
    (collected[activeDay] ||= []).push(makeExercise(`import-${activeDay}-${Date.now()}-${index}`,name,sets,reps,"A definir",weight));
  });
  Object.entries(collected).forEach(([day,items]) => { const numberDay=Number(day); next[numberDay]={...next[numberDay],title:`Treino ${String.fromCharCode(64+numberDay)}`,muscles:items.length?"Treino importado":"Recuperação",duration:items.length?Math.max(30,items.length*10):0,exercises:items}; });
  return next;
}

function formatWorkoutPrompt(workout: WorkoutDay): string {
  return workout.exercises.map(exercise => `- ${exercise.name} - ${exercise.sets}x${exercise.reps}${exercise.weight ? ` - ${exercise.weight} kg` : ""}`).join("\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const area = document.createElement("textarea");
      area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select();
      document.execCommand("copy"); document.body.removeChild(area);
      return true;
    } catch { return false; }
  }
}

function WorkoutEditor({ day, plan, onClose, onSave }: { day:number; plan:WeeklyPlan; onClose:()=>void; onSave:(plan:WeeklyPlan)=>void }) {
  const [draft,setDraft]=useState<WeeklyPlan>(()=>JSON.parse(JSON.stringify(plan)));
  const [prompt,setPrompt]=useState("");
  const [importMessage,setImportMessage]=useState("");
  const updateExercise=(index:number,field:keyof WorkoutExercise,value:string|number)=>setDraft(current=>({...current,[day]:{...current[day],exercises:current[day].exercises.map((item,itemIndex)=>itemIndex===index?{...item,[field]:value}:item)}}));
  const addExercise=()=>setDraft(current=>({...current,[day]:{...current[day],exercises:[...current[day].exercises,makeExercise(`manual-${Date.now()}`,"Novo exercício",3,"12","A definir",0)]}}));
  return <div className="modal"><div className="sheet workout-editor"><button className="sheet-close" onClick={onClose}>×</button><div className="workout-editor-scroll"><p className="eyebrow">{weekdayLabels[day].toLocaleUpperCase("pt-BR")}</p><h1>Editar treino</h1><label>Nome do treino<input value={draft[day].title} onChange={event=>setDraft({...draft,[day]:{...draft[day],title:event.target.value}})}/></label><label>Grupos musculares<input value={draft[day].muscles} onChange={event=>setDraft({...draft,[day]:{...draft[day],muscles:event.target.value}})}/></label><div className="editor-exercises">{draft[day].exercises.map((exercise,index)=><article key={exercise.id}><input aria-label="Nome do exercício" value={exercise.name} onChange={event=>updateExercise(index,"name",event.target.value)}/><div><label>Séries<input type="number" min="1" value={exercise.sets} onChange={event=>updateExercise(index,"sets",Number(event.target.value))}/></label><label>Repetições<input value={exercise.reps} onChange={event=>updateExercise(index,"reps",event.target.value)}/></label><label>Carga<input type="number" min="0" value={exercise.weight} onChange={event=>updateExercise(index,"weight",Number(event.target.value))}/></label></div><button className="remove-exercise" aria-label={`Remover ${exercise.name}`} onClick={()=>setDraft(current=>({...current,[day]:{...current[day],exercises:current[day].exercises.filter((_,itemIndex)=>itemIndex!==index)}}))}>×</button></article>)}</div><button className="outline-add" onClick={addExercise}>＋ Adicionar exercício</button><button type="button" className="outline-add" onClick={async()=>{const copied=await copyToClipboard(formatWorkoutPrompt(draft[day]));setImportMessage(copied?"Treino copiado! Cole no campo abaixo em outro dia (sem precisar do cabeçalho do dia).":"Não foi possível copiar. Copie manualmente.");}}>⧉ Copiar treino deste dia</button><div className="prompt-import"><p className="eyebrow">IMPORTAR PLANO DA IA</p><p>Cole exercícios no formato “Supino reto - 4x12 - 20 kg” para adicionar neste dia ({weekdayLabels[day]}). Também aceita vários dias de uma vez, cada um com um cabeçalho como “Segunda-feira: Peito”.</p><textarea value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={"- Supino reto - 4x12 - 20 kg\n- Crucifixo - 3x12"}/><button type="button" onClick={()=>{const imported=parseWorkoutPrompt(prompt,draft,day);const count=Object.values(imported).reduce((sum,item)=>sum+item.exercises.length,0)-Object.values(draft).reduce((sum,item)=>sum+item.exercises.length,0);setDraft(imported);setImportMessage(count===0?"Revise o formato: não encontrei novos exercícios.":"Plano interpretado. Revise antes de salvar.");}}>Organizar texto</button>{importMessage&&<small>{importMessage}</small>}</div></div><button className="primary" onClick={()=>onSave(draft)}>Salvar treino</button></div></div>;
}

const honorPhrase = "Eu juro por Deus que eu fiz esse treino";
function WorkoutHonorModal({ day, onClose, onConfirm }: { day:number; onClose:()=>void; onConfirm:()=>void }) {
  const [value, setValue] = useState("");
  const ready = value.trim() === honorPhrase;
  return <div className="modal"><div className="sheet workout-editor honor-modal"><button className="sheet-close" onClick={onClose}>×</button><div className="workout-editor-scroll"><p className="eyebrow">{weekdayLabels[day].toLocaleUpperCase("pt-BR")}</p><h1>Marcar treino como feito</h1><p className="honor-intro">Vocês esqueceram de finalizar esse treino no app? Para marcar como concluído sem repetir os exercícios, digite exatamente a frase abaixo e confirme.</p><p className="honor-phrase">“{honorPhrase}”</p><label>Digite a frase<textarea value={value} onChange={event=>setValue(event.target.value)} placeholder={honorPhrase} rows={2}/></label></div><button className="primary" disabled={!ready} onClick={onConfirm}>Confirmar treino concluído</button></div></div>;
}

function canonicalClassDay(value: string) {
  const normalized=value.normalize("NFD").replace(/[̀-ͯ]/g,"").toLocaleLowerCase("pt-BR").replace(/-feira/g,"").trim();
  const days:Record<string,string>={domingo:"Domingo",dom:"Domingo",segunda:"Segunda-feira",seg:"Segunda-feira",terca:"Terça-feira",ter:"Terça-feira",quarta:"Quarta-feira",qua:"Quarta-feira",quinta:"Quinta-feira",qui:"Quinta-feira",sexta:"Sexta-feira",sex:"Sexta-feira",sabado:"Sábado",sab:"Sábado"};
  return days[normalized] || null;
}

function parseGroupClassPrompt(text:string):GroupClass[] {
  const parsed:GroupClass[]=[];
  let activeDay:string|null=null;
  text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).forEach((line,index)=>{
    const clean=line.replace(/^[-•*\d.)\s]+/,"").trim();
    const direct=clean.match(/^(.+?)\s*[-–|]\s*(.+?)\s*[-–|]\s*([0-2]?\d:[0-5]\d)$/);
    if(direct){const day=canonicalClassDay(direct[1]);if(day)parsed.push({id:`class-${Date.now()}-${index}`,day,name:direct[2].trim(),time:direct[3]});return;}
    const header=clean.match(/^([^:]+):$/);
    if(header){activeDay=canonicalClassDay(header[1]);return;}
    const activity=clean.match(/^(.+?)\s*[-–|]\s*([0-2]?\d:[0-5]\d)$/);
    if(activeDay&&activity)parsed.push({id:`class-${Date.now()}-${index}`,day:activeDay,name:activity[1].trim(),time:activity[2]});
  });
  return parsed;
}

function GroupClassEditor({ person, schedule, onClose, onSave }: { person:Person; schedule:GroupSchedule; onClose:()=>void; onSave:(schedule:GroupSchedule)=>void }) {
  const [items,setItems]=useState<GroupClass[]>(()=>JSON.parse(JSON.stringify(schedule[person])));
  const [prompt,setPrompt]=useState("");
  const [message,setMessage]=useState("");
  const update=(id:string,field:keyof GroupClass,value:string)=>setItems(current=>current.map(item=>item.id===id?{...item,[field]:value}:item));
  return <div className="modal"><div className="sheet workout-editor class-editor"><button className="sheet-close" onClick={onClose}>×</button><div className="workout-editor-scroll"><p className="eyebrow">AGENDA DE {person === "gileade" ? "GILEADE" : "RENATA"}</p><h1>Editar aulas coletivas</h1><p className="editor-intro">Configure as aulas que aparecerão na agenda de treinos.</p><div className="class-editor-list">{items.map(item=><article key={item.id}><select aria-label="Dia da aula" value={item.day} onChange={event=>update(item.id,"day",event.target.value)}>{["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"].map(day=><option key={day}>{day}</option>)}</select><input aria-label="Nome da aula" value={item.name} onChange={event=>update(item.id,"name",event.target.value)}/><input aria-label="Horário da aula" type="time" value={item.time} onChange={event=>update(item.id,"time",event.target.value)}/><button aria-label={`Remover ${item.name}`} onClick={()=>setItems(current=>current.filter(entry=>entry.id!==item.id))}>×</button></article>)}</div><button className="outline-add" onClick={()=>setItems(current=>[...current,{id:`manual-class-${Date.now()}`,day:"Segunda-feira",name:"Nova aula",time:"18:00"}])}>＋ Adicionar aula</button><div className="prompt-import"><p className="eyebrow">IMPORTAR AULAS DA IA</p><p>Cole vários dias e horários. As aulas reconhecidas substituirão esta lista depois que você revisar e salvar.</p><textarea value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={"Segunda-feira:\n- Muay Thai - 18:30\n- Funcional - 19:30\n\nSábado - Pilates - 09:00"}/><button type="button" onClick={()=>{const parsed=parseGroupClassPrompt(prompt);if(parsed.length){setItems(parsed);setMessage(`${parsed.length} aula(s) interpretada(s). Revise antes de salvar.`);}else setMessage("Não encontrei aulas. Confira o formato do texto.");}}>Organizar aulas</button>{message&&<small className={message.startsWith("Não")?"import-error":""}>{message}</small>}</div></div><button className="primary" onClick={()=>onSave({...schedule,[person]:items})}>Salvar aulas</button></div></div>;
}
