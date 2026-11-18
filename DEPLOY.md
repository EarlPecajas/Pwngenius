# Deploy PwnGenius CTF

## Supabase

1. Create a Supabase project.
2. Open the SQL Editor and run `supabase-schema.sql`.
3. Register the first account in the deployed app.
4. Promote that account to admin in SQL Editor:
   ```sql
   update public.profiles p
   set email = u.email
   from auth.users u
   where p.id = u.id;

   update public.profiles set role = 'admin' where username = 'your-admin-username';
   ```
5. Copy the project URL, server-only service role key, and public anon key from the API settings.

## Vercel

1. Import this folder into Vercel.
2. Add these environment variables in the Vercel project settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `FLAG_HMAC_SECRET`
3. Deploy.

Generate `FLAG_HMAC_SECRET` with a cryptographically secure random value. It
must remain server-only and must not be added to frontend code or
`NEXT_PUBLIC_*` variables. Use the same secret for every deployment that
needs to verify the same flags. After running the SQL migration, edit the
existing challenge in the admin dashboard and enter its flag once so the
database stores a new HMAC instead of an old SHA-256 hash. Before editing it,
clear the old hash once in Supabase:

```sql
update public.challenges set flag_hash = '' where id = 'first';
```

The service role key is used only by `api/submit.js`. Do not add it to frontend code or expose it as a `NEXT_PUBLIC_` variable.
The anon key is safe to expose to the browser, but keep the service role key server-only.
