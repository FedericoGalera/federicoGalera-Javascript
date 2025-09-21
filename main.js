// =============================================================================
// Tamagochi + PokeAPI
// =============================================================================
// - Pausa persistente entre recargas (localStorage)
// - Evolución MANUAL (botón) y progreso por ticks con Salud==100
//   · Se oculta por completo si la especie NO evoluciona.
// - Tienda en pop-up (SweetAlert) con carrito y DINERO ACTUAL visible.
// - Eventos persistentes (muestra últimos 10).
// - Opción Shiny al crear partida (también para evoluciones).
// - Selector: solo 1ra fase (orden Pokédex).
//
// [MOBILE]
// - En mobile, el grid del juego no fuerza altura (se maneja en CSS).
// - La Tienda abre con ancho adaptativo (≤ 96vw o 900px).
// =============================================================================

// ------------------------------ CONFIG --------------------------------------
const ALIMENTACION_MAX = 20;
const FELICIDAD_MAX = 20;

const CONFIG = {
  alimentacionPorJugar: -3,
  alimentacionPorTick: -2,
  felicidadPorTick: -1,
  saludCastigo: 10,
  tickSegundos: 5,

  dineroInicial: 100,
  umbralSalud: 60,
  umbralAlimentacionMin: 10,
  umbralFelicidadMin: 10,
  recompensaBase: 30,
  recompensaBonusScore: 25,

  // Evolución: ticks consecutivos con Salud = 100 (habilita botón, no auto)
  evoTicksRequeridos: 12,
};

// ------------------------------ POKEAPI -------------------------------------
const POKE_API = {
  pokemonSpeciesList: 'https://pokeapi.co/api/v2/pokemon-species?limit=386',
  speciesByName: (name) => `https://pokeapi.co/api/v2/pokemon-species/${name}`,
  evolutionChainByUrl: (url) => url,
  pokemonByName: (name) => `https://pokeapi.co/api/v2/pokemon/${name}`,
  berriesList: 'https://pokeapi.co/api/v2/berry?limit=64',
};

// ------------------------------ SWEETALERT PRESET ---------------------------
const swalDark = Swal.mixin({
  background: '#0b1222',
  color: '#e5e7eb',
  backdrop: 'rgba(0,0,0,0.82)',
  confirmButtonColor: '#22c55e',
  cancelButtonColor: '#ef4444',
  buttonsStyling: true
});

// ------------------------------ HELPERS -------------------------------------
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const qs  = (s, p = document) => p.querySelector(s);
const qsa = (s, p = document) => p.querySelectorAll(s);
const byId = (id) => document.getElementById(id);
const toast = (text) => Toastify({ text, duration: 2500, gravity: 'top', position: 'right' }).showToast();

function updateAppVh(){
  document.documentElement.style.setProperty('--appvh', `${window.innerHeight}px`);
}

// ------------------------------ EVENTOS PERSISTENTES ------------------------
const KEY_EVENT_LOG = 'tamagochi_event_log_v1';
function readLogArr() {
  try { return JSON.parse(localStorage.getItem(KEY_EVENT_LOG)) || []; }
  catch { return []; }
}
function writeLogArr(arr) {
  const MAX_STORE = 200; // límite de almacenamiento; en UI mostramos 10 últimos
  if (arr.length > MAX_STORE) arr.splice(0, arr.length - MAX_STORE);
  localStorage.setItem(KEY_EVENT_LOG, JSON.stringify(arr));
}
function log(msg) {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  const line = `[${hh}:${mm}:${ss}] ${msg}`;
  const arr = readLogArr(); arr.push(line); writeLogArr(arr);
  renderLog();
}
function renderLog() {
  const box = byId('log'); if (!box) return;
  const arr = readLogArr();
  const last10 = arr.slice(-10).reverse();
  box.innerHTML = last10.map(l => `<div>• ${l}</div>`).join('');
}

// ------------------------------ ANIM/UTILS ----------------------------------
function pulse(el, cls, ms = 600) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
function snapStats() {
  if (!pet) return null;
  return { salud: pet.salud, alimentacion: pet.alimentacion, felicidad: pet.felicidad, money: pet.money };
}
function diffStats(prev, curr) {
  if (!prev || !curr) return null;
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  return {
    dMoney: sign(curr.money - prev.money),
    dSalud: sign(curr.salud - prev.salud),
    dAlim:  sign(curr.alimentacion - prev.alimentacion),
    dFelicidad: sign(curr.felicidad - prev.felicidad),
  };
}

// ------------------------------ MODELO --------------------------------------
class Mascota {
  constructor(nombre, sprite = '') {
    this.nombre = nombre;
    this.sprite = sprite;

    this.salud = 100;          // Nunca baja de 1 (ver normalizar)
    this.alimentacion = 10;
    this.felicidad = 10;

    this.money = CONFIG.dineroInicial;
    this.inventory = {};

    // Evolución
    this.species = '';
    this.evoChainUrl = '';
    this.evoStage = 0;
    this.ticksSaludMax = 0;    // contador hacia el requisito
    this.evoFinal = false;     // true si no hay siguiente evolución

    // Apariencia
    this.shiny = false;
  }
}

