// ══════════════════════════════════════════════
//  STAT DATA
// ══════════════════════════════════════════════
const STATS = [
  { name:"Elemental Damage", weight:10, phases:[9.54,10.94,12.34,13.75,15.15,16.55,17.95,19.35,20.75,22.15,23.56,24.96,26.36,27.76,29.16] },
  { name:"Hit Rate",         weight:12, phases:[4.77,5.47,6.18,6.88,7.59,8.29,9.00,9.70,10.40,11.11,11.81,12.52,13.22,13.93,14.63] },
  { name:"Max Ammunition",   weight:12, phases:[27.84,31.95,36.06,40.17,44.28,48.39,52.50,56.60,60.71,64.82,68.93,73.04,77.15,81.26,85.37] },
  { name:"ATK",              weight:10, phases:[4.77,5.47,6.18,6.88,7.59,8.29,9.00,9.70,10.40,11.11,11.81,12.52,13.22,13.93,14.63] },
  { name:"Charge Damage",    weight:12, phases:[4.77,5.47,6.18,6.88,7.59,8.29,9.00,9.70,10.40,11.11,11.81,12.52,13.22,13.93,14.63] },
  { name:"Charge Speed",     weight:12, phases:[1.98,2.28,2.57,2.86,3.16,3.45,3.75,4.04,4.33,4.63,4.92,5.21,5.51,5.80,6.09] },
  { name:"Critical Rate",    weight:12, phases:[2.30,2.64,2.98,3.32,3.66,4.00,4.35,4.69,5.03,5.37,5.71,6.05,6.39,6.73,7.07] },
  { name:"Critical Damage",  weight:10, phases:[6.64,7.62,8.60,9.58,10.56,11.54,12.52,13.50,14.48,15.46,16.44,17.42,18.40,19.38,20.36] },
  { name:"DEF",              weight:10, phases:[4.77,5.47,6.18,6.88,7.59,8.29,9.00,9.70,10.40,11.11,11.81,12.52,13.22,13.93,14.63] },
];
const STAT_WEIGHT_TOTAL = STATS.reduce((s,x)=>s+x.weight,0);
const STAT_MAX = Object.fromEntries(STATS.map(s=>[s.name, s.phases[14]]));
const PHASE_WEIGHTS = [12,12,12,12,12, 7,7,7,7,7, 1,1,1,1,1];
const SLOT_CHANCES  = [1.0, 0.5, 0.3];
const SLOT_LABELS   = ["TOP","MID","BOT"];
const SLOT_CLS      = ["slot-top","slot-mid","slot-bot"];
const SLOT_CHIP_CLS = ["top","mid","bot"];

const GEAR_PIECES = [
  { name:"HEAD",   icon:"" },
  { name:"CHEST",  icon:"" },
  { name:"GLOVES", icon:"" },
  { name:"BOOTS",  icon:"" },
];

// ══════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════
function freshGear() {
  return {
    rolled: false,
    slots: [
      { stat:null, phase:null, present:true,  locked:false, perm:false, editing:false },
      { stat:null, phase:null, present:false, locked:false, perm:false, editing:false },
      { stat:null, phase:null, present:false, locked:false, perm:false, editing:false },
    ]
  };
}

let gears      = [freshGear(), freshGear(), freshGear(), freshGear()];
let activeGear = 0;
let res        = { locksUsed:0, rocksUsed:0, totalRolls:0 };
let logN       = 0;

function gear() { return gears[activeGear]; }

// ══════════════════════════════════════════════
//  RNG
// ══════════════════════════════════════════════
function wRand(items) {
  let t = items.reduce((s,i)=>s+i.w,0), r = Math.random()*t;
  for (const i of items) { r-=i.w; if(r<=0) return i.v; }
  return items[items.length-1].v;
}
function rollPhase(g11=false) {
  if (g11) return 11;
  return wRand(PHASE_WEIGHTS.map((w,i)=>({v:i+1,w})));
}
function rollStat(exclude=[]) {
  const pool = STATS.filter(s=>!exclude.includes(s.name));
  if (!pool.length) return null;
  return wRand(pool.map(s=>({v:s.name,w:s.weight})));
}
function lockedCount() {
  return gear().slots.filter(s=>s.present&&(s.locked||s.perm)).length;
}
function rockCost(lc) { return 1+lc; }

// ══════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════
let pendingRoll = null;

