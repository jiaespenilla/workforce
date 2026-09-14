// Help & Guide (76) — plain-language guide shown on the /help page.
// Content lives in pure builder functions so it is easy to test, and so the
// page and its PDF export always show exactly the same thing.

function section(id, title, intro, bullets) {
  return { id, title, intro, bullets }
}

// Administrator guide — the platform console.
function adminSections() {
  return [
    section('getting-started', 'Getting started',
      'Welcome! As the administrator, you look after the system itself and the companies that use it. You approve new companies, set up the kiosks, and keep everything running. Here is what each part of your console does.',
      [
        'Use the menu on the left to move between the different setup pages.',
        'You will see a notification bell at the top of the screen — a red dot means something new is waiting for you.',
        'Everything you change here is saved right away and applies to everyone using the system.',
      ]),
    section('companies', 'Companies',
      'This is where new customers arrive and where you manage the companies already using the system.',
      [
        'When a company signs up, it appears here as "pending" until you review it.',
        'Click a company to see its full details, then choose Approve (they can start using the system) or Reject (you can add a reason so they know why).',
        'If a company pauses business, you can switch it to inactive — its staff simply will not be able to sign in until you switch it back on.',
        'You can also fix a company\'s contact details or manage its list of employees here.',
      ]),
    section('system-config', 'System Configuration',
      'The control room for the whole system. Each tab changes one thing about how it works or looks.',
      [
        'System Details: the system name, version, time zone and the little icon shown on screens and kiosks.',
        'Roles & Permissions: decide which pages each role can open (see the next section).',
        'Email Notifications: where automatic emails (like welcome messages) are sent from.',
        'Terms & Policies: the plain-language rules and privacy information companies see when they sign up.',
        'System Status: a quick health check of the system, plus Maintenance Mode — turn it on while doing big changes and everyone else will see a friendly "back soon" page.',
      ]),
    section('roles', 'Roles & Permissions',
      'Roles decide what each person can see and do — for example, what a company owner can open versus their staff.',
      [
        'Create the roles companies will pick when they register their teams.',
        'For each role, switch pages on or off — a person only sees the pages their role allows.',
        'Changes apply the next time that person signs in.',
      ]),
    section('shifts', 'Shift Schedules',
      'Shifts tell the kiosk whether a card tap means "starting work" or "finishing work".',
      [
        'Create a shift (for example 9:00 to 18:00) or leave it open with no fixed times.',
        'Assign each employee to the shift they follow.',
        'The kiosk uses this automatically: first tap of the day starts the shift, the next tap ends it. After a full normal day, extra time is marked as overtime.',
      ]),
    section('kiosk-setup', 'Kiosk Setup',
      'Before a tablet or computer can be used as a time kiosk, it needs to be paired to a company — this is where you do that.',
      [
        'Choose the company, then copy the pairing code shown here into the kiosk screen.',
        'You can also create short-term codes for field work that expire on their own (1, 3, 5 hours or the whole day).',
        'Register each person\'s fingerprint, PIN or QR badge so the kiosk recognises them. A fingerprint is never stored as an image — only an unreadable signature.',
      ]),
    section('storage', 'Storage Setup',
      'Employee documents (like contracts and certificates) are kept safely online. This page connects the storage folder they are saved in.',
      [
        'You only need to do this once.',
        'If a document date passes (like a contract expiry), the system flags it automatically.',
      ]),
  ]
}

