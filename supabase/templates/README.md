# Ardoise emails

Three emails, English first and French below. All link to `/auth/confirm` in the web app. That route checks the
token itself, so a link works on any device, not only the browser that asked for it. A student who signs up on a
lab computer can confirm on their phone.

| File | Supabase template | Subject |
| --- | --- | --- |
| `confirmation.html` | Confirm signup | see `subjects.txt` |
| `recovery.html` | Reset password | see `subjects.txt` |
| `email_change.html` | Change email address | see `subjects.txt` |

## Why this matters before a real university

Right now the project sends email through Supabase's built-in sender (`noreply@mail.app.supabase.io`). That sender
is for testing only. It sends very few emails per hour, and its mail often lands in spam. A university signing up
thousands of students needs its own sender.

## Set it up (hosted Supabase, today)

1. **A domain for email.** Use the domain Ardoise will live on, for example `ardoise.cm`. Send from a subdomain,
   such as `noreply@mail.ardoise.cm`.
2. **A sending service.** Brevo, Amazon SES and Resend all work. Each gives SMTP settings (host, port, user, password)
   and DNS records (SPF, DKIM, DMARC). Add those DNS records at the domain's registrar, then wait for the service to
   show "verified".
3. **Supabase dashboard → Authentication:**
   - **SMTP Settings:** turn on custom SMTP. Paste the host, port, user and password. Sender: `noreply@mail.ardoise.cm`,
     name `Ardoise`.
   - **Rate limits:** raise "emails per hour". 300 or more covers a whole cohort signing up the same week.
   - **Email Templates:** for each row of the table above, paste the subject and the HTML file.
   - **URL Configuration:** set Site URL to the web app's address (today `https://ardoise-pi.vercel.app`). Add
     `https://ardoise-pi.vercel.app/**` to the Redirect URLs.

Until the templates are pasted, the default Supabase emails keep working. Their links only work in the browser
that asked for them.

## Self-hosted in Cameroon (later)

The same settings become environment variables of the Auth (GoTrue) container:

```
GOTRUE_SITE_URL=https://ardoise.cm
GOTRUE_URI_ALLOW_LIST=https://ardoise.cm/**
GOTRUE_SMTP_HOST=…            GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=…            GOTRUE_SMTP_PASS=…
GOTRUE_SMTP_ADMIN_EMAIL=noreply@mail.ardoise.cm
GOTRUE_SMTP_SENDER_NAME=Ardoise
GOTRUE_RATE_LIMIT_EMAIL_SENT=300
GOTRUE_MAILER_SUBJECTS_CONFIRMATION="…"   (from subjects.txt; likewise RECOVERY, EMAIL_CHANGE)
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=https://ardoise.cm/email/confirmation.html
GOTRUE_MAILER_TEMPLATES_RECOVERY=https://ardoise.cm/email/recovery.html
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=https://ardoise.cm/email/email_change.html
GOTRUE_MFA_TOTP_ENROLL_ENABLED=true
GOTRUE_MFA_TOTP_VERIFY_ENABLED=true
```

Keep sending through a dedicated email service even when the servers are in Cameroon. Mail sent straight from a new
server address is very likely to land in spam.
