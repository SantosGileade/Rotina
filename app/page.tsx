"use client";

import { useEffect, useMemo, useState } from "react";

type Screen = "resumo" | "hoje" | "treino" | "metas" | "espiritual" | "conquistas";

const Icon = ({ children }: { children: React.ReactNode }) => <span className="icon">{children}</span>;
const Progress = ({ value, color = "purple" }: { value: number; color?: string }) => (
  <div className="progress"><i className={color} style={{ width: `${value}%` }} /></div>
);

const tasksSeed = [
  { id: 1, title: "Arrumar a cama", time: "08:00", tag: "Casa", level: "Fácil", coins: 5, done: true },
  { id: 2, title: "Trabalhar no projeto", time: "até 12:00", tag: "Foco", level: "Difícil", coins: 20, done: false },
  { id: 3, title: "Estudar inglês", time: "20 min", tag: "Estudo", level: "Médio", coins: 10, done: false },
  { id: 4, title: "Ler 10 páginas", time: "", tag: "Leitura", level: "Fácil", coins: 5, done: true },
  { id: 5, title: "Comprar algo para o jantar", time: "18:30", tag: "Juntos", level: "Médio", coins: 10, done: false },
  { id: 6, title: "Organizar as finanças", time: "", tag: "Casa", level: "Difícil", coins: 20, done: false },
];

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
  const [coins, setCoins] = useState(350);
  const [toast, setToast] = useState("");
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [workout, setWorkout] = useState(false);
  const [series, setSeries] = useState(1);
  const [rest, setRest] = useState(0);
  const done = tasks.filter((t) => t.done).length;

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

  const navigate = (next: Screen) => { setScreen(next); setWorkout(false); setExerciseOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <main className="app-shell">
      <div className="ambient one" /><div className="ambient two" />
      <header className="topbar">
        <button className="brand" onClick={() => navigate("resumo")} aria-label="Ir para o resumo"><span>n</span>nós</button>
        <button className="coin-pill" onClick={() => navigate("conquistas")}><Icon>✦</Icon><b>{coins}</b><small> moedas</small></button>
      </header>

      <section className="content">
        {screen === "resumo" && <Resumo greeting={greeting} done={done} onGo={navigate} />}
        {screen === "hoje" && <Hoje tasks={tasks} toggle={toggleTask} done={done} />}
        {screen === "treino" && !workout && <Treino onDetail={() => setExerciseOpen(true)} onStart={() => setWorkout(true)} />}
        {screen === "treino" && workout && <WorkoutMode series={series} rest={rest} onBack={() => setWorkout(false)} onSeries={() => { if (series < 4) { setSeries(series + 1); setRest(60); reward(5, "Série concluída"); } else { reward(80, "Treino concluído!"); setWorkout(false); setSeries(1); } }} />}
        {screen === "metas" && <Metas reward={reward} />}
        {screen === "espiritual" && <Espiritual reward={reward} />}
        {screen === "conquistas" && <Conquistas coins={coins} setCoins={setCoins} setToast={setToast} />}
      </section>

      {!workout && <nav className="bottom-nav">
        {([
          ["resumo", "⌂", "Resumo"], ["hoje", "✓", "Hoje"], ["treino", "↗", "Treino"], ["metas", "◎", "Metas"], ["conquistas", "✦", "Conquistas"],
        ] as [Screen, string, string][]).map(([id, ico, label]) => <button key={id} onClick={() => navigate(id)} className={screen === id ? "active" : ""}><Icon>{ico}</Icon><small>{label}</small></button>)}
      </nav>}
      {exerciseOpen && <ExerciseDetail onClose={() => setExerciseOpen(false)} />}
      {toast && <div className="toast"><span>✦</span>{toast}</div>}
    </main>
  );
}

