window.switchFichaTab = function (tabId) {
    window.activeFichaTab = tabId;
    // 1. Reset all buttons
    ['historial', 'pagos', 'caja', 'resumen', 'ficha'].forEach(id => {
        const btn = document.getElementById(`tab-btn-${id}`);
        if (btn) btn.className = 'pb-3 text-sm font-bold text-slate-500 border-b-[3px] border-transparent hover:text-slate-800 transition-all';
        const content = document.getElementById(`tab-content-${id}`);
        if (content) {
            content.classList.add('hidden');
            content.classList.remove('block');
        }
    });

    // 2. Activate selected
    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    if (activeBtn) activeBtn.className = 'pb-3 text-sm font-black text-blue-600 border-b-[3px] border-blue-600 transition-all';
    
    const targetTab = document.getElementById(`tab-content-${tabId}`);
    if (targetTab) {
        targetTab.classList.remove('hidden');
        if (tabId === 'factura') targetTab.classList.add('flex');
        else targetTab.classList.add('block');
    }

    // 3. Update nav history dynamically if current view is a user profile
    if (window.modalHistory && window.modalHistoryIndex >= 0) {
        const curr = window.modalHistory[window.modalHistoryIndex];
        if (curr && curr.type === 'customer') {
            curr.targetTab = tabId;
        }
    }
};

