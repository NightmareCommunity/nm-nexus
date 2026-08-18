-- Updated handle_new_user trigger (sets discriminator on signup)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $func$
declare
  v_username text;
  v_discriminator text;
  v_existing_count integer;
begin
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'user_' || substr(new.id::text, 1, 8)
  );
  v_username := lower(regexp_replace(v_username, '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(v_username) < 3 then
    v_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  v_discriminator := lpad(floor(random() * 9999 + 1)::text, 4, '0');
  loop
    select count(*) into v_existing_count
    from public.profiles
    where username = v_username and discriminator = v_discriminator;
    exit when v_existing_count = 0;
    v_discriminator := lpad(floor(random() * 9999 + 1)::text, 4, '0');
  end loop;

  insert into public.profiles (id, username, display_name, status, discriminator)
  values (
    new.id,
    v_username,
    coalesce(new.raw_user_meta_data->>'display_name', v_username),
    'online',
    v_discriminator
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$func$;

-- Re-attach the trigger (drop+create to ensure it points to the updated function)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
