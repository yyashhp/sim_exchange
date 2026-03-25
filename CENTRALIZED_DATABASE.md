# Centralized Database Setup ☁️

This document explains how to set up a **universal centralized database** so that all game servers (regardless of who hosts) share the same data.

## Quick Start (5 minutes)

### 1. Create Supabase Database

1. Go to https://supabase.com and sign up (FREE, no credit card)
2. Create a new project named `sim-exchange-trading`
3. Wait 2 minutes for it to provision
4. Copy the connection string from Settings → Database → Connection String (URI)

### 2. Configure Your Server

Create `server/.env` file:
```bash
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```

### 3. Start the Server

```bash
cd server
npm install  # First time only
node server.js
```

You should see:
```
[SERVER] 🌐 Using PostgreSQL - CENTRALIZED cloud database
[SERVER] 📊 All game servers will share the same data!
```

### 4. Share with Friends

Anyone can now host a game and all data goes to the same database!

**Share:**
1. The `DATABASE_URL` connection string (privately!)
2. They create `server/.env` with the same URL
3. They start their server
4. 🎉 All games appear in the same database!

---

## Architecture

### Before (Local SQLite):
```
Player A hosts → Database A (on A's computer)
Player B hosts → Database B (on B's computer)
❌ Separate data
```

### After (Centralized PostgreSQL):
```
Player A hosts → Supabase Database ☁️
Player B hosts → Supabase Database ☁️
Player C hosts → Supabase Database ☁️
✅ All data in one place!
```

---

## What Gets Shared

When using the centralized database, **ALL** of the following data is shared across all hosts:

- ✅ **All game sessions** from everyone
- ✅ **Player statistics** across all games
- ✅ **Trade history** from all games
- ✅ **Order data** and market activity
- ✅ **Leaderboards** spanning all games

This means you can:
- See how you rank against all players
- Analyze trading patterns across all games
- Track strategy evolution over time
- Build global leaderboards

---

## Configuration Options

The server **auto-detects** which database to use:

| Environment Variable | Database Type | Use Case |
|---------------------|---------------|----------|
| `DATABASE_URL` set | PostgreSQL (Supabase) | **Centralized** - All hosts share data |
| Nothing set | SQLite (local file) | **Local** - Data only on this machine |
| `USE_MEMORY_DB=true` | In-memory | **Testing** - No persistence |

---

## Detailed Setup

See **[server/database/SUPABASE_SETUP.md](./server/database/SUPABASE_SETUP.md)** for:
- Step-by-step Supabase setup with screenshots
- Troubleshooting common issues
- Security best practices
- Cost considerations
- Advanced configuration

---

## Switching Between Databases

### Use Centralized Database (PostgreSQL)
```bash
export DATABASE_URL="postgresql://..."
node server.js
```

### Use Local Database (SQLite)
```bash
unset DATABASE_URL
node server.js
```

### Use Memory (Testing)
```bash
export USE_MEMORY_DB=true
node server.js
```

---

## Security

**⚠️ IMPORTANT**: The `DATABASE_URL` contains credentials to your database!

### ✅ DO:
- Keep `DATABASE_URL` secret
- Use `.env` file (already in `.gitignore`)
- Only share with trusted friends
- Use a strong database password

### ❌ DON'T:
- Commit `.env` to git
- Post `DATABASE_URL` publicly
- Use weak passwords

---

## Verification

### Check Database Mode

When you start the server, look for:

**Centralized (PostgreSQL):**
```
[SERVER] 🌐 Using PostgreSQL - CENTRALIZED cloud database
```

**Local (SQLite):**
```
[SERVER] 💾 Using SQLite - LOCAL file database
```

### Check Database Stats

```bash
curl http://localhost:3001/api/database/stats
```

**PostgreSQL Response:**
```json
{
  "mode": "PostgreSQL",
  "connection": "Supabase",
  "games": 5,
  "players": 20,
  "trades": 150
}
```

**SQLite Response:**
```json
{
  "mode": "sqlite",
  "dbPath": "/path/to/trading_game.db",
  "games": 5,
  "players": 20
}
```

---

## Cost

**Supabase Free Tier (forever free):**
- 500MB database (enough for ~50,000 games)
- 1GB bandwidth/month
- Unlimited API requests
- No credit card required

You likely won't need to upgrade unless you have **thousands of concurrent players**.

---

## Troubleshooting

### "DATABASE_URL environment variable is required"
- You forgot to set `DATABASE_URL`
- Create `server/.env` file with your connection string

### "connection timeout" or "ECONNREFUSED"
- Check your connection string is correct
- Make sure you replaced `[YOUR-PASSWORD]` with actual password
- Check firewall isn't blocking port 5432

### "password authentication failed"
- Wrong password in connection string
- Reset password in Supabase dashboard

### Data not appearing for other hosts
- Make sure everyone is using the **same** `DATABASE_URL`
- Check they're connecting to PostgreSQL (not SQLite)
- Verify in Supabase Table Editor

---

## Next Steps

1. ✅ Set up Supabase (5 minutes)
2. 🎮 Play some games - data saves automatically
3. 📊 View data in Supabase Table Editor
4. 🤝 Share `DATABASE_URL` with friends
5. 🏆 Build global leaderboards
6. 📈 Analyze trading patterns across all games

---

## Support

- **Full Setup Guide**: [server/database/SUPABASE_SETUP.md](./server/database/SUPABASE_SETUP.md)
- **Analysis Queries**: [server/database/ANALYSIS_QUERIES.md](./server/database/ANALYSIS_QUERIES.md)
- **Supabase Docs**: https://supabase.com/docs
- **Issues**: GitHub issues or Discord

---

**🎉 You're all set!** Now everyone can host games and contribute to the same centralized database!
