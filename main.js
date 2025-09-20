// =============================================================================
// Tamagochi + PokeAPI + Economía (Gen 1–3; UI sin Firmness/Growth; más dinero por tick)
// =============================================================================
// - Bayas remotas (PokeAPI) con caché y fallback
// - Inventario inicial limitado y consumo al alimentar
// - Dinero, ingreso pasivo por “buen cuidado” (aumentado)
// - Tienda con precios derivados internamente (no se muestran Firmness/Growth)
// - UI generada desde JS, asincronismo, toasts y modales
// =============================================================================

// ------------------------------ CONFIG --------------------------------------
const HAMBRE_MAX = 20;
const FELICIDAD_MAX = 20;
const CONFIG = {
  hambrePorJugar: 3,
  hambrePorTick: 2,
  felicidadPorTick: -1,
  saludCastigo: 10,
  tickSegundos: 10,

  // Economía
  dineroInicial: 50,
  umbralSalud: 80,
  umbralHambreMax: 8,
  umbralFelicidadMin: 12,
  recompensaBase: 28,    
  recompensaBonusScore: 25 
};

// PokeAPI endpoints
const POKE_API = {
  berriesList: 'https://pokeapi.co/api/v2/berry?limit=64',
  // Limitamos a Gen 1–3: 386 primeros por Pokédex Nacional
  pokemonList: 'https://pokeapi.co/api/v2/pokemon?limit=386',
  pokemonByName: (name) => `https://pokeapi.co/api/v2/pokemon/${name}`
};

// ------------------------------ HELPERS -------------------------------------
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const qs  = (s, p = document) => p.querySelector(s);
const qsa = (s, p = document) => p.querySelectorAll(s);
const byId = (id) => document.getElementById(id);
const toast = (text) => Toastify({ text, duration: 2500, gravity: 'top', position: 'right' }).showToast();

// Log visual
const logBox = byId('log');
const log = (msg) => { if (!logBox) return; logBox.innerHTML = `<div>• ${msg}</div>` + logBox.innerHTML; };

// ------------------------------ MODELO --------------------------------------
class Mascota {
  constructor(nombre, sprite = '') {
    this.nombre = nombre;
    this.sprite = sprite;

    // Stats
    this.salud = 100;
    this.hambre = 10;
    this.felicidad = 10;
    this.viva = true;

    // Economía e inventario
    this.money = CONFIG.dineroInicial;
    this.inventory = {}; // { idDeBaya: cantidad }
  }
}

// ------------------------------ PERSISTENCIA --------------------------------
const KEY_SAVE     = 'tamagochi_save_unico_v6'; // bump por cambios de economía/UI
const KEY_BERRIES  = 'berries_cache_v2';
const KEY_POKELIST = 'pokemon_list_cache_v2';

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
    return p;
  } catch { return null; }
}
function clearSave() { localStorage.removeItem(KEY_SAVE); }

// ------------------------------ ESTADO --------------------------------------
let pet = null;
let timer = null;
let pokemonMap = new Map();

let comidas = [];         // catálogo derivado de PokeAPI berry+item
let precios = {};         // { id: precio }
let carrito = {};         // { id: cantidad }

// ------------------------------ FETCH UTILS ---------------------------------
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ------------------------------ PRECIOS -------------------------------------
// Nota: seguimos usando “rareza” interna para variedad, pero no se muestra.
const FIRMNESS_FACTORS = {
  'very-soft': 0.95,
  'soft': 1.00,
  'hard': 1.10,
  'very-hard': 1.20,
  'super-hard': 1.30
};
function growthFactor(growth_time) {
  const t = Number.isFinite(growth_time) ? growth_time : 0;
  return clamp(1 + (t / 50), 1, 1.5);
}

