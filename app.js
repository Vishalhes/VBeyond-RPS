/* ================================================================
   VBeyond Recruiter Intelligence Platform — app.js
   © VBeyond Corporation · Created by Vishal Tiwari
   ================================================================ */

/* ── CONFIG ──────────────────────────────────────────────── */
const SUPA_URL = 'https://hgljfrmblmhpdwdqjrwo.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbGpmcm1ibG1ocGR3ZHFqcndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjY5MDIsImV4cCI6MjA5NTY0MjkwMn0.q1t-lP7ZO5bJW54lb2qgN68qMFF2IjVbfUi7B__NPMU';
const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/* ── STATE ───────────────────────────────────────────────── */
let allLI = null, allIN = null;
let liFiltered = [], inFiltered = [];
let currentPortal = null;
let liPage = 'team', inPage = 'team';
let liLeadMetric = 'active', liRecMetric = 'inmails';
let inAvpMetric = 'resumes', inLeadMetric = 'resumes', inRecMetric = 'resumes';
let showAll = { liLeads: false, liRecs: false, inAvps: false, inLeads: false, inRecs: false };
let activeMonths = new Set(['ALL']);
let charts = {};
const msState = { team: new Set(), ops: new Set() };
let lastActivity = parseInt(localStorage.getItem('vb_act') || Date.now());

/* ── SESSION TIMEOUT (30 MIN) ────────────────────────────── */
const MS_LI = {
  team: { btnId:'ms-btn',  lblId:'ms-label',  allChkId:'ms-all-chk',  dropId:'ms-drop',  itemClass:'ms-team-item', defaultLabel:'All Teams' },
  ops:  { btnId:'ops-btn', lblId:'ops-label', allChkId:'ops-all-chk', dropId:'ops-drop', itemClass:'ms-ops-item',  defaultLabel:'All OPS'   }
};
const MLABELS_LI = { active:'Active Days', profiles:'Profiles Viewed', searches:'Searches', inmails:'InMails Sent', acc:'Acceptance Rate %' };
const MLABELS_IN = { resumes:'Resumes Viewed', searches:'Searches', contacts:'Contacts Used', resp:'Response Rate %', pos:'Positive Response Rate %' };

function resetActivity() {
  lastActivity = Date.now();
  localStorage.setItem('vb_act', lastActivity);
}
['mousedown','keydown','touchstart','scroll'].forEach(e => document.addEventListener(e, resetActivity, { passive: true }));

setInterval(() => {
  const screen = currentPortal ? 'dashboard' : (document.getElementById('portal-screen').style.display !== 'none' ? 'portal' : 'login');
  if (screen !== 'login' && Date.now() - lastActivity > TIMEOUT_MS) {
    handleAutoLogout();
  }
  // Warn at 28 min
  if (screen !== 'login' && Date.now() - lastActivity > TIMEOUT_MS - 2*60*1000) {
    document.getElementById('timeout-banner').classList.add('show');
  } else {
    document.getElementById('timeout-banner').classList.remove('show');
  }
}, 30000);



/* ── SCREENS ─────────────────────────────────────────────── */
function showScreen(s) {
  document.getElementById('login-screen').style.display    = s === 'login'  ? 'flex' : 'none';
  document.getElementById('portal-screen').style.display   = s === 'portal' ? 'flex' : 'none';
  const dash = document.getElementById('dashboard-screen');
  if (s === 'dashboard') {
    dash.style.display = 'flex';
    dash.style.flexDirection = 'column';
    dash.style.height = '100vh';
  } else {
    dash.style.display = 'none';
    // Hide all dashboard sub-panels
    ['li-tab-bar','in-tab-bar','dash-filter','dash-loading','li-dash','in-dash']
      .forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; });
  }
  if (s === 'login') { document.getElementById('btn-login').textContent = 'Sign In →'; document.getElementById('btn-login').disabled = false; }
}

/* ── AUTH ────────────────────────────────────────────────── */
async function handleLogin() {
  const email = document.getElementById('inp-email').value.trim();
  const pass  = document.getElementById('inp-pass').value;
  const btn   = document.getElementById('btn-login');
  document.getElementById('login-error').style.display = 'none';
  if (!email || !pass) { showErr('Please enter email and password.'); return; }
  btn.textContent = 'Signing in…'; btn.disabled = true;
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showErr(error.message || 'Login failed.'); btn.textContent = 'Sign In →'; btn.disabled = false; return; }
  setupUser(data.user);
  resetActivity();
  showScreen('portal');
}

async function handleLogout() {
  await sb.auth.signOut();
  allLI = null; allIN = null; currentPortal = null;
  Object.values(charts).forEach(c => c?.destroy()); charts = {};
  showScreen('login');
}

async function handleAutoLogout() {
  await sb.auth.signOut();
  allLI = null; allIN = null; currentPortal = null;
  Object.values(charts).forEach(c => c?.destroy()); charts = {};
  showScreen('login');
  // Show expired message on login
  const errEl = document.getElementById('login-error');
  if (errEl) { errEl.textContent = 'Session expired due to inactivity. Please sign in again.'; errEl.style.display = 'block'; }
}

function setupUser(user) {
  const name = user.email.split('@')[0];
  document.getElementById('nav-avatar').textContent = name.slice(0, 2).toUpperCase();
  document.getElementById('nav-uname').textContent  = user.email;
}

function showErr(m) { const e = document.getElementById('login-error'); e.textContent = m; e.style.display = 'block'; }

function goToPortalSelection() {
  currentPortal = null;
  // Destroy all charts to avoid stale instances
  Object.values(charts).forEach(c => c?.destroy()); charts = {};
  showScreen('portal');
}

/* ── PORTAL SELECTION ────────────────────────────────────── */
async function selectPortal(portal) {
  currentPortal = portal;
  resetActivity();

  // Update navbar title
  document.getElementById('nav-portal-label').textContent =
    portal === 'linkedin' ? 'LinkedIn Recruiter Usage Report' : 'Indeed Recruiter Usage Report';

  showScreen('dashboard');
  document.getElementById('dash-loading').style.display = 'flex';
  document.getElementById('li-dash').style.display = 'none';
  document.getElementById('in-dash').style.display = 'none';

  // Lazy load data
  if (portal === 'linkedin' && !allLI) {
    const { data, error } = await sb.from('team_lead_performance').select('*');
    if (error) { showDashError(error.message); return; }
    allLI = data || [];
  }
  if (portal === 'indeed' && !allIN) {
    const { data, error } = await sb.from('indeed_usage_report').select('*');
    if (error) { showDashError(error.message); return; }
    allIN = (data || []).map(r => ({ ...r, _resp: parseRate(r.response_rate), _pos: parseRate(r.positive_response_rate) }));
  }

  // Reset filter state
  activeMonths = new Set(['ALL']);
  msState.team.clear(); msState.ops.clear();
  showAll = { liLeads: false, liRecs: false, inAvps: false, inLeads: false, inRecs: false };

  // Show/hide OPS filter (LinkedIn only)
  const showOps = portal === 'linkedin';
  document.getElementById('ops-fgrp').style.display    = showOps ? 'flex' : 'none';
  document.getElementById('ops-fdiv').style.display    = showOps ? 'block' : 'none';

  // Build filter chips & dropdowns
  const srcData = portal === 'linkedin' ? allLI : allIN;
  buildChips(srcData);
  buildMSDropdown('team', srcData);
  if (portal === 'linkedin') buildMSDropdown('ops', allLI);
  else { msState.ops.clear(); }
  updateMSUI('team'); updateMSUI('ops');

  // ── CRITICAL FIX: Show dashboard containers BEFORE rendering charts ──
  // Charts need visible DOM to calculate dimensions correctly
  document.getElementById('dash-loading').style.display = 'none';
  document.getElementById('dash-filter').style.display = 'block';

  if (portal === 'linkedin') {
    document.getElementById('li-tab-bar').style.display = 'flex';
    document.getElementById('in-tab-bar').style.display = 'none';
    document.getElementById('li-dash').style.display = 'block';
    document.getElementById('in-dash').style.display = 'none';
  } else {
    document.getElementById('li-tab-bar').style.display = 'none';
    document.getElementById('in-tab-bar').style.display = 'flex';
    document.getElementById('li-dash').style.display = 'none';
    document.getElementById('in-dash').style.display = 'block';
  }

  // Use requestAnimationFrame to ensure DOM layout is complete before charts render
  requestAnimationFrame(() => { applyFilters(); });
}

