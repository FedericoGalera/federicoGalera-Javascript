// TAMAGOCHI 

// Constantes de límites y configuración del juego 
const HAMBRE_MAX = 20;
const FELICIDAD_MAX = 20;

const CONFIG = {
  hambrePorJugar: 3, // cuánto aumenta el hambre al jugar
  hambrePorTick: 2, // cuánto aumenta el hambre en cada intervalo
  felicidadPorTick: -1, // cuánto baja la felicidad en cada intervalo
  saludCastigo: 10, // daño a la salud si hambre/felicidad son críticas
  tickSegundos: 10 // cada cuántos segundos pasa el tiempo automáticamente
};

// Utilidades y helpers 
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const qs  = (sel, parent=document) => parent.querySelector(sel);
const qsa = (sel, parent=document) => parent.querySelectorAll(sel);
const byId = id => document.getElementById(id);

// Log de eventos en pantalla 
const logBox = byId('log');
const log = (msg) => { if (!logBox) return; logBox.innerHTML = `<div>• ${msg}</div>` + logBox.innerHTML; };

//  Modelo de Mascota 
class Mascota {
  constructor(nombre) {
    this.nombre = nombre;
    this.salud = 100;
    this.hambre = 10;
    this.felicidad = 10;
    this.viva = true;
  }
}

// Datos de Comidas 
const comidas = [
  { id:"baya",     label:"Baya",     dhambre:-8, dfelicidad:+2, msg:"¡Baya saludable!" },
  { id:"manzana",  label:"Manzana",  dhambre:-8, dfelicidad:+2, msg:"¡Manzana saludable!" },
  { id:"caramelo", label:"Caramelo", dhambre:-3, dfelicidad:+6, msg:"¡Caramelo delicioso!" }
];

// localStorage 
const KEY = "tamagochi_save_unico_v1";
function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const p = new Mascota(data.nombre);
    Object.assign(p, data); // restauramos campos
    return p;
  } catch { return null; }
}
function clearSave() { localStorage.removeItem(KEY); }

// Estado global y timer 
let pet = null;   // referencia a la mascota activa
let timer = null; // id del setInterval

// Lógica de normalización y acciones 
function normalizar() {
  pet.hambre    = clamp(pet.hambre, 0, HAMBRE_MAX);
  pet.felicidad = clamp(pet.felicidad, 0, FELICIDAD_MAX);
  pet.salud     = clamp(pet.salud, 0, 100);
}

// Alimentar usando la tabla de comidas
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

// Jugar sube felicidad y da hambre
function jugar() {
  pet.felicidad += 5;
  pet.hambre += CONFIG.hambrePorJugar;
  normalizar();
  log(`Jugaste con ${pet.nombre}. ¡Más felicidad!`);
  render();
  save(pet);
}

// Paso del tiempo
function pasarTiempo() {
  if (!pet || !pet.viva) return;

  pet.hambre    += CONFIG.hambrePorTick;
  pet.felicidad += CONFIG.felicidadPorTick;
  normalizar();

  // Penalización si está en estado crítico
  if (pet.hambre >= HAMBRE_MAX || pet.felicidad <= 0) {
    pet.salud -= CONFIG.saludCastigo;
    normalizar();
    log(`¡CUIDADO! La salud de ${pet.nombre} bajó por descuido.`);
  }

  // Muerte y fin de partida
  if (pet.salud <= 0) {
    pet.viva = false;
    log(`${pet.nombre} no ha podido sobrevivir. Fin del juego.`);
    detenerTiempo();
  }

  save(pet);
  render();
}

// “Bienestar” promedio (reduce) de salud, hambre invertida y felicidad
function scoreBienestar() {
  const partes = [
    pet.salud / 100,
    1 - (pet.hambre / HAMBRE_MAX),
    pet.felicidad / FELICIDAD_MAX
  ];
  const s = partes.reduce((acc, x) => acc + x, 0) / partes.length;
  return Math.round(s * 100);
}