// ------------------------------ PERSISTENCIA --------------------------------
const KEY_SAVE              = 'tamagochi_save_unico_v8'; // bump versión por shiny / UI
const KEY_BERRIES           = 'berries_cache_v2';
const KEY_FIRST_RUN         = 'tamagochi_first_run_shown_v1';
const KEY_FIRST_STAGE_CACHE = 'first_stage_species_cache_v2';
const KEY_PAUSED            = 'tamagochi_paused_v1';

function save(state) { localStorage.setItem(KEY_SAVE, JSON.stringify(state)); }
function load() {
  const raw = localStorage.getItem(KEY_SAVE);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const p = new Mascota(data.nombre, data.sprite);
    Object.assign(p, data);
    if (typeof p.money !== 'number') p.money = CONFIG.dineroInicial;
    if (!p.inventory) p.inventory = {};
    p.species       = p.species || '';
    p.evoChainUrl   = p.evoChainUrl || '';
    p.evoStage      = typeof p.evoStage === 'number' ? p.evoStage : 0;
    p.ticksSaludMax = typeof p.ticksSaludMax === 'number' ? p.ticksSaludMax : 0;
    p.evoFinal      = !!p.evoFinal;
    p.shiny         = !!p.shiny;
    return p;
  } catch { return null; }
}
function clearSave() { localStorage.removeItem(KEY_SAVE); }

// ------------------------------ ESTADO --------------------------------------
let pet = null;
let timer = null;
let comidas = [];
let precios = {};
let carrito = {};
let paused = false;

// ------------------------------ FETCH UTILS ---------------------------------
async function fetchJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

// ------------------------------ EVOLUCIÓN --------------------------
async function fetchSpecies(nameOrSpecies) {
  return fetchJson(POKE_API.speciesByName(nameOrSpecies));
}
function getDefaultVarietyPokemonName(speciesObj) {
  const def = (speciesObj.varieties || []).find(v => v.is_default);
  return def?.pokemon?.name || speciesObj.name;
}
function findNextEvolutionSpeciesName(chainNode, currentSpecies) {
  if (!chainNode) return null;
  if (chainNode.species?.name === currentSpecies) return chainNode.evolves_to?.[0]?.species?.name || null;
  for (const nxt of (chainNode.evolves_to || [])) {
    const r = findNextEvolutionSpeciesName(nxt, currentSpecies);
    if (r) return r;
  }
  return null;
}
function isEvoReady() {
  return !!(pet && !pet.evoFinal && pet.salud === 100 && (pet.ticksSaludMax || 0) >= CONFIG.evoTicksRequeridos);
}
function toggleEvoUI(show){
  const cont = byId('evoContainer');
  if (cont) cont.style.display = show ? '' : 'none';
}
function updateEvoButton() {
  const btn = byId('btnEvolucionar'); if (!btn) return;

  // Si la especie es final, esconder todo el bloque de evolución.
  toggleEvoUI(!(pet?.evoFinal));

  if (pet?.evoFinal){ btn.disabled = true; return; }
  const ready = isEvoReady();
  btn.disabled = !ready;
  btn.title = ready
    ? 'Listo para evolucionar'
    : `Mantén Salud = 100 (${pet ? pet.ticksSaludMax : 0}/${CONFIG.evoTicksRequeridos})`;

  // Actualizar UI de progreso
  const max = CONFIG.evoTicksRequeridos;
  const curr = pet ? (pet.ticksSaludMax || 0) : 0;
  const bar = byId('evoProgressBar');
  const lbl = byId('evoTicksLabel');
  const lblMax = byId('evoTicksMaxLabel');
  if (lbl) lbl.textContent = String(curr);
  if (lblMax) lblMax.textContent = String(max); 
  if (bar) bar.style.width = `${Math.min(100, (curr/max)*100)}%`;
}
async function evolucionar() {
  if (!isEvoReady()) return;
  try {
    let speciesObj = null;
    if (!pet.species) {
      speciesObj = await fetchSpecies(pet.nombre.toLowerCase());
      pet.species = speciesObj.name;
      pet.evoChainUrl = speciesObj.evolution_chain?.url || '';
    }
    const species = speciesObj || await fetchSpecies(pet.species);
    const chainUrl = species.evolution_chain?.url;
    if (!chainUrl) { pet.evoFinal = true; save(pet); updateEvoButton(); return; }

    const chain = await fetchJson(chainUrl);
    const nextSpeciesName = findNextEvolutionSpeciesName(chain.chain, species.name);
    if (!nextSpeciesName) { pet.evoFinal = true; save(pet); updateEvoButton(); return; }

    const nextSpecies = await fetchSpecies(nextSpeciesName);
    const nextPokemonName = getDefaultVarietyPokemonName(nextSpecies);
    const nextSprite = await obtenerSprite(nextPokemonName, pet.shiny);

    pet.species = nextSpecies.name;
    pet.nombre  = nextSpecies.name.replace(/\b\w/g, m => m.toUpperCase());
    pet.evoStage = (pet.evoStage || 0) + 1;
    pet.ticksSaludMax = 0; // reiniciar progreso tras evolucionar
    if (nextSprite) pet.sprite = nextSprite;

    // ¿la nueva especie es final?
    const nextChain = await fetchJson(nextSpecies.evolution_chain?.url);
    const hasNext   = !!findNextEvolutionSpeciesName(nextChain.chain, nextSpecies.name);
    pet.evoFinal = !hasNext;

    save(pet);
    render();
    toast(`✨ ${pet.nombre} ha evolucionado`);
    log(`✨ Evolución completada: ahora es ${pet.nombre}`);
  } catch { /* silencioso */ }
  finally { updateEvoButton(); }
}
async function actualizarEvoFinalYUI(){
  if (!pet) return;
  try{
    const species = await fetchSpecies(pet.species || pet.nombre.toLowerCase());
    pet.species = species.name;
    pet.evoChainUrl = species.evolution_chain?.url || '';
    if (!pet.evoChainUrl){ pet.evoFinal = true; }
    else {
      const chain = await fetchJson(pet.evoChainUrl);
      const next = findNextEvolutionSpeciesName(chain.chain, species.name);
      pet.evoFinal = !next;
    }
  }catch{ pet.evoFinal = true; }
  save(pet);
  toggleEvoUI(!pet.evoFinal);
  updateEvoButton();
}

