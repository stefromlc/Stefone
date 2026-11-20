# 🦉 Stefone Kids — home-school learning platform

A complete learning platform for home-schooled children, running at **stefone.com/kids** on GitHub Pages. It uses AI through your own **OpenRouter** API key.

- **Kids (age 8)** log in by tapping their picture and typing a PIN. They get a colourful **virtual desktop** with windows, a taskbar, a start menu and apps.
- **Mum & Dad** get a **parent dashboard** where they can create AI lessons, plan the week, track progress, spot learning gaps and review work.
- **Dad** (the administrator) is the only one who can open **Settings**: the API key, AI models, family accounts, safety rules and school hours.

---

## What's inside

### Kids' desktop ("KidOS")
A colourful desktop. It has:
- a **top bar**: clock, stars and streak, messages, sound on/off, and the child's menu (wallpapers, text size and an easy-read font)
- a **dock** with favourite apps, plus a searchable **app launcher** (press 🦉 Apps, or Ctrl+Space)
- **widgets**: today's lessons with a progress ring, a daily mood check-in, notes from Mum & Dad, a word of the day, and an "Ask Ollie" box

**Widgets are customisable.** Children can switch any widget on or off, reorder them (✏️ Edit), or tuck the whole panel away (Hide ▶). Widgets available: Today's lessons, How I feel, Notes from Mum & Dad, My stars, Coming up, Word of the day, Fun fact, Latest picture, My sticky note, Ask Ollie. **Right-click any app** to pin it to the dock or hide it from the desktop. You can lock widgets and switch whole apps off per child in Settings.

Windows can be dragged, resized, minimised and snapped to half the screen or full screen. **Every app that makes something asks "Do you want to save before closing?"** The same check runs when the child logs out or their screen time ends. Ctrl+S saves too.

Wallpapers: illustrated space, hills, ocean, rainbow and candy scenes, gradients, or **the child's own AI picture or painting**.

| | App | What it does |
|---|---|---|
| 🎓 | **My Lessons** | Interactive lessons: pictures, flip-cards, "Did you know?" facts, read-aloud in a natural AI voice, hints, a progress-dot trail, stars and feedback from you. |
| 🦉 | **Ollie** | AI tutor that **guides rather than answers**. Ollie can now **look things up**:
  - a kids' encyclopedia
  - live web search via OpenRouter
  - a calculator
  - **real photos**

  So "How many Big Bens fit in the Shard?" gets the real heights, a worked answer, and a nudge to check the sum. "Show me a picture of Big Ben" shows tappable photos. Sources are always shown. Kids can **show Ollie a photo of their work** (vision AI), talk instead of typing, and switch on "Ollie talks". Chats are visible to you; distress is flagged. |
