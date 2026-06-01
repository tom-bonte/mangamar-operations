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

    mergeAndRender();
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
            activeMonthListeners.delete(monthKey);
            visorMonthData.delete(monthKey);
            internalMonthData.delete(monthKey);
            internalMonthTombstones.delete(monthKey);
        }
    }

    // 2. Subscribe to newly introduced target months
    targetMonths.forEach(monthKey => {
        if (!activeMonthListeners.has(monthKey)) {
            const listeners = { unsubscribeVisor: null, unsubscribeInternal: null };

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

            activeMonthListeners.set(monthKey, listeners);
        }
    });
}

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
        setTimeout(() => {
            db.collection("mangamar_directory").doc("master_list").get().then((doc) => {
                if (doc.exists) {
                    let rawClients = doc.data().clients || [];
                    let dedupMap = new Map();
                    let nonDniClients = [];
    
                    rawClients.forEach(c => {
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
    
                    // Re-merge and render manifests now that the CRM database has loaded!
                    if (typeof compileAndMerge === 'function') {
                        compileAndMerge();
                    }
    
                    if (cleanClients.length < rawClients.length) {
                        console.log(`🧹 CRM Auto-Heal: Merged ${rawClients.length - cleanClients.length} duplicate customer records.`);
                        db.collection("mangamar_directory").doc("master_list").update({ clients: cleanClients })
                            .catch(e => console.error("Error auto-healing CRM:", e));
                    }
    
                    // Trigger non-blocking database-wide auto-heal sweep to correct name formats in all historic/current boat sheets
                    setTimeout(() => {
                        if (typeof window.repairAllManifestNames === 'function') {
                            window.repairAllManifestNames();
                        }
                    }, 3000);
    
                    // If CRM modal table is open, refresh it now that data has loaded
                    const crmModal = document.getElementById('crm-modal');
                    if (crmModal && !crmModal.classList.contains('hidden') && typeof renderCrmTable === 'function') {
                        renderCrmTable();
                    }
                }
            });
        }, 4500);

        // Global Settings Listener
        db.collection("mangamar_directory").doc("settings").onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                window.adminPassword = data.adminPassword || "manga321";
                
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
    const internalMap = new Map((window.internalTrips || []).map(t => [t.id, t]));

    // --- NEW: AUTO-HEALING MIGRATION ---
    // Detect orphaned Visor shadows (Internal has it, Visor doesn't). 
    // We only want to heal 'boat_' prefixed IDs. Pure internal trips start with 'internal_' and must NOT be migrated.
    const orphans = (window.internalTrips || []).filter(t => t.id && t.id.startsWith('boat_') && !visorMap.has(t.id) && t.assignedBoat !== 'shore' && t.assignedBoat !== 'aula');

    orphans.forEach(orphan => {
        // Detect if Visor just moved the site (Visor has a trip at same date/time)
        const renamedVisorTrip = (window.visorTrips || []).find(v => {
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
    mergedAllocations.forEach(trip => {
        const resolveGuestName = (g) => {
            if (g.nombre) g.nombre = fixNameCaps(g.nombre);
            if (g.dni && window.customerDatabase) {
                const normDni = window.normalizeDni(g.dni);
                const profile = window.customerDatabase.find(c => window.normalizeDni(c.dni) === normDni);
                if (profile) {
                    const dbFullName = window.getFullName(profile);
                    if (dbFullName) {
                        g.nombre = window.getFirstAndLastName(dbFullName);
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

    // --- DYNAMIC MULTIPLAYER REAL-TIME SYNC ---
    // If the manage boat modal is open, find the fresh allocation and update it in-place in activeBoatItem
    const manageModal = document.getElementById('manage-boat-modal');
    if (manageModal && !manageModal.classList.contains('hidden') && window.activeBoatItem) {
        // RACE CONDITION PREVENTION: If we are actively saving local edits, block incoming snapshots 
        // from overwriting the RAM state to prevent "1 change behind" and lost updates!
        const timeSinceEdit = Date.now() - (window.lastLocalEditTime || 0);
        if (window.isSaving || window.hasPendingSave || window.hasPendingWrites || timeSinceEdit < 2500) {
            console.log("⏳ Skipping remote sync overwrite: local save or recent edit is in progress.");
        } else {
            const freshTrip = mergedAllocations.find(t => t.id === window.activeBoatItem.id);
            if (freshTrip) {
                // Check if there are actual changes to prevent unnecessary re-rendering
                const freshStr = JSON.stringify(freshTrip.groups);
                const currentStr = JSON.stringify(window.activeBoatItem.groups);
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

    // 4. Check if the UI rendering functions exist, then paint both grids
    if (typeof renderDailyGrid === 'function') {
        renderDailyGrid();
    }
    if (typeof renderMonthlyCalendar === 'function') {
        renderMonthlyCalendar();
    }

    // Auto-refresh the TV board if it is currently open
    const tvModal = document.getElementById('tv-view-modal');
    if (tvModal && !tvModal.classList.contains('hidden') && typeof openTVView === 'function') {
        openTVView();
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