// ------------------------------ BAYAS / CATÁLOGO ----------------------------
const FIRMNESS_FACTORS = { 'very-soft':0.95,'soft':1.00,'hard':1.10,'very-hard':1.20,'super-hard':1.30 };
function growthFactor(t){ return clamp(1 + (t/50), 1, 1.5); }
function mapBerryToFood(berry, item){
  const size = berry.size ?? 20;
  const totalFlavor = (berry.flavors || []).reduce((acc,f)=>acc+(f.potency||0),0);
  const dalimentacion = clamp(Math.round(size/30)+2, 2, 10);
  const dfelicidad    = clamp(Math.round(totalFlavor/12)||1, 1, 8);
  const priceBase = 5 + (dalimentacion*2 + dfelicidad*3);
  const firmnessName = berry.firmness?.name ?? 'soft';
  const price = Math.max(5, Math.round(priceBase * (FIRMNESS_FACTORS[firmnessName] ?? 1) * growthFactor(berry.growth_time)));
  return { id:berry.name, label:berry.name.replace(/\b\w/g,m=>m.toUpperCase()),
           dalimentacion, dfelicidad, msg:`¡${item.name.replace(/\b\w/g,m=>m.toUpperCase())} nutritiva!`,
           sprite:item.sprites?.default||'', price };
}
const COMIDAS_FALLBACK = [
  { id:'baya',label:'Baya',dalimentacion:+8,dfelicidad:+2,msg:'¡Baya saludable!',sprite:'',price:27 },
  { id:'manzana',label:'Manzana',dalimentacion:+8,dfelicidad:+2,msg:'¡Manzana saludable!',sprite:'',price:27 },
  { id:'caramelo',label:'Caramelo',dalimentacion:+3,dfelicidad:+6,msg:'¡Caramelo delicioso!',sprite:'',price:29 },
];
async function cargarComidasDesdePokeAPI(){
  const cached = localStorage.getItem(KEY_BERRIES);
  if (cached){
    try{
      const { ts, foods } = JSON.parse(cached);
      if (Date.now()-ts < 24*60*60*1000 && foods?.length && foods[0].dalimentacion !== undefined){
        comidas = foods; precios = Object.fromEntries(comidas.map(c=>[c.id,c.price])); return;
      }
    }catch{}
  }
  try{
    const list = await fetchJson(POKE_API.berriesList);
    const picks = [...list.results].sort(()=>Math.random()-0.5).slice(0,6);
    const berries = await Promise.all(picks.map(p=>fetchJson(p.url)));
    const items   = await Promise.all(berries.map(b=>fetchJson(b.item.url)));
    comidas = berries.map((b,i)=>mapBerryToFood(b,items[i]));
    localStorage.setItem(KEY_BERRIES, JSON.stringify({ ts:Date.now(), foods:comidas }));
    precios = Object.fromEntries(comidas.map(c=>[c.id,c.price]));
  }catch{
    comidas = COMIDAS_FALLBACK;
    precios = Object.fromEntries(comidas.map(c=>[c.id,c.price]));
    log('No se pudieron cargar bayas desde PokeAPI; usando catálogo local.');
  }
}

