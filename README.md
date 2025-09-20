<h1 align="center">🐾 Tamagochi + PokeAPI</h1>
<h3 align="center">Proyecto final - Coderhouse Comisión 80785</h3>

---

## 📖 Descripción

Simulador de mascota virtual inspirado en el clásico **Tamagotchi**, potenciado con **PokeAPI**.  
El jugador puede elegir un **Pokémon de la Generación 1 a la 3**, cuidarlo, alimentarlo con **bayas** y administrar un sistema de **economía** con inventario, dinero, tienda y carrito de compras.

Este proyecto cumple con los criterios de la cursada de **JavaScript en Coderhouse**, incluyendo:

- Consumo de **datos remotos** (PokeAPI).
- Generación de **HTML dinámico** desde JavaScript.
- Uso de **librerías externas** (Toastify, SweetAlert2).
- Flujo de negocio completo y persistente con `localStorage`.

---

## 🚀 Funcionalidades principales

- 🎮 **Mascota virtual Pokémon**  
  Seleccioná tu Pokémon con menú desplegable (preview de sprite oficial).  

- 🥗 **Bayas dinámicas**  
  Cargadas en vivo desde PokeAPI, con efectos de juego (saciedad y felicidad).  

- 💰 **Economía integrada**  
  - Dinero inicial + ingreso pasivo por buen cuidado.  
  - Inventario inicial de bayas.  
  - Tienda con precios ajustados a la efectividad de cada baya.  

- 🛒 **Carrito de compras**  
  - Agregar y quitar bayas antes de confirmar.  
  - Total en tiempo real.  
  - Confirmación de compra con SweetAlert2.  

- 📦 **Persistencia**  
  Guardado único en `localStorage`. Si existe partida, se carga automáticamente.  

- ⚡ **Interactividad mejorada**  
  - **Toastify** para notificaciones rápidas.  
  - **SweetAlert2** para confirmaciones elegantes.  
  - Paneles reactivos con `aria-live` y accesibilidad básica.  

---

## 🧩 Tecnologías usadas

- **HTML5** y **CSS3**  
- **JavaScript (ES6+)**  
- **PokeAPI** (Pokémon + berries)  
- **Toastify** (toasts)  
- **SweetAlert2** (modales)  

---

## 📂 Estructura del proyecto

/
├── index.html # Maquetado principal
├── style/
│ └── style.css # Estilos oscuros, responsive
├── main.js # Lógica del juego (JS)
└── media/ # Logo, fondo, recursos opcionales

---

## ▶️ Cómo probarlo

1. Clonar el repositorio o descargarlo.  
2. Abrir `index.html` en el navegador.  
3. (Opcional) Usar **Live Server** en VS Code para auto-recarga.  

> No requiere instalación de dependencias: librerías externas vía CDN.

---

## ⚙️ Configuración rápida (en `main.js`)

```js
const CONFIG = {
  hambrePorJugar: 3,
  hambrePorTick: 2,
  felicidadPorTick: -1,
  saludCastigo: 10,
  tickSegundos: 10,
  
  // Economía
  dineroInicial: 50,
  recompensaBase: 18,
  recompensaBonusScore: 15
};
Podés modificar valores para ajustar la dificultad y la economía.

📌 Próximas mejoras

Ofertas especiales en la tienda.

Misiones y logros diarios.

Filtros por región (Kanto, Johto, Hoenn).

Historial de compras y estadísticas.

Versión PWA para jugar offline.

✍️ Autor

👨‍💻 Federico Galera
📧 Contacto: angelrossanigo@gmail.com

🌐 LinkedIn
 · Instagram