// ------------------------------ BAYAS / CATÁLOGO ----------------------------
function mapBerryToFood(berry, item) {
  const size = berry.size ?? 20;
  const totalFlavor = (berry.flavors || []).reduce((acc, f) => acc + (f.potency || 0), 0);

  // Efectos de juego
  const dhambre    = -clamp(Math.round(size / 30) + 2, 2, 10);        // más negativo = más saciedad
  const dfelicidad =  clamp(Math.round(totalFlavor / 12) || 1, 1, 8); // felicidad

  // Precio calculado por efectividad
  const firmnessName = berry.firmness?.name ?? 'soft';
  const fFirmness = FIRMNESS_FACTORS[firmnessName] ?? 1.0;
  const fGrowth   = growthFactor(berry.growth_time);

  const base = 5 + (Math.abs(dhambre) * 2 + dfelicidad * 3);
  const price = Math.max(5, Math.round(base * fFirmness * fGrowth));

  return {
    id: berry.name,
    label: berry.name.replace(/\b\w/g, m => m.toUpperCase()),
    dhambre,
    dfelicidad,
    msg: `¡${item.name.replace(/\b\w/g, m => m.toUpperCase())} nutritiva!`,
    sprite: item.sprites?.default || '',
    price
  };
}

const COMIDAS_FALLBACK = [
  { id:'baya',     label:'Baya',     dhambre:-8, dfelicidad:+2, msg:'¡Baya saludable!',    sprite:'', price: (5 + 16 + 6) },
  { id:'manzana',  label:'Manzana',  dhambre:-8, dfelicidad:+2, msg:'¡Manzana saludable!', sprite:'', price: (5 + 16 + 6) },
  { id:'caramelo', label:'Caramelo', dhambre:-3, dfelicidad:+6, msg:'¡Caramelo delicioso!',sprite:'', price: (5 + 6 + 18) },
];

async function cargarComidasDesdePokeAPI() {
  const cached = localStorage.getItem(KEY_BERRIES);
  if (cached) {
    try {
      const { ts, foods } = JSON.parse(cached);
      if (Date.now() - ts < 24 * 60 * 60 * 1000 && foods?.length) {
        comidas = foods;
        precios = Object.fromEntries(comidas.map(c => [c.id, c.price]));
        renderCatalogo();
        return;
      }
    } catch { /* ignore */ }
  }

  try {
    const list = await fetchJson(POKE_API.berriesList);
    const picks = [...list.results].sort(() => Math.random() - 0.5).slice(0, 6);
    const berries = await Promise.all(picks.map(p => fetchJson(p.url)));
    const items   = await Promise.all(berries.map(b => fetchJson(b.item.url)));
    comidas = berries.map((b, i) => mapBerryToFood(b, items[i]));
    localStorage.setItem(KEY_BERRIES, JSON.stringify({ ts: Date.now(), foods: comidas }));
    precios = Object.fromEntries(comidas.map(c => [c.id, c.price]));
    renderCatalogo();
  } catch {
    comidas = COMIDAS_FALLBACK;
    precios = Object.fromEntries(comidas.map(c => [c.id, c.price]));
    renderCatalogo();
    log('No se pudieron cargar bayas desde PokeAPI; usando catálogo local.');
  }
}

// ------------------------------ SELECTOR POKÉMON ----------------------------
async function cargarListaPokemon() {
  const sel = byId('pokemonSelect');
  if (!sel) return;
  sel.innerHTML = `<option value="" disabled selected>Elige tu Pokémon.</option>`;

  let results;
  const cached = localStorage.getItem(KEY_POKELIST);
  if (cached) {
    try {
      const { ts, list } = JSON.parse(cached);
      if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000 && list?.length) results = list;
    } catch { /* ignore */ }
  }
  if (!results) {
    const data = await fetchJson(POKE_API.pokemonList);
    results = data.results;
    localStorage.setItem(KEY_POKELIST, JSON.stringify({ ts: Date.now(), list: results }));
  }

  results.forEach(({ name, url }) => {
    pokemonMap.set(name, url);
    const label = name.replace(/\b\w/g, m => m.toUpperCase());
    sel.insertAdjacentHTML('beforeend', `<option value="${name}">${label}</option>`);
  });

  sel.addEventListener('change', (e) => actualizarPreviewPokemon(e.target.value));
}