function getSlotPreviewHtml(slot, i) {
  const hasData = slot.present && slot.stat;
  let phaseClass = '';
  let phaseTierLabel = '';
  if (slot.phase === 15) {
    phaseClass = 'phase-black';
    phaseTierLabel = ' <span class="black-line-badge">BLACK LINE</span>';
  } else if (slot.phase >= 12) {
    phaseClass = 'phase-blue';
  }

  let contentHtml = hasData
    ? `<div class="slot-content${slot.phase===15?' slot-black-line':''}">
         <div class="slot-stat">${slot.stat}</div>
         <div class="slot-phase-row">
           <div class="slot-phase">Phase <span class="pnum ${phaseClass}">${slot.phase}</span>${phaseTierLabel}</div>
           <div class="slot-statval ${phaseClass}">${pctStr(slot)}</div>
         </div>
       </div>`
    : `<div class="slot-content"><div class="slot-stat" style="opacity:.25;font-size:12px">— EMPTY —</div></div>`;

  return `
    <div class="slot ${SLOT_CLS[i]}${slot.locked||slot.perm?' locked':''}${!hasData?' empty-slot':''}${slot.phase===15?' phase15-slot':''}">
      <div class="slot-indicator"></div>
      <div class="slot-label">${SLOT_LABELS[i]}<br><span style="font-size:9px;opacity:.4">${Math.round(SLOT_CHANCES[i]*100)}%</span></div>
      ${contentHtml}
    </div>`;
}

function doRoll() {
  const first = !gear().rolled;
  const lc = lockedCount(), cost = rockCost(lc);

  // Pay cost immediately
  res.rocksUsed += cost; res.totalRolls++;

  // Deep clone slots
  const oldSlots = JSON.parse(JSON.stringify(gear().slots));
  const newSlots = JSON.parse(JSON.stringify(gear().slots));

  // Determine presence and clear stats of unlocked slots
  newSlots.forEach((s,i) => {
    if (s.locked||s.perm) return;
    s.present = (i===0) ? true : (Math.random()<SLOT_CHANCES[i]);
    s.stat=null; s.phase=null;
  });

  // Pre-seed exclusion pool with ALL locked stats first, regardless of slot order
  const used = newSlots
    .filter(s => (s.locked||s.perm) && s.stat)
    .map(s => s.stat);

  newSlots.forEach(s=>{
    if (s.locked||s.perm) return;
    if (!s.present) return;
    s.stat  = rollStat(used);
    s.phase = rollPhase(first);
    if (s.stat) used.push(s.stat);
  });

  // Temp locks expire after rolling regardless of confirmation decision
  oldSlots.forEach(s => { if (s.locked) s.locked = false; });
  newSlots.forEach(s => { if (s.locked) s.locked = false; });

  const confirmRolls = document.getElementById('confirm-rolls').checked;
  if (!confirmRolls || first) {
    // Apply immediately
    gear().slots = newSlots;
    gear().rolled = true;
    const lines = activeLines().map(({s,i})=>`${SLOT_LABELS[i]}:${s.stat} P${s.phase}(${pctStr(s)})`).join(' · ');
    log('roll',`[${GEAR_PIECES[activeGear].name}] Change Effects (${cost} Rocks) → ${lines||'no lines'}`);
    render();
  } else {
    // Store pending roll and show modal
    pendingRoll = {
      type: 'roll',
      cost: cost,
      costType: 'Rocks',
      gearIdx: activeGear,
      oldSlots: oldSlots,
      newSlots: newSlots,
      wasRolled: gear().rolled
    };
    showConfirmModal();
  }
}

function doRerollPhase() {
  if (!gear().rolled) { log('info','Roll this gear piece first!'); return; }
  const lc = lockedCount(), cost = rockCost(lc);

  // Pay cost immediately
  res.rocksUsed += cost; res.totalRolls++;

  // Deep clone slots
  const oldSlots = JSON.parse(JSON.stringify(gear().slots));
  const newSlots = JSON.parse(JSON.stringify(gear().slots));

  newSlots.forEach(s=>{
    if (s.locked||s.perm||!s.present||!s.stat) return;
    s.phase = rollPhase(false);
  });

  // Temp locks expire after rolling regardless of confirmation decision
  oldSlots.forEach(s => { if (s.locked) s.locked = false; });
  newSlots.forEach(s => { if (s.locked) s.locked = false; });

  const confirmRolls = document.getElementById('confirm-rolls').checked;
  if (!confirmRolls) {
    gear().slots = newSlots;
    const lines = activeLines().map(({s,i})=>`${SLOT_LABELS[i]}:P${s.phase}(${pctStr(s)})`).join(' · ');
    log('phase',`[${GEAR_PIECES[activeGear].name}] Reset Attributes (${cost} Rocks) → ${lines}`);
    render();
  } else {
    pendingRoll = {
      type: 'phase',
      cost: cost,
      costType: 'Rocks',
      gearIdx: activeGear,
      oldSlots: oldSlots,
      newSlots: newSlots,
      wasRolled: gear().rolled
    };
    showConfirmModal();
  }
}