window.openCustomerProfile = async function (dni, nombre, isNavBackForward = false, targetTab = 'caja') {
    if (typeof isNavBackForward !== 'boolean') isNavBackForward = false;
    recordModalHistory({ type: 'customer', args: [dni, nombre], targetTab, isNavBackForward });

    window.historialClearSelection(); // Clear multiple selection on newly opened profile
    window.cajaUncheckedDocIds = new Set(); // Reset check status for Caja
    window.cajaSelectedGroupMembers = new Set([window.normalizeDni(dni)]);
    window.groupHistoryCache = {};
    if (window.closeFacturaView) window.closeFacturaView(); // Ensure details view is always closed
    if (!isNavBackForward) window.fichaDisplayLimit = 15; // Reset pagination for fresh loads

    window.activeFichaTab = targetTab;
    const fromEl = document.getElementById('historial-filter-from');
    const toEl = document.getElementById('historial-filter-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';

    const customerInfo = customerDatabase.find(c => window.isSameDni(c.dni, dni)) || { telefono: '', email: '', discount: 0 };
    const contactStr = [customerInfo.telefono, customerInfo.email].filter(Boolean).join(' • ');

    document.getElementById('profile-modal-name').innerText = nombre;
    document.getElementById('profile-modal-dni').innerText = contactStr ? `${dni}  —  ${contactStr}` : dni;
    window.activeFichaDni = dni;

    // Ficha auto-population details
    try {
        if (document.getElementById('ficha-tab-nombre')) {
            document.getElementById('ficha-tab-nombre').innerText = nombre || '---';
            document.getElementById('ficha-tab-dni').innerText = dni || '---';
            document.getElementById('ficha-tab-dob').innerText = window.formatInsuranceDate(customerInfo.dob);
            document.getElementById('ficha-tab-telefono').innerText = customerInfo.telefono || '---';
            document.getElementById('ficha-tab-email').innerText = customerInfo.email || '---';
            document.getElementById('ficha-tab-titulacion').innerText = customerInfo.titulacion || '---';
            let insObj = customerInfo.insurance;
            let typeStr = "";
            let expiryStr = "";
            let isRed = false;
            let displaySeg = "";

            if (!insObj) {
                isRed = true;
                displaySeg = 'Sin seguro en vigor';
            } else if (typeof insObj === 'string') {
                typeStr = insObj;
            } else {
                typeStr = insObj.type || 'S/N';
                expiryStr = insObj.expiry || '';
            }

            if (!isRed && (!typeStr || typeStr === '0' || typeStr === '---' || typeStr.toLowerCase() === 'no' || typeStr.toLowerCase() === 'none' || typeStr.toLowerCase() === 's/n')) {
                isRed = true;
                displaySeg = 'Sin seguro en vigor';
            } else if (!isRed) {
                displaySeg = typeStr;
                let testDateStr = expiryStr;

                if (!testDateStr) {
                    const match = typeStr.match(/\d{4}-\d{2}-\d{2}/);
                    if (match) testDateStr = match[0];
                }

                if (testDateStr) {
                    let dDate = new Date(window.normalizeDateStr(testDateStr));
                    dDate.setHours(23, 59, 59, 999);
                    const formattedDate = window.formatInsuranceDate(testDateStr);
                    if (!isNaN(dDate.getTime()) && dDate.getTime() < new Date().getTime()) {
                        isRed = true;
                        displaySeg = `Sin seguro en vigor - ${typeStr} (Caducado el ${formattedDate})`;
                    } else {
                        displaySeg += ` (Hasta ${formattedDate})`;
                    }
                }
            }

            const segWrapper = document.getElementById('ficha-tab-seguro-wrapper');
            if (segWrapper) {
                if (isRed) {
                    segWrapper.className = 'inline-flex items-center px-3 py-1.5 rounded-lg border bg-red-50 border-red-200 text-red-700';
                    document.getElementById('ficha-tab-seguro').innerText = '🛑 ' + displaySeg;
                } else {
                    segWrapper.className = 'inline-flex items-center px-3 py-1.5 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700';
                    document.getElementById('ficha-tab-seguro').innerText = '✔ ' + displaySeg;
                }
            }

            document.getElementById('ficha-tab-dives').innerText = customerInfo.dives ? String(customerInfo.dives) : '---';
        }
    } catch (e) { }

    const discountEl = document.getElementById('ficha-caja-discount');
    if (discountEl) {
        discountEl.value = customerInfo.discount || 0;
        // SYNC UI: Ensure the % or € buttons match the stored preference (SkipSave=true to prevent loop)
        if (window.setDiscountType) window.setDiscountType(customerInfo.discountType || 'percent', true);
    }
    document.getElementById('profile-history-list').innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500 font-bold flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-blue-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Cargando historial...</td></tr>';
    document.getElementById('customer-profile-modal').classList.remove('hidden');
    if (isNavBackForward) window.hideAllNavModals('customer-profile-modal');

    try {
        const snapshot = await db.collection('mangamar_customers').doc(dni).collection('history').orderBy('date', 'desc').get();
        if (snapshot.empty) {
            document.getElementById('profile-history-list').innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">No hay inmersiones registradas aún.</td></tr>';

            const pagosEl = document.getElementById('profile-pagos-list');
            if (pagosEl) pagosEl.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">No hay pagos registrados.</td></tr>';
            
            const cajaListEl = document.getElementById('caja-pending-list');
            if (cajaListEl) cajaListEl.innerHTML = '<tr><td colspan="4" class="p-8 text-center"><div class="text-3xl mb-2">🎉</div><div class="text-sm font-bold text-slate-400">Sin cargos pendientes</div></td></tr>';
            
            const cajaCountEl = document.getElementById('caja-pending-count');
            if (cajaCountEl) cajaCountEl.innerText = '0 items';

            const totalEl = document.getElementById('ficha-caja-total');
            if (totalEl) {
                totalEl.innerText = "0.00";
                totalEl.className = "text-3xl font-black text-slate-300 tracking-tighter";
                const deudaEl = document.getElementById('ficha-caja-deuda');
                if (deudaEl) deudaEl.innerText = "0.00";
                
                const senalInput = document.getElementById('ficha-caja-senal-input');
                if (senalInput) senalInput.value = "0";

                const liquidarBtn = document.getElementById('btn-liquidar');
                if (liquidarBtn) liquidarBtn.classList.add('opacity-50', 'pointer-events-none');
            }

            switchFichaTab(targetTab);
            return;
        }

        window.activeFichaRawDocs = [];
        snapshot.forEach(doc => {
            doc._ownerDni = window.normalizeDni(dni);
            window.activeFichaRawDocs.push(doc);
        });
        window.groupHistoryCache[window.normalizeDni(dni)] = window.activeFichaRawDocs;
        // Sort explicitly by date & time ascending so chronological calculations (like deposits/insurance)
        // are applied correctly, and reversing later yields strict descending order.
        window.activeFichaRawDocs.sort((a, b) => {
            const dataA = typeof a.data === 'function' ? a.data() : a.data;
            const dataB = typeof b.data === 'function' ? b.data() : b.data;
            const dateTimeA = `${dataA.date || ''}T${dataA.time || '00:00'}`;
            const dateTimeB = `${dataB.date || ''}T${dataB.time || '00:00'}`;
            return dateTimeA.localeCompare(dateTimeB);
        });

        window.recalculateFichaHistory(dni);
        window.renderFichaFromCache(dni, targetTab);
    } catch (e) {
        console.error(e);
        document.getElementById('profile-history-list').innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Error de red al cargar el historial: ${e.message}</td></tr>`;
        switchFichaTab(targetTab);
    }
};

window.recalculateFichaHistory = function(dni) {
    if (!window.activeFichaRawDocs) return;
    
    const dObj = new Date();
    const todayStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
    
    const customerInfo = customerDatabase.find(c => window.isSameDni(c.dni, dni)) || { telefono: '', email: '', discount: 0 };
    
    let activeCustomerListener = null;

// ==========================================
// EMERGENCY AUTO-RECOVERY PROTOCOL
// Rebuilds deleted history documents from the active manifest
// ==========================================
window.emergencyRebuildHistory = async function() {
    if (!window.internalTrips || window.internalTrips.length === 0) return;
    if (localStorage.getItem('emergency_history_rebuild_v1')) return;
    
    console.log("🚑 Initiating Emergency History Rebuild...");
    const historyBatch = db.batch();
    let writes = 0;
    
    window.internalTrips.forEach(trip => {
        if (!trip.guests) return;
        trip.guests.forEach(gst => {
            if (!gst.dni || gst.cancelled) return;
            const ref = db.collection('mangamar_customers').doc(gst.dni).collection('history').doc(trip.id);
            historyBatch.set(ref, {
                date: trip.date,
                time: trip.time,
                site: trip.site || 'Inmersión',
                assignedBoat: trip.assignedBoat || 'B1',
                gas: gst.gas || '15L Aire',
                rental: gst.rental || 0,
                insurance: gst.insurance || 0,
                course: gst.course || null,
                coursePrice: gst.coursePrice || 0,
                computer: gst.computer || 0,
                paymentStatus: gst.paymentStatus || 'pending',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            writes++;
        });
    });
    
    if (writes > 0) {
        try {
            await historyBatch.commit();
            console.log(`🚑 Emergency Rebuild Complete: Restored ${writes} history documents.`);
            localStorage.setItem('emergency_history_rebuild_v1', 'true');
            // Refresh currently open ficha if any
            if (window.activeFichaDni) {
                const currentName = document.getElementById('profile-modal-name')?.innerText || '';
                window.openCustomerProfile(window.activeFichaDni, currentName, false);
            }
        } catch (e) {
            console.error("🚑 Rebuild failed:", e);
        }
    } else {
        localStorage.setItem('emergency_history_rebuild_v1', 'true');
    }
};

setTimeout(() => {
    window.emergencyRebuildHistory();
}, 4000); // Give database time to load internalTrips
// ==========================================
    const processedDives = [];
    const billedCoursesMap = {};
    const activeInsExpiryMap = {};

    // Helper: check both flat guests[] AND groups[].guests[] for a DNI match
    const isGuestOnTrip = (trip, targetDni) => {
        if (!trip || trip.cancelled) return false;
        const normTarget = (targetDni || '').trim().toLowerCase();
        // Check flat guests array (Visor-style trips)
        if ((trip.guests || []).some(g => (g.dni || '').trim().toLowerCase() === normTarget && !g.cancelled)) return true;
        // Check grouped guests array (Internal-style trips)
        if ((trip.groups || []).some(grp =>
            (grp.guests || []).some(g => (g.dni || '').trim().toLowerCase() === normTarget && !g.cancelled)
        )) return true;
        return false;
    };

    window.activeFichaRawDocs.forEach(item => {
        // Handle mock documents from optimistic rendering or real Firestore documents
        let data = typeof item.data === 'function' ? item.data() : item.data;
        
        const itemDni = item._ownerDni || window.normalizeDni(dni);
        const customerInfo = customerDatabase.find(c => window.isSameDni(c.dni, itemDni)) || { telefono: '', email: '', discount: 0 };
        
        if (!billedCoursesMap[itemDni]) billedCoursesMap[itemDni] = new Set();
        const billedCourses = billedCoursesMap[itemDni];
        
        let activeInsExpiry = activeInsExpiryMap[itemDni] || null;

        // 🚨 AUTO-PRUNE GHOST BILLS 🚨
        // Detects orphaned history documents (from the old race condition) and deletes them automatically.
        if (item.id && !item.id.startsWith('temp_') && data.type !== 'pago' && data.type !== 'producto' && data.type !== 'servicio') {
            // CRITICAL: We must find the INTERNAL trip (which has guests), not the base Visor template
            let realTrip = (window.mergedAllocations || []).find(t => t.id === item.id && t.isInternalTrip);
            
            if (realTrip) {
                // Trip is currently in RAM. Verify the guest is actually on the manifest.
                // Must check BOTH flat guests[] AND groups[].guests[] (internal trips use the grouped structure)
                const isActuallyOnBoat = isGuestOnTrip(realTrip, itemDni);
                if (!isActuallyOnBoat) {
                    console.warn(`🧹 Auto-Pruning ghost bill: ${itemDni} is no longer on trip ${item.id}. Deleting...`);
                    db.collection('mangamar_customers').doc(itemDni).collection('history').doc(item.id).delete().catch(e => console.error(e));
                    return; // Skip rendering this bill
                }
            } else {
                // Trip NOT in RAM. Mark for background deep-scan.
                item._needsDeepScan = true;
            }
        }

        let p = window.calculateDivePrice(data);

        let isCourseCovered = false;
        let courseRate = 0;

        if (data.course) {
            let baseCourse = data.baseCourse || data.course.split(' | ')[0].trim();

            let alreadyBilled = false;
            for (let bc of billedCourses) {
                if (window.matchCourseNames(bc, baseCourse)) {
                    alreadyBilled = true;
                    break;
                }
            }

            if (!alreadyBilled) {
                courseRate = data.coursePrice ? data.coursePrice : ((window.PRICES && window.PRICES[baseCourse]) ? window.PRICES[baseCourse] : 0);
                billedCourses.add(baseCourse);
                p.course = courseRate;
            } else {
                p.course = 0;
                isCourseCovered = true;
            }

            p.dive = 0;
            p.tasa = 0;
            if (data.rental === 'INC') p.rental = 0;
            p.insurance = 0; // Course always includes insurance
        }

        let isCovered = false;
        let cleanIns = (data.insurance || 0).toString().replace(' ✔', '');

        if (['1D', '1W', '1M', '1Y'].includes(cleanIns)) {
            if (activeInsExpiry && data.date <= activeInsExpiry) {
                isCovered = true;
                p.insurance = 0;
            } else {
                isCovered = false;
                let [y, m, d] = data.date.split('-').map(Number);
                let dateObj = new Date(y, m - 1, d);
                if (cleanIns === '1D') dateObj.setDate(dateObj.getDate() + 0);
                if (cleanIns === '1W') dateObj.setDate(dateObj.getDate() + 6);
                if (cleanIns === '1M') dateObj.setMonth(dateObj.getMonth() + 1);
                if (cleanIns === '1Y') dateObj.setFullYear(dateObj.getFullYear() + 1);
                activeInsExpiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                activeInsExpiryMap[itemDni] = activeInsExpiry;
            }
        } else if (cleanIns !== '0' && cleanIns !== 0) {
            isCovered = true;
            p.insurance = 0;
        }

        if (customerInfo.discount > 0 && customerInfo.discountType !== 'fixed' && !data.customPrice) {
            p.dive = p.dive * (1 - (customerInfo.discount / 100));
            if (p.course) p.course = p.course * (1 - (customerInfo.discount / 100));
        }

        p.total = p.dive + p.tasa + p.gas + p.rental + p.insurance + (p.course || 0) + (p.computer || 0) + (p.custom || 0);

        if (data.customPrice !== undefined && data.customPrice !== null) {
            p.total = parseFloat(data.customPrice) || 0;
        }

        // 🚨 ULTIMATE SANITY CHECK BEFORE RENDERING 🚨
        let safeToRender = true;
        if (item.id && !item.id.startsWith('temp_') && data.type !== 'pago' && data.type !== 'producto' && data.type !== 'servicio') {
            
            // Search in ALL allocations because auto-migration might have changed the master ID
            let activeTrip = (window.mergedAllocations || []).find(t => t.id === item.id) || (window.internalTrips || []).find(t => t.id === item.id);
            
            if (activeTrip) {
                // To be safe against auto-migrations, if we find ANY guest with this DNI on ANY trip at the exact same date, we assume it's valid.
                // Check BOTH mergedAllocations (includes visor) AND internalTrips, searching flat guests[] AND groups[].guests[]
                const allTripsOnDate = [
                    ...(window.mergedAllocations || []).filter(t => t.date === data.date),
                    ...(window.internalTrips || []).filter(t => t.date === data.date)
                ];
                let isGuestOnBoat = false;
                
                for (let t of allTripsOnDate) {
                    if (isGuestOnTrip(t, itemDni)) {
                        isGuestOnBoat = true;
                        break;
                    }
                }

                if (!isGuestOnBoat) {
                    safeToRender = false;
                    console.warn(`🚨 SILENT GHOST BLOCK: ${itemDni} is NOT on any trip on ${data.date}. Blocking UI...`);
                    // We only background delete if we are 100% sure they are not on ANY boat that day to avoid auto-migration conflicts
                    if (typeof db !== 'undefined') {
                        db.collection('mangamar_customers').doc(itemDni).collection('history').doc(item.id).delete().catch(e=>console.error("Silent delete fail", e));
                    }
                }
            } else {
                // Trip not in RAM. It could be an old trip or a deleted trip.
                // DO NOT DELETE IT SYNCHRONOUSLY. Just defer to deep scan to be safe.
                item._needsDeepScan = true;
            }
        }

        // item can be either a real doc or a mock doc
        if (safeToRender) {
            processedDives.push({ doc: item.doc || item, data, p, cleanIns, isCovered, isCourseCovered, _ownerDni: itemDni });
        }
    });

    processedDives.reverse();

    window.activeFichaPendingDocs = processedDives.filter(d => {
        if (d.data.paymentStatus === 'pending') return true;
        if (d.data.type === 'pago' && d.data.isPartialAbono) return true;
        return false;
    }).map(d => d.doc.id);
    
    window.activeFichaDives = processedDives;

    // 🚨 ASYNC DEEP-PRUNER 🚨
    // For ghost bills that belong to past months or deleted Visor trips that are no longer in RAM.
    const docsToDeepScan = window.activeFichaRawDocs.filter(d => d._needsDeepScan);
    if (docsToDeepScan.length > 0) {
        setTimeout(async () => {
            let deletedAny = false;
            for (const item of docsToDeepScan) {
                try {
                    let data = typeof item.data === 'function' ? item.data() : item.data;
                    const monthKey = data.date ? data.date.substring(0, 7) : null;
                    if (!monthKey) continue;

                    // 1. Check Internal Database first
                    const monthlyDoc = await db.collection('mangamar_monthly').doc(monthKey).get();
                    const allocs = monthlyDoc.data()?.allocations || {};
                    const internalTrip = allocs[item.id];
                    
                    let shouldDelete = false;
                    if (!internalTrip || internalTrip._deleted) {
                        // 2. Check actual Visor DB (reservations_monthly) if internal is missing
                        const visorDoc = await db.collection('reservations_monthly').doc(monthKey).get();
                        const visorAllocs = visorDoc.data()?.allocations || {};
                        const visorTrip = visorAllocs[item.id];
                        
                        if (!visorTrip || visorTrip._deleted) {
                            shouldDelete = true; // Exists in neither DB — true ghost bill
                        } else {
                            // Exists in Visor as a master booking. This is a legitimate history record.
                            // Do NOT delete it. The internal shadow may just not be created yet.
                            shouldDelete = false;
                        }
                    } else {
                        // Exists internally. Verify guest list — check BOTH flat guests[] AND groups[].guests[]
                        let isActuallyOnBoat = isGuestOnTrip(internalTrip, dni);
                        if (!isActuallyOnBoat) shouldDelete = true;
                    }

                    if (shouldDelete) {
                        console.warn(`🧹 Async Deep-Pruning ghost bill: ${item.id}`);
                        await db.collection('mangamar_customers').doc(dni).collection('history').doc(item.id).delete();
                        deletedAny = true;
                    }
                } catch(e) { console.error("Deep-Pruner error:", e); }
            }
if (deletedAny && window.activeFichaDni === dni) {
                console.log("♻️ Refreshing Ficha to hide deleted ghost bills...");
                const currentName = document.getElementById('profile-modal-name').innerText;
                const activeTab = document.getElementById('tab-content-caja') && !document.getElementById('tab-content-caja').classList.contains('hidden') ? 'caja' : 'historial';
                openCustomerProfile(dni, currentName, false, activeTab);
            }
        }, 800);
    }
};

window.renderFichaFromCache = function(dni, targetTab) {
    if (!targetTab) targetTab = window.activeFichaTab || 'caja';
    if (!window.activeFichaDives) return;
    
    const dObj = new Date();
    const todayStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;

    const formatCajaDate = (dateStr) => {
        if (!dateStr) return '—';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const weekday = days[d.getDay()];
        return `<div class="flex items-center gap-1.5"><span class="text-[9px] font-black text-slate-400 bg-slate-100 px-1 py-0.5 rounded tracking-wide select-none">${weekday}</span><span class="font-bold text-slate-700 whitespace-nowrap">${parts[2]}-${parts[1]}-${parts[0]}</span></div>`;
    };

    let html = '';
    let pagosHtml = '';
    let pendingServiciosHTML = '';
    let pendingProductosHTML = '';
    let pendingPagosHTML = '';
    let grandTotal = 0;
    let pendingTotal = 0;
    let pagosTotalSum = 0;

    const customerInfo = customerDatabase.find(c => window.isSameDni(c.dni, dni)) || { telefono: '', email: '', discount: 0 };
    
    // BACKWARDS COMPATIBILITY: Migrate single deposit to deposits array format
    if (customerInfo && !customerInfo.deposits) {
        customerInfo.deposits = [];
        if (customerInfo.deposit > 0) {
            customerInfo.deposits.push({
                id: 'legacy_' + Date.now(),
                amount: parseFloat(customerInfo.deposit) || 0,
                method: customerInfo.depositMethod || 'Efectivo',
                contasimple: customerInfo.depositContasimple || false,
                date: todayStr
            });
            // Clear legacy fields to prevent duplicate migration
            delete customerInfo.deposit;
            delete customerInfo.depositMethod;
            delete customerInfo.depositContasimple;
            // Background sync database to persist conversion
            const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
            window.safeMasterListWrite(cleanDatabase, 'legacy-deposit-migration-heal')
                .catch(e => console.error("Error legacy-deposit-migration-heal sync:", e));
        }
    }
    
    let fixedDiscountAmount = 0;
    if (customerInfo.discount > 0 && customerInfo.discountType === 'fixed') {
        fixedDiscountAmount = customerInfo.discount;
    }
    let positivePendingTotal = 0;
    let negativePendingTotal = 0;

    if (typeof window.fichaDisplayLimit === 'undefined') window.fichaDisplayLimit = 15;

    const fromEl = document.getElementById('historial-filter-from');
    const toEl = document.getElementById('historial-filter-to');
    const fromVal = fromEl ? fromEl.value : '';
    const toVal = toEl ? toEl.value : '';

    let historyRenderCount = 0;
    let paymentsRenderCount = 0;

    window.activeFichaDives.forEach((item, index) => {
        const { doc, data, p, cleanIns, isCovered, isCourseCovered } = item;

        let isPaid = data.paymentStatus === 'paid';
        if (data.type === 'pago' && data.isPartialAbono) {
            isPaid = false;
        } else if (data.type === 'pago' && data.paymentStatus === 'pending') {
            isPaid = false; // Legacy fallback
        }

        if (!isPaid && data.type !== 'pago') {
            pendingTotal += p.total;
        }

        let breakdownHtml = '';
        if (data.type === 'producto' || data.type === 'servicio') {
            breakdownHtml = `<span class="text-slate-500 font-bold">${p.custom.toFixed(2)}€ ${data.description}</span>`;
        } else if (data.type === 'pago') {
            breakdownHtml = `<span class="text-emerald-500 font-black">${Math.abs(p.custom).toFixed(2)}€ Aplicado a cuenta</span>`;
        } else if (data.course) {
            let displayCourse = data.baseCourse || data.course.split(' | ')[0];
            if (!isCourseCovered) breakdownHtml += `<span class="text-pink-600 font-black">${p.course.toFixed(2)}€ ${displayCourse}</span>`;
            else breakdownHtml += `<span class="text-pink-400 font-bold">✔ Curso Incl.</span>`;
        } else {
            breakdownHtml = `<span class="text-slate-500">${p.dive.toFixed(2)}€ Inm.</span>`;
        }

        if (!data.type) {
            if (p.tasa > 0) breakdownHtml += `<span class="text-slate-300 mx-1.5">+</span><span class="text-amber-600 font-bold">${p.tasa.toFixed(2)}€ Tasa</span>`;
            const extrasTotal = p.gas + p.rental + p.insurance;
            if (extrasTotal > 0) breakdownHtml += `<span class="text-slate-300 mx-1.5">+</span><span class="text-slate-400">${extrasTotal.toFixed(2)}€ Ext.</span>`;
            if (p.computer > 0) breakdownHtml += `<span class="text-slate-300 mx-1.5">+</span><span class="text-cyan-600 font-bold">${p.computer.toFixed(2)}€ <span style="font-variant:small-caps">Comp</span></span>`;
        }

        let matchesFilter = true;
        if (fromVal && data.date < fromVal) matchesFilter = false;
        if (toVal && data.date > toVal) matchesFilter = false;

        if (matchesFilter) {
            if (data.type !== 'pago') grandTotal += p.total;

            const isNitrox = (data.gas || '').includes('EAN');
            const gasColor = isNitrox ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-50 text-blue-600 border-blue-200';
            const gasShortText = (data.gas || '15L Aire').replace('Aire', 'Aire').replace(/EAN\s*(\d+)/i, '$1%');

            let rentalClass = 'bg-diagonal-yellow text-slate-300 border-yellow-200';
            let rentalText = 'Eq';
            if (data.rental === 1) { rentalClass = 'bg-half-yellow border-yellow-400 text-yellow-800'; }
            else if (data.rental === 2) { rentalClass = 'bg-full-yellow border-yellow-500 text-yellow-900'; }
            else if (data.rental === 'INC') {
                rentalClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner';
                rentalText = 'INC';
            }

            let compHistClass = 'bg-slate-50 text-slate-200 border-slate-100';
            let compHistText = 'Comp';
            if (data.computer === 1) { compHistClass = 'bg-cyan-500 text-white border-cyan-600 font-black shadow-inner'; }
            else if (data.computer === 'INC') { compHistClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner'; compHistText = 'INC'; }
            let bonoClass = data.hasBono ? 'bg-indigo-500 text-white border-indigo-600 font-bold' : 'bg-diagonal-indigo text-indigo-300 border-indigo-200';

            let insClass = 'px-1.5 min-w-[36px] bg-red-500 text-white border-red-600';
            let insText = 'Seg 🛑';
            if (cleanIns === 'INC') {
                insClass = 'px-1.5 min-w-[36px] bg-emerald-500 text-white border-emerald-600 font-black shadow-inner';
                insText = 'INC';
            } else if (cleanIns !== '0' && cleanIns !== 0) {
                if (isCovered) {
                    insClass = 'px-1.5 min-w-[36px] bg-emerald-500 text-white border-emerald-600 font-black shadow-inner';
                    insText = ['1D', '1W', '1M', '1Y'].includes(cleanIns) ? `Seg ✔ (${cleanIns})` : 'Seg ✔';
                } else {
                    insClass = 'px-1.5 min-w-[36px] bg-blue-500 text-white border-blue-600 font-bold shadow-sm';
                    insText = ['1D', '1W', '1M', '1Y'].includes(cleanIns) ? `Seg 💳 (${cleanIns})` : 'Seg 💳';
                }
            }

            const payTitle = isPaid ? `Cobrado con ${data.paymentMethod || 'Tarjeta'} por ${data.paidBy || 'N/A'}` : '';
            const statusBtn = isPaid
                ? `<button onclick="togglePaymentStatus('${dni}', '${doc.id}', 'paid')" class="px-2.5 py-1 bg-green-50 text-green-600 border border-green-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-green-100 transition-colors shrink-0 w-full shadow-sm" title="${payTitle}">Pagado</button>`
                : `<button onclick="togglePaymentStatus('${dni}', '${doc.id}', 'pending')" class="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5 shrink-0 w-full shadow-sm" title="Pendiente de Pago"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Pendiente</button>`;

            let isSel = window.activeHistorialSelection && window.activeHistorialSelection.find(x => x.docId === doc.id);
            let checkIcon = isSel ?
                `<div class="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center transition-colors shadow-inner"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>` :
                `<div class="w-6 h-6 rounded-full bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500 flex items-center justify-center transition-colors shadow-inner"><svg class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg></div>`;

            let centerColsHTML = '';
            if (data.type === 'producto' || data.type === 'servicio' || data.type === 'pago') {
                const isProd = data.type === 'producto';
                const isPago = data.type === 'pago';
                let tagStr = isPago ? 'PAGO' : (isProd ? 'PROD' : 'SERV');
                let tagColor = isPago ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : (isProd ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200');
                
                centerColsHTML = `
                <td class="py-2 px-3 align-middle whitespace-nowrap">
                    <span class="text-xs font-black text-slate-800">${data.date}</span>
                </td>
                <td class="py-2 px-3 align-middle w-full" colspan="2">
                    <div class="font-bold text-slate-800 text-sm flex items-center gap-2">
                        <span class="px-1.5 ${tagColor} rounded text-[9px] uppercase font-black shadow-sm border">${tagStr}</span> 
                        ${data.description}
                    </div>
                </td>`;
            } else {
                centerColsHTML = `
                <td class="py-2 px-3 align-middle whitespace-nowrap cursor-pointer" onclick="openBoatFromHistory(event, '${data.date}', '${data.time}', '${data.assignedBoat}')">
                    <div class="flex items-baseline gap-2">
                        <span class="text-xs font-black text-slate-800 group-hover:text-blue-700 transition-colors">${data.date}</span>
                        <span class="text-[10px] font-bold text-slate-400">${data.time}</span>
                    </div>
                </td>
                <td class="py-2 px-3 text-xs font-bold text-slate-700 align-middle whitespace-nowrap cursor-pointer" onclick="openBoatFromHistory(event, '${data.date}', '${data.time}', '${data.assignedBoat}')">${data.site}</td>
                <td class="py-2 px-3 align-middle cursor-pointer" onclick="openBoatFromHistory(event, '${data.date}', '${data.time}', '${data.assignedBoat}')">
                    <div class="flex items-center justify-start gap-1">
                        <div class="w-12 h-6 flex justify-center items-center rounded border text-[9px] font-black whitespace-nowrap ${gasColor}">${gasShortText}</div>
                        <div class="w-7 h-6 flex justify-center items-center rounded border text-[9px] font-black shrink-0 whitespace-nowrap ${rentalClass}">${rentalText}</div>
                        <div class="w-9 h-6 flex justify-center items-center rounded border text-[9px] font-black shrink-0 whitespace-nowrap ${compHistClass}">${compHistText}</div>
                        <div class="h-6 flex justify-center items-center rounded border text-[9px] font-black shrink-0 whitespace-nowrap ${insClass}">${insText}</div>
                        <div class="w-6 h-6 flex justify-center items-center rounded border text-[10px] font-bold shrink-0 ${bonoClass}" title="${data.hasBono ? 'Usa Bono' : 'Sin Bono'}">B</div>
                        ${(data.localDeposit > 0) ? `<div class="h-6 px-1.5 flex justify-center items-center rounded border text-[9px] font-black shrink-0 whitespace-nowrap ${data.localDepositC ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-orange-50 text-orange-600 border-orange-300'}" title="Depósito: ${data.localDeposit}€${data.localDepositMethod ? ' (' + data.localDepositMethod + ')' : ''}">Señal ${data.localDeposit}€</div>` : ''}
                    </div>
                </td>`;
            }

            if (data.type === 'pago') {
                pagosTotalSum += Math.abs(parseFloat(data.customPrice) || 0);
                if (paymentsRenderCount < window.fichaDisplayLimit) {
                    pagosHtml += `
                    <tr class="group border-b border-slate-100 hover:bg-emerald-50 transition-colors h-12" data-doc-id="${doc.id}">
                        <td class="py-2 px-3 align-middle text-center"></td>
                        <td class="py-2 px-3 align-middle whitespace-nowrap">
                            <span class="text-xs font-black text-slate-800">${data.date}</span>
                        </td>
                        <td class="py-2 px-3 align-middle w-full text-xs font-bold text-slate-600">
                            ${data.description}
                        </td>
                        <td class="py-2 px-3 align-middle text-right shrink-0 whitespace-nowrap text-sm font-black text-emerald-600">
                            -${Math.abs(parseFloat(data.customPrice) || 0)} €
                        </td>
                        <td class="py-2 px-3 text-center align-middle shrink-0">
                            <button onclick="window.deleteHistoryItem('${dni}', '${doc.id}', '${data.date.substring(0, 7)}', 'pago')" class="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50" title="Eliminar pago"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                        </td>
                    </tr>`;
                }
                paymentsRenderCount++;
            } else {
                if (historyRenderCount < window.fichaDisplayLimit) {
                    html += `
                    <tr class="group border-b border-slate-100 hover:bg-blue-50 transition-colors h-12 ${isPaid ? 'opacity-70 hover:opacity-100' : ''}" data-doc-id="${doc.id}">
                        <td class="py-2 px-3 align-middle text-center" onclick="toggleHistorialRowSelection(this, '${doc.id}', '${dni}', ${p.total}, '${data.paymentStatus}', '${data.date.substring(0, 7)}')">
                            <div class="cursor-pointer inline-block" title="Seleccionar fila">${checkIcon}</div>
                        </td>
                        ${centerColsHTML}
                        <td class="py-2 px-3 text-right align-middle w-full">
                            <div class="flex items-center justify-end gap-4 w-full">
                                <div class="font-black text-slate-800 text-sm whitespace-nowrap shrink-0 cursor-pointer hover:text-blue-600 hover:scale-110 transition-all px-2 py-1 rounded hover:bg-blue-50 border border-transparent hover:border-blue-200" 
                                     title="Click para editar precio" 
                                     onclick="window.inlineEditPrice(event, this, '${dni}', '${doc.id}', ${p.total})">${p.total} €</div>
                                <div class="flex items-center gap-2 shrink-0">
                                    <button onclick="window.generateFactura('${doc.id}')" class="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-500 rounded text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 hover:text-slate-800 transition-colors shadow-sm flex items-center justify-center h-[26px]" title="Ver Detalles Visuales">
                                        <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        Detalles
                                    </button>
                                    <div class="w-[85px] flex justify-end h-[26px]">${statusBtn}</div>
                                </div>
                            </div>
                        </td>
                        <td class="py-2 px-3 text-center align-middle shrink-0">
                            <button onclick="window.deleteHistoryItem('${dni}', '${doc.id}', '${data.date.substring(0, 7)}', '${data.type || 'buceo'}')" class="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50" title="Eliminar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                        </td>
                    </tr>`;
                }
                historyRenderCount++;
            }
        }
    });

    let totalLocalDeposits = 0;
    let oldestPendingTrip = null;
    let localDepositMethod = '';
    
    // BACKWARDS COMPATIBILITY: Migrate localDeposit fields on dive records into customerInfo.deposits
    if (window.activeFichaDives) {
        const divesMigratedThisSession = [];
        
        window.activeFichaDives.forEach(item => {
            const { data, doc } = item;
            const itemDni = item._ownerDni || dni;
            const memberProfile = customerDatabase.find(c => window.isSameDni(c.dni, itemDni));
            if (!memberProfile) return;
            if (!memberProfile.deposits) memberProfile.deposits = [];
            
            let isPaid = data.paymentStatus === 'paid';
            if (data.type === 'pago' && data.isPartialAbono) isPaid = false;
            else if (data.type === 'pago' && data.paymentStatus === 'pending') isPaid = false;
            if (data.type === 'pago' || data.type === 'producto' || data.type === 'servicio') return;

            const localDepAmt = parseFloat(data.localDeposit) || 0;
            if (!isPaid && localDepAmt > 0) {
                // Migrate into memberProfile.deposits
                const migratedId = 'migrated_manifest_' + doc.id;
                const alreadyMigrated = memberProfile.deposits.some(d => d.id === migratedId);
                if (!alreadyMigrated) {
                    memberProfile.deposits.push({
                        id: migratedId,
                        amount: localDepAmt,
                        method: data.localDepositMethod || 'Efectivo',
                        contasimple: data.localDepositC || false,
                        date: data.date || todayStr,
                        _migratedFromDiveId: doc.id
                    });
                    divesMigratedThisSession.push({ docId: doc.id, localDepAmt, ownerDni: itemDni });
                    totalLocalDeposits += localDepAmt;
                }
                if (data.localDepositMethod) localDepositMethod = data.localDepositMethod;
            }
        });
        
        // Persist migration to master list & clear localDeposit from dive docs in background
        if (divesMigratedThisSession.length > 0) {
            (async () => {
                try {
                    const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
                    await window.safeMasterListWrite(cleanDatabase, 'migrate-local-deposit-to-profile');
                    for (const { docId, ownerDni } of divesMigratedThisSession) {
                        db.collection('mangamar_customers').doc(ownerDni).collection('history').doc(docId)
                            .update({ localDeposit: firebase.firestore.FieldValue.delete(), localDepositMethod: firebase.firestore.FieldValue.delete(), localDepositC: firebase.firestore.FieldValue.delete() })
                            .catch(e => console.warn('Could not clear localDeposit from dive:', e));
                    }
                    window.renderFichaFromCache(dni);
                } catch (e) {
                    console.error('Error migrating localDeposit to profile:', e);
                }
            })();
        }
    }

    oldestPendingTrip = window.activeFichaDives ? [...window.activeFichaDives].reverse().find(d => {
        if (d.data.paymentStatus !== 'pending') return false;
        if (d.data.type === 'pago' || d.data.type === 'producto' || d.data.type === 'servicio') return false;
        return true;
    }) : null;

    // Merge active profile deposits of all selected group members
    const activeDeps = [];
    const selectedDnis = window.cajaSelectedGroupMembers || new Set([window.normalizeDni(dni)]);
    selectedDnis.forEach(mDni => {
        const memberProfile = customerDatabase.find(c => window.isSameDni(c.dni, mDni));
        if (memberProfile && memberProfile.deposits) {
            memberProfile.deposits.forEach(d => {
                activeDeps.push({ ...d, _ownerDni: mDni });
            });
        }
    });

    // Also include pending history payment items (legacy deposits) in activeDeps
    (window.activeFichaDives || []).forEach(item => {
        const { doc, data, p, _ownerDni } = item;
        if (data && data.type === 'pago' && data.paymentStatus === 'pending') {
            const isMigrated = activeDeps.some(d => d.id === 'migrated_manifest_' + doc.id || d._migratedFromDiveId === doc.id);
            if (!isMigrated && !activeDeps.some(d => d.id === doc.id)) {
                const amt = Math.abs(parseFloat(data.amount) || parseFloat(data.total) || parseFloat(p.total) || 0);
                if (amt > 0) {
                    activeDeps.push({
                        id: doc.id,
                        amount: amt,
                        method: data.paymentMethod || data.method || 'Efectivo',
                        contasimple: data.contasimple || false,
                        date: data.date,
                        _ownerDni: _ownerDni,
                        _isHistoryPagoDoc: true
                    });
                }
            }
        }
    });

    const profileDepositsSum = activeDeps.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const depositCaja = totalLocalDeposits + profileDepositsSum;

    const cajaListEl = document.getElementById('caja-pending-list');
    if (cajaListEl) {
        // Group Selector Pill Badges (Dropdown selection format)
        const groupSelEl = document.getElementById('caja-group-selector-container');
        if (groupSelEl) {
            const myGroups = (window.globalGroups || []).filter(g => (g.members || []).some(m => window.isSameDni(m, dni)));
            if (myGroups.length === 0) {
                groupSelEl.innerHTML = '';
            } else {
                const grp = myGroups[0];
                const members = grp.members || [];
                const selectedCount = members.filter(m => window.cajaSelectedGroupMembers.has(window.normalizeDni(m))).length;
                groupSelEl.innerHTML = `
                    <div class="relative inline-block text-left">
                        <button id="caja-group-dropdown-trigger" onclick="window.toggleCajaGroupDropdown(this)" class="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-black text-[9px] rounded-lg shadow-sm flex items-center gap-1 transition-all select-none active:scale-95 uppercase tracking-wider">
                            <span>👥 Grupo (${selectedCount}/${members.length})</span>
                            <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                    </div>
                `;
            }
        }

        const showAll = false; // "Ver todo el historial" removed
        const thirtyDaysAgoObj = new Date();
        thirtyDaysAgoObj.setDate(thirtyDaysAgoObj.getDate() - 30);
        const thirtyDaysAgoStr = `${thirtyDaysAgoObj.getFullYear()}-${String(thirtyDaysAgoObj.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgoObj.getDate()).padStart(2, '0')}`;
        
        let finalCajaHTML = '';
        let totalPendingCount = 0;
        let positivePendingTotal = 0;
        let negativePendingTotal = 0;
        
        const fixNameCaps = (str) => {
            if (!str) return '';
            return str.toLowerCase().split(' ').map(word =>
                word.split('-').map(part => {
                    if (/^(i{1,3}|iv|vi{1,3}|ix)$/i.test(part)) {
                        return part.toUpperCase();
                    }
                    return part.charAt(0).toUpperCase() + part.slice(1);
                }).join('-')
            ).join(' ');
        };

        // Filter activeFichaDives items
        const filteredDives = (window.activeFichaDives || []).filter(item => {
            const isPaid = item.data.paymentStatus === 'paid';
            const isPendingPago = item.data.type === 'pago' && item.data.paymentStatus === 'pending';
            if (isPendingPago) return false; // Handled under activeDeps
            return !isPaid || (showAll && item.data.date && item.data.date >= thirtyDaysAgoStr);
        });

        // Group dives with same doc.id
        const groupedItems = [];
        const groupsMap = {};

        filteredDives.forEach(item => {
            const { doc, data, p } = item;
            const key = doc.id;
            
            const isDiveTrip = !data.type;
            const groupKey = isDiveTrip ? key : `${key}_${Math.random()}`; // unique key to prevent grouping of separate manual bills
            
            if (!groupsMap[groupKey]) {
                groupsMap[groupKey] = {
                    doc: doc,
                    data: { ...data },
                    p: {
                        dive: p.dive,
                        tasa: p.tasa,
                        gas: p.gas,
                        rental: p.rental,
                        insurance: p.insurance,
                        computer: p.computer,
                        course: p.course || 0,
                        custom: p.custom || 0,
                        total: p.total
                    },
                    items: [item]
                };
                groupedItems.push(groupsMap[groupKey]);
            } else {
                const grp = groupsMap[groupKey];
                grp.items.push(item);
                grp.p.dive += p.dive;
                grp.p.tasa += p.tasa;
                grp.p.gas += p.gas;
                grp.p.rental += p.rental;
                grp.p.insurance += p.insurance;
                grp.p.computer += p.computer;
                grp.p.course += (p.course || 0);
                grp.p.custom += (p.custom || 0);
                grp.p.total += p.total;
            }
        });

        // 1. Render Profile Deposits (Show at the top!)
        activeDeps.forEach(dep => {
            const isChecked = !window.cajaUncheckedDocIds || !window.cajaUncheckedDocIds.has('deposit_profile_' + dep.id);
            const conceptName = `Depósito Anticipado (${dep.method})`;
            
            const ownerProfile = customerDatabase.find(c => window.isSameDni(c.dni, dep._ownerDni));
            const ownerName = ownerProfile ? `${ownerProfile.nombre} ${ownerProfile.apellido || ''}`.trim() : dep._ownerDni;
            
            const depAmount = parseFloat(dep.amount) || 0;

            finalCajaHTML += `
            <tr class="border-b border-slate-100 h-10 transition-colors bg-emerald-50/15 hover:bg-emerald-50/25" data-doc-id="deposit_profile_${dep.id}">
                <td class="py-2 px-2 align-middle text-slate-400 font-medium whitespace-nowrap text-[10px] uppercase">${dep.date ? formatCajaDate(dep.date) : '—'}</td>
                <td class="py-2 px-2 align-middle font-bold text-slate-700 max-w-[140px] truncate" title="${conceptName} - Propietario: ${ownerName}">
                    <div class="flex items-center gap-1.5">
                        <span class="px-1 bg-emerald-100 text-emerald-700 rounded text-[7px] font-black uppercase tracking-wider">Depósito</span>
                        <span class="truncate">${conceptName} (${ownerName})</span>
                    </div>
                </td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="font-black text-emerald-600 text-right whitespace-nowrap"><span class="whitespace-nowrap">-${depAmount.toFixed(2)}&nbsp;€</span></div></td>
                <td class="py-2 px-2 align-middle text-center">
                    <div class="relative flex items-center justify-center h-5 w-full">
                        <input type="checkbox" id="caja-checkbox-deposit_profile_${dep.id}" data-doc-id="deposit_profile_${dep.id}" data-owner-dni="${dep._ownerDni || dni}" data-amount="${depAmount}" class="caja-item-checkbox rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer" onchange="window.handleCheckboxChange(this, 'deposit_profile_${dep.id}')" ${isChecked ? 'checked' : ''}>
                        <button onclick="window.deleteCustomerDepositFromCaja('${dep._ownerDni || dni}', '${dep.id}')" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-350 hover:text-red-500 p-0.5 rounded hover:bg-red-50 transition-colors" title="Eliminar depósito">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        });
        
        // 2. Render Local Manifest Deposits (if any and NOT yet migrated into profile deposits)
        const hasMigratedAll = totalLocalDeposits > 0 && activeDeps.some(d => d.id && d.id.startsWith('migrated_manifest_'));
        if (totalLocalDeposits > 0 && !hasMigratedAll) {
            const isChecked = !window.cajaUncheckedDocIds || !window.cajaUncheckedDocIds.has('deposit_local_manifest');
            const conceptName = `Depósito en Manifiesto (${localDepositMethod || 'Efectivo'})`;
            finalCajaHTML += `
            <tr class="border-b border-slate-100 h-10 transition-colors bg-emerald-50/15 hover:bg-emerald-50/25" data-doc-id="deposit_local_manifest">
                <td class="py-2 px-2 align-middle text-slate-400 font-medium whitespace-nowrap text-[10px] uppercase">—</td>
                <td class="py-2 px-2 align-middle font-bold text-slate-700 max-w-[140px] truncate" title="${conceptName}">
                    <div class="flex items-center gap-1.5">
                        <span class="px-1 bg-emerald-100 text-emerald-700 rounded text-[7px] font-black uppercase tracking-wider">Depósito</span>
                        <span class="truncate">${conceptName}</span>
                    </div>
                </td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="text-slate-400 text-center font-medium">—</div></td>
                <td class="py-2 px-2 align-middle"><div class="font-black text-emerald-600 text-right whitespace-nowrap"><span class="whitespace-nowrap">-${totalLocalDeposits.toFixed(2)}&nbsp;€</span></div></td>
                <td class="py-2 px-2 align-middle text-center">
                    <div class="relative flex items-center justify-center h-5 w-full">
                        <input type="checkbox" id="caja-checkbox-deposit_local_manifest" data-doc-id="deposit_local_manifest" data-amount="${totalLocalDeposits}" class="caja-item-checkbox rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer" onchange="window.handleCheckboxChange(this, 'deposit_local_manifest')" ${isChecked ? 'checked' : ''}>
                    </div>
                </td>
            </tr>`;
        }

        // 3. Loop over grouped items (Show second!)
        groupedItems.forEach(group => {
            const { doc, data, p } = group;
            const isPaid = data.paymentStatus === 'paid';
            
            if (!isPaid) {
                totalPendingCount++;
                if (data.type === 'pago') {
                    negativePendingTotal += p.total;
                } else {
                    positivePendingTotal += p.total;
                }
            }
            
            let conceptName = '';
            if (data.type === 'producto' || data.type === 'servicio' || data.type === 'pago') {
                conceptName = data.description || '';
            } else {
                conceptName = data.site || 'Inmersión';
            }
            conceptName = fixNameCaps(conceptName);
            
            const isPago = data.type === 'pago';
            const isProduct = data.type === 'producto';
            const isService = data.type === 'servicio';
            const isDive = !data.type;
            
            let cBuceo = isDive && !data.course ? p.dive : 0;
            let cTasa = isDive && !data.course ? p.tasa : 0;
            let cGas = isDive && !data.course ? p.gas : 0;
            let cRental = isDive && !data.course ? p.rental : 0;
            let cComputer = isDive && !data.course ? p.computer : 0;
            let cInsurance = isDive && !data.course ? p.insurance : 0;
            let cOtros = isDive && data.course ? p.course : (isDive ? 0 : p.total);
            
            // Build name list for fallback / column tooltip filtering
            const names = group.items.map(it => {
                const itDni = it._ownerDni || dni;
                let name = '';
                const profile = customerDatabase.find(c => window.isSameDni(c.dni, itDni));
                if (profile) {
                    name = `${profile.nombre} ${profile.apellido || ''}`.trim();
                } else {
                    if (typeof activeBoatItem !== 'undefined' && activeBoatItem && activeBoatItem.groups) {
                        for (const g of activeBoatItem.groups) {
                            const gst = (g.guests || []).find(gst => window.isSameDni(gst.dni, itDni));
                            if (gst && gst.nombre) {
                                name = gst.nombre;
                                break;
                            }
                        }
                    }
                    if (!name) {
                        for (const trip of (window.mergedAllocations || [])) {
                            if (trip.groups) {
                                for (const g of trip.groups) {
                                    const gst = (g.guests || []).find(gst => window.isSameDni(gst.dni, itDni));
                                    if (gst && gst.nombre) {
                                        name = gst.nombre;
                                        break;
                                    }
                                }
                            }
                            if (name) break;
                        }
                    }
                }
                return name || itDni;
            });
            const uniqueNames = Array.from(new Set(names));
            const namesTooltip = uniqueNames.map(name => `• ${name}`).join('\n');

            const getFieldTooltip = (fieldName) => {
                const contributors = group.items.filter(item => {
                    const ip = item.p || {};
                    if (fieldName === 'dive') return (ip.dive || 0) !== 0;
                    if (fieldName === 'tasa') return (ip.tasa || 0) !== 0;
                    if (fieldName === 'gas') return (ip.gas || 0) !== 0;
                    if (fieldName === 'rental') return (ip.rental || 0) !== 0;
                    if (fieldName === 'computer') return (ip.computer || 0) !== 0;
                    if (fieldName === 'insurance') return (ip.insurance || 0) !== 0;
                    if (fieldName === 'otros') {
                        if (isDive) return (ip.course || 0) !== 0;
                        return (ip.total || 0) !== 0;
                    }
                    if (fieldName === 'total') return (ip.total || 0) !== 0;
                    return false;
                });
                
                const cNames = contributors.map(it => {
                    const itDni = it._ownerDni || dni;
                    let name = '';
                    const profile = customerDatabase.find(c => window.isSameDni(c.dni, itDni));
                    if (profile) {
                        name = `${profile.nombre} ${profile.apellido || ''}`.trim();
                    } else {
                        if (typeof activeBoatItem !== 'undefined' && activeBoatItem && activeBoatItem.groups) {
                            for (const g of activeBoatItem.groups) {
                                const gst = (g.guests || []).find(gst => window.isSameDni(gst.dni, itDni));
                                if (gst && gst.nombre) {
                                    name = gst.nombre;
                                    break;
                                }
                            }
                        }
                        if (!name) {
                            for (const trip of (window.mergedAllocations || [])) {
                                if (trip.groups) {
                                    for (const g of trip.groups) {
                                        const gst = (g.guests || []).find(gst => window.isSameDni(gst.dni, itDni));
                                        if (gst && gst.nombre) {
                                            name = gst.nombre;
                                            break;
                                        }
                                    }
                                }
                                if (name) break;
                            }
                        }
                    }
                    return name || itDni;
                });
                
                const uniqueCNames = Array.from(new Set(cNames));
                if (uniqueCNames.length === 0) {
                    return uniqueNames.map(name => `• ${name}`).join('\n');
                }
                return uniqueCNames.map(name => `• ${name}`).join('\n');
            };

            const formatCell = (val, fieldName) => {
                const displayVal = val !== 0 ? `<span class="whitespace-nowrap">${val.toFixed(2)}&nbsp;€</span>` : '—';
                if (isPaid) return `<div class="text-slate-400 text-center font-medium whitespace-nowrap">${displayVal}</div>`;
                const targetDni = group.items[0]._ownerDni || dni;
                return `<div class="text-slate-800 text-center font-bold hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded px-1 py-0.5 cursor-pointer transition-all hover:scale-105 whitespace-nowrap" onclick="window.inlineEditCell(event, this, '${targetDni}', '${doc.id}', '${fieldName}', ${val})">${displayVal}</div>`;
            };
            
            const formatTotalCell = (val) => {
                const displayVal = `<span class="whitespace-nowrap">${val.toFixed(2)}&nbsp;€</span>`;
                if (isPaid) return `<div class="text-slate-400 text-right font-medium whitespace-nowrap">${displayVal}</div>`;
                const targetDni = group.items[0]._ownerDni || dni;
                return `<div class="font-black ${isPago ? 'text-emerald-600' : 'text-amber-600'} text-right hover:bg-amber-50 border border-transparent hover:border-amber-200 rounded px-1 py-0.5 cursor-pointer transition-all hover:scale-105 whitespace-nowrap" onclick="window.inlineEditCell(event, this, '${targetDni}', '${doc.id}', 'total', ${val})">${displayVal}</div>`;
            };
            
            let isChecked = !window.cajaUncheckedDocIds || !window.cajaUncheckedDocIds.has(doc.id);
            let actionColHTML = '';
            if (isPaid) {
                actionColHTML = `<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[9px] uppercase font-black shadow-sm select-none">Pagado</span>`;
            } else {
                actionColHTML = `
                    <div class="relative flex items-center justify-center h-5 w-full">
                        <input type="checkbox" data-doc-id="${doc.id}" class="caja-item-checkbox rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer" onchange="window.handleCheckboxChange(this, '${doc.id}')" ${isChecked ? 'checked' : ''}>
                        ${(isProduct || isService || isPago) ? `<button onclick="window.deleteHistoryItem('${group.items[0]._ownerDni || dni}', '${doc.id}', '${data.date.substring(0, 7)}', '${data.type || 'buceo'}')" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-350 hover:text-red-500 p-0.5 rounded hover:bg-red-50 transition-colors" title="Eliminar"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>` : ''}
                    </div>
                `;
            }
            
            let rowClass = '';
            if (isPaid) {
                rowClass = 'bg-slate-50/50 opacity-70 hover:opacity-100';
            } else {
                rowClass = (totalPendingCount % 2 === 0) ? 'bg-orange-50 hover:bg-orange-100/70' : 'bg-white hover:bg-slate-50/80';
            }
            
            finalCajaHTML += `
            <tr class="border-b border-slate-100 h-10 transition-colors ${rowClass}" data-doc-id="${doc.id}">
                <td class="py-2 px-2 align-middle text-slate-400 font-medium whitespace-nowrap text-[10px] uppercase">${formatCajaDate(data.date)}</td>
                <td class="py-2 px-2 align-middle font-bold text-slate-700 max-w-[140px] truncate" title="${conceptName} (Diver: ${namesTooltip})">
                    <div class="flex items-center gap-1.5" title="${namesTooltip}">
                        ${isDive ? '<span class="px-1 bg-sky-100 text-sky-700 rounded text-[7px] font-black uppercase tracking-wider">Buceo</span>' : ''}
                        ${isProduct ? '<span class="px-1 bg-indigo-100 text-indigo-700 rounded text-[7px] font-black uppercase tracking-wider">Prod</span>' : ''}
                        ${isService ? '<span class="px-1 bg-fuchsia-100 text-fuchsia-700 rounded text-[7px] font-black uppercase tracking-wider">Serv</span>' : ''}
                        ${isPago ? '<span class="px-1 bg-emerald-100 text-emerald-700 rounded text-[7px] font-black uppercase tracking-wider">Pago</span>' : ''}
                        <span class="truncate">${conceptName}</span>
                    </div>
                </td>
                <td class="py-2 px-2 align-middle" title="${getFieldTooltip('dive')}">${formatCell(cBuceo, 'dive')}</td>
                <td class="py-2 px-2 align-middle" title="${getFieldTooltip('tasa')}">${formatCell(cTasa, 'tasa')}</td>
                <td class="py-2 px-2 align-middle" title="${getFieldTooltip('gas')}">${formatCell(cGas, 'gas')}</td>
                <td class="py-2 px-2 align-middle" title="${getFieldTooltip('rental')}">${formatCell(cRental, 'rental')}</td>
                <td class="py-2 px-2 align-middle" title="${getFieldTooltip('computer')}">${formatCell(cComputer, 'computer')}</td>
                <td class="py-2 px-2 align-middle" title="${getFieldTooltip('insurance')}">${formatCell(cInsurance, 'insurance')}</td>
                <td class="py-2 px-2 align-middle" title="${getFieldTooltip('otros')}">${formatCell(cOtros, 'otros')}</td>
                <td class="py-2 px-2 align-middle" title="${getFieldTooltip('total')}">${formatTotalCell(p.total)}</td>
                <td class="py-2 px-2 align-middle text-center">${actionColHTML}</td>
            </tr>`;
        });
        
        if (positivePendingTotal > 0 || negativePendingTotal !== 0 || depositCaja > 0) {
             finalCajaHTML += `
             <tr class="bg-slate-50 border-y border-slate-150 font-bold">
                 <td colspan="9" class="px-2 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Subtotal:</td>
                 <td id="caja-footer-subtotal" class="px-2 py-2 text-slate-700 text-right font-bold text-sm whitespace-nowrap">0.00&nbsp;€</td>
                 <td></td>
             </tr>
             <tr id="caja-footer-discount-row" class="bg-rose-50/50 border-t border-rose-100 font-bold hidden">
                 <td colspan="9" class="px-2 py-1.5 text-[10px] font-black uppercase text-rose-500 tracking-widest text-right">Descuento Global:</td>
                 <td id="caja-footer-discount" class="px-2 py-1.5 text-rose-600 text-right font-bold text-xs whitespace-nowrap">0.00&nbsp;€</td>
                 <td></td>
             </tr>
             <tr class="bg-amber-50 border-t-2 border-amber-200 font-black">
                 <td colspan="9" class="px-2 py-3 text-right"><span class="text-[10px] font-black uppercase text-amber-800 tracking-widest mr-4">Total a Pagar:</span></td>
                 <td id="caja-footer-total" class="px-2 py-3 text-lg font-black text-amber-600 text-right whitespace-nowrap w-24">0.00&nbsp;€</td>
                 <td></td>
             </tr>`;
        }
        
        if (!finalCajaHTML) {
            finalCajaHTML = `<tr><td colspan="11" class="p-8 text-center"><div class="text-3xl mb-2">🎉</div><div class="text-sm font-bold text-slate-400">Sin cargos pendientes</div></td></tr>`;
        }
        cajaListEl.innerHTML = finalCajaHTML;
        document.getElementById('caja-pending-count').innerText = `${totalPendingCount} items`;
        
        if (typeof window.recomputeCajaSelectedTotals === 'function') {
            window.recomputeCajaSelectedTotals();
        }
    }

    let totalAPagar = Math.max(0, pendingTotal - depositCaja - fixedDiscountAmount);

    if (grandTotal > 0) {
        html += `
        <tr class="bg-slate-50 border-t-2 border-slate-200">
            <td colspan="4" class="py-3 px-3 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px] align-middle">Total Historial (Buceos y Productos)</td>
            <td class="py-3 px-3 text-right font-black text-slate-400 text-lg align-middle">${grandTotal.toFixed(2)} €</td>
            <td></td>
        </tr>`;
    }

    if (historyRenderCount > window.fichaDisplayLimit) {
        const moreBtnHistorial = `
        <tr>
            <td colspan="6" class="p-6 text-center">
                <button onclick="window.fichaDisplayLimit += 15; window.renderFichaFromCache('${dni}', window.activeFichaTab);" class="px-6 py-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200 font-black text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 mx-auto">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    Cargar Más (${historyRenderCount - window.fichaDisplayLimit} ocultos)
                </button>
            </td>
        </tr>`;
        html += moreBtnHistorial;
    }

    if (paymentsRenderCount > window.fichaDisplayLimit) {
        const moreBtnPagos = `
        <tr>
            <td colspan="6" class="p-6 text-center">
                <button onclick="window.fichaDisplayLimit += 15; window.renderFichaFromCache('${dni}', window.activeFichaTab);" class="px-6 py-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200 font-black text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 mx-auto">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    Cargar Más (${paymentsRenderCount - window.fichaDisplayLimit} ocultos)
                </button>
            </td>
        </tr>`;
        if (pagosHtml) pagosHtml += moreBtnPagos;
    }

    document.getElementById('profile-history-list').innerHTML = html || '<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">No hay inmersiones registradas aún.</td></tr>';
    
    if (pagosTotalSum > 0 || depositCaja > 0) {
        let depHtml = '';
        if (depositCaja > 0) {
            pagosTotalSum += depositCaja;
            depHtml = `
            <tr class="group border-b border-slate-100 hover:bg-emerald-50 transition-colors h-12">
                <td class="py-2 px-3 align-middle text-center"></td>
                <td class="py-2 px-3 align-middle whitespace-nowrap">
                    <span class="text-xs font-black text-slate-800">Saldo a favor</span>
                </td>
                <td class="py-2 px-3 align-middle w-full text-xs font-bold text-slate-600">
                    Depósito a Cuenta
                </td>
                <td class="py-2 px-3 align-middle text-right shrink-0 whitespace-nowrap text-sm font-black text-emerald-600">
                    -${depositCaja} €
                </td>
                <td class="py-2 px-3 text-center align-middle shrink-0">
                    <button onclick="window.clearCustomerDeposits('${dni}')" class="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50" title="Eliminar depósito">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </td>
            </tr>`;
        }

        const headerSumHtml = `
        <tr class="bg-emerald-50 border-b-2 border-emerald-200 sticky top-0 z-10 shadow-sm">
            <td colspan="3" class="py-4 px-3 text-right font-black text-emerald-700 uppercase tracking-widest text-[11px] align-middle">Total Historial (Pagos Realizados)</td>
            <td class="py-4 px-3 text-right font-black text-emerald-600 text-lg align-middle">-${pagosTotalSum} €</td>
            <td></td>
        </tr>`;
        pagosHtml = headerSumHtml + depHtml + pagosHtml;
    }
    
    document.getElementById('profile-pagos-list').innerHTML = pagosHtml || '<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">No hay pagos registrados.</td></tr>';
    if (document.getElementById('ficha-tab-dives') && document.getElementById('ficha-tab-dives').innerText === '---') {
        document.getElementById('ficha-tab-dives').innerText = window.activeFichaDives.length + ' (Historial)';
    }

    const elDeuda = document.getElementById('ficha-caja-deuda');
    if (elDeuda) {
        elDeuda.innerText = pendingTotal.toFixed(2);
        
        const depListEl = document.getElementById('caja-deposits-list');
        const depEmptyStateEl = document.getElementById('caja-deposits-empty-state');
        if (depListEl) {
            let depListHTML = '';
            const methodIcons = {
                'Efectivo': '💵',
                'Tarjeta': '💳',
                'Bizum': '📱',
                'Transferencia': '🏦',
                'PayPal': '🅿️',
                'PADI': '🅿️'
            };
            
            // Render profile deposits of all selected group members
            activeDeps.forEach(dep => {
                const icon = methodIcons[dep.method] || '💰';
                const ownerProfile = customerDatabase.find(c => window.isSameDni(c.dni, dep._ownerDni));
                const ownerName = ownerProfile ? `${ownerProfile.nombre} ${ownerProfile.apellido || ''}`.trim() : dep._ownerDni;
                
                const safeOwnerDni = (dep._ownerDni || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const safeDepId = (dep.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const depAmount = parseFloat(dep.amount) || 0;

                depListHTML += `
                    <div class="flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded px-1.5 py-0.5 text-[9px] font-black text-slate-700 gap-1.5" title="Propietario: ${ownerName}">
                        <div class="flex items-center gap-1 min-w-0">
                            <span>${icon}</span>
                            <span class="font-black">${depAmount.toFixed(2)}&nbsp;€</span>
                            <span class="text-[8px] font-normal text-slate-450 truncate">${dep.method} (${ownerName})</span>
                            ${dep.date ? `<span class="text-[8px] font-normal text-slate-350 truncate hidden sm:inline">${formatCajaDate(dep.date)}</span>` : ''}
                        </div>
                        <div class="flex items-center gap-0.5 shrink-0">
                            <div class="flex items-center gap-0.5" title="Contabilizado en Contasimple">
                                <span class="w-3 h-3 rounded bg-blue-600 text-white font-black flex items-center justify-center text-[7px] select-none">C</span>
                                <label class="relative inline-flex items-center cursor-pointer scale-[0.65] select-none origin-left" style="width:28px">
                                    <input type="checkbox" onchange="window.toggleDepositContasimple('${safeOwnerDni}', '${safeDepId}', this.checked)" class="sr-only peer" ${dep.contasimple ? 'checked' : ''}>
                                    <div class="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                            <button onclick="window.deleteCustomerDepositFromCaja('${safeOwnerDni}', '${safeDepId}')" class="text-slate-350 hover:text-red-500 transition-colors p-0.5 rounded hover:bg-red-50" title="Eliminar depósito">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                `;
            });
            
            depListEl.innerHTML = depListHTML;
            if (depEmptyStateEl) {
                if (activeDeps.length === 0) depEmptyStateEl.classList.remove('hidden');
                else depEmptyStateEl.classList.add('hidden');
            }
        }
        
        // Pre-fill date input with today
        const depDateEl = document.getElementById('caja-new-dep-date');
        if (depDateEl && !depDateEl.value) {
            const dNow = new Date();
            depDateEl.value = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, '0')}-${String(dNow.getDate()).padStart(2, '0')}`;
        }
        
        document.getElementById('ficha-caja-total').innerText = totalAPagar.toFixed(2);

        // Sync the recalculated totalAPagar to customer's outstandingDebt in RAM and Firestore
        if (customerInfo.outstandingDebt !== totalAPagar) {
            customerInfo.outstandingDebt = totalAPagar;
            const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
            window.safeMasterListWrite(cleanDatabase, 'outstandingDebt-sync')
                .catch(e => console.error("Error background master_list outstandingDebt sync:", e));
            db.collection('mangamar_customers').doc(dni).set({ outstandingDebt: totalAPagar }, { merge: true })
                .catch(e => console.error("Error background customer doc outstandingDebt sync:", e));
        }

        const discType = customerInfo.discountType || 'percent';
        window.activeDiscountType = discType;
        const discVal = customerInfo.discount || 0;
        document.getElementById('ficha-caja-discount').value = discVal;
        
        const btnPct = document.getElementById('disc-type-pct');
        const btnEur = document.getElementById('disc-type-eur');
        if (btnPct && btnEur) {
            if (discType === 'fixed') {
                btnEur.className = 'px-2 py-0.5 text-[10px] font-black rounded-md bg-white text-rose-500 shadow-sm transition-all';
                btnPct.className = 'px-2 py-0.5 text-[10px] font-black rounded-md text-slate-400 hover:text-slate-600 transition-all';
                document.getElementById('ficha-caja-discount').removeAttribute('max');
            } else {
                btnPct.className = 'px-2 py-0.5 text-[10px] font-black rounded-md bg-white text-rose-500 shadow-sm transition-all';
                btnEur.className = 'px-2 py-0.5 text-[10px] font-black rounded-md text-slate-400 hover:text-slate-600 transition-all';
                document.getElementById('ficha-caja-discount').max = 100;
            }
        }

        const totalEl = document.getElementById('ficha-caja-total');
        const btnLiq = document.getElementById('btn-liquidar');

        if (totalAPagar <= 0 && pendingTotal === 0) {
            totalEl.innerText = "0.00";
            totalEl.className = "text-2xl font-black text-slate-300 tracking-tight";
            btnLiq.classList.add('opacity-50', 'pointer-events-none');
        } else if (totalAPagar <= 0 && pendingTotal > 0) {
            totalEl.innerText = "0.00 (Pagado)";
            totalEl.className = "text-2xl font-black text-emerald-500 tracking-tight";
            btnLiq.classList.remove('opacity-50', 'pointer-events-none');
        } else {
            totalEl.innerText = totalAPagar.toFixed(2);
            totalEl.className = "text-2xl font-black text-amber-600 tracking-tight";
            btnLiq.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    switchFichaTab(targetTab);
};

window.promptUnlockDni = function() {
    const msg = `⚠️ ADVERTENCIA: Modificar el DNI cambiará el identificador único de este cliente en toda la base de datos, incluyendo su historial, grupos y todas las salidas en las que esté asignado.\n\n¿Estás seguro de que deseas desbloquear y editar el DNI?`;
    window.showAppConfirm(msg, () => {
        const dniInput = document.getElementById('edit-f-dni');
        if (dniInput) {
            dniInput.removeAttribute('readonly');
            dniInput.className = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all";
            dniInput.focus();
        }
        const unlockBtn = document.getElementById('edit-dni-unlock-btn');
        if (unlockBtn) unlockBtn.classList.add('hidden');
    });
};

window.promptEditCustomer = function () {
    if (!window.activeFichaDni) return;
    const customerInfo = customerDatabase.find(c => window.isSameDni(c.dni, window.activeFichaDni)) || {};

    const dniInput = document.getElementById('edit-f-dni');
    dniInput.value = window.activeFichaDni;
    
    // If it's a temporary DNI (or empty), allow editing it to link/create a proper customer!
    const isTemp = window.activeFichaDni.toLowerCase().startsWith('temp_') || !window.activeFichaDni;
    const unlockBtn = document.getElementById('edit-dni-unlock-btn');
    if (isTemp) {
        dniInput.removeAttribute('readonly');
        dniInput.className = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all";
        if (unlockBtn) unlockBtn.classList.add('hidden');
    } else {
        dniInput.setAttribute('readonly', 'true');
        dniInput.className = "w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-500 cursor-not-allowed";
        if (unlockBtn) unlockBtn.classList.remove('hidden');
    }

    document.getElementById('edit-f-nombre').value = window.getFullName(customerInfo, false);
    document.getElementById('edit-f-apodo').value = customerInfo.apodo || '';
    document.getElementById('edit-f-dob').value = window.normalizeDateStr(customerInfo.dob) || '';
    document.getElementById('edit-f-telefono').value = customerInfo.telefono || '';
    document.getElementById('edit-f-email').value = customerInfo.email || '';
    document.getElementById('edit-f-titulacion').value = customerInfo.titulacion || '';
    document.getElementById('edit-f-dives').value = customerInfo.dives || '';

    if (customerInfo.insurance) {
        document.getElementById('edit-f-insurance-type').value = customerInfo.insurance.type || '';
        document.getElementById('edit-f-insurance-exp').value = window.normalizeDateStr(customerInfo.insurance.expiry) || '';
    } else {
        document.getElementById('edit-f-insurance-type').value = '';
        document.getElementById('edit-f-insurance-exp').value = '';
    }

    document.getElementById('edit-customer-modal-full').classList.remove('hidden');
};

window.saveCustomerEdits = async function () {
    if (!window.activeFichaDni) return;
    const oldDni = window.activeFichaDni;
    const newDni = document.getElementById('edit-f-dni').value.trim().toUpperCase();
    const nombre = window.formatNameStr(document.getElementById('edit-f-nombre').value.trim());
    
    if (!newDni) {
        showAppAlert("El DNI/Pasaporte es un campo obligatorio.");
        return;
    }
    if (!nombre) {
        showAppAlert("El nombre es un campo obligatorio.");
        return;
    }

    const btn = document.getElementById('btn-confirm-edit-customer');
    btn.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Guardando...';
    btn.disabled = true;

    try {
        const apodo = document.getElementById('edit-f-apodo').value.trim();
        const dob = document.getElementById('edit-f-dob').value;
        const telefono = document.getElementById('edit-f-telefono').value.trim();
        const email = document.getElementById('edit-f-email').value.trim();
        const titulacion = document.getElementById('edit-f-titulacion').value.trim();
        const divesRaw = document.getElementById('edit-f-dives').value;
        const insType = document.getElementById('edit-f-insurance-type').value;
        const insExp = document.getElementById('edit-f-insurance-exp').value;

        // 1. Update/Link/Create local database profile
        const oldIndex = customerDatabase.findIndex(c => window.normalizeDni(c.dni) === window.normalizeDni(oldDni));
        const newIndex = customerDatabase.findIndex(c => window.normalizeDni(c.dni) === window.normalizeDni(newDni));
        
        let finalIndex = -1;
        
        if (newIndex > -1) {
            // Updating an existing customer record (or linking a temp guest to an existing customer)
            customerDatabase[newIndex].nombre = nombre;
            customerDatabase[newIndex].apellido = "";
            customerDatabase[newIndex].dob = window.normalizeDateStr(dob);
            customerDatabase[newIndex].telefono = telefono;
            customerDatabase[newIndex].email = email;
            customerDatabase[newIndex].titulacion = titulacion;
            customerDatabase[newIndex].nameEdited = true;
            customerDatabase[newIndex].insuranceEdited = true;
            if (apodo) customerDatabase[newIndex].apodo = apodo;
            else delete customerDatabase[newIndex].apodo;
            if (divesRaw) customerDatabase[newIndex].dives = parseInt(divesRaw);
            else delete customerDatabase[newIndex].dives;
            if (insType) {
                if (!customerDatabase[newIndex].insurance) customerDatabase[newIndex].insurance = {};
                customerDatabase[newIndex].insurance.type = insType;
                customerDatabase[newIndex].insurance.expiry = insExp;
            } else {
                delete customerDatabase[newIndex].insurance;
            }
            finalIndex = newIndex;
            
            // Delete old record from DB if it was a temporary DNI that has now been linked/renamed
            if (oldIndex > -1 && oldIndex !== newIndex) {
                customerDatabase.splice(oldIndex, 1);
            }
        } else {
            if (oldIndex > -1) {
                // Renaming the existing customer's DNI
                customerDatabase[oldIndex].dni = newDni;
                customerDatabase[oldIndex].nombre = nombre;
                customerDatabase[oldIndex].apellido = "";
                customerDatabase[oldIndex].dob = window.normalizeDateStr(dob);
                customerDatabase[oldIndex].telefono = telefono;
                customerDatabase[oldIndex].email = email;
                customerDatabase[oldIndex].titulacion = titulacion;
                customerDatabase[oldIndex].nameEdited = true;
                customerDatabase[oldIndex].insuranceEdited = true;
                if (apodo) customerDatabase[oldIndex].apodo = apodo;
                else delete customerDatabase[oldIndex].apodo;
                if (divesRaw) customerDatabase[oldIndex].dives = parseInt(divesRaw);
                else delete customerDatabase[oldIndex].dives;
                if (insType) {
                    if (!customerDatabase[oldIndex].insurance) customerDatabase[oldIndex].insurance = {};
                    customerDatabase[oldIndex].insurance.type = insType;
                    customerDatabase[oldIndex].insurance.expiry = insExp;
                } else {
                    delete customerDatabase[oldIndex].insurance;
                }
                finalIndex = oldIndex;
            } else {
                // Creating a brand new customer record
                const newCustomer = {
                    dni: newDni,
                    nombre: nombre,
                    apellido: "",
                    dob: window.normalizeDateStr(dob),
                    telefono: telefono,
                    email: email,
                    titulacion: titulacion,
                    discount: 0,
                    nameEdited: true,
                    insuranceEdited: true
                };
                if (apodo) newCustomer.apodo = apodo;
                if (divesRaw) newCustomer.dives = parseInt(divesRaw);
                if (insType) {
                    newCustomer.insurance = {
                        type: insType,
                        expiry: insExp
                    };
                }
                customerDatabase.push(newCustomer);
                finalIndex = customerDatabase.length - 1;
            }
        }

        // 2. Auto-sync Master List and Individual Customer Profile (ASYNC NON-BLOCKING)
        window.safeMasterListWrite(customerDatabase, 'save-customer-profile').catch(e => console.error("Error bg master sync:", e));
        
        if (typeof db !== 'undefined') {
            // Save new profile
            db.collection('mangamar_customers').doc(newDni).set(customerDatabase[finalIndex], { merge: true }).catch(e => console.error("Error bg customer sync:", e));
            
            // If DNI changed, delete old one and migrate history
            if (oldDni !== newDni) {
                db.collection('mangamar_customers').doc(oldDni).delete().catch(e => console.error("Error deleting old DNI:", e));
                window.migrateCustomerHistory(oldDni, newDni).catch(e => console.error("Error migrating history:", e));

                // Add DNI redirect to settings document in Firestore to prevent sync/heal duplications
                const settingsRef = db.collection("mangamar_directory").doc("settings");
                settingsRef.get().then(doc => {
                    const currentRedirects = doc.exists ? (doc.data().dniRedirects || {}) : {};
                    const normOld = window.normalizeDni(oldDni);
                    const normNew = window.normalizeDni(newDni);
                    currentRedirects[normOld] = normNew;
                    for (let k in currentRedirects) {
                        if (currentRedirects[k] === normOld) {
                            currentRedirects[k] = normNew;
                        }
                    }
                    settingsRef.set({ dniRedirects: currentRedirects }, { merge: true })
                        .catch(e => console.error("Error saving DNI redirects:", e));
                }).catch(e => console.error("Error fetching settings for DNI redirects:", e));
            }
        }

        // 2.5 Update matching members in globalGroups if DNI changed or linked from tempId
        if (oldDni !== newDni && window.globalGroups && Array.isArray(window.globalGroups)) {
            const normalizedOld = oldDni.toLowerCase();
            const normalizedNew = window.normalizeDni(newDni);
            
            window.globalGroups.forEach(grp => {
                let memberMatched = false;
                let matchedIndex = -1;
                
                if (grp.members) {
                    matchedIndex = grp.members.findIndex(m => {
                        if (m && window.isSameDni(m, normalizedOld)) return true;
                        if (m && m.toLowerCase() === normalizedOld) return true;
                        return false;
                    });
                }
                
                if (matchedIndex > -1) {
                    memberMatched = true;
                    const oldMemberId = grp.members[matchedIndex];
                    
                    // Replace old DNI or tempId with new DNI (prevent duplicate)
                    const hasNewDni = grp.members.some(m => window.isSameDni(m, normalizedNew));
                    if (hasNewDni) {
                        grp.members.splice(matchedIndex, 1);
                    } else {
                        grp.members[matchedIndex] = normalizedNew;
                    }
                    
                    if (grp.manualNames && oldMemberId) {
                        delete grp.manualNames[oldMemberId.toLowerCase()];
                    }
                }
                
                if (grp.manualNames && grp.manualNames[normalizedOld]) {
                    delete grp.manualNames[normalizedOld];
                }
                
                if (memberMatched && window.saveGlobalGroup) {
                    window.saveGlobalGroup(grp).catch(e => console.error("Error saving global group from CRM profile edit:", e));
                }
            });
        }

        // 3. Update active boat manifests via mergedAllocations natively
        const modifiedTrips = [];
        mergedAllocations.forEach(trip => {
            let modified = false;
            if (trip.groups) {
                trip.groups.forEach(group => {
                    if (group.guests) {
                        group.guests.forEach(guest => {
                            const isOldDniMatch = guest.dni && window.normalizeDni(guest.dni) === window.normalizeDni(oldDni);
                            const isTempIdMatch = !guest.dni && guest.tempId && guest.tempId === oldDni;
                            
                            if (isOldDniMatch || isTempIdMatch) {
                                let newFullName = window.getFirstAndLastName(window.getFullName(customerDatabase[finalIndex]));
                                let newTitulacion = customerDatabase[finalIndex].titulacion || '';
                                let newTelefono = customerDatabase[finalIndex].telefono || '';
                                let newEmail = customerDatabase[finalIndex].email || '';
                                
                                guest.dni = newDni;
                                guest.isManual = !window.isProfileComplete(customerDatabase[finalIndex]);
                                if (guest.tempId) delete guest.tempId;

                                if (guest.nombre !== newFullName || guest.titulacion !== newTitulacion || guest.telefono !== newTelefono || guest.email !== newEmail) {
                                    guest.nombre = newFullName;
                                    guest.titulacion = newTitulacion;
                                    guest.telefono = newTelefono;
                                    guest.email = newEmail;
                                }
                                modified = true;
                            }
                        });
                    }
                });
            }
            if (modified) {
                if (window.activeBoatItem && window.activeBoatItem.id === trip.id) {
                    if (window.activeBoatItem.groups) {
                        window.activeBoatItem.groups.forEach(g => {
                            if (g.guests) {
                                g.guests.forEach(gst => {
                                    const isOldDniMatch = gst.dni && window.normalizeDni(gst.dni) === window.normalizeDni(oldDni);
                                    const isTempIdMatch = !gst.dni && gst.tempId && gst.tempId === oldDni;
                                    if (isOldDniMatch || isTempIdMatch) {
                                        gst.dni = newDni;
                                        gst.nombre = window.getFirstAndLastName(window.getFullName(customerDatabase[finalIndex]));
                                        gst.titulacion = customerDatabase[finalIndex].titulacion || '';
                                        gst.telefono = customerDatabase[finalIndex].telefono || '';
                                        gst.email = customerDatabase[finalIndex].email || '';
                                        gst.isManual = !window.isProfileComplete(customerDatabase[finalIndex]);
                                        if (gst.tempId) delete gst.tempId;
                                    }
                                });
                            }
                        });
                    }
                    
                    // Keep local manifest editor's base state in sync to prevent 3-way merge conflict
                    if (window.activeBoatItem.lastSyncedTripState) {
                        window.activeBoatItem.lastSyncedTripState.groups = JSON.parse(JSON.stringify(window.activeBoatItem.groups));
                        const flatG = [];
                        window.activeBoatItem.groups.forEach(g => { if (g.guests) flatG.push(...g.guests); });
                        window.activeBoatItem.lastSyncedTripState.guests = flatG;
                    }
                }
                modifiedTrips.push(trip);
            }
        });

        if (modifiedTrips.length > 0 && typeof window.saveMultipleTripsData === 'function') {
            window.saveMultipleTripsData(modifiedTrips).catch(e => console.error("Error bg trips sync on saveCustomerEdits:", e));
        }

        // Redraw boats if manifest is active (unconditionally, instantly)
        if (typeof window.renderGroups === 'function' && document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) {
            window.renderGroups();
        }

        // Instant local redraw of the daily grid
        if (typeof window.renderDailyGrid === 'function') {
            window.renderDailyGrid();
        }

        window.activeFichaDni = newDni;
        document.getElementById('edit-customer-modal-full').classList.add('hidden');
        showToast("👍 Perfil actualizado correctamente.");

        // Soft refresh local visuals ONLY if Ficha is already open
        if (!document.getElementById('customer-profile-modal').classList.contains('hidden')) {
            openCustomerProfile(newDni, window.getFullName(customerDatabase[finalIndex]), false, 'ficha');
        }

        if (!document.getElementById('crm-modal').classList.contains('hidden')) renderCrmTable();

    } catch (e) {
        console.error("Error al guardar perfil", e);
        showAppAlert("Ocurrió un error guardando el perfil. Por favor, revisa tu conexión.");
    } finally {
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Guardar Cambios';
        btn.disabled = false;
    }
};

window.promptDeleteCustomer = function () {
    const name = document.getElementById('profile-modal-name').innerText;
    document.getElementById('delete-customer-name').innerText = name;
    document.getElementById('delete-customer-modal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('delete-customer-modal-content').classList.remove('scale-95', 'opacity-0');
    }, 10);
};

window.executeDeleteCustomer = function () {
    if (!window.activeFichaDni) return;
    const dni = window.activeFichaDni;

    const btn = document.getElementById('btn-confirm-delete');
    btn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    btn.disabled = true;

    // Instant local memory and UI update
    customerDatabase = customerDatabase.filter(c => !window.isSameDni(c.dni, dni));
    if (typeof window.renderCrmTable === 'function') window.renderCrmTable();

    // Close modals instantly
    window.closeGlobalModal('delete-customer-modal');
    window.closeGlobalModal('customer-profile-modal');
    showToast("Cliente eliminado (procesando en red).");
    
    // Background execution
    (async () => {
        try {
            // 1. Delete history subcollection
            const histSnap = await db.collection('mangamar_customers').doc(dni).collection('history').get();
            if (!histSnap.empty) {
                const batch = db.batch();
                histSnap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }

            // 2. Delete main document
            await db.collection('mangamar_customers').doc(dni).delete();

            // 3. Remove from master_list
            let docSnap = await db.collection('mangamar_directory').doc('master_list').get();
            if (docSnap.exists) {
                let data = docSnap.data().clients || [];
                let updated = data.filter(c => c.dni !== dni);
                await window.safeMasterListWrite(updated, 'delete-customer');
            }

            // 4. Remove customer from every trip booking (manifest groups, guests, and waitlists) month-wide
            if (typeof mergedAllocations !== 'undefined') {
                const modifiedTrips = [];
                mergedAllocations.forEach(trip => {
                    let modified = false;
                    if (trip.groups) {
                        trip.groups.forEach(group => {
                            if (group.guests) {
                                const originalLength = group.guests.length;
                                group.guests = group.guests.filter(gst => !window.isSameDni(gst.dni, dni));
                                if (group.guests.length !== originalLength) {
                                    modified = true;
                                }
                            }
                        });
                    }
                    if (trip.waitlist) {
                        const originalWlLength = trip.waitlist.length;
                        trip.waitlist = trip.waitlist.filter(w => !window.isSameDni(w.dni, dni));
                        if (trip.waitlist.length !== originalWlLength) {
                            modified = true;
                        }
                    }
                    if (modified) {
                        // Sync active boat UI in real-time
                        if (window.activeBoatItem && window.activeBoatItem.id === trip.id) {
                            window.activeBoatItem.groups = trip.groups;
                            window.activeBoatItem.waitlist = trip.waitlist;
                            
                            // Align the active boat's lastSyncedTripState to match what we write to Firestore
                            if (window.activeBoatItem.lastSyncedTripState) {
                                window.activeBoatItem.lastSyncedTripState.groups = JSON.parse(JSON.stringify(window.activeBoatItem.groups));
                                const flatG = [];
                                window.activeBoatItem.groups.forEach(g => { if (g.guests) flatG.push(...g.guests); });
                                window.activeBoatItem.lastSyncedTripState.guests = flatG;
                                window.activeBoatItem.lastSyncedTripState.waitlist = JSON.parse(JSON.stringify(window.activeBoatItem.waitlist));
                            }
                            
                            if (typeof window.renderGroups === 'function') window.renderGroups();
                            if (typeof window.updateModalSubtitle === 'function') window.updateModalSubtitle();
                            if (typeof window.renderWaitlist === 'function') window.renderWaitlist();
                        }
                        modifiedTrips.push(trip);
                    }
                });
                if (modifiedTrips.length > 0 && typeof window.saveMultipleTripsData === 'function') {
                    await window.saveMultipleTripsData(modifiedTrips);
                    if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
                }
            }
        } catch (e) {
            console.error("Error background deleting customer:", e);
        } finally {
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Borrar Cliente';
            btn.disabled = false;
        }
    })();
};

window.updateCustomerOutstandingDebt = async function(dni, skipMasterListWrite = false) {
    if (!dni) return 0;
    try {
        const dObj = new Date();
        const todayStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
        
        const snapshot = await db.collection('mangamar_customers').doc(dni).collection('history').get();
        const customerInfo = customerDatabase.find(c => window.isSameDni(c.dni, dni)) || { telefono: '', email: '', discount: 0 };
        
        let pendingTotal = 0;
        let totalLocalDeposits = 0;
        let billedCourses = new Set();
        let activeInsExpiry = null;
        let docsArray = [];
        snapshot.forEach(doc => docsArray.push(doc));
        
        docsArray.sort((a, b) => {
            const dateA = (a.data().date || '') + ' ' + (a.data().time || '00:00');
            const dateB = (b.data().date || '') + ' ' + (b.data().time || '00:00');
            return dateA.localeCompare(dateB);
        });

        let safeDocs = [];
        docsArray.forEach(item => {
            let data = item.data();
            let safeToRender = true;
            if (item.id && !item.id.startsWith('temp_') && data.type !== 'pago' && data.type !== 'producto' && data.type !== 'servicio') {
                let activeTrip = (window.mergedAllocations || []).find(t => t.id === item.id) || (window.internalTrips || []).find(t => t.id === item.id);
                if (activeTrip) {
                    const validTripsThatDay = (window.internalTrips || []).filter(t => t.date === data.date);
                    let isGuestOnBoat = false;
                    for (let t of validTripsThatDay) {
                        if ((t.guests || []).some(g => (g.dni || '').trim().toLowerCase() === (dni || '').trim().toLowerCase() && !g.cancelled)) {
                            isGuestOnBoat = true;
                            break;
                        }
                    }
                    if (!isGuestOnBoat) {
                        safeToRender = false;
                    }
                }
            }
            if (safeToRender) {
                safeDocs.push(item);
            }
        });

        safeDocs.forEach(item => {
            let data = item.data();
            let p = window.calculateDivePrice(data);

            if (data.course) {
                let baseCourse = data.baseCourse || data.course.split(' | ')[0].trim();
                let alreadyBilled = false;
                for (let bc of billedCourses) {
                    if (window.matchCourseNames(bc, baseCourse)) {
                        alreadyBilled = true;
                        break;
                    }
                }
                if (!alreadyBilled) {
                    p.course = data.coursePrice ? data.coursePrice : ((window.PRICES && window.PRICES[baseCourse]) ? window.PRICES[baseCourse] : 0);
                    billedCourses.add(baseCourse);
                } else {
                    p.course = 0;
                }
                p.dive = 0;
                p.tasa = 0;
                if (data.rental === 'INC') p.rental = 0;
                p.insurance = 0; // Course always includes insurance
            }

            let cleanIns = (data.insurance || 0).toString().replace(' ✔', '');
            if (['1D', '1W', '1M', '1Y'].includes(cleanIns)) {
                if (activeInsExpiry && data.date <= activeInsExpiry) {
                    p.insurance = 0;
                } else {
                    let [y, m, d] = data.date.split('-').map(Number);
                    let dateObj = new Date(y, m - 1, d);
                    if (cleanIns === '1D') dateObj.setDate(dateObj.getDate() + 0);
                    if (cleanIns === '1W') dateObj.setDate(dateObj.getDate() + 6);
                    if (cleanIns === '1M') dateObj.setMonth(dateObj.getMonth() + 1);
                    if (cleanIns === '1Y') dateObj.setFullYear(dateObj.getFullYear() + 1);
                    activeInsExpiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                }
            } else if (cleanIns !== '0' && cleanIns !== 0) {
                p.insurance = 0;
            }

            if (customerInfo.discount > 0 && customerInfo.discountType !== 'fixed' && !data.customPrice) {
                p.dive = p.dive * (1 - (customerInfo.discount / 100));
                if (p.course) p.course = p.course * (1 - (customerInfo.discount / 100));
            }

            p.total = p.dive + p.tasa + p.gas + p.rental + p.insurance + (p.course || 0) + (p.computer || 0) + (p.custom || 0);

            if (data.customPrice !== undefined && data.customPrice !== null) {
                p.total = parseFloat(data.customPrice) || 0;
            }

            let isPaid = data.paymentStatus === 'paid';
            if (data.type === 'pago' && data.isPartialAbono) {
                isPaid = false;
            } else if (data.type === 'pago' && data.paymentStatus === 'pending') {
                isPaid = false;
            }

            if (!isPaid) {
                if (data.type !== 'pago') {
                    pendingTotal += p.total;
                }
                if (data.localDeposit && data.type !== 'pago' && data.type !== 'producto' && data.type !== 'servicio') {
                    const migratedId = 'migrated_manifest_' + item.id;
                    const alreadyMigrated = (customerInfo.deposits || []).some(d => d.id === migratedId);
                    if (!alreadyMigrated) {
                        totalLocalDeposits += parseFloat(data.localDeposit) || 0;
                    }
                }
            }
        });

        // Sum modern profile deposits
        const profileDepositsSum = (customerInfo.deposits || []).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

        // Sum legacy / history pending payment documents
        let historyDepositsSum = 0;
        safeDocs.forEach(item => {
            const data = item.data();
            const isPaid = data.paymentStatus === 'paid';
            if (!isPaid && data.type === 'pago') {
                const amt = Math.abs(parseFloat(data.amount) || parseFloat(data.total) || 0);
                historyDepositsSum += amt;
            }
        });

        const deposit = profileDepositsSum + historyDepositsSum + totalLocalDeposits;
        let fixedDiscountAmount = 0;
        if (customerInfo.discount > 0 && customerInfo.discountType === 'fixed') {
            fixedDiscountAmount = customerInfo.discount;
        }
        let totalAPagar = Math.max(0, pendingTotal - deposit - fixedDiscountAmount);
        totalAPagar = Math.round(totalAPagar * 100) / 100;

        const index = customerDatabase.findIndex(c => window.isSameDni(c.dni, dni));
        if (index !== -1) {
            customerDatabase[index].outstandingDebt = totalAPagar;
            // Only write master_list here when called individually.
            // updateMultipleCustomersOutstandingDebt passes skipMasterListWrite=true
            // and does a single batch write at the end (22 writes → 1).
            if (!skipMasterListWrite) {
                const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
                await window.safeMasterListWrite(cleanDatabase, 'update-outstanding-debt-single');
            }
            await db.collection('mangamar_customers').doc(dni).set({ outstandingDebt: totalAPagar }, { merge: true });
        }
        return totalAPagar;
    } catch (e) {
        console.error("Error updating customer outstanding debt:", e);
        return 0;
    }
};

window.updateMultipleCustomersOutstandingDebt = async function(dnis) {
    if (!dnis || dnis.length === 0) return;
    const uniqueDnis = Array.from(new Set(dnis)).filter(Boolean);

    // Process each DNI sequentially but skip the master_list write per-iteration.
    // This reduces N master_list writes down to 1 at the end.
    for (const dni of uniqueDnis) {
        await window.updateCustomerOutstandingDebt(dni, true /* skipMasterListWrite */);
    }

    // Single master_list write for all updated customers at once
    if (uniqueDnis.length > 0) {
        try {
            const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
            await window.safeMasterListWrite(cleanDatabase, 'update-outstanding-debt-batch');
        } catch (e) {
            console.error('[updateMultipleCustomersOutstandingDebt] master_list write failed:', e);
        }
    }

    if (typeof renderGroups === 'function' && document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) {
        renderGroups(true);
    }
    if (typeof renderDailyGrid === 'function') {
        renderDailyGrid();
    }
};

window.clearHistorialDateFilters = function() {
    const fromEl = document.getElementById('historial-filter-from');
    const toEl = document.getElementById('historial-filter-to');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    window.renderFichaFromCache(window.activeFichaDni, 'historial');
};

window.openHistorialExportModal = function() {
    if (!window.activeFichaDni) return;
    const customerInfo = customerDatabase.find(c => window.isSameDni(c.dni, window.activeFichaDni)) || {};
    const clientName = document.getElementById('profile-modal-name') ? document.getElementById('profile-modal-name').innerText : (window.getFullName(customerInfo) || 'Cliente');
    
    const fromEl = document.getElementById('historial-filter-from');
    const toEl = document.getElementById('historial-filter-to');
    const fromVal = fromEl ? fromEl.value : '';
    const toVal = toEl ? toEl.value : '';
    
    let rangeStr = "";
    if (fromVal && toVal) {
        rangeStr = `Rango: ${fromVal} a ${toVal}`;
    } else if (fromVal) {
        rangeStr = `Desde: ${fromVal}`;
    } else if (toVal) {
        rangeStr = `Hasta: ${toVal}`;
    } else {
        rangeStr = `Todo el historial`;
    }
    
    let text = `Resumen de Inmersiones — ${clientName}\n`;
    text += `${rangeStr}\n`;
    text += `========================================\n\n`;
    
    const groupedDives = {};
    const sortedItems = [...window.activeFichaDives].reverse();
    
    sortedItems.forEach(item => {
        const { data } = item;
        const dateStr = data.date;
        
        // Apply date filter
        if (fromVal && dateStr < fromVal) return;
        if (toVal && dateStr > toVal) return;
        
        // Skip pagos, productos, and general/other servicios (only include dives, which have !data.type)
        if (data.type) return;
        
        if (!groupedDives[dateStr]) {
            groupedDives[dateStr] = [];
        }
        groupedDives[dateStr].push(data);
    });
    
    let servicesText = "";
    Object.keys(groupedDives).sort().forEach(dateStr => {
        const parts = dateStr.split('-');
        if (parts.length < 3) return;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const dObj = new Date(year, month, day);

        const weekday = dObj.toLocaleDateString('es-ES', { weekday: 'long' });
        const monthName = dObj.toLocaleDateString('es-ES', { month: 'long' });
        const formattedDay = `${weekday}, ${day} ${monthName} ${year}`;
        
        servicesText += `${formattedDay}:\n`;
        groupedDives[dateStr].sort((a, b) => {
            const timeA = a.time || '00:00';
            const timeB = b.time || '00:00';
            return timeA.localeCompare(timeB);
        });
        groupedDives[dateStr].forEach(dive => {
            let timeStr = dive.time || '';
            if (timeStr && timeStr.includes(':')) {
                const timeParts = timeStr.split(':');
                let hours = parseInt(timeParts[0], 10);
                let minutes = parseInt(timeParts[1], 10);
                
                hours = (hours - 1 + 24) % 24;
                
                const minStr = String(minutes).padStart(2, '0');
                timeStr = `${hours}:${minStr}`;
            }
            
            let gasSuffix = "";
            const includeGasCheckbox = document.getElementById('historial-export-include-gas');
            const includeGas = includeGasCheckbox ? includeGasCheckbox.checked : false;
            if (includeGas && dive.gas) {
                const gasLower = dive.gas.toLowerCase();
                if (!gasLower.includes('aire')) {
                    let cleanGas = dive.gas.replace('15L ', '').replace('12L ', '').trim();
                    cleanGas = cleanGas.replace(/ean/i, 'Nitrox');
                    gasSuffix = ` (${cleanGas})`;
                }
            }
            
            servicesText += ` - ${timeStr} ${dive.site || 'Buceo'}${gasSuffix}\n`;
        });
        servicesText += `\n`;
    });
    
    if (servicesText) {
        text += servicesText.trim();
    } else {
        text += `No se encontraron inmersiones en este rango.\n`;
    }
    
    document.getElementById('historial-export-text').value = text;
    document.getElementById('historial-export-modal').classList.remove('hidden');
};

window.handleCheckboxChange = function(el, docId) {
    if (!window.cajaUncheckedDocIds) {
        window.cajaUncheckedDocIds = new Set();
    }
    if (el.checked) {
        window.cajaUncheckedDocIds.delete(docId);
    } else {
        window.cajaUncheckedDocIds.add(docId);
    }
    
    const checkboxes = document.querySelectorAll('.caja-item-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const selectAllCheckbox = document.getElementById('caja-select-all-checkbox');
    if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
    
    window.recomputeCajaSelectedTotals();
};

window.toggleCajaSelectAll = function(isChecked) {
    if (!window.cajaUncheckedDocIds) {
        window.cajaUncheckedDocIds = new Set();
    }
    const checkboxes = document.querySelectorAll('.caja-item-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const docId = cb.getAttribute('data-doc-id');
        if (isChecked) {
            window.cajaUncheckedDocIds.delete(docId);
        } else {
            window.cajaUncheckedDocIds.add(docId);
        }
    });
    window.recomputeCajaSelectedTotals();
};

window.recomputeCajaSelectedTotals = function() {
    let subtotal = 0;
    let deposit = 0;
    
    const checkboxes = document.querySelectorAll('.caja-item-checkbox');
    checkboxes.forEach(cb => {
        if (!cb.checked) return;
        const docId = cb.getAttribute('data-doc-id');
        if (docId && docId.startsWith('deposit_')) {
            deposit += parseFloat(cb.getAttribute('data-amount')) || 0;
        } else {
            const items = window.activeFichaDives.filter(d => d.doc.id === docId);
            items.forEach(item => {
                subtotal += item.p.total;
            });
        }
    });
    
    const discountInput = document.getElementById('ficha-caja-discount');
    const discountVal = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
    const discountType = window.activeDiscountType || 'percent';
    
    let discountAmount = 0;
    if (discountType === 'percent' || discountType === 'pct') {
        discountAmount = subtotal * (discountVal / 100);
    } else {
        discountAmount = discountVal;
    }
    
    const finalTotal = Math.max(0, subtotal - deposit - discountAmount);
    
    const deudaEl = document.getElementById('ficha-caja-deuda');
    if (deudaEl) deudaEl.innerText = subtotal.toFixed(2);
    
    const totalEl = document.getElementById('ficha-caja-total');
    if (totalEl) totalEl.innerText = finalTotal.toFixed(2);
    
    const footerSubtotal = document.getElementById('caja-footer-subtotal');
    if (footerSubtotal) footerSubtotal.innerHTML = `${subtotal.toFixed(2)}&nbsp;€`;
    
    const footerDiscountRow = document.getElementById('caja-footer-discount-row');
    const footerDiscount = document.getElementById('caja-footer-discount');
    if (footerDiscountRow && footerDiscount) {
        if (discountAmount > 0) {
            footerDiscountRow.classList.remove('hidden');
            footerDiscount.innerHTML = `-${discountAmount.toFixed(2)}&nbsp;€`;
        } else {
            footerDiscountRow.classList.add('hidden');
        }
    }
    
    const footerTotal = document.getElementById('caja-footer-total');
    if (footerTotal) footerTotal.innerHTML = `${finalTotal.toFixed(2)}&nbsp;€`;
    
    window.activeFichaPendingDocs = [];
    checkboxes.forEach(cb => {
        const docId = cb.getAttribute('data-doc-id');
        if (cb.checked && docId && !docId.startsWith('deposit_')) {
            const items = window.activeFichaDives.filter(d => d.doc.id === docId);
            items.forEach(item => {
                window.activeFichaPendingDocs.push({
                    dni: item._ownerDni || window.activeFichaDni,
                    docId: item.doc.id
                });
            });
        }
    });
    
    window.cajaSelectedUseDeposit = Array.from(checkboxes).some(cb => {
        const docId = cb.getAttribute('data-doc-id');
        return cb.checked && docId && docId.startsWith('deposit_');
    });
};

window.addCustomerDepositFromCaja = async function() {
    const dni = window.activeFichaDni;
    if (!dni) return;
    
    const amtEl = document.getElementById('caja-new-dep-amount');
    const methodEl = document.getElementById('caja-new-dep-method-val') || document.getElementById('caja-new-dep-method');
    const csEl = document.getElementById('caja-new-dep-cs');
    const dateEl = document.getElementById('caja-new-dep-date');
    
    const amount = parseFloat(amtEl ? amtEl.value : 0) || 0;
    const method = methodEl ? methodEl.value : 'Efectivo';
    const contasimple = csEl ? csEl.checked : false;
    
    const dObj = new Date();
    const todayStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
    const depositDate = (dateEl && dateEl.value) ? dateEl.value : todayStr;
    
    if (amount <= 0) {
        showAppAlert("Por favor introduce un importe de depósito válido.");
        return;
    }
    
    const profile = customerDatabase.find(c => window.isSameDni(c.dni, dni));
    if (!profile) return;
    
    profile.deposits = profile.deposits || [];
    const originalDeposits = [...profile.deposits];
    
    profile.deposits.push({
        id: 'dep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        amount: amount,
        method: method,
        contasimple: contasimple,
        date: depositDate
    });
    
    // Clear inputs in form
    if (amtEl) amtEl.value = '';
    if (csEl) csEl.checked = false;
    if (dateEl) dateEl.value = '';
    
    // 1. Refresh Caja view instantly (Optimistic UI)
    window.renderFichaFromCache(dni);
    
    // 2. Perform background write async without awaiting it
    (async () => {
        try {
            if (typeof window.updateCustomerOutstandingDebt === 'function') {
                await window.updateCustomerOutstandingDebt(dni, true /* skipMasterListWrite */);
            }
            const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
            await window.safeMasterListWrite(cleanDatabase, 'add-deposit');
        } catch (e) {
            console.error("Error background saving deposit:", e);
            profile.deposits = originalDeposits;
            window.renderFichaFromCache(dni);
            showToast("⚠️ Error al sincronizar el depósito en el servidor.");
        }
    })();
};

window.deleteCustomerDepositFromCaja = function(dni, depositId) {
    if (!dni || !depositId) return;
    
    const profile = customerDatabase.find(c => window.isSameDni(c.dni, dni));
    const isProfileDep = profile && profile.deposits && profile.deposits.some(d => d.id === depositId);
    
    if (!isProfileDep) {
        const found = (window.activeFichaDives || []).find(item => item.doc.id === depositId);
        if (found && found.data && found.data.date) {
            window.deleteHistoryItem(dni, depositId, found.data.date.substring(0, 7), 'pago');
            return;
        }
    }
    
    if (!profile || !profile.deposits) return;
    
    window.showAppConfirm("¿Estás seguro de que deseas eliminar este depósito?", async () => {
        const originalDeposits = [...profile.deposits];
        
        let tripIdToClear = null;
        if (depositId.startsWith('migrated_manifest_')) {
            tripIdToClear = depositId.replace('migrated_manifest_', '');
        } else {
            const targetDep = profile.deposits.find(d => d.id === depositId);
            if (targetDep && targetDep._migratedFromDiveId) {
                tripIdToClear = targetDep._migratedFromDiveId;
            }
        }
        
        profile.deposits = profile.deposits.filter(d => d.id !== depositId);
        
        // 1. Refresh Caja view instantly (Optimistic UI)
        window.renderFichaFromCache(window.activeFichaDni);
        
        // Clear from manifest in RAM and background sync
        if (tripIdToClear) {
            if (typeof activeBoatItem !== 'undefined' && activeBoatItem && activeBoatItem.id === tripIdToClear && activeBoatItem.groups) {
                activeBoatItem.groups.forEach(g => {
                    (g.guests || []).forEach(gst => {
                        if (window.isSameDni(gst.dni, dni)) {
                            gst.localDeposit = 0;
                            gst.localDepositMethod = '';
                            delete gst.localDepositC;
                        }
                    });
                });
                if (typeof renderGroups === 'function') renderGroups();
            }
            window.syncPaymentToManifest(dni, tripIdToClear, 'pending', '', '', 0, '');
        }
        
        // 2. Perform background write async without awaiting it
        (async () => {
            try {
                if (typeof window.updateCustomerOutstandingDebt === 'function') {
                    await window.updateCustomerOutstandingDebt(dni, true /* skipMasterListWrite */);
                }
                const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
                await window.safeMasterListWrite(cleanDatabase, 'delete-deposit');
            } catch (e) {
                console.error("Error background deleting deposit:", e);
                profile.deposits = originalDeposits;
                window.renderFichaFromCache(window.activeFichaDni);
                showToast("⚠️ Error al sincronizar la eliminación en el servidor.");
            }
        })();
    });
};

window.toggleDepositContasimple = async function(dni, depositId, isChecked) {
    if (!dni || !depositId) return;
    
    const profile = customerDatabase.find(c => window.isSameDni(c.dni, dni));
    const dep = profile && profile.deposits ? profile.deposits.find(d => d.id === depositId) : null;
    
    if (dep) {
        dep.contasimple = isChecked;
        try {
            const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
            await window.safeMasterListWrite(cleanDatabase, 'toggle-deposit-contasimple');
        } catch (e) {
            console.error("Error toggling deposit contasimple:", e);
        }
    } else {
        // It's a history pago document!
        try {
            await db.collection('mangamar_customers').doc(dni).collection('history').doc(depositId).update({ contasimple: isChecked });
            
            // Update in-memory cache to reflect immediately
            const found = (window.activeFichaRawDocs || []).find(item => item.id === depositId);
            if (found) {
                if (found.data) found.data.contasimple = isChecked;
                else found.contasimple = isChecked;
            }
            const processedFound = (window.activeFichaDives || []).find(item => item.doc.id === depositId);
            if (processedFound) {
                if (processedFound.data) processedFound.data.contasimple = isChecked;
            }
            window.renderFichaFromCache(window.activeFichaDni);
        } catch (e) {
            console.error("Error toggling history deposit contasimple:", e);
            showToast("⚠️ Error al actualizar Contasimple en el servidor.");
        }
    }
};

window.toggleCajaDepositMethodDropdown = function(event, buttonEl) {
    event.stopPropagation();
    
    // If already exists, remove it
    const existing = document.getElementById('caja-dep-method-custom-dropdown');
    if (existing) {
        existing.remove();
        return;
    }
    
    const dropdown = document.createElement('div');
    dropdown.id = 'caja-dep-method-custom-dropdown';
    dropdown.className = 'absolute bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 min-w-[130px] z-[999999]';
    
    const methods = [
        { value: 'Efectivo', label: 'Efectivo', type: 'efectivo', activeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-sm', normalClass: 'bg-emerald-50/70 border border-emerald-200/40 text-emerald-700 hover:bg-emerald-100/80' },
        { value: 'Tarjeta', label: 'Tarjeta', type: 'tarjeta', activeClass: 'bg-blue-600 text-white border-blue-700 shadow-sm', normalClass: 'bg-blue-50/70 border border-blue-200/40 text-blue-700 hover:bg-blue-100/80' },
        { value: 'Bizum', label: 'Bizum', type: 'bizum', activeClass: 'bg-teal-600 text-white border-teal-700 shadow-sm', normalClass: 'bg-teal-50/70 border border-teal-200/40 text-teal-700 hover:bg-teal-100/80' },
        { value: 'Transferencia', label: 'Transferencia', type: 'transferencia', activeClass: 'bg-purple-600 text-white border-purple-700 shadow-sm', normalClass: 'bg-purple-50/70 border border-purple-200/40 text-purple-700 hover:bg-purple-100/80' },
        { value: 'PayPal', label: 'PayPal', type: 'paypal', activeClass: 'bg-indigo-600 text-white border-indigo-700 shadow-sm', normalClass: 'bg-indigo-50/70 border border-indigo-200/40 text-indigo-750 hover:bg-indigo-100/80' },
        { value: 'PADI', label: 'PADI', type: 'padi', activeClass: 'bg-rose-600 text-white border-rose-700 shadow-sm', normalClass: 'bg-rose-50/70 border border-rose-200/40 text-rose-700 hover:bg-rose-100/80' }
    ];
    
    const emojiMap = {
        'Efectivo': '💵',
        'Tarjeta': '💳',
        'Bizum': '📱',
        'Transferencia': '🏦',
        'PayPal': '🅿️',
        'PADI': '🅿️'
    };
    
    const currentVal = document.getElementById('caja-new-dep-method-val').value;
    
    methods.forEach(opt => {
        const item = document.createElement('button');
        item.type = 'button';
        const isCurrent = opt.value === currentVal;
        
        item.className = `w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-between gap-2 border border-transparent ${isCurrent ? opt.activeClass : opt.normalClass}`;
        
        const emoji = emojiMap[opt.value] || '💰';
        item.innerHTML = `<span>${emoji} ${opt.label}</span>` + 
            (isCurrent ? `<svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>` : '');
            
        item.onclick = function() {
            document.getElementById('caja-new-dep-method-label').innerHTML = `${emoji} ${opt.label}`;
            document.getElementById('caja-new-dep-method-val').value = opt.value;
            dropdown.remove();
        };
        
        dropdown.appendChild(item);
    });
    
    document.body.appendChild(dropdown);
    
    // Position dropdown exactly below buttonEl
    const rect = buttonEl.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    dropdown.style.top = `${rect.bottom + scrollY + 4}px`;
    dropdown.style.left = `${rect.left + scrollX}px`;
    
    // Close dropdown on click outside
    const outsideClickListener = function(e) {
        if (!dropdown.contains(e.target) && e.target !== buttonEl && !buttonEl.contains(e.target)) {
            dropdown.remove();
            document.removeEventListener('click', outsideClickListener);
        }
    };
    document.addEventListener('click', outsideClickListener);
};

window.toggleCajaGroupDropdown = function(buttonEl) {
    const existing = document.getElementById('caja-group-dropdown');
    if (existing) {
        existing.remove();
        return;
    }
    
    const dni = window.activeFichaDni;
    if (!dni) return;
    
    const myGroups = (window.globalGroups || []).filter(g => (g.members || []).some(m => window.isSameDni(m, dni)));
    if (myGroups.length === 0) return;
    
    const groupMembers = new Set();
    myGroups.forEach(g => {
        (g.members || []).forEach(m => groupMembers.add(window.normalizeDni(m)));
    });
    
    const memberList = Array.from(groupMembers);
    
    const dropdown = document.createElement('div');
    dropdown.id = 'caja-group-dropdown';
    dropdown.className = 'fixed bg-white border border-slate-200/80 rounded-xl shadow-xl p-2.5 flex flex-col gap-1 min-w-[220px] z-[400] select-none';
    
    const renderDropdownContent = () => {
        let html = '';
        
        // Select All / Deselect All options
        html += `
            <div class="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1 px-1 text-[9px] font-black uppercase text-slate-400 gap-4">
                <span>Selección</span>
                <div class="flex gap-2">
                    <button onclick="window.handleSelectAllGroupCaja(true)" class="text-blue-600 hover:underline">Todos</button>
                    <span>•</span>
                    <button onclick="window.handleSelectAllGroupCaja(false)" class="text-slate-500 hover:underline">Ninguno</button>
                </div>
            </div>
        `;
        
        memberList.forEach(mDni => {
            let name = '';
            const profile = customerDatabase.find(c => window.isSameDni(c.dni, mDni));
            if (profile) {
                name = profile.nombre;
            } else {
                if (typeof activeBoatItem !== 'undefined' && activeBoatItem && activeBoatItem.groups) {
                    for (const g of activeBoatItem.groups) {
                        const gst = (g.guests || []).find(gst => window.isSameDni(gst.dni, mDni));
                        if (gst && gst.nombre) {
                            name = gst.nombre;
                            break;
                        }
                    }
                }
                if (!name) {
                    for (const trip of (window.mergedAllocations || [])) {
                        if (trip.groups) {
                            for (const g of trip.groups) {
                                const gst = (g.guests || []).find(gst => window.isSameDni(gst.dni, mDni));
                                if (gst && gst.nombre) {
                                    name = gst.nombre;
                                    break;
                                }
                            }
                        }
                        if (name) break;
                    }
                }
            }
            if (!name) name = mDni;
            
            const isMain = window.isSameDni(dni, mDni);
            const isSelected = window.cajaSelectedGroupMembers.has(mDni);
            
            html += `
                <label class="flex items-center justify-between gap-3 px-2 py-1 rounded-lg text-xs font-black text-slate-700 hover:bg-slate-50 transition-all cursor-pointer ${isMain ? 'opacity-85' : ''}">
                    <span class="truncate">${name}</span>
                    <input type="checkbox" class="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                           ${isSelected ? 'checked' : ''} 
                           ${isMain ? 'disabled' : ''} 
                           onchange="window.handleToggleGroupMemberCheckboxCaja('${mDni}', this.checked)">
                </label>
            `;
        });
        
        dropdown.innerHTML = html;
        
        // Update the count on the main button
        const selectedCount = memberList.filter(m => window.cajaSelectedGroupMembers.has(m)).length;
        const trigger = document.getElementById('caja-group-dropdown-trigger');
        if (trigger) {
            const countSpan = trigger.querySelector('span');
            if (countSpan) {
                countSpan.innerText = `👥 Grupo: ${myGroups[0].name} (${selectedCount}/${memberList.length})`;
            }
        }
    };
    
    renderDropdownContent();
    window.refreshCajaGroupDropdown = renderDropdownContent;
    
    document.body.appendChild(dropdown);
    
    // Position dropdown exactly below buttonEl
    const rect = buttonEl.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    dropdown.style.top = `${rect.bottom + scrollY + 4}px`;
    dropdown.style.left = `${rect.left + scrollX}px`;
    
    // Close dropdown on click outside
    const outsideClickListener = function(e) {
        if (!dropdown.contains(e.target) && e.target !== buttonEl && !buttonEl.contains(e.target)) {
            dropdown.remove();
            document.removeEventListener('click', outsideClickListener);
            delete window.refreshCajaGroupDropdown;
        }
    };
    document.addEventListener('click', outsideClickListener);
};

window.handleToggleGroupMemberCheckboxCaja = async function(memberDni, checked) {
    if (checked) {
        window.cajaSelectedGroupMembers.add(window.normalizeDni(memberDni));
    } else {
        window.cajaSelectedGroupMembers.delete(window.normalizeDni(memberDni));
    }
    
    // Trigger history load/recalculation
    await window.ensureGroupMembersHistoryLoadedAndRender(window.activeFichaDni);
    
    // Re-render dropdown items to reflect new state
    if (typeof window.refreshCajaGroupDropdown === 'function') {
        window.refreshCajaGroupDropdown();
    }
};

window.handleSelectAllGroupCaja = async function(selectAll) {
    const mainDni = window.normalizeDni(window.activeFichaDni);
    if (!mainDni) return;
    
    const myGroups = (window.globalGroups || []).filter(g => (g.members || []).some(m => window.isSameDni(m, mainDni)));
    if (myGroups.length === 0) return;
    
    const groupMembers = new Set();
    myGroups.forEach(g => {
        (g.members || []).forEach(m => groupMembers.add(window.normalizeDni(m)));
    });
    
    if (selectAll) {
        groupMembers.forEach(m => window.cajaSelectedGroupMembers.add(m));
    } else {
        window.cajaSelectedGroupMembers = new Set([mainDni]);
    }
    
    await window.ensureGroupMembersHistoryLoadedAndRender(window.activeFichaDni);
    
    if (typeof window.refreshCajaGroupDropdown === 'function') {
        window.refreshCajaGroupDropdown();
    }
};

window.ensureGroupMembersHistoryLoadedAndRender = async function(mainDni) {
    if (!window.groupHistoryCache) window.groupHistoryCache = {};
    if (!window.cajaSelectedGroupMembers) {
        window.cajaSelectedGroupMembers = new Set([window.normalizeDni(mainDni)]);
    }
    
    const unloadedDnis = Array.from(window.cajaSelectedGroupMembers).filter(mDni => !window.groupHistoryCache[mDni]);
    
    if (unloadedDnis.length > 0) {
        const cajaListEl = document.getElementById('caja-pending-list');
        if (cajaListEl) {
            cajaListEl.innerHTML = `<tr><td colspan="11" class="p-8 text-center"><svg class="animate-spin h-6 w-6 text-blue-500 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Cargando miembros...</td></tr>`;
        }
        
        try {
            await Promise.all(unloadedDnis.map(async (mDni) => {
                const snap = await db.collection('mangamar_customers').doc(mDni).collection('history').get();
                const docs = [];
                snap.forEach(doc => {
                    doc._ownerDni = mDni;
                    docs.push(doc);
                });
                window.groupHistoryCache[mDni] = docs;
            }));
        } catch (e) {
            console.error("Error loading group history:", e);
            showAppAlert("Error de red al cargar el historial del grupo.");
            return;
        }
    }
    
    const combinedRawDocs = [];
    const mainNormDni = window.normalizeDni(mainDni);
    
    if (!window.groupHistoryCache[mainNormDni]) {
        window.groupHistoryCache[mainNormDni] = window.activeFichaRawDocs || [];
    }
    
    Array.from(window.cajaSelectedGroupMembers).forEach(mDni => {
        const docs = window.groupHistoryCache[mDni] || [];
        combinedRawDocs.push(...docs);
    });
    
    combinedRawDocs.sort((a, b) => {
        const dataA = typeof a.data === 'function' ? a.data() : a.data;
        const dataB = typeof b.data === 'function' ? b.data() : b.data;
        const dateTimeA = `${dataA.date || ''}T${dataA.time || '00:00'}`;
        const dateTimeB = `${dataB.date || ''}T${dataB.time || '00:00'}`;
        return dateTimeA.localeCompare(dateTimeB);
    });
    
    window.activeFichaRawDocs = combinedRawDocs;
    window.recalculateFichaHistory(mainDni);
    window.renderFichaFromCache(mainDni, 'caja');
};