async function actualizarPreviewPokemon(name) {
  const imgPrev = byId('pokemonPreview');
  if (!imgPrev) return;
  if (!name) { imgPrev.removeAttribute('src'); imgPrev.style.display = 'none'; return; }
  try {
    const detail = await fetchJson(POKE_API.pokemonByName(name));
    const src = detail.sprites?.front_default || '';
    if (src) { imgPrev.src = src; imgPrev.alt = name; imgPrev.style.display = 'inline-block'; }
    else { imgPrev.removeAttribute('src'); imgPrev.style.display = 'none'; }
  } catch {
    imgPrev.removeAttribute('src'); imgPrev.style.display = 'none';
  }
}
async function obtenerSprite(name) {
  try { const d = await fetchJson(POKE_API.pokemonByName(name)); return d.sprites?.front_default || ''; }
  catch { return ''; }
}

// ------------------------------ ECONOMÍA ------------------------------------
function inicializarInventario() {
  pet.inventory = pet.inventory || {};
  comidas.forEach(c => { if (pet.inventory[c.id] == null) pet.inventory[c.id] = 1; });
}

// Ingreso pasivo por “buen cuidado”
function pagarRecompensaSiCorresponde() {
  const okSalud = pet.salud >= CONFIG.umbralSalud;
  const okHambre = pet.hambre <= CONFIG.umbralHambreMax;
  const okFelicidad = pet.felicidad >= CONFIG.umbralFelicidadMin;

  if (okSalud && okHambre && okFelicidad) {
    let ganancia = CONFIG.recompensaBase;
    const score = scoreBienestar();
    if (score > 65) ganancia += CONFIG.recompensaBonusScore;
    pet.money += ganancia;
    log(`Buen cuidado: +$${ganancia}. Dinero actual: $${pet.money}.`);
  }
}

// ------------------------------ LÓGICA DE JUEGO -----------------------------
function normalizar() {
  pet.hambre    = clamp(pet.hambre, 0, HAMBRE_MAX);
  pet.felicidad = clamp(pet.felicidad, 0, FELICIDAD_MAX);
  pet.salud     = clamp(pet.salud, 0, 100);
}

function alimentar(idComida) {
  if (!pet.inventory[idComida] || pet.inventory[idComida] <= 0) {
    toast('No tienes esa baya en tu inventario.');
    return;
  }
  const item = comidas.find(c => c.id === idComida);
  if (!item) { toast('Esa baya no está disponible.'); return; }

  pet.hambre    += item.dhambre;
  pet.felicidad += item.dfelicidad;
  pet.inventory[idComida]--;
  normalizar();

  toast(`${item.msg} (${pet.nombre})`);
  render();
  save(pet);
}

function jugar() {
  pet.felicidad += 5;
  pet.hambre    += CONFIG.hambrePorJugar;
  normalizar();
  toast(`Jugaste con ${pet.nombre}. ¡Más felicidad!`);
  render();
  save(pet);
}

function pasarTiempo() {
  if (!pet || !pet.viva) return;

  pet.hambre    += CONFIG.hambrePorTick;
  pet.felicidad += CONFIG.felicidadPorTick;
  normalizar();

  if (pet.hambre >= HAMBRE_MAX || pet.felicidad <= 0) {
    pet.salud -= CONFIG.saludCastigo;
    normalizar();
    log(`¡CUIDADO! La salud de ${pet.nombre} bajó por descuido.`);
  }

  pagarRecompensaSiCorresponde();

  if (pet.salud <= 0) {
    pet.viva = false;
    log(`${pet.nombre} no ha podido sobrevivir. Fin del juego.`);
    detenerTiempo();
  }

  save(pet);
  render();
}

