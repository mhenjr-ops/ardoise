# Ardoise

A learning platform for Cameroonian universities, in the spirit of Canvas and Blackboard: a **web app** (Next.js), a **phone app** (Expo, Android first) and one **Supabase** backend. French and English, LMD marks out of 20, phone-photo submissions, and the full LMD chain from a teacher's mark to a signed transcript.

**Live demo:** https://ardoise-pi.vercel.app (one-tap demo accounts on the sign-in page) · phone app in the browser: https://ardoise-pi.vercel.app/app

```
ardoise-lms/
├── supabase/
│   ├── migrations/   # run in filename order
│   ├── seed/         # demo.sql, then demo-engage.sql, then demo-roles.sql
│   └── tests/        # 270 security and behaviour checks on a real Postgres engine (PGlite)
├── web/              # Next.js 16 web app (all roles); serves the phone preview at /app
└── mobile/           # Expo SDK 58 phone app (students and teachers)
```

## What's in it

**Teaching**
- Course home with what's next, syllabus, modules, pages, files, announcements.
- Assignments (text, file or phone photo), quizzes from question banks (six question types, time limits, attempts, autosave that survives a dropped connection), rubrics.
- **SpeedGrader** on the web and grading on the phone: one student after another, typed mark or rubric, comments.
- Gradebook with a student **what-if** calculator; course dashboard (submission rates, averages, students at risk).

**School life**
- Calendar and weekly timetable (classes, exams, office hours, holidays) in Cameroon time.
- Inbox between students, teachers and the registrar's office; course discussions with pinned and closed topics.
- Notifications for announcements, new work, marks, hand-ins, messages, replies and results.
- **Attendance by code**: the teacher shows a 6-digit code, students check in from their phones; late and excused statuses; attendance matrix per course.

**LMD and the registrar's office** (Admin)
- Faculties, departments, programmes, years, semesters, teaching units (UE) with credits; courses attached to UEs with coefficients.
- Grading rules per school; **deliberations** (compute → jury bonuses → lock → publish), official minutes (PV) PDF, **transcripts** with a QR code anyone can check at `/verify/<code>`.
- Institution overview for admins.

**Phone app**: home with stats and check-in, calendar, inbox, results, notifications, course modules, assignments with photo submission, quizzes, discussions, attendance (teachers run roll call), grading.

## Roles and joining

- **Schools are created by the Ardoise team only**, from the Ardoise console (`/platform`), usually after a request from `/request-demo`. Creating a school gives a one-time link for its owner. The sign-in page is the same for everyone (like Blackboard or Canvas, no school or role to choose); the one-tap demo accounts live on `/demo`.
- **Seven roles**, each with its own home page:

| Role | Can do |
| --- | --- |
| Owner | Everything in the school, including naming administrators and reopening a locked deliberation |
| Administrator | School structure, courses, staff; reads every course |
| Registrar | Student list, enrolments, grading rules, deliberations, transcripts; reads every course |
| Dean | Reads the courses and results of their faculty; names heads of department and teachers there |
| Head of department | Reads their department's courses (marks read-only), creates courses, assigns teachers |
| Teacher | Their own courses (any number of them; a course can have several teachers) |
| Student | Their own courses and results |

- **Staff join with an invitation link** (Admin → Staff): one use, 30 days, optionally tied to an email; copy it or send it on WhatsApp. Someone who creates their account from the link is in the school as soon as they confirm their email.
- **Students join on their own**, from their university's link (e.g. `/join/uba`, shared by the registrar from Admin → Students) or by picking their university from the list: matricule, name, email, password. After confirming their email they land in their courses, and from then on sign in with the matricule (or the email) on the one sign-in page; Ardoise knows their school and role. The registrar imports the student list (Admin → Students, Excel or CSV straight from the registration portal, French or English column names). If a student signs up before the list is imported, their account links itself at the next import. If a matricule is already taken, the student reports it and the registrar decides after checking ID.

## How results are computed

- **Course mark** = mix of components (CC, TP, exam), each the weighted average of its assignments scaled to /20. A missing mark counts as 0 within a component; a student with no mark at all in a course is *absent*. Work with weight 0 (practice) doesn't count. A graded resit replaces the exam, or the better of the two is kept, per the school's rule.
- **UE mark** = average of its courses weighted by coefficient, plus any jury bonus (capped by the rule).
- **Semester average** = UE marks weighted by credits.
- **Compensation**: when the semester average reaches the pass mark, failed UEs at or above the elimination mark count as validated.
- **Decision**: *Admis*, *Admis par compensation*, *Ajourné (rattrapage)*, or *Incomplet* when a mark is missing.

The defaults (pass 10/20, compensation on, CC 30 / TP 20 / exam 50, jury bonus up to 1 point) are only defaults. **Set them to each school's written regulations before the first real deliberation.**

## 1. Supabase

