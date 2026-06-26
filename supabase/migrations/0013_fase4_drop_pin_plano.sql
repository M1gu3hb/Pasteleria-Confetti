-- Fase 4: el PIN ya no se guarda en claro. Auth real vía Supabase Auth
-- (signInWithPassword, hash en auth.users). pin_hash (bcrypt) queda de referencia.
alter table usuarios_pos drop column pin;