function showConfirmModal() {
  if (!pendingRoll) return;

  const oldContainer = document.getElementById('modal-old-slots');
  const newContainer = document.getElementById('modal-new-slots');

  oldContainer.innerHTML = pendingRoll.oldSlots.map((s, i) => getSlotPreviewHtml(s, i)).join('');
  newContainer.innerHTML = pendingRoll.newSlots.map((s, i) => getSlotPreviewHtml(s, i)).join('');

  const modal = document.getElementById('confirm-modal');
  modal.style.display = 'flex';
  void modal.offsetWidth;
  modal.classList.add('show');
}

function resolveConfirm(accept) {
  const modal = document.getElementById('confirm-modal');
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 250);

  if (!pendingRoll) return;

  const gIdx = pendingRoll.gearIdx;
  const cost = pendingRoll.cost;
  const costType = pendingRoll.costType;

  if (accept) {
    gears[gIdx].slots = pendingRoll.newSlots;
    gears[gIdx].rolled = true;

    // Use a temp activeGear context to calculate lines properly
    const origActive = activeGear;
    activeGear = gIdx;
    if (pendingRoll.type === 'roll') {
      const lines = activeLines().map(({s,i})=>`${SLOT_LABELS[i]}:${s.stat} P${s.phase}(${pctStr(s)})`).join(' · ');
      log('roll', `[${GEAR_PIECES[gIdx].name}] Change Effects applied (${cost} ${costType}) → ${lines||'no lines'}`);
    } else {
      const lines = activeLines().map(({s,i})=>`${SLOT_LABELS[i]}:P${s.phase}(${pctStr(s)})`).join(' · ');
      log('phase', `[${GEAR_PIECES[gIdx].name}] Reset Attributes applied (${cost} ${costType}) → ${lines}`);
    }
    activeGear = origActive;
  } else {
    gears[gIdx].slots = pendingRoll.oldSlots;
    gears[gIdx].rolled = pendingRoll.wasRolled;

    if (pendingRoll.type === 'roll') {
      log('info', `[${GEAR_PIECES[gIdx].name}] Change Effects discarded (${cost} ${costType}) — kept old effects`);
    } else {
      log('info', `[${GEAR_PIECES[gIdx].name}] Reset Attributes discarded (${cost} ${costType}) — kept old effects`);
    }
  }

  pendingRoll = null;
  render();
}

function calculateSlotOdds() {
  const slots = gear().slots;
  const lockedStats = slots
    .filter(s => s.present && (s.locked || s.perm) && s.stat)
    .map(s => s.stat);

  // Initialize odds for all stats on all 3 slots to 0
  const odds = [{}, {}, {}];
  STATS.forEach(s => {
    odds[0][s.name] = 0;
    odds[1][s.name] = 0;
    odds[2][s.name] = 0;
  });

  // States: key is sorted list of chosen stats names, value is the probability of this state.
  let states = {
    [lockedStats.slice().sort().join(',')]: 1.0
  };

  slots.forEach((slot, i) => {
    const isLocked = slot.present && (slot.locked || slot.perm) && slot.stat;
    const nextStates = {};

    for (const [key, p] of Object.entries(states)) {
      const chosenList = key ? key.split(',') : [];

      if (isLocked) {
        // Slot is locked. The stat is guaranteed to be slot.stat.
        odds[i][slot.stat] += p;
        // Transition: state remains the same since the locked stat was already in chosenList
        nextStates[key] = (nextStates[key] || 0) + p;
      } else {
        const pPres = SLOT_CHANCES[i];

        // Case 1: Slot is not present (probability 1 - pPres)
        if (pPres < 1.0) {
          nextStates[key] = (nextStates[key] || 0) + p * (1 - pPres);
        }

        // Case 2: Slot is present (probability pPres)
        const availableStats = STATS.filter(s => !chosenList.includes(s.name));
        const totalWeight = availableStats.reduce((sum, s) => sum + s.weight, 0);

        if (totalWeight > 0) {
          availableStats.forEach(s => {
            const pTrans = s.weight / totalWeight;
            const pChoice = p * pPres * pTrans;

            // Record that slot i got this stat with probability pChoice
            odds[i][s.name] += pChoice;

            // Transition to new state (add s.name to chosen list and sort)
            const newChosen = [...chosenList, s.name].sort().join(',');
            nextStates[newChosen] = (nextStates[newChosen] || 0) + pChoice;
          });
        }
      }
    }

    states = nextStates;
  });

  // Convert to percentages
  STATS.forEach(s => {
    odds[0][s.name] *= 100;
    odds[1][s.name] *= 100;
    odds[2][s.name] *= 100;
  });

  return odds;
}

