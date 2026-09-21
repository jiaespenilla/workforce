function section(id, title, intro, bullets) {
  return { id, title, intro, bullets }
}

function commonSections() {
  return [
    section('notifications', 'Notifications', 'The bell at the top is your work inbox.', [
      'A red number means something new is waiting.',
      'Open a message to go to the related work.',
      'Clear messages after you have read them.',
    ]),
    section('profile', 'My Profile', 'Keep your personal details and sign-in safe.', [
      'Update your name, phone number, and optional photo.',
      'Change a temporary password the first time you sign in.',
      'Sign out when you use a shared computer.',
    ]),
    section('security', 'Staying safe', 'A few habits protect everyone’s information.', [
      'Never share your password or let another person clock for you.',
      'Remove a phone passkey straight away if the phone is lost.',
      'Tell an administrator when something looks wrong.',
    ]),
  ]
}

function adminSections() {
  return [
    section('getting-started', 'Getting started', 'You approve companies, prepare time clocks, and keep the service running.', [
      'Use the menu on the left to move between setup pages.',
      'A red mark on the bell means a new item needs attention.',
      'Review changes carefully because they can affect every company.',
    ]),
    section('companies', 'Companies', 'Review new companies and manage the ones already using the service.', [
      'Approve a company when its details are correct.',
      'Pause a company to block sign-ins and new time punches.',
      'Keep its employee list and contact details up to date.',
    ]),
    section('system-config', 'System Configuration', 'Manage the system name, time zone, roles, messages, and policies.', [
      'Choose which pages each role can open.',
      'Use maintenance mode while making large changes.',
      'Keep the privacy and time-keeping wording current.',
    ]),
    section('roles', 'Roles & Permissions', 'Roles decide which pages and actions a person can use.', [
      'Create the roles companies need.',
      'Switch each page or action on or off for a role.',
      'Changes take effect when the person signs in again.',
    ]),
    section('shifts', 'Shift Schedules', 'Shifts help the service decide how a verified punch affects the workday.', [
      'Create fixed or open shifts.',
      'Assign the correct shift to each employee.',
      'The service decides clock-in, clock-out, and overtime on the server.',
    ]),
    section('time-clock-setup', 'Time Clock Setup', 'Enable personal phones and prepare workplace fingerprint terminals.', [
      'Turn on the personal-phone pilot for the chosen company.',
      'Add a terminal, assign its work site, and match terminal employee numbers to staff.',
      'Use the simulator before buying hardware and review rejected or delayed events.',
      'Fingerprint information stays inside the phone or terminal.',
    ]),
    section('storage', 'Storage Setup', 'Connect the secure place used for employee documents.', [
      'This normally needs to be done only once.',
      'The service can flag documents whose important date has passed.',
    ]),
  ]
}

function companySections({ role, perms = {} }) {
  const allowed = (key) => perms[key] !== false
  const sections = []
  if (allowed('dashboard')) sections.push(section('dashboard', 'Your Dashboard', role === 'ceo' ? 'See how the team is doing today.' : 'See a quick summary of your workday.', role === 'ceo' ? [
    'See who is currently clocked in.',
    'Open a person to review their assigned work.',
    'Check alerts for late or soon-due work.',
  ] : [
    'See open work and this week’s hours.',
    'Use the shortcuts to reach your main pages.',
  ]))
  if (allowed('tasks')) sections.push(section('tasks', role === 'ceo' ? 'Tasks' : 'My Tasks', 'Follow work from start to finish.', [
    'Move work between Pending, In Progress, and Completed.',
    'Use the due date and priority to decide what comes first.',
    'Add progress notes so the right people can follow along.',
  ]))
  if (allowed('timekeeping')) sections.push(section('timekeeping', 'Time Keeping', role === 'ceo' ? 'Review the team’s verified hours.' : 'Clock in or out and review your own hours.', role === 'ceo' ? [
    'Choose an employee and a day, week, or month.',
    'Review start, finish, total hours, and overtime.',
    'Check any event marked as delayed or needing attention.',
  ] : [
    'Register a phone passkey, then use the large Clock In or Clock Out button.',
    'Your fingerprint or face scan stays on your phone.',
    'Location is requested for review, but an unavailable location does not block your punch.',
    'A failed network request is not shown as successful; use the safe retry button.',
  ]))
  if (role === 'employee' && allowed('timekeeping')) sections.push(section('phone-passkeys', 'My Phone Passkeys', 'Manage the personal phones allowed to verify your punches.', [
    'You can register more than one phone and give each a clear name.',
    'See when each phone was last used.',
    'Remove a lost or old phone immediately.',
  ]))
  if (role === 'ceo' && allowed('employees')) sections.push(section('people', 'People', 'Keep the staff list correct.', [
    'Add employees and assign their roles and shifts.',
    'Update work and pay details when they change.',
    'Move unfinished work before making an employee inactive.',
  ]))
  if (allowed('payroll')) sections.push(section('payroll', 'Payroll', 'Review pay summaries based on verified hours.', [
    'Set each person’s pay type and rate.',
    'Review normal and overtime hours before running payroll.',
    'Print or save each payslip.',
  ]))
  return sections
}

export const QUICK_ANSWERS = [
  { q: 'I forgot to clock out. What now?', a: 'Tell your manager or administrator so they can review the record.' },
  { q: 'My phone will not verify me.', a: 'Make sure the phone has a screen lock and supports passkeys, then remove and register it again.' },
  { q: 'Why did the app ask for my location?', a: 'Location helps review where a phone punch happened. You can still punch if it is unavailable.' },
  { q: 'My punch failed while offline.', a: 'Personal phones must be online. Reconnect and try again; only a confirmed success is recorded.' },
  { q: 'How do I change my password?', a: 'Open My Profile and choose Change password.' },
]

export function buildGuideSections({ role, perms = {} } = {}) {
  return role === 'administrator'
    ? [...adminSections(), ...commonSections()]
    : [...companySections({ role, perms }), ...commonSections()]
}

export function buildGuideHtml({ role, perms, roleLabel, systemName, version } = {}) {
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const sections = buildGuideSections({ role, perms }).map((item) => `<section><h2>${esc(item.title)}</h2><p>${esc(item.intro)}</p><ul>${item.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('')}</ul></section>`).join('')
  const answers = QUICK_ANSWERS.map((item) => `<div class="faq"><p class="q">${esc(item.q)}</p><p>${esc(item.a)}</p></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Help &amp; Guide — ${esc(systemName || 'Workforce')}</title><style>body{font-family:Arial,sans-serif;font-size:13px;line-height:1.55;color:#1f2937;margin:32px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:24px 0 6px;color:#047857;border-bottom:2px solid #d1fae5;padding-bottom:4px}.meta{color:#6b7280}.q{font-weight:700;margin-bottom:0}.faq p{margin-top:3px}@media print{body{margin:15mm}}</style></head><body><h1>${esc(systemName || 'Workforce')} — Help &amp; Guide</h1><p class="meta">${esc(roleLabel || role || 'User')} · ${esc(version || '')}</p>${sections}<h2>Quick answers</h2>${answers}</body></html>`
}
