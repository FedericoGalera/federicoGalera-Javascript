// =============================================================================
// Tamagochi + PokeAPI
// =============================================================================
// - Botón "Instrucciones" (SweetAlert2) en extremo derecho de la tarjeta
// - Pop-up de instrucciones en primer arranque (al crear "Nueva partida")
// - PokeAPI (Gen 1–3), economía, tienda+carrito, "Pasar tiempo" = tick real
// - Animaciones: idle (flotar) y happy (wiggle) en sprite
// =============================================================================

// ------------------------------ CONFIG --------------------------------------
const HAMBRE_MAX = 20;
const FELICIDAD_MAX = 20;

const CONFIG = {
  hambrePorJugar: 3,      // jugar: felicidad ↑, hambre ↑
  hambrePorTick: 2,       // por tick: hambre ↑
  felicidadPorTick: -1,   // por tick: felicidad ↓
  saludCastigo: 10,       // si hambre llena o felicidad vacía: salud ↓
  tickSegundos: 10,       // intervalo del tick automático (s)

  // Economía
  dineroInicial: 100,
  umbralSalud: 60,
  umbralHambreMax: 10,
  umbralFelicidadMin: 10,
  recompensaBase: 30,
  recompensaBonusScore: 25
};

// ------------------------------ POKEAPI -------------------------------------
const POKE_API = {
  berriesList: 'https://pokeapi.co/api/v2/berry?limit=64',
  // Gen 1–3 (Pokédex hasta #386)
  pokemonList: 'https://pokeapi.co/api/v2/pokemon?limit=386',
  pokemonByName: (name) => `https://pokeapi.co/api/v2/pokemon/${name}`
};

// ------------------------------ HELPERS -------------------------------------
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const qs  = (s, p = document) => p.querySelector(s);
const qsa = (s, p = document) => p.querySelectorAll(s);
const byId = (id) => document.getElementById(id);
const toast = (text) => Toastify({ text, duration: 2500, gravity: 'top', position: 'right' }).showToast();

const logBox = byId('log');
const log = (msg) => { if (!logBox) return; logBox.innerHTML = `<div>• ${msg}</div>` + logBox.innerHTML; };

// Dispara una clase temporal (para animaciones cortas)
function pulse(el, cls, ms = 600) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // reflow
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

// Snap/Diff de stats para toasts informativos al pasar tiempo
function snapStats() {
  if (!pet) return null;
  return { salud: pet.salud, hambre: pet.hambre, felicidad: pet.felicidad, money: pet.money };
}
function diffStats(prev, curr) {
  if (!prev || !curr) return null;
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  return {
    dMoney: sign(curr.money - prev.money),
    dSalud: sign(curr.salud - prev.salud),
    dHambre: sign(curr.hambre - prev.hambre),
    dFelicidad: sign(curr.felicidad - prev.felicidad),
  };
}

// ------------------------------ MODELO --------------------------------------
class Mascota {
  constructor(nombre, sprite = '') {
    this.nombre = nombre;
    this.sprite = sprite;

    this.salud = 100;
    this.hambre = 10;
    this.felicidad = 10;
    this.viva = true;

    this.money = CONFIG.dineroInicial;
    this.inventory = {}; // { idDeBaya: cantidad }
  }
}

// ------------------------------ PERSISTENCIA --------------------------------
const KEY_SAVE      = 'tamagochi_save_unico_v6';
const KEY_BERRIES   = 'berries_cache_v2';
const KEY_POKELIST  = 'pokemon_list_cache_v2';
const KEY_FIRST_RUN = 'tamagochi_first_run_shown_v1'; // para no repetir instrucciones

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

let comidas = [];
let precios = {};
let carrito = {};

// ------------------------------ FETCH UTILS ---------------------------------
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ------------------------------ BAYAS / CATÁLOGO ----------------------------
const FIRMNESS_FACTORS = {
  'very-soft': 0.95, 'soft': 1.00, 'hard': 1.10, 'very-hard': 1.20, 'super-hard': 1.30
};
function growthFactor(t) { return clamp(1 + (t / 50), 1, 1.5); }

