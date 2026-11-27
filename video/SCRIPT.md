# Recall demo: the script

Edit anything in this file, then tell me. I rebuild the video from it: the voice, the subtitles,
the footage under each part, and the highlights.

**How to edit**

- **Narration** is what the voice says. Rewrite it freely. Keep the total to about **430 words**
  (the voice speaks about 2.6 words a second, and the video must stay under 3:00). Each part
  shows its current word count.
- **Highlights** say what to point at while a phrase is spoken. Each line is:
  `- "phrase from the narration" → point at | circle → the thing on screen`
  - *point at*: the cursor glides to it and rests there.
  - *circle*: a ring is drawn around it, for things that matter most.
  The phrase must appear word for word in that part's narration. Add, remove or move lines.
- **On screen** is the footage available for each part. If you want something else shown
  (another screen, another action), write it there and I will record it.
- You can add, remove, merge or reorder parts. Keep the `## ` heading line for each part.

---

## 1. Hook

**On screen:** the Today screen: "11 cards ready for you", the Start session button, the level
and the Trap Gauntlet card, the "Online · On-device AI" status at the bottom left.

**Narration** (53 words):

You've read your notes three times. Could you answer a question on them without looking? Recall makes cards from your material and asks you, one at a time. It marks what you say, shows where you stand, and brings each card back right before it slips. On-device and cloud AI share the work.

**Highlights:**

- "makes cards from your material" → circle → the "11 cards ready for you" panel
- "brings each card back" → point at → "5 to review · 6 new"
- "On-device and cloud AI" → circle → the "Online · On-device AI" status

## 2. Make questions

**On screen:** the Add screen: a title and notes are typed in, then Photo (a photo of a notes
page is dropped in), then PDF (a lecture PDF), then back to Notes. Under the material, a box says
where the work will run ("Runs on this device" or "Runs in the cloud") and why. Then Make
questions is pressed.

**Narration** (62 words):

It starts with your material: notes, a photo of a page, or a PDF. Firebase AI Logic routes each job. Notes and photos go to Gemini Nano, built into Chrome, with prefer on device. A PDF goes to the cloud. Either way, the cards come back in one structured format: a response constraint on the device, a response schema in the cloud.

**Highlights:**

- "notes, a photo of a page, or a PDF" → point at → the Notes / Photo / PDF switch
- "Notes and photos go to Gemini Nano" → circle → the "Runs on this device" box
- "A PDF goes to the cloud" → circle → the "Runs in the cloud" box
- "one structured format" → point at → the Make questions button

## 3. Fact-check

**On screen:** the progress steps (Writing questions on this device, then Fact-checking every
answer with a second model), then the review: the tally of cards, one card flagged ("59%" where
the notes say "95%") with a suggested correction, and Use the correction being pressed.

**Narration** (39 words):

Then a second, larger cloud model fact-checks every card against your notes. It has to quote its evidence, and plain code checks every number. This card says fifty-nine percent. The notes say ninety-five. So it's flagged, with a fix.

**Highlights:**

- "a second, larger cloud model" → circle → the "Fact-checking every answer" step
- "This card says fifty-nine percent" → circle → the flagged card's "59%"
- "with a fix" → point at → the Use the correction button

## 4. Study

**On screen:** a card ("What is an antigen?"), an answer typed and then finished by speaking into
the microphone in the answer box ("Listening on this device"), then the confidence buttons (No
idea, Unsure, Fairly sure, Certain), Check my answer, then the mark with its "On this device" badge.

**Narration** (48 words):

Now, study the cards. Answer from memory, typed or spoken: Chrome's on-device speech recognition writes your words into the box, so your voice stays on the device. Then say how sure you are. Gemini Nano marks the answer right here, with prefer on device: instant, free and private.

**Highlights:**

- "typed or spoken" → point at → the microphone in the answer box
- "your voice stays on the device" → circle → "Listening on this device: your voice never leaves it."
- "say how sure you are" → circle → the confidence buttons
- "marks the answer right here" → circle → the mark and its "On this device" badge

