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
