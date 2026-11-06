# 風の小屋 (Kaze no Koya) — A Walkable Portfolio

A Ghibli-inspired personal website you can walk through. It opens in three acts: a wide title shot → a zoom into the cabin → an outfit change → exploring the room with WASD.

Built with Phaser 3, TypeScript, and Vite.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
```

## Build
```bash
npm run build      # outputs to dist/
```

## Project structure
- `design.md` — design document (four tables); the source of truth for the project
- `src/config/` — constants, outfits, project cards, and scene settings
- `src/entities/` — the player character and its animation rig
- `src/scenes/` — scenes (title, dressing room, main room, desk, window, fireplace, attic)
- `src/systems/` — shared systems (overlays, labels, lighting, audio, effects)
- `tools/` — asset scripts (e.g. building the character rig)
- `public/` — art and audio assets

## Debugging
Some scenes (`DeskScene.ts`, `AtticScene.ts`) have a `DEBUG` flag at the top. Set it to `true` to show coordinates when you click, which helps place interactive hotspots. Set it back to `false` when you're done.
