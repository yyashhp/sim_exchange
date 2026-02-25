# Supabase Setup Guide - Centralized Database

This guide will help you set up a **centralized PostgreSQL database** using Supabase (free tier) so that all game servers share the same data, regardless of who hosts.

## Why Centralized Database?

**Before (Local SQLite):**
```
Player A hosts → Database on A's computer
Player B hosts → Database on B's computer
❌ Separate data, can't see each other's games
```

**After (Centralized PostgreSQL):**
```
Player A hosts → Supabase Database ☁️
Player B hosts → Supabase Database ☁️
Player C hosts → Supabase Database ☁️
✅ All data in one place! Everyone sees all games and stats
```

---

## Step 1: Create Supabase Account (2 minutes)

1. **Go to** https://supabase.com
2. **Click** "Start your project"
3. **Sign in** with GitHub (or email)
   - It's FREE - no credit card required
   - Free tier includes:
     - 500MB database
     - 1GB file storage
     - 2GB bandwidth
     - Unlimited API requests

---

## Step 2: Create New Project (2 minutes)

1. **Click** "New Project"
2. **Fill in details**:
   ```
   Organization: Create new or use existing
   Name: sim-exchange-trading
   Database Password: [Choose a strong password]
   Region: Choose closest to you (e.g., US West, Europe, Asia)
   ```
3. **Click** "Create new project"
4. **Wait** ~2 minutes for database to provision
   - You'll see a progress indicator
   - Coffee break time! ☕

---

## Step 3: Get Connection String (1 minute)

1. **Once project is ready**, go to **Settings** (gear icon on left)
2. **Click** "Database" in the left menu
3. **Scroll to** "Connection string"
4. **Select** "URI" tab
5. **Copy** the connection string - it looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:YOUR-PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres
   ```
6. **Replace** `[YOUR-PASSWORD]` with your actual database password

**⚠️ Important**: Keep this connection string **SECRET**! It's like a password to your database.

---

## Step 4: Configure Your Server (30 seconds)

### Option A: Using .env file (Recommended)

Create a file called `.env` in the `server` directory:

```bash
cd server
touch .env
```

Add this line (replace with your actual connection string):
```bash
DATABASE_URL=postgresql://postgres.xxxxxxxxxxxx:YOUR-PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```

### Option B: Using environment variable

**Linux/Mac:**
```bash
export DATABASE_URL="postgresql://postgres.xxxxxxxxxxxx:YOUR-PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
```

**Windows (PowerShell):**
```powershell
$env:DATABASE_URL="postgresql://postgres.xxxxxxxxxxxx:YOUR-PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres"
```

**Windows (CMD):**
```cmd
set DATABASE_URL=postgresql://postgres.xxxxxxxxxxxx:YOUR-PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```

---

## Step 5: Install Dependencies (if needed)

```bash
cd server
npm install
```

This will install the PostgreSQL client library (`pg`).

---

## Step 6: Start Your Server (10 seconds)

```bash
cd server
node server.js
```

You should see:
```
[DATABASE] PostgreSQL adapter initialized
[DATABASE] Connecting to remote database...
[DATABASE] PostgreSQL schema ready
[SERVER] 🌐 Using PostgreSQL - CENTRALIZED cloud database
[SERVER] 📊 All game servers will share the same data!
```

✅ **Success!** Your server is now connected to the centralized database!

---

## Step 7: Share with Friends (5 seconds)

Now anyone can host a game server and **all data will go to the same database**!

**Just share** the `DATABASE_URL` with them:
1. Send them the connection string (securely - not in public chat!)
2. They set it as an environment variable
3. They start their server
4. 🎉 All games go to the same database!

---

## Verification

### Check Connection in Supabase Dashboard

1. Go to your Supabase project
2. Click **"Table Editor"** in the left menu
3. You should see tables: `games`, `players`, `orders`, `trades`, `events`
4. After playing a game, refresh - you'll see data!

### Check from Your Server

```bash
curl http://localhost:3001/api/database/stats
```

Should return:
```json
{
  "mode": "PostgreSQL",
  "connection": "Supabase",
  "games": 0,
  "players": 0,
  "orders": 0,
  "trades": 0,
  "events": 0
}
```

---

## Troubleshooting

### Error: "DATABASE_URL environment variable is required"

**Solution**: You forgot to set the `DATABASE_URL`. Go back to Step 4.

### Error: "connection timeout" or "ECONNREFUSED"

**Possible causes**:
1. **Wrong connection string** - Double-check you copied it correctly
2. **Firewall blocking** - Your firewall might be blocking PostgreSQL port (5432)
3. **Wrong password** - Make sure you replaced `[YOUR-PASSWORD]` with actual password

**Solution**:
```bash
# Test connection manually
node -e "const {Pool} = require('pg'); new Pool({connectionString: process.env.DATABASE_URL}).query('SELECT NOW()').then(r => console.log('✅ Connected:', r.rows[0])).catch(e => console.error('❌ Error:', e.message))"
```

### Error: "password authentication failed"

**Solution**: Your password is wrong. Reset it:
1. Go to Supabase Dashboard
2. Settings → Database
3. Click "Reset database password"
4. Update your `DATABASE_URL` with new password

### Error: "too many connections"

**Solution**: Free tier has a connection limit. Make sure you're closing old server instances.

```bash
# Check how many servers are running
ps aux | grep "node server.js"

# Kill old ones if needed
killall node
```

---

## Security Best Practices

### ✅ DO:
- Keep your `DATABASE_URL` secret
- Use `.env` file and add it to `.gitignore`
- Only share with trusted friends
- Use a strong database password

### ❌ DON'T:
- Commit `.env` file to git
- Share connection string in public Discord/Slack
- Post it on GitHub
- Use a weak password like "password123"

---

## Switching Back to Local SQLite

If you want to go back to local-only database:

```bash
# Just unset the environment variable
unset DATABASE_URL

# Then restart server
node server.js
```

You'll see:
```
[SERVER] 💾 Using SQLite - LOCAL file database
```

---

## Cost Considerations

**Supabase Free Tier includes:**
- ✅ 500MB database storage (enough for ~50,000 games)
- ✅ 1GB bandwidth per month
- ✅ Unlimited API requests
- ✅ No credit card required

**When you might need to upgrade:**
- Database > 500MB (~50,000+ games)
- Heavy API usage (thousands of concurrent players)
- Need backups/point-in-time recovery

**Paid plans start at $25/month** but you likely won't need this for a long time!

---

## Advanced: Using Environment Variables in Production

### Using dotenv (Recommended)

Install dotenv:
```bash
npm install dotenv
```

Add to top of `server.js`:
```javascript
require('dotenv').config();
```

Now your `.env` file will be automatically loaded!

### Using Railway/Heroku

These platforms have built-in environment variable settings:
- **Railway**: Settings → Variables → Add `DATABASE_URL`
- **Heroku**: Settings → Config Vars → Add `DATABASE_URL`

---

## Next Steps

1. ✅ Play some games - data will be saved to Supabase
2. 📊 View data in Supabase Table Editor
3. 🔍 Run analysis queries (see `ANALYSIS_QUERIES.md`)
4. 🤝 Share `DATABASE_URL` with friends so they can host too!
5. 🎮 Build a leaderboard across all games

---

## Questions?

- **Supabase Docs**: https://supabase.com/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Issues**: Check GitHub issues or Discord

---

**🎉 Congratulations!** You now have a centralized cloud database that works across all game hosts!
