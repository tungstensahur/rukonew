# Ruko
Run locally: `node server.js` then open http://localhost:3000 (Node 18+, no installs needed).
Deploy: put these files in a GitHub repo, then on render.com choose New > Web Service, pick the repo,
Build Command: (leave empty), Start Command: `node server.js`.
Data is stored in `data/data.json`. On Render's free plan this file is wiped on restarts/redeploys;
add a Render Disk and set the environment variable DATA_DIR to its mount path to keep it.

## Admin account
Log in with username `Ruko`. Its password is read from the ADMIN_PASSWORD environment variable
(on Render: your service > Environment > Add Environment Variable). It is not stored in the code.
The Admin tab lets Ruko rename or delete any player hat or game and change hat prices.

## New in this version
Game thumbnails (upload an image or use the 3D preview), a full level editor (platforms, walls, moving and crumbling
platforms, lava, bounce pads, checkpoints, goals, coins, decorations, undo/redo, draft autosave, edit your published
games), a shop with search/filters/sorting/likes/try-on, global chat and in-game chat, and name tags above players.

## Keeping data when the server restarts (free)
Render's free plan wipes its disk on every restart or redeploy. To keep accounts, hats, games, sales and likes:
1. Go to upstash.com, sign up, and create a Redis database (free plan, any region).
2. On the database page, copy the REST URL and the REST TOKEN.
3. In Render: your service > Environment > add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN with those values. Save (it redeploys).
The deploy log should say "Loaded all data from Redis" (or "Redis is empty: starting fresh" the first time).
If Redis cannot be reached at startup, the server refuses to start instead of overwriting your data.
The Admin tab has a "Download full backup" button as an extra safety net.

## Profiles
Click any username (catalog, games, chat, servers) to open their profile, or use the Profile button / Find players.

## T-shirts and weapons
Players design shirts in Creator Studio > T-shirts. Shirts stay hidden until the Ruko account approves them in the Admin tab
(a count shows next to Admin). Game creators can add weapons (sword, pistol, rifle, shotgun, sniper, custom), place weapon pickups
and spawn points, and turn on PVP. PVP damage only happens on servers (the Servers tab), where the server decides every hit.
