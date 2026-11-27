# Recall demo video

The under-3-minute demo for the #BuildHybridAI 2026 submission, made in code:

| Part | Tool | Where |
| --- | --- | --- |
| Narration | Gemini TTS through Firebase AI Logic (`gemini-3.8-flash-tts`, voice Sulafat, style set in `speechMetadata`): the app's own voice | `narration/` → `public/narration/*.wav` |
| Music | "Cinematic pulse", composed with Tone.js (drums, sub bass, pads, a piano-like motif, a synth pulse) and rendered offline | `music/` → `public/music.wav` |
| Footage | The real app on a "film set": sign-in, the database and the model replies are scripted stand-ins, so every screen records with realistic data and timing | `harness/`, `capture/` → `public/clips/` |
| Edit | Remotion: the real interface, full frame, with the camera easing in on what is being described and a ring round what matters most. Otherwise only text: subtitles, and a plain label naming each technique. The music is ducked under the voice | `src/` |

## Honest note on the footage

Headless browsers have no Gemini Nano, so on the film set the model replies are scripted
(`harness/mocks/engine.ts`, `tutor.ts`, `gauntlet.ts`), with realistic delays. Everything else is
the real app: its UI, its router (`src/core/route.ts`, which decides every route and reason shown),
its self-audit and its game rules. Real recordings on a Nano-capable Chrome can replace any clip.

## Making it

Everything starts from **[SCRIPT.md](SCRIPT.md)**: each part's narration, its label, and its
highlights (the phrase on which the cursor points at something, or a ring goes round it). Edit it,
then run the steps below from this folder (`npm install` done here and in the repo root).

```sh
# 1. The script, checked: every highlight's phrase must be in its narration
node narration/parse.cjs                  # writes narration/script.json

# 2. The voice (needs the app's dev server for Firebase + its debug App Check token)
(cd .. && npx vite --port 5188)          # in another terminal
node narration/tts.cjs hook add           # name the parts to voice (a part without a WAV is voiced anyway)
MODEL=gemini-3.8-flash-lite-tts node narration/tts.cjs voice   # another TTS model, if needed

# 3. The clock: when each part starts and each phrase is spoken
node narration/timing.cjs                 # writes src/plan.json

# 4. The footage, acted out on those cues (the film set on :5199)
npx vite --config harness/vite.config.ts  # in another terminal
node capture/scenes.cjs                   # or name scenes: hook add study gauntlet voice engine close

# 5. Music at the video's length, then preview and render
node music/render.cjs 160 cinematic && cp out/music/cinematic.wav public/music.wav
npm run studio                            # Remotion Studio, to preview
node stills.mjs 6 23 49                   # stills at given seconds, from one bundle
npm run render                            # out/recall-demo.mp4
```

**How the timing works.** `narration/timing.cjs` finds when each phrase is spoken: it matches the
voice's pauses to the punctuation in the text, and spreads the words between pauses by their
length. Each scene in `capture/scenes.cjs` then waits for its phrases (`s.on`, `s.point`,
`s.circle`), so the recording plays at normal speed under the voice. A scene that cannot keep up
says which phrase it was late for; give that part more time in `HOLD` in `narration/timing.cjs`.
The edit (`src/timeline.ts`) is worked out from the plan and the recordings: the camera eases in
on each highlight, rings are drawn from the boxes measured while recording, and nothing is tuned
by hand.

Gemini's free tier allows 10 TTS requests a day per model; the lite model has its own 10 and the
same voice.
