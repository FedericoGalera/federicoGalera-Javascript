// Constantes de límites máximos
const HAMBRE_MAX = 20;
const FELICIDAD_MAX = 20;

// Configuración de la lógica del juego
const CONFIG = {
  hambrePorJugar: 3,   // cuánto aumenta el hambre al jugar
  hambrePorTick: 2,    // cuánto aumenta el hambre en cada intervalo de tiempo
  felicidadPorTick: -1,// cuánto baja la felicidad en cada intervalo
  saludCastigo: 10,    // daño a la salud si hambre/felicidad son críticas
  tickSegundos: 5      // cada cuántos segundos pasa el tiempo automáticamente
};

// ==== Funciones auxiliares ====
const clamp = (v, min, max) => Math.min(max, Math.max(min, v)); // mantener valores en rango
const qs  = (sel, parent=document) => parent.querySelector(sel); 
const qsa = (sel, parent=document) => parent.querySelectorAll(sel);
const byId = id => document.getElementById(id);

// Caja de logs (para mostrar eventos en pantalla)
const logBox = byId('log');
const log = (msg) => { 
  if (!logBox) return; 
  logBox.innerHTML = `<div>• ${msg}</div>` + logBox.innerHTML; 
};

// ==== Modelo de Mascota (usamos clase como función constructora moderna) ====
class Mascota {
  constructor(nombre) {
    this.nombre = nombre;
    this.salud = 100;
    this.hambre = 10;
    this.felicidad = 10;
    this.viva = true;
  }
}

// Array de comidas con efectos (alto orden: datos → interfaz)
const comidas = [
  { id:"baya",     label:"Baya",     dhambre:-8, dfelicidad:+2, msg:"¡Baya saludable!" },
  { id:"manzana",  label:"Manzana",  dhambre:-8, dfelicidad:+2, msg:"¡Manzana saludable!" },
  { id:"caramelo", label:"Caramelo", dhambre:-3, dfelicidad:+6, msg:"¡Caramelo delicioso!" }
];

// ==== Persistencia con localStorage (guardar/cargar estado) ====
const KEY = "tamagochi_save_v2";

function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const p = new Mascota(data.nombre);
    Object.assign(p, data); // restauramos los atributos
    return p;
  } catch { return null; }
}

function clearSave() { localStorage.removeItem(KEY); }

// ==== Variables de estado global ====
let pet = null;          // la mascota activa
let timer = null;        // id del intervalo de tiempo

// ==== Funciones de lógica ====
function normalizar() {
  pet.hambre    = clamp(pet.hambre, 0, HAMBRE_MAX);
  pet.felicidad = clamp(pet.felicidad, 0, FELICIDAD_MAX);
  pet.salud     = clamp(pet.salud, 0, 100);
}

function alimentar(idComida) {
  const item = comidas.filter(c => c.id === idComida)[0];
  if (!item) { log("Comida inválida."); return; }
  pet.hambre    += item.dhambre;
  pet.felicidad += item.dfelicidad;
  normalizar();
  log(`${item.msg} (${pet.nombre})`);
  render();
  save(pet);
}

function jugar() {
  pet.felicidad += 5;
  pet.hambre += CONFIG.hambrePorJugar;
  normalizar();
  log(`Jugaste con ${pet.nombre}. ¡Más felicidad!`);
  render();
  save(pet);
}

// Esta función se ejecutará tanto manualmente como automáticamente con setInterval
function pasarTiempo() {
  if (!pet || !pet.viva) return;

  pet.hambre    += CONFIG.hambrePorTick;
  pet.felicidad += CONFIG.felicidadPorTick;
  normalizar();

  // Penalizamos la salud si hambre o felicidad son críticas
  if (pet.hambre >= HAMBRE_MAX || pet.felicidad <= 0) {
    pet.salud -= CONFIG.saludCastigo;
    normalizar();
    log(`¡CUIDADO! La salud de ${pet.nombre} bajó por descuido.`);
  }

  // Si la salud llega a 0, la mascota muere
  if (pet.salud <= 0) {
    pet.viva = false;
    log(`${pet.nombre} no ha podido sobrevivir. Fin del juego.`);
    detenerTiempo();
  }

  save(pet);
  render();
}

