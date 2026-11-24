// ===== Frontend logic (plain JavaScript) =====
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
const $ = (id) => document.getElementById(id);

// Small helper to call the backend API
async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  $('toast').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '-');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formData = (form) => Object.fromEntries(new FormData(form));

// ===== AUTH =====
$('toggleAuth').onclick = (e) => {
  e.preventDefault();
  $('loginForm').classList.toggle('hidden');
  $('registerForm').classList.toggle('hidden');
  e.target.textContent = $('loginForm').classList.contains('hidden') ? 'Already registered? Login' : 'New student? Register here';
};

async function doAuth(path, body) {
  try {
    const data = await api(path, { method: 'POST', body });
    token = data.token; user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    toast(`Welcome ${user.name}`);
    showApp();
  } catch (err) { toast(err.message, true); }
}
$('loginForm').onsubmit = (e) => { e.preventDefault(); doAuth('/auth/login', formData(e.target)); };
$('registerForm').onsubmit = (e) => { e.preventDefault(); doAuth('/auth/register', formData(e.target)); };

function logout() {
  if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  token = null; user = null;
  localStorage.clear();
  $('appView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
}
$('logoutBtn').onclick = logout;

// ===== TABS (admin sees more tabs = RBAC) =====
const TABS = [
  ['dashboard', 'Dashboard', 'all'],
  ['books', 'Books', 'all'],
  ['members', 'Members', 'admin'],
  ['issues', 'Issue / Return', 'admin'],
  ['issues', 'My Books', 'student'],
  ['reports', 'Reports', 'admin'],
  ['audit', 'Audit Log', 'admin']
];
const loaders = { dashboard: loadDashboard, books: loadBooks, members: loadMembers, issues: loadIssues, reports: () => {}, audit: loadAudit };

function openTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + name));
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
  loaders[name]();
}

async function showApp() {
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('userInfo').textContent = `${user.name} (${user.role})`;
  const isAdmin = user.role === 'admin';
  document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdmin));
  $('issuesHeading').firstChild.textContent = isAdmin ? 'Issue / Return ' : 'My Borrowed Books ';
  $('tabs').innerHTML = TABS.filter(([, , who]) => who === 'all' || who === user.role)
    .map(([id, label]) => `<a href="#" data-tab="${id}">${label}</a>`).join('');
  document.querySelectorAll('#tabs a').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openTab(a.dataset.tab); }));

  const cats = await api('/books/categories').catch(() => []);
  const opts = cats.map((c) => `<option>${c}</option>`).join('');
  $('bookCat').innerHTML = opts;
  $('searchCat').innerHTML = '<option value="">All categories</option>' + opts;
  openTab('dashboard');
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const s = await api('/reports/summary');
  const items = [['Books (titles)', s.books], ['Total copies', s.totalCopies], ['Available copies', s.availableCopies],
    ['Students', s.members], ['Currently issued', s.issued], ['Overdue', s.overdue]];
  $('stats').innerHTML = items.map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  const info = await fetch('/api/system/info').then((r) => r.json());
  $('txnInfo').textContent = info.transactionsSupported
    ? '✅ Transactions ENABLED (replica set) — issue/return run as real ACID transactions.'
    : '⚠️ Transactions DISABLED (standalone MongoDB). App works, but for real ACID use MongoDB Atlas / replica set.';
}

// ===== BOOKS =====
async function loadBooks() {
  const q = encodeURIComponent($('searchQ').value.trim());
  const c = encodeURIComponent($('searchCat').value);
  try {
    const books = await api(`/books?q=${q}&category=${c}`);
    const isAdmin = user.role === 'admin';
    $('booksBody').innerHTML = books.map((b) => `
      <tr><td>${esc(b.isbn)}</td><td>${esc(b.title)}</td><td>${esc(b.author)}</td><td>${esc(b.category)}</td>
      <td>${b.availableCopies} / ${b.totalCopies}</td>
      ${isAdmin ? `<td><button class="small ghost" onclick='editBook(${JSON.stringify(b).replace(/'/g, '&#39;')})'>Edit</button>
      <button class="small danger" onclick="deleteBook('${b._id}')">Delete</button></td>` : ''}</tr>`).join('')
      || '<tr><td colspan="6">No books found</td></tr>';
  } catch (err) { toast(err.message, true); }
}
$('searchBtn').onclick = loadBooks;

function resetBookForm() {
  $('bookForm').reset();
  $('bookForm').id.value = '';
  $('bookForm').isbn.disabled = false;
  $('bookFormTitle').textContent = 'Add Book';
}
$('bookCancel').onclick = resetBookForm;

window.editBook = (b) => {
  const f = $('bookForm');
  f.id.value = b._id; f.isbn.value = b.isbn; f.isbn.disabled = true;
  f.title.value = b.title; f.author.value = b.author; f.category.value = b.category; f.totalCopies.value = b.totalCopies;
  $('bookFormTitle').textContent = 'Edit Book (UPDATE)';
  f.scrollIntoView({ behavior: 'smooth' });
};

$('bookForm').onsubmit = async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  d.totalCopies = Number(d.totalCopies);
  try {
    if (d.id) { await api('/books/' + d.id, { method: 'PUT', body: d }); toast('Book updated (UPDATE)'); }
    else { await api('/books', { method: 'POST', body: d }); toast('Book added (INSERT) + audit log written by trigger'); }
    resetBookForm();
    loadBooks();
  } catch (err) { toast(err.message, true); }
};

window.deleteBook = async (id) => {
  if (!confirm('Delete this book?')) return;
  try { await api('/books/' + id, { method: 'DELETE' }); toast('Book deleted (DELETE)'); loadBooks(); }
  catch (err) { toast(err.message, true); }
};