function mapBerryToFood(berry, item) {
  const size = berry.size ?? 20;
  const totalFlavor = (berry.flavors || []).reduce((acc, f) => acc + (f.potency || 0), 0);

  const dhambre    = -clamp(Math.round(size / 30) + 2, 2, 10);
  const dfelicidad =  clamp(Math.round(totalFlavor / 12) || 1, 1, 8);

  const firmnessName = berry.firmness?.name ?? 'soft';
  const priceBase = 5 + (Math.abs(dhambre) * 2 + dfelicidad * 3);
  const price = Math.max(5, Math.round(priceBase * (FIRMNESS_FACTORS[firmnessName] ?? 1) * growthFactor(berry.growth_time)));

  return {
    id: berry.name,
    label: berry.name.replace(/\b\w/g, m => m.toUpperCase()),
    dhambre, dfelicidad,
    msg: `¡${item.name.replace(/\b\w/g, m => m.toUpperCase())} nutritiva!`,
    sprite: item.sprites?.default || '',
    price
  };
}

const COMIDAS_FALLBACK = [
  { id:'baya',     label:'Baya',     dhambre:-8, dfelicidad:+2, msg:'¡Baya saludable!',    sprite:'', price: 27 },
  { id:'manzana',  label:'Manzana',  dhambre:-8, dfelicidad:+2, msg:'¡Manzana saludable!', sprite:'', price: 27 },
  { id:'caramelo', label:'Caramelo', dhambre:-3, dfelicidad:+6, msg:'¡Caramelo delicioso!',sprite:'', price: 29 },
];

async function cargarComidasDesdePokeAPI() {
  // Cache 24h
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

  results.forEach(({ name }) => {
    const label = name.replace(/\b\w/g, m => m.toUpperCase());
    sel.insertAdjacentHTML('beforeend', `<option value="${name}">${label}</option>`);
  });

  sel.addEventListener('change', (e) => actualizarPreviewPokemon(e.target.value));
}