| 🎯 | **Practice** | Maths drills and spelling tests (your lists, the Year 3/4 list, "my tricky words"). |
| 📖 | **Reading Buddy** | AI writes a passage pitched to the child's level and interests. They can 👂 listen first, then 🎤 read it aloud: speech recognition scores accuracy and words per minute and highlights tricky words. Comprehension questions follow. |
| 🪄 | **Word Wizard** | Kids' dictionary: meaning, syllable clapping, pronunciation, WOW-word synonyms, opposites, rhymes and an AI picture. Builds a "my words" collection. |
| 🧭 | **Explorer** | A safe browser: Simple English Wikipedia plus websites you approve. |
| ✨ | **Writer** | Word-style ribbon (Home / Insert / Helpers). Includes templates (story, letter, diary, poem, fact file, instructions, book review), fonts including handwriting and easy-read, tables, emoji, photos and **AI pictures**, 🎤 talk-to-type, 🔊 read-aloud, 🦉 "two stars and a wish", and 🪄 a word helper. File menu: New, Open, Save, Save a copy, Send, Print. |
| 📊 | **Sheets** | A spreadsheet with formulas (SUM, AVERAGE, MEDIAN, MODE, RANGE, MIN, MAX, COUNT, ROUND, …), sorting, and **bar, line and pie charts**. |
| 🖌️ | **Paint** | Brush, pencil, rubber, fill, line, rectangle, circle, text and stickers, plus undo/redo. Add photos, make **AI colouring pages**, set a painting as the wallpaper. |
| 🎨 | **Picture Maker** | Describe it and AI paints it, in 7 styles and 3 shapes, with a daily limit set by you. **🔍 Photo Detective** lets kids photograph a leaf, bug or rock and Ollie helps them investigate it. |
| 📚 | **Story Studio** | Make an illustrated picture book page by page. AI paints each page from the child's words (or they draw it). Ollie asks "what if…?" questions but never writes it for them. 📖 "Read my book" narrates it in the AI voice. |
| 🎹 | **Music Maker** | Playable piano (mouse, touch or keyboard) with 4 instruments and tune playback, plus a 16-step beat maker. |
| 🐢 | **Code Turtle** | Logo-style coding (forward, turn, repeat, colours) with code blocks, an animated turtle, friendly error messages and 8 challenges. |
| 🧩 | **Brain Games** | Memory Match, Word Scramble (from their spellings) and Make the Number (mental maths). Results count towards progress. |
| 📔 | **My Journal** | Daily mood, gratitude, "today I learned" and a writing prompt, with dictation. Kids are told Mum & Dad can read it. |
| ⭐ | **My Stars** | Stars, streak, calendar and 19 badges. |
| 📁 | **My Files** | All their work, plus a gallery of their AI pictures. |
| 🧮 | **Calculator** / ⏱️ **Timer** | Big-button calculator with read-aloud; visual timer with focus/break modes and brain-break ideas. |

### Interactive lessons — 12 activity types
Every lesson question gets **two goes**: a wrong first try shows a hint and lets the child have another go (worth half marks). Lessons also have 🔥 streaks for answers in a row, Enter-to-check, 🔊 Auto read-aloud, and a "See all my answers" review at the end. **Every AI-generated question is double-checked by a second AI pass**: ambiguous wording, wrong answer keys and questions like "the value of the 7 in 7,758" (two 7s!) are fixed before the lesson is saved, and the editor shows what was fixed. Practice drills also give a second try. Place-value questions always use numbers with no repeated digits and highlight the digit, and answers like "7,000", "7 thousand" or "seven thousand" are all accepted.

Multiple choice · choose-all-that-apply · number answer · short answer · writing · **put in order** · **match pairs** · **sort into groups** · **fill the gaps** (with a word bank) · **number line** (drag a marker) · **draw it** (marked by vision AI) · **read aloud** (checked with speech recognition).

Lessons can also have a **cover picture** and **AI illustrations**, **flashcard** sections and **"Did you know?"** facts. The AI mixes these automatically when you tick "Interactive activities", and you can edit every one of them in the lesson editor (✨ make a picture, or ⬆️ upload your own).

### Parent dashboard (Mum & Dad)
- **Create lessons with AI for several children at once.**
  - Pick any children and choose either *one shared lesson* or *a personalised version for each child* (their year group, interests, gender, learning notes and gaps).
  - Type **several topics, one per line**, and it generates them all.
  - It **publishes them automatically**: all on one day, or one topic per school day.
- **Lesson editor AI tools**:
  - **✨ Make a version…**: easier, harder, personalised to a child's interests, or shorter.
  - **✨ Swap a question** for a fresh one.
  - **✨ Add 2 with AI** of any activity type.

  All of these are double-checked by the AI question checker.
