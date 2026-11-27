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
and the Trap Gauntlet card, the "Marked privately on device" tile, the "Online · On-device AI"
status at the bottom left.

**Narration** (47 words):

Nobody likes getting things wrong, or wondering where their wrong answers end up. With Recall, you don't have to worry: your answers are saved only on your device. Recall turns your notes into questions, marks every answer, and brings each card back just before you'd forget it.

**Highlights:**

- "turns your notes into questions" → circle → the "11 cards ready for you" panel
- "brings each card back" → point at → "5 to review · 6 new"
- "saved only on your device" → circle → the "Marked privately on device" tile

## 2. Make questions

**On screen:** the Add screen: a title and notes are typed in, then Photo (a photo of a notes
page is dropped in), then PDF (a lecture PDF), then back to Notes. Then Make questions is pressed.

**Narration** (52 words):

First, add what you're studying: typed notes, a photo of a page, or a PDF. Notes and photos are handled by Gemini Nano, the AI built into Chrome, so they stay on your computer. A PDF goes to Gemini in the cloud. Firebase AI Logic sends each job to the right place.

**Highlights:**

- "typed notes, a photo of a page, or a PDF" → point at → the Notes / Photo / PDF switch
- "sends each job to the right place" → point at → the Make questions button

## 3. Fact-check

**On screen:** the progress steps (Writing questions, then Fact-checking every answer against your
material), then the review: the tally of cards, one card flagged ("59%" where the notes say "95%")
with a suggested correction, and Use the correction being pressed.

**Narration** (36 words):

Next, a second, larger model in the cloud checks every card against your notes, quoting its evidence. Here, a card says fifty-nine percent, but the notes say ninety-five. So Recall flags it, and suggests the fix.

**Highlights:**

- "a second, larger model in the cloud" → circle → the "Fact-checking every answer" step
- "a card says fifty-nine percent" → circle → the flagged card's "59%"
- "suggests the fix" → point at → the Use the correction button

## 4. Study

**On screen:** a card ("What is an antigen?"), with the line under the answer box: "Your answers
are saved and marked on this device…"; an answer typed and then finished by speaking into the
microphone ("Listening on this device"), then the confidence buttons (No idea, Unsure, Fairly
sure, Certain), Check my answer, then the mark with its "On this device" badge.

**Narration** (50 words):

Now it's time to study. You answer from memory, and your answers are saved only on your device. Type, or just speak: Chrome recognises your speech on your device too, so your voice never leaves it. Then you say how sure you are. Gemini Nano marks the answer right there.

**Highlights:**

- "saved only on your device" → circle → the line under the answer box
- "Type, or just speak" → point at → the microphone in the answer box
- "your voice never leaves it" → circle → "Listening on this device: your voice never leaves it."
- "say how sure you are" → circle → the confidence buttons
- "marks the answer right there" → circle → the mark and its "On this device" badge

## 5. Self-audit

**On screen:** the next card, answered vaguely; the mark is doubtful, so a note appears:
"Double-checked. A second AI checked this mark before showing it to you."

**Narration** (52 words):

But can a small model mark you fairly? Recall checks its own work. When Nano's mark looks doubtful, the bigger cloud model rechecks it before you see it, and spot-checks some confident marks too. The more often Nano is right, the more Recall trusts it, and the less data leaves your device.

**Highlights:**

- "the bigger cloud model rechecks it" → circle → the "Double-checked" note

## 6. Talk it through

**On screen:** Talk it through opens under the missed card; a suggested question is sent and the
tutor's reply streams in, badged "On this device". Then Ask a bigger model: a divider marks the
handoff and the next reply is badged "Cloud".

**Narration** (37 words):

Missed something? Talk it through with a tutor, running right on your device. Want a deeper answer? Ask a bigger model. The same conversation carries on in the cloud, and every reply shows where it came from.

**Highlights:**

- "Talk it through" → point at → the Talk it through button
- "running right on your device" → circle → the first reply, as it streams
- "Ask a bigger model" → point at → the Ask a bigger model button
- "every reply shows where it came from" → circle → the "Cloud" badge on the new reply

## 7. The Trap Gauntlet

**On screen:** the gauntlet screen; Start; "Writing your traps…"; true-or-false statements
answered against the clock, with an "On this device" badge; the referee chip ("Referee: 1
withdrawn as unfair") and the note that one statement was withdrawn.

**Narration** (48 words):

Each day, the Trap Gauntlet turns your past mistakes into a game. Nano writes true statements and traps on your device. As you race the clock, a cloud model referees each one and throws out any that are unfair. Being honest about how sure you are earns points.

**Highlights:**

- "Nano writes true statements and traps" → circle → the "On this device" badge
- "throws out any that are unfair" → circle → "Referee: 1 withdrawn as unfair"
- "earns points" → point at → "I'm sure (+3 if right, −2 if wrong)"

## 8. Read aloud

**On screen:** a question card; the speaker icon is pressed; it shows loading, then speaking.

**Narration** (21 words):

Recall can also read questions out loud, using Gemini's text-to-speech through Firebase AI Logic. That's the voice you're hearing right now.

**Highlights:**

- "read questions out loud" → circle → the speaker icon (loading, then speaking)

## 9. The AI engine page

**On screen:** the AI engine page: the cards for the built-in AI and the cloud AI; the "Right
now" list, which changes when the connection goes offline; the Privacy card with the privacy mode.

**Narration** (55 words):

The AI engine page shows where each job runs right now. Go offline, and marking, the tutor and the Gauntlet keep working on your device, while PDFs wait until you're back online. Private mode keeps every answer on the device. Behind the scenes, Remote Config picks the models, and App Check protects every cloud call.

**Highlights:**

- "shows where each job runs right now" → point at → the "Right now" list
- "Go offline" → circle → the list switching to "On this device" / "Waits for a connection"
- "Private mode" → circle → the Privacy card

## 10. Close

**On screen:** the Insights page: the "Claimed vs actual" chart (each confidence level's claim
as a dashed line, how often you were right as a bar), then the "Certain, but wrong" list. The
video ends on this page with the web address.

**Narration** (34 words):

Insights shows where your confidence and your results don't match, so you can focus on what you only thought you knew. Quick, private work on your device. Heavy work in the cloud. That's Recall.

**Highlights:**

- "where your confidence and your results don't match" → circle → the "Certain" bar and its dashed line
- "what you only thought you knew" → circle → the "Certain, but wrong" list
