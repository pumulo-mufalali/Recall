# Recall

**Know what you actually know.** Recall turns your notes, a photo of a page or a PDF into questions, asks you to answer from memory and say how sure you are, marks the answer with AI, and shows the honest gap between feeling ready and being ready.

Built for **#BuildHybridAI 2026** with **Firebase AI Logic hybrid inference**: every piece of AI work is routed between **Gemini Nano on the device** (Chrome's built-in model) and **Gemini in the cloud**, and the app shows, for every result, where it ran and why.

> **Live app:** <https://recall-three-rust.vercel.app/> · Web (Chrome desktop for on-device AI; any modern browser works with cloud AI)
>
> **Trying it out?** Sign in with Google, then choose **"Or explore with example data"**: three decks and ten weeks of study history load into your own account, so Insights, the AI self-audit, levels and the Trap Gauntlet all have something to show straight away. Remove it any time in Settings → Your data.

## The problem

Re-reading notes makes material feel familiar, and familiar feels known. Students walk into exams overconfident about exactly the things they cannot recall. Active recall (answering from memory) and spaced repetition fix this, but making good questions is tedious and marking free-text answers needs judgement.

Recall does both with AI, and adds the piece most study apps leave out: **calibration**. After each answer, before it is marked, you say how sure you are; Recall then shows where your confidence and your results disagree. Confident mistakes are the most valuable thing to study.

## What it does

- **Make questions** from pasted notes, a photo of a textbook page, or a PDF. A second, larger model **fact-checks every card** against the source before you study it: it must quote the supporting passage, and plain code then checks that every number in a card appears in that evidence.
- **Study** by answering in your own words, after choosing a confidence level (No idea, Unsure, Fairly sure, Certain). Answers are marked against the card's key points, with feedback on what you missed.
- **Type or speak, in the same box.** A microphone in the answer box writes what you say into it, like a chat app: heard on the device by Chrome's on-device speech recognition when it can be, transcribed by Gemini otherwise (never in Private mode). A speaker on each question reads it aloud with Gemini's text-to-speech voice.
- **Talk it through:** after a miss, a tutor that knows the card, your answer and what you missed explains it, gives analogies or quizzes you, as a streamed conversation (see below).
- **The Trap Gauntlet:** a daily true-or-false game against the clock, built from your own mistakes. Gemini Nano writes a true statement and a "trap" (a plausible misconception, often your own) for each card you recently got wrong; a cloud referee checks every statement while you play. Scoring rewards honest confidence, and earns XP and levels.
- **Spaced repetition (FSRS):** each card comes back just before you would forget it. The rating comes from how well you were marked, adjusted by your confidence: a confident miss comes back soonest.
- **Insights:** calibration per confidence level, the trend over time, and your "certain but wrong" cards.
- **Plan:** a study calendar that shows how many cards come due each day, with sessions you can add to Google or Apple calendars (so your phone reminds you, with no server).
- **Works offline** as an installable app: studying continues with no connection, and work that needs the cloud waits in a queue.

## The hybrid design

The rule of thumb: **what happens often and touches your own words stays on the device; what is rare and heavy goes to the cloud.** A router (`src/core/route.ts`, pure and unit-tested) decides per task from what is known right now (online or not, Gemini Nano ready or not), and every decision carries a plain-language reason (kept in the code and logs; the app itself stays plain).

| Task | Gemini Nano ready | No on-device model | Offline |
|---|---|---|---|
| Mark an answer | `prefer_on_device` | `only_in_cloud` | device, or Recall's own key-point marker |
| Questions from short notes | `prefer_on_device` | `prefer_in_cloud` | device, else queued |
| Questions from a long chapter | `prefer_in_cloud` (sees it whole) | `prefer_in_cloud` | device, split into parts it can read, else queued |
| Questions from a photo (JPEG/PNG) | `prefer_on_device` (image input) | `only_in_cloud` | device, else queued |
| Questions from a PDF | `only_in_cloud` | `only_in_cloud` | queued until online |
| Fact-check new cards | cloud (a larger model) | cloud | device, part by part, else queued |
| Talk it through (tutor) | `prefer_on_device`, streamed | `only_in_cloud` | device (needs Gemini Nano) |
| Write the Trap Gauntlet | `only_on_device` (structured output) | `only_in_cloud` | device (needs Gemini Nano) |
| Referee the gauntlet | cloud (a larger model) | cloud | no referee: statements stand |
| Hear a spoken answer | Chrome's on-device speech recognition | Gemini transcribes the recording | type instead |
| Read a question aloud | Gemini TTS, streamed (`generateContentStream`) | Gemini TTS, streamed | the device's most natural voice |
| Explain a missed card | `prefer_in_cloud` | cloud | device, short, else queued |

The **AI engine** page in the app shows this table live for the current device and connection: go offline or install the model and the routes change in front of you.

### Hybrid techniques worth a look

