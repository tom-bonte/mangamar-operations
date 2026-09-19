/**
 * @file firebase-service.js
 * @description Database Layer. Handles the "Virtual Merge" of the official Visor DB
 * (Strictly Read-Only) and the new Internal Operations DB (Read/Write).
 */

// Initialize Firebase using the config from config.js
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
window.db = db;

// --- DNI Normalization & CRM Consolidator helpers ---
window.normalizeDni = function(dni) {
    if (!dni) return '';
    return dni.toString().replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
};

window.getClientKey = function(c) {
    if (!c) return '';
    const dni = c.dni ? window.normalizeDni(c.dni) : '';
    if (dni) return 'dni_' + dni;
    const name = c.nombre ? c.nombre.trim().toLowerCase() : '';
    if (name) return 'name_' + name;
    return '';
};

// --- CRM Load State & Safety Guard ---
// Pre-load customerDatabase from localStorage cache to eliminate app start delays
try {
    const cachedCrm = localStorage.getItem('mangamar_cached_crm_v1');
    if (cachedCrm) {
        const parsed = JSON.parse(cachedCrm);
        if (Array.isArray(parsed) && parsed.length > 0) {
            customerDatabase = parsed;
            window.customerDatabase = parsed;
            window.crmLoadedFromCache = true;
            console.log(`⚡ [CRM Cache] Pre-loaded ${parsed.length} clients from localStorage in 0ms.`);
        }
    }
} catch (e) {
    console.warn("Could not parse cached CRM:", e);
}
// DNIs that came from the startup cache: these are stale cache, never "locally added" clients.
// Empty Set when there was no (valid) cache, since customerDatabase is then still [].
window.__cachedDnisAtStartup = new Set(
    (customerDatabase || []).map(c => c.dni ? window.normalizeDni(c.dni) : '').filter(Boolean)
);

// Set to true ONLY after the full master_list has been fetched and loaded.
// Any code that writes to master_list should check this flag first.
window.crmLoaded = false;
window.crmLoadedClientCount = 0; // Track how many clients were in the last successful full load
window.loadedDnis = new Set(); // Tracks client keys present when this tab loaded/synced to prevent overwriting new additions
window.dniRedirects = {}; // Global dictionary mapping wrong/old DNI -> correct/new DNI

// [MANGAMAR-MIGRATION] phase2-shard-reader v1 — 2026-09-19
// CRM directory shards: shard 1 = master_list, shard n = master_list_n
window.crmShards = {};
window.crmShardCount = parseInt(localStorage.getItem('mangamar_crm_shard_count'), 10) || 1;
window.crmShardsReported = new Set();
window.crmShardDocId = function(n) { return n === 1 ? 'master_list' : 'master_list_' + n; };
window.crmShardListeners = {}; // shard n -> unsubscribe fn, prevents duplicate listeners
window.__autoHealRan = false; // auto-heal may write at most once per session (its own write re-triggers rebuilds)

// [MANGAMAR-MIGRATION] phase4-shard-writer v1 — 2026-09-19
window.__lastShardJson = {}; // shard n -> JSON of the clients array this tab last wrote to it

// Records a failed directory save and alerts staff with a blocking alert (toast as fallback)
function reportMasterWriteFailure(caller, message) {
    window.__lastMasterWriteError = { caller, message, at: Date.now() };
    if (typeof showAppAlert === 'function') {
        try { showAppAlert("❌ ERROR: No se pudo guardar en la nube. Avisa a Abel y no sigas editando fichas."); } catch (_) {}
    } else if (typeof showToast === 'function') {
        try { showToast("❌ ERROR: No se pudo guardar en la nube — avisa a Abel"); } catch (_) {}
    }
}

/**
 * Safe wrapper for ALL master_list writes.
 * Refuses to write if:
 *   1. The CRM hasn't loaded yet (crmLoaded = false) AND the caller isn't the initial load itself
 *   2. The new client count is dramatically smaller than the known-good count (data loss protection)
 * @param {Array} clientsArray - The clients array to write
 * @param {string} [caller='unknown'] - Name of calling function for logging
 * @param {boolean} [isInitialLoad=false] - Skip crmLoaded check for the initial load itself
 */
window.safeMasterListWrite = async function(clientsArray, caller, isInitialLoad) {
    caller = caller || 'unknown';
    const count = (clientsArray || []).length;
    let knownGood = window.crmLoadedClientCount;

    // Safety 1: CRM hasn't loaded yet — refuse all writes except the initial load
    if (!isInitialLoad && !window.crmLoaded) {
        console.warn(`🛡️ [SafeWrite] BLOCKED write from '${caller}': CRM not yet loaded. (${count} clients vs ${knownGood} known-good)`);
        return Promise.resolve();
    }

    // Safety 2: Writing significantly fewer clients than we know exist → catastrophic data loss prevention
    // Allow up to 20% shrinkage (duplicates merged). More than that is a bug.
    const minSafe = knownGood > 10 ? Math.floor(knownGood * 0.80) : 0;
    if (knownGood > 10 && count < minSafe) {
        console.error(`🚨 [SafeWrite] BLOCKED write from '${caller}': Only ${count} clients vs ${knownGood} known-good. Catastrophic data loss prevented!`);
        return Promise.resolve();
    }

    try {
        let finalClientsToWrite = clientsArray;

        // If it's a regular runtime write, perform a smart merge with the latest Firestore DB
        // to prevent overwriting customers added by other concurrent tabs since load time.
        if (!isInitialLoad) {
            console.log(`🔄 [SafeWrite] '${caller}' fetching latest CRM shards for smart merge...`);
            const shardDocs = await Promise.all(
                Array.from({ length: window.crmShardCount }, (_, i) =>
                    db.collection('mangamar_directory').doc(window.crmShardDocId(i + 1)).get())
            );
            if (shardDocs.some(d => d.exists)) {
                const latestDbClients = [];
                shardDocs.forEach(d => { if (d.exists) latestDbClients.push(...(d.data().clients || [])); });
                const localKeys = new Set((clientsArray || []).map(c => window.getClientKey(c)).filter(Boolean));
                const loadedKeys = window.loadedDnis || new Set();

                let mergedClients = [...clientsArray];
                let keptCount = 0;

                latestDbClients.forEach(dbClient => {
                    const key = window.getClientKey(dbClient);
                    if (!key) return;

                    // If it's not in our local array:
                    if (!localKeys.has(key)) {
                        // Check if it was in the database when we loaded.
                        // If it WASN'T in the database when we loaded, it means it was added by another tab
                        // while we were open. We MUST preserve it!
                        if (!loadedKeys.has(key)) {
                            mergedClients.push(dbClient);
                            keptCount++;
                        }
                        // If it WAS in the database when we loaded, it means we must have deleted it.
                        // So we let it be deleted.
                    }
                });

                if (keptCount > 0) {
                    console.log(`📥 [SafeWrite] Smart Merge preserved ${keptCount} clients added by other tabs.`);
                    finalClientsToWrite = mergedClients;
                }
            }
        }

        const finalCount = finalClientsToWrite.length;

        // Split into shards of CHUNK clients, in array order (shard 1 = master_list)
        const CHUNK = 800;
        const shardJsons = [];
        for (let i = 0; i < finalClientsToWrite.length; i += CHUNK) {
            shardJsons.push(JSON.stringify(finalClientsToWrite.slice(i, i + CHUNK)));
        }
        if (shardJsons.length === 0) shardJsons.push('[]');

        // Hard guard: Firestore documents max out at 1 MiB
        if (shardJsons.some(j => j.length > 900000)) {
            console.error(`🚨 [SafeWrite] Chunk too large — aborting`);
            reportMasterWriteFailure(caller, 'Chunk too large — aborting');
            return;
        }

        const batch = db.batch();
        const changedShards = [];
        shardJsons.forEach((json, i) => {
            const n = i + 1;
            if (window.__lastShardJson[n] === json) return; // unchanged since our last write
            batch.set(db.collection('mangamar_directory').doc(window.crmShardDocId(n)), { clients: JSON.parse(json) });
            changedShards.push(n);
        });

        const newShardCount = shardJsons.length;

        // Empty any leftover shards beyond the new count. crmShardCount in settings is NOT
        // decreased, so the emptied shards stay listened to and never resurface stale clients.
        for (let n = newShardCount + 1; n <= window.crmShardCount; n++) {
            if (window.__lastShardJson[n] === '[]') continue;
            batch.set(db.collection('mangamar_directory').doc(window.crmShardDocId(n)), { clients: [] });
            changedShards.push(n);
        }

        const shardCountGrew = newShardCount > window.crmShardCount;
        if (shardCountGrew) {
            batch.set(db.collection('mangamar_directory').doc('settings'), { crmShardCount: newShardCount }, { merge: true });
        }

        console.log(`✅ [SafeWrite] '${caller}' writing ${finalCount} clients across ${newShardCount} shard(s) (changed: ${changedShards.join(', ') || 'none'}).`);

        if (changedShards.length > 0 || shardCountGrew) {
            await batch.commit();
        }

        changedShards.forEach(n => { window.__lastShardJson[n] = n <= newShardCount ? shardJsons[n - 1] : '[]'; });

        if (shardCountGrew) {
            const previousShardCount = window.crmShardCount;
            window.crmShardCount = newShardCount;
            localStorage.setItem('mangamar_crm_shard_count', String(newShardCount));
            // Idempotent: attach listeners for the new shards in case the settings listener already saw the new count
            if (typeof window.attachCrmShardListener === 'function') {
                for (let n = previousShardCount + 1; n <= newShardCount; n++) {
                    window.attachCrmShardListener(n);
                }
            }
        }

        // Update local state to match what was written
        customerDatabase = finalClientsToWrite;
        window.crmLoadedClientCount = finalCount;
        window.loadedDnis = new Set(finalClientsToWrite.map(c => window.getClientKey(c)).filter(Boolean));

        // Refresh CRM Table if visible
        const crmModal = document.getElementById('crm-modal');
        if (crmModal && !crmModal.classList.contains('hidden') && typeof renderCrmTable === 'function') {
            renderCrmTable();
        }
    } catch (e) {
        console.error(`❌ [SafeWrite] Write from '${caller}' failed:`, e);
        reportMasterWriteFailure(caller, e.message);
    }
};

