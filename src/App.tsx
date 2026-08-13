"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Screen = "resumo" | "hoje" | "treino" | "metas" | "espiritual" | "conquistas";
type Person = "gileade" | "renata";

const Icon = ({ children }: { children: React.ReactNode }) => <span className="icon">{children}</span>;
const Progress = ({ value, color = "purple" }: { value: number; color?: string }) => (
  <div className="progress"><i className={color} style={{ width: `${value}%` }} /></div>
);
const Confetti = () => <div className="confetti-screen" aria-hidden="true">{Array.from({length:58},(_,i)=><i key={i} style={{"--left":`${2+(i*29)%96}%`,"--drift":`${(i%9-4)*14}px`,"--delay":`${(i%16)*.12}s`,"--duration":`${3.2+(i%7)*.22}s`,"--color":["#f5c75f","#68d79a","#a98bfa","#60b5f5","#f28aa7"][i%5]} as React.CSSProperties}/>)}</div>;

const tasksSeed = [
  { id: 1, title: "Arrumar a cama", time: "08:00", tag: "Casa", level: "Fácil", coins: 5, done: true, person: "both" },
  { id: 2, title: "Trabalhar no projeto", time: "até 12:00", tag: "Foco", level: "Difícil", coins: 20, done: false, person: "gileade" },
  { id: 3, title: "Estudar inglês", time: "20 min", tag: "Estudo", level: "Médio", coins: 10, done: false, person: "renata" },
  { id: 4, title: "Ler 10 páginas", time: "", tag: "Leitura", level: "Fácil", coins: 5, done: true, person: "both" },
  { id: 5, title: "Comprar algo para o jantar", time: "18:30", tag: "Juntos", level: "Médio", coins: 10, done: false, person: "both" },
  { id: 6, title: "Organizar as finanças", time: "", tag: "Casa", level: "Difícil", coins: 20, done: false, person: "gileade" },
];

const groupClasses = {
  gileade: [{ day: "Hoje", name: "Muay Thai", time: "18:30" }, { day: "Sáb", name: "Funcional", time: "09:00" }],
  renata: [{ day: "Amanhã", name: "Pilates", time: "17:30" }, { day: "Sáb", name: "Fit Dance", time: "10:00" }],
};

let celebrationAudio: AudioContext | null = null;
function playCelebrationSound() {
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  celebrationAudio ??= new AudioCtx(); void celebrationAudio.resume();
  const now=celebrationAudio.currentTime, gain=celebrationAudio.createGain();
  gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(.1,now+.08); gain.gain.exponentialRampToValueAtTime(.0001,now+1.25); gain.connect(celebrationAudio.destination);
  [440,554,659].forEach((frequency,index)=>{const osc=celebrationAudio!.createOscillator();osc.type="sine";osc.frequency.value=frequency;osc.connect(gain);osc.start(now+index*.08);osc.stop(now+1.3);});
}