// Render de la UI 
function render() {
  if (!pet) return;

  qs('#tituloMascota').innerText = `${pet.nombre} ${pet.viva ? "" : "(✖)"}`;

  // Chips informativas construidas con map
  qs('#chips').innerHTML = [
    `Salud ${pet.salud}/100`,
    `Hambre ${pet.hambre}/${HAMBRE_MAX}`,
    `Felicidad ${pet.felicidad}/${FELICIDAD_MAX}`
  ].map(txt => `<span class="chip">${txt}</span>`).join("");

  // Barras de progreso
  const setBar = (labelSel, barSel, val, max) => {
    qs(labelSel).innerText = val;
    qs(barSel).style.width = `${(val / max) * 100}%`;
  };
  setBar('#saludLabel', '#saludBar', pet.salud, 100);
  setBar('#hambreLabel', '#hambreBar', pet.hambre, HAMBRE_MAX);
  setBar('#felicidadLabel', '#felicidadBar', pet.felicidad, FELICIDAD_MAX);
  qs('#hambreMaxLabel').innerText = HAMBRE_MAX;
  qs('#felicidadMaxLabel').innerText = FELICIDAD_MAX;

  // Puntuación global
  qs('#scoreLabel').innerText = scoreBienestar();

  // Botones de comida generados desde datos 
  const cont = qs('#comidas');
  cont.innerHTML = comidas.map(c => `<button class="btn" data-food="${c.id}">${c.label}</button>`).join("");
  qsa('[data-food]').forEach(btn => { btn.onclick = () => pet.viva && alimentar(btn.dataset.food); });

  // Habilitar/Deshabilitar acciones si está muerta
  qs('#btnJugar').disabled = !pet.viva;
  qsa('[data-food]').forEach(b => b.disabled = !pet.viva);
}

// Control del tiempo automático 
function iniciarTiempo() {
  if (timer) clearInterval(timer); // evita múltiples intervalos
  timer = setInterval(pasarTiempo, CONFIG.tickSegundos * 1000);
}

function detenerTiempo() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Autoload y único guardado 
function bloquearCreacion() {
  // Deshabilita “Nueva partida” si ya hay mascota activa/guardada
  const btnNueva = byId('btnNueva');
  if (btnNueva) btnNueva.disabled = true;
  // Hint visual (opcional): ya hay una partida activa
  const input = byId('nombreInput');
  if (input) input.placeholder = "Ya hay una partida activa (borra para crear otra)";
}

function habilitarCreacion() {
  const btnNueva = byId('btnNueva');
  if (btnNueva) btnNueva.disabled = false;
  const input = byId('nombreInput');
  if (input) {
    input.value = "";
    input.placeholder = "Nombre de la mascota";
  }
}

// Inicio y eventos 
document.addEventListener('DOMContentLoaded', () => {
  // 1) Autoload: si hay guardado, se carga automáticamente y se inicia el tiempo
  const saved = load();
  if (saved) {
    pet = saved;
    qs('#game').style.display = ''; // muestra panel de juego
    render();
    log(`Partida cargada automáticamente: ${pet.nombre}.`);
    bloquearCreacion(); // no se permite crear nueva hasta borrar
    iniciarTiempo(); // comienza el tick automático
  } else {
    // No hay partida: se permite crear una nueva
    habilitarCreacion();
  }

  // 2) Crear nueva partida (solo si no existe guardado)
  byId('btnNueva').addEventListener('click', () => {
    if (load()) { // seguridad extra: si existe guardado, bloquear
      log("Ya existe una partida. Borra el guardado para crear otra.");
      bloquearCreacion();
      return;
    }
    const n = (byId('nombreInput').value ?? "").toString().trim();
    if (!n) { log("Ingresa un nombre válido."); return; }

    pet = new Mascota(n);
    save(pet);
    qs('#game').style.display = '';
    render();
    log(`¡Ha nacido tu nueva mascota: ${pet.nombre}!`);
    bloquearCreacion(); // ya hay una partida activa
    iniciarTiempo(); // inicia el tick
  });

  // 3) Borrar guardado 
  byId('btnBorrar').addEventListener('click', () => {
    clearSave();
    detenerTiempo();
    log("Guardado eliminado. Puedes crear una nueva mascota.");
    // Ocultamos el panel de juego y limpiamos estado en memoria
    qs('#game').style.display = 'none';
    pet = null;
    habilitarCreacion();
  });

  // 4) Acciones de juego
  byId('btnJugar').addEventListener('click', () => pet && pet.viva && jugar());
  byId('btnPasar').addEventListener('click', () => pet && pet.viva && (log("Dejas pasar el tiempo..."), pasarTiempo()));
});