// ------------------------------ SELECTOR (1ra fase, orden Pokédex) ---
async function cargarListaPokemonSoloPrimerasFases(){
  const sel = byId('pokemonSelect'); if (!sel) return;
  sel.innerHTML = `<option value="" disabled selected>Elige tu Pokémon.</option>`;

  const cacheRaw = localStorage.getItem(KEY_FIRST_STAGE_CACHE);
  if (cacheRaw){
    try{
      const { ts, species } = JSON.parse(cacheRaw);
      if (Date.now()-ts < 24*60*60*1000 && Array.isArray(species) && species.length){
        species.forEach(({ name, display }) => sel.insertAdjacentHTML('beforeend', `<option value="${name}">${display}</option>`));
        sel.addEventListener('change', (e)=> actualizarPreviewPorSpecies(e.target.value));
        byId('chkShiny')?.addEventListener('change', ()=> actualizarPreviewPorSpecies(sel.value));
        return;
      }
    }catch{}
  }

  const list = await fetchJson(POKE_API.pokemonSpeciesList);
  let details = [];
  try{ details = await Promise.all(list.results.map(s=>fetchJson(s.url))); }catch{}

  const firstStages = details
    .filter(sp => !sp.evolves_from_species)
    .map(sp => ({ id:sp.id, name:sp.name, display: sp.name.replace(/\b\w/g,m=>m.toUpperCase()) }))
    .sort((a,b)=> a.id - b.id);

  firstStages.forEach(({ name, display }) => sel.insertAdjacentHTML('beforeend', `<option value="${name}">${display}</option>`));
  localStorage.setItem(KEY_FIRST_STAGE_CACHE, JSON.stringify({ ts:Date.now(), species:firstStages }));
  sel.addEventListener('change', (e)=> actualizarPreviewPorSpecies(e.target.value));
  byId('chkShiny')?.addEventListener('change', ()=> actualizarPreviewPorSpecies(sel.value));
}

async function actualizarPreviewPorSpecies(speciesName){
  const imgPrev = byId('pokemonPreview'); if (!imgPrev) return;
  if (!speciesName){ imgPrev.removeAttribute('src'); imgPrev.style.display='none'; imgPrev.classList.remove('animate-idle'); return; }
  try{
    const species = await fetchSpecies(speciesName);
    const pokeName = getDefaultVarietyPokemonName(species);
    const detail = await fetchJson(POKE_API.pokemonByName(pokeName));
    const shiny = !!byId('chkShiny')?.checked;
    const src = shiny ? (detail.sprites?.front_shiny || '') : (detail.sprites?.front_default || '');
    if (src){ imgPrev.src = src; imgPrev.alt = pokeName; imgPrev.style.display='inline-block'; imgPrev.classList.add('animate-idle'); }
    else { imgPrev.removeAttribute('src'); imgPrev.style.display='none'; imgPrev.classList.remove('animate-idle'); }
  }catch{
    imgPrev.removeAttribute('src'); imgPrev.style.display='none'; imgPrev.classList.remove('animate-idle');
  }
}
async function obtenerSprite(name, shiny=false){
  try{
    const d = await fetchJson(POKE_API.pokemonByName(name));
    return shiny ? (d.sprites?.front_shiny || '') : (d.sprites?.front_default || '');
  }catch{ return ''; }
}

// ------------------------------ ECONOMÍA ------------------------------------
function inicializarInventario(){ pet.inventory = pet.inventory || {}; comidas.forEach(c => { if (pet.inventory[c.id]==null) pet.inventory[c.id]=1; }); }
function pagarRecompensaSiCorresponde(){
  const okSalud        = pet.salud >= CONFIG.umbralSalud;
  const okAlimentacion = pet.alimentacion >= CONFIG.umbralAlimentacionMin;
  const okFelicidad    = pet.felicidad >= CONFIG.umbralFelicidadMin;
  if (okSalud && okAlimentacion && okFelicidad){
    let ganancia = CONFIG.recompensaBase;
    if (scoreBienestar() > 65) ganancia += CONFIG.recompensaBonusScore;
    pet.money += ganancia;
    log(`Buen cuidado: +$${ganancia}. Dinero actual: $${pet.money}.`);
  }
}

// ------------------------------ LÓGICA DE JUEGO -----------------------------
function normalizar(){
  pet.alimentacion = clamp(pet.alimentacion, 0, ALIMENTACION_MAX);
  pet.felicidad    = clamp(pet.felicidad, 0, FELICIDAD_MAX);
  pet.salud        = clamp(pet.salud, 1, 100); // Salud mínima = 1
} // ← CORREGIDO: se cerraba faltando esta llave