// ===== MEMBERS =====
async function loadMembers() {
  const members = await api('/members');
  $('membersBody').innerHTML = members.map((m) => `
    <tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${m.role}</td><td>${m.activeBooks}</td>
    <td><button class="small danger" onclick="deleteMember('${m._id}')">Delete</button></td></tr>`).join('');
}
$('memberForm').onsubmit = async (e) => {
  e.preventDefault();
  try { await api('/members', { method: 'POST', body: formData(e.target) }); toast('Member added'); e.target.reset(); loadMembers(); }
  catch (err) { toast(err.message, true); }
};
window.deleteMember = async (id) => {
  if (!confirm('Delete this member?')) return;
  try { await api('/members/' + id, { method: 'DELETE' }); toast('Member deleted'); loadMembers(); }
  catch (err) { toast(err.message, true); }
};

// ===== ISSUE / RETURN =====
async function loadIssues() {
  const isAdmin = user.role === 'admin';
  if (isAdmin) {
    const [members, books] = await Promise.all([api('/members'), api('/books')]);
    $('issueMember').innerHTML = '<option value="">Select member</option>' +
      members.filter((m) => m.role === 'student').map((m) => `<option value="${m._id}">${esc(m.name)} (${m.activeBooks} books)</option>`).join('');
    $('issueBook').innerHTML = '<option value="">Select book</option>' +
      books.map((b) => `<option value="${b._id}" ${b.availableCopies ? '' : 'disabled'}>${esc(b.title)} (${b.availableCopies} left)</option>`).join('');
  }
  const status = $('issueFilter').value;
  const issues = await api('/issues' + (status ? '?status=' + status : ''));
  const now = new Date();
  $('issuesBody').innerHTML = issues.map((i) => {
    const late = i.status === 'ISSUED' && new Date(i.dueDate) < now;
    return `<tr><td>${esc(i.book?.title || '(deleted)')}</td><td>${esc(i.member?.name || '(deleted)')}</td>
      <td>${fmt(i.issueDate)}</td><td>${fmt(i.dueDate)}</td>
      <td><span class="pill ${late ? 'LATE' : i.status}">${late ? 'OVERDUE' : i.status}</span></td>
      <td>₹${i.fine}</td>
      ${isAdmin ? `<td>${i.status === 'ISSUED' ? `<button class="small" onclick="returnBook('${i._id}')">Return</button>` : '-'}</td>` : ''}</tr>`;
  }).join('') || '<tr><td colspan="7">No records</td></tr>';
}
$('issueFilter').onchange = loadIssues;

$('issueForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await api('/issues/issue', { method: 'POST', body: formData(e.target) });
    toast(`Book issued ✔ Transaction: ${r.transaction}`);
    loadIssues();
  } catch (err) { toast('Transaction rolled back: ' + err.message, true); }
};

window.returnBook = async (id) => {
  try {
    const r = await api(`/issues/${id}/return`, { method: 'POST' });
    toast(`Returned ✔ Fine ₹${r.issue.fine} · Transaction: ${r.transaction}`);
    loadIssues();
  } catch (err) { toast(err.message, true); }
};

// ===== REPORTS =====
const REPORT_NOTES = {
  'top-books': 'SQL idea: SELECT title, COUNT(*) FROM issues JOIN books GROUP BY title ORDER BY count DESC LIMIT 5',
  'category-rank': 'SQL idea: DENSE_RANK() OVER (PARTITION BY category ORDER BY times_issued DESC)',
  overdue: 'Data comes from the MongoDB VIEW "overdue_issues" (a saved query, stores no data).',
  'never-issued': 'SQL idea: SELECT * FROM books b WHERE NOT EXISTS (SELECT 1 FROM issues i WHERE i.book = b.id)  → EXCEPT',
  fines: 'SQL idea: SELECT member, SUM(fine) FROM issues GROUP BY member HAVING SUM(fine) > 0'
};

function renderTable(rows) {
  if (!rows.length) return '<p>No data</p>';
  const cols = Object.keys(rows[0]);
  return `<table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) =>
    `<tr>${cols.map((c) => `<td>${esc(c.toLowerCase().includes('date') ? fmt(r[c]) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

document.querySelectorAll('#reportButtons button[data-r]').forEach((btn) => {
  btn.onclick = async () => {
    try {
      const rows = await api('/reports/' + btn.dataset.r);
      $('reportNote').textContent = REPORT_NOTES[btn.dataset.r];
      $('reportOut').innerHTML = renderTable(rows);
    } catch (err) { toast(err.message, true); }
  };
});

$('explainBtn').onclick = async () => {
  const q = prompt('Search word to analyse:', 'database');
  if (!q) return;
  try {
    const r = await api('/books/explain?q=' + encodeURIComponent(q));
    $('reportNote').textContent = 'explain("executionStats"): WITH index MongoDB reads only matching keys (IXSCAN/TEXT). WITHOUT index it scans the whole collection (COLLSCAN).';
    $('reportOut').innerHTML = renderTable([{ type: 'With text index', ...r.withIndex }, { type: 'Without index (regex)', ...r.withoutIndex }]);
  } catch (err) { toast(err.message, true); }
};

$('csvBtn').onclick = async () => {
  const res = await fetch('/api/reports/export-csv', { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) return toast('Export failed', true);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: 'books.csv' });
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported — server read books row by row using a cursor');
};

// ===== AUDIT =====
async function loadAudit() {
  const logs = await api('/audit');
  $('auditBody').innerHTML = logs.map((l) =>
    `<tr><td>${new Date(l.at).toLocaleString('en-IN')}</td><td>${l.action}</td><td>${esc(l.details)}</td></tr>`).join('');
}

// Start
if (token && user) showApp();