- **Lesson library** with filters and **bulk publish**: tick lessons and publish them to any children, on the same day or spread over school days.
- **Planner**: a week view, plus "✨ Plan the week with AI" (now interactive and illustrated).
- **Progress & gaps**, **Review work** (including the kids' drawings), **Helper chats**, **Spelling lists**, **Notes**, **Reports**.
- **🎨 Creations & moods** (new):
  - every AI picture with exactly what the child typed
  - story books you can read
  - Reading Buddy results (accuracy, words per minute, tricky words)
  - journal entries, words looked up
  - a **2-week mood chart** with a nudge if a child has had several not-so-happy days

### Settings (Dad only)
- **AI & models**: OpenRouter key, plus a model for each job:
  - lessons, gap analysis, kids' helper, marking
  - **vision** (looking at pictures)
  - **picture generation**
  - **voice (text-to-speech)**, with a voice picker and 🔊 Test voice
  - **listening (speech-to-text)**

  You can also switch AI illustrations on or off (and set pictures per lesson), switch kids' AI pictures on or off (and set the **daily limit per child**), and turn sound effects on or off.
- **Family**: name, **gender** (used for he/she in lessons, stories and Ollie), age, year group, interests, learning notes, avatar, colour, PINs and passwords.
- **Helper & safety**:
  - **🔎 Ollie can look things up**: turn the research tools, live web search and real photos on or off, and list websites Ollie must never use.
  - **🧩 Apps the kids can use**: an on/off switch per app, per child.
  - **Widget lock**.
- **School hours & screen-time limit**, **Data & backup**.

---

## 1. Put it on stefone.com/kids

Use **one** of these options.

**Option A — a separate repo (simplest)**
This works if stefone.com is served by your `YOURNAME.github.io` repository with the custom domain set there.
1. Create a new repository on GitHub called **`kids`**.
2. Upload everything in this folder (keep the folder structure, including the empty `.nojekyll` file).
3. Go to the repo's **Settings → Pages**. Under *Source*, choose **Deploy from a branch**, pick `main` and `/ (root)`, then click Save.
4. After a minute or two it's live at **https://stefone.com/kids/**. GitHub serves project repos under your user site's custom domain automatically.

**Option B — a folder in your existing site repo**
1. In the repository that publishes stefone.com, create a folder called **`kids`**.
2. Put all these files inside it and commit. It's live at **https://stefone.com/kids/**.

> Tip: the page includes `noindex` so search engines won't list it.

## 2. First-time setup (about 3 minutes)

Open stefone.com/kids. The setup wizard asks for:
1. **Dad's account**. This becomes the administrator.
2. **Mum and the children**: names, pictures, PINs (4–8 digits), year group, interests.
3. **Your OpenRouter key**. Create one at <https://openrouter.ai/keys> and **set a monthly credit limit** on it. Lessons typically cost a few pence each.

That's it. You land on the parent dashboard. Try **✨ Create a lesson**, then log out and log in as a child.

## 3. Cloud sync (recommended, free, about 10 minutes)

Out of the box, everything is saved **in the browser on that one computer**. That's fine for a single family PC. If you want Mum and Dad to check progress from their own phones, or the kids to use any device, connect free **Supabase** cloud sync:

1. Create a free account and project at <https://supabase.com> (pick the London region).
2. Go to **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Go to **Authentication → Sign In / Providers → Email**:
   - make sure Email sign-in is **enabled**;
   - turn **OFF "Confirm email"** (the kids' logins use made-up addresses, and no emails are ever sent).
4. Go to **Project Settings → API** (or *Data API*). Copy the **Project URL** and the **anon / publishable key**.
5. Edit `js/config.js` in your GitHub repo and paste them in:
   ```js
   supabaseUrl: 'https://xxxxxxxx.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi…',
   ```
   Commit. (The anon key is designed to be public. The database security rules protect the data.)
6. Open stefone.com/kids. The setup wizard runs again, this time in the cloud. Each person gets a login email (the kids' can be made up, e.g. `amy.kids@stefone.com`).
7. On each new device, sign in once with email and password or PIN. After that, everyone's picture appears on the login screen.

**Moving from "this device" to cloud:** first go to **Settings → Data → Export backup**. Then switch to cloud and run setup with the same names, and **Import backup**. Children are matched by name.

## 4. How the security works

| | This-device mode | Cloud mode |
|---|---|---|
| Logins | PINs and passwords hashed in the browser | Real Supabase accounts |
| Kids can't open Settings or parent pages | ✅ enforced by the app | ✅ enforced **by the database** (row-level security) |
| Kids only see their own work | ✅ app | ✅ database |
| Mum can't change settings | ✅ app | ✅ database |
| API key | stored in this browser | stored in your database, readable by signed-in family members (the kids' helper needs it) |

- **Always set a credit limit on the OpenRouter key.** It's the simplest protection against misuse.
- In this-device mode, protection is enforced by the app. A determined adult with browser developer tools could get around it on that computer; an 8-year-old won't. Use cloud mode for proper enforcement.
- Logins on a shared computer expire after 12 hours (this-device mode). Use **Log out** in the start menu.
- **Privacy:** for AI features, the child's first name, age, year group, interests and the relevant work are sent to OpenRouter and the model provider you choose. Nothing else leaves your browser or Supabase. You can change the child's display name to a nickname if you prefer.

## 5. Choosing AI models

> **Upgrading an existing cloud setup?** Run `supabase/schema.sql` again (it's safe to re-run). It lets the kids save their new kinds of work: pictures, journal, reading and words.

Recommended defaults (you can change them in **Settings → AI**):
- Lessons & planning, gap analysis: `anthropic/claude-sonnet-5.5`
- Kids' helper, marking and vision: `anthropic/claude-haiku-5.5` (fast and cheap, understands images)
- Pictures: `google/gemini-2.5-flash-image` (or any model in the image list, e.g. `openai/gpt-image-1`)
- Voice: `mistralai/voxtral-mini-tts-2603` with voice `en_paul_neutral` (pick any speech model and voice in Settings; voices are listed for you)
- Listening: `openai/whisper-large-v3`

**Costs:** text is pennies per lesson. Pictures typically cost a few pence each, so the per-child daily limit and the "pictures per lesson" setting keep this in check. AI voice clips are cached, so re-reading the same text is free. Leave the picture, voice or listening model empty to switch that feature off: read-aloud and talk-to-type then fall back to the browser's built-in voice and speech recognition.

Any model on OpenRouter works. The settings page loads the full list with prices. The helper model must follow instructions well so it doesn't give answers away. Test it yourself with "just tell me the answer to 7 × 8!".

## 6. Everyday tips

- **Monday morning:** go to Planner → ✨ Plan this week with AI → tick "prioritise gaps" → draft → tweak → create.
- **After school:** check the Overview alerts, then Review work. Leave a comment, because the kids love seeing it.
- **Weekly:** Progress → ✨ Analyse now → create bridging lessons for anything flagged high.
- Every lesson includes an **away-from-the-screen challenge** and **notes for parents** (misconceptions to watch for).

## Files

```
index.html            app entry
css/app.css           base + parent dashboard styles
css/desktop.css       kids' desktop (top bar, dock, windows, widgets)
css/apps.css          kids' apps and interactive lesson activities
js/config.js          ← your Supabase details go here (optional)
js/main.js            boot + routing
js/store.js           data layer (IndexedDB or Supabase) + auth + default settings
js/ai.js              OpenRouter text AI and all prompts
js/media.js           OpenRouter pictures, vision, voice (TTS) and listening (STT), plus sound effects
js/skills.js          curriculum subjects, skills and the mastery model
js/desktop.js         kids' desktop, launcher and window manager (save-before-close)
js/apps/*             the kids' apps (activities.js + player.js = interactive lessons)
js/parent/*           parent dashboard pages
supabase/schema.sql   database tables + security rules
vendor/               marked, DOMPurify, supabase-js (bundled, no CDN needed)
```

No build step and no server: it's plain HTML, CSS and JavaScript.
