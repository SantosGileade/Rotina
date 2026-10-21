-- Dieta: metas, catalogo de alimentos, favoritos, refeicoes salvas e registros diarios.
-- Somente aditiva: nao altera nenhuma tabela de Treinos.
-- Isolamento: RLS por household (is_household_member). A separacao Gileade/Renata e' feita
-- pela coluna person, igual aos Treinos (o login e' anonimo por aparelho, nao por pessoa).

create table if not exists public.diet_goals (
  household_id uuid not null references public.households(id) on delete cascade,
  person public.task_assignment not null check (person <> 'both'),
  kcal numeric(7,1) check (kcal is null or kcal between 0 and 20000),
  protein numeric(6,1) check (protein is null or protein between 0 and 2000),
  carbs numeric(6,1) check (carbs is null or carbs between 0 and 3000),
  fat numeric(6,1) check (fat is null or fat between 0 and 2000),
  fiber numeric(6,1) check (fiber is null or fiber between 0 and 500),
  updated_at timestamptz not null default now(),
  primary key (household_id, person)
);

-- Catalogo: household_id nulo = alimento global (somente leitura); preenchido = alimento do casal.
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  seed_key text unique,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'Outros',
  prep_state text,
  kcal_100 numeric(7,2) not null check (kcal_100 between 0 and 1000),
  protein_100 numeric(6,2) not null check (protein_100 between 0 and 100),
  carbs_100 numeric(6,2) not null check (carbs_100 between 0 and 100),
  fat_100 numeric(6,2) not null check (fat_100 between 0 and 100),
  fiber_100 numeric(6,2) check (fiber_100 is null or fiber_100 between 0 and 100),
  unit_label text,
  unit_grams numeric(7,2) check (unit_grams is null or unit_grams > 0),
  source text not null default 'Cadastro manual',
  created_at timestamptz not null default now()
);
create index if not exists foods_household_idx on public.foods(household_id);
create index if not exists foods_name_idx on public.foods(lower(name));

-- Favoritos: guardam copia dos valores por 100 g para nao mudarem se o catalogo mudar.
create table if not exists public.diet_favorites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person public.task_assignment not null check (person <> 'both'),
  food_id uuid references public.foods(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  grams numeric(7,2) not null check (grams > 0 and grams <= 5000),
  unit_label text,
  kcal_100 numeric(7,2) not null check (kcal_100 >= 0),
  protein_100 numeric(6,2) not null check (protein_100 >= 0),
  carbs_100 numeric(6,2) not null check (carbs_100 >= 0),
  fat_100 numeric(6,2) not null check (fat_100 >= 0),
  fiber_100 numeric(6,2) check (fiber_100 is null or fiber_100 >= 0),
  created_at timestamptz not null default now()
);
create index if not exists diet_favorites_idx on public.diet_favorites(household_id, person);