function showDashError(msg) {
  document.getElementById('dash-loading').innerHTML =
    `<div style="text-align:center;color:var(--text2)"><div style="font-size:28px;margin-bottom:10px">⚠️</div>
     <div style="font-family:'Syne',sans-serif;font-size:15px;color:var(--text);margin-bottom:5px">Data load failed</div>
     <div style="font-size:11px">${msg}</div></div>`;
}

/* ── MULTI-SELECT GENERIC ────────────────────────────────── */
function buildMSDropdown(key, srcData) {
  const cfg = MS_LI[key];
  if (!cfg) return;
  const vals = [...new Set(srcData.map(r => r[key]).filter(Boolean))].sort();
  const drop = document.getElementById(cfg.dropId);
  drop.querySelectorAll('.' + cfg.itemClass).forEach(el => el.remove());
  vals.forEach(v => {
    const d = document.createElement('div');
    d.className = 'ms-item ' + cfg.itemClass;
    d.dataset.val = v;
    d.onclick = () => msToggleItem(key, v);
    d.innerHTML = `<div class="ms-chk on">✓</div><span>${v}</span>`;
    drop.appendChild(d);
  });
}

function toggleDropdown(key, e) {
  e.stopPropagation();
  const cfg = MS_LI[key]; if (!cfg) return;
  const isOpen = document.getElementById(cfg.dropId).classList.contains('open');
  closeAllDropdowns();
  if (!isOpen) { document.getElementById(cfg.btnId).classList.add('open'); document.getElementById(cfg.dropId).classList.add('open'); }
}

function closeAllDropdowns() {
  document.querySelectorAll('.ms-drop.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.ms-btn.open').forEach(b => b.classList.remove('open'));
}

function msSelectAll(key) { msState[key].clear(); resetShowAll(); updateMSUI(key); applyFilters(); }
function msToggleItem(key, val) { msState[key].has(val) ? msState[key].delete(val) : msState[key].add(val); resetShowAll(); updateMSUI(key); applyFilters(); }

function updateMSUI(key) {
  const cfg = MS_LI[key]; if (!cfg) return;
  const s = msState[key];
  const lbl = document.getElementById(cfg.lblId);
  const btn = document.getElementById(cfg.btnId);
  const allChk = document.getElementById(cfg.allChkId);
  if (!lbl || !btn || !allChk) return;
  if (s.size === 0) { lbl.textContent = cfg.defaultLabel; btn.classList.remove('sel'); allChk.classList.add('on'); allChk.textContent = '✓'; }
  else if (s.size === 1) { lbl.textContent = [...s][0]; btn.classList.add('sel'); allChk.classList.remove('on'); allChk.textContent = ''; }
  else { lbl.innerHTML = `${[...s][0]} <span class="ms-count">+${s.size-1}</span>`; btn.classList.add('sel'); allChk.classList.remove('on'); allChk.textContent = ''; }
  document.querySelectorAll('.' + cfg.itemClass).forEach(el => {
    const chk = el.querySelector('.ms-chk');
    const on = s.size === 0 || s.has(el.dataset.val);
    chk.classList.toggle('on', on); chk.textContent = on ? '✓' : '';
  });
}

document.addEventListener('click', e => { if (!e.target.closest('.ms-wrap')) closeAllDropdowns(); });

/* ── FILTERS ─────────────────────────────────────────────── */
function buildChips(srcData) {
  const ms = [...new Set(srcData.map(r => r.month).filter(Boolean))]
    .sort((a, b) => monthIdx(a) - monthIdx(b));
  const w = document.getElementById('month-chips'); w.innerHTML = '';
  const a = document.createElement('button');
  a.className = 'chip all active'; a.textContent = 'ALL';
  a.onclick = () => toggleMonth('ALL'); w.appendChild(a);
  ms.forEach(m => {
    const c = document.createElement('button');
    c.className = 'chip'; c.textContent = m; c.dataset.m = m;
    c.onclick = () => toggleMonth(m); w.appendChild(c);
  });
}

function toggleMonth(m) {
  if (m === 'ALL') { activeMonths = new Set(['ALL']); }
  else { activeMonths.delete('ALL'); activeMonths.has(m) ? activeMonths.delete(m) : activeMonths.add(m); if (!activeMonths.size) activeMonths = new Set(['ALL']); }
  document.querySelectorAll('#month-chips .chip').forEach(c => c.classList.toggle('active', activeMonths.has(c.dataset.m || 'ALL')));
  resetShowAll(); applyFilters();
}

function applyFilters() {
  if (currentPortal === 'linkedin') {
    liFiltered = activeMonths.has('ALL') ? [...allLI] : allLI.filter(r => activeMonths.has(r.month));
    renderLIPage();
  } else if (currentPortal === 'indeed') {
    inFiltered = activeMonths.has('ALL') ? [...allIN] : allIN.filter(r => activeMonths.has(r.month));
    renderINPage();
  }
}

function liPageData() {
  let d = liFiltered;
  if (msState.team.size > 0) d = d.filter(r => msState.team.has(r.team));
  if (msState.ops.size  > 0) d = d.filter(r => msState.ops.has(r.ops));
  return d;
}

function inPageData() {
  let d = inFiltered;
  if (msState.team.size > 0) d = d.filter(r => msState.team.has(r.team));
  return d;
}

function resetShowAll() { Object.keys(showAll).forEach(k => showAll[k] = false); }

/* ── PAGE SWITCH ─────────────────────────────────────────── */
function switchLIPage(p) {
  liPage = p;
  ['team','lead','recruiter','monthly'].forEach(x => {
    document.getElementById(`li-page-${x}`).style.display = x === p ? 'block' : 'none';
    document.getElementById(`li-tab-${x}`).classList.toggle('active', x === p);
  });
  renderLIPage();
}

