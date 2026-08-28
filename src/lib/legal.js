export const DEFAULT_TERMS = `Terms & Conditions — Unified Workforce by CelestSolutions
Last updated: August 28, 2026

1. Acceptance of Terms
By creating an account, registering a company, or using the Unified Workforce platform (web, kiosk, API), you agree to these Terms and our Privacy Policy. If you register on behalf of a company, you represent that you have authority to bind that company.

2. Accounts & Authentication
• You must provide accurate name, email and company information. One person — one email.
• You are responsible for safeguarding your password and for all activity under your account. Use at least 8 characters and change the default password on first sign-in.
• We may suspend accounts that violate these Terms, share credentials, or attempt to bypass attendance/Kiosk controls.
• Session timeout and maintenance mode are enforced as configured by the Administrator.

3. Company Registration & Approval
• Company name, industry, address and contact details must be truthful. Duplicate company names are rejected.
• Submissions are pending until an Administrator approves. Approved companies become active; rejected applicants will receive a reason and may re-apply.
• Owners/CEOs are responsible for keeping their team roster accurate (active/inactive, role, location).

4. Roles, Permissions & Access Control
• System roles (Administrator, CEO, HR Manager, Team Lead, Employee, etc.) are defined in System Configuration → Roles & Permissions.
• Permissions are granular per page (Dashboard, Time Keeping, Tasks, Payroll, People, Shift Schedules, Kiosk) and per action (Add / Edit / Delete). If a role lacks a permission, the UI is hidden and API calls are blocked.
• Shift Schedules and Work Locations visibility is controlled via the Shifts permission and locations add/edit/delete actions.

5. Time Keeping, Shifts & Kiosk
• Attendance is recorded only via the Time Kiosk (PIN / QR badge / fingerprint/WebAuthn). Manual edits are not allowed.
• Clock-in/out status is determined automatically from your last punch and assigned shift (including open shifts and overtime grace period). Ensure your shift is assigned correctly.
• You must punch in/out on a paired kiosk device (X-Kiosk-Token). Unpaired devices cannot record attendance.
• Falsifying punches (buddy punching, credential sharing, time manipulation) is a violation and may lead to account deactivation.

6. Tasks
• Tasks may be assigned to any active employee within the same company. Assignees are stored both as a display string and normalized email/company fields.
• Any authenticated member whose role permits Tasks may create, update, or delete tasks. Administrators and CEOs have full oversight; other roles are gated by the Tasks add/delete actions in Roles & Permissions.
• Completed tasks remain in history for reporting; deletion is soft-logged via audit on the server.

7. Payroll, People & Locations
• Payroll views are read-only summaries derived from attendance; actual payroll processing is outside this system.
• People lists are scoped to your company. Locations (Office, WFH, Field) are per-company and must be created before assignment; deletions are blocked while in use.

8. Acceptable Use
You agree not to: (a) attempt to access another company's data; (b) upload malware or reverse-engineer the Worker; (c) scrape or overload the API (rate limits: login 8/15min per account, 24/IP; registration 5/hour/IP; kiosk 200/15min); (d) store illegal content; (e) impersonate another person.

9. Data & Intellectual Property
• You retain ownership of your Company and Employee data. You grant CelestSolutions a license to host and process it to provide the service.
• The platform, branding (CadensIQ), and all system code are owned by CelestSolutions. Do not copy or resell the service.

10. Security, Availability & Support
• We use PBKDF2 hashing (25k+ iterations, upgrade path to 600k), HMAC-signed 12-hour tokens, and per-IP/per-account brute-force protection. Tokens are stored as HttpOnly cookies where possible.
• The service is hosted on Cloudflare Workers/D1/R2 with best-effort 99.9% uptime. Maintenance mode may temporarily restrict non-administrator access.
• Support is provided via the Help & Guide panel and the notification channel.

11. Limitation of Liability
To the extent permitted by law, CelestSolutions is not liable for indirect, incidental, or consequential damages. Total liability is limited to fees paid in the prior 12 months (or PHP 10,000 if free tier).

12. Termination & Data Retention
• You may request deletion of your company and employee data. Administrators can reset tenant data (irreversible) via System Status → Danger Zone.
• We retain attendance and audit logs as required by law, then anonymize or delete per our retention schedule.

13. Changes & Contact
We may update these Terms and will post the new version with an updated date. Continued use after changes constitutes acceptance.
Questions: CelestSolutions — jiaespenilla@gmail.com — via the platform or System Configuration.`

