# Recall demo video

The under-3-minute demo for the #BuildHybridAI 2026 submission, made in code:

| Part | Tool | Where |
| --- | --- | --- |
| Narration | Gemini TTS through Firebase AI Logic (`gemini-3.8-flash-tts`, voice Sulafat, style set in `speechMetadata`): the app's own voice | `narration/` → `public/narration/*.wav` |
| Music | "Cinematic pulse", composed with Tone.js (drums, sub bass, pads, a piano-like motif, a synth pulse) and rendered offline | `music/` → `public/music.wav` |
| Footage | The real app on a "film set": sign-in, the database and the model replies are scripted stand-ins, so every screen records with realistic data and timing | `harness/`, `capture/` → `public/clips/` |
| Edit | Remotion: the real interface, full frame, with camera zooms onto what is being described. The only additions are text: subtitles, and plain labels naming each technique. The music is ducked under the voice | `src/` |

## Honest note on the footage

Headless browsers have no Gemini Nano, so on the film set the model replies are scripted
(`harness/mocks/engine.ts`, `tutor.ts`, `gauntlet.ts`), with realistic delays. Everything else is
the real app: its UI, its router (`src/core/route.ts`, which decides every route and reason shown),
its self-audit and its game rules. Real recordings on a Nano-capable Chrome can replace any clip.

## Making it

From this folder, with `npm install` done here and in the repo root:

```sh
# 1. Narration (needs the app's dev server for Firebase + its debug App Check token)
(cd .. && npx vite --port 5188)          # in another terminal
node narration/tts.cjs                    # only segments without a WAV; or name ids to redo them
MODEL=gemini-3.8-flash-lite-tts node narration/tts.cjs voice   # another TTS model, if needed

# 2. Music (the four samples, or one track at full length)
node music/render.cjs 32                  # samples: out/music/*.mp3 and index.html to compare
node music/render.cjs 176 cinematic && cp out/music/cinematic.wav public/music.wav

# 3. Footage (the film set on :5199)
npx vite --config harness/vite.config.ts  # in another terminal
node capture/scenes.cjs                   # or name scenes: hook add study gauntlet voice engine close

# 4. Narration lengths for the edit, then preview and render
node narration/durations.cjs              # writes src/narration.json
npm run studio                            # Remotion Studio, to preview
node stills.mjs 6 23 49                   # stills at given seconds, from one bundle
npm run render                            # out/recall-demo.mp4
```

Gemini's free tier allows 10 TTS requests a day per model, so some segments were voiced by
`gemini-3.8-flash-lite-tts` (same voice) on a day the main model's quota ran out. To redo one,
name it: `node narration/tts.cjs hook`.

The edit lives in `src/timeline.ts`: for each narration segment, the stretch of footage under it
(played at whatever speed fits the words), the camera's shots, and the technique labels.

Those times were tuned against one set of recordings, kept in `src/anchors/` (when each click,
mark and scroll happened). Re-recorded footage never runs at exactly the same pace, so the edit
carries each time across to the new recording by matching those events. Re-record freely; if a
scene's steps change, the edit says so, and its times and anchors need updating together.
