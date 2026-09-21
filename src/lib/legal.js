export const DEFAULT_TERMS = `Terms & Conditions — CadensIQ by CelestSolutions
Last updated: September 21, 2026

1. Agreeing to these terms
By creating an account or using CadensIQ, you agree to these rules and to our Privacy Policy. If you sign up on behalf of a company, you confirm you are allowed to make that decision for your company.

2. Your account
- Use your real name and a working email address. One account per person.
- Keep your password private and change the temporary password you were given when you first sign in.
- We may pause or close accounts that share logins, break these rules, or try to falsify time keeping.

3. Registering a company
- Provide true and accurate company details. New companies are reviewed before they become active.
- Company owners are responsible for keeping their team list accurate and up to date.

4. Roles and permissions
- Every user has a role that decides what they can see and do.
- Administrators and company owners decide which role each person gets.

5. Time keeping
- Attendance is recorded from your signed-in personal phone after a passkey check, or from a securely paired workplace kiosk or fingerprint terminal.
- The system decides whether a verified phone punch is a clock-in or clock-out and records official server time. Delayed terminal events keep their device occurrence time and may be marked for review.
- Clock in and out only for yourself. Sharing an account or faking time records can lead to account deactivation.

6. Tasks, payroll, and people records
- Tasks can be assigned to active members of your company and finished tasks remain in history.
- Payroll pages show summaries based on attendance. Actual salary processing happens outside CadensIQ.
- People records are private to your company.

7. Fair use
Do not try to access another company's information, damage or overload the system, upload harmful or illegal files, or pretend to be someone else.

8. Data ownership and availability
Your company's information belongs to you. CadensIQ software and design belong to CelestSolutions. We work to keep the service available but cannot promise uninterrupted operation.

9. Ending your use
A company can stop using CadensIQ at any time and request an export or deletion, subject to required record-retention rules.

10. Contact
Questions about these terms? CelestSolutions — jiaespenilla@gmail.com`

export const DEFAULT_PRIVACY = `Privacy Policy — CadensIQ by CelestSolutions
Last updated: September 21, 2026

1. What we collect
- Your name, email address, role, and company.
- Attendance records including clock time, source device/site, review status, and phone location when available.
- Personal phone passkey public keys. Fingerprint and face information stays inside your phone or workplace terminal and is never sent to CadensIQ.
- Your tasks, notifications, app settings, and an optional profile photo.

2. How we use it
- To confirm a phone passkey or registered workplace kiosk/terminal and record attendance correctly.
- To show the right information for your company, send important notifications, and protect the service from abuse.

3. What we never do
- We never sell your data or share it with other companies using CadensIQ.
- We never store fingerprint images, fingerprint templates, or face scans.

4. Where your data lives
- Your service data is stored on Cloudflare, our hosting provider.
- Passwords are scrambled so they cannot be read. Passkeys are stored as public keys only.

5. How long we keep it
- Data is kept while your company uses CadensIQ and as long as applicable employment or labor rules require.
- Data may be exported or deleted on request where the law allows.

6. How we protect it
- Traffic is encrypted. Workplace terminals sign event batches, standalone kiosks require one-time administrator pairing, and repeated or expired requests are blocked.
- Rejected, delayed, and out-of-order terminal events are kept for administrator review instead of silently rewriting attendance history.

7. Your choices and rights
- Phone location is requested for attendance review but a denied or unavailable location does not block a punch.
- You can view and edit your profile, remove your own phone passkeys, and request an export or deletion.

8. Tracking and children
- We use only what is needed to keep you signed in and remember preferences. We do not use advertising trackers.
- CadensIQ is for workers aged 16 and older.

9. Contact
Questions, requests, or concerns? CelestSolutions — jiaespenilla@gmail.com`

const DEFAULTS = { terms: DEFAULT_TERMS, privacy: DEFAULT_PRIVACY }

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