function openOddsModal() {
  const odds = calculateSlotOdds();
  const tbody = document.getElementById('odds-modal-tbody');
  if (!tbody) return;

  const slots = gear().slots;

  // Sort stats by cumulative probability across all slots
  const sortedStats = [...STATS].sort((a, b) => {
    const sumA = odds[0][a.name] + odds[1][a.name] + odds[2][a.name];
    const sumB = odds[0][b.name] + odds[1][b.name] + odds[2][b.name];
    return sumB - sumA;
  });

  let html = '';
  sortedStats.forEach(st => {
    const name = st.name;
    let rowHtml = `<tr><td>${name}</td>`;

    for (let i = 0; i < 3; i++) {
      const slot = slots[i];
      const isLockedOnThisSlot = slot.present && (slot.locked || slot.perm) && slot.stat === name;

      if (isLockedOnThisSlot) {
        rowHtml += `<td class="pct-locked">LOCKED</td>`;
      } else {
        const pct = odds[i][name];
        if (pct < 0.01) {
          rowHtml += `<td class="pct-zero">0%</td>`;
        } else {
          rowHtml += `<td class="pct-val">${pct.toFixed(1)}%</td>`;
        }
      }
    }
    rowHtml += `</tr>`;
    html += rowHtml;
  });

  tbody.innerHTML = html;

  document.getElementById('odds-modal-sub').textContent = `// Probability of obtaining each stat on TOP, MID, and BOT slots for ${GEAR_PIECES[activeGear].name}`;

  const modal = document.getElementById('odds-modal');
  modal.style.display = 'flex';
  void modal.offsetWidth;
  modal.classList.add('show');
}

function closeOddsModal() {
  const modal = document.getElementById('odds-modal');
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 250);
}

// Count all currently locked slots (temp + perm) on current gear, excluding a given index
function otherLockedCount(excludeIdx) {
  return gear().slots.filter((x,j)=>j!==excludeIdx&&x.present&&(x.locked||x.perm)).length;
}

// Temp lock using Lock item — removable
// Cost: 1st lock = 20 Locks, 2nd = 30 Locks (shared pool with perm locks)
function doTempLock(i) {
  const s = gear().slots[i];
  if (!s.present||!s.stat) return;
  if (s.perm) { log('lock',`${SLOT_LABELS[i]} on ${GEAR_PIECES[activeGear].name} is permanently locked.`); return; }
  if (s.locked) {
    s.locked = false;
    log('lock',`Removed temp lock on ${GEAR_PIECES[activeGear].name} ${SLOT_LABELS[i]}`);
    render(); return;
  }
  const already = otherLockedCount(i);
  const lc = already === 0 ? 20 : 30;
  s.locked=true; res.locksUsed+=lc;
  log('lock',`Temp-locked ${GEAR_PIECES[activeGear].name} ${SLOT_LABELS[i]} (${lc} Locks) — removable`);
  render();
}

// Perm lock using Rock
// Base costs: 1st = 2 Rocks, 2nd = 3 Rocks, 3rd = 4 Rocks
// Only OTHER perm locks raise the cost tier — temp locks do NOT affect rock cost
function doPermLock(i) {
  const s = gear().slots[i];
  if (!s.present||!s.stat) return;
  if (s.perm) {
    s.perm = false;
    log('lock',`Removed perm lock on ${GEAR_PIECES[activeGear].name} ${SLOT_LABELS[i]}`);
    render(); return;
  }

  const otherPerms = gear().slots.filter((x,j)=>j!==i&&x.present&&x.perm).length;
  const ROCK_COSTS = [2, 3, 4];
  const rockCostLock = ROCK_COSTS[Math.min(otherPerms, 2)];

  if (s.locked) { s.locked = false; }
  s.perm = true; res.rocksUsed += rockCostLock;
  log('lock', `Perm-locked ${GEAR_PIECES[activeGear].name} ${SLOT_LABELS[i]} (${rockCostLock} Rock${rockCostLock > 1 ? 's' : ''}) — permanent`);
  render();
}