function switchINPage(p) {
  inPage = p;
  ['team','avp','lead','recruiter','monthly'].forEach(x => {
    document.getElementById(`in-page-${x}`).style.display = x === p ? 'block' : 'none';
    document.getElementById(`in-tab-${x}`).classList.toggle('active', x === p);
  });
  renderINPage();
}

function renderLIPage() {
  if (liPage === 'team')      renderLITeam();
  else if (liPage === 'lead') renderLILead();
  else if (liPage === 'recruiter') renderLIRec();
  else renderLIMonthly();
}

function renderINPage() {
  if (inPage === 'team')      renderINTeam();
  else if (inPage === 'avp')  renderINAvp();
  else if (inPage === 'lead') renderINLead();
  else if (inPage === 'recruiter') renderINRec();
  else renderINMonthly();
}

/* ── SHARED AGGREGATION HELPERS ──────────────────────────── */
const grp  = (data, key) => data.reduce((a, r) => { const k = r[key] || 'Unknown'; if (!a[k]) a[k] = []; a[k].push(r); return a; }, {});
const sumK = (arr, k) => arr.reduce((a, r) => a + (parseFloat(r[k]) || 0), 0);
const avgK = (arr, k) => arr.length ? sumK(arr, k) / arr.length : 0;
const avgRateK = (arr, k) => arr.length ? arr.reduce((a, r) => a + parseRate(r[k]), 0) / arr.length : 0;
const parseRate = v => typeof v === 'number' ? v : parseFloat(String(v || '0').replace('%','')) || 0;
const monthIdx = m => { const s = String(m || '').slice(0,3).toUpperCase(); const i = MONTHS.indexOf(s); return i >= 0 ? i : 99; };
const rC = v => v >= 50 ? 'r-hi' : v >= 25 ? 'r-mid' : 'r-lo';

/* ── LINKEDIN AGGREGATION ────────────────────────────────── */
function getLITeamStats() {
  return Object.entries(grp(liPageData(), 'team')).map(([team, rows]) => ({
    team, ops: [...new Set(rows.map(r => r.ops).filter(Boolean))].join(', '),
    recruiters: new Set(rows.map(r => r.seat_holder)).size,
    inmails: sumK(rows,'inmails_sent'), resp: avgK(rows,'inmail_response_rate'),
    acc: avgK(rows,'inmail_acceptance_rate'), active: sumK(rows,'active_days'),
    profiles: sumK(rows,'profiles_viewed'), searches: sumK(rows,'searches_performed'), jobs: sumK(rows,'jobs_posted')
  })).sort((a,b) => b.inmails - a.inmails);
}

function getLILeadStats() {
  return Object.entries(grp(liPageData(), 'lead')).map(([lead, rows]) => ({
    lead, team: rows[0]?.team||'—', ops: rows[0]?.ops||'—',
    active: sumK(rows,'active_days'), profiles: sumK(rows,'profiles_viewed'), searches: sumK(rows,'searches_performed'),
    inmails: sumK(rows,'inmails_sent'), acc: avgK(rows,'inmail_acceptance_rate'), resp: avgK(rows,'inmail_response_rate')
  }));
}

function getLIRecStats() {
  const leadNames = new Set(liPageData().map(r => r.lead).filter(Boolean));
  return Object.entries(grp(liPageData(), 'seat_holder'))
    .filter(([n]) => !leadNames.has(n))
    .map(([name, rows]) => ({
      name, team: rows[0]?.team||'—', lead: rows[0]?.lead||'—', ops: rows[0]?.ops||'—',
      active: sumK(rows,'active_days'), profiles: sumK(rows,'profiles_viewed'), searches: sumK(rows,'searches_performed'),
      inmails: sumK(rows,'inmails_sent'), acc: avgK(rows,'inmail_acceptance_rate'), resp: avgK(rows,'inmail_response_rate')
    }));
}

function getLIMonthly() {
  const data = liPageData();
  return [...new Set(data.map(r => r.month).filter(Boolean))].sort((a,b) => monthIdx(a)-monthIdx(b)).map(m => {
    const rows = data.filter(r => r.month === m);
    return { month:m, inmails:sumK(rows,'inmails_sent'), active:sumK(rows,'active_days'),
      profiles:sumK(rows,'profiles_viewed'), searches:sumK(rows,'searches_performed'), jobs:sumK(rows,'jobs_posted'),
      resp:avgK(rows,'inmail_response_rate'), acc:avgK(rows,'inmail_acceptance_rate'), dec:avgK(rows,'inmail_decline_rate') };
  });
}

/* ── INDEED AGGREGATION ──────────────────────────────────── */
function getINTeamStats() {
  return Object.entries(grp(inPageData(), 'team')).map(([team, rows]) => ({
    team, avps: new Set(rows.map(r=>r.avp)).size, leads: new Set(rows.map(r=>r.lead)).size,
    recruiters: new Set(rows.map(r=>r.name)).size,
    searches: sumK(rows,'searches'), resumes: sumK(rows,'resumes_viewed'),
    contacts: sumK(rows,'contacts_used'), resp: avgRateK(rows,'response_rate'), pos: avgRateK(rows,'positive_response_rate')
  })).sort((a,b) => b.resumes - a.resumes);
}

function getINAvpStats() {
  return Object.entries(grp(inPageData(), 'avp')).map(([avp, rows]) => ({
    avp, team: rows[0]?.team||'—',
    leads: new Set(rows.map(r=>r.lead)).size, recruiters: new Set(rows.map(r=>r.name)).size,
    searches: sumK(rows,'searches'), resumes: sumK(rows,'resumes_viewed'),
    contacts: sumK(rows,'contacts_used'), resp: avgRateK(rows,'response_rate'), pos: avgRateK(rows,'positive_response_rate')
  }));
}

function getINLeadStats() {
  const avpNames = new Set(inPageData().map(r=>r.avp).filter(Boolean));
  return Object.entries(grp(inPageData(), 'lead'))
    .filter(([n]) => !avpNames.has(n))
    .map(([lead, rows]) => ({
      lead, team: rows[0]?.team||'—', avp: rows[0]?.avp||'—',
      searches: sumK(rows,'searches'), resumes: sumK(rows,'resumes_viewed'),
      contacts: sumK(rows,'contacts_used'), resp: avgRateK(rows,'response_rate'), pos: avgRateK(rows,'positive_response_rate')
    }));
}

function getINRecStats() {
  const avpNames  = new Set(inPageData().map(r=>r.avp).filter(Boolean));
  const leadNames = new Set(inPageData().map(r=>r.lead).filter(Boolean));
  return Object.entries(grp(inPageData(), 'name'))
    .filter(([n]) => !avpNames.has(n) && !leadNames.has(n))
    .map(([name, rows]) => ({
      name, team: rows[0]?.team||'—', lead: rows[0]?.lead||'—', avp: rows[0]?.avp||'—',
      searches: sumK(rows,'searches'), resumes: sumK(rows,'resumes_viewed'),
      contacts: sumK(rows,'contacts_used'), resp: avgRateK(rows,'response_rate'), pos: avgRateK(rows,'positive_response_rate')
    }));
}

