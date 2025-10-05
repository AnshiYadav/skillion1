/* Advanced HelpDesk Mini — frontend-only SPA
   Features:
   - Login (admin/agent/user)
   - Dashboard + KPIs
   - Tickets list, search, filter, pagination
   - Ticket detail: comments, timeline, SLA countdown
   - Create / Edit / Assign / Status change with optimistic-version simulation
   - localStorage persistence
*/

// ---------------------- Helpers & persistence ----------------------
const APP_KEY = 'hd_mini_adv_v1';
const appEl = document.getElementById('app');
const navActions = document.getElementById('nav-actions');
const modals = document.getElementById('modals');

function nowISO(){ return new Date().toISOString(); }
function uId(){ return Math.floor(Math.random()*1e9); }

function loadStore(){
  const raw = localStorage.getItem(APP_KEY);
  if(raw) return JSON.parse(raw);
  // initial seed
  const store = {
    users: [
      {id:1,name:'Admin',email:'admin@mail.com',role:'admin'},
      {id:2,name:'Agent Bob',email:'agent@mail.com',role:'agent'},
      {id:3,name:'User Alice',email:'user@mail.com',role:'user'}
    ],
    // creds for demo only (DO NOT use this in production)
    creds: { 'admin@mail.com':'admin123', 'agent@mail.com':'agent123', 'user@mail.com':'user123' },
    tickets: [],
    events: [],
  };
  localStorage.setItem(APP_KEY, JSON.stringify(store));
  return store;
}
let store = loadStore();

function saveStore(){ localStorage.setItem(APP_KEY, JSON.stringify(store)); }

// Session
function getSession(){ return JSON.parse(sessionStorage.getItem('hd_session')||'null'); }
function setSession(s){ sessionStorage.setItem('hd_session', JSON.stringify(s)); updateNav(); }
function clearSession(){ sessionStorage.removeItem('hd_session'); updateNav(); }

// ---------------------- Auth UI / Nav ----------------------
function updateNav(){
  const s = getSession();
  if(!s){
    navActions.innerHTML = `<button class="btn btn-sm btn-outline-light" onclick="routeTo('#/login')">Sign in</button>`;
  } else {
    navActions.innerHTML = `
      <div class="d-flex align-items-center gap-3">
        <span class="small-muted">${s.email} • <em>${s.role}</em></span>
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-light dropdown-toggle" data-bs-toggle="dropdown">Account</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="#" onclick="routeTo('#/profile')">Profile</a></li>
            <li><a class="dropdown-item" href="#" onclick="logout()">Logout</a></li>
          </ul>
        </div>
      </div>`;
  }
}
updateNav();

// ---------------------- Router ----------------------
function routeTo(hash){
  location.hash = hash;
  render();
}
window.addEventListener('hashchange', render);

// ---------------------- Utilities ----------------------
function getUserName(id){ const u = store.users.find(x=>x.id===id); return u?u.name:'—'; }
function byId(tid){ return store.tickets.find(t=>t.id===tid); }
function pushEvent(ticketId, actorId, type, data){
  const ev = { id: uId(), ticketId, actorId, type, data, created_at: nowISO() };
  store.events.push(ev);
  saveStore();
  return ev;
}
function formatDate(iso){ return new Date(iso).toLocaleString(); }

// ---------------------- SLA detection (runs every 5s) ----------------------
function detectSLA(){
  const now = Date.now();
  let changed = false;
  store.tickets.forEach(t=>{
    if(t.sla_due){
      const due = new Date(t.sla_due).getTime();
      if(!t.is_breached && due <= now){
        t.is_breached = true;
        pushEvent(t.id,null,'sla_breached',{due:t.sla_due});
        changed = true;
      } else if(t.is_breached && due > now){
        // not expected, but handle toggles
        t.is_breached = false; changed = true;
      }
    }
  });
  if(changed) saveStore();
}
setInterval(()=>{ detectSLA(); updateCountdowns(); }, 5000);