// Company-side guide (CEO and employees) — only the modules their role can open.
function companySections({ role, perms = {} }) {
  const allowed = (key) => perms[key] !== false
  const sections = []

  if (allowed('dashboard')) {
    sections.push(
      role === 'ceo'
        ? section('dashboard', 'Your Dashboard',
            'Your dashboard is mission control for the workday. Open it any time to see how the team is doing.',
            [
              'Everyone who is currently working (clocked in at the kiosk) is listed right at the top.',
              'Click a person to see their tasks grouped by what is pending, in progress, and finished.',
              'Above the dashboard you can export the full task report — copy it, download it as a Word file, or save it as a PDF to share.',
              'If a task is late or due soon, a red alert appears so nothing slips by.',
            ])
        : section('dashboard', 'Your Dashboard',
            'Your dashboard is your home base. It shows a quick summary of your work and shortcuts to the tools you use most.',
            [
              'Your open tasks and hours this week appear as soon as you sign in.',
              'The buttons below the summary take you straight to the pages you use most.',
            ]))
  }

  if (allowed('tasks')) {
    sections.push(
      role === 'ceo'
        ? section('tasks', 'Tasks',
            'Tasks is your to-do list for the whole team.',
            [
              'Click "New Task" to create work for someone, give it a due date and a priority, and pick the person who will do it.',
              'Tasks appear as cards in three columns: Pending, In Progress, and Completed.',
              'Drag a card between columns as things move along — the person doing the task sees the change instantly.',
              'Remove a task from its card when it is no longer needed.',
            ])
        : section('tasks', 'My Tasks',
            'This is your personal to-do list. Everything your CEO assigns to you shows up here.',
            [
              'Each task is a card. Drag it from "Pending" to "In Progress" when you start working on it.',
              'When you are finished, drag it to "Completed" — your CEO sees the update right away.',
              'The due date and priority on each card tell you what to do first.',
            ]))
  }

  if (allowed('timekeeping')) {
    sections.push(
      role === 'ceo'
        ? section('timekeeping', 'Time Keeping',
            'Time Keeping shows everyone\'s work hours, calculated for you in real time.',
            [
              'Search or pick an employee to see the days they worked, when they clocked in and out, and their total hours including overtime.',
              'Switch between day, week and month views, and export any report as a PDF to share or file.',
              'You do not clock in or out yourself — this page is about your team\'s hours.',
            ])
        : section('timekeeping', 'Time Keeping',
            'This is where your work hours live. Your hours add up automatically from the kiosk — no paperwork.',
            [
              'Your current status (Clocked In or Clocked Out) is shown at the top, along with today\'s punches.',
              'Scroll down to see your week: each day shows when you started, when you finished, and how many hours you worked.',
              'If a day looks wrong, tell your manager — they can check the records in their own Time Keeping view.',
            ]))
  }

  if (role === 'ceo' && allowed('employees')) {
    sections.push(
      section('people', 'People',
        'People is your staff directory — everyone who works for the company.',
        [
          'Add employees here; each one gets their own sign-in so they can use the system.',
          'Click a person to update their details, role, or pay information.',
          'Before marking someone as inactive (for example, when they resign), move their unfinished tasks to someone else first — the system will remind you so no work is lost.',
        ]))
  }

  if (allowed('payroll')) {
    sections.push(
      section('payroll', 'Payroll',
        'Payroll turns work hours into pay — no calculators needed.',
        [
          'First set each person\'s salary type (monthly or hourly) and rate in their profile.',
          'Add any standard deductions, like taxes or loans.',
          'When it is time to pay, run payroll for the period — the system computes each person\'s pay including overtime, and you can print a payslip for each of them.',
        ]))
  }

  if (role === 'employee' && allowed('kiosk')) {
    sections.push(
      section('kiosk', 'Kiosk Mode',
        'The kiosk is the clock machine — usually a tablet near the entrance.',
        [
          'When you arrive, identify yourself with your fingerprint, PIN or QR badge. The kiosk records that you started work.',
          'When you leave, do the same again — it records that you finished.',
          'That is all there is to it. Your hours appear in your Time Keeping page automatically.',
        ]))
  }

  return sections
}