function getINMonthly() {
  const data = inPageData();
  return [...new Set(data.map(r=>r.month).filter(Boolean))].sort((a,b)=>monthIdx(a)-monthIdx(b)).map(m => {
    const rows = data.filter(r=>r.month===m);
    return { month:m, searches:sumK(rows,'searches'), resumes:sumK(rows,'resumes_viewed'),
      contacts:sumK(rows,'contacts_used'), resp:avgRateK(rows,'response_rate'),
      pos:avgRateK(rows,'positive_response_rate'), responses:sumK(rows,'responses'),
      pos_responses:sumK(rows,'positive_responses') };
  });
}

/* ── KPI RENDERER ────────────────────────────────────────── */
function renderKPIs(id, cards) {
  document.getElementById(id).innerHTML = cards.map((c,i) => `
    <div class="kpi ${c.color}">
      <div class="kpi-lbl">${c.label}</div>
      <div class="kpi-val" style="animation-delay:${i*.06}s">${c.val}</div>
      <div class="kpi-sub">${c.sub}</div>
      <div class="kpi-icon">${c.icon}</div>
    </div>`).join('');
}

/* ── CHART HELPERS ───────────────────────────────────────── */
const CF={family:'DM Mono',size:10.5},CG={color:'rgba(24,36,56,.9)',drawBorder:false},CT='#3A5270',CL='#7A96B8';
function killChart(id){if(charts[id]){charts[id].destroy();delete charts[id];}}

function horizBar(id,labels,datasets){
  killChart(id);
  charts[id]=new Chart(document.getElementById(id),{type:'bar',
    data:{labels,datasets:datasets.map(d=>({label:d.label,data:d.data,backgroundColor:d.bg,borderColor:d.bc,borderWidth:1,borderRadius:4,borderSkipped:false}))},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:CL,font:CF,boxWidth:10,padding:14}},tooltip:{mode:'index',intersect:false}},
      scales:{x:{ticks:{color:CT,font:CF},grid:CG,beginAtZero:true},y:{ticks:{color:CT,font:CF,maxRotation:0},grid:CG}}}});
}
function vertBar(id,labels,datasets){
  killChart(id);
  charts[id]=new Chart(document.getElementById(id),{type:'bar',
    data:{labels,datasets:datasets.map(d=>({label:d.label,data:d.data,backgroundColor:d.bg,borderColor:d.bc,borderWidth:1,borderRadius:5,borderSkipped:false}))},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:CL,font:CF,boxWidth:10,padding:14}}},
      scales:{x:{ticks:{color:CT,font:CF},grid:CG},y:{ticks:{color:CT,font:CF},grid:CG,beginAtZero:true}}}});
}
function lineChart(id,labels,datasets){
  killChart(id);
  charts[id]=new Chart(document.getElementById(id),{type:'line',
    data:{labels,datasets:datasets.map(d=>({label:d.label,data:d.data,borderColor:d.color,backgroundColor:d.fill,borderWidth:2.5,pointRadius:5,pointHoverRadius:7,fill:true,tension:0.4,pointBackgroundColor:d.color}))},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:CL,font:CF,boxWidth:10,padding:14}},tooltip:{mode:'index',intersect:false}},
      scales:{x:{ticks:{color:CT,font:CF},grid:CG},y:{ticks:{color:CT,font:CF},grid:CG,beginAtZero:true}}}});
}

/* ── LINKEDIN PAGE RENDERERS ─────────────────────────────── */
function renderLITeam(){
  const s=getLITeamStats(),n=s.length;
  const tot=k=>s.reduce((a,x)=>a+(x[k]||0),0),avg=k=>n?tot(k)/n:0;
  renderKPIs('li-team-kpis',[
    {label:'Total Teams',val:n,sub:'active teams',color:'c-blue',icon:'🏢'},
    {label:'InMails Sent',val:tot('inmails').toLocaleString(),sub:'total outreach',color:'c-cyan',icon:'✉️'},
    {label:'Avg Response Rate',val:avg('resp').toFixed(1)+'%',sub:'across teams',color:'c-green',icon:'💬'},
    {label:'Profiles Viewed',val:tot('profiles').toLocaleString(),sub:'total views',color:'c-amber',icon:'👁️'},
    {label:'Total Active Days',val:tot('active').toLocaleString(),sub:'combined',color:'c-violet',icon:'📅'},
    {label:'Top Team',val:s[0]?.team||'—',sub:'by InMails sent',color:'c-red',icon:'🏆'},
  ]);
  const L=s.map(x=>x.team);
  horizBar('li-ch-t-inmail',L,[{label:'InMails Sent',data:s.map(x=>x.inmails),bg:'rgba(10,102,194,.65)',bc:'rgba(10,102,194,.9)'}]);
  horizBar('li-ch-t-resp',L,[{label:'Avg Response Rate %',data:s.map(x=>parseFloat(x.resp.toFixed(1))),bg:'rgba(16,185,129,.6)',bc:'rgba(16,185,129,.85)'}]);
  horizBar('li-ch-t-act',L,[
    {label:'Profiles Viewed',data:s.map(x=>x.profiles),bg:'rgba(245,158,11,.55)',bc:'rgba(245,158,11,.8)'},
    {label:'Searches',data:s.map(x=>x.searches),bg:'rgba(34,211,238,.45)',bc:'rgba(34,211,238,.7)'}]);
  document.getElementById('li-team-count').textContent=`${n} teams`;
  document.getElementById('li-team-tbody').innerHTML=s.map(x=>`<tr>
    <td><span class="badge-team">${x.team}</span></td><td><span class="badge-ops">${x.ops||'—'}</span></td>
    <td class="mono">${x.recruiters}</td><td class="mono">${x.inmails.toLocaleString()}</td>
    <td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td><td class="mono ${rC(x.acc)}">${x.acc.toFixed(1)}%</td>
    <td class="mono">${x.active}</td><td class="mono">${x.profiles.toLocaleString()}</td>
    <td class="mono">${x.searches}</td><td class="mono">${x.jobs}</td></tr>`).join('');
}