create table if not exists public.diet_saved_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person public.task_assignment not null check (person <> 'both'),
  name text not null check (char_length(name) between 1 and 80),
  category text not null default 'outros' check (category in ('cafe','almoco','lanche','jantar','ceia','outros')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists diet_saved_meals_idx on public.diet_saved_meals(household_id, person);

create table if not exists public.diet_saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.diet_saved_meals(id) on delete cascade,
  position integer not null check (position >= 0),
  food_id uuid references public.foods(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  grams numeric(7,2) not null check (grams > 0 and grams <= 5000),
  kcal_100 numeric(7,2) not null check (kcal_100 >= 0),
  protein_100 numeric(6,2) not null check (protein_100 >= 0),
  carbs_100 numeric(6,2) not null check (carbs_100 >= 0),
  fat_100 numeric(6,2) not null check (fat_100 >= 0),
  fiber_100 numeric(6,2) check (fiber_100 is null or fiber_100 >= 0)
);
create index if not exists diet_saved_meal_items_idx on public.diet_saved_meal_items(saved_meal_id);

-- Registros: log_date e' a data local escolhida pelo usuario (tipo date, sem fuso).
-- client_request_id evita registro duplicado por duplo toque ou falha de rede.
create table if not exists public.diet_meal_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person public.task_assignment not null check (person <> 'both'),
  client_request_id uuid not null,
  log_date date not null,
  log_time time not null,
  category text not null default 'outros' check (category in ('cafe','almoco','lanche','jantar','ceia','outros')),
  name text not null default '' check (char_length(name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, client_request_id)
);
create index if not exists diet_meal_logs_idx on public.diet_meal_logs(household_id, person, log_date);

create table if not exists public.diet_meal_log_items (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.diet_meal_logs(id) on delete cascade,
  position integer not null check (position >= 0),
  food_id uuid references public.foods(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  grams numeric(7,2) not null check (grams > 0 and grams <= 5000),
  kcal_100 numeric(7,2) not null check (kcal_100 >= 0),
  protein_100 numeric(6,2) not null check (protein_100 >= 0),
  carbs_100 numeric(6,2) not null check (carbs_100 >= 0),
  fat_100 numeric(6,2) not null check (fat_100 >= 0),
  fiber_100 numeric(6,2) check (fiber_100 is null or fiber_100 >= 0)
);
create index if not exists diet_meal_log_items_idx on public.diet_meal_log_items(log_id);

-- Funcoes atomicas (security invoker: o RLS continua valendo).
create or replace function public.diet_create_meal_log(
  p_household uuid, p_person public.task_assignment, p_request uuid,
  p_date date, p_time time, p_category text, p_name text, p_items jsonb
) returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_household_member(p_household) then raise exception 'Acesso negado'; end if;
  if p_person = 'both' then raise exception 'Escolha Gileade ou Renata'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A refeicao precisa ter ao menos um alimento'; end if;
  select id into v_id from public.diet_meal_logs where household_id = p_household and client_request_id = p_request;
  if v_id is not null then return v_id; end if;
  begin
    insert into public.diet_meal_logs(household_id, person, client_request_id, log_date, log_time, category, name)
    values (p_household, p_person, p_request, p_date, p_time, p_category, coalesce(p_name, '')) returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.diet_meal_logs where household_id = p_household and client_request_id = p_request;
    return v_id;
  end;
  insert into public.diet_meal_log_items(log_id, position, food_id, name, grams, kcal_100, protein_100, carbs_100, fat_100, fiber_100)
  select v_id, (t.ord - 1)::int, nullif(t.x->>'food_id','')::uuid, t.x->>'name', (t.x->>'grams')::numeric,
         (t.x->>'kcal_100')::numeric, (t.x->>'protein_100')::numeric, (t.x->>'carbs_100')::numeric, (t.x->>'fat_100')::numeric,
         nullif(t.x->>'fiber_100','')::numeric
  from jsonb_array_elements(p_items) with ordinality as t(x, ord);
  return v_id;
end;
$$;

create or replace function public.diet_update_meal_log(
  p_log uuid, p_date date, p_time time, p_category text, p_name text, p_items jsonb
) returns void language plpgsql set search_path = '' as $$
declare v_household uuid;
begin
  select household_id into v_household from public.diet_meal_logs where id = p_log;
  if v_household is null or not public.is_household_member(v_household) then raise exception 'Registro nao encontrado'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A refeicao precisa ter ao menos um alimento'; end if;
  update public.diet_meal_logs set log_date = p_date, log_time = p_time, category = p_category, name = coalesce(p_name, ''), updated_at = now() where id = p_log;
  delete from public.diet_meal_log_items where log_id = p_log;
  insert into public.diet_meal_log_items(log_id, position, food_id, name, grams, kcal_100, protein_100, carbs_100, fat_100, fiber_100)
  select p_log, (t.ord - 1)::int, nullif(t.x->>'food_id','')::uuid, t.x->>'name', (t.x->>'grams')::numeric,
         (t.x->>'kcal_100')::numeric, (t.x->>'protein_100')::numeric, (t.x->>'carbs_100')::numeric, (t.x->>'fat_100')::numeric,
         nullif(t.x->>'fiber_100','')::numeric
  from jsonb_array_elements(p_items) with ordinality as t(x, ord);
end;
$$;

-- p_id nulo = cria; preenchido = atualiza a refeicao salva e substitui os itens.
create or replace function public.diet_save_meal(
  p_id uuid, p_household uuid, p_person public.task_assignment, p_name text, p_category text, p_items jsonb
) returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_household_member(p_household) then raise exception 'Acesso negado'; end if;
  if p_person = 'both' then raise exception 'Escolha Gileade ou Renata'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A refeicao salva precisa ter ao menos um alimento'; end if;
  if p_id is null then
    insert into public.diet_saved_meals(household_id, person, name, category) values (p_household, p_person, p_name, p_category) returning id into v_id;
  else
    update public.diet_saved_meals set name = p_name, category = p_category, updated_at = now()
     where id = p_id and household_id = p_household and person = p_person returning id into v_id;
    if v_id is null then raise exception 'Refeicao salva nao encontrada'; end if;
    delete from public.diet_saved_meal_items where saved_meal_id = v_id;
  end if;
  insert into public.diet_saved_meal_items(saved_meal_id, position, food_id, name, grams, kcal_100, protein_100, carbs_100, fat_100, fiber_100)
  select v_id, (t.ord - 1)::int, nullif(t.x->>'food_id','')::uuid, t.x->>'name', (t.x->>'grams')::numeric,
         (t.x->>'kcal_100')::numeric, (t.x->>'protein_100')::numeric, (t.x->>'carbs_100')::numeric, (t.x->>'fat_100')::numeric,
         nullif(t.x->>'fiber_100','')::numeric
  from jsonb_array_elements(p_items) with ordinality as t(x, ord);
  return v_id;
end;
$$;

alter table public.diet_goals enable row level security;
alter table public.foods enable row level security;
alter table public.diet_favorites enable row level security;
alter table public.diet_saved_meals enable row level security;
alter table public.diet_saved_meal_items enable row level security;
alter table public.diet_meal_logs enable row level security;
alter table public.diet_meal_log_items enable row level security;

create policy "diet goals household all" on public.diet_goals for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "foods read global or household" on public.foods for select to authenticated using (household_id is null or public.is_household_member(household_id));
create policy "foods household insert" on public.foods for insert to authenticated with check (household_id is not null and public.is_household_member(household_id));
create policy "foods household update" on public.foods for update to authenticated using (household_id is not null and public.is_household_member(household_id)) with check (household_id is not null and public.is_household_member(household_id));
create policy "foods household delete" on public.foods for delete to authenticated using (household_id is not null and public.is_household_member(household_id));
create policy "diet favorites household all" on public.diet_favorites for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "diet saved meals household all" on public.diet_saved_meals for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "diet saved meal items household all" on public.diet_saved_meal_items for all to authenticated
  using (exists (select 1 from public.diet_saved_meals m where m.id = saved_meal_id and public.is_household_member(m.household_id)))
  with check (exists (select 1 from public.diet_saved_meals m where m.id = saved_meal_id and public.is_household_member(m.household_id)));
create policy "diet meal logs household all" on public.diet_meal_logs for all to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "diet meal log items household all" on public.diet_meal_log_items for all to authenticated
  using (exists (select 1 from public.diet_meal_logs l where l.id = log_id and public.is_household_member(l.household_id)))
  with check (exists (select 1 from public.diet_meal_logs l where l.id = log_id and public.is_household_member(l.household_id)));

grant select, insert, update, delete on public.diet_goals, public.foods, public.diet_favorites, public.diet_saved_meals, public.diet_saved_meal_items, public.diet_meal_logs, public.diet_meal_log_items to authenticated;
grant execute on function public.diet_create_meal_log(uuid, public.task_assignment, uuid, date, time, text, text, jsonb),
                          public.diet_update_meal_log(uuid, date, time, text, text, jsonb),
                          public.diet_save_meal(uuid, uuid, public.task_assignment, text, text, jsonb) to authenticated;

-- Base inicial: valores APROXIMADOS por 100 g, com referencia na TACO (NEPA/Unicamp).
-- Nao foram conferidos linha a linha contra a tabela oficial; confira antes de depender deles.
insert into public.foods(seed_key, name, category, prep_state, kcal_100, protein_100, carbs_100, fat_100, fiber_100, unit_label, unit_grams, source) values
  ('arroz-branco-cozido','Arroz branco cozido','Cereais','cozido',128,2.5,28.1,0.2,1.6,null,null,'Aproximado (ref. TACO) - conferir'),
  ('arroz-integral-cozido','Arroz integral cozido','Cereais','cozido',124,2.6,25.8,1.0,2.7,null,null,'Aproximado (ref. TACO) - conferir'),
  ('macarrao-cozido','Macarrão cozido','Cereais','cozido',102,3.4,19.9,0.5,1.4,null,null,'Aproximado (ref. TACO) - conferir'),
  ('aveia-flocos','Aveia em flocos','Cereais','cru',394,13.9,66.6,8.5,9.1,null,null,'Aproximado (ref. TACO) - conferir'),
  ('pao-frances','Pão francês','Pães','pronto',300,8.0,58.6,3.1,2.3,'unidade',50,'Aproximado (ref. TACO) - conferir'),
  ('pao-forma-integral','Pão de forma integral','Pães','pronto',253,9.4,49.9,3.7,6.9,'fatia',25,'Aproximado (ref. TACO) - conferir'),
  ('feijao-carioca-cozido','Feijão carioca cozido','Leguminosas','cozido',76,4.8,13.6,0.5,8.5,null,null,'Aproximado (ref. TACO) - conferir'),
  ('feijao-preto-cozido','Feijão preto cozido','Leguminosas','cozido',77,4.5,14.0,0.5,8.4,null,null,'Aproximado (ref. TACO) - conferir'),
  ('lentilha-cozida','Lentilha cozida','Leguminosas','cozido',93,6.3,16.3,0.5,7.9,null,null,'Aproximado (ref. TACO) - conferir'),
  ('frango-peito-grelhado','Frango, peito grelhado','Carnes e ovos','grelhado',159,32.0,0,2.5,0,null,null,'Aproximado (ref. TACO) - conferir'),
  ('frango-peito-cozido','Frango, peito cozido','Carnes e ovos','cozido',163,31.5,0,3.2,0,null,null,'Aproximado (ref. TACO) - conferir'),
  ('patinho-grelhado','Carne bovina, patinho grelhado','Carnes e ovos','grelhado',219,35.9,0,7.3,0,null,null,'Aproximado (ref. TACO) - conferir'),
  ('ovo-cozido','Ovo de galinha cozido','Carnes e ovos','cozido',146,13.3,0.6,9.5,0,'unidade',50,'Aproximado (ref. TACO) - conferir'),
  ('ovo-frito','Ovo de galinha frito','Carnes e ovos','frito',240,15.6,1.2,18.6,0,'unidade',50,'Aproximado (ref. TACO) - conferir'),
  ('banana-prata','Banana prata','Frutas','cru',98,1.3,26.0,0.1,2.0,'unidade',70,'Aproximado (ref. TACO) - conferir'),
  ('maca-fuji','Maçã Fuji','Frutas','cru',56,0.3,15.2,0,1.3,'unidade',130,'Aproximado (ref. TACO) - conferir'),
  ('laranja-pera','Laranja pera','Frutas','cru',37,1.0,8.9,0.1,0.8,'unidade',150,'Aproximado (ref. TACO) - conferir'),
  ('mamao-papaia','Mamão papaia','Frutas','cru',40,0.5,10.4,0.1,1.0,null,null,'Aproximado (ref. TACO) - conferir'),
  ('batata-inglesa-cozida','Batata inglesa cozida','Tubérculos','cozido',52,1.2,11.9,0,1.3,null,null,'Aproximado (ref. TACO) - conferir'),
  ('batata-doce-cozida','Batata doce cozida','Tubérculos','cozido',77,0.6,18.4,0.1,2.2,null,null,'Aproximado (ref. TACO) - conferir'),
  ('mandioca-cozida','Mandioca cozida','Tubérculos','cozido',125,0.6,30.1,0.3,1.6,null,null,'Aproximado (ref. TACO) - conferir'),
  ('alface-crua','Alface crua','Verduras e legumes','cru',11,1.3,1.7,0.2,1.8,null,null,'Aproximado (ref. TACO) - conferir'),
  ('tomate-cru','Tomate cru','Verduras e legumes','cru',15,1.1,3.1,0.2,1.2,null,null,'Aproximado (ref. TACO) - conferir'),
  ('cenoura-crua','Cenoura crua','Verduras e legumes','cru',34,1.3,7.7,0.2,3.2,null,null,'Aproximado (ref. TACO) - conferir'),
  ('brocolis-cozido','Brócolis cozido','Verduras e legumes','cozido',25,2.1,4.4,0.5,3.4,null,null,'Aproximado (ref. TACO) - conferir'),
  ('leite-integral','Leite integral','Laticínios','pronto',61,3.2,4.5,3.3,0,null,null,'Aproximado (ref. TACO) - conferir'),
  ('iogurte-natural','Iogurte natural integral','Laticínios','pronto',51,4.1,1.9,3.0,0,null,null,'Aproximado (ref. TACO) - conferir'),
  ('queijo-mussarela','Queijo mussarela','Laticínios','pronto',330,22.6,3.0,25.2,0,'fatia',20,'Aproximado (ref. TACO) - conferir'),
  ('queijo-minas-frescal','Queijo minas frescal','Laticínios','pronto',264,17.4,3.2,20.2,0,null,null,'Aproximado (ref. TACO) - conferir'),
  ('azeite-oliva','Azeite de oliva','Gorduras','pronto',884,0,0,100,0,'colher de sopa',13,'Aproximado (ref. TACO) - conferir'),
  ('manteiga','Manteiga','Gorduras','pronto',726,0.4,0.1,82.4,0,null,null,'Aproximado (ref. TACO) - conferir'),
  ('acucar-refinado','Açúcar refinado','Outros','pronto',387,0.3,99.5,0,0,'colher de chá',5,'Aproximado (ref. TACO) - conferir')
on conflict (seed_key) do nothing;