function scoreBienestar() {
  const partes = [
    pet.salud / 100,
    1 - (pet.hambre / HAMBRE_MAX),
    pet.felicidad / FELICIDAD_MAX
  ];
  return Math.round((partes.reduce((a,b)=>a+b,0) / partes.length) * 100);
}

// ------------------------------ RENDER --------------------------------------
function render() {
  if (!pet) return;

  qs('#tituloMascota').innerText = `${pet.nombre} ${pet.viva ? '' : '(✖)'}`;
  const img = byId('mascotaImg');
  if (img) {
    if (pet.sprite) { img.src = pet.sprite; img.alt = pet.nombre; img.style.display = 'block'; }
    else { img.removeAttribute('src'); img.style.display = 'none'; }
  }

  byId('moneyLabel').innerText = `$${pet.money}`;

  qs('#chips').innerHTML = [
    `Salud ${pet.salud}/100`,
    `Hambre ${pet.hambre}/${HAMBRE_MAX}`,
    `Felicidad ${pet.felicidad}/${FELICIDAD_MAX}`
  ].map(t => `<span class="chip">${t}</span>`).join('');

  const setBar = (labelSel, barSel, val, max) => {
    qs(labelSel).innerText = val;
    qs(barSel).style.width = `${(val/max)*100}%`;
  };
  setBar('#saludLabel', '#saludBar', pet.salud, 100);
  setBar('#hambreLabel', '#hambreBar', pet.hambre, HAMBRE_MAX);
  setBar('#felicidadLabel', '#felicidadBar', pet.felicidad, FELICIDAD_MAX);
  qs('#hambreMaxLabel').innerText = HAMBRE_MAX;
  qs('#felicidadMaxLabel').innerText = FELICIDAD_MAX;
  qs('#scoreLabel').innerText = scoreBienestar();

  // Alimentar desde inventario
  const contAlim = qs('#comidas');
  contAlim.classList.add('food-grid');
  const disponibles = comidas.filter(c => (pet.inventory[c.id] || 0) > 0);
  contAlim.innerHTML = disponibles.length
    ? disponibles.map(c => `
        <button class="btn food-btn" data-food="${c.id}" title="${c.label}">
          ${c.sprite ? `<img src="${c.sprite}" alt="${c.label}" />` : ''}
          <span>${c.label} (x${pet.inventory[c.id]})</span>
        </button>
      `).join('')
    : `<span class="muted">No tienes bayas en inventario. Compra en la Tienda.</span>`;
  qsa('[data-food]').forEach(btn => { btn.onclick = () => pet.viva && alimentar(btn.dataset.food); });

  // Inventario visual
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

  // Catálogo y carrito
  renderCatalogo();
  renderCarrito();
}