export const DEFAULT_PRIVACY = `Privacy Policy — Unified Workforce by CelestSolutions
Last updated: August 28, 2026

1. Information We Collect
• Company data: name, industry, address, city, contact phone/email, logo (Data URL), registration date, status.
• Employee data: name, email (login identifier), role, location/work site, active status, manager, shift assignment.
• Attendance data: email, company, clock in/out timestamps, overtime flag, kiosk device token (if paired), shift association.
• Credentials: PIN (PBKDF2 hash + salt), QR code, fingerprint/WebAuthn credential ID + public key (never raw biometrics), password hash + salt.
• Operational data: tasks, notifications, roles/permissions, system settings, and audit logs.

2. How We Use Information
• To authenticate you, enforce role permissions, scope data to your company, record attendance, manage shifts/locations, and enable kiosk verification.
• To send transactional notifications (approvals, welcomes) via the queue; email delivery requires your domain to be verified for Cloudflare Email Sending.
• To improve security (rate limiting, anomaly detection) and to generate aggregated, non-identifying analytics.

3. Legal Basis (GDPR & PH DPA)
We process data on the bases of: contract (providing the workforce platform), legitimate interest (security, product improvement), consent (optional photo/avatar upload), and legal obligation (retention for labor law).

4. Data Sharing & Processors
• We do not sell your data. We share it only with service processors: Cloudflare (Workers, D1, R2, Email Sending) and your own company's administrators/CEOs who manage the roster.
• Cross-company data is never exposed; company-scoped APIs enforce tenant isolation.

5. Data Storage & Location
• Primary storage is Cloudflare D1 (SQLite) and R2 (if document storage is enabled) in Cloudflare's global network. Data may be replicated for availability.
• Passwords, PINs and kiosk tokens are stored as salted hashes (PBKDF2) or opaque tokens, never in plain text. Seed credentials are stored only as hashes.

6. Data Retention
• Company/employee records retained while the account is active plus a grace period for recovery, then deleted on request or via Admin Reset.
• Attendance logs retained per statutory requirements (typically 5 years PH) then anonymized. Backups are rotated and purged on the same schedule.
• Welcome/intro notifications are stored until cleared via the bell → Clear all.

7. Security Measures
• Encryption in transit (TLS), at-rest encryption via Cloudflare, strong hashing, HMAC-signed tokens, per-account/per-IP rate limits, shift-aware clock logic, and kiosk device pairing.
• You can enable idle session timeout (System Configuration) which is enforced client-side with a 1-minute warning.

8. Your Rights
You may: access, correct, or delete your profile (My Profile) and request export/deletion of your company's data via the Administrator. For privacy requests, contact your Company Owner or CelestSolutions at jiaespenilla@gmail.com. We will respond within 30 days.

9. Cookies & Local Storage
We use localStorage for session tokens, welcome-seen flags, and cached settings/roles, and a 12-hour signed token (preferably HttpOnly cookie). No third-party tracking cookies are used. Clearing storage will sign you out and require re-login.

10. Children's Privacy
The platform is not intended for children under 16. Do not register minors.

11. Changes & DPO Contact
We will post material changes here and update the Last updated date. For questions or to exercise rights, contact: CelestSolutions — jiaespenilla@gmail.com — or your system Administrator via System Configuration → Email Notifications.`

const DEFAULTS = { terms: DEFAULT_TERMS, privacy: DEFAULT_PRIVACY }

// Terms & Privacy are editable by the administrator (System Configuration → Terms & Policies).
export function getLegalDocs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('uw_legal')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveLegalDocs(docs) {
  localStorage.setItem('uw_legal', JSON.stringify(docs))
}
