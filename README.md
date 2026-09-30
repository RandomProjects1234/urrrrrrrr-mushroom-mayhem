# URRRRRRRR: Knee-High Mushroom Mayhem

## What is this?

A complete desktop browser party game for 2–8 friends. Everyone wears absurd
thrifted boots, throws TNT, eats suspicious mushrooms, and competes for the most
chaos points during a five-minute round. A full meter unlocks ten seconds of
excessive **URRRR MODE**.

Three.js renders a procedural low-poly floating forest. PeerJS creates real
WebRTC data connections between the host and each guest. The host browser runs
the authoritative simulation. **There is no Node.js game backend.** Node and
Vite are development/build tools only; players need only the published URL.

This repository is the complete game project and deploys as a static site.

## How to install dependencies

Use Node.js 22.12+ (Node 24 also works), then run in this folder:

```sh
npm install
```

The lockfile is included. For a reproducible install, use `npm ci`.

## Development

```sh
npm run dev
```

Open the localhost address printed in the terminal (normally
`http://localhost:5173/`). Click **SOLO PRACTICE** for an offline sandbox, or
**HOST GAME** / **JOIN GAME** to test multiplayer with internet access. The
development command does not open a browser automatically.

If your global npm launcher is broken but dependencies are installed, start Vite
directly with `node node_modules/vite/bin/vite.js`.

## Production build

```sh
npm run check
npm test
npm run build
npm run preview
```

`dist/` contains only static HTML, JavaScript, CSS, and optional public assets.
Vite's `base: './'` keeps built asset URLs relative, including at
`https://USERNAME.github.io/REPOSITORY/`. Do not open the source HTML using a
`file://` URL. Use Vite locally or an HTTPS static host in production.

## GitHub Pages deployment

1. Create a GitHub repository. A public repository supports Pages on GitHub Free.
2. Upload this folder's **contents** to its root, including `src`, `styles`,
   `public`, `package.json`, `package-lock.json`, `vite.config.js`,
   `eslint.config.js`, `tests`, and `.github/workflows/deploy.yml`.
   Include the hidden `.github` folder. Do not upload `node_modules`, `.npm-cache`,
   or `dist`; the workflow builds `dist` itself.
3. Use `main` as the default branch.
4. In the repository, open **Settings → Pages → Build and deployment → Source**
   and select **GitHub Actions**. Enable Actions if the repository has them disabled.
5. Push to `main`. The **Deploy Mushroom Mayhem to GitHub Pages** workflow installs
   dependencies, runs lint and rule tests, builds, and publishes. You can also
   run it manually from the **Actions** tab.
6. Wait for the workflow to finish. Find your URL in **Settings → Pages** or the
   deployment job. Share that one URL with your friends.

