-- Evita duplicar recompensas quando a inicializacao do app roda em paralelo
-- (React StrictMode chama o efeito de carga duas vezes em desenvolvimento).
alter table public.rewards add constraint rewards_household_name_key unique (household_id, name);