// Remove temp lock
function doUnlock(i) {
  const s = gear().slots[i];
  if (!s.locked) return;
  s.locked=false;
  log('lock',`Removed lock on ${GEAR_PIECES[activeGear].name} ${SLOT_LABELS[i]}`);
  render();
}

function doResetGear() {
  gears[activeGear] = freshGear();
  log('reset',`Reset ${GEAR_PIECES[activeGear].name} gear piece.`);
  render();
}

function doResetAll() {
  gears = [freshGear(), freshGear(), freshGear(), freshGear()];
  res = { locksUsed:0, rocksUsed:0, totalRolls:0 };
  log('reset','All 4 gear pieces reset.');
  render();
}

function toggleEdit(i) {
  gear().slots[i].editing = !gear().slots[i].editing;
  renderGear();
  renderAllStats();
  // After render, build phase options based on selected stat
  if (gear().slots[i].editing) populatePhaseOptions(i);
}

function populatePhaseOptions(i) {
  const statSel  = document.getElementById(`pick-stat-${activeGear}-${i}`);
  const phaseSel = document.getElementById(`pick-phase-${activeGear}-${i}`);
  if (!statSel || !phaseSel) return;
  const statName = statSel.value;
  const sd = STATS.find(s=>s.name===statName);
  const currentPhase = gear().slots[i].phase || 11;
  phaseSel.innerHTML = Array.from({length:15},(_,p)=>{
    const val = sd ? sd.phases[p].toFixed(2)+'%' : '—';
    return `<option value="${p+1}"${currentPhase===p+1?' selected':''}>P${p+1} — ${val}</option>`;
  }).join('');
}

function onPickerStatChange(i) {
  populatePhaseOptions(i);
}

function applyPicker(i) {
  const statSel  = document.getElementById(`pick-stat-${activeGear}-${i}`);
  const phaseSel = document.getElementById(`pick-phase-${activeGear}-${i}`);
  if (!statSel || !phaseSel || !statSel.value) return;

  const s = gear().slots[i];
  // Check for duplicate stat on this gear piece
  const duplicate = gear().slots.some((x,j)=>j!==i&&x.stat===statSel.value&&x.present);
  if (duplicate) { log('info',`${statSel.value} is already on another slot of this piece.`); return; }

  s.stat    = statSel.value;
  s.phase   = parseInt(phaseSel.value);
  s.present = true;
  s.editing = false;
  gear().rolled = true;
  log('info', `[${GEAR_PIECES[activeGear].name}] Manually set ${SLOT_LABELS[i]}: ${s.stat} P${s.phase} (${pctStr(s)})`);
  render();
}

function clearSlot(i) {
  const s = gear().slots[i];
  s.stat    = null;
  s.phase   = null;
  s.present = (i === 0); // top slot always present
  s.locked  = false;
  s.perm    = false;
  s.editing = false;
  log('info', `[${GEAR_PIECES[activeGear].name}] Cleared ${SLOT_LABELS[i]} slot.`);
  render();
}