function setLILeadMetric(m){
  liLeadMetric=m;
  document.querySelectorAll('#li-lead-msel .mtab').forEach((b,i)=>b.classList.toggle('active',['active','profiles','searches'][i]===m));
  renderLILeadRank();
}
function renderLILead(){
  const s=getLILeadStats(),n=s.length;
  if(!n){renderKPIs('li-lead-kpis',[{label:'No Data',val:'—',sub:'adjust filters',color:'c-blue',icon:'📊'}]);return;}
  const avg=k=>s.reduce((a,x)=>a+(x[k]||0),0)/n;
  renderKPIs('li-lead-kpis',[
    {label:'Total Leads',val:n,sub:'active leads',color:'c-blue',icon:'👔'},
    {label:'Avg Active Days',val:avg('active').toFixed(1),sub:'per lead',color:'c-cyan',icon:'📅'},
    {label:'Avg Profiles Viewed',val:Math.round(avg('profiles')),sub:'per lead',color:'c-green',icon:'👁️'},
    {label:'Avg InMails Sent',val:Math.round(avg('inmails')),sub:'per lead',color:'c-amber',icon:'✉️'},
    {label:'Avg Acceptance Rate',val:avg('acc').toFixed(1)+'%',sub:'conversion avg',color:'c-violet',icon:'✅'},
    {label:'Top Lead',val:[...s].sort((a,b)=>b.active-a.active)[0]?.lead.split(' ')[0]||'—',sub:'most active',color:'c-red',icon:'🏆'},
  ]);
  renderLILeadRank();
  renderLILeadTable(s);
}
function renderLILeadRank(){
  const s=getLILeadStats();if(!s.length)return;
  const sorted=[...s].sort((a,b)=>b[liLeadMetric]-a[liLeadMetric]),mx=sorted[0]?.[liLeadMetric]||1;
  document.getElementById('li-lead-lbl-top').textContent=MLABELS_LI[liLeadMetric];
  document.getElementById('li-lead-lbl-bot').textContent=MLABELS_LI[liLeadMetric];
  rankList('li-rl-top',sorted.slice(0,10),liLeadMetric,mx,false,x=>`${x.team} · ${x.ops}`,liLeadMetric==='acc');
  rankList('li-rl-bot',sorted.slice(-10).reverse(),liLeadMetric,mx,true,x=>`${x.team} · ${x.ops}`,liLeadMetric==='acc');
}
function renderLILeadTable(s){
  const data=s||getLILeadStats(),sorted=[...data].sort((a,b)=>b[liLeadMetric]-a[liLeadMetric]);
  const rows=showAll.liLeads?sorted:sorted.slice(0,10);
  document.getElementById('li-lead-count').textContent=`${data.length} leads total`;
  document.getElementById('li-lead-show').textContent=showAll.liLeads?'Hide':`Show All (${data.length})`;
  document.getElementById('li-lead-tbody').innerHTML=rows.map(x=>`<tr>
    <td>${x.lead}</td><td><span class="badge-team">${x.team}</span></td><td><span class="badge-ops">${x.ops}</span></td>
    <td class="mono">${x.active}</td><td class="mono">${x.profiles.toLocaleString()}</td>
    <td class="mono">${x.searches}</td><td class="mono">${x.inmails}</td>
    <td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td><td class="mono ${rC(x.acc)}">${x.acc.toFixed(1)}%</td></tr>`).join('');
}
function toggleLILeadTable(){showAll.liLeads=!showAll.liLeads;renderLILeadTable();}

function setLIRecMetric(m){
  liRecMetric=m;
  const keys=['inmails','acc','active','profiles','searches'];
  document.querySelectorAll('#li-rec-msel .mtab').forEach((b,i)=>b.classList.toggle('active',keys[i]===m));
  renderLIRecRank();
}
function renderLIRec(){
  const s=getLIRecStats(),n=s.length;
  if(!n){renderKPIs('li-rec-kpis',[{label:'No Data',val:'—',sub:'adjust filters',color:'c-blue',icon:'📊'}]);return;}
  const avg=k=>s.reduce((a,x)=>a+(x[k]||0),0)/n;
  renderKPIs('li-rec-kpis',[
    {label:'Total Recruiters',val:n,sub:'excl. leads',color:'c-blue',icon:'🧑‍💼'},
    {label:'Total InMails',val:s.reduce((a,x)=>a+x.inmails,0).toLocaleString(),sub:'combined',color:'c-cyan',icon:'✉️'},
    {label:'Avg Acceptance Rate',val:avg('acc').toFixed(1)+'%',sub:'conversion avg',color:'c-green',icon:'✅'},
    {label:'Avg Active Days',val:avg('active').toFixed(1),sub:'per recruiter',color:'c-amber',icon:'📅'},
    {label:'Avg Profiles Viewed',val:Math.round(avg('profiles')),sub:'per recruiter',color:'c-violet',icon:'👁️'},
    {label:'Top Recruiter',val:[...s].sort((a,b)=>b.inmails-a.inmails)[0]?.name.split(' ')[0]||'—',sub:'most InMails',color:'c-red',icon:'🏆'},
  ]);
  renderLIRecRank();
  renderLIRecTable(s);
}
function renderLIRecRank(){
  const s=getLIRecStats();if(!s.length)return;
  const sorted=[...s].sort((a,b)=>b[liRecMetric]-a[liRecMetric]),mx=sorted[0]?.[liRecMetric]||1;
  document.getElementById('li-rec-lbl-top').textContent=MLABELS_LI[liRecMetric];
  document.getElementById('li-rec-lbl-bot').textContent=MLABELS_LI[liRecMetric];
  rankList('li-rr-top',sorted.slice(0,10),liRecMetric,mx,false,x=>`${x.team} · ${x.ops}`,liRecMetric==='acc');
  rankList('li-rr-bot',sorted.slice(-10).reverse(),liRecMetric,mx,true,x=>`${x.team} · ${x.ops}`,liRecMetric==='acc');
}
function renderLIRecTable(s){
  const data=s||getLIRecStats(),sorted=[...data].sort((a,b)=>b[liRecMetric]-a[liRecMetric]);
  const rows=showAll.liRecs?sorted:sorted.slice(0,10);
  document.getElementById('li-rec-count').textContent=`${data.length} recruiters total`;
  document.getElementById('li-rec-show').textContent=showAll.liRecs?'Hide':`Show All (${data.length})`;
  document.getElementById('li-rec-tbody').innerHTML=rows.map(x=>`<tr>
    <td>${x.name}</td><td><span class="badge-team">${x.team}</span></td><td><span class="badge-ops">${x.ops}</span></td>
    <td>${x.lead}</td><td class="mono">${x.active}</td><td class="mono">${x.profiles.toLocaleString()}</td>
    <td class="mono">${x.searches}</td><td class="mono">${x.inmails}</td>
    <td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td><td class="mono ${rC(x.acc)}">${x.acc.toFixed(1)}%</td></tr>`).join('');
}
function toggleLIRecTable(){showAll.liRecs=!showAll.liRecs;renderLIRecTable();}