function alimentar(idComida){
  if (!pet || paused) return;
  if (!pet.inventory[idComida] || pet.inventory[idComida] <= 0){ toast('No tienes esa baya en tu inventario.'); return; }
  const item = comidas.find(c=>c.id===idComida); if (!item){ toast('Esa baya no está disponible.'); return; }

  pet.alimentacion += item.dalimentacion;
  pet.felicidad    += item.dfelicidad;
  pet.inventory[idComida]--;
  normalizar();

  pulse(byId('mascotaImg'), 'animate-happy', 600);
  toast(`${item.msg} (${pet.nombre})`);
  render(); save(pet); updateEvoButton(); // por si subió a 100
}
function jugar(){
  if (!pet || paused) return;
  pet.felicidad += 5;
  pet.alimentacion += CONFIG.alimentacionPorJugar; // negativo
  normalizar();

  pulse(byId('mascotaImg'), 'animate-happy', 600);
  toast(`Jugaste con ${pet.nombre}. ¡Más felicidad!`);
  render(); save(pet); updateEvoButton();
}

// Avance de tiempo (auto + botón)
function pasarTiempo(){
  if (!pet) return;

  // Avance natural
  pet.alimentacion += CONFIG.alimentacionPorTick;
  pet.felicidad    += CONFIG.felicidadPorTick;
  normalizar();

  // Descuido → castigo de salud (mantiene mínimo 1)
  if (pet.alimentacion <= 0 || pet.felicidad <= 0){
    pet.salud -= CONFIG.saludCastigo; normalizar();
    log(`¡CUIDADO! La salud de ${pet.nombre} bajó por descuido.`);
  }

  // Buen estado → recuperación
  if (pet.alimentacion >= 10 && pet.felicidad >= 10 && pet.salud < 100){
    pet.salud += 5; if (pet.salud > 100) pet.salud = 100;
    log(`${pet.nombre} se siente bien cuidado y recupera salud.`);
  }

  // Progreso de evolución: solo con Salud = 100; si no, se reinicia
  if (!pet.evoFinal){
    if (pet.salud === 100){
      pet.ticksSaludMax = (pet.ticksSaludMax || 0) + 1;
    }else{
      if (pet.ticksSaludMax !== 0) log('Progreso de evolución reiniciado (salud baja).');
      pet.ticksSaludMax = 0;
    }
  }

  // Recompensas
  pagarRecompensaSiCorresponde();

  save(pet); render(); updateEvoButton();
}
function scoreBienestar(){
  const partes = [pet.salud/100, pet.alimentacion/ALIMENTACION_MAX, pet.felicidad/FELICIDAD_MAX];
  return Math.round((partes.reduce((a,b)=>a+b,0)/partes.length)*100);
}

// ------------------------------ RENDER --------------------------------------
function render(){
  if (!pet) return;

  qs('#tituloMascota').innerText = `${pet.nombre}`;

  const img = byId('mascotaImg');
  if (img){
    if (pet.sprite){ img.src = pet.sprite; img.alt = pet.nombre; img.style.display='block'; img.classList.add('animate-idle'); }
    else { img.removeAttribute('src'); img.style.display='none'; img.classList.remove('animate-idle'); }
  }

  byId('moneyLabel').innerText = `$${pet.money}`;

  qs('#chips').innerHTML = [
    `Salud ${pet.salud}/100`,
    `Alimentación ${pet.alimentacion}/${ALIMENTACION_MAX}`,
    `Felicidad ${pet.felicidad}/${FELICIDAD_MAX}`
  ].map(t=>`<span class="chip">${t}</span>`).join('');

  const setBar = (labelSel, barSel, val, max) => { const l = qs(labelSel); const b = qs(barSel); if (l) l.innerText = val; if (b) b.style.width = `${(val/max)*100}%`; };
  setBar('#saludLabel', '#saludBar', pet.salud, 100);
  setBar('#alimentacionLabel', '#alimentacionBar', pet.alimentacion, ALIMENTACION_MAX);
  setBar('#felicidadLabel', '#felicidadBar', pet.felicidad, FELICIDAD_MAX);
  qs('#alimentacionMaxLabel').innerText = ALIMENTACION_MAX;
  qs('#felicidadMaxLabel').innerText    = FELICIDAD_MAX;
  qs('#scoreLabel').innerText           = scoreBienestar();

  // Actualizar barra de evolución
  const evoCurr = pet.ticksSaludMax || 0;
  const evoMax  = CONFIG.evoTicksRequeridos;
  const evoLbl  = byId('evoTicksLabel');
  const evoLblM = byId('evoTicksMaxLabel');
  const evoBar  = byId('evoProgressBar');
  if (evoLbl)  evoLbl.textContent = String(evoCurr);
  if (evoLblM) evoLblM.textContent = String(evoMax);
  if (evoBar)  evoBar.style.width = `${Math.min(100, (evoCurr/evoMax)*100)}%`;

  // Alimentar
  const contAlim = qs('#comidas'); contAlim.classList.add('food-grid');
  const disponibles = comidas.filter(c => (pet.inventory[c.id] || 0) > 0);
  contAlim.innerHTML = disponibles.length
    ? disponibles.map(c => `
        <button class="btn food-btn" data-food="${c.id}" title="${c.label}">
          ${c.sprite ? `<img src="${c.sprite}" alt="${c.label}" />` : ''}
          <span>${c.label} (x${pet.inventory[c.id]})</span>
        </button>
      `).join('')
    : `<span class="muted">No tienes bayas en inventario. Abrí la Tienda.</span>`;
  qsa('[data-food]').forEach(btn => { btn.onclick = () => !paused && alimentar(btn.dataset.food); });

  // Inventario
  const inv = byId('inventario');
  inv.innerHTML = comidas.map(c => {
    const qty = pet.inventory[c.id] || 0;
    return `
      <div class="inv-item" title="${c.label}">
        ${c.sprite ? `<img src="${c.sprite}" alt="${c.label}" />` : ''}
        <span>${c.label}</span><span>·</span><strong>x${qty}</strong>
      </div>
    `;
  }).join('');

  renderLog();
  updateEvoButton();
}

