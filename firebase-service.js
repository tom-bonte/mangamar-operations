/**
 * @file firebase-service.js
 * @description Database Layer. Handles the "Virtual Merge" of the official Visor DB
 * (Strictly Read-Only) and the new Internal Operations DB (Read/Write).
 */

// Initialize Firebase using the config from config.js
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Pointers to active connections
let unsubscribeVisor = null;
let unsubscribeInternal = null;

const VISOR_DB = "reservations_monthly";
const INTERNAL_DB = "mangamar_monthly";
const MANGAMAR_CODE = "M"; // We only care about Mangamar's trips from the Visor

/**
 * Boots up the real-time listeners for BOTH databases.
 * @returns {void}
 */
function startFirestoreListeners() {
    if (unsubscribeVisor) unsubscribeVisor();
    if (unsubscribeInternal) unsubscribeInternal();

    // 1. VISOR DATABASE (READ-ONLY)
    unsubscribeVisor = db.collection(VISOR_DB).onSnapshot((snapshot) => {
        const visorData = [];
        snapshot.forEach((doc) => {
            const monthData = doc.data().allocations || {};
            for (const id in monthData) {
                if (monthData[id].center === MANGAMAR_CODE) {
                    visorData.push({ id, ...monthData[id], isVisorTrip: true });
                }
            }
        });
        visorTrips = visorData;
        mergeAndRender();
    });

    // 2. INTERNAL DATABASE (TRIPS)
    unsubscribeInternal = db.collection(INTERNAL_DB).onSnapshot((snapshot) => {
        const internalData = [];
        snapshot.forEach((doc) => {
            if (doc.id === 'setup' || doc.id === 'staff') return; // Ignore non-trip docs
            const monthData = doc.data().allocations || {};
            for (const id in monthData) {
                internalData.push({ id, ...monthData[id], isInternalTrip: true });
            }
        });
        internalTrips = internalData;
        mergeAndRender();
    });

    // 3. INTERNAL DATABASE (STAFF - ONLY 1 READ!)
    db.collection(INTERNAL_DB).doc("staff").onSnapshot((doc) => {
        if (doc.exists) {
            staffDatabase = doc.data();
            if(typeof renderStaffView === 'function') renderStaffView();
            if(typeof renderGroups === 'function' && activeBoatItem) renderGroups(); // Redraw dropdowns if modal is open
        }
    });

    // 4. CUSTOMER MASTER DIRECTORY (ONLY 1 READ!)
    db.collection("mangamar_directory").doc("master_list").get().then((doc) => {
        if (doc.exists) customerDatabase = doc.data().clients || [];
    });
    
    // 5. GLOBAL SETTINGS (AUTH)
    db.collection("mangamar_directory").doc("settings").onSnapshot((doc) => {
        if (doc.exists) {
            window.adminPassword = doc.data().adminPassword || "manga321";
        } else {
            // First time initialization
            db.collection("mangamar_directory").doc("settings").set({ adminPassword: "manga321" });
        }
    });
    
    // NOTE: The expensive mangamar_customers listener has been DELETED to protect your quota!
}

/**
 * Merges the read-only Visor trips and the read/write Internal trips into a single 
 * array so the UI can paint them seamlessly on Ares and Kaiser.
 */
function mergeAndRender() {
    // 1. Create a map of active Visor trips for quick lookup
    const visorMap = new Map();
    visorTrips.forEach(v => visorMap.set(v.id, v));

    // 2. Align Internal "shadow" trips with their Visor masters
    const alignedInternalTrips = internalTrips.map(internal => {
        if (visorMap.has(internal.id)) {
            const visorMaster = visorMap.get(internal.id);
            return {
                ...internal,
                date: visorMaster.date, // Force sync the date if Visor moved it
                time: visorMaster.time  // Force sync the time if Visor moved it
                // Note: We deliberately DO NOT sync the 'site', so Mangamar 
                // retains the ability to internally override the dive destination!
            };
        }
        return internal;
    });

    // Helper to fix ALL CAPS or lowercase names from Jotform
    const fixNameCaps = (str) => {
        if (!str) return '';
        return str.toLowerCase().split(' ').map(word => {
            // Also handle double-barreled names (e.g., Jean-Pierre)
            return word.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-');
        }).join(' ');
    };

    // 3. Combine both arrays and format ALL names to Title Case
    mergedAllocations = [...visorTrips, ...alignedInternalTrips];
    mergedAllocations.forEach(trip => {
        if (trip.guests) {
            trip.guests.forEach(g => { if (g.nombre) g.nombre = fixNameCaps(g.nombre); });
        }
        if (trip.groups) {
            trip.groups.forEach(group => {
                if (group.guests) {
                    group.guests.forEach(g => { if (g.nombre) g.nombre = fixNameCaps(g.nombre); });
                }
            });
        }
    });
    
    // 4. Check if the UI rendering functions exist, then paint both grids
    if (typeof renderDailyGrid === 'function') {
        renderDailyGrid();
    }
    if (typeof renderMonthlyCalendar === 'function') {
        renderMonthlyCalendar();
    }
}

/**
 * Saves boat manifest data (Captain, Guide, Guests) to the INTERNAL database.
 * If the trip originated in the Visor, this creates a linked "shadow" document 
 * in the Internal DB just to hold the names without touching the Visor.
 * @async
 */
async function saveInternalBoatData(id, date, boatInfoPayload) {
    const monthKey = date.substring(0, 7); // Format: YYYY-MM
    try {
        // 'merge: true' ensures we safely insert/update this specific trip ID 
        // without accidentally overwriting the rest of the month's schedule
        await db.collection(INTERNAL_DB).doc(monthKey).set(
            { allocations: { [id]: boatInfoPayload } }, 
            { merge: true }
        );
        console.log("Datos guardados en Firestore correctamente.");
    } catch (e) {
        console.error("Error al guardar:", e);
        showAppAlert("Error de conexión con la base de datos.");
        throw e; // Stops the modal from closing if the save failed
    }
}