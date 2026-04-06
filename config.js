/**
 * CORE CONFIGURATION
 * Paste your exact Firebase config from the Visor app here.
 */
const firebaseConfig = {
    apiKey: "AIzaSyBe7X5AUC-PpcJSCYgMzyyUMJMPqxtTdiw",
    authDomain: "reserva-marina-cdp.firebaseapp.com",
    projectId: "reserva-marina-cdp",
    storageBucket: "reserva-marina-cdp.appspot.com",
    messagingSenderId: "242126338137",
    appId: "1:242126338137:web:c32d20d4697545a172d948"
};

// Core Application Constants
const TIMES = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00'];

const SITES_RESERVE = ['Bajo de Dentro', 'Piles I', 'Piles II', 'Testa', 'Morra'];
const SITES_INTERNAL = ['Cala', 'Naranjito', 'Palomas', 'Fuera', 'Shore', 'Aula'];
const ALL_SITES = [...SITES_RESERVE, ...SITES_INTERNAL];

// EXCLUDES Cala, Shore, and Aula from the Monthly View
const SITES_MONTHLY = ['Bajo de Dentro', 'Piles I', 'Piles II', 'Testa', 'Morra', 'Naranjito', 'Palomas', 'Fuera'];

// Highly Distinct Colors for Every Dive Site
const SITE_COLORS = {
    'Bajo de Dentro': 'bg-emerald-100 text-emerald-800 border-emerald-500',
    'Piles I': 'bg-blue-100 text-blue-800 border-blue-500',
    'Piles II': 'bg-purple-100 text-purple-800 border-purple-500',
    'Testa': 'bg-orange-100 text-orange-800 border-orange-500',
    'Morra': 'bg-rose-100 text-rose-800 border-rose-500',
    'Cala': 'bg-slate-100 text-slate-800 border-slate-500',
    'Naranjito': 'bg-amber-100 text-amber-800 border-amber-500',
    'Palomas': 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-500',
    'Fuera': 'bg-cyan-100 text-cyan-800 border-cyan-500',
    'Shore': 'bg-yellow-100 text-yellow-800 border-yellow-500',
    'Aula': 'bg-red-100 text-red-800 border-red-500'
};

// Fleet Data
const BOATS = {
    'ares': { name: 'Ares', maxGuests: 12 },
    'kaiser': { name: 'Kaiser', maxGuests: 12 },
    'shore': { name: 'Shore / Aula', maxGuests: 99 }
};

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_ES = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];