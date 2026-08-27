export function loadRegisteredCompanies() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_companies'))
    if (!Array.isArray(stored)) return []
    return stored
      .filter((c) => c && typeof c === 'object' && c.id && c.name)
      .map((c) => {
        const employees = Array.isArray(c.employees) ? c.employees : []
        // Migrate older registrations that have no owner record —
        // fall back to the first listed employee.
        const owner = c.owner || (employees[0]
          ? { name: employees[0].name, title: employees[0].role, email: employees[0].email }
          : undefined)
        return { ...c, employees, owner }
      })
  } catch {
    return []
  }
}

export function getAllCompanies() {
  return loadRegisteredCompanies()
}

export function getActiveCompanies() {
  return getAllCompanies().filter((c) => c.active !== false)
}

// Flat list of every employee across all companies, tagged with their company.
export function getAllEmployees() {
  return getAllCompanies().flatMap((c) =>
    c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id }))
  )
}

export function getActiveEmployees() {
  return getAllEmployees().filter((e) => {
    const comp = getAllCompanies().find((c) => c.id === e.companyId)
    return comp?.active !== false && e.active !== false
  })
}

// Company-scoped views: users belonging to a company only ever see their own
// company's data. Platform accounts (no company attached) see everything.
export function getScopedCompanies(user) {
  const all = getAllCompanies()
  if (user?.companyName) return all.filter((c) => c.name === user.companyName)
  return all
}

export function getScopedEmployees(user) {
  return getScopedCompanies(user).flatMap((c) =>
    c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id }))
  )
}

export function getActiveScopedCompanies(user) {
  return getScopedCompanies(user).filter((c) => c.active !== false)
}

export function getActiveScopedEmployees(user) {
  return getActiveScopedCompanies(user).flatMap((c) =>
    c.employees.filter((e) => e.active !== false).map((e) => ({ ...e, companyName: c.name, companyId: c.id }))
  )
}