// Sections every signed-in user gets.
function commonSections() {
  return [
    section('notifications', 'Notifications',
      'The bell icon at the top of the screen is your inbox.',
      [
        'A red number on the bell means you have unread notifications.',
        'Click a notification to go straight to the thing it is about — a new task, a welcome message, and so on.',
        'You can clear the list once you have read everything.',
      ]),
    section('profile', 'My Profile',
      'Your profile is all about you: your photo, your contact details, and your password.',
      [
        'Upload a photo so teammates recognise you around the app.',
        'Keep your name and phone number up to date — they appear on lists your colleagues see.',
      ]),
    section('security', 'Staying safe',
      'A few simple habits keep everyone\'s information safe.',
      [
        'If you were given a default password, change it the first time you sign in (My Profile → change password).',
        'Choose a password you have not used elsewhere, and never share it with anyone.',
        'Always sign out when you use a shared computer.',
      ]),
  ]
}

// Short Q&A shown at the bottom of the guide — for every role.
export const QUICK_ANSWERS = [
  { q: 'I forgot to clock out. What now?',
    a: 'Just tell your manager or the administrator. They can see your hours in Time Keeping and know what happened. Next time, one extra tap at the kiosk when you leave fixes it.' },
  { q: 'How do I change my password?',
    a: 'Open My Profile and use "Change password". If you are still using the password you were first given, please change it today.' },
  { q: 'The kiosk does not recognise me.',
    a: 'Ask your administrator — they register fingerprints, PINs and QR badges in Kiosk Setup. It only takes a moment.' },
  { q: 'Can I use this on my phone?',
    a: 'Yes. Open the same web address you use on the computer and sign in. Everything works the same.' },
  { q: 'Someone else\'s name appeared on my tasks.',
    a: 'Task cards show who they belong to. If something looks wrong, message your CEO — only they can move tasks between people.' },
]

// Build the guide for a signed-in user: only the modules their role can
// actually open, described in everyday language.
export function buildGuideSections({ role, perms = {} } = {}) {
  if (role === 'administrator') return [...adminSections(), ...commonSections()]
  return [...companySections({ role, perms }), ...commonSections()]
}

// Printable version (76): a clean, standalone document the browser can save
// as PDF — same content, same order as the on-screen guide.
export function buildGuideHtml({ role, perms, roleLabel, systemName, version } = {}) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const sectionHtml = buildGuideSections({ role, perms }).map((s) => `
    <section>
      <h2>${esc(s.title)}</h2>
      <p class="intro">${esc(s.intro)}</p>
      <ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
    </section>`).join('')
  const faqHtml = QUICK_ANSWERS.map((f) => `
    <div class="faq"><p class="q">${esc(f.q)}</p><p>${esc(f.a)}</p></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Help &amp; Guide — ${esc(systemName || 'Workforce')}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#1f2937;margin:32px}
      h1{font-size:22px;margin:0 0 4px}
      .meta{color:#6b7280;font-size:11px;margin:0 0 24px}
      h2{font-size:16px;margin:26px 0 6px;color:#047857;border-bottom:2px solid #d1fae5;padding-bottom:4px}
      .intro{margin:0 0 8px}
      ul{margin:0;padding-left:20px}
      li{margin:4px 0}
      .faq{margin:10px 0;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px}
      .faq .q{font-weight:bold;margin:0 0 3px}
      .faq p{margin:0}
      footer{margin-top:28px;color:#9ca3af;font-size:10px;border-top:1px solid #e5e7eb;padding-top:8px}
      @media print{body{margin:14mm}}
    </style></head><body>
    <h1>Help &amp; Guide</h1>
    <p class="meta">${esc(roleLabel || role || '')} · ${esc(systemName || 'Workforce')}${version ? ` ${esc(version)}` : ''} · printed ${new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    ${sectionHtml}
    <h2>Quick answers</h2>
    ${faqHtml}
    <footer>Generated by ${esc(systemName || 'Workforce')}${version ? ` ${esc(version)}` : ''} — this guide matches what your role can see in the app.</footer>
  </body></html>`
}