function switchTab(i) {
  activeGear = i;
  render(false); // Passing 'false' prevents the animation when switching tabs
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function pctStr(slot) {
  if (!slot.stat||!slot.phase) return '—';
  const sd = STATS.find(s=>s.name===slot.stat);
  return sd ? sd.phases[slot.phase-1].toFixed(2)+'%' : '—';
}
function activeLines() {
  return gear().slots.map((s,i)=>({s,i})).filter(({s})=>s.present&&s.stat);
}

// ══════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════
function renderTabs() {
  const tabsEl = document.getElementById('gear-tabs');
  tabsEl.innerHTML = '';
  GEAR_PIECES.forEach((gp,i)=>{
    const g = gears[i];
    const btn = document.createElement('button');
    btn.className = `gear-tab${i===activeGear?' active':''}${g.rolled?' rolled':''}`;
    btn.onclick = ()=>switchTab(i);
    btn.innerHTML = `${gp.icon?`<span class="tab-icon">${gp.icon}</span>`:''}<span>${gp.name}</span><span class="tab-dot"></span>`;
    tabsEl.appendChild(btn);
  });
}

function renderGear() {
  const g = gear();
  // title + badge
  document.getElementById('gear-title').textContent = GEAR_PIECES[activeGear].name;
  const badge = document.getElementById('gear-badge');
  badge.textContent = g.rolled ? 'OVERLOADED' : 'FRESH';
  badge.className = `gear-badge ${g.rolled?'badge-rolled':'badge-fresh'}`;

  // slots
  const grid = document.getElementById('slots-grid');
  grid.innerHTML = '';
  g.slots.forEach((slot,i)=>{
    const hasData = slot.present&&slot.stat;
    const div = document.createElement('div');
    div.className = `slot ${SLOT_CLS[i]}${slot.locked||slot.perm?' locked':''}${!hasData?' empty-slot':''}${slot.phase===15?' phase15-slot':''}`;

    // Phase tier styling
    let phaseClass = '';
    let phaseTierLabel = '';
    if (slot.phase === 15) { phaseClass = 'phase-black'; phaseTierLabel = ' <span class="black-line-badge">BLACK LINE</span>'; }
    else if (slot.phase >= 12) { phaseClass = 'phase-blue'; }

    let contentHtml = hasData
      ? `<div class="slot-content${slot.phase===15?' slot-black-line':''}">
           <div class="slot-stat">${slot.stat}</div>
           <div class="slot-phase-row">
             <div class="slot-phase">Phase <span class="pnum ${phaseClass}">${slot.phase}</span>${phaseTierLabel}</div>
             <div class="slot-statval ${phaseClass}">${pctStr(slot)}</div>
           </div>
         </div>`
      : `<div class="slot-content"><div class="slot-stat" style="opacity:.25;font-size:12px">— EMPTY —</div></div>`;

    // Picker (shown if editing)
    const isEditing = slot.editing;
    const pickerHtml = isEditing ? `
      <div class="slot-picker">
        <select id="pick-stat-${activeGear}-${i}" onchange="onPickerStatChange(${i})">
          <option value="">— Stat —</option>
          ${STATS.map(s=>`<option value="${s.name}"${slot.stat===s.name?' selected':''}>${s.name}</option>`).join('')}
        </select>
        <select id="pick-phase-${activeGear}-${i}">
          ${Array.from({length:15},(_,p)=>`<option value="${p+1}"${slot.phase===p+1?' selected':''}>P${p+1} — ${STATS.find(s=>s.name===(document.getElementById('pick-stat-${activeGear}-${i}')||{value:slot.stat})?.value)?.phases[p]??'?'}%</option>`).join('')}
        </select>
        <button class="btn-set-slot" onclick="applyPicker(${i})">✓ Set</button>
        <button class="btn-clear-slot" onclick="clearSlot(${i})">✕ Clear</button>
      </div>` : '';

    // Edit toggle button (small, sits in slot-actions area)
    const editBtn = (hasData || !slot.editing) ? `<button class="btn-edit-slot" onclick="toggleEdit(${i})" title="Manually set stat">${isEditing?'▲':'✎'}</button>` : '';

let lockHtml = '';
    if (hasData) {
      if (slot.perm)
        lockHtml = `<div class="slot-actions"><button class="btn-lock is-perm" onclick="doPermLock(${i})" title="Click to remove perm lock"><img src="images/Rock.webp" style="width:13px;height:13px;object-fit:contain;vertical-align:middle;filter:drop-shadow(0 0 3px rgba(0,212,255,.5))"> PERM</button></div>`;
      else if (slot.locked)
        lockHtml = `<div class="slot-actions">
          <button class="btn-lock is-locked" onclick="doTempLock(${i})"><img src="images/Lock.webp" style="width:13px;height:13px;object-fit:contain;vertical-align:middle;filter:drop-shadow(0 0 3px rgba(255,200,70,.5))"> TEMP</button></div>`;
      else
        lockHtml = `<div class="slot-actions">
          <button class="btn-lock" onclick="doTempLock(${i})" title="Temp lock (removable, costs Locks)"><img src='images/Lock.webp' style='width:14px;height:14px;object-fit:contain;vertical-align:middle'></button>
          <button class="btn-lock" onclick="doPermLock(${i})" title="Perm lock (permanent, costs Rocks)"><img src='images/Rock.webp' style='width:14px;height:14px;object-fit:contain;vertical-align:middle'></button>
        </div>`;
    }

    // Extract inner lock buttons (strip the wrapping div)
    const lockInner = lockHtml
      .replace(/^<div class="slot-actions">/, '')
      .replace(/<\/div>$/, '');

    div.innerHTML = `
      <div class="slot-indicator"></div>
      <div class="slot-label">${SLOT_LABELS[i]}<br><span style="font-size:9px;opacity:.4">${Math.round(SLOT_CHANCES[i]*100)}%</span></div>
      ${contentHtml}
      <div class="slot-actions">${editBtn}${lockInner}</div>
      ${pickerHtml}`;
    grid.appendChild(div);
  });

  // Populate phase dropdowns for any slot in edit mode
  gear().slots.forEach((_,i) => {
    if (gear().slots[i].editing) populatePhaseOptions(i);
  });

  // cost preview
  const lc = lockedCount(), rc = rockCost(lc);
  document.getElementById('cost-roll').innerHTML = `${rc} <img src="images/Rock.webp" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;filter:drop-shadow(0 0 3px rgba(0,212,255,.5))">`;
  document.getElementById('cost-phase').innerHTML = `${rc} <img src="images/Rock.webp" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;filter:drop-shadow(0 0 3px rgba(0,212,255,.5))">`;
}

function renderAllStats() {
  const body = document.getElementById('char-stats-body');

  // Aggregate across all 4 gear pieces
  // agg[statName] = [ {gearIdx, slotIdx, val} ]
  const agg = {};
  gears.forEach((g,gi)=>{
    g.slots.forEach((s,si)=>{
      if (!s.present||!s.stat||!s.phase) return;
      const sd = STATS.find(x=>x.name===s.stat);
      if (!sd) return;
      const val = sd.phases[s.phase-1];
      if (!agg[s.stat]) agg[s.stat]=[];
      agg[s.stat].push({gi, si, val});
    });
  });

  const keys = Object.keys(agg);
  if (!keys.length) {
    body.innerHTML = `<div class="no-stats-msg">No gear rolled yet.<br>Roll any gear piece to see combined bonuses.</div>`;
    return;
  }

  // Count rolled pieces for subtitle
  const rolledCount = gears.filter(g=>g.rolled).length;
  document.getElementById('stats-sub').textContent =
    `// ${rolledCount}/4 pieces rolled · all bonuses combined`;

  let html = '';
  // Sort by % of max possible (bar fill) descending — closest to perfect at top
  const sorted = keys.sort((a,b)=>{
    const maxA = (STAT_MAX[a]||1) * 4;
    const maxB = (STAT_MAX[b]||1) * 4;
    const pctA = agg[a].reduce((s,e)=>s+e.val,0) / maxA;
    const pctB = agg[b].reduce((s,e)=>s+e.val,0) / maxB;
    return pctB - pctA;
  });

  sorted.forEach(name=>{
    const entries = agg[name];
    const total = entries.reduce((s,e)=>s+e.val,0);
    // max possible = P15 value × 4 slots across all gear × some cap; use 4 pieces * 3 slots max
    const maxPoss = (STAT_MAX[name]||1) * 4;
    const pct = Math.min(100,(total/maxPoss)*100);
    const chips = entries.map(e=>{
      const gpName = GEAR_PIECES[e.gi].name;
      const slotLabel = SLOT_LABELS[e.si];
      return `<span class="stat-chip gc-${e.gi}">${gpName} ${slotLabel} +${e.val.toFixed(2)}%</span>`;
    }).join('');
    html += `
      <div class="stat-row">
        <div class="stat-row-header">
          <div class="stat-name">${name}</div>
          <div class="stat-total">+${total.toFixed(2)}%</div>
        </div>
        <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="stat-sources">${chips}</div>
      </div>`;
  });
  body.innerHTML = html;
}

function renderResources(animClass = 'bump') {
  [['locks-used',res.locksUsed],['rocks-used',res.rocksUsed],['total-rolls',res.totalRolls]].forEach(([id,val],idx)=>{
    const el = document.getElementById(id);
    // Stagger the roll animation slightly per card
    setTimeout(() => {
      el.textContent = val;
      el.classList.remove('bump','rolling');

      // Only add the animation class if an animation is requested
      if (animClass) {
        void el.offsetWidth;
        el.classList.add(animClass);
      }
    }, animClass === 'rolling' ? idx * 80 : 0);
  });
}

function render(animate = true) {
  const scrollY = window.scrollY;
  renderTabs();
  renderGear();
  renderAllStats();
  // Pass 'bump' if animate is true, otherwise pass false
  renderResources(animate ? 'bump' : false);
  // Restore scroll position after DOM reflow to prevent mobile layout jumps
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

// ══════════════════════════════════════════════
//  LOG
// ══════════════════════════════════════════════
function log(type, msg) {
  logN++;
  const el = document.getElementById('log-list');
  const div = document.createElement('div');
  div.className = 'log-entry';
  const cls = {roll:'ev-roll',phase:'ev-phase',lock:'ev-lock',reset:'ev-reset',info:'ev-info'}[type]||'ev-info';
  div.innerHTML = `<span class="log-num">#${String(logN).padStart(3,'0')}</span><span class="${cls}">[${type.toUpperCase()}]</span> ${msg}`;
  el.prepend(div);
  while(el.children.length>80) el.removeChild(el.lastChild);
}

// ══════════════════════════════════════════════
//  REF TABLE
// ══════════════════════════════════════════════
let refSelectedPhase = 11;

function selectRefPhase(phaseNum) {
  refSelectedPhase = phaseNum;
  renderRefSection();
}

function renderRefSection() {
  const grid = document.getElementById('ref-phase-grid');
  const tbody = document.getElementById('ref-tbody');
  if (!grid || !tbody) return;

  grid.innerHTML = '';
  for (let p = 1; p <= 15; p++) {
    const weight = PHASE_WEIGHTS[p - 1];
    const prob = weight.toFixed(1) + '%';

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `ref-phase-tile${p === refSelectedPhase ? ' active' : ''}`;
    tile.onclick = () => selectRefPhase(p);

    let tierClass = '';
    if (p === 15) tierClass = 'tile-black';
    else if (p >= 12) tierClass = 'tile-blue';

    tile.innerHTML = `
      <div class="tile-num ${tierClass}">P${p}</div>
      <div class="tile-odds">${prob}</div>
    `;
    grid.appendChild(tile);
  }

  document.getElementById('ref-selected-phase-num').textContent = `Phase ${refSelectedPhase}`;
  const selectedWeight = PHASE_WEIGHTS[refSelectedPhase - 1];
  document.getElementById('ref-selected-phase-odds').textContent = `${selectedWeight.toFixed(1)}%`;

  const phaseNumEl = document.getElementById('ref-selected-phase-num');
  phaseNumEl.className = '';
  if (refSelectedPhase === 15) {
    phaseNumEl.classList.add('phase-black');
  } else if (refSelectedPhase >= 12) {
    phaseNumEl.classList.add('phase-blue');
  }

  tbody.innerHTML = '';
  STATS.forEach(s => {
    const val = s.phases[refSelectedPhase - 1];
    const tr = document.createElement('tr');

    let phaseClass = '';
    if (refSelectedPhase === 15) phaseClass = 'phase-black';
    else if (refSelectedPhase >= 12) phaseClass = 'phase-blue';

    tr.innerHTML = `
      <td>${s.name}</td>
      <td class="td-c" style="text-align: center;">${(s.weight / STAT_WEIGHT_TOTAL * 100).toFixed(1)}%</td>
      <td class="td-p" style="text-align: right; font-weight: 700;"><span class="${phaseClass}">+${val.toFixed(2)}%</span></td>
    `;
    tbody.appendChild(tr);
  });
}
function toggleProb() { document.getElementById('prob-panel').classList.toggle('open'); }

// ══════════════════════════════════════════════
//  THEME TOGGLE
// ══════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('nikke_theme');
  if (saved === 'light') {
    document.body.classList.add('light-theme');
    updateThemeUI(true);
  } else {
    updateThemeUI(false);
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('nikke_theme', isLight ? 'light' : 'dark');
  updateThemeUI(isLight);
}

function updateThemeUI(isLight) {
  const btn = document.getElementById('theme-btn');
  const icon = document.getElementById('theme-icon');
  const text = document.getElementById('theme-text');
  if (!btn || !icon || !text) return;

  if (isLight) {
    icon.textContent = '🌙';
    text.textContent = 'DARK';
  } else {
    icon.textContent = '☀️';
    text.textContent = 'LIGHT';
  }
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
renderRefSection();
render();
initTheme();
log('info','Select a gear tab and roll. First roll on each piece guarantees Phase 11.');
