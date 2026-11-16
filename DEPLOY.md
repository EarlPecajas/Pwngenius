# Deploy PwnGenius CTF

## Supabase

1. Create a Supabase project.
2. Open the SQL Editor and run `supabase-schema.sql`.
3. Register the first account in the deployed app.
4. Promote that account to admin in SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where username = 'your-admin-username';
   ```
5. Copy the project URL, server-only service role key, and public anon key from the API settings.

## Vercel

1. Import this folder into Vercel.
2. Add these environment variables in the Vercel project settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
3. Deploy.

The service role key is used only by `api/submit.js`. Do not add it to frontend code or expose it as a `NEXT_PUBLIC_` variable.
The anon key is safe to expose to the browser, but keep the service role key server-only.
