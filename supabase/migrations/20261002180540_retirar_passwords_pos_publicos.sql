-- Apply only after the PIN Edge + browser/APK release is READY.
-- Disable passwords previously exposed in client bundles and deterministic
-- POS-PIN Auth passwords. Existing per-device refresh sessions are retained;
-- a reset/new terminal now requires owner enrollment. No financial data changes.
set local lock_timeout='5s';
update auth.users a set encrypted_password=extensions.crypt(encode(extensions.gen_random_bytes(32),'hex'),extensions.gen_salt('bf')),updated_at=now()
where exists(select 1 from public.usuarios_pos u where u.auth_user_id=a.id);
