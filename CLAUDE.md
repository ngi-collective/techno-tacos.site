# Beach project demo

An adult runs this session live in front of a FIRST LEGO League team of 10-year-olds. Together they build a 3D website about the team's innovation project, defined with diagrams and details in `./team_data/`.

The website is a demo and a starting point. The team watches on a TV.

## Input

- Prompts often say `@transcript.md`. That file holds dictated speech tidied by the adult, so read it for intent and expect transcription mistakes.
- Facts about the project come from the transcript, `decisions.md`, and `./team_data`. Use visibly placeholder text for anything else, so the team's project stays their own.
- Team content, pictures, diagrams, and other media are in `team_data/`.

## Replies

- After a build step, end the reply with one line starting `Summary: `, a single sentence a 10-year-old would enjoy hearing. A hook reads that line aloud.
- Keep the rest of the reply to a few short lines. The team is watching the browser.
- During `/grill-the-team`, leave the `Summary: ` line out.

## Stack

- Build with three.js. A sample three.js project is in sample_project with plain ES modules: `index.html` with an import map, code in `src/`. No bundler.
- `sample_project/` is a tested working beach. Copy its `index.html` and `src/` to the project root and build there, leaving the sample intact. Asset and three.js paths are absolute, so they keep working, and the sample stays in place because the build loads its `assets/` and `node_modules/`. `src/main.js` shows where the project and pictures go, and `src/config.js` holds the values worth tuning.
- The adult runs `npm run serve` from `sample_project/`, and the build appears at `https://localhost:8443/`. Alert the adult to reload the browser when they need to.
- After editing code, run `node --check` on each changed file.

## Team project

- The interactive session will involve the team describing their innovation project. As they answer questions, save their responses in `team_data/project/` for future reference.
- Everything the team contributes should be saved in `team_data/project/` so it can be used later in the build and for reference.

## Scene targets

Aim for a scene that makes onlookers say "whoa": animated water, sand, a city skyline, wave sounds, and a fully replicated, simulated project in the sand.

- Water and sky: `three/addons/objects/Water.js` and `Sky.js`. `sample_project/assets/waternormals.jpg` is the normal map, and `sample_project/assets/sand.png` is a tiling sand texture.
- Composition: keep open water between the beach and the skyline, with the city far across a bay. Keep the sun off to the side of the main view with a low tone-mapping exposure. In an earlier spike, a city at the shoreline hid the water and a sun in view washed out the frame.
- Audio: `sample_project/assets/waves.wav` on a looping `PositionalAudio` near the shoreline. Start it from the first click, because browsers require a gesture.
- Desktop browser is the main view: WASD plus mouse-look with `PointerLockControls`, and a clear "click to start" prompt.
- Quest is optional: `VRButton` on the same scene. Render directly with `renderer.render` in both views: bloom through a post-processing composer washed out the whole desktop frame in testing. Quest frame rate is untested, so keep water texture size and particle counts adjustable from constants at the top of the file.