// ---------- Tienda en pop-up (reutiliza IDs dentro del modal) ---------------
// [MOBILE] El ancho del modal se calcula a partir del viewport en abrirTienda()
function renderCatalogo(){
  const store = byId('storeList'); if (!store) return;
  store.innerHTML = (comidas || []).map(c => `
    <div class="store-card">
      <div style="display:flex; align-items:center; gap:8px;">
        ${c.sprite ? `<img src="${c.sprite}" alt="${c.label}" style="width:28px;height:28px;" />` : ''}
        <strong>${c.label}</strong>
      </div>
      <div class="muted">Alimentación: +${c.dalimentacion} | Felicidad: +${c.dfelicidad}</div>
      <div class="price">$${c.price}</div>
      <div class="qty-controls">
        <button class="qty-btn" data-add="${c.id}">+</button>
        <button class="qty-btn" data-sub="${c.id}">-</button>
        <span class="muted">En carrito: <strong>${carrito[c.id] || 0}</strong></span>
      </div>
    </div>
  `).join('');
  qsa('[data-add]').forEach(b => b.onclick = () => { addToCart(b.dataset.add); });
  qsa('[data-sub]').forEach(b => b.onclick = () => { subFromCart(b.dataset.sub); });
}
function renderShopMoney(){
  const m = byId('shopMoney'); if (m) m.innerText = `$${pet ? pet.money : 0}`;
}
function renderCarrito(){
  const cartBox = byId('cart');
  const totalEl = byId('cartTotal');
  if (!cartBox || !totalEl) return;

  const entries = Object.entries(carrito).filter(([,q]) => q > 0);

  if (!entries.length){
    cartBox.innerHTML = `<p class="muted">Tu carrito está vacío.</p>`;
    totalEl.innerText = `$0`;
    renderShopMoney();
    return;
  }

  cartBox.innerHTML = entries.map(([id, qty]) => {
    const prod = comidas.find(c => c.id === id);
    const subtotal = (prod?.price || 0) * qty;
    return `
      <div class="cart-item">
        <div style="display:flex; align-items:center; gap:8px;">
          ${prod?.sprite ? `<img src="${prod.sprite}" alt="${prod.label}" style="width:24px;height:24px;" />` : ''}
          <span>${prod?.label || id}</span>
        </div>
        <div class="qty-controls">
          <button class="qty-btn" data-sub="${id}">-</button>
          <strong>${qty}</strong>
          <button class="qty-btn" data-add="${id}">+</button>
        </div>
        <div><strong>$${subtotal}</strong></div>
      </div>
    `;
  }).join('');

  const total = entries.reduce((acc, [id, qty]) => acc + (precios[id] || 0) * qty, 0);
  totalEl.innerText = `$${total}`;

  qsa('#cart [data-add]').forEach(b => b.onclick = () => { addToCart(b.dataset.add); });
  qsa('#cart [data-sub]').forEach(b => b.onclick = () => { subFromCart(b.dataset.sub); });

  renderShopMoney();
}
function addToCart(id){ carrito[id] = (carrito[id] || 0) + 1; renderCatalogo(); renderCarrito(); }
function subFromCart(id){ if (!carrito[id]) return; carrito[id] = Math.max(0, carrito[id] - 1); renderCatalogo(); renderCarrito(); }
async function comprarCarrito(){
  const entries = Object.entries(carrito).filter(([, q]) => q > 0);
  if (!entries.length){ toast('El carrito está vacío.'); return; }
  const total = entries.reduce((acc,[id,qty]) => acc + (precios[id] || 0) * qty, 0);
  if (pet.money < total){ toast('Dinero insuficiente.'); return; }

  const res = await swalDark.fire({
    title:'Confirmar compra',
    html:`Vas a gastar <strong>$${total}</strong> en bayas.`,
    icon:'question', showCancelButton:true,
    confirmButtonText:'Comprar', cancelButtonText:'Cancelar'
  });
  if (!res.isConfirmed) return;

  pet.money -= total;
  entries.forEach(([id,qty]) => { pet.inventory[id] = (pet.inventory[id] || 0) + qty; });
  carrito = {};
  toast('¡Compra realizada!'); save(pet); render();
  // Actualizar visual dentro del pop-up
  renderShopMoney();
  renderCarrito();
}
async function abrirTienda(){
  // [MOBILE] Ancho adaptativo: 96% del ancho de pantalla o 900px (lo que sea menor)
  const modalWidth = Math.min(Math.floor(window.innerWidth * 0.96), 900);

  await swalDark.fire({
    title:'Tienda de Bayas',
    width: modalWidth,
    html: `
      <div class="swal-store">
        <div class="swal-columns">
          <div class="swal-col">
            <h3 class="subtitle small" style="margin-bottom:6px;">Catálogo</h3>
            <div id="storeList" class="store-grid" aria-live="polite"></div>
          </div>
          <div class="swal-col">
            <h3 class="subtitle small" style="margin-bottom:6px;">Carrito</h3>
            <p class="muted" style="margin:0 0 6px 0;">Dinero actual: <strong id="shopMoney">$0</strong></p>
            <div id="cart" class="cart-box" aria-live="polite"></div>
            <div class="cart-actions">
              <button id="btnVaciarCarrito" class="btn warn">Vaciar</button>
              <button id="btnComprar" class="btn">Comprar</button>
            </div>
            <p class="muted">Total: <strong id="cartTotal">$0</strong></p>
          </div>
        </div>
      </div>
    `,
    showConfirmButton:false,
    showCloseButton:true,
    didOpen: () => {
      renderCatalogo();
      renderCarrito();
      renderShopMoney();
      byId('btnVaciarCarrito')?.addEventListener('click', () => { carrito = {}; renderCatalogo(); renderCarrito(); });
      byId('btnComprar')?.addEventListener('click', comprarCarrito);
    }
  });
}

