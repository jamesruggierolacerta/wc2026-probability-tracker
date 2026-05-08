function now(){ return (self.performance && performance.now) ? performance.now() : Date.now(); }
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }

function poissonRand(lambda, rnd){
  const L = Math.exp(-lambda);
  let k=0, p=1;
  do { k++; p*=rnd(); } while(p>L);
  return k-1;
}

function buildStrengthLn(teams){
  const map=new Map();
  for(const t of teams){ map.set(t.team, Math.log(Math.max(1e-6, t.index))); }
  return map;
}

function expectedGoals(a,b,strLn,params){
  const base = params.totalGoals90/2;
  const sa = strLn.get(a)??0, sb=strLn.get(b)??0;
  let lam = base * Math.exp((sa-sb)/params.scaleK);
  // keep outcomes plausible across a full tournament
  if(lam<0.2) lam=0.2;
  if(lam>4.0) lam=4.0;
  return lam;
}

function simulateScore(a,b,strLn,params,rnd){
  const la=expectedGoals(a,b,strLn,params);
  const lb=expectedGoals(b,a,strLn,params);
  return [poissonRand(la,rnd), poissonRand(lb,rnd)];
}

function simKnockoutMatch(a,b,strLn,params,rnd){
  const [ga,gb]=simulateScore(a,b,strLn,params,rnd);
  if(ga>gb) return {winner:a, loser:b};
  if(gb>ga) return {winner:b, loser:a};
  const eta=poissonRand(expectedGoals(a,b,strLn,params)*params.etFactor, rnd);
  const etb=poissonRand(expectedGoals(b,a,strLn,params)*params.etFactor, rnd);
  if(eta>etb) return {winner:a, loser:b};
  if(etb>eta) return {winner:b, loser:a};
  return (rnd()<params.penaltyP) ? {winner:a, loser:b} : {winner:b, loser:a};
}

function emptyStats(groups){
  const stats={};
  for(const t of Object.values(groups).flat()) stats[t]={pts:0,gf:0,ga:0};
  return stats;
}

function gd(s){ return s.gf - s.ga; }

function addH2H(h2h,a,b,pts,gf,ga){
  const k=a+'|'+b;
  const cur=h2h.get(k)||{pts:0,gf:0,ga:0};
  cur.pts+=pts; cur.gf+=gf; cur.ga+=ga;
  h2h.set(k,cur);
}

function applyGroupResult(stats, h2h, home, away, hg, ag){
  stats[home].gf += hg; stats[home].ga += ag;
  stats[away].gf += ag; stats[away].ga += hg;
  if(hg>ag){ stats[home].pts += 3; addH2H(h2h,home,away,3,hg,ag); }
  else if(hg<ag){ stats[away].pts += 3; addH2H(h2h,away,home,3,ag,hg); }
  else {
    stats[home].pts += 1; stats[away].pts += 1;
    addH2H(h2h,home,away,1,hg,ag);
    addH2H(h2h,away,home,1,ag,hg);
  }
}

function resolveTieBlock(block, stats, h2h, teamIndex){
  const mini = {};
  for(const t of block) mini[t]={pts:0,gf:0,ga:0};
  for(let a=0;a<block.length;a++){
    for(let b=0;b<block.length;b++){
      if(a===b) continue;
      const tA=block[a], tB=block[b];
      const rec=h2h.get(tA+'|'+tB);
      if(rec){ mini[tA].pts+=rec.pts; mini[tA].gf+=rec.gf; mini[tA].ga+=rec.ga; }
    }
  }

  let arr = block.slice();
  arr.sort((x,y)=>{
    const mx=mini[x], my=mini[y];
    if(my.pts!==mx.pts) return my.pts-mx.pts;
    const gdx=mx.gf-mx.ga, gdy=my.gf-my.ga;
    if(gdy!==gdx) return gdy-gdx;
    if(my.gf!==mx.gf) return my.gf-mx.gf;
    return 0;
  });

  arr.sort((a,b)=>{
    const sa=stats[a], sb=stats[b];
    const gda=sa.gf-sa.ga, gdb=sb.gf-sb.ga;
    if(gdb!==gda) return gdb-gda;
    if(sb.gf!==sa.gf) return sb.gf-sa.gf;
    return (teamIndex.get(b)||0) - (teamIndex.get(a)||0);
  });

  return arr;
}

