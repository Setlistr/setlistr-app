# Setlistr V1 — Deploy Guide

## Step 1: Supabase Setup

1. Go to supabase.com → your project (or create new)
2. Go to **SQL Editor** → paste entire `supabase-schema.sql` → Run
3. Go to **Storage** → create bucket named `performance-proofs` → set to **Public**
4. Go to **Authentication → Settings**:
   - Confirm email: **OFF**
   - Email provider: **ON**
5. Go to **Project Settings → API** → copy:
   - Project URL
   - anon/public key

## Step 2: GitHub

1. Create new repo at github.com
2. Upload all files from this folder
3. Make sure `setlistr-schema.sql` is NOT committed if you want (it's just reference)

## Step 3: Vercel

1. vercel.com → New Project → Import your GitHub repo
2. Framework: **Next.js**
3. Root Directory: leave blank (or set to folder name if nested)
4. Environment Variables — add these:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
   NEXT_PUBLIC_APP_URL = https://your-app.vercel.app
   ```
5. Deploy

## Step 4: First Login

1. Go to your Vercel URL `/auth/login`
2. Click **Sign up**
3. Enter email + password (min 6 chars)
4. You're in

## Step 5: Make yourself admin (optional)

In Supabase SQL Editor:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

## The Core Flow

1. Dashboard → **Start New Performance**
2. Fill in artist, venue, city, date, duration
3. Press **Start Performance** → Live capture screen
4. Log songs as you play (or just let it run)
5. Press **End Performance** → Review screen
6. Edit setlist, upload proof photo
7. **Save Performance** → appears in History