async function actualizarPreviewPokemon(name) {
  const imgPrev = byId('pokemonPreview');
  if (!imgPrev) return;
  if (!name) { imgPrev.removeAttribute('src'); imgPrev.style.display = 'none'; imgPrev.classList.remove('animate-idle'); return; }
  try {
    const detail = await fetchJson(POKE_API.pokemonByName(name));
    const src = detail.sprites?.front_default || '';
    if (src) {
      imgPrev.src = src; imgPrev.alt = name; imgPrev.style.display = 'inline-block';
      imgPrev.classList.add('animate-idle'); // flotando en el preview
    } else {
      imgPrev.removeAttribute('src'); imgPrev.style.display = 'none'; imgPrev.classList.remove('animate-idle');
    }
  } catch {
    imgPrev.removeAttribute('src'); imgPrev.style.display = 'none'; imgPrev.classList.remove('animate-idle');
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

function pagarRecompensaSiCorresponde() {
  const okSalud     = pet.salud >= CONFIG.umbralSalud;
  const okHambre    = pet.hambre <= CONFIG.umbralHambreMax;
  const okFelicidad = pet.felicidad >= CONFIG.umbralFelicidadMin;

  if (okSalud && okHambre && okFelicidad) {
    let ganancia = CONFIG.recompensaBase;
    if (scoreBienestar() > 65) ganancia += CONFIG.recompensaBonusScore;
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

  pulse(byId('mascotaImg'), 'animate-happy', 600);
  toast(`${item.msg} (${pet.nombre})`);
  render();
  save(pet);
}

function jugar() {
  pet.felicidad += 5;
  pet.hambre    += CONFIG.hambrePorJugar;
  normalizar();

  pulse(byId('mascotaImg'), 'animate-happy', 600);
  toast(`Jugaste con ${pet.nombre}. ¡Más felicidad!`);
  render();
  save(pet);
}

// TICK real: Se ejecuta automático y también con el botón "Pasar tiempo"
function pasarTiempo() {
  if (!pet || !pet.viva) return;

  // Aumenta hambre, baja felicidad (tick natural)
  pet.hambre    += CONFIG.hambrePorTick;
  pet.felicidad += CONFIG.felicidadPorTick;
  normalizar();

  // Si descuidado -> castigo en salud
  if (pet.hambre >= HAMBRE_MAX || pet.felicidad <= 0) {
    pet.salud -= CONFIG.saludCastigo;
    normalizar();
    log(`¡CUIDADO! La salud de ${pet.nombre} bajó por descuido.`);
  }

  // 🔹 NUEVA LÓGICA: si está bien cuidado, recupera salud
  if (pet.hambre <= 10 && pet.felicidad >= 10 && pet.salud < 100) {
    pet.salud += 5; // podés ajustar cuánto regenera
    if (pet.salud > 100) pet.salud = 100;
    log(`${pet.nombre} se siente bien cuidado y recupera salud.`);
  }

  // Pago de recompensa si corresponde
  pagarRecompensaSiCorresponde();

  // Verificar muerte
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
    if (pet.sprite) {
      img.src = pet.sprite; img.alt = pet.nombre; img.style.display = 'block';
      img.classList.add('animate-idle'); // flotando por defecto
    } else {
      img.removeAttribute('src'); img.style.display = 'none'; img.classList.remove('animate-idle');
    }
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

// ------------------------------ INSTRUCCIONES -------------------------------
// Pop-up
function mostrarInstrucciones() {
  Swal.fire({
    title: 'Cómo se juega',
    html: `
      <div style="text-align:left; line-height:1.5">
        <p>
          Elegí tu <strong>Pokémon</strong> y cuidalo como una mascota virtual.
          Con el paso del tiempo, el <strong>hambre aumenta</strong> y la <strong>felicidad disminuye</strong>.
        </p>
        <ul style="margin-left:1.1rem">
          <li>Alimentá con <strong>bayas</strong> para reducir el hambre y mejorar el ánimo.</li>
          <li>Usá <strong>Jugar</strong> para subir la felicidad (incrementa un poco el hambre).</li>
          <li>El tiempo avanza automáticamente por <em>ticks</em> y también con <strong>Pasar tiempo</strong>.</li>
          <li>Si el cuidado es bueno, <strong>ganás dinero</strong> periódicamente.</li>
          <li>Invertí el dinero en la <strong>Tienda</strong> para comprar más bayas con el <strong>carrito</strong>.</li>
        </ul>
        <p class="muted" style="margin-top:.5rem">
          Consejo: evitá que el hambre llegue al máximo o que la felicidad llegue a cero, o la salud se verá afectada.
        </p>
      </div>
    `,
    icon: 'info',
    confirmButtonText: 'Entendido',
    focusConfirm: true,
    width: 600
  });
}

// Botones Instrucciones (ambos casos: creación y borrado)
byId('btnInstrucciones').addEventListener('click', mostrarInstrucciones);
byId('btnInstruccionesBorrar').addEventListener('click', mostrarInstrucciones);

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
  if (prev) { prev.removeAttribute('src'); prev.style.display = 'none'; prev.classList.remove('animate-idle'); }
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

  // Botón Instrucciones (siempre disponible)
  byId('btnInstrucciones').addEventListener('click', mostrarInstrucciones);

  // Nueva partida: crea la mascota y muestra instrucciones SOLO la primera vez
  byId('btnNueva').addEventListener('click', async () => {
    if (load()) { toast('Ya existe una partida. Borra el guardado para crear otra.'); return; }
    const name = byId('pokemonSelect').value;
    if (!name) { toast('Elegí un Pokémon para empezar.'); return; }

    const sprite = await obtenerSprite(name);
    const pretty = name.replace(/\b\w/g, m => m.toUpperCase());

    pet = new Mascota(pretty, sprite);
    inicializarInventario();

    save(pet);
    qs('#game').style.display = '';
    render();
    iniciarTiempo();
    log(`¡Ha nacido tu nueva mascota: ${pet.nombre}}!`);
    mostrarSoloBorrarGuardado();

    // Primer arranque: mostrar instrucciones una sola vez por navegador
    const firstShown = localStorage.getItem(KEY_FIRST_RUN);
    if (!firstShown) {
      mostrarInstrucciones();
      localStorage.setItem(KEY_FIRST_RUN, '1');
    }
  });

  // Borrar guardado
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

  // Jugar
  byId('btnJugar').addEventListener('click', () => pet && pet.viva && jugar());

  // Pasar tiempo = tick real + resumen + anti-spam
  byId('btnPasar').addEventListener('click', (e) => {
    if (!pet || !pet.viva) return;
    const btn = e.currentTarget;

    btn.disabled = true;                 // anti-spam
    const prev = snapStats();            // snapshot

    log('⏱ Dejás pasar el tiempo…');
    pasarTiempo();                       // aplica tick real
    pulse(byId('mascotaImg'), 'animate-happy', 450); // feedback visual sutil

    const curr = snapStats();
    const d = diffStats(prev, curr);
    if (d) {
      toast(`Tick aplicado · Dinero ${d.dMoney} · Salud ${d.dSalud} · Hambre ${d.dHambre} · Felicidad ${d.dFelicidad}`);
      log(`Resultado del tick → Dinero ${d.dMoney} | Salud ${d.dSalud} | Hambre ${d.dHambre} | Felicidad ${d.dFelicidad}`);
    }

    setTimeout(() => { btn.disabled = false; }, 350);
  });

  // Carrito
  byId('btnVaciarCarrito').addEventListener('click', () => { carrito = {}; renderCatalogo(); renderCarrito(); });
  byId('btnComprar').addEventListener('click', comprarCarrito);
});