// ---------------------- Renderers ----------------------
function render(){
  updateNav();
  const s = getSession();
  const hash = location.hash || '#/dashboard';
  if(!s && !hash.startsWith('#/login')) return routeTo('#/login');
  if(hash.startsWith('#/login')) return renderLogin();
  if(hash.startsWith('#/dashboard') || hash === '' || hash === '#/') return renderDashboard();
  if(hash.startsWith('#/tickets/new')) return renderNewTicket();
  if(hash.startsWith('#/tickets/')) {
    const m = hash.match(/#\/tickets\/(\d+)/);
    if(m) return renderTicketDetail(Number(m[1]));
    return renderTicketsList();
  }
  if(hash.startsWith('#/tickets')) return renderTicketsList();
  if(hash.startsWith('#/profile')) return renderProfile();
  // fallback
  renderDashboard();
}

// --------- Login ----------
function renderLogin(){
  appEl.innerHTML = `
    <div class="app-card mx-auto" style="max-width:520px;">
      <div class="header-row">
        <div>
          <h3 style="margin:0">Welcome back</h3>
          <div class="small-muted">Sign in to your HelpDesk demo</div>
        </div>
      </div>
      <div class="mt-3">
        <label class="form-label small-muted">Email</label>
        <input id="li_email" class="form-control form-control-lg" placeholder="admin@mail.com" value="admin@mail.com"/>
        <label class="form-label small-muted mt-2">Password</label>
        <input id="li_pass" type="password" class="form-control form-control-lg" placeholder="admin123" value="admin123"/>
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-accent flex-grow-1" onclick="doLogin()">Sign in</button>
          <button class="btn btn-outline-light" onclick="seedDemo()">Reset Demo</button>
        </div>
        <div class="footer-note">Demo accounts: admin@mail.com/admin123 (admin), agent@mail.com/agent123 (agent), user@mail.com/user123 (user)</div>
      </div>
    </div>`;
}

function doLogin(){
  const email = document.getElementById('li_email').value.trim();
  const pass = document.getElementById('li_pass').value;
  if(store.creds[email] && store.creds[email] === pass){
    // find user record or create
    let user = store.users.find(u=>u.email === email);
    if(!user){
      user = { id: uId(), name: email.split('@')[0], email, role: 'user' };
      store.users.push(user); saveStore();
    }
    setSession({ userId: user.id, email: user.email, role: user.role });
    routeTo('#/dashboard');
  } else {
    alert('Invalid credentials (demo).');
  }
}

function logout(){ clearSession(); routeTo('#/login'); }

// --------- Dashboard ----------
function renderDashboard(){
  const tickets = store.tickets.slice().sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
  const total = tickets.length;
  const breached = tickets.filter(t=>t.is_breached).length;
  const open = tickets.filter(t=>t.status==='open').length;
  const assigned = tickets.filter(t=>t.assignee_id).length;

  appEl.innerHTML = `
    <div class="app-card">
      <div class="header-row">
        <div>
          <h4 style="margin:0">Dashboard</h4>
          <div class="small-muted">Overview — quick actions & KPI</div>
        </div>
        <div class="ms-auto d-flex gap-2">
          <button class="btn btn-sm btn-light" onclick="routeTo('#/tickets')">View Tickets</button>
          <button class="btn btn-sm btn-accent" onclick="routeTo('#/tickets/new')">+ New Ticket</button>
        </div>
      </div>

      <div class="row g-3 mt-3">
        <div class="col-md-3"><div class="kpi app-card text-center"><div class="small-muted">Total</div><h3>${total}</h3></div></div>
        <div class="col-md-3"><div class="kpi app-card text-center"><div class="small-muted">Open</div><h3>${open}</h3></div></div>
        <div class="col-md-3"><div class="kpi app-card text-center"><div class="small-muted">Assigned</div><h3>${assigned}</h3></div></div>
        <div class="col-md-3"><div class="kpi app-card text-center"><div class="small-muted">Breached</div><h3 class="text-danger">${breached}</h3></div></div>
      </div>

      <div class="row mt-4">
        <div class="col-md-7">
          <h5>Recent Tickets</h5>
          ${tickets.slice(0,6).map(tpl_ticket_card).join('')}
        </div>
        <div class="col-md-5">
          <h5>Timeline (latest events)</h5>
          <div class="timeline">
            ${store.events.slice(-8).reverse().map(e=>`<div class="small-muted mb-2"><strong>${e.type}</strong> — ${e.data?.msg || ''} <span class="small-muted">• ${formatDate(e.created_at)}</span></div>`).join('') || '<div class="small-muted">No events yet</div>'}
          </div>
        </div>
      </div>
    </div>`;
  updateCountdowns();
}

// helper to render a ticket summary card
function tpl_ticket_card(t){
  const breached = t.is_breached ? `<span class="badge-breach ms-2">BREACHED</span>` : '';
  const assignee = t.assignee_id ? getUserName(t.assignee_id) : 'Unassigned';
  return `<div class="ticket-card p-2 mb-2 ${t.is_breached?'breached':''}">
    <div class="d-flex justify-content-between">
      <div>
        <strong>${escapeHtml(t.title)}</strong>
        <div class="small-muted">${escapeHtml(t.description).slice(0,140)}</div>
        <div class="small-muted mt-1">Assignee: ${assignee} • Priority: ${t.priority} • ${formatDate(t.created_at)}</div>
      </div>
      <div class="text-end">
        ${breached}
        <div class="pill mt-2">${t.status}</div>
        <div class="small-muted mt-2" id="countdown-${t.id}">Due: ${t.sla_due ? formatDate(t.sla_due) : '—'}</div>
        <div class="mt-2">
          <button class="btn btn-sm btn-outline-light" onclick="routeTo('#/tickets/${t.id}')">Open</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ------------- Tickets list with search/filter/pagination -------------
function renderTicketsList(){
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const search = q.get('q') || '';
  const status = q.get('status') || 'any';
  const page = Number(q.get('page') || 1);
  const limit = 8;

  // filter
  let items = store.tickets.slice().sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
  if(search) {
    const s = search.toLowerCase();
    items = items.filter(t => (t.title + ' ' + t.description + ' ' + (t.latest_comment_text||'')).toLowerCase().includes(s));
  }
  if(status !== 'any') items = items.filter(t => t.status === status);

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total/limit));
  const pageItems = items.slice((page-1)*limit, page*limit);

  appEl.innerHTML = `
    <div class="app-card">
      <div class="header-row">
        <div>
          <h4 style="margin:0">Tickets</h4>
          <div class="small-muted">Search, filter & manage tickets</div>
        </div>
        <div class="ms-auto d-flex gap-2">
          <input id="q_search" class="form-control form-control-sm search-input" placeholder="Search title/description/comment" value="${escapeHtml(search)}" style="min-width:280px"/>
          <select id="q_status" class="form-select form-select-sm" style="width:140px">
            <option value="any"${status==='any'?' selected':''}>All</option>
            <option value="open"${status==='open'?' selected':''}>Open</option>
            <option value="pending"${status==='pending'?' selected':''}>Pending</option>
            <option value="resolved"${status==='resolved'?' selected':''}>Resolved</option>
            <option value="closed"${status==='closed'?' selected':''}>Closed</option>
          </select>
          <button class="btn btn-accent btn-sm" id="btnSearch">Search</button>
        </div>
      </div>

      <div class="mt-3">
        ${pageItems.map(tpl_ticket_card).join('') || '<div class="small-muted">No tickets found</div>'}
      </div>

      <div class="d-flex justify-content-between align-items-center mt-3">
        <div class="small-muted">Showing ${pageItems.length} of ${total} tickets</div>
        <div>
          <button class="btn btn-sm btn-outline-light me-1" ${page<=1?'disabled':''} onclick="gotoPage(${page-1})">Prev</button>
          <span class="small-muted">Page ${page} / ${pages}</span>
          <button class="btn btn-sm btn-outline-light ms-1" ${page>=pages?'disabled':''} onclick="gotoPage(${page+1})">Next</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnSearch').addEventListener('click', ()=>{
    const s = document.getElementById('q_search').value.trim();
    const st = document.getElementById('q_status').value;
    routeTo(`#/tickets?q=${encodeURIComponent(s)}&status=${encodeURIComponent(st)}&page=1`);
  });
}