function renderCatalogo() {
  const store = byId('storeList');
  if (!store) return;
  store.innerHTML = (comidas || []).map(c => `
    <div class="store-card">
      <div style="display:flex; align-items:center; gap:8px;">
        ${c.sprite ? `<img src="${c.sprite}" alt="${c.label}" style="width:28px;height:28px;" />` : ''}
        <strong>${c.label}</strong>
      </div>
      <div class="muted">Saciedad: ${Math.abs(c.dhambre)} | Felicidad: ${c.dfelicidad}</div>
      <!-- Firmness/Growth ocultos en UI a pedido -->
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

function renderCarrito() {
  const cartBox = byId('cart');
  const totalEl = byId('cartTotal');
  const entries = Object.entries(carrito).filter(([,q]) => q > 0);

  if (!entries.length) {
    cartBox.innerHTML = `<p class="muted">Tu carrito está vacío.</p>`;
    totalEl.innerText = `$0`;
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
}

function addToCart(id) {
  carrito[id] = (carrito[id] || 0) + 1;
  renderCatalogo(); renderCarrito();
}
function subFromCart(id) {
  if (!carrito[id]) return;
  carrito[id] = Math.max(0, carrito[id] - 1);
  renderCatalogo(); renderCarrito();
}

async function comprarCarrito() {
  const entries = Object.entries(carrito).filter(([, q]) => q > 0);
  if (!entries.length) { toast('El carrito está vacío.'); return; }

  const total = entries.reduce((acc, [id, qty]) => acc + (precios[id] || 0) * qty, 0);
  if (pet.money < total) { toast('Dinero insuficiente.'); return; }

  const res = await Swal.fire({
    title: 'Confirmar compra',
    html: `Vas a gastar <strong>$${total}</strong> en bayas.`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Comprar',
    cancelButtonText: 'Cancelar'
  });
  if (!res.isConfirmed) return;

  pet.money -= total;
  entries.forEach(([id, qty]) => {
    pet.inventory[id] = (pet.inventory[id] || 0) + qty;
  });
  carrito = {};

  toast('¡Compra realizada!');
  save(pet);
  render();
}

function vaciarCarrito() { carrito = {}; renderCatalogo(); renderCarrito(); }

// ------------------------------ TIEMPO --------------------------------------
function iniciarTiempo() {
  if (timer) clearInterval(timer);
  timer = setInterval(pasarTiempo, CONFIG.tickSegundos * 1000);
}
function detenerTiempo() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ------------------------------ UI ESTADO -----------------------------------
function mostrarSoloBorrarGuardado() {
  byId('formCreacion').style.display = 'none';
  byId('formBorrar').style.display   = 'flex';
}
function mostrarCreacion() {
  byId('formCreacion').style.display = 'flex';
  byId('formBorrar').style.display   = 'none';
  const prev = byId('pokemonPreview');
  if (prev) { prev.removeAttribute('src'); prev.style.display = 'none'; }
}

// ------------------------------ INICIO --------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await cargarListaPokemon();
  await cargarComidasDesdePokeAPI();

  const saved = load();
  if (saved) {
    pet = saved;
    qs('#game').style.display = '';
    if (!pet.inventory) pet.inventory = {};
    if (typeof pet.money !== 'number') pet.money = CONFIG.dineroInicial;
    render();
    iniciarTiempo();
    mostrarSoloBorrarGuardado();
  } else {
    mostrarCreacion();
  }

  byId('btnNueva').addEventListener('click', async () => {
    if (load()) { toast('Ya existe una partida. Borra el guardado para crear otra.'); return; }
    const name = byId('pokemonSelect').value;
    if (!name) { toast('Elegí un Pokémon para empezar.'); return; }

    const sprite = await obtenerSprite(name);
    const pretty = name.replace(/\b\w/g, m => m.toUpperCase());

    pet = new Mascota(pretty, sprite);
    inicializarInventario(); // 1 unidad de cada baya al iniciar

    save(pet);
    qs('#game').style.display = '';
    render();
    iniciarTiempo();
    log(`¡Ha nacido tu nueva mascota: ${pet.nombre}!`);
    mostrarSoloBorrarGuardado();
  });

  byId('btnBorrar').addEventListener('click', async () => {
    const res = await Swal.fire({
      title: '¿Borrar guardado?',
      text: 'Perderás el progreso actual.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Cancelar'
    });
    if (!res.isConfirmed) return;

    clearSave(); detenerTiempo();
    pet = null; carrito = {};
    qs('#game').style.display = 'none';
    toast('Guardado eliminado.');
    mostrarCreacion();
  });

  byId('btnJugar').addEventListener('click', () => pet && pet.viva && jugar());
  byId('btnPasar').addEventListener('click', () => pet && pet.viva && (log('Dejas pasar el tiempo...'), pasarTiempo()));

  byId('btnVaciarCarrito').addEventListener('click', vaciarCarrito);
  byId('btnComprar').addEventListener('click', comprarCarrito);
});
