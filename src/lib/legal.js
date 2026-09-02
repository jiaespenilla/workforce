export const DEFAULT_TERMS = `Terms & Conditions — CadensIQ by CelestSolutions
Last updated: September 2, 2026

1. Agreeing to these terms
By creating an account or using CadensIQ, you agree to these rules and to our Privacy Policy. If you sign up on behalf of a company, you confirm you are allowed to make that decision for your company.

2. Your account
• Use your real name and a working email address. One account per person.
• Keep your password private and change the temporary password you were given when you first sign in. You are responsible for everything done under your account.
• We may pause or close accounts that break these rules, share logins, or try to cheat time keeping.

3. Registering a company
• Provide true and accurate company details. Company names must be unique — duplicates are not accepted.
• New companies are reviewed before they become active. If an application is declined, we will tell you why and you may apply again.
• Company owners are responsible for keeping their team list accurate and up to date.

4. Roles and permissions
• Every user has a role (such as Employee, Team Lead, HR Manager, or Administrator) that decides what they can see and do.
• Administrators and company owners decide which role each person gets — please contact them if you believe you need different access.

5. Time keeping
• Attendance is recorded at your company's time kiosk using your PIN, QR badge, or fingerprint. Time records cannot be manually edited.
• The system automatically decides whether a scan is a clock-in or clock-out based on your assigned shift. If your shift looks wrong, tell your manager.
• Clock in and out only for yourself. Having someone else punch for you, sharing your PIN or badge, or faking time records is a serious violation and can lead to your account being deactivated.

6. Tasks
• Tasks can be assigned to any active member of your company. Anyone whose role allows it can create, update, or remove tasks.
• Finished tasks stay in the history for reporting.

7. Payroll and people records
• Payroll pages show read-only summaries based on attendance. Actual salary processing happens outside CadensIQ.
• People records are private to your company — no other company can see them.

8. Fair use
Please do not: try to access another company's information; hack, break, or overload the system; upload harmful or illegal files; or pretend to be someone else.

9. Your data stays yours
• Your company's and your employees' information belongs to you. We only store and process it to run the service for you.
• The CadensIQ software, its name, and its design belong to CelestSolutions.

10. Service availability
We work hard to keep CadensIQ running smoothly, but we cannot guarantee it will always be available or error-free. We may improve or change features from time to time.

11. Ending your use
A company can stop using CadensIQ at any time, and its data can be exported or deleted on request. We may suspend accounts that violate these terms.

12. Contact
Questions about these terms? CelestSolutions — jiaespenilla@gmail.com`

export const DEFAULT_PRIVACY = `Privacy Policy — CadensIQ by CelestSolutions
Last updated: September 2, 2026

1. What we collect
• Your name, email address, role, and company.
• Your attendance records: when you clocked in or out, and which shift applies.
• Your kiosk credentials: your PIN, your QR badge, and your fingerprint's digital signature. We never store an image of your fingerprint — only an encrypted signature that cannot be turned back into one.
• Your tasks, notifications, and app settings. An optional profile photo if you choose to add one.

2. How we use it
• To confirm it is really you when you sign in or scan at the kiosk, and to record your attendance correctly.
• To show you the right information for your company, and to send you important notifications.
• To keep the system safe — for example, by slowing down repeated failed sign-in attempts.

3. What we never do
• We never sell your data.
• We never share your information with other companies using CadensIQ.
• We never store your actual fingerprint.

4. Where your data lives
• Your data is stored securely in Cloudflare's global network, our hosting provider.
• Passwords and PINs are scrambled so they cannot be read by anyone — not even by us.

5. How long we keep it
• While your company uses CadensIQ, plus a short grace period in case you return.
• Attendance records are kept as long as labor law requires (usually 5 years), then made anonymous.
• Any data can be deleted sooner on request.

6. How we protect it
• All traffic is encrypted, passwords and PINs are never stored in plain text, and kiosk devices must be paired first before they can record anything.

7. Your rights
• You can view and edit your own profile at any time.
• You can ask your company or us to export or delete your data. We respond within 30 days.

8. Tracking
• We only store what is needed to keep you signed in and remember your preferences. No advertising or third-party trackers are used.

9. Children
CadensIQ is for workers aged 16 and older.

10. Changes and contact
We will update this page and the date above when something changes. Questions, requests, or concerns? CelestSolutions — jiaespenilla@gmail.com`
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