function renderLIMonthly(){
  const s=getLIMonthly(),n=s.length;
  if(!n){['li-ch-m-inmails','li-ch-m-active','li-ch-m-profiles','li-ch-m-searches'].forEach(killChart);return;}
  const tot=k=>s.reduce((a,x)=>a+(x[k]||0),0),avg=k=>tot(k)/n;
  const peak=[...s].sort((a,b)=>b.inmails-a.inmails)[0]?.month||'—';
  renderKPIs('li-monthly-kpis',[
    {label:'Months Tracked',val:n,sub:'data periods',color:'c-blue',icon:'📆'},
    {label:'Total InMails',val:tot('inmails').toLocaleString(),sub:'all periods',color:'c-cyan',icon:'✉️'},
    {label:'Avg Monthly InMails',val:Math.round(avg('inmails')),sub:'per month',color:'c-green',icon:'📊'},
    {label:'Peak Month',val:peak,sub:'highest outreach',color:'c-amber',icon:'🏆'},
    {label:'Total Profiles',val:tot('profiles').toLocaleString(),sub:'all periods',color:'c-violet',icon:'👁️'},
    {label:'Avg Acceptance Rate',val:avg('acc').toFixed(1)+'%',sub:'monthly avg',color:'c-red',icon:'✅'},
  ]);
  const L=s.map(x=>x.month);
  lineChart('li-ch-m-inmails',L,[{label:'InMails Sent',data:s.map(x=>x.inmails),color:'#0A66C2',fill:'rgba(10,102,194,0.07)'}]);
  vertBar('li-ch-m-active',L,[{label:'Active Days',data:s.map(x=>x.active),bg:'rgba(124,58,237,.65)',bc:'rgba(124,58,237,.9)'}]);
  vertBar('li-ch-m-profiles',L,[{label:'Profiles Viewed',data:s.map(x=>x.profiles),bg:'rgba(245,158,11,.55)',bc:'rgba(245,158,11,.8)'}]);
  vertBar('li-ch-m-searches',L,[{label:'Searches',data:s.map(x=>x.searches),bg:'rgba(34,211,238,.45)',bc:'rgba(34,211,238,.7)'}]);
  document.getElementById('li-monthly-count').textContent=`${n} months`;
  document.getElementById('li-monthly-tbody').innerHTML=s.map(x=>`<tr>
    <td class="mono" style="font-weight:600;color:var(--blue3)">${x.month}</td>
    <td class="mono">${x.inmails.toLocaleString()}</td><td class="mono">${x.active}</td>
    <td class="mono">${x.profiles.toLocaleString()}</td><td class="mono">${x.searches}</td>
    <td class="mono">${x.jobs}</td><td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td>
    <td class="mono ${rC(x.acc)}">${x.acc.toFixed(1)}%</td><td class="mono ${rC(x.dec,true)}">${x.dec.toFixed(1)}%</td></tr>`).join('');
}

/* ── INDEED PAGE RENDERERS ───────────────────────────────── */
function renderINTeam(){
  const s=getINTeamStats(),n=s.length;
  const tot=k=>s.reduce((a,x)=>a+(x[k]||0),0),avg=k=>n?tot(k)/n:0;
  renderKPIs('in-team-kpis',[
    {label:'Total Teams',val:n,sub:'active teams',color:'c-indeed',icon:'🏢'},
    {label:'Total Resumes Viewed',val:tot('resumes').toLocaleString(),sub:'all teams',color:'c-cyan',icon:'📄'},
    {label:'Total Searches',val:tot('searches').toLocaleString(),sub:'combined',color:'c-green',icon:'🔍'},
    {label:'Contacts Used',val:tot('contacts').toLocaleString(),sub:'total outreach',color:'c-amber',icon:'📬'},
    {label:'Avg Response Rate',val:avg('resp').toFixed(1)+'%',sub:'across teams',color:'c-violet',icon:'💬'},
    {label:'Top Team',val:s[0]?.team||'—',sub:'by resumes viewed',color:'c-red',icon:'🏆'},
  ]);
  const L=s.map(x=>x.team);
  horizBar('in-ch-t-resumes',L,[{label:'Resumes Viewed',data:s.map(x=>x.resumes),bg:'rgba(37,87,167,.65)',bc:'rgba(37,87,167,.9)'}]);
  horizBar('in-ch-t-contacts',L,[{label:'Contacts Used',data:s.map(x=>x.contacts),bg:'rgba(107,163,224,.55)',bc:'rgba(107,163,224,.8)'}]);
  horizBar('in-ch-t-resp',L,[{label:'Avg Response Rate %',data:s.map(x=>parseFloat(x.resp.toFixed(1))),bg:'rgba(16,185,129,.6)',bc:'rgba(16,185,129,.85)'}]);
  document.getElementById('in-team-count').textContent=`${n} teams`;
  document.getElementById('in-team-tbody').innerHTML=s.map(x=>`<tr>
    <td><span class="badge-team">${x.team}</span></td>
    <td class="mono">${x.avps}</td><td class="mono">${x.leads}</td><td class="mono">${x.recruiters}</td>
    <td class="mono">${x.searches.toLocaleString()}</td><td class="mono">${x.resumes.toLocaleString()}</td>
    <td class="mono">${x.contacts.toLocaleString()}</td>
    <td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td>
    <td class="mono ${rC(x.pos)}">${x.pos.toFixed(1)}%</td></tr>`).join('');
}

function setINAvpMetric(m){
  inAvpMetric=m;
  const keys=['resumes','searches','contacts','resp','pos'];
  document.querySelectorAll('#in-avp-msel .mtab').forEach((b,i)=>b.classList.toggle('active',keys[i]===m));
  renderINAvpRank();
}
function renderINAvp(){
  const s=getINAvpStats(),n=s.length;
  if(!n){renderKPIs('in-avp-kpis',[{label:'No Data',val:'—',sub:'adjust filters',color:'c-indeed',icon:'📊'}]);return;}
  const avg=k=>s.reduce((a,x)=>a+(x[k]||0),0)/n;
  renderKPIs('in-avp-kpis',[
    {label:'Total AVPs',val:n,sub:'assistant VPs',color:'c-indeed',icon:'🎯'},
    {label:'Avg Resumes Viewed',val:Math.round(avg('resumes')),sub:'per AVP',color:'c-cyan',icon:'📄'},
    {label:'Avg Contacts Used',val:Math.round(avg('contacts')),sub:'per AVP',color:'c-green',icon:'📬'},
    {label:'Avg Response Rate',val:avg('resp').toFixed(1)+'%',sub:'avg',color:'c-amber',icon:'💬'},
    {label:'Avg Pos. Response',val:avg('pos').toFixed(1)+'%',sub:'positive avg',color:'c-violet',icon:'✅'},
    {label:'Top AVP',val:[...s].sort((a,b)=>b.resumes-a.resumes)[0]?.avp.split(' ')[0]||'—',sub:'most resumes',color:'c-red',icon:'🏆'},
  ]);
  renderINAvpRank();
  renderINAvpTable(s);
}
function renderINAvpRank(){
  const s=getINAvpStats();if(!s.length)return;
  const sorted=[...s].sort((a,b)=>b[inAvpMetric]-a[inAvpMetric]),mx=sorted[0]?.[inAvpMetric]||1;
  const isPct=inAvpMetric==='resp'||inAvpMetric==='pos';
  document.getElementById('in-avp-lbl-top').textContent=MLABELS_IN[inAvpMetric];
  document.getElementById('in-avp-lbl-bot').textContent=MLABELS_IN[inAvpMetric];
  rankList('in-avp-top',sorted.slice(0,10),inAvpMetric,mx,false,x=>x.team,isPct,'avp');
  rankList('in-avp-bot',sorted.slice(-10).reverse(),inAvpMetric,mx,true,x=>x.team,isPct,'avp');
}
function renderINAvpTable(s){
  const data=s||getINAvpStats(),sorted=[...data].sort((a,b)=>b[inAvpMetric]-a[inAvpMetric]);
  const rows=showAll.inAvps?sorted:sorted.slice(0,10);
  document.getElementById('in-avp-count').textContent=`${data.length} AVPs total`;
  document.getElementById('in-avp-show').textContent=showAll.inAvps?'Hide':`Show All (${data.length})`;
  document.getElementById('in-avp-tbody').innerHTML=rows.map(x=>`<tr>
    <td>${x.avp}</td><td><span class="badge-team">${x.team}</span></td>
    <td class="mono">${x.leads}</td><td class="mono">${x.recruiters}</td>
    <td class="mono">${x.searches.toLocaleString()}</td><td class="mono">${x.resumes.toLocaleString()}</td>
    <td class="mono">${x.contacts.toLocaleString()}</td>
    <td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td>
    <td class="mono ${rC(x.pos)}">${x.pos.toFixed(1)}%</td></tr>`).join('');
}
function toggleINAvpTable(){showAll.inAvps=!showAll.inAvps;renderINAvpTable();}