These steps follow [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
The workflow assumes the game is the repository root. If you deliberately keep
it nested in a larger repository, move the workflow to that repository's root
`.github/workflows`, set its run working directory to the game folder, set
`cache-dependency-path` to that folder's lockfile, and change the upload path to
that folder's `dist`.

Subsequent pushes to `main` automatically rebuild and publish the game.

## Multiplayer

1. Open the game URL.
2. Enter your display name (maximum 18 characters).
3. The host clicks **HOST GAME**.
4. The host copies the displayed room code, such as `URRRR-X7K2AB`.
5. Send friends the game URL and room code.
6. Friends open the **same** GitHub Pages URL.
7. They click **JOIN GAME**.
8. Enter the room code (the six-character suffix also works).
9. Once everyone appears in the lobby, the host clicks **START THE MAYHEM**.
10. Click the forest to capture the mouse. Escape releases it.

The host can start alone, which is useful for checking the game. Solo Practice
uses the same simulation without connecting to PeerJS and cannot accept guests.
Rooms lock when the first match starts. The original crew stays connected for
replays; to invite a new player, leave and create a new lobby.

The host must keep the game page open. A guest leaving removes that player.
When the host leaves or the host heartbeat times out, guests see **HOST LEFT THE
GAME** and return to the menu. Host migration and reconnect-to-running-match
are not implemented.

## Controls

| Control | Action |
| --- | --- |
| WASD | Move relative to the camera |
| Mouse | Rotate third-person camera / aim |
| Shift | Sprint |
| Space | Jump; press again while airborne to boot stomp |
| Left mouse | Throw TNT |
| E | Collect nearby TNT or a mushroom |
| Q | Use held mushroom |
| R | Activate URRRR MODE when meter is full |
| Escape | Release mouse / open game menu |

The game menu does not pause a multiplayer round. Settings provide volume,
mouse sensitivity, graphics quality, and reduced camera shake/flashing. Desktop
keyboard and mouse are recommended; mobile browsers display that recommendation.

## Mushrooms, chaos, and scoring

| Mushroom | Color | Effect after Q |
| --- | --- | --- |
| Giant | Coral | Enormous next TNT explosion |
| Bounce | Cyan | Next TNT launches players exceptionally high |
| Speed | Yellow | Eight seconds of boosted movement |
| Mushroom Mushroom | Lime | Grows ten tiny collectible mushrooms |
| Mystery | Purple | Randomly selects one of the other effects |
| URRRR | Pink | Adds 55 meter points |

Only one mushroom can be held; use it before collecting another. Giant/Bounce
prime the next thrown TNT. Using another Giant/Bounce replaces that pending
effect. TNT crates restore three charges, capped at ten.

TNT has a 2.1 second fuse and a 0.55 second throw cooldown. Normal explosions
and stomps deal one heart; Giant TNT deals two. Explosions can hit the thrower.
There is brief hit protection and 2.5 seconds of respawn protection. Protected
players can still be launched. Respawns take three seconds.

Eliminations award 150 points; throwing someone into the void credits their
recent attacker for eight seconds. Explosions, chains, launches, stomps, mushroom
pickups/uses, and surviving each ten-second interval add smaller bonuses. Falls
without a credited attacker cost 20 points, capped at the player's current score.

The meter fills through explosions, launches, stomps, pickups, and chains.
URRRR MODE increases speed and jump height, enlarges boots and TNT explosions,
regenerates TNT, rains mushrooms, makes nearby players bounce, and adds effects
other players can see. The scoreboard includes seven ridiculous awards.

## Networking and security

- Actual [`PeerJS DataConnections`](https://peerjs.com/client/api/peer) transport
  inputs, snapshots, and events over WebRTC. The bundled library uses PeerJS
  Cloud for room discovery/signaling and its default ICE configuration.
- A human-friendly room code maps deterministically to the host's PeerJS ID.
- The host simulates physics at 60Hz. Inputs and snapshots are sent at 20Hz,
  independently of rendering. Remote players interpolate with a 100ms buffer
  and bounded extrapolation. Local movement uses host snapshots and short
  extrapolation, without full client prediction/rollback.
- Mushroom/ammo/barrel changes use events; a world repair snapshot is sent
  every eight seconds. Player/TNT snapshots contain bounded lists and rounded
  coordinates. Backed-up state packets are skipped rather than queued forever.
- Clients submit controls only. Connection identity determines which player
  those controls affect. The host owns movement, cooldowns, inventory, damage,
  knockback, scoring, deaths, respawns, mushrooms, TNT, and round timing.
- Messages have direction/type/shape/size/range checks. Duplicate input sequence
  numbers are ignored. Stale controls expire. Host-side connection/message
  limits restrict client floods. Display names are sanitized and always rendered
  with `textContent` or canvas text; received markup is never inserted as HTML.
- The host is trusted. A modified host can cheat, and this is not a ranked game.
  Room codes are invitation identifiers rather than private-room passwords.

## Project layout

```text
index.html                    Menu, lobby, HUD, accessible dialogs, results
styles/style.css              Forest-themed responsive UI
src/main.js                   Startup and graceful WebGL failure message
src/Game.js                   Rendering/game/network orchestration and camera
src/Simulation.js             Authoritative rules, rounds, scores, world state
src/NetworkManager.js         PeerJS rooms, connections, rate limits, heartbeats
src/Protocol.js               Packet validation and room code utilities
src/InputController.js        Keyboard, pointer lock, queued actions
src/Physics.js                Acceleration, gravity, collisions, impulses
src/WorldLayout.js            Shared terrain, structures, ramps, spawns, trees
src/World.js                  Procedural arena, batched static meshes, items
src/Assets.js                 Reused geometry/materials and canvas signs
src/Player.js                 Low-poly character, absurd boots, animations
src/RemotePlayer.js           Snapshot interpolation
src/TNT.js                    Throwable TNT physics
src/Mushroom.js               Six mushroom effects
src/BootStomp.js               Height-dependent stomp strength
src/UrrrrMode.js               Meter and ten-second activation
src/Effects.js                Capped instanced particles, waves, blast marks
src/AudioManager.js           Original Web Audio effects, safely optional
src/UI.js                     Menu, settings, safe player names, HUD, results
src/config.js                 Gameplay tuning, colors, mushroom definitions
tests/                        Non-interactive simulation/protocol checks
.github/workflows/deploy.yml   Build, verify, and deploy on main
```

## Performance and limitations

The simulation caps players at eight, active TNT at 32, collectible mushrooms
at 60, ammo/barrels at 16 each, and effect particles at 280. Static forest
geometry is batched by material. Transient effects and player labels are disposed
when removed; primitive geometry and materials are shared. Low Power graphics
disables shadows and lowers render resolution.

60 FPS is a target, not a measured guarantee. Real browser rendering and
cross-network WebRTC were intentionally left for manual testing; no browser or
interactive session was opened during implementation. Automated tests cover
gameplay rules, malicious packets, interpolation, lifecycle behavior, scene
construction, and a full eight-player simulation.

Multiplayer requires internet access to PeerJS signaling. Some restrictive
networks, VPNs, firewalls, or blocked public TURN services can prevent WebRTC
connections. Try another network or configure a suitable ICE/TURN service in
`NetworkManager.options()`; production TURN credentials should be obtained
through an appropriate credential service, rather than embedding a private
long-lived secret in this public static site.

Keep the host tab visible for the smoothest play. Background browser throttling
preserves the match clock but can reduce simulation/network frequency. Physics
uses simple bodies and terrain/structure collisions; there are no ragdolls or
player-to-player solid collisions. The cave and scenic props use simple geometry.
There is one arena and one game mode, with no bots or mobile touch controls.

## Manual acceptance checklist

1. Run Solo Practice: click to capture, move, jump, sprint, and release with Escape.
2. Traverse ramps/bridges, run into buildings and mushroom trunks, use bounce
   pads, stomp from height, and fall off the island to confirm respawning.
3. Pick up every mushroom color, use Q, collect TNT with E, throw with left click,
   trigger barrel chains, fill the meter, and activate R. Check audio/settings.
4. Host in one browser and join from a different browser/device using the code.
   Verify names/colors and host-only Start, then positions, damage, launches,
   mushroom removal, TNT chains, meter changes, and scores on both screens.
5. Repeat with friends on different internet connections and up to eight players.
   Check movement responsiveness and host upload/performance.
6. Leave as a guest, then close the host tab. Check graceful removal and the
   **HOST LEFT THE GAME** return-to-menu behavior. Test invalid and full rooms.
7. Finish five minutes, check the scoreboard/awards, and have the host replay.
8. After Pages deploys, repeat joining at the repository URL; inspect for asset
   404s and verify copy-code permissions over HTTPS.

To shorten a manual test round, temporarily change `roundSeconds` in
`src/config.js`, then restore it to 300 before publishing.
