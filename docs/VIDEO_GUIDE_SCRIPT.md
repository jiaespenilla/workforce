# CadensIQ — Full Video Guide Script (Recording-Ready)

> **Note:** This is a complete, scene-by-scene script and storyboard you can
> record with any screen recorder (OBS Studio — free, Xbox Game Bar `Win+G`,
> or PowerPoint's built-in recorder). Every scene lists what to show on
> screen and word-for-word narration. Total runtime: ~12 minutes.

---

## Before you record (checklist)

1. **Clean demo data** — you want a tidy database: 1–2 companies, a handful of
   employees with realistic names, a few tasks, and shift schedules.
2. **Two browser profiles / windows** — one logged in as **Administrator**,
   one as a **company owner (CEO)**, plus a private window for the **kiosk**.
3. **A paired kiosk device** — have the kiosk device token ready (Kiosk Setup page).
4. **Reset your password flow demo** — know the seeded default password.
5. Recording setup: 1920×1080, browser zoom 100–110%, hide bookmarks bar.
6. Do one full dry run before recording.

---

## Scene 1 — Intro (0:00–0:40)

**On screen:** Login page.

**Narration:**
> "Welcome to CadensIQ by CelestSolutions — a complete workforce management
> suite. In this video we'll set the system up from scratch and walk through
> daily use: registering a company, managing people, shifts, time keeping at
> the kiosk — including fingerprint clock-in — tasks, and payroll. Let's get
> started."

---

## Scene 2 — First login & password change (0:40–1:40)

**On screen:** Type the seeded admin email + default password, click **Sign in**.

**Narration:**
> "Every CadensIQ deployment starts with a seeded administrator account.
> Sign in with the default password from the deployment notes."

**On screen:** If the default-password banner appears, click **Change password**
now; enter a strong password and save.

**Narration:**
> "The system flags the default password immediately. Change it right away —
> you are responsible for everything done under your account."

---

## Scene 3 — System configuration tour (1:40–3:30)

**On screen:** Sidebar → **System Configuration**. Show each tab briefly:

| Tab | What to say |
|---|---|
| **System Details** | "Set the system name, logo/icon, and maintenance mode. This branding appears on every client device and the kiosk." |
| **Roles & Permissions** | "Roles control what each person sees and does — per page and per action. Toggles include Storage Setup and Kiosk. Adjust and Save." |
| **Email Notifications** | "Where approval and welcome emails are sent." |
| **Terms & Policies** | "Plain-language Terms and Privacy Policy, shown during company registration. Administrators can customize these." |
| **Session & Security** | "Optional idle session timeout." |

**Narration:**
> "Everything starts in System Configuration. Define your roles first — every
> user's access is decided by their role. The Terms and Privacy pages are
> written in plain language so every employee can understand them."

---

## Scene 4 — Registering a company (3:30–5:00)

**On screen:** Sign out → Register Company page. Fill in company details,
select roles, accept the Terms & Policies, submit.

**Narration:**
> "New companies self-register here. Company names must be unique, and the
> application stays pending until an administrator approves it. Note the
> Terms & Privacy modal — this is what every applicant sees."

**On screen:** Switch to the **Administrator** window → approve the company.

**Narration:**
> "As administrator, approve the application. The company is now active and
> its owner can sign in."

---

## Scene 5 — People & roles (5:00–6:15)

**On screen:** Log in as the company owner → **People** page. Add 2–3
employees, assign roles and work locations.

**Narration:**
> "People is the company roster. Add teammates, assign their role, location,
> and shift. Roles come from the list the administrator configured — the CEO
> decides which role each person gets. Inactive employees can't sign in or
> clock in."

---

## Scene 6 — Shift schedules (6:15–7:00)

**On screen:** **Shift Schedules** page → create a shift (e.g., 08:00–17:00),
assign it to an employee.

**Narration:**
> "Shifts drive the kiosk's automatic clock logic — the system decides whether
> a scan is a clock-in or clock-out based on the assigned shift, including
> overtime handling. Create the shift first, then assign people to it."

---

## Scene 7 — Kiosk setup & pairing (7:00–8:30)

**On screen:** **Kiosk Setup** page → copy the device token. Open the kiosk in
a private window → pair using the token.

**Narration:**
> "The time kiosk runs on any standalone device — a tablet at the entrance is
> typical. Pair it once by pasting the company's device token from Kiosk
> Setup. Paired devices record attendance without anyone logging in; the token

## Scene 8 — Registering kiosk credentials: fingerprint, PIN, QR (8:30–10:00)

**On screen:** Still in Kiosk Setup → select an employee →
**Register fingerprint** (touch the sensor / follow the OS biometric prompt),
then set a **PIN** and generate a **QR badge**.

**Narration:**
> "Each employee needs credentials to identify themselves at the kiosk.
> Fingerprint registration uses the device's built-in fingerprint reader —
> the same physical device can capture every employee's fingerprint. When
> anyone touches the sensor later, the device itself recognizes which
> employee it is — no name selection needed. Only an encrypted digital
> signature of the fingerprint is stored, never an image.
> For devices without a reader, employees use a PIN or scan their QR badge."

**On screen:** Repeat for a second employee to prove one device holds many
people's fingerprints.

---

## Scene 9 — Clocking in and out (10:00–11:15)

**On screen:** Kiosk window → touch the fingerprint sensor (or enter PIN /
scan QR). Show the automatic Clock In result. Scan again to Clock Out.

**Narration:**
> "Clock in is now one touch — the kiosk identifies the employee, checks their
> shift, and records the punch automatically. No buttons, no name picking.
> Punching for someone else, or sharing credentials, is a serious policy
> violation. Administrators and HR see the full attendance history in the
> Time Keeping page."

---

## Scene 10 — Tasks (11:15–12:00)

**On screen:** **Tasks** page → create a task, assign it to an employee, set
priority and due date. Show the Dashboard's task overview.

**Narration:**
> "Tasks are assigned to any active employee in the company. Attachments are
> stored where the administrator chose — D1, R2, or Google Drive — configured
> once in Settings → Storage Setup."

---

## Scene 11 — Payroll & wrap-up (12:00–12:40)

**On screen:** **Payroll** page → show the summary derived from attendance.

**Narration:**
> "Payroll shows read-only summaries computed from attendance — actual salary
> processing stays in your existing payroll system. That's the complete
> CadensIQ cycle: configure, register, roster, shift, kiosk, clock, tasks,
> payroll. Questions? The Help & Guide panel is always in the sidebar.
> CadensIQ — by CelestSolutions."

---

## Shot list (quick reference)

| # | Scene | Window/Role | Duration |
|---|---|---|---|
| 1 | Intro | Login page | 0:40 |
| 2 | First login + password change | Admin | 1:00 |
| 3 | System configuration tour | Admin | 1:50 |
| 4 | Company registration + approval | Private window + Admin | 1:30 |
| 5 | People | CEO | 1:15 |
| 6 | Shift schedules | CEO | 0:45 |
| 7 | Kiosk pairing | Private window + Kiosk Setup | 1:30 |
| 8 | Credential registration (fingerprint/PIN/QR) | Kiosk Setup | 1:30 |
| 9 | Clock in/out | Kiosk | 1:15 |
| 10 | Tasks | CEO | 0:45 |
| 11 | Payroll + outro | CEO | 0:40 |

> can be rotated at any time, which un-pairs the old device."

---

