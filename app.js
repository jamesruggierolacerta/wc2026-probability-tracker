const els = {
  sims: document.getElementById('sims'),
  tg: document.getElementById('tg'),
  k: document.getElementById('k'),
  run: document.getElementById('run'),
  matches: document.getElementById('matches'),
  outputs: document.getElementById('outputs'),
  status: document.getElementById('status'),
  stageFilter: document.getElementById('stageFilter'),
  search: document.getElementById('search'),
};

const LS_KEY = 'wc2026_matches_fixed';
let TEAMS=null, GROUPS=null, MATCHES=null;

function pct(x){ return (100*x).toFixed(1) + '%'; }
function inv(p){
  if(!p || p<=0) return '—';
  const x = 1/p;
  if(x>=1000) return x.toFixed(0);
  if(x>=100) return x.toFixed(1);
  if(x>=10) return x.toFixed(2);
  return x.toFixed(3);
}
function key(m){ return `${m.id}`; }

async function loadData(){
  const [teams, groups, matches] = await Promise.all([
    fetch('./data/teams.json').then(r=>r.json()),
    fetch('./data/groups.json').then(r=>r.json()),
    fetch('./data/matches.json').then(r=>r.json()),
  ]);
  TEAMS=teams; GROUPS=groups; MATCHES=applyLocalOverrides(matches);
  renderMatches();
  renderOutputsPlaceholder();
}

function applyLocalOverrides(matches){
  try{
    const saved = localStorage.getItem(LS_KEY);
    if(!saved) return matches;
    const parsed = JSON.parse(saved);
    const map = new Map(parsed.map(m=>[key(m), m]));
    return matches.map(m=> map.get(key(m)) ?? m);
  }catch(e){
    console.warn('local overrides failed', e);
    return matches;
  }
}

function persistMatches(){ localStorage.setItem(LS_KEY, JSON.stringify(MATCHES)); }

function filteredMatches(){
  const stage = els.stageFilter.value;
  const q = els.search.value.trim().toLowerCase();
  return MATCHES.filter(m => {
    const okStage = (stage==='all') ? true : (m.stage===stage);
    const okSearch = !q ? true : ((m.home||'').toLowerCase().includes(q) || (m.away||'').toLowerCase().includes(q));
    return okStage && okSearch;
  });
}

function renderMatches(){
  const list = filteredMatches();
  const rows = list.map((m) => {
    const idx = MATCHES.findIndex(x=>x.id===m.id);
    const played = m.played ? 'checked' : '';
    const hg = (m.hg ?? '')
    const ag = (m.ag ?? '')
    return `<tr>
      <td>${m.id}</td>
      <td>${m.stage}</td>
      <td>${m.group ?? ''}</td>
      <td>${m.matchday ?? ''}</td>
      <td>${m.home}</td>
      <td>${m.away}</td>
      <td style="text-align:center"><input type="checkbox" data-idx="${idx}" data-field="played" ${played}></td>
      <td><input type="number" min="0" step="1" data-idx="${idx}" data-field="hg" value="${hg}"></td>
      <td><input type="number" min="0" step="1" data-idx="${idx}" data-field="ag" value="${ag}"></td>
    </tr>`;
  }).join('');

  els.matches.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>ID</th><th>Stage</th><th>Grp</th><th>MD</th><th>Home/Slot</th><th>Away/Slot</th><th>Played</th><th>HG</th><th>AG</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  els.matches.querySelectorAll('input').forEach(inp => inp.addEventListener('change', onMatchEdit));
}

function onMatchEdit(e){
  const idx = Number(e.target.dataset.idx);
  const field = e.target.dataset.field;
  const m = MATCHES[idx];
  if(field==='played') m.played = e.target.checked;
  else {
    const v = e.target.value;
    m[field] = (v === '' ? null : Number(v));
  }
  persistMatches();
}

els.stageFilter.addEventListener('change', renderMatches);
els.search.addEventListener('input', renderMatches);

function renderOutputsPlaceholder(){
  const rows = TEAMS.slice().sort((a,b)=>b.index-a.index).map(t => `
    <tr>
      <td>${t.team}</td>
      ${'<td class="pct">—</td>'.repeat(14)}
    </tr>`).join('');

  els.outputs.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Team</th>
        <th>Qual</th><th>1/Qual</th>
        <th>R32</th><th>1/R32</th>
        <th>R16</th><th>1/R16</th>
        <th>QF</th><th>1/QF</th>
        <th>SF</th><th>1/SF</th>
        <th>Final</th><th>1/Final</th>
        <th>Champ</th><th>1/Champ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderOutputs(probs){
  const rows = TEAMS
    .slice()
    .sort((a,b)=> (probs[b.team]?.champ ?? 0) - (probs[a.team]?.champ ?? 0))
    .map(t => {
      const p = probs[t.team] || {};
      return `<tr>
        <td>${t.team}</td>
        <td class="pct">${pct(p.qual||0)}</td><td class="pct">${inv(p.qual||0)}</td>
        <td class="pct">${pct(p.r32||0)}</td><td class="pct">${inv(p.r32||0)}</td>
        <td class="pct">${pct(p.r16||0)}</td><td class="pct">${inv(p.r16||0)}</td>
        <td class="pct">${pct(p.qf||0)}</td><td class="pct">${inv(p.qf||0)}</td>
        <td class="pct">${pct(p.sf||0)}</td><td class="pct">${inv(p.sf||0)}</td>
        <td class="pct">${pct(p.final||0)}</td><td class="pct">${inv(p.final||0)}</td>
        <td class="pct">${pct(p.champ||0)}</td><td class="pct">${inv(p.champ||0)}</td>
      </tr>`;
    }).join('');

  els.outputs.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Team</th>
        <th>Qual</th><th>1/Qual</th>
        <th>R32</th><th>1/R32</th>
        <th>R16</th><th>1/R16</th>
        <th>QF</th><th>1/QF</th>
        <th>SF</th><th>1/SF</th>
        <th>Final</th><th>1/Final</th>
        <th>Champ</th><th>1/Champ</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

let worker=null;
function ensureWorker(){
  if(worker) return worker;
  worker = new Worker('./worker.js');
  worker.onmessage = (e) => {
    const msg = e.data;
    if(msg.type==='progress') els.status.textContent = msg.text;
    if(msg.type==='done'){
      els.run.disabled=false;
      els.status.textContent = `Done. ${msg.sims.toLocaleString()} sims in ${msg.ms.toFixed(0)} ms.`;
      renderOutputs(msg.probs);
    }
    if(msg.type==='error'){
      els.run.disabled=false;
      els.status.textContent = `Error: ${msg.error}`;
    }
  };
  return worker;
}

els.run.addEventListener('click', () => {
  els.run.disabled = true;
  els.status.textContent = 'Running…';

  for(const m of MATCHES){
    if(m.played && (m.hg==null || m.ag==null)){
      els.run.disabled=false;
      els.status.textContent = `Fix: ${m.id} is marked played but missing score.`;
      return;
    }
  }

  const w=ensureWorker();
  w.postMessage({
    type:'run',
    teams: TEAMS,
    groups: GROUPS,
    matches: MATCHES,
    params: {
      sims: Number(els.sims.value),
      totalGoals90: Number(els.tg.value),
      scaleK: Number(els.k.value),
      etFactor: 0.33,
      penaltyP: 0.5,
    }
  });
});

loadData();