function Resumo({ greeting, done, onGo }: { greeting: string; done: number; onGo: (s: Screen) => void }) {
  return <>
    <div className="hero-head"><div><p className="eyebrow">QUINTA, 13 DE AGOSTO</p><h1>{greeting},<br />Gileade & Larissa <span>♥</span></h1><p>Um novo dia para construir juntos.</p></div><div className="couple"><span>G</span><span>L</span></div></div>
    <article className="focus-card"><div className="spark">✦</div><p>FOCO DA SEMANA</p><h2>Disciplina hoje,<br />liberdade amanhã.</h2><div className="focus-progress"><div><span>Progresso semanal</span><b>70%</b></div><Progress value={70} /></div></article>
    <div className="section-title"><div><p>VISÃO GERAL</p><h2>Como está nosso dia?</h2></div><span>{done}/8 concluídos</span></div>
    <div className="stats-grid">
      <button onClick={() => onGo("hoje")} className="stat-card"><Icon>✓</Icon><small>Afazeres</small><strong>{done}<em>/8</em></strong><Progress value={done / 8 * 100} color="green" /></button>
      <button onClick={() => onGo("treino")} className="stat-card"><Icon>↗</Icon><small>Treino</small><strong>0<em>/1</em></strong><Progress value={15} /></button>
      <button onClick={() => onGo("espiritual")} className="stat-card"><Icon>☼</Icon><small>Espiritual</small><strong>0<em>/2</em></strong><Progress value={8} color="blue" /></button>
    </div>
    <div className="section-title"><h2>Próximos</h2><button>Ver dia →</button></div>
    <div className="timeline-card"><div className="time"><b>17:00</b><i className="purple-dot" /></div><div><b>Academia</b><small>Treino A · Peito + Tríceps</small></div><span>↗</span></div>
    <div className="timeline-card"><div className="time"><b>18:30</b><i className="blue-dot" /></div><div><b>Comprar o jantar</b><small>Atividade do casal</small></div><span>›</span></div>
    <div className="week-card"><div className="section-title"><div><p>NOSSA SEMANA</p><h2>Vocês estão no ritmo</h2></div><div className="week-score">82<small>%</small></div></div>{[["Afazeres",80,"green"],["Treinos",75,"purple"],["Espiritual",60,"blue"],["Metas",70,"orange"]].map(([n,v,c]) => <div className="week-row" key={String(n)}><span>{n}</span><Progress value={Number(v)} color={String(c)} /><b>{v}%</b></div>)}<div className="highlight">🏋️ <span><b>3 treinos juntos</b><small>Melhor sequência do mês. Continuem assim!</small></span></div></div>
  </>;
}

function Hoje({ tasks, toggle, done }: { tasks: typeof tasksSeed; toggle: (n: number) => void; done: number }) {
  return <><div className="page-head"><p className="eyebrow">NOSSO DIA</p><h1>Hoje</h1><p>13 de agosto, quinta-feira</p></div><div className="calendar-strip">{[["S","10"],["T","11"],["Q","12"],["Q","13"],["S","14"],["S","15"],["D","16"]].map(([d,n],i) => <button className={i===3?"selected":""} key={n}><small>{d}</small><b>{n}</b>{i===3&&<i/>}</button>)}</div><div className="daily-progress"><div><span>Progresso do dia</span><b>{done} de {tasks.length}</b></div><Progress value={done/tasks.length*100} /></div><div className="section-title"><h2>Afazeres do dia</h2><button>＋ Adicionar</button></div><div className="task-list">{tasks.map(t => <button className={`task ${t.done?"done":""}`} key={t.id} onClick={()=>toggle(t.id)}><span className="check">{t.done&&"✓"}</span><span className="task-copy"><b>{t.title}</b><small>{t.tag} · <em className={t.level.toLowerCase()}>{t.level}</em> · +{t.coins} ✦</small></span><time>{t.time}</time></button>)}</div></>;
}

