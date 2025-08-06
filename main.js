// Variables y Constantes del Juego
let nombreMascota; 
const HAMBRE_MAX = 20;
const FELICIDAD_MAX = 20;

let salud = 100;
let hambre = 10; // Empieza con algo de hambre
let felicidad = 10; // Empieza algo feliz
let mascotaViva = true;

// Un array para las comidas disponibles
const comidas = ["baya", "manzana", "caramelo"];

// SOLICITUD DE NOMBRE AL INICIAR
nombreMascota = prompt("¡Felicidades! Tu mascota está naciendo. ¿Qué nombre le quieres poner?");

// Ciclo para validar que el usuario ingrese un nombre 
while (!nombreMascota) {
    nombreMascota = prompt("¡Tu mascota necesita un nombre! Por favor, elige uno.");
}

// Muestra el estado actual de la mascota en la consola.
 
function mostrarEstado() {
    console.log("--- Estado de " + nombreMascota + " ---");
    console.log("Salud: " + salud + "/100");
    console.log("Hambre: " + hambre + "/" + HAMBRE_MAX);
    console.log("Felicidad: " + felicidad + "/" + FELICIDAD_MAX);
    console.log("------------------------");
}

// Alimenta a la mascota, consultando al usuario qué comida darle.

function alimentar() {
    // 1. Preguntamos al usuario qué comida elegir, mostrando las opciones del array.
    const comidaElegida = prompt(
        "¿Qué le quieres dar de comer a " + nombreMascota + "?\n" +
        "- Baya\n" +
        "- Manzana\n" +
        "- Caramelo"
    );

    // Si el usuario presiona "cancelar", el prompt devuelve null. Salimos de la función.
    if (comidaElegida === null) {
        alert("Decides no darle nada por ahora.");
        return; // 'return' detiene la ejecución de la función aquí mismo.
    }
    
    // 2. Usamos un switch para manejar las diferentes elecciones.
    // Usamos .toLowerCase() para que no importe si el usuario escribe "Baya", "baya" o "BAYA".
    switch (comidaElegida.toLowerCase()) {
        case "baya":
        case "manzana":
            // La Baya y la Manzana tienen el mismo efecto
            alert("¡Le diste " + comidaElegida + "! Es muy saludable.");
            hambre -= 8; // Quita más hambre
            felicidad += 2; // Da menos felicidad
            break; // 'break' es crucial para que no se ejecuten los otros casos.

        case "caramelo":
            alert("¡Le diste un caramelo! ¡Le encanta!");
            hambre -= 3; // Quita menos hambre
            felicidad += 6; // Da más felicidad
            break;

        default:
            // Si el usuario escribe cualquier otra cosa
            alert("'" + comidaElegida + "' no parece ser una comida válida. Tu mascota te mira con confusión.");
            break;
    }

    // Aplicamos los límites a las variables después del switch ---
    if (hambre < 0) {
        hambre = 0; // No puede tener hambre negativa
    }
    if (felicidad > FELICIDAD_MAX) {
        felicidad = FELICIDAD_MAX; // No puede exceder la felicidad máxima
    }
}

// Juega con la mascota, aumentando su felicidad y su hambre.

function jugar() {
    felicidad += 5;
    if (felicidad > FELICIDAD_MAX) {
        felicidad = FELICIDAD_MAX;
    }
    hambre += 3; // Jugar da hambre
    alert("¡Has jugado con " + nombreMascota + "! Su felicidad ha aumentado.");
}

// Simula el paso del tiempo, afectando las estadísticas de la mascota.

function pasarTiempo() {
    hambre += 2;
    felicidad -= 1;

    // Condicionales que afectan la salud
    if (hambre >= HAMBRE_MAX || felicidad <= 0) {
        salud -= 10;
        alert("¡CUIDADO! La salud de " + nombreMascota + " ha bajado por descuido.");
    }

    if (salud <= 0) {
        mascotaViva = false;
    }
}

// Ciclo Principal del Juego 

function iniciarJuego() {
    alert("¡Ha nacido tu nueva Mascota: " + nombreMascota + "!");

// El ciclo se ejecuta mientras la condición sea verdadera [cite: 43]
while (mascotaViva) {
    // Mostramos el estado al inicio de cada turno
    mostrarEstado();

    // Entrada de datos del usuario. Usamos \n para saltos de línea y facilitar la lectura.
    const accion = prompt(
        "¿Qué quieres hacer con " + nombreMascota + "?\n" +
        "1. Alimentar\n" +
        "2. Jugar\n" +
        "3. No hacer nada (pasa el tiempo)\n" +
        "4. Salir del juego"
    );

    // Procesamiento de datos: evaluamos la acción del usuario
    if (accion === "1") {
        alimentar(); // Invocación de la función
    } else if (accion === "2") {
        jugar(); // Invocación de la función
    } else if (accion === "3") {
        alert("Decides no hacer nada y observar a tu mascota...");
    } else if (accion === "4") {
        alert("¡Gracias por jugar! Esperamos verte pronto.");
        break; // La declaración break se utiliza para salir de un ciclo
    } else {
        alert("Acción no válida. Por favor, elige una opción del 1 al 4.");
        continue; // Omite el resto del ciclo y va a la siguiente iteración
    }

    // El tiempo pasa después de cada acción
    pasarTiempo();

    // Condición de fin de juego
    if (!mascotaViva) {
        alert("Oh no... " + nombreMascota + " no ha podido sobrevivir. ¡Fin del juego!");
    }
}

// Mensaje final fuera del ciclo
console.log("El juego ha terminado.");
}

// Le damos al navegador un respiro de 50ms antes de iniciar todo.
setTimeout(iniciarJuego, 50);