- **Self-auditing marking: Nano earns trust.** Every on-device mark is weighed for doubt from free signals: Nano's own confidence, agreement with a plain word-matching marker, how close the score is to the line between right and wrong, and credit given to a near-empty answer. Doubtful marks are **escalated to the larger cloud model before you see them**; a random sample of confident marks is **spot-checked by the cloud in the background**. The agreement rate becomes Nano's **trust score** on your material, and the more it is trusted, the less is sent to the cloud. Privacy is earned, and measured (`src/core/audit.ts`).
- **A conversation that moves between engines.** The tutor is a Firebase AI Logic **chat session with streaming** (`sendMessageStream`). It runs on Nano when it can, replies stream in word by word, and each is badged with where it ran (`inferenceSource`). **"Ask a bigger model"** hands the conversation so far to the larger cloud model; a divider marks the handoff. Each message starts a session seeded with the recent turns, so the thread survives the move, and only the last eight turns are sent to fit Nano's small context (`src/services/tutor.ts`).
- **A game the hybrid makes possible: the Trap Gauntlet.** Nano writes the questions on the device from your wrong answers, so they are instant and your mistakes stay private. A larger cloud model **referees in parallel** while you play, ruling each statement fair or not against the card's model answer; an unfair one is **withdrawn live** and any points it cost are given back. Speed and privacy from the device, correctness from the cloud (`src/core/gauntlet.ts`, `src/services/gauntlet.ts`).
- **Your answers are saved only on your device.** Nobody likes getting things wrong, or wondering where their wrong answers end up. So every answer, typed or spoken, is saved only in your browser (`src/services/words.ts`); your account syncs the score, confidence and key points covered, so progress follows you, but never the words. The study screen says so under the answer box, in one plain line that matches what will happen to that answer.
- **Privacy modes the router respects.** Private, Balanced or Accuracy first. In Private mode answers never go to the cloud: marking and the tutor use `only_on_device` rather than `prefer_on_device`, which could silently fall back to the cloud, and without the built-in model the offline marker marks instead.
- **One request, two engines, same meaning.** Instructions and structured output are configured for both: `systemInstruction` and `responseSchema` in the cloud, `initialPrompts` and `responseConstraint` on the device (`src/services/engine.ts`).
- **Resilience.** Busy cloud models are retried with growing pauses, then backup models are tried in turn, and finally Nano takes the request when it fits. Long material is split into parts Nano can read one by one when offline.
- **The model download, handled honestly.** Gemini Nano is a few gigabytes. Recall asks before downloading it (`initializeDeviceModel`, with progress), holds the download back on mobile data unless you allow it (where the browser reports the connection type), and tells you when Chrome is downloading it on its own.

### Firebase features used

- **Firebase AI Logic** (Gemini Developer API): hybrid inference in all four modes, structured output, image input on the device, chat sessions, streaming, Gemini text-to-speech, and transcription.
- **Firebase App Check** with reCAPTCHA Enterprise, required by AI Logic, using limited-use tokens.
- **Remote Config:** model names, fallback models and routing limits, tunable without a release.
- **Firebase Authentication** (Google sign-in) and **Cloud Firestore** with its persistent offline cache.

## Architecture

```
src/
  core/      Pure logic, no Firebase: routing, marking, the self-audit, scheduling (FSRS),
             calibration, fact-checking, the tutor's prompts, plans. Unit-tested.
  services/  Firebase: AI Logic calls (engine.ts, tutor.ts), Firestore (store.ts), set-up (firebase.ts).
  ui/        React screens: Today, Library, Add, Study (with the tutor), Plan, Insights, AI engine, Settings.
```

Stack: React 19, TypeScript, Vite, `firebase` 13 (`firebase/ai`), `ts-fsrs`, `vite-plugin-pwa`, Vitest.

## Run it

**You need:** Node.js 22+, a Firebase project, and (for on-device AI) Chrome on desktop with the built-in Prompt API and Gemini Nano available. Without Gemini Nano, Recall still works fully with cloud AI.

1. **Firebase project.** In the [Firebase console](https://console.firebase.google.com):
   - Add a **Web app** and copy its config.
   - **AI Logic:** enable it with the Gemini Developer API.
   - **Authentication:** enable the Google provider, and add your deployed domain under *Settings › Authorized domains* (`localhost` is allowed by default).
   - **Firestore:** create a database, then deploy the rules: `npx firebase-tools deploy --only firestore`.
   - **App Check:** register the web app with **reCAPTCHA Enterprise** and add your domains to the key. For local development, register a debug token (see step 3).
2. **Configure.** Copy `.env.example` to `.env.local` and fill in:
   ```
   VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}
   VITE_RECAPTCHA_ENTERPRISE_KEY=your-site-key
   VITE_APPCHECK_DEBUG_TOKEN=optional-fixed-debug-token
   ```
   The config may also be given as `FIREBASE_CONFIG` and `RECAPTCHA_ENTERPRISE_KEY` (useful on hosts that refuse `VITE_`-prefixed variables).
3. **Install and run.**
   ```
   npm install
   npm run dev
   ```
   In development, App Check uses a debug token: the first run prints one in the browser console; register it under *App Check › Apps › Manage debug tokens* (or set `VITE_APPCHECK_DEBUG_TOKEN`).
4. **Optional: Remote Config** keys (defaults are built in): `cloud_model`, `check_model`, `cloud_fallback_models`, `tts_model`, `tts_voice`, `new_cards_per_session`, `cloud_grading`, `device_max_chars`, `device_max_image_bytes`.

**Test, check and build:**
```
npm test           # unit tests (routing, marking, self-audit, scheduling, tutor, ...)
npm run typecheck
npm run build      # production build in dist/, with the offline service worker
```

**Deploy:** `vercel.json` is set up for Vercel (it also proxies Firebase's sign-in pages through the app's own domain, so sign-in works on phones); `firebase.json` works for Firebase Hosting.

**Try the hybrid behaviour:** open the **AI engine** page, then go offline (or download Gemini Nano) and watch the routes change; answer a card wrongly and open **Talk it through**; play the **Trap Gauntlet** from Today and watch the referee rule; set **Settings › AI and privacy** to Private and see Recall keep your answers and tutor conversations on the device.

## License

Apache License 2.0. See [LICENSE](LICENSE).