function setINLeadMetric(m){
  inLeadMetric=m;
  const keys=['resumes','searches','contacts','resp','pos'];
  document.querySelectorAll('#in-lead-msel .mtab').forEach((b,i)=>b.classList.toggle('active',keys[i]===m));
  renderINLeadRank();
}
function renderINLead(){
  const s=getINLeadStats(),n=s.length;
  if(!n){renderKPIs('in-lead-kpis',[{label:'No Data',val:'—',sub:'adjust filters',color:'c-indeed',icon:'📊'}]);return;}
  const avg=k=>s.reduce((a,x)=>a+(x[k]||0),0)/n;
  renderKPIs('in-lead-kpis',[
    {label:'Total Leads',val:n,sub:'excl. AVPs',color:'c-indeed',icon:'👔'},
    {label:'Avg Resumes Viewed',val:Math.round(avg('resumes')),sub:'per lead',color:'c-cyan',icon:'📄'},
    {label:'Avg Contacts Used',val:Math.round(avg('contacts')),sub:'per lead',color:'c-green',icon:'📬'},
    {label:'Avg Searches',val:Math.round(avg('searches')),sub:'per lead',color:'c-amber',icon:'🔍'},
    {label:'Avg Response Rate',val:avg('resp').toFixed(1)+'%',sub:'avg',color:'c-violet',icon:'💬'},
    {label:'Top Lead',val:[...s].sort((a,b)=>b.resumes-a.resumes)[0]?.lead.split(' ')[0]||'—',sub:'most resumes',color:'c-red',icon:'🏆'},
  ]);
  renderINLeadRank();
  renderINLeadTable(s);
}
function renderINLeadRank(){
  const s=getINLeadStats();if(!s.length)return;
  const sorted=[...s].sort((a,b)=>b[inLeadMetric]-a[inLeadMetric]),mx=sorted[0]?.[inLeadMetric]||1;
  const isPct=inLeadMetric==='resp'||inLeadMetric==='pos';
  document.getElementById('in-lead-lbl-top').textContent=MLABELS_IN[inLeadMetric];
  document.getElementById('in-lead-lbl-bot').textContent=MLABELS_IN[inLeadMetric];
  rankList('in-lead-top',sorted.slice(0,10),inLeadMetric,mx,false,x=>`${x.team} · ${x.avp}`,isPct,'lead');
  rankList('in-lead-bot',sorted.slice(-10).reverse(),inLeadMetric,mx,true,x=>`${x.team} · ${x.avp}`,isPct,'lead');
}
function renderINLeadTable(s){
  const data=s||getINLeadStats(),sorted=[...data].sort((a,b)=>b[inLeadMetric]-a[inLeadMetric]);
  const rows=showAll.inLeads?sorted:sorted.slice(0,10);
  document.getElementById('in-lead-count').textContent=`${data.length} leads total`;
  document.getElementById('in-lead-show').textContent=showAll.inLeads?'Hide':`Show All (${data.length})`;
  document.getElementById('in-lead-tbody').innerHTML=rows.map(x=>`<tr>
    <td>${x.lead}</td><td><span class="badge-team">${x.team}</span></td><td><span class="badge-avp">${x.avp}</span></td>
    <td class="mono">${x.searches.toLocaleString()}</td><td class="mono">${x.resumes.toLocaleString()}</td>
    <td class="mono">${x.contacts.toLocaleString()}</td>
    <td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td>
    <td class="mono ${rC(x.pos)}">${x.pos.toFixed(1)}%</td></tr>`).join('');
}
function toggleINLeadTable(){showAll.inLeads=!showAll.inLeads;renderINLeadTable();}

function setINRecMetric(m){
  inRecMetric=m;
  const keys=['resumes','searches','contacts','resp','pos'];
  document.querySelectorAll('#in-rec-msel .mtab').forEach((b,i)=>b.classList.toggle('active',keys[i]===m));
  renderINRecRank();
}
function renderINRec(){
  const s=getINRecStats(),n=s.length;
  if(!n){renderKPIs('in-rec-kpis',[{label:'No Data',val:'—',sub:'adjust filters',color:'c-indeed',icon:'📊'}]);return;}
  const avg=k=>s.reduce((a,x)=>a+(x[k]||0),0)/n;
  renderKPIs('in-rec-kpis',[
    {label:'Total Recruiters',val:n,sub:'excl. AVPs & Leads',color:'c-indeed',icon:'🧑‍💼'},
    {label:'Total Contacts Used',val:s.reduce((a,x)=>a+x.contacts,0).toLocaleString(),sub:'combined',color:'c-cyan',icon:'📬'},
    {label:'Avg Response Rate',val:avg('resp').toFixed(1)+'%',sub:'avg',color:'c-green',icon:'💬'},
    {label:'Avg Pos. Response',val:avg('pos').toFixed(1)+'%',sub:'positive avg',color:'c-amber',icon:'✅'},
    {label:'Avg Resumes Viewed',val:Math.round(avg('resumes')),sub:'per recruiter',color:'c-violet',icon:'📄'},
    {label:'Top Recruiter',val:[...s].sort((a,b)=>b.resumes-a.resumes)[0]?.name.split(' ')[0]||'—',sub:'most resumes',color:'c-red',icon:'🏆'},
  ]);
  renderINRecRank();
  renderINRecTable(s);
}
function renderINRecRank(){
  const s=getINRecStats();if(!s.length)return;
  const sorted=[...s].sort((a,b)=>b[inRecMetric]-a[inRecMetric]),mx=sorted[0]?.[inRecMetric]||1;
  const isPct=inRecMetric==='resp'||inRecMetric==='pos';
  document.getElementById('in-rec-lbl-top').textContent=MLABELS_IN[inRecMetric];
  document.getElementById('in-rec-lbl-bot').textContent=MLABELS_IN[inRecMetric];
  rankList('in-rec-top',sorted.slice(0,10),inRecMetric,mx,false,x=>`${x.team} · ${x.lead}`,isPct,'name');
  rankList('in-rec-bot',sorted.slice(-10).reverse(),inRecMetric,mx,true,x=>`${x.team} · ${x.lead}`,isPct,'name');
}
function renderINRecTable(s){
  const data=s||getINRecStats(),sorted=[...data].sort((a,b)=>b[inRecMetric]-a[inRecMetric]);
  const rows=showAll.inRecs?sorted:sorted.slice(0,10);
  document.getElementById('in-rec-count').textContent=`${data.length} recruiters total`;
  document.getElementById('in-rec-show').textContent=showAll.inRecs?'Hide':`Show All (${data.length})`;
  document.getElementById('in-rec-tbody').innerHTML=rows.map(x=>`<tr>
    <td>${x.name}</td><td><span class="badge-team">${x.team}</span></td><td><span class="badge-avp">${x.avp}</span></td>
    <td>${x.lead}</td><td class="mono">${x.searches.toLocaleString()}</td><td class="mono">${x.resumes.toLocaleString()}</td>
    <td class="mono">${x.contacts.toLocaleString()}</td>
    <td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td>
    <td class="mono ${rC(x.pos)}">${x.pos.toFixed(1)}%</td></tr>`).join('');
}
function toggleINRecTable(){showAll.inRecs=!showAll.inRecs;renderINRecTable();}