function Treino({ onDetail, onStart }: { onDetail:()=>void; onStart:()=>void }) {
  return <><div className="page-head"><p className="eyebrow">QUINTA-FEIRA</p><h1>Seu treino</h1><p>Hoje é dia de superar a última versão.</p></div><article className="workout-hero"><div className="workout-art"><div className="barbell">●━━━━●</div><span>PEITO + TRÍCEPS</span></div><div className="workout-copy"><p>TREINO A</p><h2>Força & constância</h2><div className="workout-meta"><span>◉ 6 exercícios</span><span>◷ 60 min</span><span>✦ +80</span></div><button className="primary" onClick={onStart}>Iniciar treino <span>→</span></button></div></article><div className="section-title"><h2>Exercícios</h2><button>Editar</button></div><div className="exercise-list">{exercises.map((e,i)=><button key={e.name} onClick={i===0?onDetail:undefined}><span className="exercise-num">{String(i+1).padStart(2,"0")}</span><span><b>{e.name}</b><small>{e.meta} · {e.muscle}</small></span><em>›</em></button>)}</div></>;
}

function ExerciseDetail({ onClose }: { onClose:()=>void }) { const [tab,setTab]=useState("Como fazer"); return <div className="modal"><div className="sheet"><button className="sheet-close" onClick={onClose}>×</button><p className="eyebrow">EXERCÍCIO 01</p><h1>Supino reto</h1><div className="exercise-visual"><div className="bench">●━━━━●<br/><span>╱▰╲</span></div><button>▶</button><small>Veja a execução</small></div><div className="tabs">{["Como fazer","Músculos","Dicas"].map(t=><button onClick={()=>setTab(t)} className={tab===t?"active":""} key={t}>{t}</button>)}</div><p className="description">{tab==="Como fazer"?"Deite no banco, mantenha os pés firmes e desça a barra de forma controlada até a linha do peito.":tab==="Músculos"?"Peitoral maior, tríceps e deltoide anterior.":"Mantenha as escápulas encaixadas e evite tirar o quadril do banco."}</p><div className="detail-grid"><div><small>Séries</small><b>4</b></div><div><small>Repetições</small><b>10–12</b></div><div><small>Descanso</small><b>60 seg</b></div><div><small>Carga</small><b>20 kg</b></div></div></div></div> }

function WorkoutMode({ series, rest, onSeries, onBack }: { series:number; rest:number; onSeries:()=>void; onBack:()=>void }) { return <div className="workout-mode"><button className="back" onClick={onBack}>← Sair do treino</button><div className="mode-top"><span>EXERCÍCIO 1 DE 6</span><b>12:48</b></div><Progress value={16}/><div className="mode-center"><div className="exercise-orb">●━━━━●</div><p>SÉRIE {series} DE 4</p><h1>Supino reto</h1><div className="rep-number">12<small>repetições</small></div><div className="load-control"><button>−</button><div><b>20</b><small>kg de cada lado</small></div><button>＋</button></div>{rest>0&&<div className="rest"><span>Descanso</span><b>00:{String(rest).padStart(2,"0")}</b></div>}</div><button className="primary fixed-action" onClick={onSeries}>{series===4?"Finalizar exercício":"Concluir série"} ✓</button></div> }

function Metas({ reward }: { reward:(n:number,s?:string)=>void }) { const [vals,setVals]=useState([3,5,5,4]); const goals=[["Treinar 4× por semana","3 de 4",75,"↗","purple",20],["Beber 2L de água","5 de 7 dias",71,"♒","blue",10],["Dormir 8h por noite","5 de 7 dias",71,"☾","orange",10],["Devocional juntos","4 de 7 dias",57,"☼","green",15]]; return <><div className="page-head"><p className="eyebrow">PROGRESSO</p><h1>Metas do casal</h1><p>Pequenos passos, grandes mudanças.</p></div><div className="goal-feature"><div><Icon>◎</Icon><span><small>CONSISTÊNCIA GERAL</small><b>Vocês estão a todo vapor</b></span></div><strong>71<small>%</small></strong></div><div className="tabs simple"><button className="active">Ativas</button><button>Concluídas</button></div><div className="goals">{goals.map((g,i)=><button key={String(g[0])} onClick={()=>{if(vals[i]<7){setVals(vals.map((v,x)=>x===i?v+1:v)); reward(Number(g[5]),"Meta atualizada");}}}><span className={`goal-icon ${g[4]}`}>{g[3]}</span><span className="goal-main"><b>{g[0]}</b><small>{i===0?`${Math.min(vals[i],4)} de 4`:`${vals[i]} de 7 dias`} <em>+{g[5]} ✦</em></small><Progress value={i===0?Math.min(vals[i]/4*100,100):vals[i]/7*100} color={String(g[4])}/></span><strong>{i===0?Math.min(vals[i]/4*100,100).toFixed(0):(vals[i]/7*100).toFixed(0)}%</strong></button>)}</div><button className="outline-add">＋ Nova meta</button></> }