1. Create a project at supabase.com.
2. **SQL Editor**: run every file in `supabase/migrations/` in filename order (or `supabase link` then `supabase db push`).
3. Optional demo data: run `supabase/seed/demo.sql`, then `supabase/seed/demo-engage.sql`, then `supabase/seed/demo-roles.sql`.
4. Give the Ardoise team access to the console: sign up once on the web app, then in the SQL Editor run `insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';`
5. **Authentication → URL Configuration**: Site URL = your web address (e.g. `https://ardoise-pi.vercel.app`); add `<site>/auth/callback` to Redirect URLs. Without this, sign-up and password emails point to localhost.
6. **Authentication → Emails**: sign-up sends a confirmation email. The built-in sender is rate-limited; set up your own SMTP sender (Resend, Brevo…) before real students sign up.
7. Copy the project URL and publishable (or anon) key from **Settings → API**.

## 2. Web app

```bash
cd ardoise-lms/web
npm install
cp .env.example .env.local     # Supabase URL + key; NEXT_PUBLIC_SITE_URL once deployed; DEMO_LOGINS=on for demos
npm run dev                    # http://localhost:3000
```

Deploy on Vercel with **Root Directory** `web` and the same environment variables. `DEMO_LOGINS=on` shows one-tap demo accounts; leave it off for real schools.

Demo school link `/join/isdy`; demo accounts on `/demo`. Demo accounts (password `Ardoise2026!`): `admin@demo.ardoise.cm` (owner), `scolarite@demo.ardoise.cm` (registrar), `hod.info@demo.ardoise.cm` (head of Informatique), `j.mbarga@demo.ardoise.cm` (teacher, INF101), `brenda@demo.ardoise.cm` (student, also signs in as `ISDY26A001`), `cedric@demo.ardoise.cm`, `yannick@demo.ardoise.cm` (students). On the student list, `ISDY26A006` (NGONO Esther), `ISDY26A007` (TABI Marc) and `ISDY26A008` (BIH Ruth) haven't signed up yet.

**Things to try with the demo**
- Teacher → INF101 → *TP 3 — Fonctions* → grade the three waiting hand-ins with the rubric.
- Teacher → INF101 → Attendance → start roll call; as Brenda, type the code on the phone app's home screen.
- Admin → Deliberations → new: *Licence Informatique*, *S1 · 2026-2027*, level *L1* → lock → publish → PV → transcripts. Then as Cédric → Results → scan the transcript's QR code.
- Brenda → INF101 → *Quiz 1 — Bases de Python*.
- Sign in with matricule `ISDY26A001` instead of an email.
- Open `/join/isdy`, create a student account with matricule `ISDY26A006` and the name Esther Ngono: after the confirmation email it lands straight in her three courses.
- Owner → Admin → Staff → invite a teacher for Informatique → open the link in another browser.
- Head of department → a course → Grades: read-only, with export.

## 3. Phone app

```bash
cd ardoise-lms/mobile
npm install
cp .env.example .env           # same Supabase URL + key; EXPO_PUBLIC_WEB_URL; EXPO_PUBLIC_DEMO=on for demos
npx expo start                 # scan with Expo Go
```

**Browser preview** (what runs at `/app`): `./scripts/export-web.sh` with the same `EXPO_PUBLIC_*` values builds the app for the browser and copies it to `web/public/app`; commit and deploy the web app.

Store builds go through EAS (`npx eas-cli@latest build`), configured in `app.json`.

## Checks

| Check | Result |
| --- | --- |
| `supabase/tests`: `npm install && npm test` (all migrations and the three seeds on PGlite) | 270 checks pass: school isolation, role powers and oversight, invitations, matricule claims and sign-in, student-list import, answer keys hidden, quiz marking, locked deliberations, transcript verification, inbox and discussion permissions, attendance codes and rate limits, no backdated posts, function lock-down |
| `web`: `npm test` (LMD engine, student-list parser) | 24 tests pass |
| `web`: `npx tsc --noEmit`, `npm run lint`, `npm run build` | clean |
| `mobile`: `npx tsc --noEmit`, `npx expo lint`, `npx expo export` (Android and web) | clean |
| Live demo (Supabase + Vercel) | web checked as owner, registrar, head of department, teacher, student (email and matricule sign-in), Ardoise console and invitation links; phone preview checked as student and teacher |

Not yet done: a run on a physical Android phone.

## Known limits

- **Second session (rattrapage) deliberation**: one deliberation per programme, semester and level, and a published one is final. A separate session-2 deliberation comes next.
- Notifications are in-app only; push, SMS and WhatsApp come next.
- Multiple-choice questions are all-or-nothing; editing an answer key doesn't re-mark past attempts.
- PDFs use the standard Latin-1 fonts: French accents work, other scripts are replaced.
- The phone app doesn't know the new roles or matricule sign-in yet (paused while the web workflow settles).
- Student-list import takes Excel/CSV; reading the registration portal's Form B directly comes next.
- Still to come: Google sign-in, two-step sign-in, per-school branding, mobile-money billing, iOS build, offline course downloads.

## Decisions

- Look: "Terroir" — slate, chalk, ochre and terracotta, Alegreya and Alegreya Sans, Ndop-inspired patterns. Fonts ship with the apps (no font CDN on slow connections).
- Next.js 16 **Cache Components is off** (every page reads the session).
- Phone photos compressed before upload; 10 MB file cap; dates in Cameroon time (WAT).
- Posts, messages and hand-ins are timestamped by the database, not the client.
- **Data protection (Law No. 2024/017)**: get local counsel on hosting region and prior authorisation before the first pilot.
