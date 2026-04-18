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

// We track internal tombstones here so the merge process can filter out Visor trips
window.hiddenVisorTrips = new Set();

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
                    if (monthData[id]._deleted) continue; // ENFORCE INVINNCIBLE SOFT DELETE FOR VISOR
                    
                    // --- 🛡️ MONTH-GUARD PROTECTION ---
                    // Ignore trips that are mathematically 'marooned' in the wrong month folder
                    const tripMonth = monthData[id].date ? monthData[id].date.substring(0, 7) : "";
                    if (tripMonth && tripMonth !== doc.id) continue;

                    visorData.push({ id, ...monthData[id], isVisorTrip: true, _sourceDocId: doc.id });
                }
            }
        });
        visorTrips = visorData;
        mergeAndRender();
    });

    // 2. INTERNAL DATABASE (TRIPS)
    unsubscribeInternal = db.collection(INTERNAL_DB).onSnapshot((snapshot) => {
        const internalData = [];
        window.hiddenVisorTrips.clear();
        snapshot.forEach((doc) => {
            if (doc.id === 'setup' || doc.id === 'staff') return; // Ignore non-trip docs
            const monthData = doc.data().allocations || {};
            for (const id in monthData) {
                if (monthData[id]._deleted) {
                    window.hiddenVisorTrips.add(id); // Track tombstone
                    continue; // ENFORCE INVINNCIBLE SOFT DELETE
                }
                
                // --- 🛡️ MONTH-GUARD PROTECTION ---
                // Ignore trips that are mathematically 'marooned' in the wrong month folder
                const tripMonth = monthData[id].date ? monthData[id].date.substring(0, 7) : "";
                if (tripMonth && tripMonth !== doc.id) continue;

                internalData.push({ id, ...monthData[id], isInternalTrip: true, _sourceDocId: doc.id });
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
        if (doc.exists) {
            let rawClients = doc.data().clients || [];
            let dedupMap = new Map();
            let nonDniClients = [];
            
            rawClients.forEach(c => {
                if (c.dni && c.dni.trim() !== '') {
                    const key = c.dni.trim().toUpperCase();
                    c.dni = key; // Normalize DNI inline
                    
                    if (dedupMap.has(key)) {
                        let existing = dedupMap.get(key);
                        // Merge: Newer form (c) overwrites existing, UNLESS new value is empty
                        let merged = { ...existing };
                        for (let prop in c) {
                            if (c[prop] !== undefined && c[prop] !== null && c[prop] !== '') {
                                merged[prop] = c[prop];
                            }
                        }
                        dedupMap.set(key, merged);
                    } else {
                        dedupMap.set(key, c);
                    }
                } else {
                    nonDniClients.push(c);
                }
            });
            
            const cleanClients = [...dedupMap.values(), ...nonDniClients];
            customerDatabase = cleanClients;
            
            // Auto-heal: If duplicates were fixed, silently save the sanitized list to the master directory
            if (cleanClients.length < rawClients.length) {
                console.log(`🧹 CRM Auto-Heal: Merged ${rawClients.length - cleanClients.length} duplicate customer records.`);
                db.collection("mangamar_directory").doc("master_list").update({ clients: cleanClients })
                  .catch(e => console.error("Error auto-healing CRM:", e));
            }
        }
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
    // 6. GLOBAL GROUPS (MULTI-DAY PERSISTENT GROUPS)
    window.globalGroups = [];
    db.collection("mangamar_groups").onSnapshot((snapshot) => {
        const groups = [];
        const todayStr = new Date().toISOString().split('T')[0];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.endDate && data.endDate < todayStr) {
                // Background cleanup of expired groups
                db.collection("mangamar_groups").doc(doc.id).delete()
                  .catch(e => console.error("Auto-cleanup group error", e));
            } else {
                groups.push({ firebaseId: doc.id, ...data });
            }
        });
        window.globalGroups = groups;
    });

    // NOTE: The expensive mangamar_customers listener has been DELETED to protect your quota!
}

window.saveGlobalGroup = async function(groupData) {
    if (!groupData.id) {
        groupData.id = 'grp_' + Date.now();
    }
    try {
        await db.collection("mangamar_groups").doc(groupData.id).set(groupData, { merge: true });
    } catch (e) {
        console.error("Error saving group to Firebase:", e);
    }
}

/**
 * Merges the read-only Visor trips and the read/write Internal trips into a single 
 * array so the UI can paint them seamlessly on Ares and Kaiser.
 */
function mergeAndRender() {
    // Filter out Visor trips that have been hidden via internal tombstones
    const visibleVisorTrips = visorTrips.filter(t => !window.hiddenVisorTrips.has(t.id));
    
    // 1. Convert Visor and Internal data to Maps for easy lookup
    const visorMap = new Map(visibleVisorTrips.map(t => [t.id, t]));
    const internalMap = new Map(internalTrips.map(t => [t.id, t]));

    // --- NEW: AUTO-HEALING MIGRATION ---
    // Detect orphaned Visor shadows (Internal has it, Visor doesn't). 
    // We only want to heal 'boat_' prefixed IDs. Pure internal trips start with 'internal_' and must NOT be migrated.
    const orphans = internalTrips.filter(t => t.id && t.id.startsWith('boat_') && !visorMap.has(t.id) && t.assignedBoat !== 'shore' && t.assignedBoat !== 'aula');
    
    orphans.forEach(orphan => {
        // Detect if Visor just moved the site (Visor has a trip at same date/time)
        const renamedVisorTrip = visorTrips.find(v => {
            if (v.date !== orphan.date || v.time !== orphan.time) return false;
            // Target is available if it has no shadow, or its shadow is completely empty
            const shadow = internalMap.get(v.id);
            return !shadow || !shadow.guests || shadow.guests.length === 0;
        });
        
        if (renamedVisorTrip && !orphan._migrated) {
            console.log("♻️ Auto-migrating renamed Visor trip!", orphan.id, "->", renamedVisorTrip.id);
            orphan._migrated = true; // prevent re-triggering in same loop
            
            const monthKey = orphan.date.substring(0, 7);
            const ref = db.collection(INTERNAL_DB).doc(monthKey);
            
            // Inherit the new site from the Visor
            const updatedPayload = { ...orphan };
            updatedPayload.site = renamedVisorTrip.site; 
            
            // Swift database rewrite: Delete old ID, Save to new ID
            ref.update({
                [`allocations.${renamedVisorTrip.id}`]: updatedPayload,
                [`allocations.${orphan.id}`]: firebase.firestore.FieldValue.delete()
            }).catch(e => console.error("Auto-migration failed:", e));
            
            // Instantly mutate in RAM so UI doesn't flicker
            orphan.id = renamedVisorTrip.id;
            orphan.site = renamedVisorTrip.site; // CRITICAL FIX: Make sure the local RAM immediately takes the new site name
            visorMap.set(renamedVisorTrip.id, renamedVisorTrip);
            internalMap.set(renamedVisorTrip.id, updatedPayload);
        }
    });

    // 2. Align Internal "shadow" trips with their Visor masters
    const alignedInternalTrips = internalTrips.map(internal => {
        if (visorMap.has(internal.id)) {
            const visorMaster = visorMap.get(internal.id);
            return {
                ...internal,
                date: visorMaster.date, // Force sync the date if Visor moved it
                time: visorMaster.time,  // Force sync the time if Visor moved it
                plazas: visorMaster.pax, // FIX: Use 'pax' instead of 'plazas'
                site: visorMaster.site   // FIX: Allow Visor to overwrite the site to reflect destination changes!
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

    // --- EFFECTIVE GARBAGE COLLECTION FIX FOR MAROONED PHANTOMS ---
    alignedInternalTrips.forEach(t => {
        const correctMonth = t.date ? t.date.substring(0, 7) : null;
        // If a trip's actual date doesn't match the month document it lives in, it's an immortal marooned clone!
        if (correctMonth && t._sourceDocId && correctMonth !== t._sourceDocId) {
            console.log(`🧹 Vaporizing marooned clone ${t.id} from wrong document ${t._sourceDocId}`);
            db.collection(INTERNAL_DB).doc(t._sourceDocId).update({
                [`allocations.${t.id}`]: firebase.firestore.FieldValue.delete()
            }).catch(e => console.error("Hard vaporization failed:", e));
        }
    });

    // 3. Combine both arrays and format ALL names to Title Case
    mergedAllocations = [...visibleVisorTrips, ...alignedInternalTrips];
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