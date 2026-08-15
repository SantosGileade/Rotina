import { supabase } from "./supabase";

export type DbPerson = "gileade" | "renata";
const localDate=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;};

export async function currentHousehold() {
  const { data, error } = await supabase.from("household_members").select("household_id").limit(1).maybeSingle();
  if (error) throw error;
  return data?.household_id as string | undefined;
}

export async function pairHousehold(code:string) {
  const { data, error } = await supabase.rpc("bootstrap_rotina", { access_code: code.trim() });
  if (error) throw error;
  return data as string;
}

export async function loadRotina(householdId:string) {
  const today=localDate();
  const [tasks,completions,days,exercises,classes,sessions,balance]=await Promise.all([
    supabase.from("tasks").select("*").eq("household_id",householdId).eq("task_date",today).order("created_at"),
    supabase.from("daily_task_completions").select("task_id,person,completed_at"),
    supabase.from("workout_days").select("*").eq("household_id",householdId),
    supabase.from("workout_exercises").select("*").order("position"),
    supabase.from("group_classes").select("*").eq("household_id",householdId).order("day_of_week").order("position"),
    supabase.from("workout_sessions").select("person,completion_date").eq("household_id",householdId).eq("completion_date",today),
    supabase.from("household_balances").select("balance").eq("household_id",householdId).maybeSingle(),
  ]);
  const failed=[tasks,completions,days,exercises,classes,sessions,balance].find(result=>result.error);
  if(failed?.error)throw failed.error;
  return {tasks:tasks.data||[],completions:completions.data||[],days:days.data||[],exercises:exercises.data||[],classes:classes.data||[],sessions:sessions.data||[],balance:Number(balance.data?.balance||0)};
}

export async function insertTask(householdId:string,userId:string,task:{title:string;category:string;difficulty:"easy"|"medium"|"hard";coin_reward:number;assignment:"gileade"|"renata"|"both";task_time:string|null}) {
  const {data,error}=await supabase.from("tasks").insert({...task,task_date:localDate(),household_id:householdId,created_by:userId}).select().single();
  if(error)throw error; return data;
}

export async function removeTaskRecord(id:string){const {error}=await supabase.from("tasks").delete().eq("id",id);if(error)throw error;}
export async function setTaskDone(id:string,person:DbPerson,complete:boolean){const {error}=await supabase.rpc("set_task_completion",{target_task:id,target_person:person,should_complete:complete});if(error)throw error;}

export async function saveWorkoutPlan(householdId:string,person:DbPerson,plan:Record<number,{title:string;muscles:string;duration:number;exercises:Array<{name:string;sets:number;reps:string;muscle:string;weight:number}>}>){
  for(const [dayKey,item] of Object.entries(plan)){
    const day=Number(dayKey);
    const {data:dayRow,error:dayError}=await supabase.from("workout_days").upsert({household_id:householdId,person,day_of_week:day,title:item.title,muscles:item.muscles,duration_minutes:item.duration,updated_at:new Date().toISOString()},{onConflict:"household_id,person,day_of_week"}).select("id").single();
    if(dayError)throw dayError;
    const {error:deleteError}=await supabase.from("workout_exercises").delete().eq("workout_day_id",dayRow.id);if(deleteError)throw deleteError;
    if(item.exercises.length){const {error}=await supabase.from("workout_exercises").insert(item.exercises.map((exercise,index)=>({workout_day_id:dayRow.id,position:index,name:exercise.name,sets:exercise.sets,reps:exercise.reps,muscle:exercise.muscle,weight:exercise.weight})));if(error)throw error;}
  }
}

export async function saveClasses(householdId:string,person:DbPerson,items:Array<{day:string;name:string;time:string}>){
  const dayNames=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
  const {error:deleteError}=await supabase.from("group_classes").delete().eq("household_id",householdId).eq("person",person);if(deleteError)throw deleteError;
  if(items.length){const {error}=await supabase.from("group_classes").insert(items.map((item,index)=>({household_id:householdId,person,day_of_week:dayNames.indexOf(item.day),name:item.name,class_time:item.time,position:index})));if(error)throw error;}
}

export async function finishWorkout(dayId:string,person:DbPerson){const {data,error}=await supabase.rpc("finish_workout",{target_workout_day:dayId,target_person:person});if(error)throw error;return Boolean(data);}
