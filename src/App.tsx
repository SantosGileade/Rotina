"use client";

import { useEffect, useRef, useState } from "react";
import { ensureAnonymousSession, supabaseConfigured } from "./supabase";
import { currentHousehold, excludeTaskForToday, finishWorkout, insertTask, loadRotina, pairHousehold, removeTaskRecord, saveClasses, saveWorkoutPlan, setTaskDone, updateExerciseWeight } from "./database";

type Screen = "resumo" | "hoje" | "treino" | "metas" | "espiritual" | "conquistas";
type Person = "gileade" | "renata";
type WorkoutExercise = { id: string; name: string; sets: number; reps: string; muscle: string; weight: number };
type WorkoutDay = { title: string; muscles: string; duration: number; exercises: WorkoutExercise[] };
type WeeklyPlan = Record<number, WorkoutDay>;
type GroupClass = { id: string; day: string; name: string; time: string };
type GroupSchedule = Record<Person, GroupClass[]>;

const Icon = ({ children }: { children: React.ReactNode }) => <span className="icon">{children}</span>;
const Progress = ({ value, color = "purple" }: { value: number; color?: string }) => (
  <div className="progress"><i className={color} style={{ width: `${value}%` }} /></div>
);
const Confetti = () => <div className="confetti-screen" aria-hidden="true">{Array.from({length:58},(_,i)=><i key={i} style={{"--left":`${2+(i*29)%96}%`,"--drift":`${(i%9-4)*14}px`,"--delay":`${(i%16)*.12}s`,"--duration":`${3.2+(i%7)*.22}s`,"--color":["#f5c75f","#68d79a","#a98bfa","#60b5f5","#f28aa7"][i%5]} as React.CSSProperties}/>)}</div>;

const tasksSeed = [
  { id: "1", title: "Arrumar a cama", time: "08:00", tag: "Casa", level: "Fácil", coins: 5, done: true, person: "both", recurring: false },
  { id: "2", title: "Trabalhar no projeto", time: "até 12:00", tag: "Foco", level: "Difícil", coins: 20, done: false, person: "gileade", recurring: false },
  { id: "3", title: "Estudar inglês", time: "20 min", tag: "Estudo", level: "Médio", coins: 10, done: false, person: "renata", recurring: false },
  { id: "4", title: "Ler 10 páginas", time: "", tag: "Leitura", level: "Fácil", coins: 5, done: true, person: "both", recurring: false },
  { id: "5", title: "Comprar algo para o jantar", time: "18:30", tag: "Juntos", level: "Médio", coins: 10, done: false, person: "both", recurring: false },
  { id: "6", title: "Organizar as finanças", time: "", tag: "Casa", level: "Difícil", coins: 20, done: false, person: "gileade", recurring: false },
];

const defaultGroupClasses: GroupSchedule = {
  gileade: [{ id:"g-1", day: "Sexta-feira", name: "Muay Thai", time: "18:30" }, { id:"g-2", day: "Sábado", name: "Funcional", time: "09:00" }],
  renata: [{ id:"r-1", day: "Sexta-feira", name: "Pilates", time: "17:30" }, { id:"r-2", day: "Sábado", name: "Fit Dance", time: "10:00" }],
};

let celebrationAudio: AudioContext | null = null;
function playCelebrationSound() {
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  celebrationAudio ??= new AudioCtx(); void celebrationAudio.resume();
  const context = celebrationAudio;
  const now = context.currentTime;

  const wind = context.createBuffer(1, Math.floor(context.sampleRate * 1.8), context.sampleRate);
  const windData = wind.getChannelData(0);
  for (let index = 0; index < windData.length; index += 1) windData[index] = Math.random() * 2 - 1;
  const windSource = context.createBufferSource();
  const windFilter = context.createBiquadFilter();
  const windGain = context.createGain();
  windSource.buffer = wind;
  windFilter.type = "bandpass";
  windFilter.frequency.setValueAtTime(520, now);
  windFilter.frequency.exponentialRampToValueAtTime(1700, now + .85);
  windFilter.frequency.exponentialRampToValueAtTime(760, now + 1.65);
  windFilter.Q.value = .7;
  windGain.gain.setValueAtTime(.0001, now);
  windGain.gain.exponentialRampToValueAtTime(.075, now + .3);
  windGain.gain.exponentialRampToValueAtTime(.0001, now + 1.75);
  windSource.connect(windFilter).connect(windGain).connect(context.destination);
  windSource.start(now);
  windSource.stop(now + 1.8);

  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const noteGain = context.createGain();
    const start = now + .38 + index * .11;
    oscillator.type = index === 2 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.035, start + .75);
    noteGain.gain.setValueAtTime(.0001, start);
    noteGain.gain.exponentialRampToValueAtTime(.055, start + .08);
    noteGain.gain.exponentialRampToValueAtTime(.0001, start + 1.05);
    oscillator.connect(noteGain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 1.1);
  });
}

const longDate = (date: Date) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(date);
const dayAndMonth = (date: Date) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(date);
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
const classDayIndex = (day:string) => ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"].indexOf(day);
function nextGroupClass(classes:GroupClass[], now:Date) {
  return [...classes].sort((a,b)=>{
    const distance=(item:GroupClass)=>{const [hour,minute]=item.time.split(":").map(Number);let days=(classDayIndex(item.day)-now.getDay()+7)%7;if(days===0&&(hour<now.getHours()||(hour===now.getHours()&&minute<now.getMinutes())))days=7;return days*1440+hour*60+minute;};
    return distance(a)-distance(b);
  })[0];
}