function renderINMonthly(){
  const s=getINMonthly(),n=s.length;
  if(!n){['in-ch-m-resumes','in-ch-m-searches','in-ch-m-contacts'].forEach(killChart);return;}
  const tot=k=>s.reduce((a,x)=>a+(x[k]||0),0),avg=k=>tot(k)/n;
  const peak=[...s].sort((a,b)=>b.resumes-a.resumes)[0]?.month||'—';
  renderKPIs('in-monthly-kpis',[
    {label:'Months Tracked',val:n,sub:'data periods',color:'c-indeed',icon:'📆'},
    {label:'Total Resumes Viewed',val:tot('resumes').toLocaleString(),sub:'all periods',color:'c-cyan',icon:'📄'},
    {label:'Total Contacts Used',val:tot('contacts').toLocaleString(),sub:'all periods',color:'c-green',icon:'📬'},
    {label:'Peak Month',val:peak,sub:'most resumes viewed',color:'c-amber',icon:'🏆'},
    {label:'Avg Response Rate',val:avg('resp').toFixed(1)+'%',sub:'monthly avg',color:'c-violet',icon:'💬'},
    {label:'Avg Pos. Response',val:avg('pos').toFixed(1)+'%',sub:'monthly avg',color:'c-red',icon:'✅'},
  ]);
  const L=s.map(x=>x.month);
  lineChart('in-ch-m-resumes',L,[{label:'Resumes Viewed',data:s.map(x=>x.resumes),color:'#2557A7',fill:'rgba(37,87,167,0.07)'}]);
  vertBar('in-ch-m-searches',L,[{label:'Searches',data:s.map(x=>x.searches),bg:'rgba(34,211,238,.45)',bc:'rgba(34,211,238,.7)'}]);
  vertBar('in-ch-m-contacts',L,[{label:'Contacts Used',data:s.map(x=>x.contacts),bg:'rgba(107,163,224,.55)',bc:'rgba(107,163,224,.8)'}]);
  document.getElementById('in-monthly-count').textContent=`${n} months`;
  document.getElementById('in-monthly-tbody').innerHTML=s.map(x=>`<tr>
    <td class="mono" style="font-weight:600;color:var(--indeed2)">${x.month}</td>
    <td class="mono">${x.searches.toLocaleString()}</td><td class="mono">${x.resumes.toLocaleString()}</td>
    <td class="mono">${x.contacts.toLocaleString()}</td><td class="mono">${x.responses}</td>
    <td class="mono">${x.pos_responses}</td>
    <td class="mono ${rC(x.resp)}">${x.resp.toFixed(1)}%</td>
    <td class="mono ${rC(x.pos)}">${x.pos.toFixed(1)}%</td></tr>`).join('');
}

/* ── RANK LIST ───────────────────────────────────────────── */
function rankList(id,items,key,maxV,isBot,metaFn,isPct=false,nameKey='lead'){
  const el=document.getElementById(id);
  if(!items.length){el.innerHTML='<div class="no-data">No data available</div>';return;}
  el.innerHTML=items.map((item,i)=>{
    const rank=i+1,val=item[key]||0;
    const disp=isPct?val.toFixed(1)+'%':val.toLocaleString();
    const pct=maxV?Math.max(5,(val/maxV)*100):5;
    const name=item[nameKey]||item.lead||item.avp||item.name||'—';
    const bc=isBot?'rb-b':(rank===1?'rb-1':rank===2?'rb-2':rank===3?'rb-3':'rb-n');
    return `<div class="rank-item">
      <div class="rb ${bc}">${rank}</div>
      <div class="rank-info"><div class="rank-name">${name}</div><div class="rank-meta">${metaFn(item)}</div></div>
      <div class="rank-val">${disp}</div>
      <div class="bar-wrap"><div class="${isBot?'bar-bot':'bar-top'}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

/* ── CSV EXPORT ──────────────────────────────────────────── */
function exportCSV(){
  const data = currentPortal === 'linkedin' ? liFiltered : inFiltered;
  if(!data.length){alert('No data to export.');return;}
  let H,K;
  if(currentPortal==='linkedin'){
    H=['Month','OPS','Team','Lead','Seat Holder','Jobs Posted','Active Days','Profiles Viewed','Projects Created','Searches','InMails Sent','Response Rate','Acceptance Rate','Decline Rate'];
    K=['month','ops','team','lead','seat_holder','jobs_posted','active_days','profiles_viewed','projects_created','searches_performed','inmails_sent','inmail_response_rate','inmail_acceptance_rate','inmail_decline_rate'];
  } else {
    H=['Month','Platform','Team','AVP','Lead','Name','Recruiter Email','Subscription','Searches','Resumes Viewed','Contacts Used','Contacts Remaining','Response Rate','Responses','Positive Response Rate','Positive Responses'];
    K=['month','platform','team','avp','lead','name','recruiter','subscription_type','searches','resumes_viewed','contacts_used','contacts_remaining','response_rate','responses','positive_response_rate','positive_responses'];
  }
  const rows=[H.join(','),...data.map(r=>K.map(k=>`"${r[k]??''}"`).join(','))].join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+rows],{type:'text/csv;charset=utf-8;'}));
  const m=activeMonths.has('ALL')?'All':[...activeMonths].join('-');
  const portal=currentPortal==='linkedin'?'LinkedIn':'Indeed';
  a.download=`VBeyond_${portal}_${m}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

/* ── KEYBOARD + SESSION RESTORE ──────────────────────────── */
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&document.getElementById('login-screen').style.display!=='none') handleLogin();
});

(async()=>{
  const{data:{session}}=await sb.auth.getSession();
  if(session?.user){
    // Check if session is still fresh (within 30 min)
    const stored=parseInt(localStorage.getItem('vb_act')||'0');
    if(Date.now()-stored>TIMEOUT_MS){
      await sb.auth.signOut();
      showScreen('login');
    } else {
      setupUser(session.user);
      resetActivity();
      showScreen('portal');
    }
  } else {
    showScreen('login');
  }
})();