function rankGroup(groupTeams, stats, h2h, teamIndex){
  let teams = groupTeams.slice();
  teams.sort((a,b)=>stats[b].pts-stats[a].pts);
  let i=0;
  while(i<teams.length){
    let j=i+1;
    while(j<teams.length && stats[teams[j]].pts===stats[teams[i]].pts) j++;
    if(j-i>1){
      const block = teams.slice(i,j);
      const resolved = resolveTieBlock(block, stats, h2h, teamIndex);
      teams.splice(i, j-i, ...resolved);
    }
    i=j;
  }
  return teams;
}

function pickBestThirds(thirds, stats, teamIndex){
  return thirds.slice().sort((a,b)=>{
    const sa=stats[a], sb=stats[b];
    if(sb.pts!==sa.pts) return sb.pts-sa.pts;
    const gda=gd(sa), gdb=gd(sb);
    if(gdb!==gda) return gdb-gda;
    if(sb.gf!==sa.gf) return sb.gf-sa.gf;
    return (teamIndex.get(b)||0) - (teamIndex.get(a)||0);
  }).slice(0,8);
}

function thirdAssignmentApprox(bestThirdGroups){
  const matches = ['74','77','79','80','81','82','85','87'];
  const gs = bestThirdGroups.slice().sort();
  const out={};
  for(let i=0;i<matches.length;i++) out[matches[i]] = gs[i];
  return out;
}

function groupOf(team, groups){
  for(const g of Object.keys(groups)) if(groups[g].includes(team)) return g;
  return null;
}

function resolveSlot(slot, standings, thirdTeamsByGroup, thirdAssign){
  if(/^\d[A-L]$/.test(slot)) return standings[slot[1]][Number(slot[0])];
  if(/^1[A-L]$/.test(slot)) return standings[slot[1]][1];
  if(/^2[A-L]$/.test(slot)) return standings[slot[1]][2];
  if(/^W\d+$/.test(slot)) return slot;
  if(/^3[A-Z]+$/.test(slot)){
    const map = { '3ABCDF':'74','3CDFGH':'77','3CEFHI':'79','3EHIJK':'80','3BEFIJ':'81','3AEHIJ':'82','3EFGIJ':'85','3DEIJL':'87' };
    const mNo = map[slot];
    const g = thirdAssign[mNo];
    return thirdTeamsByGroup[g];
  }
  return null;
}

