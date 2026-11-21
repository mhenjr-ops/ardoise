# Ardoise LMS — sprint 2

A Canvas-style learning platform for Cameroonian universities: a **web app** (Next.js), a **phone app** (Expo, Android first) and one **Supabase** backend. French and English, LMD marks out of 20, phone-photo submissions, quizzes, and the full LMD chain from a teacher's mark to a signed transcript.

```
ardoise-lms/
├── supabase/
│   ├── migrations/
│   │   ├── 20261120000000_init.sql            # sprint 1: schools, courses, assignments, grades
│   │   └── 20261121000000_quizzes_lmd.sql     # sprint 2: quizzes + LMD layer
│   └── tests/                                 # 93 security/behaviour checks on a real Postgres engine
├── web/       # Next.js 16 web app (all roles)
└── mobile/    # Expo SDK 58 phone app (students + teachers)
```

## What's new in sprint 2

**Quizzes**
- Question banks per course: single choice, multiple choice, true/false, short answer, numeric (with tolerance), essay.
- Quizzes draw all questions or a random subset from a bank; shuffled questions and options; time limit; 1–10 attempts; answers shown after submitting, after the due date, or never.
- Students take quizzes on the web **and on the phone**: autosave every change, a local copy that survives a dropped connection, a countdown on the server's clock, automatic submission when time runs out.
- Auto-marking for everything but essays; teachers mark essays (or override any question) on the web. The best attempt goes to the gradebook, scaled to the assignment's points.
- Answer keys live in a separate table students can never read; all student writes go through database functions.

**LMD layer** (Admin → Structure / Enrollments / Deliberations / Grading rules)
- Faculties, departments, programmes (filières), academic years, semesters, teaching units (UE) with credits.
- Each course is attached to a UE with a coefficient, plus optional per-course CC / TP / exam weights.
- Students registered in a programme, year and level by pasting emails.
- Grading rules per school: pass mark, compensation between UEs, elimination mark, resit replaces the exam or keeps the better mark, default component weights, maximum jury bonus.
- **Deliberations**: compute → jury bonuses (logged with author and reason) → lock → publish. Locked results are frozen by the database; a published deliberation can't be reopened or deleted.
- **Official minutes (PV) PDF**: one row per student, one column per UE, averages, credits, decisions, jury adjustments, signature blocks.
- **Transcripts (relevés de notes) PDF** with a QR code. Anyone can scan it to open a public `/verify/<code>` page showing exactly what the transcript states.
- Students see their published results on the web and on the phone.

## How results are computed

- **Course mark** = mix of components (CC, TP, exam), each the weighted average of its assignments scaled to /20. A missing mark counts as 0 within a component; a student with no mark at all in a course is *absent*. A graded resit replaces the exam, or the better of the two is kept, per the school's rule.
- **UE mark** = average of its courses weighted by coefficient, plus any jury bonus (capped by the rule).
- **Semester average** = UE marks weighted by credits.
- **Compensation**: when the semester average reaches the pass mark, failed UEs at or above the elimination mark count as validated.
- **Decision**: *Admis*, *Admis par compensation*, *Ajourné (rattrapage)*, or *Incomplet* when a mark is missing.

The defaults (pass 10/20, compensation on, CC 30 / TP 20 / exam 50, jury bonus up to 1 point) are only defaults. **Set them to each school's written regulations before the first real deliberation.**

## 1. Supabase

1. Create a project at supabase.com.
2. **SQL Editor**: run `supabase/migrations/20261120000000_init.sql`, then `20261121000000_quizzes_lmd.sql`, in that order.
   (Or with the CLI: `supabase link` then `supabase db push`.)
   Already ran sprint 1? Run only the second file.
3. **Authentication → URL Configuration**: Site URL = your web address; add `<site>/auth/callback` to Redirect URLs.
4. Copy the project URL, publishable (or anon) key and service role key from **Settings → API**.

## 2. Web app

```bash
cd ardoise-lms/web
npm install
cp .env.example .env.local     # Supabase URL + keys; NEXT_PUBLIC_SITE_URL once deployed
npm run dev                    # http://localhost:3000
npm run seed                   # optional demo data (fresh project)
```

Demo logins (password `Ardoise2026!`): `admin@demo.ardoise.cm` (admin + registrar), `j.mbarga@demo.ardoise.cm` (teacher), `brenda@demo.ardoise.cm`, `cedric@demo.ardoise.cm`, `yannick@demo.ardoise.cm` (students).

**Try the full LMD flow with the demo:**
1. Admin → **Deliberations** → new: *Licence Informatique*, *S1 · 2026-2027*, level *L1*. Results compute at once: 3 *Admis*, 1 *Admis par compensation* (Cédric), 1 *Ajourné* (Yannick).
2. Add a jury bonus (e.g. +0.5 on MAT112 for Yannick, with a reason) and watch it recompute.
3. **Lock** → **Publish** → download the **PV** → **Issue transcripts**.
4. Sign in as Cédric → **Results** → download the transcript → scan its QR code with a phone.

**Try a quiz:** sign in as Brenda → INF101 → *Quiz 1 — Bases de Python*. Then as the teacher, open the attempt and mark the essay question.

## 3. Phone app

```bash
cd ardoise-lms/mobile
npm install
cp .env.example .env           # same Supabase URL + key; EXPO_PUBLIC_WEB_URL optional
npx expo start                 # scan with Expo Go
```

## Checks that were run

| Check | Result |
| --- | --- |
| `supabase/tests`: `npm install && npm test` (both migrations on PGlite, a real Postgres engine) | 93 checks pass: school isolation, answer keys hidden, quiz marking, best-attempt rule, time limit, locked/published deliberations, transcript verification |
| `web`: `npm test` (LMD engine) | 19 tests pass, including the demo semester's expected outcome |
| `web`: `npm run typecheck`, `npm run lint`, `npm run build` | clean (29 routes) |
| `mobile`: `npm run typecheck`, `npm run lint`, `npx expo export --platform android` | clean |
| PV and transcript PDFs | rendered and checked by eye; the marks were verified by hand |

Not yet done: a run against a live Supabase project and on a physical phone. Do that first with the seed data.

## Known limits (next sprint)

- **Second session (rattrapage) deliberation**: there is one deliberation per programme, semester and level, and a published one is final. A separate session-2 deliberation comes next.
- Multiple-choice questions are all-or-nothing (no partial credit).
- Editing a question's answer key does not re-mark past attempts.
- Programmes, years and semesters can't be deleted from the UI (they anchor official records); teaching units can be, while no course is attached.
- PDFs use the standard Latin-1 fonts: French accents work, other scripts are replaced.
- Still to come from the plan: inbox and notifications (push, SMS/WhatsApp), mobile-money billing, iOS build, offline course downloads.

## Earlier decisions

- Next.js 16 **Cache Components is off** (every page reads the session); turning it on means wrapping session reads in `<Suspense>`.
- System fonts only (fast on slow connections); phone photos compressed before upload; 10 MB file cap; dates in Cameroon time (WAT).
- **Data protection (Law No. 2024/017)**: get local counsel on hosting region and prior authorisation before the first pilot.