## 5. Self-audit

**On screen:** the next card, answered vaguely; the mark is doubtful, so a note appears: it was
checked by the larger cloud model before being shown.

**Narration** (52 words):

But can a small model be trusted? Recall checks itself. Every mark is weighed for doubt. Doubtful marks go to the larger cloud model before you see them, and a sample of confident ones is spot-checked. Agreement becomes Nano's trust score, so the more it earns, the less ever leaves your device.

**Highlights:**

- "Doubtful marks go to the larger cloud model" → circle → the "checked by the cloud" note
- "Nano's trust score" → point at → the mark's badge

## 6. Talk it through

**On screen:** Talk it through opens under the missed card; a suggested question is sent and the
tutor's reply streams in, badged "On this device". Then Ask a bigger model: a divider marks the
handoff and the next reply is badged "Cloud".

**Narration** (41 words):

Missed a point? Talk it through. The tutor is a Firebase AI Logic chat session, streaming on Nano. Ask a bigger model, and the same conversation hands off to Gemini in the cloud, with every reply badged by where it ran.

**Highlights:**

- "Talk it through" → point at → the Talk it through button
- "streaming on Nano" → circle → the first reply, as it streams
- "Ask a bigger model" → point at → the Ask a bigger model button
- "badged by where it ran" → circle → the "Cloud" badge on the new reply

## 7. The Trap Gauntlet

**On screen:** the gauntlet screen; Start; "Writing your gauntlet on this device"; true-or-false
statements answered against the clock; the referee chip ("Referee: 1 withdrawn as unfair") and
the note that one statement was withdrawn.

**Narration** (44 words):

Each day, the Trap Gauntlet turns your mistakes into a game. Nano writes true statements and traps, on the device. While you race the clock, a cloud model referees every statement in parallel, and withdraws any unfair one, live. Honest confidence earns you XP.

**Highlights:**

- "Nano writes true statements and traps" → circle → "On this device · Written on this device from your mistakes"
- "withdraws any unfair one, live" → circle → "Referee: 1 withdrawn as unfair"
- "Honest confidence earns you XP" → point at → "I'm sure (+3 if right, −2 if wrong)"

## 8. Read aloud

**On screen:** a question card; the speaker icon is pressed; it shows loading, then speaking.

**Narration** (26 words):

Questions can be read aloud by Gemini's text-to-speech, through Firebase AI Logic, streamed so it starts in about a second. That's the voice you're hearing now.

**Highlights:**

- "read aloud" → circle → the speaker icon (loading, then speaking)

## 9. The AI engine page

**On screen:** the AI engine page: the cards for Gemini Nano and the cloud ("Protected by Firebase
App Check"); the routing table, which changes when the connection goes offline; the trust score
and privacy setting; the Remote Config card.

**Narration** (44 words):

The AI engine page shows the router, live. Go offline, and marking, tutoring and the gauntlet stay on the device, while PDFs wait in a queue. Private mode forces only on device. Models come from Remote Config, and App Check protects every cloud call.

**Highlights:**

- "shows the router, live" → point at → the routing table
- "Go offline" → circle → the routes switching to Device / Queued
- "Private mode" → circle → the privacy setting
- "Remote Config" → circle → the configuration card
- "App Check" → circle → "Protected by Firebase App Check"

## 10. Close

**On screen:** the Insights page: the "Claimed vs actual" chart (each confidence level's claim
as a dashed line, how often you were right as a bar), then the "Certain, but wrong" list. The
video ends on this page with the web address.

**Narration** (32 words):

Insights shows where your confidence and your results disagree, so you study what you only thought you knew. Small, private work on the device. Rare, heavy work in the cloud. That's Recall.

**Highlights:**

- "where your confidence and your results disagree" → circle → the "Certain" bar and its dashed line
- "what you only thought you knew" → circle → the "Certain, but wrong" list