function runOnce(msg, rnd){
  const {teams, groups, matches, params} = msg;
  const strLn = buildStrengthLn(teams);
  const teamIndex = new Map(teams.map(t=>[t.team,t.index]));
  const stats = emptyStats(groups);
  const h2h = new Map();

  for(const m of matches){
    if(m.stage!=='Group') continue;
    let hg,ag;
    if(m.played){ hg=m.hg; ag=m.ag; }
    else { [hg,ag]=simulateScore(m.home,m.away,strLn,params,rnd); }
    applyGroupResult(stats,h2h,m.home,m.away,hg,ag);
  }

  const standings={};
  const thirds=[];
  for(const g of Object.keys(groups).sort()){
    const ranked = rankGroup(groups[g], stats, h2h, teamIndex);
    standings[g] = {1:ranked[0],2:ranked[1],3:ranked[2],4:ranked[3]};
    thirds.push(ranked[2]);
  }

  const bestThirdTeams = pickBestThirds(thirds, stats, teamIndex);
  const bestThirdGroups = bestThirdTeams.map(t=>groupOf(t, groups));
  const thirdTeamsByGroup={};
  for(let i=0;i<bestThirdTeams.length;i++) thirdTeamsByGroup[bestThirdGroups[i]]=bestThirdTeams[i];
  const thirdAssign = thirdAssignmentApprox(bestThirdGroups);

  const winners = new Map();

  function play(matchNo, homeSlot, awaySlot){
    const mRec = matches.find(m=>m.id===('M'+matchNo));
    let home = resolveSlot(homeSlot, standings, thirdTeamsByGroup, thirdAssign);
    let away = resolveSlot(awaySlot, standings, thirdTeamsByGroup, thirdAssign);
    if(/^W\d+$/.test(homeSlot)) home = winners.get(Number(homeSlot.slice(1)));
    if(/^W\d+$/.test(awaySlot)) away = winners.get(Number(awaySlot.slice(1)));
    if(!home||!away) throw new Error('Slot resolution failed for M'+matchNo);

    if(mRec && mRec.played){
      const hg=mRec.hg, ag=mRec.ag;
      let w;
      if(hg>ag) w=home; else if(ag>hg) w=away; else w=home;
      winners.set(matchNo,w);
    } else {
      const out = simKnockoutMatch(home,away,strLn,params,rnd);
      winners.set(matchNo,out.winner);
    }
  }

  const r32 = [[73,'2A','2B'],[74,'1E','3ABCDF'],[75,'1F','2C'],[76,'1C','2F'],[77,'1I','3CDFGH'],[78,'2E','2I'],[79,'1A','3CEFHI'],[80,'1L','3EHIJK'],[81,'1D','3BEFIJ'],[82,'1G','3AEHIJ'],[83,'2K','2L'],[84,'1H','2J'],[85,'1B','3EFGIJ'],[86,'1J','2H'],[87,'1K','3DEIJL'],[88,'2D','2G']];
  const r16 = [[89,'W74','W77'],[90,'W73','W75'],[91,'W76','W78'],[92,'W79','W80'],[93,'W83','W84'],[94,'W81','W82'],[95,'W86','W88'],[96,'W85','W87']];
  const qf = [[97,'W89','W90'],[98,'W93','W94'],[99,'W91','W92'],[100,'W95','W96']];
  const sf = [[101,'W97','W98'],[102,'W99','W100']];

  for(const [no,h,a] of r32) play(no,h,a);
  for(const [no,h,a] of r16) play(no,h,a);
  for(const [no,h,a] of qf) play(no,h,a);
  for(const [no,h,a] of sf) play(no,h,a);
  play(104,'W101','W102');

  const reached = {qual:new Set(), r32:new Set(), r16:new Set(), qf:new Set(), sf:new Set(), final:new Set()};
  for(const g of Object.keys(standings)){
    reached.qual.add(standings[g][1]);
    reached.qual.add(standings[g][2]);
  }
  for(const t of bestThirdTeams) reached.qual.add(t);
  for(const t of reached.qual) reached.r32.add(t);
  for(const [no] of r32) reached.r16.add(winners.get(no));
  for(const [no] of r16) reached.qf.add(winners.get(no));
  for(const [no] of qf) reached.sf.add(winners.get(no));
  for(const [no] of sf) reached.final.add(winners.get(no));

  return {reached, champ: winners.get(104)};
}

self.onmessage = (e) => {
  const msg = e.data;
  if(msg.type!=='run') return;
  const sims = Math.max(1000, msg.params.sims|0);
  const t0 = now();
  const probs = {};
  for(const t of msg.teams){ probs[t.team]={qual:0,r32:0,r16:0,qf:0,sf:0,final:0,champ:0}; }
  const seed = (Date.now() ^ (sims*2654435761)) >>> 0;
  const rnd = mulberry32(seed);
  const progressEvery = Math.max(1000, Math.floor(sims/20));

  for(let i=1;i<=sims;i++){
    const out = runOnce(msg, rnd);
    for(const t of out.reached.qual){ probs[t].qual+=1; probs[t].r32+=1; }
    for(const t of out.reached.r16){ probs[t].r16+=1; }
    for(const t of out.reached.qf){ probs[t].qf+=1; }
    for(const t of out.reached.sf){ probs[t].sf+=1; }
    for(const t of out.reached.final){ probs[t].final+=1; }
    probs[out.champ].champ+=1;
    if(i%progressEvery===0) self.postMessage({type:'progress', text:`Running… ${i.toLocaleString()} / ${sims.toLocaleString()}`});
  }

  for(const k of Object.keys(probs)){
    probs[k].qual/=sims; probs[k].r32/=sims; probs[k].r16/=sims; probs[k].qf/=sims; probs[k].sf/=sims; probs[k].final/=sims; probs[k].champ/=sims;
  }

  const t1 = now();
  self.postMessage({type:'done', probs, sims, ms:(t1-t0)});
};
