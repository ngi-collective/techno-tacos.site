# Session checklist

## 5-minute check, before the kids arrive

1. Open this folder in VS Code and run `npm run serve` in one integrated terminal.
2. Open `http://localhost:8080/sample_project/` on the Mac. You should see the starting beach.
3. Run `claude` in a second integrated terminal and accept the folder trust prompt.
4. Click into `transcript.md` and press `⌥⌘V`. Accept the mic prompt, wait for the model download, say a sentence, then press `Escape`. Check that the text landed with correct spacing.
5. Send `Reply with one line: Summary: Testing the speaker.` to Claude. You should hear it spoken.
6. Quest, if using: open `https://techno-tacos.site/` and press Enter VR, since VR needs HTTPS. Then clear `transcript.md`.

If a step fails, drop that part:
- Dictation: use macOS Dictation or type what the kids say.
- Speech: set `"disableAllHooks": true` in `.claude/settings.json`.
- Quest: stay in the desktop browser.

## Running the session

1. Kids describe their project into `transcript.md`, one at a time, close to the mic.
2. Tidy the text. Take out names and personal details. Send `@transcript.md describe what you heard`.
3. Run `/grill-the-team`. Read each question aloud, dictate the answer into `transcript.md` in place of the last one, and send `@transcript.md`.
4. Speak the implementation details below into `transcript.md`, tidy, and send.
5. Reload the browser after each build step. Let the kids ask for changes: "make the waves bigger", "put our picture on the pier".
6. Finish with the Quest, if using it.

## Implementation details to speak

- Start from `sample_project`, then build the website from `decisions.md`, using `team_data/` for the team's images and documents.
- A beach you can walk around with WASD and the mouse, with moving water, a city across the bay and wave sounds.
- Each picture on a sign the visitor can walk up to.
- An Enter VR button for the Quest, on the same scene.
- Build it in small steps so we can reload and look after each one. Start with the water and sky.

## Good changes to show off

- "Make it sunset." The sky, water and light change together.
- "Add seagulls that circle over the water."
- "Add a boat that sails across the bay."

If a change goes wrong, run `/rewind` to go back.