// ------------------------------ INSTRUCCIONES -------------------------------
function mostrarInstrucciones(){
  swalDark.fire({
    title:'Cómo se juega',
    html: `
      <div style="text-align:left; line-height:1.5">
        <p>
          Elegí tu <strong>Pokémon</strong> y cuidalo como una mascota virtual.
          Con el paso del tiempo, la <strong>alimentación</strong> y la <strong>felicidad</strong> bajan un poco.
        </p>
        <ul style="margin-left:1.1rem">
          <li>Alimentá con <strong>bayas</strong> para subir la alimentación y el ánimo.</li>
          <li><strong>Jugar</strong> sube felicidad (consume algo de alimentación).</li>
          <li>El tiempo avanza por <em>ticks</em> automáticos cada 5 segundos y con <strong>Pasar tiempo</strong>.</li>
          <li><strong>Evolución:</strong> mantené <strong>Salud al 100</strong> por un tiempo para habilitar el botón <em>Evolucionar</em>. Si la salud baja, el progreso se reinicia.</li>
          <li>La <strong>Tienda</strong> está disponible como pop-up desde el botón correspondiente.</li>
        </ul>
      </div>
    `,
    icon:'info', confirmButtonText:'Entendido', focusConfirm:true, width:600
  });
}

// ------------------------------ PAUSA (persistente) -------------------------
function setPausedUI(){
  const btnPausa = byId('btnPausa');
  const btnJugar = byId('btnJugar');
  const btnPasar = byId('btnPasar');
  if (btnPausa) btnPausa.textContent = paused ? 'Reanudar' : 'Pausa';
  if (btnJugar) btnJugar.disabled = paused;
  if (btnPasar) btnPasar.disabled = paused;
}
function setPaused(val, logMsg = true){
  paused = !!val;
  localStorage.setItem(KEY_PAUSED, paused ? '1' : '0');
  if (paused){ detenerTiempo(); if (logMsg) log('⏸ Juego en pausa.'); }
  else { iniciarTiempo(); if (logMsg) log('▶ Juego reanudado.'); }
  setPausedUI(); updateEvoButton();
}
function togglePausa(){ if (!pet) return; setPaused(!paused); }

// ------------------------------ TIEMPO --------------------------------------
function iniciarTiempo(){ if (timer) clearInterval(timer); if (paused) return; timer = setInterval(pasarTiempo, CONFIG.tickSegundos*1000); }
function detenerTiempo(){ if (timer) clearInterval(timer); timer = null; }

// ------------------------------ UI ESTADO -----------------------------------
function mostrarSoloBorrarGuardado(){
  byId('formCreacion').style.display='none';
  byId('formBorrar').style.display='flex';
}
function mostrarCreacion(){
  byId('formCreacion').style.display='flex';
  byId('formBorrar').style.display='none';
  const prev = byId('pokemonPreview');
  if (prev){ prev.removeAttribute('src'); prev.style.display='none'; prev.classList.remove('animate-idle'); }
}
function setGameVisible(present){
  document.body.classList.toggle('compact-game', !!present);
  qs('#game').style.display = present ? '' : 'none';
}

