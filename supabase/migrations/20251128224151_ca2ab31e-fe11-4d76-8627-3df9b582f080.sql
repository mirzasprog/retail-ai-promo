-- Kreiraj novog korisnika direktno u auth.users tabeli
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Generiši ID za novog korisnika
  new_user_id := gen_random_uuid();
  
  -- Kreiraj korisnika samo ako email ne postoji
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ensar.selimovic@mstart.eu') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'ensar.selimovic@mstart.eu',
      crypt('Mi0809se!!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Ensar Selimovic"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
    
    -- Dodaj admin rolu
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_user_id, 'admin'::app_role);
  END IF;
END $$;