window.isSameDni = function(dni1, dni2) {
    if (!dni1 || !dni2) return false;
    return window.normalizeDni(dni1) === window.normalizeDni(dni2);
};

window.migrateCustomerHistory = async function(oldDni, newDni) {
    if (!oldDni || !newDni || oldDni === newDni) return;
    try {
        const oldHistorySnap = await db.collection('mangamar_customers').doc(oldDni).collection('history').get();
        if (!oldHistorySnap.empty) {
            console.log(`🚚 [CRM Auto-Heal] Migrating history from ${oldDni} -> ${newDni} (${oldHistorySnap.size} records)...`);
            const batch = db.batch();
            oldHistorySnap.forEach(doc => {
                const newDocRef = db.collection('mangamar_customers').doc(newDni).collection('history').doc(doc.id);
                batch.set(newDocRef, doc.data(), { merge: true });
                const oldDocRef = db.collection('mangamar_customers').doc(oldDni).collection('history').doc(doc.id);
                batch.delete(oldDocRef);
            });
            await batch.commit();
            console.log(`✅ [CRM Auto-Heal] History migration complete: ${oldDni} -> ${newDni}`);
        }
        // Delete the empty parent client document
        await db.collection('mangamar_customers').doc(oldDni).delete().catch(() => {});
    } catch (err) {
        console.error(`❌ [CRM Auto-Heal] Failed to migrate history from ${oldDni} to ${newDni}:`, err);
    }
};

// Enable Offline Persistence for lightning-fast loads (Disabled to resolve file:/// sandbox write queuing bugs)
// db.enablePersistence({ synchronizeTabs: true })
//     .catch((err) => {
//         console.warn("Firestore offline persistence not enabled:", err.code);
//     });

// --- CRITICAL SECURITY SAFEGUARD: Protect the Visor Database ---
// We intercept Firestore calls to definitively block any accidental writes 
// (set, update, delete, add) to the Visor's 'reservations_monthly' collection.
const originalCollection = db.collection.bind(db);
const originalDoc = db.doc.bind(db);

const createBlockedDocRef = (docRef) => {
    const block = () => { throw new Error("CRITICAL SECURITY BLOCKED: Attempted to write to the read-only Visor database (reservations_monthly)."); };
    docRef.set = block;
    docRef.update = block;
    docRef.delete = block;
    return docRef;
};

db.collection = function(collectionPath) {
    const colRef = originalCollection(collectionPath);
    if (collectionPath === "reservations_monthly") {
        const originalDocMethod = colRef.doc.bind(colRef);
        colRef.doc = function(docPath) {
            return createBlockedDocRef(originalDocMethod(docPath));
        };
        colRef.add = () => { throw new Error("CRITICAL SECURITY BLOCKED: Attempted to write to the read-only Visor database (reservations_monthly)."); };
    }
    return colRef;
};

db.doc = function(docPath) {
    const docRef = originalDoc(docPath);
    if (docPath && docPath.startsWith("reservations_monthly")) {
        return createBlockedDocRef(docRef);
    }
    return docRef;
};
// ---------------------------------------------------------------
// Pointers to active connections
let activeMonthListeners = new Map(); // monthKey -> { unsubscribeVisor, unsubscribeInternal }
let visorMonthData = new Map(); // monthKey -> array of visor trips
let internalMonthData = new Map(); // monthKey -> array of internal trips
let internalMonthTombstones = new Map(); // monthKey -> set of hidden visor IDs

// We track internal tombstones here so the merge process can filter out Visor trips
window.hiddenVisorTrips = new Set();

const VISOR_DB = "reservations_monthly";
const INTERNAL_DB = "mangamar_monthly";
const MANGAMAR_CODE = "M"; // We only care about Mangamar's trips from the Visor

/**
 * Calculates a 3-month target window around a given date (previous, current, and next month)
 */