// ------------------------------ INICIO --------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // [MOBILE] Inicializa --appvh y vuelve a calcular en cambios de tamaño/orientación
  updateAppVh();
  window.addEventListener('resize', updateAppVh, { passive:true });
  window.addEventListener('orientationchange', updateAppVh);

  await cargarListaPokemonSoloPrimerasFases();
  await cargarComidasDesdePokeAPI();

  const saved = load();
  const pausedStored = localStorage.getItem(KEY_PAUSED) === '1';

  if (saved){
    pet = saved;
    setGameVisible(true);
    render();
    mostrarSoloBorrarGuardado();
    setPaused(pausedStored, false); // aplica pausa persistida SIN spamear log
    setPausedUI();
    await actualizarEvoFinalYUI();  // decide si ocultar evolución
  }else{
    setGameVisible(false);
    mostrarCreacion();
  }

  // Nueva partida
  byId('btnNueva').addEventListener('click', async () => {
    if (load()){ toast('Ya existe una partida. Borra el guardado para crear otra.'); return; }
    const speciesName = byId('pokemonSelect').value;
    if (!speciesName){ toast('Elegí un Pokémon para empezar.'); return; }

    const species = await fetchSpecies(speciesName);
    if (species.evolves_from_species){ toast('Solo puedes iniciar con Pokémon de 1ra fase.'); return; }

    const pokeName = getDefaultVarietyPokemonName(species);
    const shinySel = !!byId('chkShiny')?.checked;
    const sprite = await obtenerSprite(pokeName, shinySel);
    const pretty = species.name.replace(/\b\w/g, m => m.toUpperCase());

    pet = new Mascota(pretty, sprite);
    pet.species = species.name;
    pet.evoChainUrl = species.evolution_chain?.url || '';
    pet.evoStage = 0;
    pet.ticksSaludMax = 0;
    pet.evoFinal = false;
    pet.shiny = shinySel;

    // ¿La especie elegida tiene evoluciones?
    try{
      if (pet.evoChainUrl){
        const chain = await fetchJson(pet.evoChainUrl);
        const hasNext = !!findNextEvolutionSpeciesName(chain.chain, species.name);
        pet.evoFinal = !hasNext;
      }else{
        pet.evoFinal = true;
      }
    }catch{ pet.evoFinal = true; }

    inicializarInventario();

    save(pet);
    setGameVisible(true);
    render();
    mostrarSoloBorrarGuardado();
    setPaused(false); // nueva partida inicia sin pausa
    updateEvoButton();

    const firstShown = localStorage.getItem(KEY_FIRST_RUN);
    if (!firstShown){ mostrarInstrucciones(); localStorage.setItem(KEY_FIRST_RUN, '1'); }
  });

  // Borrar guardado
  byId('btnBorrar').addEventListener('click', async () => {
    const res = await swalDark.fire({
      title:'¿Borrar guardado?', text:'Perderás el progreso actual.',
      icon:'warning', showCancelButton:true,
      confirmButtonText:'Sí, borrar', cancelButtonText:'Cancelar'
    });
    if (!res.isConfirmed) return;

    clearSave(); detenerTiempo();
    localStorage.setItem(KEY_PAUSED,'0');
    pet = null; carrito = {};
    setGameVisible(false);
    toast('Guardado eliminado.');
    mostrarCreacion(); setPausedUI(); updateEvoButton(); renderLog();
  });

  // Acciones
  byId('btnJugar').addEventListener('click', () => !paused && pet && jugar());
  byId('btnPasar').addEventListener('click', (e) => {
    if (!pet || paused) return;
    const btn = e.currentTarget; btn.disabled = true;
    const prev = snapStats();
    log('⏱ Dejás pasar el tiempo…');
    pasarTiempo();
    pulse(byId('mascotaImg'), 'animate-happy', 450);
    const curr = snapStats(); const d = diffStats(prev, curr);
    if (d){
      toast(`Tick · Dinero ${d.dMoney} · Salud ${d.dSalud} · Alimentación ${d.dAlim} · Felicidad ${d.dFelicidad}`);
      log(`Resultado del tick → Dinero ${d.dMoney} | Salud ${d.dSalud} | Alimentación ${d.dAlim} | Felicidad ${d.dFelicidad}`);
    }
    setTimeout(()=>{ btn.disabled = false; }, 350);
  });

  // Evolución manual
  byId('btnEvolucionar').addEventListener('click', evolucionar);

  // Pop-up Tienda
  byId('btnTienda').addEventListener('click', abrirTienda);

  // Pausa/Reanudar (persistente)
  byId('btnPausa')?.addEventListener('click', togglePausa);

  // Instrucciones
  byId('btnInstrucciones')?.addEventListener('click', mostrarInstrucciones);
  byId('btnInstruccionesBorrar')?.addEventListener('click', mostrarInstrucciones);

  // Render inicial del log (si ya había eventos guardados)
  renderLog();
});
