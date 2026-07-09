/**
 * @file firebase-service.js
 * @description Database Layer. Handles the "Virtual Merge" of the official Visor DB
 * (Strictly Read-Only) and the new Internal Operations DB (Read/Write).
 */

// Initialize Firebase using the config from config.js
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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
// Set to true ONLY after the full master_list has been fetched and loaded.
// Any code that writes to master_list should check this flag first.
window.crmLoaded = false;
window.crmLoadedClientCount = 0; // Track how many clients were in the last successful full load
window.loadedDnis = new Set(); // Tracks client keys present when this tab loaded/synced to prevent overwriting new additions
window.dniRedirects = {}; // Global dictionary mapping wrong/old DNI -> correct/new DNI

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
            console.log(`🔄 [SafeWrite] '${caller}' fetching latest master_list for smart merge...`);
            const doc = await db.collection('mangamar_directory').doc('master_list').get();
            if (doc.exists) {
                const latestDbClients = doc.data().clients || [];
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
        console.log(`✅ [SafeWrite] '${caller}' writing ${finalCount} clients to master_list.`);
        
        await db.collection('mangamar_directory').doc('master_list')
            .update({ clients: finalClientsToWrite })
            .catch(e => {
                if (e.code === 'not-found') {
                    return db.collection('mangamar_directory').doc('master_list')
                        .set({ clients: finalClientsToWrite }, { merge: true });
                }
                throw e;
            });

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

                            visorData.push({ id, ...monthData[id], isVisorTrip: true, _sourceDocId: doc.id });
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

                        internalData.push({ id, ...monthData[id], isInternalTrip: true, _sourceDocId: doc.id });
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
    const targetMonths = getActiveMonthKeys(refDate);
    
    let isLoading = false;
    for (const key of targetMonths) {
        if (!internalMonthData.has(key) || !visorMonthData.has(key)) {
            isLoading = true;
            break;
        }
    }
    
    const loadingScreen = document.getElementById('salidas-loading-screen');
    if (loadingScreen) {
        if (isLoading) {
            loadingScreen.classList.remove('pointer-events-none', 'opacity-0');
            loadingScreen.classList.add('opacity-100');
        } else {
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
        window.loadCrmDatabase = function() {
            if (crmFetchStarted || window.crmLoaded) return;
            crmFetchStarted = true;
            if (window.crmLoadTimeout) {
                clearTimeout(window.crmLoadTimeout);
                window.crmLoadTimeout = null;
            }
            db.collection("mangamar_directory").doc("master_list").onSnapshot((doc) => {
                if (doc.exists) {
                    let rawClients = doc.data().clients || [];
                    let dedupMap = new Map();
                    let nonDniClients = [];
                    let crmNamesModified = false;
    
                    // Merge any locally added clients while loading
                    if (!window.crmLoaded && customerDatabase && customerDatabase.length > 0) {
                        customerDatabase.forEach(localClient => {
                            if (localClient.dni) {
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
    
                            if (originalDni !== key) {
                                window.migrateCustomerHistory(originalDni, key);
                            }
    
                            if (dedupMap.has(key)) {
                                let existing = dedupMap.get(key);
                                let merged = { ...existing };
                                
                                // Smart Merge: Merge fields prioritizing more complete data
                                for (let prop in c) {
                                    const valC = c[prop];
                                    const valE = existing[prop];
                                    if (valC !== undefined && valC !== null && valC !== '') {
                                        if (valE === undefined || valE === null || valE === '') {
                                            merged[prop] = valC;
                                        } else {
                                            // Both have values. Choose the best one!
                                            if (prop === 'titulacion') {
                                                const isCapC = valC === valC.toUpperCase();
                                                const isCapE = valE === valE.toUpperCase();
                                                if (isCapC && !isCapE) {
                                                    merged[prop] = valC;
                                                } else if (!isCapC && isCapE) {
                                                    merged[prop] = valE;
                                                } else {
                                                    merged[prop] = valC.length >= valE.length ? valC : valE;
                                                }
                                            } else if (prop === 'nombre' || prop === 'apellido') {
                                                merged[prop] = valC.length >= valE.length ? valC : valE;
                                            } else if (prop === 'insurance') {
                                                const expC = typeof valC === 'object' ? valC.expiry : '';
                                                const expE = typeof valE === 'object' ? valE.expiry : '';
                                                if (expC && expE) {
                                                    merged[prop] = expC >= expE ? valC : valE;
                                                } else if (valC && !valE) {
                                                    merged[prop] = valC;
                                                }
                                            } else {
                                                merged[prop] = String(valC).length >= String(valE).length ? valC : valE;
                                            }
                                        }
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
                    
                    window.loadedDnis = new Set(cleanClients.map(c => window.getClientKey(c)).filter(Boolean));
    
                    // ✅ Mark CRM as fully loaded — now safe for all downstream writes
                    window.crmLoaded = true;
                    window.crmLoadedClientCount = cleanClients.length;
                    console.log(`✅ [CRM] Loaded ${cleanClients.length} clients. SafeWrite guards are now active.`);
    
                    // Re-merge and render manifests now that the CRM database has loaded!
                    if (typeof compileAndMerge === 'function') {
                        compileAndMerge();
                    }
    
                    if (cleanClients.length < rawClients.length || crmNamesModified) {
                        console.log(`🧹 CRM Auto-Heal: Merged ${rawClients.length - cleanClients.length} duplicates or corrected ALL CAPS formatting.`);
                        // Use isInitialLoad=true because this IS the initial load writing back
                        window.safeMasterListWrite(cleanClients, 'auto-heal-on-load', true);
                    }
    
                    // Trigger non-blocking database-wide auto-heal sweep to correct name formats in all historic/current boat sheets
                    // Disabled automatically on startup to save Firebase reads/writes. Can be run manually from browser console: window.repairAllManifestNames()
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

                    // If Group Link modal is open, refresh it so DNI members display their correct names from CRM
                    const groupModal = document.getElementById('group-link-modal');
                    if (groupModal && !groupModal.classList.contains('hidden') && typeof window.openGroupLinkModal === 'function') {
                        window.openGroupLinkModal(window._editingGroupId || window._editingGroupName, true, true);
                    }
                }
            }, (e) => {
                console.error("Error loading CRM database snapshot:", e);
                if (!window.crmLoaded) crmFetchStarted = false;
            });
        };
        window.crmLoadTimeout = setTimeout(window.loadCrmDatabase, 4500);

        // Global Settings Listener
        db.collection("mangamar_directory").doc("settings").onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                window.adminPassword = data.adminPassword || "manga321";
                window.dniRedirects = data.dniRedirects || {};
                
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
            } else {
                db.collection("mangamar_directory").doc("settings").set({ adminPassword: "manga321", showTVRadioTimes: true });
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
                if (cleanCourse) {
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

        missingDnis.forEach(item => {
            if (window._healingDnis.has(item.dni)) return;
            window._healingDnis.add(item.dni);

            console.log(`🔍 [CRM Auto-Heal] Scheduled guest '${item.nombre}' (${item.dni}) is missing from CRM database. Fetching...`);
            db.collection('mangamar_customers').doc(item.dni).get().then(snap => {
                if (snap.exists) {
                    const profileData = snap.data();
                    const stillExists = customerDatabase.some(c => window.isSameDni(c.dni, item.dni));
                    if (!stillExists) {
                        console.log(`📥 [CRM Auto-Heal] Restoring missing client ${profileData.nombre || item.nombre} to CRM database.`);
                        customerDatabase.push(profileData);
                        window.safeMasterListWrite(customerDatabase, 'auto-heal-restore-guest');
                    }
                } else {
                    // Profile does not exist in mangamar_customers either. Create a skeleton.
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
                        customerDatabase.push(newProfile);
                        db.collection('mangamar_customers').doc(item.dni).set(newProfile, { merge: true }).catch(() => {});
                        window.safeMasterListWrite(customerDatabase, 'auto-heal-create-guest');
                    }
                }
            }).catch(err => {
                console.error("Error auto-healing missing guest:", err);
                window._healingDnis.delete(item.dni);
            });
        });
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
        if (tvModal && !tvModal.classList.contains('hidden') && typeof openTVView === 'function') {
            openTVView();
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
    try {
        // 'merge: true' ensures we safely insert/update this specific trip ID 
        // without accidentally overwriting the rest of the month's schedule
        
        // --- 🛡️ ANTI-RACE CONDITION (Deep Dot-Notation Merge) ---
        // Converts the nested payload into dot-notation to PREVENT Firebase from entirely
        // replacing the allocation object, which inadvertently wipes the `_deleted` tombstone.
        const updatePayload = {};
        for (const key in boatInfoPayload) {
            updatePayload[`allocations.${id}.${key}`] = boatInfoPayload[key];
        }

        await db.collection(INTERNAL_DB).doc(monthKey).update(updatePayload)
        .catch(err => {
            console.warn(`Doc missing, falling back to set for ${monthKey}`, err);
            return db.collection(INTERNAL_DB).doc(monthKey).set(
                { allocations: { [id]: boatInfoPayload } }, 
                { merge: true }
            );
        });
        
        console.log("Datos guardados en Firestore correctamente.");
    } catch (e) {
        console.error("Error al guardar:", e);
        showAppAlert("Error de conexión con la base de datos.");
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
        
        const prefix = `allocations.${trip.id}`;
        updatesByMonth[monthKey][`${prefix}.id`] = trip.id;
        updatesByMonth[monthKey][`${prefix}.date`] = trip.date || '';
        updatesByMonth[monthKey][`${prefix}.time`] = trip.time || '';
        updatesByMonth[monthKey][`${prefix}.assignedBoat`] = trip.assignedBoat || 'ares';
        updatesByMonth[monthKey][`${prefix}.site`] = trip.site || 'Sin Destino';
        updatesByMonth[monthKey][`${prefix}.captain`] = trip.captain || '';
        updatesByMonth[monthKey][`${prefix}.guide`] = trip.guide || '';
        updatesByMonth[monthKey][`${prefix}.groups`] = trip.groups || [];
        updatesByMonth[monthKey][`${prefix}.guests`] = flatGuests;
        updatesByMonth[monthKey][`${prefix}.waitlist`] = trip.waitlist || [];
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