function Espiritual({ reward }: { reward:(n:number,s?:string)=>void }) { const [checked,setChecked]=useState(false); return <><div className="page-head"><p className="eyebrow">VIDA ESPIRITUAL</p><h1>Um tempo com Deus</h1><p>Para crescer juntos, um dia de cada vez.</p></div><article className="verse"><span>“</span><p>Entregue o seu caminho ao Senhor; confie nele, e ele agirá.</p><small>SALMOS 37:5</small></article><article className={`devotional ${checked?"complete":""}`}><div className="dev-head"><Icon>☼</Icon><div><p>DEVOCIONAL DE HOJE</p><h2>Vocês já fizeram?</h2></div><span>+15 ✦</span></div><div className="people-check"><div><span className="avatar">G</span><b>Gileade</b><small>Concluído ✓</small></div><div><span className="avatar pink">L</span><b>Larissa</b><small>{checked?"Concluído ✓":"Pendente"}</small></div></div><button className="primary" onClick={()=>{if(!checked){setChecked(true);reward(15,"Momento espiritual concluído");}}}>{checked?"Concluído juntos ♥":"Marcar como concluído"}</button></article><div className="streak"><div><small>SEQUÊNCIA ATUAL</small><strong>12 <em>dias</em> 🔥</strong><p>Recorde de vocês: 21 dias</p></div><div className="streak-days">{"STQQSSD".split("").map((d,i)=><span className={i<5?"on":""} key={i}><small>{d}</small><b>{i<5?"✓":i+13}</b></span>)}</div></div></> }

function Conquistas({ coins, setCoins, setToast }: { coins:number; setCoins:React.Dispatch<React.SetStateAction<number>>; setToast:(s:string)=>void }) { const rewards=[["🍦","Sorvete juntos",300],["🎬","Noite de cinema",500],["🍣","Japonês",700]]; return <><div className="page-head"><p className="eyebrow">NOSSO PROGRESSO</p><h1>Conquistas</h1><p>Celebrem cada passo do caminho.</p></div><article className="balance"><p>SALDO DO CASAL</p><h2><span>✦</span>{coins.toLocaleString("pt-BR")}</h2><small>moedas disponíveis</small><div><span>Este mês <b>+285</b></span><span>Resgatadas <b>600</b></span></div></article><div className="section-title"><div><p>BADGES</p><h2>Conquistas recentes</h2></div><button>Ver todas</button></div><div className="badges"><div className="badge unlocked"><span>🔥</span><b>Foco total</b><small>5 dias perfeitos</small></div><div className="badge unlocked"><span>🏋️</span><b>Constância</b><small>10 treinos</small></div><div className="badge"><span>♥</span><b>Sempre juntos</b><small>18/25 atividades</small></div></div><div className="section-title"><div><p>LOJINHA</p><h2>Recompensas</h2></div></div><div className="rewards">{rewards.map(([ico,name,price])=><button key={String(name)} onClick={()=>{if(coins>=Number(price)){setCoins(v=>v-Number(price));setToast(`🎉 ${name} resgatado!`);setTimeout(()=>setToast(""),2600);}else{setToast(`Faltam ${Number(price)-coins} moedas`);setTimeout(()=>setToast(""),2600);}}}><span>{ico}</span><span><b>{name}</b><small>Momento para vocês</small></span><em>✦ {price}</em></button>)}</div></> }