function getActiveMonthKeys(date) {
    const keys = [];
    for (let offset = -1; offset <= 1; offset++) {
        const d = new Date(date.getFullYear(), date.getMonth() + offset, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        keys.push(`${y}-${m}`);
    }
    return keys;
}

/**
 * Compiles dynamic monthly data segments into global visorTrips and internalTrips arrays.
 */

// Debounce timer so that rapid Firestore snapshot bursts (up to 3 listeners firing
// within ~50ms on load or save) coalesce into a single expensive UI repaint.
let _compileAndRenderTimer = null;

function compileAndMerge() {
    const allVisor = [];
    for (const list of visorMonthData.values()) {
        allVisor.push(...list);
    }
    window.visorTrips = visorTrips = allVisor;

    const allInternal = [];
    window.hiddenVisorTrips.clear();
    for (const list of internalMonthData.values()) {
        allInternal.push(...list);
    }
    for (const set of internalMonthTombstones.values()) {
        for (const id of set) {
            window.hiddenVisorTrips.add(id);
        }
    }
    window.internalTrips = internalTrips = allInternal;

    // Always update the loading indicator immediately (cheap, no DOM repaint)
    updateSalidasLoadingState();

    // Debounce the expensive full UI repaint to 60ms.
    // If 3 listeners all fire within that window, only one render executes.
    clearTimeout(_compileAndRenderTimer);
    _compileAndRenderTimer = setTimeout(mergeAndRender, 60);
}

/**
 * Dynamically updates active document-level month listeners to follow the date in view.
 */
function syncActiveMonthListeners() {
    const refDate = (typeof currentDate !== 'undefined' && currentDate) ? currentDate : new Date();
    const targetMonths = getActiveMonthKeys(refDate);

    // 1. Unsubscribe from months no longer in target window
    for (const [monthKey, listeners] of activeMonthListeners.entries()) {
        if (!targetMonths.includes(monthKey)) {
            if (listeners.unsubscribeVisor) listeners.unsubscribeVisor();
            if (listeners.unsubscribeInternal) listeners.unsubscribeInternal();
            if (listeners.unsubscribeStaffSchedule) listeners.unsubscribeStaffSchedule();
            activeMonthListeners.delete(monthKey);
            visorMonthData.delete(monthKey);
            internalMonthData.delete(monthKey);
            internalMonthTombstones.delete(monthKey);
            window.staffSchedulesData.delete(monthKey);
        }
    }

    // 2. Subscribe to newly introduced target months
    targetMonths.forEach(monthKey => {
        if (!activeMonthListeners.has(monthKey)) {
            const listeners = { unsubscribeVisor: null, unsubscribeInternal: null, unsubscribeStaffSchedule: null };

            // Listen strictly to this Visor monthly document
            listeners.unsubscribeVisor = db.collection(VISOR_DB).doc(monthKey).onSnapshot((doc) => {
                const visorData = [];
                if (doc.exists) {
                    const monthData = doc.data().allocations || {};
                    for (const id in monthData) {
                        if (monthData[id].center === MANGAMAR_CODE) {
                            if (monthData[id]._deleted) continue;

                            const tripMonth = monthData[id].date ? monthData[id].date.substring(0, 7) : "";
                            if (tripMonth && tripMonth !== doc.id) continue;

                            visorData.push({ ...monthData[id], id, isVisorTrip: true, _sourceDocId: doc.id });
                        }
                    }
                }
                visorMonthData.set(monthKey, visorData);
                compileAndMerge();
            }, (err) => console.warn(`Error listening to visor month ${monthKey}:`, err));

            // Listen strictly to this Internal monthly document
            listeners.unsubscribeInternal = db.collection(INTERNAL_DB).doc(monthKey).onSnapshot((doc) => {
                window.hasPendingWrites = doc.metadata ? doc.metadata.hasPendingWrites : false;
                const internalData = [];
                const tombstones = new Set();
                if (doc.exists) {
                    const monthData = doc.data().allocations || {};
                    for (const id in monthData) {
                        if (monthData[id]._deleted) {
                            tombstones.add(id);
                            continue;
                        }

                        const tripMonth = monthData[id].date ? monthData[id].date.substring(0, 7) : "";
                        if (tripMonth && tripMonth !== doc.id) continue;

                        const trip = { ...monthData[id], id, isInternalTrip: true, _sourceDocId: doc.id };
                        if (trip.groups && Array.isArray(trip.groups)) {
                            const flat = [];
                            trip.groups.forEach(g => {
                                if (g && Array.isArray(g.guests)) {
                                    flat.push(...g.guests);
                                }
                            });
                            trip.guests = flat;
                        }
                        internalData.push(trip);
                    }
                }
                internalMonthData.set(monthKey, internalData);
                internalMonthTombstones.set(monthKey, tombstones);
                compileAndMerge();
            }, (err) => console.warn(`Error listening to internal month ${monthKey}:`, err));

            // Listen strictly to this Staff Schedule monthly document
            listeners.unsubscribeStaffSchedule = db.collection('mangamar_staff_schedule').doc(monthKey).onSnapshot((doc) => {
                if (doc.exists) {
                    window.staffSchedulesData.set(monthKey, doc.data());
                } else {
                    window.staffSchedulesData.set(monthKey, {
                        monthKey: monthKey,
                        columns: [],
                        daysOff: {}
                    });
                }
                
                // Re-render things if manifest is open
                if (typeof renderGroups === 'function' && window.activeBoatItem && window.activeBoatItem.date && window.activeBoatItem.date.substring(0, 7) === monthKey) {
                    renderGroups(true);
                }
                if (typeof renderCaptainDropdown === 'function' && window.activeBoatItem && window.activeBoatItem.date && window.activeBoatItem.date.substring(0, 7) === monthKey) {
                    renderCaptainDropdown();
                }
                
                // Auto-refresh the daily grid to update captain days off warnings in real-time
                if (typeof currentDate !== 'undefined' && currentDate) {
                    const currentMonthKey = currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0');
                    if (currentMonthKey === monthKey && typeof renderDailyGrid === 'function') {
                        renderDailyGrid();
                    }
                }
                
                // Auto-refresh the staff schedule grid in real-time if it's currently open for this month
                if (window.activeStaffSchedule && window.activeStaffSchedule.monthKey === monthKey) {
                    window.activeStaffSchedule = window.staffSchedulesData.get(monthKey);
                    if (typeof window.renderStaffScheduleGrid === 'function') {
                        window.renderStaffScheduleGrid();
                    }
                }
            }, (err) => console.warn(`Error listening to staff schedule for month ${monthKey}:`, err));

            activeMonthListeners.set(monthKey, listeners);
        }
    });
    updateSalidasLoadingState();
}

function updateSalidasLoadingState() {
    const refDate = (typeof currentDate !== 'undefined' && currentDate) ? currentDate : new Date();
    const currentMonthKey = refDate.getFullYear() + '-' + String(refDate.getMonth() + 1).padStart(2, '0');
    
    const hasCurrent = internalMonthData.has(currentMonthKey) && visorMonthData.has(currentMonthKey);
    const isLoading = !hasCurrent;
    
    const loadingScreen = document.getElementById('salidas-loading-screen');
    if (loadingScreen) {
        if (isLoading) {
            loadingScreen.classList.remove('pointer-events-none', 'opacity-0');
            loadingScreen.classList.add('opacity-100');
            // Strict failsafe timeout to prevent any stuck loading overlay
            if (!window._salidasFailsafeTimer) {
                window._salidasFailsafeTimer = setTimeout(() => {
                    if (loadingScreen) {
                        loadingScreen.classList.remove('opacity-100');
                        loadingScreen.classList.add('opacity-0', 'pointer-events-none');
                    }
                    window._salidasFailsafeTimer = null;
                }, 1500);
            }
        } else {
            if (window._salidasFailsafeTimer) {
                clearTimeout(window._salidasFailsafeTimer);
                window._salidasFailsafeTimer = null;
            }
            loadingScreen.classList.remove('opacity-100');
            loadingScreen.classList.add('opacity-0', 'pointer-events-none');
        }
    }
}
window.updateSalidasLoadingState = updateSalidasLoadingState;
window.syncActiveMonthListeners = syncActiveMonthListeners;

/**
 * Boots up the real-time listeners for active months and background databases.
 */
function startFirestoreListeners() {
    // 1. DYNAMIC DOCUMENT MONTH LISTENERS (Bridges to Ares & Kaiser instantly!)
    syncActiveMonthListeners();

    // 2. NON-BLOCKING BACKGROUND LOADS
    // Defer the heavy and metadata database connections to allow primary daily view rendering in <150ms!
    setTimeout(() => {
        // Staff Database Snapshot
        db.collection(INTERNAL_DB).doc("staff").onSnapshot((doc) => {
            if (doc.exists) {
                staffDatabase = doc.data();
                if (typeof renderStaffView === 'function') renderStaffView();
                if (typeof renderGroups === 'function' && activeBoatItem) renderGroups(true);
            }
        });
        // CRM Master List (Heavy 1MB Download - Deferred to prioritize critical schedule bandwidth on load)
        let crmFetchStarted = false;

        // Rebuilds the flat customerDatabase from all loaded shards, concatenated in ascending shard order.
        window.rebuildCustomerDatabase = function() {
            let rawClients = [];
            for (let n = 1; n <= window.crmShardCount; n++) {
                // Shallow-copy so in-place normalization below never mutates the cached shard data
                (window.crmShards[n] || []).forEach(c => rawClients.push({ ...c }));
            }
            let dedupMap = new Map();
            let nonDniClients = [];
            let crmNamesModified = false;

            // Only a complete rebuild (every shard reported) may mark loaded, set known-good count, write the cache, or migrate history
            const allShardsReported = window.crmShardsReported.size >= window.crmShardCount;

            // Merge any locally added clients while loading
            if (!window.crmLoaded && customerDatabase && customerDatabase.length > 0) {
                customerDatabase.forEach(localClient => {
                    if (localClient.dni && !window.__cachedDnisAtStartup.has(window.normalizeDni(localClient.dni))) {
                        const exists = rawClients.some(rc => rc.dni && window.isSameDni(rc.dni, localClient.dni));
                        if (!exists) {
                            console.log("📥 [CRM Loading] Merging locally added client during load window:", localClient.nombre, localClient.dni);
                            rawClients.push(localClient);
                            crmNamesModified = true;
                        }
                    }
                });
            }

            rawClients.forEach(c => {
                // Standardize capitalization to Title-Case (Never allow ALL CAPS)
                if (c.nombre) {
                    const formattedNombre = window.formatNameStr(c.nombre);
                    if (c.nombre !== formattedNombre) {
                        c.nombre = formattedNombre;
                        crmNamesModified = true;
                    }
                }
                if (c.apellido) {
                    const formattedApellido = window.formatNameStr(c.apellido);
                    if (c.apellido !== formattedApellido) {
                        c.apellido = formattedApellido;
                        crmNamesModified = true;
                    }
                }

                if (c.dni && c.dni.trim() !== '') {
                    const originalDni = c.dni;
                    const key = window.normalizeDni(originalDni);
                    c.dni = key;

                    // History migration writes and deletes mangamar_customers/{oldDni}: complete rebuilds only
                    if (allShardsReported && originalDni !== key) {
                        window.migrateCustomerHistory(originalDni, key);
                    }

                    if (dedupMap.has(key)) {
                        let existing = dedupMap.get(key);
                        
                        // UNCONDITIONAL NEWEST ENTRY OVERWRITE:
                        // 'c' appears LATER in rawClients array than 'existing' (newer Make.com or Jotform submission),
                        // so 'c' UNCONDITIONAL WINS for all fields!
                        let merged = { ...existing, ...c };
                        
                        // Respect manual staff lock flags ONLY if existing had manual staff edits that are newer than 'c'
                        const isNewer = typeof window.isJotformNewerThanManualEdit === 'function' 
                            ? window.isJotformNewerThanManualEdit(existing, c) 
                            : (!existing.lastManualEditTimestamp);

                        if (!isNewer && existing.lastManualEditTimestamp) {
                            // Existing manual staff edit is NEWER than 'c' -> preserve staff-edited fields!
                            if (existing.nombre) merged.nombre = existing.nombre;
                            if (existing.apellido) merged.apellido = existing.apellido;
                            if (existing.dob) merged.dob = existing.dob;
                            if (existing.titulacion) merged.titulacion = existing.titulacion;
                            if (existing.dives !== undefined) merged.dives = existing.dives;
                            if (existing.insurance) merged.insurance = existing.insurance;
                            merged.lastManualEditTimestamp = existing.lastManualEditTimestamp;
                        }
                        
                        // Ensure clean standardized types & dates
                        merged.dni = key;
                        if (merged.dob) merged.dob = window.normalizeDateStr(merged.dob) || merged.dob;
                        if (merged.insurance && typeof merged.insurance === 'object') {
                            merged.insurance = {
                                type: merged.insurance.type || 'S/N',
                                expiry: window.normalizeDateStr(merged.insurance.expiry) || merged.insurance.expiry || ''
                            };
                        }
                        if (merged.dives !== undefined && merged.dives !== null && merged.dives !== '') {
                            const numD = parseInt(merged.dives, 10);
                            merged.dives = !isNaN(numD) ? numD : merged.dives;
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

            // 🛡️ Safety guard: never replace a known-good CRM with a dramatically smaller one
            if (window.crmLoadedClientCount > 10 && cleanClients.length < window.crmLoadedClientCount * 0.9) {
                console.warn(`🛡️ [CRM] Rebuild rejected: ${cleanClients.length} clients vs known-good ${window.crmLoadedClientCount}`);
                return;
            }

            customerDatabase = cleanClients;
            
            window.loadedDnis = new Set(cleanClients.map(c => window.getClientKey(c)).filter(Boolean));

            // ✅ Mark CRM as fully loaded — now safe for all downstream writes
            if (allShardsReported) window.crmLoaded = true;
            if (allShardsReported) window.crmLoadedClientCount = cleanClients.length;
            window.lastFetchedCerts = null; // Ensure certs will re-map with full CRM names
            if (allShardsReported) {
                console.log(`✅ [CRM] Loaded ${cleanClients.length} clients. SafeWrite guards are now active.`);
            } else {
                console.log(`⏳ [CRM] Partial rebuild: ${cleanClients.length} clients from ${window.crmShardsReported.size}/${window.crmShardCount} shards.`);
            }

            // Save lightweight cache to localStorage for instant app reload (complete rebuilds only)
            if (allShardsReported) {
                try {
                    const minified = cleanClients.map(c => ({
                        dni: c.dni,
                        dob: c.dob,
                        nombre: c.nombre,
                        apellido: c.apellido,
                        email: c.email,
                        telefono: c.telefono
                    }));
                    localStorage.setItem('mangamar_cached_crm_v1', JSON.stringify(minified));
                } catch (cacheErr) {
                    console.warn("Could not cache CRM to localStorage:", cacheErr);
                }
            }

            // Re-merge and render manifests now that the CRM database has loaded!
            if (typeof compileAndMerge === 'function') {
                compileAndMerge();
            }

            // A partial rebuild must never write: it only holds the shards reported so far
            if (allShardsReported && !window.__autoHealRan && (cleanClients.length < rawClients.length || crmNamesModified)) {
                // Set BEFORE the write so the rebuilds triggered by that write cannot re-enter
                window.__autoHealRan = true;
                console.log(`🧹 CRM Auto-Heal: Merged ${rawClients.length - cleanClients.length} duplicates or corrected ALL CAPS formatting.`);
                // Use isInitialLoad=true because this IS the initial load writing back
                window.safeMasterListWrite(cleanClients, 'auto-heal-on-load', true);
            } else if (allShardsReported) {
                // First complete rebuild found nothing to fix — disarm so it cannot fire later
                window.__autoHealRan = true;
            }

            // Trigger one-time automatic manifest size repair on load to shrink DB documents
            if (!localStorage.getItem('manifest_size_repair_v2')) {
                localStorage.setItem('manifest_size_repair_v2', 'true');
                console.log("🚀 Running automatic one-time database manifest size repair...");
                setTimeout(() => {
                    window.repairAllManifestNames();
                }, 2000);
            }
            /*
            setTimeout(() => {
                if (typeof window.repairAllManifestNames === 'function') {
                    window.repairAllManifestNames();
                }
            }, 3000);
            */

            // If CRM modal table is open, refresh it now that data has loaded
            const crmModal = document.getElementById('crm-modal');
            if (crmModal && !crmModal.classList.contains('hidden') && typeof renderCrmTable === 'function') {
                renderCrmTable();
            }

            // If Día de Hoy modal is open, refresh it now that data has loaded
            const todayModal = document.getElementById('today-divers-modal');
            if (todayModal && !todayModal.classList.contains('hidden') && typeof switchTodayTab === 'function') {
                switchTodayTab(window.activeTodayTab || 'today');
            }

            // If Group Link modal is open, refresh it so DNI members display their correct names from CRM
            const groupModal = document.getElementById('group-link-modal');
            if (groupModal && !groupModal.classList.contains('hidden') && typeof window.openGroupLinkModal === 'function') {
                window.openGroupLinkModal(window._editingGroupId || window._editingGroupName, true, true);
            }

            // If Manifest modal is open, re-render it now that CRM data has loaded
            if (typeof activeBoatItem !== 'undefined' && activeBoatItem && typeof renderGroups === 'function') {
                renderGroups();
            }
        };

        // Attaches the onSnapshot listener for CRM shard n (no-op if already attached)
        window.attachCrmShardListener = function(n) {
            if (window.crmShardListeners[n]) return;
            window.crmShardListeners[n] = db.collection("mangamar_directory").doc(window.crmShardDocId(n)).onSnapshot((doc) => {
                if (doc.exists) {
                    window.crmShards[n] = doc.data().clients || [];
                    window.crmShardsReported.add(n);
                    window.rebuildCustomerDatabase();
                }
            }, (e) => {
                console.error("Error loading CRM database snapshot:", e);
                delete window.crmShardListeners[n];
                if (!window.crmLoaded) crmFetchStarted = false;
            });
        };

        window.loadCrmDatabase = function() {
            if (crmFetchStarted || window.crmLoaded) return;
            crmFetchStarted = true;
            if (window.crmLoadTimeout) {
                clearTimeout(window.crmLoadTimeout);
                window.crmLoadTimeout = null;
            }
            for (let n = 1; n <= window.crmShardCount; n++) {
                window.attachCrmShardListener(n);
            }
        };
        window.crmLoadTimeout = setTimeout(window.loadCrmDatabase, 1500);

        // Global Settings Listener
        db.collection("mangamar_directory").doc("settings").onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                window.adminPassword = data.adminPassword || "manga321";
                window.dniRedirects = data.dniRedirects || {};

                // Sharded CRM: pick up newly added shards (never decrease the count at runtime)
                if (Number.isInteger(data.crmShardCount) && data.crmShardCount > window.crmShardCount) {
                    const previousShardCount = window.crmShardCount;
                    window.crmShardCount = data.crmShardCount;
                    localStorage.setItem('mangamar_crm_shard_count', String(window.crmShardCount));
                    console.log(`🧩 [CRM] Shard count increased ${previousShardCount} → ${window.crmShardCount}`);
                    // If the CRM load has not started yet, loadCrmDatabase will attach all shards itself
                    if (crmFetchStarted || window.crmLoaded) {
                        for (let n = previousShardCount + 1; n <= window.crmShardCount; n++) {
                            window.attachCrmShardListener(n);
                        }
                    }
                }
                
                // Load WhatsApp Templates if available
                window.waTemplates = data.waTemplates || [];
                window.waTemplateSections = data.waTemplateSections || ['General', 'WhatsApp', 'Cursos', 'Tarifas', 'Logística'];
                if (typeof window.renderWaTemplateList === 'function') {
                    window.renderWaTemplateList();
                }
                if (typeof window.populateWaTemplateDropdown === 'function') {
                    window.populateWaTemplateDropdown();
                }
                
                if (data.showTVRadioTimes !== undefined) {
                    const checked = data.showTVRadioTimes !== false;
                    window.appSettings = window.appSettings || {};
                    window.appSettings.showTVRadioTimes = checked;
                    localStorage.setItem('mangamar_setting_show_tv_radio_times', checked ? 'true' : 'false');
                    
                    const toggleInput = document.getElementById('setting-toggle-radio-times');
                    if (toggleInput) {
                        toggleInput.checked = checked;
                    }
                    
                    const tvModal = document.getElementById('tv-view-modal');
                    if (tvModal && !tvModal.classList.contains('hidden')) {
                        if (typeof window._buildTVContent === 'function') {
                            window._buildTVContent();
                            setTimeout(window.adjustCardScaling, 50);
                        }
                    }
                }

                const trackingData = (data.staffOffTracking !== undefined && data.staffOffTracking !== null) ? data.staffOffTracking : data.trackedStaffOff;
                window.appSettings = window.appSettings || {};
                let resolvedMap = null;

                if (typeof data.staffOffTracking === 'object' && data.staffOffTracking && Object.keys(data.staffOffTracking).length > 0) {
                    resolvedMap = { ...data.staffOffTracking };
                } else if (Array.isArray(trackingData) && trackingData.length > 0) {
                    const map = {};
                    trackingData.forEach(name => { 
                        const clean = name.trim();
                        const isCap = (window.staffDatabase?.capitanes || []).some(c => c.nombre.trim() === clean);
                        const isGui = (window.staffDatabase?.guias || []).some(g => g.nombre.trim() === clean);
                        if (isCap) map[`cap:${clean}`] = 'always';
                        else if (isGui) map[`guide:${clean}`] = 'always';
                        else map[clean] = 'always';
                    });
                    resolvedMap = map;
                } else if (typeof trackingData === 'object' && trackingData && Object.keys(trackingData).length > 0) {
                    resolvedMap = { ...trackingData };
                }

                if (resolvedMap) {
                    window.appSettings.staffOffTracking = resolvedMap;
                    try {
                        localStorage.setItem('mangamar_staff_off_tracking', JSON.stringify(resolvedMap));
                    } catch(e) {}
                } else {
                    // If Firestore has empty settings, check localStorage to preserve user's selections
                    try {
                        const localCached = localStorage.getItem('mangamar_staff_off_tracking');
                        if (localCached) {
                            const localMap = JSON.parse(localCached);
                            if (localMap && Object.keys(localMap).length > 0) {
                                window.appSettings.staffOffTracking = localMap;
                                // Sync back to Firestore so it's persisted across all devices
                                db.collection("mangamar_directory").doc("settings").set({
                                    staffOffTracking: localMap
                                }, { merge: true }).catch(err => console.error(err));
                            }
                        }
                    } catch(e) {}
                }

                if (typeof window.renderSettingsStaffTrackers === 'function') {
                    window.renderSettingsStaffTrackers();
                }
                if (typeof renderDailyAlerts === 'function' && typeof currentDate !== 'undefined') {
                    const year = currentDate.getFullYear();
                    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
                    const day = String(currentDate.getDate()).padStart(2, '0');
                    renderDailyAlerts(`${year}-${month}-${day}`);
                }
            } else {
                let defaultMap = { 'Abel': 'always', 'Antonio': 'always' };
                try {
                    const localCached = localStorage.getItem('mangamar_staff_off_tracking');
                    if (localCached) {
                        const localMap = JSON.parse(localCached);
                        if (localMap && Object.keys(localMap).length > 0) defaultMap = localMap;
                    }
                } catch(e) {}

                db.collection("mangamar_directory").doc("settings").set({ 
                    adminPassword: "manga321", 
                    showTVRadioTimes: true,
                    staffOffTracking: defaultMap
                }, { merge: true });
            }
        });

        // Global multi-day persistent groups
        window.globalGroups = [];
        db.collection("mangamar_groups").onSnapshot((snapshot) => {
            const groups = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.realEndDate) {
                    data.endDate = data.realEndDate;
                }
                groups.push({ firebaseId: doc.id, ...data });
            });
            window.globalGroups = groups;
        });

        // Certifications Group Query (Can take a long time on cold boot, fully deferred!)
        window.globalPendingCerts = new Map();
        db.collectionGroup("history").where("certStatus", "==", "pendiente").onSnapshot((snapshot) => {
            const certMap = new Map();
            snapshot.forEach(doc => {
                const dni = doc.ref.parent.parent.id;
                const data = doc.data();
                let rawCourse = data.course || data.baseCourse || '';
                let cleanCourse = rawCourse.split(' | ')[0].trim();
                const isNonCert = (typeof window.isNonCertifiableCourse === 'function')
                    ? window.isNonCertifiableCourse(cleanCourse)
                    : (function(c) {
                        const norm = (c || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                        return norm.includes('acomp') || norm.includes('pasag') || norm.includes('pasaj') || norm.includes('passenger') || norm.includes('bautismo') || norm.includes('dsd') || norm.includes('discover scuba') || norm.includes('refresh') || norm.includes('repaso') || norm.includes('reactivate') || norm.includes('re-activate') || norm.includes('scuba review') || norm.includes('snorkel') || norm.includes('pax');
                    })(cleanCourse);
                if (cleanCourse && !isNonCert) {
                    if (!certMap.has(dni)) certMap.set(dni, []);
                    if (!certMap.get(dni).includes(cleanCourse)) {
                        certMap.get(dni).push(cleanCourse);
                    }
                }
            });
            window.globalPendingCerts = certMap;
        });
    }, 100);
}


window.saveGlobalGroup = async function (groupData) {
    if (!groupData.id) {
        groupData.id = 'grp_' + Date.now();
    }
    try {
        // Shield the group from stale clients that are still running the aggressive auto-cleanup script.
        // We set endDate to a far-future date so old clients ignore it, and save the real end date in realEndDate.
        const shieldedData = { ...groupData };
        if (shieldedData.endDate) {
            shieldedData.realEndDate = shieldedData.endDate;
            shieldedData.endDate = '2099-12-31'; // Fool old clients
        }
        await db.collection("mangamar_groups").doc(groupData.id).set(shieldedData, { merge: true });
    } catch (e) {
        console.error("Error saving group to Firebase:", e);
        if (typeof showAppAlert === 'function') showAppAlert("Error saving group: " + e.message);
        else alert("Error saving group: " + e.message);
    }
}

window.deleteGlobalGroup = async function(groupId) {
    try {
        await db.collection("mangamar_groups").doc(groupId).delete();
        if (window.globalGroups) {
            window.globalGroups = window.globalGroups.filter(g => g.id !== groupId);
        }
    } catch (e) {
        console.error("Error deleting group from Firebase:", e);
    }
}

/**
 * Merges the read-only Visor trips and the read/write Internal trips into a single 
 * array so the UI can paint them seamlessly on Ares and Kaiser.
 */
window.mergeAndRender = function mergeAndRender() {
    // Filter out Visor trips that have been hidden via internal tombstones
    const visibleVisorTrips = (window.visorTrips || []).filter(t => !window.hiddenVisorTrips.has(t.id));

    // 1. Convert Visor and Internal data to Maps for easy lookup
    const visorMap = new Map(visibleVisorTrips.map(t => [t.id, t]));

    // --- VISOR DELETIONS PRUNING ---
    // If a Visor trip is deleted/removed in the Visor (no longer in visorMap):
    // - If the internal shadow has cancelled: true, we KEEP it (do not delete).
    // - If it was NOT cancelled, we delete/prune it from the internal database.
    const internalToKeep = [];
    const internalToDelete = [];

    (window.internalTrips || []).forEach(internal => {
        const isVisorId = internal.id && !internal.id.startsWith('internal_') && !internal.id.startsWith('boat_') && internal.id.includes('_M_');
        if (isVisorId && !visorMap.has(internal.id)) {
            if (internal.cancelled) {
                internalToKeep.push(internal);
            } else {
                internalToDelete.push(internal);
            }
        } else {
            internalToKeep.push(internal);
        }
    });

    if (internalToDelete.length > 0) {
        internalToDelete.forEach(t => {
            console.log(`🧹 Visor deleted departure ${t.id} which was NOT annulled. Auto-pruning internal shadow.`);
            const monthKey = t.date ? t.date.substring(0, 7) : t.id.substring(0, 7);
            db.collection(INTERNAL_DB).doc(monthKey).update({
                [`allocations.${t.id}`]: firebase.firestore.FieldValue.delete()
            }).catch(e => console.error("Pruning visor shadow failed:", e));
        });
        window.internalTrips = internalToKeep;
    }

    const internalMap = new Map((window.internalTrips || []).map(t => [t.id, t]));

    // Helper to extract the unique Visor slot suffix (e.g. "_M_1", "_H_2")
    const getVisorSuffix = (id) => {
        if (!id) return '';
        const parts = id.split('_');
        if (parts.length >= 5) {
            const center = parts[parts.length - 2];
            const idx = parts[parts.length - 1];
            if (center.length === 1 && !isNaN(idx)) {
                return `_${center}_${idx}`;
            }
        }
        return '';
    };

    // --- NEW: AUTO-HEALING MIGRATION ---
    // Detect orphaned Visor shadows (Internal has it, Visor doesn't). 
    // We only heal standard Visor IDs whose slot suffixes match a new Visor trip (site renamed in Visor).
    const orphans = (window.internalTrips || []).filter(t => {
        if (!t.id || !t.date) return false;
        const suffix = getVisorSuffix(t.id);
        return suffix && !visorMap.has(t.id);
    });

    orphans.forEach(orphan => {
        const orphanSuffix = getVisorSuffix(orphan.id);
        
        // Detect if Visor just renamed the destination site (same date, time, and slot suffix)
        const renamedVisorTrip = (window.visorTrips || []).find(v => {
            if (v.date !== orphan.date || v.time !== orphan.time) return false;
            if (getVisorSuffix(v.id) !== orphanSuffix) return false;
            
            // Target is available if it has no shadow, or its shadow is completely empty
            const shadow = internalMap.get(v.id);
            return !shadow || !shadow.guests || shadow.guests.length === 0;
        });

        if (renamedVisorTrip && !orphan._migrated) {
            console.log("♻️ Auto-migrating renamed Visor trip!", orphan.id, "->", renamedVisorTrip.id);
            orphan._migrated = true; // prevent re-triggering in same loop

            const monthKey = orphan.date.substring(0, 7);
            const ref = db.collection(INTERNAL_DB).doc(monthKey);

            // Inherit the new site and ID from the Visor to prevent internal ID property mismatch
            const updatedPayload = { ...orphan, id: renamedVisorTrip.id, site: renamedVisorTrip.site };

            // Clean up runtime fields and redundant guests array for Firestore storage
            const dbPayload = { ...updatedPayload };
            delete dbPayload.isInternalTrip;
            delete dbPayload._sourceDocId;
            delete dbPayload._migrated;
            if (dbPayload.groups && Array.isArray(dbPayload.groups)) {
                delete dbPayload.guests;
            }

            // Swift database rewrite: Delete old ID, Save to new ID
            ref.update({
                [`allocations.${renamedVisorTrip.id}`]: dbPayload,
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
    const alignedInternalTrips = (window.internalTrips || []).map(internal => {
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

    // 3. Combine both arrays, resolve full CRM names dynamically, and format ALL names to Title Case
    mergedAllocations = [...visibleVisorTrips, ...alignedInternalTrips];
    window.mergedAllocations = mergedAllocations;

    // Build a Map for O(1) DNI → profile lookup instead of O(n) Array.find per guest.
    let customerMap = null;
    if (window.customerDatabase && window.customerDatabase.length > 0) {
        customerMap = new Map();
        window.customerDatabase.forEach(c => {
            if (c.dni) customerMap.set(window.normalizeDni(c.dni), c);
        });
    }

    let missingDnis = [];

    mergedAllocations.forEach(trip => {
        const resolveGuestName = (g) => {
            if (g.nombre) g.nombre = fixNameCaps(g.nombre);
            if (g.dni) {
                let normDni = window.normalizeDni(g.dni);
                if (window.dniRedirects && window.dniRedirects[normDni]) {
                    const redirectedDni = window.dniRedirects[normDni];
                    console.log(`🔀 [Visor Render] Redirecting manifest guest DNI ${g.dni} -> ${redirectedDni}`);
                    g.dni = redirectedDni;
                    normDni = redirectedDni;
                }
                if (customerMap) {
                    const profile = customerMap.get(normDni);
                    if (profile) {
                        const dbFullName = window.getFullName(profile);
                        if (dbFullName) {
                            g.nombre = window.getFirstAndLastName(dbFullName);
                        }
                    } else if (!g.cancelled) {
                        missingDnis.push({ dni: normDni, nombre: g.nombre, trip: trip });
                    }
                }
            }
        };

        if (trip.guests) {
            trip.guests.forEach(resolveGuestName);
        }
        if (trip.groups) {
            trip.groups.forEach(group => {
                if (group.guests) {
                    group.guests.forEach(resolveGuestName);
                }
            });
        }
    });

    // --- BACKGROUND CRM AUTO-HEALING SCAN ---
    // If we find guests scheduled on the manifests that are missing from the CRM database,
    // proactively fetch their profiles from Firestore and restore them.
    if (missingDnis.length > 0 && typeof db !== 'undefined' && window.crmLoaded) {
        window._healingDnis = window._healingDnis || new Set();

        const uniqueMissing = [];
        missingDnis.forEach(item => {
            if (!window._healingDnis.has(item.dni)) {
                window._healingDnis.add(item.dni);
                uniqueMissing.push(item);
            }
        });

        if (uniqueMissing.length > 0) {
            console.log(`🔍 [CRM Auto-Heal] Scanning ${uniqueMissing.length} missing guest profiles...`);
            
            Promise.all(uniqueMissing.map(async (item) => {
                try {
                    const snap = await db.collection('mangamar_customers').doc(item.dni).get();
                    if (snap.exists) {
                        const profileData = snap.data();
                        const stillExists = customerDatabase.some(c => window.isSameDni(c.dni, item.dni));
                        if (!stillExists) {
                            console.log(`📥 [CRM Auto-Heal] Found profile for ${profileData.nombre || item.nombre} (${item.dni}) in customer collection.`);
                            return { type: 'restore', data: profileData, dni: item.dni };
                        }
                    } else {
                        const stillExists = customerDatabase.some(c => window.isSameDni(c.dni, item.dni));
                        if (!stillExists) {
                            console.log(`📥 [CRM Auto-Heal] Creating skeleton profile for manual diver ${item.nombre} (${item.dni}) in CRM.`);
                            const newProfile = {
                                dni: item.dni,
                                nombre: item.nombre || 'Sin Nombre',
                                titulacion: item.trip.plazas === '-' ? 'Shore/Aula' : '',
                                telefono: '',
                                email: ''
                            };
                            await db.collection('mangamar_customers').doc(item.dni).set(newProfile, { merge: true }).catch(() => {});
                            return { type: 'create', data: newProfile, dni: item.dni };
                        }
                    }
                } catch (err) {
                    console.error("Error auto-healing missing guest:", err);
                    window._healingDnis.delete(item.dni);
                }
                return null;
            })).then(results => {
                const profilesToAdd = results.filter(Boolean);
                if (profilesToAdd.length > 0) {
                    let updatedDb = [...customerDatabase];
                    profilesToAdd.forEach(p => {
                        if (!updatedDb.some(c => window.isSameDni(c.dni, p.dni))) {
                            updatedDb.push(p.data);
                        }
                    });
                    console.log(`✅ [CRM Auto-Heal] Batch writing ${profilesToAdd.length} missing profiles to master_list.`);
                    window.safeMasterListWrite(updatedDb, 'auto-heal-batch-sync');
                }
            });
        }
    }

    // --- DYNAMIC MULTIPLAYER REAL-TIME SYNC ---
    // If the manage boat modal is open, find the fresh allocation and update it in-place in activeBoatItem
    const manageModal = document.getElementById('manage-boat-modal');
    if (manageModal && !manageModal.classList.contains('hidden') && window.activeBoatItem) {
        // RACE CONDITION PREVENTION: If we are actively saving local edits, block incoming snapshots 
        // from overwriting the RAM state to prevent "1 change behind" and lost updates!
        const timeSinceEdit = Date.now() - (window.lastLocalEditTime || 0);
        if (window.isSaving || window.hasPendingSave || window.hasPendingWrites || window.isManifestDirty || timeSinceEdit < 2500) {
            console.log("⏳ Skipping remote sync overwrite: local save or recent edit is in progress.");
            // Schedule a deferred sync to catch up once the lockout window expires
            const delay = Math.max(0, 2500 - timeSinceEdit);
            clearTimeout(window.deferredSyncTimer);
            window.deferredSyncTimer = setTimeout(() => {
                console.log("⏳ Re-evaluating deferred sync...");
                if (typeof compileAndMerge === 'function') compileAndMerge();
            }, delay + 100);
        } else {
            const freshTrip = mergedAllocations.find(t => t.id === window.activeBoatItem.id);
            if (freshTrip) {
                // Determine fresh groups, falling back to flat guests mapped to a group if it is a Visor trip with 0 group passengers
                let freshGroups = freshTrip.groups;
                let freshTotalGuests = 0;
                if (freshGroups) {
                    freshGroups.forEach(g => { if (g.guests) freshTotalGuests += g.guests.length; });
                }
                
                if ((!freshGroups || freshGroups.length === 0 || freshTotalGuests === 0) && (freshTrip.isVisorTrip || freshTrip.isVisor) && freshTrip.guests && freshTrip.guests.length > 0) {
                    freshGroups = [{ guide: '', apoyo: '', guests: freshTrip.guests }];
                    freshTotalGuests = freshTrip.guests.length;
                }
                
                // --- STRICT FIREWALL GUARD ---
                let currentTotalGuests = 0;
                if (window.activeBoatItem.groups) {
                    window.activeBoatItem.groups.forEach(g => { if (g.guests) currentTotalGuests += g.guests.length; });
                }
                
                if (currentTotalGuests > 0 && freshTotalGuests === 0) {
                    console.warn("⚠️ [Sync Firewall] Blocked remote snapshot from emptying the active manifest passengers!");
                } else {
                    // Check if there are actual changes to prevent unnecessary re-rendering
                    const freshStr = JSON.stringify(freshGroups || [{ guide: '', apoyo: '', guests: [] }]);
                    const currentStr = JSON.stringify(window.activeBoatItem.groups || [{ guide: '', apoyo: '', guests: [] }]);
                    const freshWlStr = JSON.stringify(freshTrip.waitlist || []);
                    const currentWlStr = JSON.stringify(window.activeBoatItem.waitlist || []);
                    
                    if (freshStr !== currentStr || freshWlStr !== currentWlStr || window.activeBoatItem.captain !== freshTrip.captain || window.activeBoatItem.guide !== freshTrip.guide || window.activeBoatItem.apoyo !== freshTrip.apoyo || window.activeBoatItem.site !== freshTrip.site) {
                        // Preserve active selection or pending edits if possible, but update groups
                        window.activeBoatItem.groups = JSON.parse(freshStr);
                        window.activeBoatItem.waitlist = JSON.parse(freshWlStr);
                        
                        // Keep captain, guide, site, etc in sync
                        window.activeBoatItem.captain = freshTrip.captain || '';
                        window.activeBoatItem.guide = freshTrip.guide || '';
                        window.activeBoatItem.apoyo = freshTrip.apoyo || '';
                        window.activeBoatItem.site = freshTrip.site || '';
                        
                        // Capture the fresh snapshot as the base version for subsequent 3-way merges
                        const baseCopy = JSON.parse(JSON.stringify(freshTrip));
                        baseCopy.groups = JSON.parse(JSON.stringify(freshGroups || []));
                        window.activeBoatItem.lastSyncedTripState = baseCopy;
                    }
                    
                    // Re-render captains dropdown to sync conflicts
                    if (typeof renderCaptainDropdown === 'function') renderCaptainDropdown();
                    
                    // Keep select values in sync
                    const capSelect = document.getElementById('input-captain');
                    if (capSelect) capSelect.value = freshTrip.captain || 'Seleccionar Capitán...';
                    
                    const siteSelect = document.getElementById('input-site');
                    if (siteSelect) siteSelect.value = freshTrip.site || '';
                    
                    if (typeof renderGroups === 'function') {
                        // Render groups without losing active focus on search input if possible
                        const activeElementId = document.activeElement ? document.activeElement.id : null;
                        const activeElementValue = document.activeElement ? document.activeElement.value : '';
                        
                        renderGroups(true);
                        
                        // Restore focus if it was a search or input field
                        if (activeElementId && activeElementId.startsWith('search-')) {
                            const el = document.getElementById(activeElementId);
                            if (el) {
                                el.focus();
                                el.value = activeElementValue;
                            }
                        }
                    }
                    if (typeof renderWaitlist === 'function') renderWaitlist();
                    if (typeof updateModalSubtitle === 'function') updateModalSubtitle();
                }
            }
        }
    }

    // 4. RAF-deferred grid rendering: cancels any pending frame before scheduling a new one.
    // If mergeAndRender is called again before the frame fires, only the latest render runs.
    if (window._gridRenderRAF) cancelAnimationFrame(window._gridRenderRAF);
    window._gridRenderRAF = requestAnimationFrame(() => {
        window._gridRenderRAF = null;
        if (typeof renderDailyGrid === 'function') renderDailyGrid();
        if (typeof renderMonthlyCalendar === 'function') renderMonthlyCalendar();
        // Auto-refresh the TV board if it is currently open
        const tvModal = document.getElementById('tv-view-modal');
        if (tvModal && !tvModal.classList.contains('hidden')) {
            if (typeof window._buildTVContent === 'function') {
                window._buildTVContent(true);
            }
        }
    });
}

window.updateLocalTripCache = function(tripId, date, updatedTrip) {
    if (!date) return;
    const monthKey = date.substring(0, 7);
    let list = internalMonthData.get(monthKey);
    const tripCopy = JSON.parse(JSON.stringify(updatedTrip));
    const flatGuests = [];
    if (tripCopy.groups) {
        tripCopy.groups.forEach(g => {
            if (g.guests) flatGuests.push(...g.guests);
        });
    }
    const preparedTrip = {
        id: tripId,
        ...tripCopy,
        guests: flatGuests,
        isInternalTrip: true,
        _sourceDocId: monthKey
    };
    
    if (list) {
        const idx = list.findIndex(t => t.id === tripId);
        if (idx > -1) {
            list[idx] = preparedTrip;
        } else {
            list.push(preparedTrip);
        }
    } else {
        internalMonthData.set(monthKey, [preparedTrip]);
    }
    compileAndMerge();
};

/**
 * Saves boat manifest data (Captain, Guide, Guests) to the INTERNAL database.
 * If the trip originated in the Visor, this creates a linked "shadow" document 
 * in the Internal DB just to hold the names without touching the Visor.
 * @async
 */
async function saveInternalBoatData(id, date, boatInfoPayload) {
    if (window.deletedTripIds && window.deletedTripIds.has(id)) {
        console.warn("⚠️ saveInternalBoatData aborted because trip was deleted:", id);
        return;
    }
    if (!id) {
        console.error("saveInternalBoatData: Trip ID is missing!");
        showAppAlert("Error de guardado: ID de la salida ausente.");
        return;
    }
    if (!date || typeof date !== 'string' || date.length < 7) {
        console.error("saveInternalBoatData: Date is missing or invalid!", date);
        showAppAlert("Error de guardado: Fecha de la salida ausente o inválida.");
        return;
    }
    
    const monthKey = date.substring(0, 7); // Format: YYYY-MM
    
    // --- 🚨 AUTO-ALIGN FLAT GUESTS LIST ---
    // If the payload specifies groups, automatically reconstruct the flat guests array
    // to keep both lists perfectly in sync and prevent passenger records from disappearing.
    if (boatInfoPayload && Array.isArray(boatInfoPayload.groups)) {
        const flatGuests = [];
        boatInfoPayload.groups.forEach(g => {
            if (g && Array.isArray(g.guests)) {
                flatGuests.push(...g.guests);
            }
        });
        boatInfoPayload.guests = flatGuests;
    }

    // Clean up undefined properties recursively to avoid Firestore serialization errors
    const cleanPayload = JSON.parse(JSON.stringify(boatInfoPayload));

    // EXCLUDE guests array from database document to stay well below the 1MB document size limit.
    // We dynamically reconstruct the flat guests array from the groups array when reading/loading.
    if (cleanPayload && Array.isArray(cleanPayload.groups)) {
        delete cleanPayload.guests;
    }

    try {
        // 'merge: true' ensures we safely insert/update this specific trip ID 
        // without accidentally overwriting the rest of the month's schedule
        
        // --- 🛡️ ANTI-RACE CONDITION (Deep Dot-Notation Merge) ---
        // Converts the nested payload into dot-notation to PREVENT Firebase from entirely
        // replacing the allocation object, which inadvertently wipes the `_deleted` tombstone.
        const updatePayload = {};
        for (const key in cleanPayload) {
            updatePayload[`allocations.${id}.${key}`] = cleanPayload[key];
        }
        
        // Force-delete the redundant guests field in the database if groups are present
        if (cleanPayload && Array.isArray(cleanPayload.groups)) {
            updatePayload[`allocations.${id}.guests`] = firebase.firestore.FieldValue.delete();
        }

        await db.collection(INTERNAL_DB).doc(monthKey).update(updatePayload)
        .catch(err => {
            console.warn(`Doc missing, falling back to set for ${monthKey}`, err);
            return db.collection(INTERNAL_DB).doc(monthKey).set(
                { allocations: { [id]: cleanPayload } }, 
                { merge: true }
            );
        });
        
        console.log("Datos guardados en Firestore correctamente.");
    } catch (e) {
        console.error("Error al guardar en saveInternalBoatData:", e);
        showAppAlert("Error de conexión con la base de datos: " + e.message);
        throw e; // Stops the modal from closing if the save failed
    }
}

/**
 * Batches and serializes updates to multiple trips across one or more monthly documents
 * to prevent concurrent write contention and reduce Firebase write operations.
 * @async
 * @param {Array} trips - Array of trip objects containing modifications
 */
window.saveMultipleTripsData = async function(trips) {
    if (!trips || trips.length === 0) return;
    
    // Group modifications by monthly document key
    const updatesByMonth = {};
    
    trips.forEach(trip => {
        if (!trip.date || !trip.id) return;
        const monthKey = trip.date.substring(0, 7);
        if (!updatesByMonth[monthKey]) {
            updatesByMonth[monthKey] = {};
        }
        
        // Reconstruct flat guests list to keep both structures aligned
        const flatGuests = [];
        if (trip.groups) {
            trip.groups.forEach(g => {
                if (g && Array.isArray(g.guests)) {
                    flatGuests.push(...g.guests);
                }
            });
        }
        
        const existingInternal = (window.internalTrips || []).find(t => String(t.id) === String(trip.id));
        const prefix = `allocations.${trip.id}`;
        updatesByMonth[monthKey][`${prefix}.id`] = trip.id;
        updatesByMonth[monthKey][`${prefix}.date`] = trip.date || '';
        updatesByMonth[monthKey][`${prefix}.time`] = trip.time || '';
        updatesByMonth[monthKey][`${prefix}.assignedBoat`] = trip.assignedBoat || (existingInternal ? existingInternal.assignedBoat : 'ares') || 'ares';
        updatesByMonth[monthKey][`${prefix}.site`] = trip.site || (existingInternal ? existingInternal.site : 'Sin Destino') || 'Sin Destino';
        updatesByMonth[monthKey][`${prefix}.captain`] = trip.captain || (existingInternal ? existingInternal.captain : '') || '';
        updatesByMonth[monthKey][`${prefix}.guide`] = trip.guide || (existingInternal ? existingInternal.guide : '') || '';
        updatesByMonth[monthKey][`${prefix}.groups`] = trip.groups || [];
        updatesByMonth[monthKey][`${prefix}.guests`] = flatGuests;
        updatesByMonth[monthKey][`${prefix}.waitlist`] = trip.waitlist || [];
        updatesByMonth[monthKey][`${prefix}.note`] = trip.note || trip.comment || '';
        updatesByMonth[monthKey][`${prefix}.timeSaliendo`] = trip.timeSaliendo || '';
        updatesByMonth[monthKey][`${prefix}.timeBuzosAgua`] = trip.timeBuzosAgua || '';
        updatesByMonth[monthKey][`${prefix}.timeVolviendo`] = trip.timeVolviendo || '';
        updatesByMonth[monthKey][`${prefix}.rmLocked`] = trip.rmLocked || false;

        if (trip.isVisorTrip || trip.isVisor) {
            updatesByMonth[monthKey][`${prefix}.visorTripFallback`] = true;
        }
        if (trip.cancelled !== undefined) {
            updatesByMonth[monthKey][`${prefix}.cancelled`] = trip.cancelled || false;
        }
        if (trip.maxDives !== undefined) {
            updatesByMonth[monthKey][`${prefix}.maxDives`] = trip.maxDives;
        }
    });
    
    // Execute batched updates for each month document
    const promises = Object.entries(updatesByMonth).map(async ([monthKey, payload]) => {
        try {
            await db.collection(INTERNAL_DB).doc(monthKey).update(payload)
            .catch(async err => {
                console.warn(`Doc missing in batch update for ${monthKey}, fallback to set`, err);
                const fallbackObj = { allocations: {} };
                Object.keys(payload).forEach(k => {
                    const parts = k.split('.');
                    const tripId = parts[1];
                    if (!fallbackObj.allocations[tripId]) {
                        const originalTrip = trips.find(t => t.id === tripId);
                        if (originalTrip) {
                            const flatG = [];
                            if (originalTrip.groups) {
                                originalTrip.groups.forEach(g => {
                                    if (g && Array.isArray(g.guests)) flatG.push(...g.guests);
                                });
                            }
                            fallbackObj.allocations[tripId] = {
                                date: originalTrip.date,
                                time: originalTrip.time,
                                assignedBoat: originalTrip.assignedBoat || 'ares',
                                site: originalTrip.site || '',
                                captain: originalTrip.captain || '',
                                groups: originalTrip.groups || [],
                                guests: flatG,
                                waitlist: originalTrip.waitlist || [],
                                cancelled: originalTrip.cancelled || false
                            };
                            if (originalTrip.isVisorTrip || originalTrip.isVisor) {
                                fallbackObj.allocations[tripId].visorTripFallback = true;
                            }
                        }
                    }
                });
                await db.collection(INTERNAL_DB).doc(monthKey).set(fallbackObj, { merge: true });
            });
        } catch (e) {
            console.error(`Error saving batched monthly allocations for ${monthKey}:`, e);
        }
    });
    
    await Promise.all(promises);
};

/**
 * Sweeps the entire database-wide operational manifests collection, resolves guest DNI matches 
 * against the CRM master list, and retroactively repairs any truncated names in Firestore.
 */
window.repairAllManifestNames = async function() {
    if (!window.customerDatabase || window.customerDatabase.length === 0) {
        console.warn("⚠️ CRM sweep deferred: customerDatabase not loaded yet.");
        return;
    }
    console.log("🏥 [CRM Sweep] Starting database-wide manifest name repair...");
    try {
        const monthlySnap = await db.collection('mangamar_monthly').get();
        let totalUpdatedTrips = 0;
        let totalDocsUpdated = 0;

        for (const docSnap of monthlySnap.docs) {
            if (docSnap.id === 'staff' || docSnap.id === 'settings') continue;
            
            const data = docSnap.data();
            if (!data || !data.allocations) continue;

            const allocations = data.allocations;
            let docModified = false;

            for (const tripId in allocations) {
                const trip = allocations[tripId];
                let tripModified = false;

                // --- OPTIMIZATION: Remove redundant guests array to shrink document sizes ---
                if (trip.groups && Array.isArray(trip.groups) && trip.guests) {
                    delete trip.guests;
                    tripModified = true;
                }

                const checkAndFixGuest = (g) => {
                    if (g.dni) {
                        const normDni = window.normalizeDni(g.dni);
                        const profile = window.customerDatabase.find(c => window.normalizeDni(c.dni) === normDni);
                        if (profile) {
                            const dbFullName = window.getFullName(profile);
                            if (dbFullName) {
                                const correctName = window.getFirstAndLastName(dbFullName);
                                if (g.nombre !== correctName) {
                                    console.log(`🏥 [CRM Sweep] Correcting name on trip ${tripId} (${trip.date}): ${g.nombre} -> ${correctName}`);
                                    g.nombre = correctName;
                                    tripModified = true;
                                }
                            }
                        }
                    }
                };

                if (trip.guests) {
                    trip.guests.forEach(checkAndFixGuest);
                }
                if (trip.groups) {
                    trip.groups.forEach(group => {
                        if (group.guests) {
                            group.guests.forEach(checkAndFixGuest);
                        }
                    });
                }

                if (tripModified) {
                    totalUpdatedTrips++;
                    docModified = true;
                }
            }

            if (docModified) {
                totalDocsUpdated++;
                await db.collection('mangamar_monthly').doc(docSnap.id).update({ allocations });
                console.log(`💾 [CRM Sweep] Saved corrected allocations for month doc: ${docSnap.id}`);
            }
        }

        console.log(`✅ [CRM Sweep] Repair complete. Updated ${totalUpdatedTrips} trips across ${totalDocsUpdated} monthly documents.`);
    } catch (err) {
        console.error("❌ [CRM Sweep] Error running repair sweep:", err);
    }
};
window.saveWaTemplatesToFirebase = async function(templates, sections) {
    try {
        const payload = { waTemplates: templates };
        if (sections && Array.isArray(sections)) {
            payload.waTemplateSections = sections;
        } else if (window.waTemplateSections && Array.isArray(window.waTemplateSections)) {
            payload.waTemplateSections = window.waTemplateSections;
        }
        await db.collection("mangamar_directory").doc("settings").set(payload, { merge: true });
        return true;
    } catch(e) {
        console.error("Error saving WA Templates: ", e);
        return false;
    }
};