function gotoPage(p){ const q = new URLSearchParams(location.hash.split('?')[1] || ''); q.set('page', String(p)); routeTo('#/tickets?' + q.toString()); }

// ------------- Create new ticket -------------
function renderNewTicket(){
  appEl.innerHTML = `
    <div class="app-card mx-auto" style="max-width:760px">
      <h4>Create Ticket</h4>
      <label class="small-muted">Title</label><input id="t_title" class="form-control"/>
      <label class="small-muted mt-2">Description</label><textarea id="t_desc" class="form-control" rows="4"></textarea>
      <div class="d-flex gap-2 mt-2">
        <select id="t_priority" class="form-select" style="width:150px">
          <option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
        </select>
        <input id="t_slahours" type="number" class="form-control" style="width:120px" value="24"/>
        <div class="flex-grow-1"></div>
        <button class="btn btn-accent" onclick="createTicket()">Create</button>
        <button class="btn btn-outline-light" onclick="routeTo('#/tickets')">Cancel</button>
      </div>
    </div>
  `;
}

function createTicket(){
  const title = document.getElementById('t_title').value.trim();
  const desc = document.getElementById('t_desc').value.trim();
  if(!title) return alert('Title required');
  const pr = document.getElementById('t_priority').value;
  const sla_h = Number(document.getElementById('t_slahours').value) || 24;
  const created = nowISO();
  const due = new Date(Date.now() + sla_h * 3600 * 1000).toISOString();
  const id = uId();
  const s = getSession();
  const ticket = {
    id, title, description: desc, requester_id: s.userId, assignee_id: null, status: 'open',
    priority: pr, created_at: created, updated_at: created, version: 1,
    sla_hours: sla_h, sla_due: due, sla_due_iso: due, sla_due_readable: new Date(due).toString(),
    is_breached: false, comments: [], latest_comment_text: ''
  };
  store.tickets.push(ticket);
  pushEvent(id, s.userId, 'created', { msg: `${s.email} created ticket "${title}"` });
  saveStore();
  routeTo('#/tickets');
}