export default function Home() {
  const [databaseState,setDatabaseState]=useState<"loading"|"ready"|"error">("loading");
  const [databaseError,setDatabaseError]=useState("");
  const [householdId,setHouseholdId]=useState("");
  const [databaseUserId,setDatabaseUserId]=useState("");
  const [screen, setScreen] = useState<Screen>("resumo");
  const [tasks, setTasks] = useState(tasksSeed);
  const [taskCompletions,setTaskCompletions]=useState<Record<string,Person[]>>({});
  const [coins, setCoins] = useState(0);
  const [toast, setToast] = useState("");
  const [exerciseOpen, setExerciseOpen] = useState(false);
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
  const [spiritualDone, setSpiritualDone] = useState(false);
  const [goalValues, setGoalValues] = useState([3, 5, 5, 4]);
  const [addingTask, setAddingTask] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<number | null>(null);
  const [editingClasses, setEditingClasses] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [weeklyPlans, setWeeklyPlans] = useState<Record<Person,WeeklyPlan>>(() => {
    try { const saved=JSON.parse(localStorage.getItem("rotina-weekly-plans")||"null");return saved||{gileade:defaultWeeklyPlan,renata:defaultWeeklyPlan}; }
    catch { return {gileade:defaultWeeklyPlan,renata:defaultWeeklyPlan}; }
  });
  const [groupSchedule, setGroupSchedule] = useState<GroupSchedule>(() => {
    try { return JSON.parse(localStorage.getItem("rotina-group-classes") || "null") || defaultGroupClasses; }
    catch { return defaultGroupClasses; }
  });
  const [person, setPerson] = useState<Person>(() => (localStorage.getItem("rotina-person") as Person) || "gileade");
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDragging, setSwipeDragging] = useState(false);
  const screenHistory = useRef<Screen[]>(["resumo"]);
  const edgeSwipe = useRef({ active: false, startX: 0, startY: 0 });
  const weeklyPlan=weeklyPlans[person];
  const visibleTasks = tasks.filter((task) => task.person === "both" || task.person === person).map(task=>({...task,done:(taskCompletions[task.id]||[]).includes(person)}));
  const done = visibleTasks.filter((t) => t.done).length;
  const taskPercent = visibleTasks.length ? Math.round(done / visibleTasks.length * 100) : 0;
  const summaryPercent = Math.round((taskPercent + (workoutDone ? 100 : Math.round((series - 1) / 4 * 100)) + (spiritualDone ? 100 : 0)) / 3);
  const [summaryCelebrationPending, setSummaryCelebrationPending] = useState(false);
  const previousSummaryPercent = useRef(summaryPercent);
  const selectPerson = (next: Person) => { setPerson(next);setWorkoutDone(completedWorkouts[next]); localStorage.setItem("rotina-person", next); };
  const saveWeeklyPlan = (next: WeeklyPlan) => { const all={...weeklyPlans,[person]:next};setWeeklyPlans(all);localStorage.setItem("rotina-weekly-plans",JSON.stringify(all));if(householdId)void saveWorkoutPlan(householdId,person,next).catch(error=>showDatabaseError(error)); };
  const saveGroupSchedule = (next: GroupSchedule) => { setGroupSchedule(next); localStorage.setItem("rotina-group-classes", JSON.stringify(next));if(householdId)void saveClasses(householdId,person,next[person]).catch(error=>showDatabaseError(error)); };

  function showDatabaseError(error:unknown){const message=error instanceof Error?error.message:typeof error==="object"&&error!==null&&"message" in error?String(error.message):"Não foi possível sincronizar com o Supabase.";setToast(`Erro: ${message}`);window.setTimeout(()=>setToast(""),4200);}

  async function hydrate(household:string){
    const data=await loadRotina(household);
    const completionMap:Record<string,Person[]>={};
    data.completions.forEach((item:any)=>{completionMap[item.task_id]=[...(completionMap[item.task_id]||[]),item.person as Person];});
    setTaskCompletions(completionMap);
    const excludedIds=new Set((data.exclusions as any[]).map((item:any)=>item.task_id));
    setTasks(data.tasks.filter((item:any)=>!excludedIds.has(item.id)).map((item:any)=>({id:item.id,title:item.title,time:item.task_time?.slice(0,5)||"",tag:item.category,level:item.difficulty==="hard"?"Difícil":item.difficulty==="medium"?"Médio":"Fácil",coins:item.coin_reward,done:false,person:item.assignment,recurring:Boolean(item.recurring)})));
    setCoins(data.balance);
    const plans:Record<Person,WeeklyPlan>={gileade:structuredClone(defaultWeeklyPlan),renata:structuredClone(defaultWeeklyPlan)};
    const ids:Record<Person,Record<number,string>>={gileade:{},renata:{}};
    for(const row of data.days as any[]){const owner=row.person as Person;ids[owner][row.day_of_week]=row.id;plans[owner][row.day_of_week]={title:row.title,muscles:row.muscles,duration:row.duration_minutes,exercises:(data.exercises as any[]).filter(item=>item.workout_day_id===row.id).map(item=>({id:item.id,name:item.name,sets:item.sets,reps:item.reps,muscle:item.muscle,weight:Number(item.weight)}))};}
    if(!(data.days as any[]).length){await Promise.all([saveWorkoutPlan(household,"gileade",defaultWeeklyPlan),saveWorkoutPlan(household,"renata",defaultWeeklyPlan),saveClasses(household,"gileade",defaultGroupClasses.gileade),saveClasses(household,"renata",defaultGroupClasses.renata)]);return hydrate(household);}
    setWeeklyPlans(plans);setWorkoutDayIds(ids);localStorage.setItem("rotina-weekly-plans",JSON.stringify(plans));
    const schedules:GroupSchedule={gileade:[],renata:[]};const dayNames=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
    (data.classes as any[]).forEach(item=>schedules[item.person as Person].push({id:item.id,day:dayNames[item.day_of_week],name:item.name,time:item.class_time.slice(0,5)}));setGroupSchedule(schedules);localStorage.setItem("rotina-group-classes",JSON.stringify(schedules));
    const todayStr=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}`;
    const completed={gileade:(data.sessions as any[]).some(item=>item.person==="gileade"&&item.completion_date===todayStr),renata:(data.sessions as any[]).some(item=>item.person==="renata"&&item.completion_date===todayStr)};setCompletedWorkouts(completed);setWorkoutDone(completed[person]);
    const trained:Record<Person,number[]>={gileade:[],renata:[]};
    (data.sessions as any[]).forEach(item=>{const owner=item.person as Person;const weekday=new Date(`${item.completion_date}T12:00:00`).getDay();if(!trained[owner].includes(weekday))trained[owner].push(weekday);});
    setTrainedWorkoutDays(trained);
    setDatabaseState("ready");
  }

  useEffect(()=>{void(async()=>{try{if(!supabaseConfigured)throw new Error("As variáveis do Supabase não foram configuradas.");const user=await ensureAnonymousSession();setDatabaseUserId(user.id);const existingHousehold=await currentHousehold();const household=existingHousehold||await pairHousehold("rotina-gileade-renata-2026");setHouseholdId(household);await hydrate(household);}catch(error){const message=error instanceof Error?error.message:typeof error==="object"&&error!==null&&"message" in error?String(error.message):"Falha ao conectar ao Supabase.";setDatabaseError(message);setDatabaseState("error");}})();},[]);
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
    const key=`rotina-summary-complete-${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    if(summaryPercent<100){localStorage.removeItem(key);setSummaryCelebrationPending(false);}
    else if(previousSummaryPercent.current<100||localStorage.getItem(key)!=="true")setSummaryCelebrationPending(true);
    previousSummaryPercent.current=summaryPercent;
  },[summaryPercent,now]);

  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";

  function reward(amount: number, message = "Boa! Vocês estão avançando") {
    setCoins((v) => v + amount);
    setToast(`+${amount} moedas · ${message}`);
    window.setTimeout(() => setToast(""), 2600);
  }

  function toggleTask(id: string) {
    const task = tasks.find((t) => t.id === id)!;
    const wasDone=(taskCompletions[id]||[]).includes(person);
    setTaskCompletions(current=>({...current,[id]:wasDone?(current[id]||[]).filter(item=>item!==person):[...(current[id]||[]),person]}));
    if (!wasDone) reward(task.coins); else setCoins((v) => Math.max(0, v - task.coins));
    void setTaskDone(id,person,!wasDone).catch(error=>{setTaskCompletions(current=>({...current,[id]:wasDone?[...(current[id]||[]),person]:(current[id]||[]).filter(item=>item!==person)}));showDatabaseError(error);});
  }

  const navigate = (next: Screen, fromBack = false) => {
    window.scrollTo(0, 0);
    setWorkout(false);
    setExerciseOpen(false);
    if (next === "treino" && screen !== "treino") setWorkoutDay(now.getDay());
    if (!fromBack && next !== screen) screenHistory.current.push(next);
    setScreen(next);
  };

  const startWorkout = (day: number) => {
    if (!weeklyPlan[day].exercises.length) return;
    window.scrollTo({top:0,behavior:"instant"});
    setWorkoutDay(day); setActiveExercise(0); setCompletedExercises([]); setExerciseProgress({}); setSeries(1); setRest(0); setExerciseReady(false); setWorkout(true);
  };

  const concludeSeries = () => {
    const exercise = weeklyPlan[workoutDay].exercises[activeExercise];
    if (exerciseReady) {
      const completed = [...completedExercises, exercise.id];
      setCompletedExercises(completed);
      const dayExercises = weeklyPlan[workoutDay].exercises;
      let nextIndex = -1;
      for (let offset = 1; offset <= dayExercises.length; offset += 1) {
        const candidate = (activeExercise + offset) % dayExercises.length;
        if (!completed.includes(dayExercises[candidate].id)) { nextIndex = candidate; break; }
      }
      if (nextIndex === -1) {
        const dayId=workoutDayIds[person][workoutDay];
        if(!dayId){showDatabaseError(new Error("O treino ainda não foi sincronizado."));return;}
        void finishWorkout(dayId,person).then(awarded=>{if(awarded)reward(80,"Treino completo!");const nextCompleted={...completedWorkouts,[person]:workoutDay===now.getDay()||completedWorkouts[person]};setCompletedWorkouts(nextCompleted);setWorkoutDone(nextCompleted[person]);setTrainedWorkoutDays(current=>({...current,[person]:current[person].includes(workoutDay)?current[person]:[...current[person],workoutDay]}));setWorkout(false);setSeries(1);setExerciseReady(false);}).catch(showDatabaseError);return;
      }
      setActiveExercise(nextIndex); setSeries(1); setRest(0); setExerciseReady(false); return;
    }
    if (series < exercise.sets) { const nextSeries=series+1; setRest(60); setSeries(nextSeries); setExerciseProgress(current=>({...current,[exercise.id]:{series:nextSeries,ready:false}})); }
    else { setRest(0); setExerciseReady(true); setExerciseProgress(current=>({...current,[exercise.id]:{series,ready:true}})); }
  };

  const changeWeight = (amount: number) => {
    const exercise = weeklyPlan[workoutDay].exercises[activeExercise];
    const nextWeight = Math.max(0, exercise.weight + amount);
    const next = { ...weeklyPlan, [workoutDay]: { ...weeklyPlan[workoutDay], exercises: weeklyPlan[workoutDay].exercises.map((item, index) => index === activeExercise ? { ...item, weight: nextWeight } : item) } };
    const all = { ...weeklyPlans, [person]: next };
    setWeeklyPlans(all);
    localStorage.setItem("rotina-weekly-plans", JSON.stringify(all));
    if (householdId) void updateExerciseWeight(exercise.id, nextWeight).catch(error => showDatabaseError(error));
  };

  const goBack = () => {
    if (exerciseOpen) return setExerciseOpen(false);
    if (workout) return setWorkout(false);
    if (addingTask) return setAddingTask(false);
    if (screenHistory.current.length > 1) screenHistory.current.pop();
    navigate(screenHistory.current.at(-1) || "resumo", true);
  };

  const startEdgeSwipe = (event: React.PointerEvent) => {
    const canGoBack=screenHistory.current.length>1||exerciseOpen||workout||addingTask;
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

  const addTask = async (task: { title: string; level: string; tag: string; time: string; recurring: boolean }) => {
    const coinMap: Record<string, number> = { "Fácil": 5, "Médio": 10, "Difícil": 20 };
    try{const assignment=task.tag==="Juntos"?"both":person;const row=await insertTask(householdId,databaseUserId,{title:task.title,category:task.tag,difficulty:task.level==="Difícil"?"hard":task.level==="Médio"?"medium":"easy",coin_reward:coinMap[task.level]||5,assignment,task_time:task.time||null,recurring:task.recurring});setTasks(current=>[...current,{id:row.id,...task,coins:coinMap[task.level]||5,done:false,person:assignment}]);setAddingTask(false);setToast("Atividade adicionada");window.setTimeout(()=>setToast(""),2200);}catch(error){showDatabaseError(error);}
  };

  if(databaseState!=="ready")return <DatabaseGate state={databaseState} error={databaseError}/>;

  return (
    <main className={`app-shell ${swipeOffset>0?"edge-moving":""} ${swipeDragging?"edge-dragging":""}`} style={{"--edge-swipe":`${swipeOffset}px`} as React.CSSProperties} onPointerDown={startEdgeSwipe} onPointerMove={moveEdgeSwipe} onPointerUp={endEdgeSwipe} onPointerCancel={endEdgeSwipe}>
      <div className="ambient one" /><div className="ambient two" />
      <header className={`topbar ${screen === "hoje" || screen === "treino" ? "today-topbar" : ""} ${workout?"workout-topbar":""}`}>
        {screen !== "hoje" && screen !== "treino" && <div className="brand-group"><button className="menu-trigger" onClick={() => setMenuOpen(true)} aria-label="Abrir configurações"><i/><i/><i/></button><button className="brand text-brand" onClick={() => navigate("resumo")}>Rotina</button></div>}
        {screen==="treino"&&workout&&<button className="workout-exit-top" onClick={()=>setWorkout(false)}>‹ Sair</button>}
        <button className="coin-pill" onClick={() => navigate("conquistas")}><Icon>✦</Icon><b>{coins}</b><small> moedas</small></button>
      </header>

      <section className="content" key={screen}>
        {screen === "resumo" && <Resumo now={now} greeting={greeting} done={done} total={visibleTasks.length} workoutDone={workoutDone} workoutProgress={(series - 1) / 4 * 100} spiritualDone={spiritualDone} goalValues={goalValues} person={person} classes={groupSchedule[person]} celebrateRequested={summaryCelebrationPending} onCelebrated={()=>{const key=`rotina-summary-complete-${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;localStorage.setItem(key,"true");setSummaryCelebrationPending(false);}} onGo={navigate} />}
        {screen === "hoje" && <Hoje now={now} tasks={visibleTasks} toggle={toggleTask} remove={(id) => {const task=tasks.find(t=>t.id===id);setTasks(current=>current.filter(task=>task.id!==id));if(task?.recurring)void excludeTaskForToday(id).catch(showDatabaseError);else void removeTaskRecord(id).catch(showDatabaseError);}} done={done} onAdd={() => setAddingTask(true)} />}
        {screen === "treino" && !workout && <Treino now={now} person={person} plan={weeklyPlan} classes={groupSchedule[person]} selectedDay={workoutDay} workoutDone={workoutDone} trainedDays={trainedWorkoutDays[person]} onSelectDay={setWorkoutDay} onDetail={() => setExerciseOpen(true)} onStart={startWorkout} onEdit={() => setEditingWorkout(workoutDay)} onEditClasses={() => setEditingClasses(true)} />}
        {screen === "treino" && workout && <WorkoutMode plan={weeklyPlan[workoutDay]} activeExercise={activeExercise} completed={completedExercises} series={series} rest={rest} ready={exerciseReady} onSeries={concludeSeries} onRestDone={()=>setRest(0)} onChoose={(index) => { const current=weeklyPlan[workoutDay].exercises[activeExercise]; setExerciseProgress(progress=>({...progress,[current.id]:{series,ready:exerciseReady}})); const target=exerciseProgress[weeklyPlan[workoutDay].exercises[index].id]; setActiveExercise(index); setSeries(target?.series||1); setRest(0); setExerciseReady(target?.ready||false); }} onWeight={changeWeight} />}
        {screen === "metas" && <Metas reward={reward} vals={goalValues} setVals={setGoalValues} />}
        {screen === "espiritual" && <Espiritual reward={reward} checked={spiritualDone} setChecked={setSpiritualDone} />}
        {screen === "conquistas" && <Conquistas coins={coins} setCoins={setCoins} setToast={setToast} />}
      </section>

      {!workout && <nav className="bottom-nav">
        {([
          ["resumo", "⌂", "Resumo"], ["hoje", "✓", "Hoje"], ["treino", "↗", "Treino"], ["metas", "◎", "Metas"], ["conquistas", "✦", "Conquistas"],
        ] as [Screen, string, string][]).map(([id, ico, label]) => <button key={id} onClick={() => navigate(id)} className={screen === id ? "active" : ""}>{id === "treino" ? <span className="icon workout-nav-icon">↑</span> : <Icon>{ico}</Icon>}<small>{label}</small></button>)}
      </nav>}
      {exerciseOpen && <ExerciseDetail onClose={() => setExerciseOpen(false)} />}
      {addingTask && <AddTaskModal onClose={() => setAddingTask(false)} onAdd={addTask} />}
      {menuOpen && <PersonMenu person={person} onSelect={selectPerson} onClose={() => setMenuOpen(false)} />}
      {editingWorkout !== null && <WorkoutEditor day={editingWorkout} plan={weeklyPlan} onClose={() => setEditingWorkout(null)} onSave={(next) => { saveWeeklyPlan(next); setEditingWorkout(null); }} />}
      {editingClasses && <GroupClassEditor person={person} schedule={groupSchedule} onClose={() => setEditingClasses(false)} onSave={(next) => { saveGroupSchedule(next); setEditingClasses(false); }} />}
      {toast && <div className={`toast ${toast.startsWith("+") ? "success" : ""}`}><span>✦</span>{toast}</div>}
    </main>
  );
}

function DatabaseGate({state,error}:{state:"loading"|"ready"|"error";error:string}){
  if(state==="loading")return <main className="database-gate"><div className="database-loader"/><h1>Preparando a Rotina</h1><p>Conectando seus dados com segurança.</p></main>;
  if(state==="error"&&error.toLocaleLowerCase("pt-BR").includes("anonymous"))return <main className="database-gate"><span className="gate-icon">!</span><h1>Ative o acesso anônimo</h1><p>No Supabase, abra Authentication → Providers → Anonymous Sign-Ins e ative a opção. Depois atualize o aplicativo.</p></main>;
  return <main className="database-gate"><span className="gate-icon">!</span><h1>Não foi possível conectar</h1><p>{error||"Atualize o aplicativo e tente novamente."}</p></main>;
}

function Resumo({ now, greeting, done, total, workoutDone, workoutProgress, spiritualDone, goalValues, person, classes, celebrateRequested, onCelebrated, onGo }: { now: Date; greeting: string; done: number; total: number; workoutDone: boolean; workoutProgress: number; spiritualDone: boolean; goalValues: number[]; person: Person; classes:GroupClass[]; celebrateRequested:boolean; onCelebrated:()=>void; onGo: (s: Screen) => void }) {
  const taskPercent = total ? Math.round(done / total * 100) : 0;
  const trainingPercent = workoutDone ? 100 : Math.round(workoutProgress);
  const spiritualPercent = spiritualDone ? 100 : 0;
  const goalPercent = Math.round(goalValues.reduce((sum, value, index) => sum + (index === 0 ? Math.min(value / 4, 1) : Math.min(value / 7, 1)), 0) / goalValues.length * 100);
  const weekRows = [["Afazeres", taskPercent, "green"], ["Treino", trainingPercent, "purple"], ["Espiritual", spiritualPercent, "blue"], ["Metas", goalPercent, "orange"]] as const;
  const weekScore = Math.round(weekRows.reduce((sum, row) => sum + row[1], 0) / weekRows.length);
  const dayPercent = Math.round((taskPercent + trainingPercent + spiritualPercent) / 3);
  const [celebrating, setCelebrating] = useState(false);
  const [animatedTaskPercent, setAnimatedTaskPercent] = useState(0);
  const [focusCollapsed, setFocusCollapsed] = useState(() => localStorage.getItem("rotina-focus-collapsed") === "true");
  const nextClass = nextGroupClass(classes, now);
  const toggleFocus = () => setFocusCollapsed((collapsed) => { localStorage.setItem("rotina-focus-collapsed", String(!collapsed)); return !collapsed; });
  useEffect(() => {
    const start = window.setTimeout(() => setAnimatedTaskPercent(dayPercent), 120);
    let finish: number | undefined;
    if (dayPercent === 100 && celebrateRequested) {
      const celebrate = window.setTimeout(() => setCelebrating(true), 380);
      const sound = window.setTimeout(playCelebrationSound, 420);
      const consumed = window.setTimeout(onCelebrated, 450);
      finish = window.setTimeout(() => setCelebrating(false), 6200);
      return () => { window.clearTimeout(start); window.clearTimeout(celebrate); window.clearTimeout(sound); window.clearTimeout(consumed); if(finish) window.clearTimeout(finish); };
    }
    return () => window.clearTimeout(start);
  }, [dayPercent, celebrateRequested]);
  return <>
    <div className="hero-head compact"><div><p className="eyebrow">{longDate(now).toLocaleUpperCase("pt-BR")}</p><h1>{greeting}, Gileade e Renata <span>♥</span></h1></div><div className="couple"><span>G</span><span>R</span></div></div>
    <article className={`compact-focus ${focusCollapsed ? "collapsed" : ""} ${celebrating ? "celebrating" : ""}`}><button className="focus-toggle" onClick={toggleFocus} aria-label={focusCollapsed ? "Expandir foco da semana" : "Minimizar foco da semana"} aria-expanded={!focusCollapsed}><i /></button><div className="focus-copy"><small>Foco da semana</small><b>Disciplina hoje, liberdade amanhã.</b></div><div className="focus-progress-row"><span>Progresso geral do dia</span><strong>{dayPercent}%</strong></div><Progress value={animatedTaskPercent} /></article>{celebrating && <Confetti />}
    <div className="section-title summary-title"><h2>Resumo do dia</h2></div>
    <div className="stats-grid home-stats">
      <button onClick={() => onGo("hoje")} className="stat-card"><small>Afazeres</small><strong>{done}<em>/{total}</em></strong><span>concluídos</span></button>
      <button onClick={() => onGo("treino")} className="stat-card"><small>Treino</small><strong>{workoutDone ? 1 : 0}<em>/1</em></strong><span>{workoutDone ? "concluído" : "pendente"}</span></button>
      <button onClick={() => onGo("espiritual")} className="stat-card"><small>Espiritual</small><strong>{spiritualDone ? 1 : 0}<em>/1</em></strong><span>{spiritualDone ? "concluído" : "pendente"}</span></button>
      <button onClick={() => onGo("metas")} className="stat-card"><small>Metas</small><strong>{goalPercent}<em>%</em></strong><span>da semana</span></button>
    </div>
    <div className="section-title next-title"><h2>Próximo</h2><button onClick={() => { onGo("treino"); setTimeout(() => document.getElementById("aulas-coletivas")?.scrollIntoView(), 80); }}>Ver mais</button></div>
    <div className="next-grid">
      <button className="next-mini next-single" onClick={() => { onGo("treino"); setTimeout(() => document.getElementById("aulas-coletivas")?.scrollIntoView(), 80); }}><i className="blue-line"/><b>{nextClass?.name || "Nenhuma aula configurada"}</b><small>{nextClass ? `${nextClass.day} · ${nextClass.time}` : "Configure na tela de treino"}</small></button>
    </div>
    <div className="week-card"><div className="section-title"><div><p>NOSSA SEMANA</p><h2>{weekScore >= 70 ? "Vocês estão no ritmo" : "Cada passo conta"}</h2></div><div className="week-score">{weekScore}<small>%</small></div></div>{weekRows.map(([n,v,c]) => <div className="week-row" key={n}><span>{n}</span><Progress value={v} color={c} /><b>{v}%</b></div>)}<div className="highlight">🏋️ <span><b>{workoutDone ? "Treino de hoje concluído" : "O treino de hoje está esperando"}</b><small>{workoutDone ? "Mais um passo construído juntos." : "Comecem quando estiverem prontos."}</small></span></div></div>
  </>;
}

function Hoje({ now, tasks, toggle, remove, done, onAdd }: { now: Date; tasks: typeof tasksSeed; toggle: (id: string) => void; remove: (id:string)=>void; done: number; onAdd:()=>void }) {
  const percent = tasks.length ? Math.round(done/tasks.length*100) : 0;
  const calendarDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(now); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + index - 3); return date; });
  const previousPercent = useRef(percent);
  const [celebrating,setCelebrating] = useState(false);
  useEffect(()=>{
    const crossed = previousPercent.current < 70 && percent >= 70;
    previousPercent.current = percent;
    if(crossed){ playCelebrationSound(); setCelebrating(true); const timer=window.setTimeout(()=>setCelebrating(false),6200); return ()=>window.clearTimeout(timer); }
  },[percent]);
  return <><div className="today-head"><h1>Hoje</h1><p>{dayAndMonth(now)}, {weekday(now)}</p></div><div className="calendar-strip">{calendarDays.map((date,index) => <button className={index===3?"selected":""} key={date.toISOString()}><small>{new Intl.DateTimeFormat("pt-BR", { weekday: "narrow" }).format(date).toLocaleUpperCase("pt-BR")}</small><b>{date.getDate()}</b>{index===3&&<i/>}</button>)}</div><div className="tasks-focus"><div className="section-title"><div><p>ATIVIDADES DE HOJE</p><h2>Afazeres do dia</h2></div><button onClick={onAdd}>＋ Adicionar</button></div><div className={`daily-progress milestone-progress ${celebrating?"celebrating":""}`}><div><span>Progresso do dia</span><b>{done} de {tasks.length} · {percent}%</b></div><Progress value={percent} color="green" /></div><div className="task-list">{tasks.map(t => <SwipeTask key={t.id} task={t} onToggle={()=>toggle(t.id)} onDelete={()=>remove(t.id)} />)}</div></div>{celebrating&&<Confetti/>}</>;
}

function SwipeTask({ task, onToggle, onDelete }: { task: typeof tasksSeed[number]; onToggle:()=>void; onDelete:()=>void }) {
  const start = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);
  const down = (e:React.PointerEvent) => { start.current={x:e.clientX,y:e.clientY}; moved.current=false; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e:React.PointerEvent) => { if(!dragging)return; const dx=e.clientX-start.current.x; const dy=e.clientY-start.current.y; if(Math.abs(dy)>35){setOffset(0);return;} if(dx<0){setOffset(Math.max(-125,dx)); if(dx<-12)moved.current=true;} };
  const up = () => { setDragging(false); if(offset<=-105) onDelete(); setOffset(0); };
  return <div className="swipe-task"><div className="delete-reveal"><span>⌫</span><b>Excluir</b></div><button className={`task ${task.done?"done":""}`} style={{transform:`translateX(${offset}px)`,transition:dragging?"none":"transform .22s ease"}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={()=>{if(!moved.current)onToggle();}}><span className="check">{task.done&&"✓"}</span><span className="task-copy"><b>{task.title}{task.recurring&&<i className="recurring-badge" title="Tarefa rotineira">↻</i>}</b><small>{task.tag} · <em className={task.level.toLowerCase()}>{task.level}</em> · +{task.coins} ✦</small></span><time>{task.time}</time></button></div>;
}

function AddTaskModal({ onClose, onAdd }: { onClose:()=>void; onAdd:(task:{title:string;level:string;tag:string;time:string;recurring:boolean})=>void }) {
  const [title,setTitle]=useState(""); const [level,setLevel]=useState("Fácil"); const [tag,setTag]=useState("Casa"); const [time,setTime]=useState(""); const [recurring,setRecurring]=useState(false);
  return <div className="modal"><form className="sheet task-form" onSubmit={(e)=>{e.preventDefault();if(title.trim())onAdd({title:title.trim(),level,tag,time,recurring});}}><button type="button" className="sheet-close" onClick={onClose}>×</button><p className="eyebrow">NOVA ATIVIDADE</p><h1>Adicionar afazer</h1><label>Nome da atividade<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Organizar a cozinha" /></label><label>Horário <small>(opcional)</small><input type="time" value={time} onChange={e=>setTime(e.target.value)} /></label><fieldset><legend>Dificuldade</legend><div className="choice-row">{["Fácil","Médio","Difícil"].map(item=><button type="button" key={item} className={level===item?"selected":""} onClick={()=>setLevel(item)}>{item}</button>)}</div></fieldset><fieldset><legend>Categoria</legend><div className="choice-row categories">{["Casa","Juntos","Pessoal","Estudo","Saúde"].map(item=><button type="button" key={item} className={tag===item?"selected":""} onClick={()=>setTag(item)}>{item}</button>)}</div></fieldset><label className="recurring-toggle"><input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} /><span><b>Repetir todos os dias</b><small>Aparece diariamente. Excluir num dia some só naquele dia.</small></span></label><button className="primary" type="submit">Adicionar atividade</button></form></div>;
}

function Treino({ now, person, plan, classes, selectedDay, workoutDone, trainedDays, onSelectDay, onDetail, onStart, onEdit, onEditClasses }: { now:Date; person:Person; plan:WeeklyPlan; classes:GroupClass[]; selectedDay:number; workoutDone:boolean; trainedDays:number[]; onSelectDay:(day:number)=>void; onDetail:()=>void; onStart:(day:number)=>void; onEdit:()=>void; onEditClasses:()=>void }) {
  const today = now.getDay();
  const nextTrainingDay = Array.from({length:7},(_,index)=>(today+index+1)%7).find(day=>plan[day].exercises.length>0) ?? (today+1)%7;
  const shown = plan[selectedDay];
  const [expandedCompleted,setExpandedCompleted]=useState(false);
  const [expandedClasses,setExpandedClasses]=useState(false);
  const hideCompletedList = workoutDone && selectedDay === today && !expandedCompleted;
  const todayName=weekday(now).toLocaleLowerCase("pt-BR");
  const todayClasses=classes.filter(item=>item.day.toLocaleLowerCase("pt-BR")===todayName);
  const visibleClasses=expandedClasses?classes:todayClasses;
  return <>
    <div className="page-head workout-page-head"><p className="eyebrow">{selectedDay === today ? "TREINO DE HOJE" : weekdayLabels[selectedDay].toLocaleUpperCase("pt-BR")}</p><h1>Treino de {person === "gileade" ? "Gileade" : "Renata"}</h1><p>{workoutDone&&selectedDay===today?"Treino concluído. Bom trabalho!":shown.exercises.length ? `Foco em ${shown.muscles}.` : "Dia de recuperação e descanso."}</p></div>
    <div className="workout-week">{weekdayLabels.map((label,day)=>{const trained=trainedDays.includes(day);return <button key={label} className={`${selectedDay===day?"selected":""} ${day===today?"today":""} ${trained?"trained":""}`} onClick={()=>onSelectDay(day)}><small>{label}</small><span>{trained?"✓":plan[day].exercises.length ? plan[day].title.replace("Treino ","") : "—"}</span></button>;})}</div>
    <article className={`workout-hero compact-workout ${workoutDone && selectedDay===today?"completed-workout":""}`}><div className="workout-art has-image"><img src={`${import.meta.env.BASE_URL}rotina-casal.png`} alt="Casal construindo sua rotina de treino" /><span>{shown.muscles.toLocaleUpperCase("pt-BR")}</span>{workoutDone&&selectedDay===today&&<b className="workout-done-badge">✓ CONCLUÍDO</b>}</div><div className="workout-copy"><p>{shown.title.toLocaleUpperCase("pt-BR")}</p><h2>{shown.muscles}</h2><div className="workout-meta"><span>◉ {shown.exercises.length} exercícios</span><span>◷ {shown.duration} min</span><span>✦ +80</span></div>{shown.exercises.length>0 && selectedDay===today && !workoutDone && <button className="primary" onClick={()=>onStart(selectedDay)}>Iniciar treino</button>}</div></article>
    {workoutDone&&selectedDay===today&&<article className="next-workout-preview"><small>PRÓXIMO TREINO · {weekdayLabels[nextTrainingDay].toLocaleUpperCase("pt-BR")}</small><div><span><b>{plan[nextTrainingDay].title}</b><em>{plan[nextTrainingDay].muscles}</em></span><strong>{plan[nextTrainingDay].exercises.length} exercícios</strong></div></article>}
    <div className="section-title workout-list-title"><div><p>{selectedDay===today?"PROGRAMAÇÃO DO DIA":weekdayLabels[selectedDay].toLocaleUpperCase("pt-BR")}</p><h2>Exercícios</h2></div><button onClick={onEdit}>Editar</button></div>
    {workoutDone&&selectedDay===today&&<button className="completed-expand" onClick={()=>setExpandedCompleted(value=>!value)}>{expandedCompleted?"Ocultar exercícios":"Ver treino concluído"}<i className={expandedCompleted?"open":""}/></button>}
    {!hideCompletedList&&<div className="exercise-list">{shown.exercises.length ? shown.exercises.map((exercise,index)=><button key={exercise.id} onClick={onDetail}><span className="exercise-num">{String(index+1).padStart(2,"0")}</span><span><b>{exercise.name}</b><small>{exercise.sets} séries × {exercise.reps} · {exercise.muscle}</small></span><em>{exercise.weight ? `${exercise.weight} kg` : "—"}</em></button>) : <div className="empty-workout">Nenhum exercício configurado para este dia.</div>}</div>}
    <section className="group-classes" id="aulas-coletivas"><div className="section-title"><div><p>AGENDA DE {person === "gileade" ? "GILEADE" : "RENATA"}</p><h2>Aulas coletivas</h2></div><button onClick={onEditClasses}>Editar</button></div><div className="class-calendar">{visibleClasses.length ? visibleClasses.map((item,index)=><article key={item.id} className={index===0&&!expandedClasses?"next-class":""}><span>{item.day}</span><div><b>{item.name}</b><small>{item.time}</small></div></article>) : <div className="empty-workout">Nenhuma aula coletiva para hoje.</div>}</div>{classes.length>todayClasses.length&&<button className="classes-expand" onClick={()=>setExpandedClasses(value=>!value)} aria-label={expandedClasses?"Mostrar somente as aulas de hoje":"Mostrar aulas de todos os dias"}><i className={expandedClasses?"open":""}/><span>{expandedClasses?"Mostrar somente hoje":"Ver todos os dias"}</span></button>}</section>
  </>;
}

function PersonMenu({ person, onSelect, onClose }: { person:Person; onSelect:(person:Person)=>void; onClose:()=>void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="person-drawer" onClick={event=>event.stopPropagation()}><div className="drawer-head"><div><small>CONFIGURAÇÕES</small><h2>Pessoa ativa</h2></div><button onClick={onClose}>×</button></div><p>Escolha de quem você quer visualizar tarefas, treinos e aulas.</p><div className={`person-switch ${person}`}><button className={person==="gileade"?"active":""} onClick={()=>onSelect("gileade")}><span>G</span>Gileade</button><button className={person==="renata"?"active":""} onClick={()=>onSelect("renata")}><span>R</span>Renata</button><i/></div><div className="shared-note"><span>✦</span><div><b>Saldo compartilhado</b><small>As moedas pertencem ao casal.</small></div></div></aside></div>;
}

function ExerciseDetail({ onClose }: { onClose:()=>void }) { const [tab,setTab]=useState("Como fazer"); return <div className="modal"><div className="sheet"><button className="sheet-close" onClick={onClose}>×</button><p className="eyebrow">EXERCÍCIO 01</p><h1>Supino reto</h1><div className="exercise-visual"><div className="bench">●━━━━●<br/><span>╱▰╲</span></div><button>▶</button><small>Veja a execução</small></div><div className="tabs">{["Como fazer","Músculos","Dicas"].map(t=><button onClick={()=>setTab(t)} className={tab===t?"active":""} key={t}>{t}</button>)}</div><p className="description">{tab==="Como fazer"?"Deite no banco, mantenha os pés firmes e desça a barra de forma controlada até a linha do peito.":tab==="Músculos"?"Peitoral maior, tríceps e deltoide anterior.":"Mantenha as escápulas encaixadas e evite tirar o quadril do banco."}</p><div className="detail-grid"><div><small>Séries</small><b>4</b></div><div><small>Repetições</small><b>10–12</b></div><div><small>Descanso</small><b>60 seg</b></div><div><small>Carga</small><b>20 kg</b></div></div></div></div> }

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
];
const normalizeExerciseName=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
function getExerciseGuide(name:string){const normalized=normalizeExerciseName(name);return exerciseGuides.find(item=>item.names.some(alias=>normalized.includes(alias)));}

function WorkoutMode({ plan, activeExercise, completed, series, rest, ready, onSeries, onRestDone, onChoose, onWeight }: { plan:WorkoutDay; activeExercise:number; completed:string[]; series:number; rest:number; ready:boolean; onSeries:()=>void; onRestDone:()=>void; onChoose:(index:number)=>void; onWeight:(amount:number)=>void }) {
  const exercise = plan.exercises[activeExercise];
  const guide = getExerciseGuide(exercise.name);
  const completedCount = completed.length;
  const finalAction=ready;
  return <div className="workout-mode"><div className="mode-top"><span>EXERCÍCIO {activeExercise+1} DE {plan.exercises.length}</span><b>{completedCount}/{plan.exercises.length} feitos</b></div><Progress value={completedCount/plan.exercises.length*100}/><div className="mode-center"><div className={`exercise-orb ${guide?"has-guide":""}`}>{guide?<img src={`${import.meta.env.BASE_URL}exercises/${guide.image}`} alt={`Demonstração de ${exercise.name}`}/>:<span>Imagem ainda<br/>não disponível</span>}</div>{guide&&<p className="exercise-quick-tip">{guide.tip}</p>}<p className="series-indicator">SÉRIE <strong>{series}</strong> DE {exercise.sets}</p><h1>{exercise.name}</h1><div className="rep-number">{exercise.reps}<small>{exercise.reps.includes("min")||exercise.reps.includes("seg")?"duração":"repetições"}</small></div><div className="load-control"><button className="step-small" onClick={()=>onWeight(-5)} aria-label="Diminuir 5kg">−5</button><button onClick={()=>onWeight(-1)} aria-label="Diminuir carga">−</button><div><b>{exercise.weight}</b><small>{exercise.weight ? "kg de cada lado" : "sem carga"}</small></div><button onClick={()=>onWeight(1)} aria-label="Aumentar carga">＋</button><button className="step-small" onClick={()=>onWeight(5)} aria-label="Aumentar 5kg">+5</button></div>{rest>0&&<div className="rest active-rest"><span>Descanso</span><b>00:{String(rest).padStart(2,"0")}</b></div>}</div><div className="exercise-order"><small>TROCAR ORDEM</small><div>{plan.exercises.map((item,index)=><button key={item.id} disabled={completed.includes(item.id)} className={index===activeExercise?"active":""} onClick={()=>onChoose(index)}><span>{completed.includes(item.id)?"✓":index+1}</span>{item.name}</button>)}</div></div><button className={`primary fixed-action ${finalAction?"finish-action":"series-action"}`} onClick={rest>0?onRestDone:onSeries}>{rest>0?`Iniciar série ${series}`:ready ? (completedCount===plan.exercises.length-1?"Finalizar treino":"Finalizar exercício") : series===exercise.sets?"Concluir última série":"Concluir série"}</button></div>;
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
  return <div className="modal"><div className="sheet workout-editor"><button className="sheet-close" onClick={onClose}>×</button><p className="eyebrow">{weekdayLabels[day].toLocaleUpperCase("pt-BR")}</p><h1>Editar treino</h1><label>Nome do treino<input value={draft[day].title} onChange={event=>setDraft({...draft,[day]:{...draft[day],title:event.target.value}})}/></label><label>Grupos musculares<input value={draft[day].muscles} onChange={event=>setDraft({...draft,[day]:{...draft[day],muscles:event.target.value}})}/></label><div className="editor-exercises">{draft[day].exercises.map((exercise,index)=><article key={exercise.id}><input aria-label="Nome do exercício" value={exercise.name} onChange={event=>updateExercise(index,"name",event.target.value)}/><div><label>Séries<input type="number" min="1" value={exercise.sets} onChange={event=>updateExercise(index,"sets",Number(event.target.value))}/></label><label>Repetições<input value={exercise.reps} onChange={event=>updateExercise(index,"reps",event.target.value)}/></label><label>Carga<input type="number" min="0" value={exercise.weight} onChange={event=>updateExercise(index,"weight",Number(event.target.value))}/></label></div><button className="remove-exercise" aria-label={`Remover ${exercise.name}`} onClick={()=>setDraft(current=>({...current,[day]:{...current[day],exercises:current[day].exercises.filter((_,itemIndex)=>itemIndex!==index)}}))}>×</button></article>)}</div><button className="outline-add" onClick={addExercise}>＋ Adicionar exercício</button><button type="button" className="outline-add" onClick={async()=>{const copied=await copyToClipboard(formatWorkoutPrompt(draft[day]));setImportMessage(copied?"Treino copiado! Cole no campo abaixo em outro dia (sem precisar do cabeçalho do dia).":"Não foi possível copiar. Copie manualmente.");}}>⧉ Copiar treino deste dia</button><div className="prompt-import"><p className="eyebrow">IMPORTAR PLANO DA IA</p><p>Cole exercícios no formato “Supino reto - 4x12 - 20 kg” para adicionar neste dia ({weekdayLabels[day]}). Também aceita vários dias de uma vez, cada um com um cabeçalho como “Segunda-feira: Peito”.</p><textarea value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={"- Supino reto - 4x12 - 20 kg\n- Crucifixo - 3x12"}/><button type="button" onClick={()=>{const imported=parseWorkoutPrompt(prompt,draft,day);const count=Object.values(imported).reduce((sum,item)=>sum+item.exercises.length,0)-Object.values(draft).reduce((sum,item)=>sum+item.exercises.length,0);setDraft(imported);setImportMessage(count===0?"Revise o formato: não encontrei novos exercícios.":"Plano interpretado. Revise antes de salvar.");}}>Organizar texto</button>{importMessage&&<small>{importMessage}</small>}</div><button className="primary" onClick={()=>onSave(draft)}>Salvar treino</button></div></div>;
}

function canonicalClassDay(value: string) {
  const normalized=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").replace(/-feira/g,"").trim();
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
  return <div className="modal"><div className="sheet workout-editor class-editor"><button className="sheet-close" onClick={onClose}>×</button><p className="eyebrow">AGENDA DE {person === "gileade" ? "GILEADE" : "RENATA"}</p><h1>Editar aulas coletivas</h1><p className="editor-intro">Configure as aulas que aparecerão em “Próximo” e na agenda de treinos.</p><div className="class-editor-list">{items.map(item=><article key={item.id}><select aria-label="Dia da aula" value={item.day} onChange={event=>update(item.id,"day",event.target.value)}>{["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"].map(day=><option key={day}>{day}</option>)}</select><input aria-label="Nome da aula" value={item.name} onChange={event=>update(item.id,"name",event.target.value)}/><input aria-label="Horário da aula" type="time" value={item.time} onChange={event=>update(item.id,"time",event.target.value)}/><button aria-label={`Remover ${item.name}`} onClick={()=>setItems(current=>current.filter(entry=>entry.id!==item.id))}>×</button></article>)}</div><button className="outline-add" onClick={()=>setItems(current=>[...current,{id:`manual-class-${Date.now()}`,day:"Segunda-feira",name:"Nova aula",time:"18:00"}])}>＋ Adicionar aula</button><div className="prompt-import"><p className="eyebrow">IMPORTAR AULAS DA IA</p><p>Cole vários dias e horários. As aulas reconhecidas substituirão esta lista depois que você revisar e salvar.</p><textarea value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={"Segunda-feira:\n- Muay Thai - 18:30\n- Funcional - 19:30\n\nSábado - Pilates - 09:00"}/><button type="button" onClick={()=>{const parsed=parseGroupClassPrompt(prompt);if(parsed.length){setItems(parsed);setMessage(`${parsed.length} aula(s) interpretada(s). Revise antes de salvar.`);}else setMessage("Não encontrei aulas. Confira o formato do texto.");}}>Organizar aulas</button>{message&&<small className={message.startsWith("Não")?"import-error":""}>{message}</small>}</div><button className="primary" onClick={()=>onSave({...schedule,[person]:items})}>Salvar aulas</button></div></div>;
}

function Metas({ reward, vals, setVals }: { reward:(n:number,s?:string)=>void; vals:number[]; setVals:React.Dispatch<React.SetStateAction<number[]>> }) { const goals=[["Treinar 4× por semana","3 de 4",75,"↗","purple",20],["Beber 2L de água","5 de 7 dias",71,"♒","blue",10],["Dormir 8h por noite","5 de 7 dias",71,"☾","orange",10],["Devocional juntos","4 de 7 dias",57,"☼","green",15]]; const overall=Math.round(vals.reduce((sum,v,i)=>sum+(i===0?Math.min(v/4,1):Math.min(v/7,1)),0)/vals.length*100); return <><div className="page-head"><p className="eyebrow">PROGRESSO</p><h1>Metas do casal</h1><p>Pequenos passos, grandes mudanças.</p></div><div className="goal-feature"><div><Icon>◎</Icon><span><small>CONSISTÊNCIA GERAL</small><b>Vocês estão a todo vapor</b></span></div><strong>{overall}<small>%</small></strong></div><div className="tabs simple"><button className="active">Ativas</button><button>Concluídas</button></div><div className="goals">{goals.map((g,i)=><button key={String(g[0])} onClick={()=>{const limit=i===0?4:7;if(vals[i]<limit){setVals(vals.map((v,x)=>x===i?v+1:v)); reward(Number(g[5]),"Meta atualizada");}}}><span className={`goal-icon ${g[4]}`}>{g[3]}</span><span className="goal-main"><b>{g[0]}</b><small>{i===0?`${Math.min(vals[i],4)} de 4`:`${vals[i]} de 7 dias`} <em>+{g[5]} ✦</em></small><Progress value={i===0?Math.min(vals[i]/4*100,100):vals[i]/7*100} color={String(g[4])}/></span><strong>{i===0?Math.min(vals[i]/4*100,100).toFixed(0):(vals[i]/7*100).toFixed(0)}%</strong></button>)}</div><button className="outline-add">＋ Nova meta</button></> }

function Espiritual({ reward, checked, setChecked }: { reward:(n:number,s?:string)=>void; checked:boolean; setChecked:React.Dispatch<React.SetStateAction<boolean>> }) { return <><div className="page-head"><p className="eyebrow">VIDA ESPIRITUAL</p><h1>Um tempo com Deus</h1></div><article className="verse"><span>“</span><p>Entregue o seu caminho ao Senhor; confie nele, e ele agirá.</p><small>SALMOS 37:5</small></article><article className={`devotional ${checked?"complete":""}`}><div className="dev-head"><Icon>☼</Icon><div><p>DEVOCIONAL DE HOJE</p><h2>{checked?"Feito juntos":"Já fizeram hoje?"}</h2></div><span>+15 ✦</span></div><button className="primary" onClick={()=>{if(!checked){setChecked(true);reward(15,"Momento espiritual concluído");}}}>{checked?"Concluído ♥":"Marcar como concluído"}</button></article></> }

function Conquistas({ coins, setCoins, setToast }: { coins:number; setCoins:React.Dispatch<React.SetStateAction<number>>; setToast:(s:string)=>void }) { const rewards=[["🍦","Sorvete juntos",300],["🎬","Noite de cinema",500],["🍣","Japonês",700]]; return <><div className="page-head"><p className="eyebrow">NOSSO PROGRESSO</p><h1>Conquistas</h1><p>Celebrem cada passo do caminho.</p></div><article className="balance"><p>SALDO DO CASAL</p><h2><span>✦</span>{coins.toLocaleString("pt-BR")}</h2><small>moedas disponíveis</small><div><span>Este mês <b>+285</b></span><span>Resgatadas <b>600</b></span></div></article><div className="section-title"><div><p>BADGES</p><h2>Conquistas recentes</h2></div><button>Ver todas</button></div><div className="badges"><div className="badge unlocked"><span>🔥</span><b>Foco total</b><small>5 dias perfeitos</small></div><div className="badge unlocked"><span>🏋️</span><b>Constância</b><small>10 treinos</small></div><div className="badge"><span>♥</span><b>Sempre juntos</b><small>18/25 atividades</small></div></div><div className="section-title"><div><p>LOJINHA</p><h2>Recompensas</h2></div></div><div className="rewards">{rewards.map(([ico,name,price])=><button key={String(name)} onClick={()=>{if(coins>=Number(price)){setCoins(v=>v-Number(price));setToast(`🎉 ${name} resgatado!`);setTimeout(()=>setToast(""),2600);}else{setToast(`Faltam ${Number(price)-coins} moedas`);setTimeout(()=>setToast(""),2600);}}}><span>{ico}</span><span><b>{name}</b><small>Momento para vocês</small></span><em>✦ {price}</em></button>)}</div></> }
