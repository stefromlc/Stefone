# 🦉 Stefone Kids — home-school learning platform

A complete learning platform for home-schooled children, running at **stefone.com/kids** on GitHub Pages. It uses AI through your own **OpenRouter** API key.

- **Kids (age 8)** log in by tapping their picture and typing a PIN. They get a colourful **virtual desktop** with windows, a taskbar, a start menu and apps.
- **Mum & Dad** get a **parent dashboard** where they can create AI lessons, plan the week, track progress, spot learning gaps and review work.
- **Dad** (the administrator) is the only one who can open **Settings**: the API key, AI models, family accounts, safety rules and school hours.

---

## What's inside

### Kids' desktop apps
| App | What it does |
|---|---|
| 📒 **My Lessons** | Today's lessons, coming up, finished lessons. An interactive lesson player with sections, 🔊 read-aloud, hints, instant feedback, stars and confetti, plus feedback from Mum & Dad. |
| 📝 **Writer** | A word processor: fonts, sizes, colours, headings, lists, alignment, emoji, British spell-check, read-aloud, "🦉 Check my writing" (two stars and a wish, without rewriting it for them), send to parents, print. |
| 📊 **Sheets** | A spreadsheet with formulas (`=A1+B2`, `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `ROUND`), quick Σ and average, bold and fill colours, and **bar charts**. |
| 🧭 **Explorer** | A safe browser: a Simple English Wikipedia search and reader, plus websites you approve. Blocked words, read-aloud, and "ask the helper about this page". |
| 🦉 **Helper** (Ollie the Owl) | An AI tutor that **guides rather than answers**, using Socratic questions, hints and similar examples. It has voice input, read-aloud and a daily question limit, and blocks personal information. Signs of distress are **flagged to parents**. Every chat is visible to you. |
| 🎯 **Practice** | Maths drills (times tables, division, missing numbers, adding, taking away, bonds to 100, doubles and halves, place value) and spelling tests (your lists, the built-in Year 3/4 statutory list, and "my tricky words"). |
| 🖌️ **Paint** | Brush, rubber, fill bucket, stamps, line tool, undo, save, and send to parents. |
| 📁 **My Files** | All their writing, spreadsheets and pictures. |
| ⭐ **My Stars** | Stars, day streak, a 4-week calendar and 13 badges. |

They can also pick their own wallpaper, and they get sticky notes from Mum & Dad on the desktop.

### Parent dashboard (Mum & Dad)
- **Overview**: each child's lessons today, scores, time, streak and top gaps. Alerts for flagged chats and work to review. Live activity feed.
- **Lessons**:
  - ✨ **Create with AI**: personalised to the child's year group, interests and notes. You choose the subject, topic, length, difficulty and number of questions, and can assign it straight away.
  - A **full editor** for sections (markdown, plus "✨ improve with AI") and questions (multiple choice, number, short answer, writing). Every question is tagged with a curriculum skill.
  - Preview as a child, assign, duplicate, delete.
- **Planner**: a week view per child. Add, move or remove lessons. ✨ **Plan the week with AI**: it drafts a balanced plan (putting gaps first), you edit it, then it generates and schedules every lesson.
- **Progress & gaps**: mastery per subject and per skill (recency-weighted), score trends and screen time. Automatic **gap detection** (skills under 65% with 3+ answers), a list of mistakes per skill, and tricky spellings.
  - ✨ **AI gap analysis** finds misconceptions in wrong answers and suggests a plan.
  - One click creates a **bridging lesson** that re-teaches the misconception in a different way.
- **Review work**: answers the AI couldn't mark, writing tasks and documents the kids sent. Adjust scores, add notes and an overall comment; the kids see your feedback.
- **Helper chats**: every conversation, with flagged ones first.
- **Spelling lists**: write your own or ✨ generate them, and assign them per child.
- **Notes to kids**: these appear as sticky notes on their desktop.
- **Reports**: a printable progress report for any date range. Handy for home-education records and council visits.

### Settings (Dad only)
- **AI**: OpenRouter key with a test button, and a model choice for each job (lessons, gap analysis, kids' helper, marking) from the live OpenRouter list, with prices. You can also set the curriculum.
- **Family**: add or edit children (year group, age, interests, learning notes, avatar, colour), add parents, and change PINs or passwords.
- **Helper & safety**: the helper's name, strict or balanced mode, daily question limit, voice input, blocked words, and approved websites.
- **School hours**: allowed hours and days, and a daily screen-time limit.
- **Data**: export and import backups, and erase.

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

Recommended defaults (you can change them in **Settings → AI**):
- Lessons & planning, gap analysis: `anthropic/claude-sonnet-5.5`
- Kids' helper and marking: `anthropic/claude-haiku-5.5` (fast and cheap)

Any model on OpenRouter works. The settings page loads the full list with prices. The helper model must follow instructions well so it doesn't give answers away. Test it yourself with "just tell me the answer to 7 × 8!".

## 6. Everyday tips

- **Monday morning:** go to Planner → ✨ Plan this week with AI → tick "prioritise gaps" → draft → tweak → create.
- **After school:** check the Overview alerts, then Review work. Leave a comment, because the kids love seeing it.
- **Weekly:** Progress → ✨ Analyse now → create bridging lessons for anything flagged high.
- Every lesson includes an **away-from-the-screen challenge** and **notes for parents** (misconceptions to watch for).

## Files

```
index.html          app entry
css/app.css         all styles
js/config.js        ← your Supabase details go here (optional)
js/main.js          boot + routing
js/store.js         data layer (IndexedDB or Supabase) + auth
js/ai.js            OpenRouter calls and all AI prompts
js/skills.js        curriculum subjects, skills and the mastery model
js/desktop.js       kids' desktop and window manager
js/apps/*           kids' apps
js/parent/*         parent dashboard pages
supabase/schema.sql database tables + security rules
vendor/             marked, DOMPurify, supabase-js (bundled, no CDN needed)
```

No build step and no server: it's plain HTML, CSS and JavaScript.
