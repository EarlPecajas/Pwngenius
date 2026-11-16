# Deploy PwnGenius CTF

## Supabase

1. Create a Supabase project.
2. Open the SQL Editor and run `supabase-schema.sql`.
3. Copy the project URL and the server-only service role key.

## Vercel

1. Import this folder into Vercel.
2. Add these environment variables in the Vercel project settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy.

The service role key is used only by `api/submit.js`. Do not add it to frontend code or expose it as a `NEXT_PUBLIC_` variable.