// ------------- Ticket detail (comments, timeline, edit, assign) -------------
function renderTicketDetail(ticketId){
  const t = byId(ticketId);
  if(!t) return routeTo('#/tickets');
  const s = getSession();
  const canAssign = s.role === 'admin' || s.role === 'agent';
  const canEdit = s.role === 'admin' || (s.role==='agent' && (t.assignee_id === s.userId || !t.assignee_id));
  const assigneeName = t.assignee_id ? getUserName(t.assignee_id) : 'Unassigned';
  appEl.innerHTML = `
    <div class="app-card mx-auto" style="max-width:980px">
      <div class="d-flex justify-content-between">
        <div>
          <h4 style="margin:0">${escapeHtml(t.title)} ${t.is_breached?'<span class="badge-breach ms-2">BREACHED</span>':''}</h4>
          <div class="small-muted">#${t.id} • Priority: ${t.priority} • Created: ${formatDate(t.created_at)}</div>
        </div>
        <div class="text-end">
          <div id="cd_countdown" class="small-muted">Due: ${t.sla_due? formatDate(t.sla_due) : '—'}</div>
          <div class="mt-2">
            <button class="btn btn-sm btn-outline-light" onclick="simulateExternalUpdate(${t.id})">Simulate external change</button>
            <button class="btn btn-sm btn-accent" onclick="openEditModal(${t.id})">Edit</button>
          </div>
        </div>
      </div>

      <hr/>
      <div class="row">
        <div class="col-md-8">
          <h6>Description</h6>
          <div class="app-card mb-3">${escapeHtml(t.description)}</div>

          <h6>Comments</h6>
          <div id="comments_area">${t.comments.map(c=>`<div class="comment"><strong>${escapeHtml(c.author_name)}</strong> <span class="small-muted">• ${formatDate(c.created_at)}</span><div>${escapeHtml(c.body)}</div></div>`).join('') || '<div class="small-muted">No comments</div>'}</div>

          <div class="mt-2">
            <textarea id="comment_body" class="form-control" rows="3" placeholder="Add a comment..."></textarea>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-accent" onclick="addComment(${t.id})">Add Comment</button>
              <button class="btn btn-outline-light" onclick="routeTo('#/tickets')">Back</button>
            </div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="app-card">
            <h6>Details</h6>
            <div class="small-muted">Requester: ${getUserName(t.requester_id)}</div>
            <div class="small-muted">Assignee: <strong id="assignee_name">${escapeHtml(assigneeName)}</strong></div>
            <div class="small-muted">Status: <strong id="status_text">${escapeHtml(t.status)}</strong></div>
            <div class="small-muted">Version: <strong id="ver_text">${t.version}</strong></div>

            <hr/>
            <h6>Actions</h6>
            <div class="d-flex flex-column gap-2">
              ${canAssign? `<select id="assign_to" class="form-select">${store.users.map(u=>`<option value="${u.id}" ${u.id===t.assignee_id?'selected':''}>${escapeHtml(u.name)} (${escapeHtml(u.role)})</option>`) .join('')}</select><button class="btn btn-sm btn-outline-light" onclick="assignTicket(${t.id})">Assign</button>` : `<div class="small-muted">Assign: (agents/admins only)</div>`}
              <select id="status_sel" class="form-select">
                <option value="open"${t.status==='open'?' selected':''}>Open</option>
                <option value="pending"${t.status==='pending'?' selected':''}>Pending</option>
                <option value="resolved"${t.status==='resolved'?' selected':''}>Resolved</option>
                <option value="closed"${t.status==='closed'?' selected':''}>Closed</option>
              </select>
              <button class="btn btn-sm btn-accent" onclick="patchTicket(${t.id})">Save changes (PATCH)</button>
              <div class="small-muted">Optimistic locking: if the ticket changed elsewhere you'll get a 409 conflict UI.</div>
            </div>
          </div>

          <div class="mt-3 app-card">
            <h6>Timeline</h6>
            <div>${store.events.filter(e=>e.ticketId===t.id).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(ev=>`<div class="small-muted mb-2"><strong>${ev.type}</strong> • ${escapeHtml(ev.data?.msg || '')} <div class="small-muted">${formatDate(ev.created_at)}</div></div>`).join('') || '<div class="small-muted">No timeline events</div>'}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  startCountdownFor(t.id);
}

// ------------ Edit modal (optimistic patch) ------------
function openEditModal(ticketId){
  const t = byId(ticketId);
  if(!t) return;
  const modalId = 'modal_edit';
  modals.innerHTML = `
    <div class="modal fade" id="${modalId}" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title">Edit Ticket #${t.id}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <label class="small-muted">Title</label>
            <input id="m_title" class="form-control" value="${escapeHtml(t.title)}"/>
            <label class="small-muted mt-2">Description</label>
            <textarea id="m_desc" class="form-control" rows="4">${escapeHtml(t.description)}</textarea>
            <div class="d-flex gap-2 mt-2">
              <select id="m_priority" class="form-select" style="width:160px">
                <option value="low"${t.priority==='low'?' selected':''}>Low</option>
                <option value="medium"${t.priority==='medium'?' selected':''}>Medium</option>
                <option value="high"${t.priority==='high'?' selected':''}>High</option>
                <option value="urgent"${t.priority==='urgent'?' selected':''}>Urgent</option>
              </select>
              <input id="m_sla" type="number" class="form-control" style="width:120px" value="${t.sla_hours||24}"/>
              <div class="flex-grow-1"></div>
              <button class="btn btn-accent" onclick="applyPatch(${t.id})">Apply</button>
            </div>
            <div class="small-muted mt-2">Client version: <strong id="m_version">${t.version}</strong></div>
          </div>
        </div>
      </div>
    </div>
  `;
  const bsModal = new bootstrap.Modal(document.getElementById(modalId));
  bsModal.show();
}

// Apply patch modal -> call optimisticPatchTicket
function applyPatch(ticketId){
  const t = byId(ticketId);
  const newTitle = document.getElementById('m_title').value.trim();
  const newDesc = document.getElementById('m_desc').value.trim();
  const newPriority = document.getElementById('m_priority').value;
  const newSlaHours = Number(document.getElementById('m_sla').value) || 24;
  const clientVer = Number(document.getElementById('m_version').textContent);
  const payload = { title: newTitle, description: newDesc, priority: newPriority, sla_hours: newSlaHours };

  const res = optimisticPatchTicket(ticketId, payload, clientVer);
  if(res.error){
    if(res.code===409){
      alert('Conflict: ticket changed since you fetched it. Opening fresh ticket view.');
      routeTo('#/tickets/' + ticketId);
    } else alert('Error: ' + res.message);
  } else {
    alert('Saved (version ' + res.version + ')');
    const modalEl = document.querySelector('#modal_edit');
    bootstrap.Modal.getInstance(modalEl).hide();
    routeTo('#/tickets/' + ticketId);
  }
}

// optimistic patch simulation
function optimisticPatchTicket(ticketId, changes, clientVersion){
  const t = byId(ticketId);
  if(!t) return { error:true, message:'not found' };
  // if client provided version enforce
  if(typeof clientVersion === 'number'){
    if(clientVersion !== t.version) return { error:true, code:409, message:'stale_update', current_version: t.version };
  }
  // apply changes & bump version
  t.version = (t.version||1) + 1;
  t.updated_at = nowISO();
  if('title' in changes) t.title = changes.title;
  if('description' in changes) t.description = changes.description;
  if('priority' in changes) t.priority = changes.priority;
  if('sla_hours' in changes){
    t.sla_hours = changes.sla_hours;
    t.sla_due = new Date(new Date(t.created_at).getTime() + t.sla_hours*3600*1000).toISOString();
    t.is_breached = (new Date() > new Date(t.sla_due));
  }
  pushEvent(t.id, getSession().userId, 'updated', { msg: `${getSession().email} updated ticket` });
  saveStore();
  return { error:false, version: t.version };
}

// simulate external update to cause a 409 for demo
function simulateExternalUpdate(ticketId){
  const t = byId(ticketId);
  if(!t) return;
  t.version = (t.version||1) + 1;
  t.description = t.description + '\n\n[External edit simulated]';
  pushEvent(t.id, null, 'external_update', { msg: 'External system updated ticket' });
  saveStore();
  alert('External update applied (this will cause conflict if you try to save an old version).');
  routeTo('#/tickets/' + ticketId);
}

// ------------ Comments & assign & patch button -------------
function addComment(ticketId){
  const body = document.getElementById('comment_body').value.trim();
  if(!body) return alert('Add a comment first');
  const s = getSession();
  const t = byId(ticketId);
  const comment = { id: uId(), author_id: s.userId, author_name: s.email, body, created_at: nowISO() };
  t.comments.push(comment);
  t.latest_comment_text = body;
  t.updated_at = nowISO();
  pushEvent(ticketId, s.userId, 'comment_added', { msg: `${s.email} commented` });
  saveStore();
  routeTo('#/tickets/' + ticketId);
}

function assignTicket(ticketId){
  const t = byId(ticketId);
  const uid = Number(document.getElementById('assign_to').value);
  t.assignee_id = uid;
  t.updated_at = nowISO();
  pushEvent(ticketId, getSession().userId, 'assigned', { msg: `${getSession().email} assigned to ${getUserName(uid)}` });
  saveStore();
  routeTo('#/tickets/' + ticketId);
}

function patchTicket(ticketId){
  const t = byId(ticketId);
  const newStatus = document.getElementById('status_sel').value;
  const clientVer = t.version; // in real world client would send its version
  // simulate optimistic patch using version check
  const res = optimisticPatchTicket(ticketId, { }, clientVer); // no content changes except version bump
  if(res.error){
    if(res.code===409){
      alert('Conflict detected — ticket modified elsewhere.');
      routeTo('#/tickets/' + ticketId);
      return;
    }
  }
  // now apply status change (bump version again)
  t.status = newStatus;
  t.updated_at = nowISO();
  pushEvent(ticketId, getSession().userId, 'status_changed', { msg: `Status -> ${newStatus}` });
  saveStore();
  routeTo('#/tickets/' + ticketId);
}

// -------- Profile page -------------
function renderProfile(){
  const s = getSession();
  const user = store.users.find(u=>u.id===s.userId) || {name:s.email,email:s.email,role:s.role};
  appEl.innerHTML = `
    <div class="app-card mx-auto" style="max-width:560px">
      <h4>Profile</h4>
      <div class="small-muted">Name: ${escapeHtml(user.name)}</div>
      <div class="small-muted">Email: ${escapeHtml(user.email)}</div>
      <div class="small-muted">Role: ${escapeHtml(user.role)}</div>
      <div class="mt-3"><button class="btn btn-outline-light" onclick="routeTo('#/dashboard')">Back</button></div>
    </div>
  `;
}

// --------- Countdown helpers ---------
function startCountdownFor(ticketId){
  updateCountdowns(); // immediate
}
function updateCountdowns(){
  // update all countdown labels
  store.tickets.forEach(t=>{
    const el = document.getElementById(`countdown-${t.id}`);
    if(el){
      if(!t.sla_due){ el.textContent = 'Due: —'; return; }
      const now = Date.now(), due = new Date(t.sla_due).getTime(), diff = due - now;
      if(diff <= 0){
        el.textContent = 'Due: BREACHED';
      } else {
        const hh = Math.floor(diff/3600000), mm = Math.floor((diff%3600000)/60000), ss = Math.floor((diff%60000)/1000);
        el.textContent = `Due in ${hh}h ${mm}m ${ss}s`;
      }
    }
    // also update ticket detail countdown id cd_countdown
    const cd = document.getElementById('cd_countdown');
    if(cd && t.id === Number(location.hash.split('/')[2])){ // if viewing this ticket
      const now = Date.now(), due = t.sla_due ? new Date(t.sla_due).getTime() : null;
      if(!due) cd.textContent = 'Due: —';
      else if(due <= now) cd.innerHTML = 'Due: <span class="badge-breach">BREACHED</span>';
      else {
        const diff = due - now;
        const hh = Math.floor(diff/3600000), mm = Math.floor((diff%3600000)/60000), ss = Math.floor((diff%60000)/1000);
        cd.textContent = `Due in ${hh}h ${mm}m ${ss}s`;
      }
    }
  });
}

// ---------- Demo reset ----------
function seedDemo(){
  store.tickets = [
    { id: 1001, title:'Cannot login', description:'Mobile login fails with error 401', requester_id:3, assignee_id:2, status:'open', priority:'high', created_at: nowISO(), updated_at: nowISO(), version:1, sla_hours:4, sla_due: new Date(Date.now()+4*3600*1000).toISOString(), is_breached:false, comments:[], latest_comment_text:'' },
    { id: 1002, title:'Payment timeout', description:'Payment intermittently times out', requester_id:3, assignee_id:null, status:'open', priority:'urgent', created_at: nowISO(), updated_at: nowISO(), version:1, sla_hours:1, sla_due: new Date(Date.now()+3600*1000).toISOString(), is_breached:false, comments:[], latest_comment_text:'' },
    { id: 1003, title:'Feature: CSV export', description:'Add CSV export to reports', requester_id:3, assignee_id:2, status:'pending', priority:'low', created_at: nowISO(), updated_at: nowISO(), version:1, sla_hours:72, sla_due: new Date(Date.now()+72*3600*1000).toISOString(), is_breached:false, comments:[], latest_comment_text:'' }
  ];
  store.events = [
    { id: uId(), ticketId:1001, actorId:3, type:'created', data:{ msg:'Ticket created' }, created_at: nowISO() }
  ];
  saveStore();
  alert('Demo seeded.');
  routeTo('#/dashboard');
}

// ---------------------- Helpers ----------------------
function escapeHtml(s){ if(!s) return ''; return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

// --------- Initialization: if no tickets seed demo small set ----------
if(!store.tickets || store.tickets.length===0) seedDemo();
render();
updateNav();
updateCountdowns();