const exercises = [
  { name: "Supino reto", meta: "4 séries × 12 rep", muscle: "Peito" },
  { name: "Supino inclinado", meta: "4 séries × 12 rep", muscle: "Peito" },
  { name: "Crucifixo", meta: "3 séries × 12 rep", muscle: "Peito" },
  { name: "Tríceps pulley", meta: "3 séries × 15 rep", muscle: "Tríceps" },
  { name: "Tríceps francês", meta: "3 séries × 12 rep", muscle: "Tríceps" },
  { name: "Mergulho no banco", meta: "3 séries × 10 rep", muscle: "Tríceps" },
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("resumo");
  const [tasks, setTasks] = useState(tasksSeed);
  const [coins, setCoins] = useState(0);
  const [toast, setToast] = useState("");
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [workout, setWorkout] = useState(false);
  const [series, setSeries] = useState(1);
  const [rest, setRest] = useState(0);
  const [workoutDone, setWorkoutDone] = useState(false);
  const [spiritualDone, setSpiritualDone] = useState(false);
  const [goalValues, setGoalValues] = useState([3, 5, 5, 4]);
  const [addingTask, setAddingTask] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [person, setPerson] = useState<Person>(() => (localStorage.getItem("rotina-person") as Person) || "gileade");
  const screenHistory = useRef<Screen[]>(["resumo"]);
  const edgeSwipe = useRef({ active: false, startX: 0, startY: 0 });
  const visibleTasks = tasks.filter((task) => task.person === "both" || task.person === person);
  const done = visibleTasks.filter((t) => t.done).length;
  const selectPerson = (next: Person) => { setPerson(next); localStorage.setItem("rotina-person", next); };

  useEffect(() => {
    if (!rest) return;
    const timer = window.setInterval(() => setRest((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [rest]);

  const greeting = useMemo(() => new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite", []);

  function reward(amount: number, message = "Boa! Vocês estão avançando") {
    setCoins((v) => v + amount);
    setToast(`+${amount} moedas · ${message}`);
    window.setTimeout(() => setToast(""), 2600);
  }

  function toggleTask(id: number) {
    const task = tasks.find((t) => t.id === id)!;
    setTasks(tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t));
    if (!task.done) reward(task.coins);
    else setCoins((v) => Math.max(0, v - task.coins));
  }

  const navigate = (next: Screen, fromBack = false) => {
    window.scrollTo(0, 0);
    setWorkout(false);
    setExerciseOpen(false);
    if (!fromBack && next !== screen) screenHistory.current.push(next);
    setScreen(next);
  };

  const goBack = () => {
    if (exerciseOpen) return setExerciseOpen(false);
    if (workout) return setWorkout(false);
    if (addingTask) return setAddingTask(false);
    if (screenHistory.current.length > 1) screenHistory.current.pop();
    navigate(screenHistory.current.at(-1) || "resumo", true);
  };

  const startEdgeSwipe = (event: React.PointerEvent) => {
    edgeSwipe.current = { active: event.clientX <= 24, startX: event.clientX, startY: event.clientY };
  };
  const endEdgeSwipe = (event: React.PointerEvent) => {
    const swipe = edgeSwipe.current;
    if (swipe.active && event.clientX - swipe.startX > 85 && Math.abs(event.clientY - swipe.startY) < 70) goBack();
    swipe.active = false;
  };

  const addTask = (task: { title: string; level: string; tag: string; time: string }) => {
    const coinMap: Record<string, number> = { "Fácil": 5, "Médio": 10, "Difícil": 20 };
    setTasks((current) => [...current, { id: Date.now(), ...task, coins: coinMap[task.level] || 5, done: false, person: task.tag === "Juntos" ? "both" : person }]);
    setAddingTask(false);
    setToast("Atividade adicionada");
    window.setTimeout(() => setToast(""), 2200);
  };

  return (
    <main className="app-shell" onPointerDown={startEdgeSwipe} onPointerUp={endEdgeSwipe}>
      <div className="ambient one" /><div className="ambient two" />
      <header className={`topbar ${screen === "hoje" ? "today-topbar" : ""}`}>
        {screen !== "hoje" && <div className="brand-group"><button className="menu-trigger" onClick={() => setMenuOpen(true)} aria-label="Abrir configurações"><i/><i/><i/></button><button className="brand text-brand" onClick={() => navigate("resumo")}>Rotina</button></div>}
        <button className="coin-pill" onClick={() => navigate("conquistas")}><Icon>✦</Icon><b>{coins}</b><small> moedas</small></button>
      </header>

      <section className="content" key={screen}>
        {screen === "resumo" && <Resumo greeting={greeting} done={done} total={visibleTasks.length} workoutDone={workoutDone} workoutProgress={(series - 1) / 4 * 100} spiritualDone={spiritualDone} goalValues={goalValues} person={person} onGo={navigate} />}
        {screen === "hoje" && <Hoje tasks={visibleTasks} toggle={toggleTask} remove={(id) => setTasks((current) => current.filter((task) => task.id !== id))} done={done} onAdd={() => setAddingTask(true)} />}
        {screen === "treino" && !workout && <Treino person={person} onDetail={() => setExerciseOpen(true)} onStart={() => setWorkout(true)} />}
        {screen === "treino" && workout && <WorkoutMode series={series} rest={rest} onBack={() => setWorkout(false)} onSeries={() => { if (series < 4) { setSeries(series + 1); setRest(60); reward(5, "Série concluída"); } else { reward(80, "Treino concluído!"); setWorkoutDone(true); setWorkout(false); setSeries(1); } }} />}
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
      {toast && <div className={`toast ${toast.startsWith("+") ? "success" : ""}`}><span>✦</span>{toast}</div>}
    </main>
  );
}

function Resumo({ greeting, done, total, workoutDone, workoutProgress, spiritualDone, goalValues, person, onGo }: { greeting: string; done: number; total: number; workoutDone: boolean; workoutProgress: number; spiritualDone: boolean; goalValues: number[]; person: Person; onGo: (s: Screen) => void }) {
  const taskPercent = Math.round(done / total * 100);
  const trainingPercent = workoutDone ? 100 : Math.round(workoutProgress);
  const spiritualPercent = spiritualDone ? 100 : 0;
  const goalPercent = Math.round(goalValues.reduce((sum, value, index) => sum + (index === 0 ? Math.min(value / 4, 1) : Math.min(value / 7, 1)), 0) / goalValues.length * 100);
  const weekRows = [["Afazeres", taskPercent, "green"], ["Treino", trainingPercent, "purple"], ["Espiritual", spiritualPercent, "blue"], ["Metas", goalPercent, "orange"]] as const;
  const weekScore = Math.round(weekRows.reduce((sum, row) => sum + row[1], 0) / weekRows.length);
  const dayPercent = Math.round((taskPercent + trainingPercent + spiritualPercent) / 3);
  const [celebrating, setCelebrating] = useState(false);
  const [animatedTaskPercent, setAnimatedTaskPercent] = useState(0);
  useEffect(() => {
    const start = window.setTimeout(() => setAnimatedTaskPercent(dayPercent), 120);
    let finish: number | undefined;
    const lastSeen = Number(localStorage.getItem("rotina-summary-celebration") || 0);
    if (dayPercent >= 70 && Date.now() - lastSeen > 5 * 60 * 1000) {
      localStorage.setItem("rotina-summary-celebration", String(Date.now()));
      const celebrate = window.setTimeout(() => setCelebrating(true), 380);
      const sound = window.setTimeout(playCelebrationSound, 420);
      finish = window.setTimeout(() => setCelebrating(false), 6200);
      return () => { window.clearTimeout(start); window.clearTimeout(celebrate); window.clearTimeout(sound); if(finish) window.clearTimeout(finish); };
    }
    return () => window.clearTimeout(start);
  }, [dayPercent]);
  return <>
    <div className="hero-head compact"><div><p className="eyebrow">QUINTA, 13 DE AGOSTO</p><h1>{greeting}, Gileade e Renata <span>♥</span></h1></div><div className="couple"><span>G</span><span>R</span></div></div>
    <article className={`compact-focus ${celebrating ? "celebrating" : ""}`}><button aria-label="Fechar foco da semana">×</button><small>Foco da semana</small><b>Disciplina hoje, liberdade amanhã.</b><div><span>Progresso geral do dia</span><strong>{dayPercent}%</strong></div><Progress value={animatedTaskPercent} /></article>{celebrating && <Confetti />}
    <div className="section-title summary-title"><h2>Resumo do dia</h2></div>
    <div className="stats-grid home-stats">
      <button onClick={() => onGo("hoje")} className="stat-card"><small>Afazeres</small><strong>{done}<em>/{total}</em></strong><span>concluídos</span></button>
      <button onClick={() => onGo("treino")} className="stat-card"><small>Treino</small><strong>{workoutDone ? 1 : 0}<em>/1</em></strong><span>{workoutDone ? "concluído" : "pendente"}</span></button>
      <button onClick={() => onGo("espiritual")} className="stat-card"><small>Espiritual</small><strong>{spiritualDone ? 1 : 0}<em>/1</em></strong><span>{spiritualDone ? "concluído" : "pendente"}</span></button>
      <button className="stat-card water-card"><small>Água</small><strong>6<em>/8</em></strong><span>copos</span></button>
    </div>
    <div className="section-title next-title"><h2>Próximo</h2><button onClick={() => { onGo("treino"); setTimeout(() => document.getElementById("aulas-coletivas")?.scrollIntoView(), 80); }}>Ver aulas →</button></div>
    <div className="next-grid">
      <button className="next-mini next-single" onClick={() => { onGo("treino"); setTimeout(() => document.getElementById("aulas-coletivas")?.scrollIntoView(), 80); }}><i className="blue-line"/><b>{groupClasses[person][0].name}</b><small>{groupClasses[person][0].day} · {groupClasses[person][0].time}</small></button>
    </div>
    <div className="week-card"><div className="section-title"><div><p>NOSSA SEMANA</p><h2>{weekScore >= 70 ? "Vocês estão no ritmo" : "Cada passo conta"}</h2></div><div className="week-score">{weekScore}<small>%</small></div></div>{weekRows.map(([n,v,c]) => <div className="week-row" key={n}><span>{n}</span><Progress value={v} color={c} /><b>{v}%</b></div>)}<div className="highlight">🏋️ <span><b>{workoutDone ? "Treino de hoje concluído" : "O treino de hoje está esperando"}</b><small>{workoutDone ? "Mais um passo construído juntos." : "Comecem quando estiverem prontos."}</small></span></div></div>
  </>;
}

function Hoje({ tasks, toggle, remove, done, onAdd }: { tasks: typeof tasksSeed; toggle: (n: number) => void; remove: (n:number)=>void; done: number; onAdd:()=>void }) {
  const percent = tasks.length ? Math.round(done/tasks.length*100) : 0;
  const previousPercent = useRef(percent);
  const [celebrating,setCelebrating] = useState(false);
  useEffect(()=>{
    const crossed = previousPercent.current < 70 && percent >= 70;
    previousPercent.current = percent;
    if(crossed){ playCelebrationSound(); setCelebrating(true); const timer=window.setTimeout(()=>setCelebrating(false),6200); return ()=>window.clearTimeout(timer); }
  },[percent]);
  return <><div className="today-head"><h1>Hoje</h1><p>13 de agosto, quinta-feira</p></div><div className="calendar-strip">{[["S","10"],["T","11"],["Q","12"],["Q","13"],["S","14"],["S","15"],["D","16"]].map(([d,n],i) => <button className={i===3?"selected":""} key={n}><small>{d}</small><b>{n}</b>{i===3&&<i/>}</button>)}</div><div className="tasks-focus"><div className="section-title"><div><p>ATIVIDADES DE HOJE</p><h2>Afazeres do dia</h2></div><button onClick={onAdd}>＋ Adicionar</button></div><div className={`daily-progress milestone-progress ${celebrating?"celebrating":""}`}><div><span>Progresso do dia</span><b>{done} de {tasks.length} · {percent}%</b></div><Progress value={percent} color="green" /></div><div className="task-list">{tasks.map(t => <SwipeTask key={t.id} task={t} onToggle={()=>toggle(t.id)} onDelete={()=>remove(t.id)} />)}</div></div>{celebrating&&<Confetti/>}</>;
}

function SwipeTask({ task, onToggle, onDelete }: { task: typeof tasksSeed[number]; onToggle:()=>void; onDelete:()=>void }) {
  const start = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);
  const down = (e:React.PointerEvent) => { start.current={x:e.clientX,y:e.clientY}; moved.current=false; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e:React.PointerEvent) => { if(!dragging)return; const dx=e.clientX-start.current.x; const dy=e.clientY-start.current.y; if(Math.abs(dy)>35){setOffset(0);return;} if(dx<0){setOffset(Math.max(-125,dx)); if(dx<-12)moved.current=true;} };
  const up = () => { setDragging(false); if(offset<=-105) onDelete(); setOffset(0); };
  return <div className="swipe-task"><div className="delete-reveal"><span>⌫</span><b>Excluir</b></div><button className={`task ${task.done?"done":""}`} style={{transform:`translateX(${offset}px)`,transition:dragging?"none":"transform .22s ease"}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={()=>{if(!moved.current)onToggle();}}><span className="check">{task.done&&"✓"}</span><span className="task-copy"><b>{task.title}</b><small>{task.tag} · <em className={task.level.toLowerCase()}>{task.level}</em> · +{task.coins} ✦</small></span><time>{task.time}</time></button></div>;
}

function AddTaskModal({ onClose, onAdd }: { onClose:()=>void; onAdd:(task:{title:string;level:string;tag:string;time:string})=>void }) {
  const [title,setTitle]=useState(""); const [level,setLevel]=useState("Fácil"); const [tag,setTag]=useState("Casa"); const [time,setTime]=useState("");
  return <div className="modal"><form className="sheet task-form" onSubmit={(e)=>{e.preventDefault();if(title.trim())onAdd({title:title.trim(),level,tag,time});}}><button type="button" className="sheet-close" onClick={onClose}>×</button><p className="eyebrow">NOVA ATIVIDADE</p><h1>Adicionar afazer</h1><label>Nome da atividade<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Organizar a cozinha" /></label><label>Horário <small>(opcional)</small><input type="time" value={time} onChange={e=>setTime(e.target.value)} /></label><fieldset><legend>Dificuldade</legend><div className="choice-row">{["Fácil","Médio","Difícil"].map(item=><button type="button" key={item} className={level===item?"selected":""} onClick={()=>setLevel(item)}>{item}</button>)}</div></fieldset><fieldset><legend>Categoria</legend><div className="choice-row categories">{["Casa","Juntos","Pessoal","Estudo","Saúde"].map(item=><button type="button" key={item} className={tag===item?"selected":""} onClick={()=>setTag(item)}>{item}</button>)}</div></fieldset><button className="primary" type="submit">Adicionar atividade</button></form></div>;
}

function Treino({ person, onDetail, onStart }: { person:Person; onDetail:()=>void; onStart:()=>void }) {
  return <><div className="page-head"><p className="eyebrow">QUINTA-FEIRA</p><h1>Treino de {person === "gileade" ? "Gileade" : "Renata"}</h1><p>Hoje é dia de superar a última versão.</p></div><article className="workout-hero"><div className="workout-art has-image"><img src={`${import.meta.env.BASE_URL}rotina-casal.png`} alt="Casal construindo sua rotina de treino" /><span>PEITO + TRÍCEPS</span></div><div className="workout-copy"><p>TREINO A</p><h2>Força & constância</h2><div className="workout-meta"><span>◉ 6 exercícios</span><span>◷ 60 min</span><span>✦ +80</span></div><button className="primary" onClick={onStart}>Iniciar treino <span>→</span></button></div></article><div className="section-title"><h2>Exercícios</h2><button>Editar</button></div><div className="exercise-list">{exercises.map((e,i)=><button key={e.name} onClick={i===0?onDetail:undefined}><span className="exercise-num">{String(i+1).padStart(2,"0")}</span><span><b>{e.name}</b><small>{e.meta} · {e.muscle}</small></span><em>›</em></button>)}</div><section className="group-classes" id="aulas-coletivas"><div className="section-title"><div><p>AGENDA DA ACADEMIA</p><h2>Aulas coletivas</h2></div></div><div className="class-calendar">{groupClasses[person].map((item,index)=><article key={item.name} className={index===0?"next-class":""}><span>{item.day}</span><div><b>{item.name}</b><small>{item.time}</small></div></article>)}</div></section></>;
}

function PersonMenu({ person, onSelect, onClose }: { person:Person; onSelect:(person:Person)=>void; onClose:()=>void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="person-drawer" onClick={event=>event.stopPropagation()}><div className="drawer-head"><div><small>CONFIGURAÇÕES</small><h2>Pessoa ativa</h2></div><button onClick={onClose}>×</button></div><p>Escolha de quem você quer visualizar tarefas, treinos e aulas.</p><div className={`person-switch ${person}`}><button className={person==="gileade"?"active":""} onClick={()=>onSelect("gileade")}><span>G</span>Gileade</button><button className={person==="renata"?"active":""} onClick={()=>onSelect("renata")}><span>R</span>Renata</button><i/></div><div className="shared-note"><span>✦</span><div><b>Saldo compartilhado</b><small>As moedas pertencem ao casal.</small></div></div></aside></div>;
}

function ExerciseDetail({ onClose }: { onClose:()=>void }) { const [tab,setTab]=useState("Como fazer"); return <div className="modal"><div className="sheet"><button className="sheet-close" onClick={onClose}>×</button><p className="eyebrow">EXERCÍCIO 01</p><h1>Supino reto</h1><div className="exercise-visual"><div className="bench">●━━━━●<br/><span>╱▰╲</span></div><button>▶</button><small>Veja a execução</small></div><div className="tabs">{["Como fazer","Músculos","Dicas"].map(t=><button onClick={()=>setTab(t)} className={tab===t?"active":""} key={t}>{t}</button>)}</div><p className="description">{tab==="Como fazer"?"Deite no banco, mantenha os pés firmes e desça a barra de forma controlada até a linha do peito.":tab==="Músculos"?"Peitoral maior, tríceps e deltoide anterior.":"Mantenha as escápulas encaixadas e evite tirar o quadril do banco."}</p><div className="detail-grid"><div><small>Séries</small><b>4</b></div><div><small>Repetições</small><b>10–12</b></div><div><small>Descanso</small><b>60 seg</b></div><div><small>Carga</small><b>20 kg</b></div></div></div></div> }

function WorkoutMode({ series, rest, onSeries, onBack }: { series:number; rest:number; onSeries:()=>void; onBack:()=>void }) { return <div className="workout-mode"><button className="back" onClick={onBack}>← Sair do treino</button><div className="mode-top"><span>EXERCÍCIO 1 DE 6</span><b>12:48</b></div><Progress value={16}/><div className="mode-center"><div className="exercise-orb">●━━━━●</div><p>SÉRIE {series} DE 4</p><h1>Supino reto</h1><div className="rep-number">12<small>repetições</small></div><div className="load-control"><button>−</button><div><b>20</b><small>kg de cada lado</small></div><button>＋</button></div>{rest>0&&<div className="rest"><span>Descanso</span><b>00:{String(rest).padStart(2,"0")}</b></div>}</div><button className="primary fixed-action" onClick={onSeries}>{series===4?"Finalizar exercício":"Concluir série"} ✓</button></div> }

function Metas({ reward, vals, setVals }: { reward:(n:number,s?:string)=>void; vals:number[]; setVals:React.Dispatch<React.SetStateAction<number[]>> }) { const goals=[["Treinar 4× por semana","3 de 4",75,"↗","purple",20],["Beber 2L de água","5 de 7 dias",71,"♒","blue",10],["Dormir 8h por noite","5 de 7 dias",71,"☾","orange",10],["Devocional juntos","4 de 7 dias",57,"☼","green",15]]; const overall=Math.round(vals.reduce((sum,v,i)=>sum+(i===0?Math.min(v/4,1):Math.min(v/7,1)),0)/vals.length*100); return <><div className="page-head"><p className="eyebrow">PROGRESSO</p><h1>Metas do casal</h1><p>Pequenos passos, grandes mudanças.</p></div><div className="goal-feature"><div><Icon>◎</Icon><span><small>CONSISTÊNCIA GERAL</small><b>Vocês estão a todo vapor</b></span></div><strong>{overall}<small>%</small></strong></div><div className="tabs simple"><button className="active">Ativas</button><button>Concluídas</button></div><div className="goals">{goals.map((g,i)=><button key={String(g[0])} onClick={()=>{const limit=i===0?4:7;if(vals[i]<limit){setVals(vals.map((v,x)=>x===i?v+1:v)); reward(Number(g[5]),"Meta atualizada");}}}><span className={`goal-icon ${g[4]}`}>{g[3]}</span><span className="goal-main"><b>{g[0]}</b><small>{i===0?`${Math.min(vals[i],4)} de 4`:`${vals[i]} de 7 dias`} <em>+{g[5]} ✦</em></small><Progress value={i===0?Math.min(vals[i]/4*100,100):vals[i]/7*100} color={String(g[4])}/></span><strong>{i===0?Math.min(vals[i]/4*100,100).toFixed(0):(vals[i]/7*100).toFixed(0)}%</strong></button>)}</div><button className="outline-add">＋ Nova meta</button></> }

function Espiritual({ reward, checked, setChecked }: { reward:(n:number,s?:string)=>void; checked:boolean; setChecked:React.Dispatch<React.SetStateAction<boolean>> }) { return <><div className="page-head"><p className="eyebrow">VIDA ESPIRITUAL</p><h1>Um tempo com Deus</h1><p>Para crescer juntos, um dia de cada vez.</p></div><article className="verse"><span>“</span><p>Entregue o seu caminho ao Senhor; confie nele, e ele agirá.</p><small>SALMOS 37:5</small></article><article className={`devotional ${checked?"complete":""}`}><div className="dev-head"><Icon>☼</Icon><div><p>DEVOCIONAL DE HOJE</p><h2>Vocês já fizeram?</h2></div><span>+15 ✦</span></div><div className="people-check"><div><span className="avatar">G</span><b>Gileade</b><small>Concluído ✓</small></div><div><span className="avatar pink">R</span><b>Renata</b><small>{checked?"Concluído ✓":"Pendente"}</small></div></div><button className="primary" onClick={()=>{if(!checked){setChecked(true);reward(15,"Momento espiritual concluído");}}}>{checked?"Concluído juntos ♥":"Marcar como concluído"}</button></article><div className="streak"><div><small>SEQUÊNCIA ATUAL</small><strong>12 <em>dias</em> 🔥</strong><p>Recorde de vocês: 21 dias</p></div><div className="streak-days">{"STQQSSD".split("").map((d,i)=><span className={i<5?"on":""} key={i}><small>{d}</small><b>{i<5?"✓":i+13}</b></span>)}</div></div></> }

function Conquistas({ coins, setCoins, setToast }: { coins:number; setCoins:React.Dispatch<React.SetStateAction<number>>; setToast:(s:string)=>void }) { const rewards=[["🍦","Sorvete juntos",300],["🎬","Noite de cinema",500],["🍣","Japonês",700]]; return <><div className="page-head"><p className="eyebrow">NOSSO PROGRESSO</p><h1>Conquistas</h1><p>Celebrem cada passo do caminho.</p></div><article className="balance"><p>SALDO DO CASAL</p><h2><span>✦</span>{coins.toLocaleString("pt-BR")}</h2><small>moedas disponíveis</small><div><span>Este mês <b>+285</b></span><span>Resgatadas <b>600</b></span></div></article><div className="section-title"><div><p>BADGES</p><h2>Conquistas recentes</h2></div><button>Ver todas</button></div><div className="badges"><div className="badge unlocked"><span>🔥</span><b>Foco total</b><small>5 dias perfeitos</small></div><div className="badge unlocked"><span>🏋️</span><b>Constância</b><small>10 treinos</small></div><div className="badge"><span>♥</span><b>Sempre juntos</b><small>18/25 atividades</small></div></div><div className="section-title"><div><p>LOJINHA</p><h2>Recompensas</h2></div></div><div className="rewards">{rewards.map(([ico,name,price])=><button key={String(name)} onClick={()=>{if(coins>=Number(price)){setCoins(v=>v-Number(price));setToast(`🎉 ${name} resgatado!`);setTimeout(()=>setToast(""),2600);}else{setToast(`Faltam ${Number(price)-coins} moedas`);setTimeout(()=>setToast(""),2600);}}}><span>{ico}</span><span><b>{name}</b><small>Momento para vocês</small></span><em>✦ {price}</em></button>)}</div></> }