// Puntuación general calculada con reduce (promedio de barras)
function scoreBienestar() {
  const partes = [
    pet.salud / 100,
    1 - (pet.hambre / HAMBRE_MAX),
    pet.felicidad / FELICIDAD_MAX
  ];
  const s = partes.reduce((acc, x) => acc + x, 0) / partes.length;
  return Math.round(s * 100);
}

// ==== Render (actualiza el DOM) ====
function render() {
  if (!pet) return;

  qs('#tituloMascota').innerText = `${pet.nombre} ${pet.viva ? "" : "(✖)"}`;

  const chips = [
    `Salud ${pet.salud}/100`,
    `Hambre ${pet.hambre}/${HAMBRE_MAX}`,
    `Felicidad ${pet.felicidad}/${FELICIDAD_MAX}`
  ].map(txt => `<span class="chip">${txt}</span>`).join("");
  qs('#chips').innerHTML = chips;

  const setBar = (labelSel, barSel, val, max) => {
    qs(labelSel).innerText = val;
    qs(barSel).style.width = `${(val / max) * 100}%`;
  };
  setBar('#saludLabel', '#saludBar', pet.salud, 100);
  setBar('#hambreLabel', '#hambreBar', pet.hambre, HAMBRE_MAX);
  setBar('#felicidadLabel', '#felicidadBar', pet.felicidad, FELICIDAD_MAX);
  qs('#hambreMaxLabel').innerText = HAMBRE_MAX;
  qs('#felicidadMaxLabel').innerText = FELICIDAD_MAX;

  qs('#scoreLabel').innerText = scoreBienestar();

  // Generamos botones de comidas
  const cont = qs('#comidas');
  cont.innerHTML = comidas.map(c => `<button class="btn" data-food="${c.id}">${c.label}</button>`).join("");
  qsa('[data-food]').forEach(btn => {
    btn.onclick = () => pet.viva && alimentar(btn.dataset.food);
  });

  qs('#btnJugar').disabled = !pet.viva;
  qsa('[data-food]').forEach(b => b.disabled = !pet.viva);
}

// ==== Manejo del tiempo automático ====
function iniciarTiempo() {
  if (timer) clearInterval(timer); // prevenimos duplicados
  timer = setInterval(pasarTiempo, CONFIG.tickSegundos * 1000);
}

function detenerTiempo() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ==== Inicio y Eventos ====
document.addEventListener('DOMContentLoaded', () => {
  const saved = load();
  if (saved) {
    byId('nombreInput').placeholder = "Deja vacío y pulsa Cargar";
  }

  byId('btnNueva').addEventListener('click', () => {
    const n = (byId('nombreInput').value ?? "").toString().trim();
    if (!n) { log("Ingresa un nombre válido."); return; }
    pet = new Mascota(n);
    save(pet);
    qs('#game').style.display = '';
    render();
    log(`¡Ha nacido tu nueva mascota: ${pet.nombre}!`);
    iniciarTiempo(); // comenzamos el paso del tiempo automático
  });

  byId('btnCargar').addEventListener('click', () => {
    const loaded = load();
    if (!loaded) { log("No hay partida guardada."); return; }
    pet = loaded;
    qs('#game').style.display = '';
    render();
    log(`Partida cargada: ${pet.nombre}.`);
    iniciarTiempo(); // reanudamos tiempo
  });

  byId('btnBorrar').addEventListener('click', () => {
    clearSave();
    log("Guardado eliminado.");
    detenerTiempo();
  });

  byId('btnJugar').addEventListener('click', () => pet && pet.viva && jugar());
  byId('btnPasar').addEventListener('click', () => pet && pet.viva && (log("Dejas pasar el tiempo..."), pasarTiempo()));
});