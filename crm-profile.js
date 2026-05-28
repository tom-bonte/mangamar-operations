window.switchFichaTab = function (tabId) {
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
    if (window.closeFacturaView) window.closeFacturaView(); // Ensure details view is always closed
    if (!isNavBackForward) window.fichaDisplayLimit = 15; // Reset pagination for fresh loads

    const customerInfo = customerDatabase.find(c => c.dni === dni) || { telefono: '', email: '', discount: 0 };
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

            const totalEl = document.getElementById('ficha-caja-total');
            if (totalEl) {
                totalEl.innerText = "0 €";
                totalEl.className = "text-3xl font-black text-slate-300 tracking-tighter";
                const deudaEl = document.getElementById('ficha-caja-deuda');
                if (deudaEl) deudaEl.innerText = "0 €";
                
                const senalInput = document.getElementById('ficha-caja-senal-input');
                if (senalInput) senalInput.value = "0";

                const liquidarBtn = document.getElementById('btn-liquidar');
                if (liquidarBtn) liquidarBtn.classList.add('opacity-50', 'pointer-events-none');
            }

            switchFichaTab(targetTab);
            return;
        }

        window.activeFichaRawDocs = [];
        snapshot.forEach(doc => window.activeFichaRawDocs.push(doc));
        window.activeFichaRawDocs.reverse();

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
    
    const customerInfo = customerDatabase.find(c => c.dni === dni) || { telefono: '', email: '', discount: 0 };
    
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
            if (!gst.dni) return;
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
    let billedCourses = new Set();
    let activeInsExpiry = null;

    window.activeFichaRawDocs.forEach(item => {
        // Handle mock documents from optimistic rendering or real Firestore documents
        let data = typeof item.data === 'function' ? item.data() : item.data;
        
        // 🚨 AUTO-PRUNE GHOST BILLS 🚨
        // Detects orphaned history documents (from the old race condition) and deletes them automatically.
        if (item.id && !item.id.startsWith('temp_') && data.type !== 'pago' && data.type !== 'producto' && data.type !== 'servicio') {
            // CRITICAL: We must find the INTERNAL trip (which has guests), not the base Visor template
            let realTrip = (window.mergedAllocations || []).find(t => t.id === item.id && t.isInternalTrip);
            if (!realTrip) realTrip = (window.mergedAllocations || []).find(t => t.id === item.id);
            
            if (realTrip) {
                // Trip is currently in RAM. Verify the guest is actually on the manifest.
                const isActuallyOnBoat = (realTrip.guests || []).some(g => (g.dni || '').toLowerCase() === (dni || '').toLowerCase());
                if (!isActuallyOnBoat) {
                    console.warn(`🧹 Auto-Pruning ghost bill: ${dni} is no longer on trip ${item.id}. Deleting...`);
                    db.collection('mangamar_customers').doc(dni).collection('history').doc(item.id).delete().catch(e => console.error(e));
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

            if (!billedCourses.has(baseCourse)) {
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
            if (data.insurance === 'INC') p.insurance = 0;
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
                // To be safe against auto-migrations, if we find ANY guest with this DNI on ANY trip at the exact same date and time, we assume it's valid.
                const validTripsThatDay = (window.internalTrips || []).filter(t => t.date === data.date);
                let isGuestOnBoat = false;
                
                for (let t of validTripsThatDay) {
                    if ((t.guests || []).some(g => (g.dni || '').trim().toLowerCase() === (dni || '').trim().toLowerCase())) {
                        isGuestOnBoat = true;
                        break;
                    }
                }

                if (!isGuestOnBoat) {
                    safeToRender = false;
                    console.warn(`🚨 SILENT GHOST BILL BLOCK: ${dni} is NOT on any trip on ${data.date}. Blocking UI...`);
                    // We only background delete if we are 100% sure they are not on ANY boat that day to avoid auto-migration conflicts
                    if (typeof db !== 'undefined') {
                        db.collection('mangamar_customers').doc(dni).collection('history').doc(item.id).delete().catch(e=>console.error("Silent delete fail", e));
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
            processedDives.push({ doc: item.doc || item, data, p, cleanIns, isCovered, isCourseCovered });
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

                    // 1. Check Internal Database
                    const monthlyDoc = await db.collection('mangamar_monthly').doc(monthKey).get();
                    const allocs = monthlyDoc.data()?.allocations || {};
                    const internalTrip = allocs[item.id];
                    
                    let shouldDelete = false;
                    if (!internalTrip || internalTrip._deleted) {
                        // 2. Check Visor Database if internal is missing
                        const visorDoc = await db.collection('mangamar_visor').doc(monthKey).get();
                        const visorAllocs = visorDoc.data()?.allocations || {};
                        const visorTrip = visorAllocs[item.id];
                        
                        if (!visorTrip || visorTrip._deleted) {
                            shouldDelete = true; // Exists nowhere
                        } else {
                            shouldDelete = true; // Exists in Visor but has no internal shadow (thus no guests)
                        }
                    } else {
                        // Exists internally. Verify guest list!
                        const isActuallyOnBoat = (internalTrip.guests || []).some(g => (g.dni || '').toLowerCase() === (dni || '').toLowerCase());
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

window.renderFichaFromCache = function(dni, targetTab = 'caja') {
    if (!window.activeFichaDives) return;
    
    let html = '';
    let pagosHtml = '';
    let pendingServiciosHTML = '';
    let pendingProductosHTML = '';
    let pendingPagosHTML = '';
    let grandTotal = 0;
    let pendingTotal = 0;
    let pagosTotalSum = 0;

    const customerInfo = customerDatabase.find(c => c.dni === dni) || { telefono: '', email: '', discount: 0 };
    
    let fixedDiscountAmount = 0;
    if (customerInfo.discount > 0 && customerInfo.discountType === 'fixed') {
        fixedDiscountAmount = customerInfo.discount;
    }
    let positivePendingTotal = 0;
    let negativePendingTotal = 0;

    if (typeof window.fichaDisplayLimit === 'undefined') window.fichaDisplayLimit = 15;

    window.activeFichaDives.forEach((item, index) => {
        const { doc, data, p, cleanIns, isCovered, isCourseCovered } = item;

        if (data.type !== 'pago') grandTotal += p.total;

        let isPaid = data.paymentStatus === 'paid';
        if (data.type === 'pago' && data.isPartialAbono) {
            isPaid = false;
        } else if (data.type === 'pago' && data.paymentStatus === 'pending') {
            isPaid = false; // Legacy fallback
        }

        if (!isPaid) pendingTotal += p.total;

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

        const statusBtn = isPaid
            ? `<button onclick="togglePaymentStatus('${dni}', '${doc.id}', 'paid')" class="px-2.5 py-1 bg-green-50 text-green-600 border border-green-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-green-100 transition-colors shrink-0 w-full shadow-sm">Pagado</button>`
            : `<button onclick="togglePaymentStatus('${dni}', '${doc.id}', 'pending')" class="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5 shrink-0 w-full shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Pendiente</button>`;

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
                </div>
            </td>`;
        }

        if (data.type === 'pago') {
            pagosTotalSum += Math.abs(parseFloat(data.customPrice) || 0);
            if (index < window.fichaDisplayLimit) {
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
        } else {
            if (index < window.fichaDisplayLimit) {
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
        }

        if (!isPaid) {
            let conceptName = '';
            let conceptBadge = '';
            if (data.type === 'producto' || data.type === 'servicio') {
                conceptName = data.description;
                const isProd = data.type === 'producto';
                conceptBadge = `<span class="px-1 ${isProd ? 'bg-indigo-100 text-indigo-700' : 'bg-fuchsia-100 text-fuchsia-700'} rounded text-[8px] uppercase font-black mr-2">${isProd ? 'PROD' : 'SERV'}</span>`;
            } else if (data.type === 'pago') {
                conceptName = data.description;
                conceptBadge = `<span class="px-1 bg-emerald-100 text-emerald-700 rounded text-[8px] uppercase font-black mr-2">PAGO</span>`;
            } else {
                conceptName = `${data.site || 'Inmersión'}`;
                conceptBadge = `<span class="px-1 bg-sky-100 text-sky-700 rounded text-[8px] uppercase font-black mr-2">BUCEO</span>`;
            }

            const pendingRow = `
            <tr class="group border-b border-slate-50 hover:bg-slate-50 transition-colors h-10">
                <td class="py-2 px-3 text-[10px] font-black uppercase text-slate-400 tracking-wider align-middle whitespace-nowrap">${data.date}</td>
                <td class="py-2 px-3 align-middle w-full">
                    <div class="font-bold text-slate-700 text-xs flex items-center leading-tight">
                        ${conceptBadge}${conceptName}
                    </div>
                    <div class="text-[9px] text-slate-400 mt-0.5 truncate max-w-[200px] sm:max-w-xs">${breakdownHtml.replace(/font-black/g, 'font-bold')}</div>
                </td>
                <td class="py-2 px-3 align-middle text-right whitespace-nowrap">
                    <div class="font-black ${data.type === 'pago' ? 'text-emerald-500' : 'text-amber-600'} text-sm cursor-pointer hover:scale-110 transition-all px-2 py-1 rounded hover:bg-white hover:shadow-sm border border-transparent hover:border-amber-200" 
                         title="Click para editar precio" 
                         onclick="window.inlineEditPrice(event, this, '${dni}', '${doc.id}', ${p.total})">${p.total.toFixed(2)} €</div>
                </td>
                <td class="py-2 px-3 align-middle w-8 text-center shrink-0">
                    <button onclick="togglePaymentStatus('${dni}', '${doc.id}', 'paid')" class="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded transition-colors" title="Marcar Pagado"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg></button>
                </td>
            </tr>`;

            if (data.type === 'producto') {
                pendingProductosHTML += pendingRow;
                positivePendingTotal += p.total;
            } else if (data.type === 'pago') {
                pendingPagosHTML += pendingRow;
                negativePendingTotal += p.total;
            } else {
                pendingServiciosHTML += pendingRow;
                positivePendingTotal += p.total;
            }
        }
    });

    const cajaListEl = document.getElementById('caja-pending-list');
    if (cajaListEl) {
        let finalCajaHTML = '';
        let totalPendingCount = 0;
        if (pendingServiciosHTML) {
            finalCajaHTML += `<tr class="bg-slate-50 border-y border-slate-100"><td colspan="4" class="px-3 py-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Servicios / Buceos</td></tr>` + pendingServiciosHTML;
            totalPendingCount += (pendingServiciosHTML.match(/<tr class="group/g) || []).length;
        }
        if (pendingProductosHTML) {
            finalCajaHTML += `<tr class="bg-slate-50 border-y border-slate-100"><td colspan="4" class="px-3 py-1.5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Productos</td></tr>` + pendingProductosHTML;
            totalPendingCount += (pendingProductosHTML.match(/<tr class="group/g) || []).length;
        }
        
        const depositCaja = customerInfo.deposit || 0;
        
        if (pendingPagosHTML || fixedDiscountAmount > 0 || depositCaja > 0) {
             finalCajaHTML += `
             <tr class="bg-slate-50 border-y border-slate-100"><td colspan="2" class="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Subtotal:</td><td class="px-3 py-2 text-slate-700 text-right font-bold text-sm whitespace-nowrap">${positivePendingTotal.toFixed(2)} €</td><td></td></tr>
             ${pendingPagosHTML}`;
             
             if (fixedDiscountAmount > 0) {
                finalCajaHTML += `<tr class="bg-rose-50/50 border-t border-rose-100"><td colspan="2" class="px-3 py-1.5 text-[10px] font-black uppercase text-rose-500 tracking-widest text-right">Descuento Global:</td><td class="px-3 py-1.5 text-rose-600 text-right font-bold text-xs whitespace-nowrap">-${fixedDiscountAmount.toFixed(2)} €</td><td></td></tr>`;
             }
             
             if (depositCaja > 0) {
                finalCajaHTML += `<tr class="bg-emerald-50/50 border-t border-emerald-100"><td colspan="2" class="px-3 py-1.5 text-[10px] font-black uppercase text-emerald-600 tracking-widest text-right">Depósito a Cuenta:</td><td class="px-3 py-1.5 text-emerald-600 text-right font-bold text-xs whitespace-nowrap">-${depositCaja.toFixed(2)} €</td><td></td></tr>`;
             }

             const finalDebtObj = Math.max(0, positivePendingTotal + negativePendingTotal - depositCaja - fixedDiscountAmount);
             
             finalCajaHTML += `<tr class="bg-amber-50 border-t-2 border-amber-200"><td colspan="2" class="px-3 py-3 text-right"><span class="text-[10px] font-black uppercase text-amber-800 tracking-widest mr-4">Total a Pagar:</span></td><td class="px-3 py-3 text-lg font-black text-amber-600 text-right whitespace-nowrap w-24">${finalDebtObj.toFixed(2)} €</td><td></td></tr>
             `;
        } else if (positivePendingTotal > 0) {
             finalCajaHTML += `
             <tr class="bg-amber-50 border-t-2 border-amber-200"><td colspan="2" class="px-3 py-3 text-right"><span class="text-[10px] font-black uppercase text-amber-800 tracking-widest mr-4">Total a Pagar:</span></td><td class="px-3 py-3 text-lg font-black text-amber-600 text-right whitespace-nowrap w-24">${positivePendingTotal.toFixed(2)} €</td><td></td></tr>
             `;
        }

        if (!finalCajaHTML) {
            finalCajaHTML = `<tr><td colspan="4" class="p-8 text-center"><div class="text-3xl mb-2">🎉</div><div class="text-sm font-bold text-slate-400">Sin cargos pendientes</div></td></tr>`;
        }
        cajaListEl.innerHTML = finalCajaHTML;
        document.getElementById('caja-pending-count').innerText = `${totalPendingCount} items`;
    }

    const deposit = customerInfo.deposit || 0;
    let totalAPagar = Math.max(0, pendingTotal - deposit - fixedDiscountAmount);

    if (grandTotal > 0) {
        html += `
        <tr class="bg-slate-50 border-t-2 border-slate-200">
            <td colspan="4" class="py-3 px-3 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px] align-middle">Total Historial (Buceos y Productos)</td>
            <td class="py-3 px-3 text-right font-black text-slate-400 text-lg align-middle">${grandTotal.toFixed(2)} €</td>
            <td></td>
        </tr>`;
    }

    if (window.activeFichaDives.length > window.fichaDisplayLimit) {
        const moreBtn = `
        <tr>
            <td colspan="6" class="p-6 text-center">
                <button onclick="window.fichaDisplayLimit += 15; window.renderFichaFromCache('${dni}', '${targetTab}');" class="px-6 py-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200 font-black text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 mx-auto">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    Cargar Más (${window.activeFichaDives.length - window.fichaDisplayLimit} ocultos)
                </button>
            </td>
        </tr>`;
        html += moreBtn;
        if (pagosHtml) pagosHtml += moreBtn;
    }

    document.getElementById('profile-history-list').innerHTML = html;
    
    if (pagosTotalSum > 0 || deposit > 0) {
        let depHtml = '';
        if (deposit > 0) {
            pagosTotalSum += deposit;
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
                    -${deposit} €
                </td>
                <td class="py-2 px-3 text-center align-middle shrink-0"></td>
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
        
        const senalInput = document.getElementById('ficha-caja-senal-input');
        if (senalInput) senalInput.value = deposit;
        
        const methodSpan = document.getElementById('ficha-caja-senal-method');
        if (methodSpan) {
            if (deposit > 0 && customerInfo.depositMethod) {
                methodSpan.innerText = customerInfo.depositMethod;
                methodSpan.classList.remove('hidden');
            } else {
                methodSpan.classList.add('hidden');
            }
        }
        
        document.getElementById('ficha-caja-total').innerText = totalAPagar.toFixed(2);

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
            totalEl.className = "text-3xl font-black text-slate-300 tracking-tight";
            btnLiq.classList.add('opacity-50', 'pointer-events-none');
        } else if (totalAPagar <= 0 && pendingTotal > 0) {
            totalEl.innerText = "0.00 (Pagado)";
            totalEl.className = "text-3xl font-black text-emerald-500 tracking-tight";
            btnLiq.classList.remove('opacity-50', 'pointer-events-none');
        } else {
            totalEl.innerText = totalAPagar.toFixed(2);
            totalEl.className = "text-3xl font-black text-slate-900 tracking-tight";
            btnLiq.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    switchFichaTab(targetTab);
};

window.promptEditCustomer = function () {
    if (!window.activeFichaDni) return;
    const customerInfo = customerDatabase.find(c => c.dni === window.activeFichaDni) || {};

    document.getElementById('edit-f-dni').value = window.activeFichaDni;
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
    const dni = window.activeFichaDni;
    const nombre = document.getElementById('edit-f-nombre').value.trim();
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

        // 1. Update local database
        const index = customerDatabase.findIndex(c => c.dni === dni);
        if (index > -1) {
            customerDatabase[index].nombre = nombre;
            if (apodo) customerDatabase[index].apodo = apodo;
            else delete customerDatabase[index].apodo;
            if (customerDatabase[index].apellidos) delete customerDatabase[index].apellidos;
            if (customerDatabase[index].apellido) delete customerDatabase[index].apellido;
            customerDatabase[index].dob = window.normalizeDateStr(dob);
            customerDatabase[index].telefono = telefono;
            customerDatabase[index].email = email;
            customerDatabase[index].titulacion = titulacion;
            if (divesRaw) customerDatabase[index].dives = parseInt(divesRaw);
            else delete customerDatabase[index].dives;
            if (insType) {
                if (!customerDatabase[index].insurance) customerDatabase[index].insurance = {};
                customerDatabase[index].insurance.type = insType;
                customerDatabase[index].insurance.expiry = insExp;
            } else {
                delete customerDatabase[index].insurance;
            }
        }

        // 2. Auto-sync Master List (ASYNC NON-BLOCKING)
        db.collection('mangamar_directory').doc('master_list').set({ clients: customerDatabase }, { merge: true }).catch(e => console.error("Error bg master sync:", e));

        // 3. Update active boat manifests via mergedAllocations natively
        let boatSyncPromises = [];
        mergedAllocations.forEach(trip => {
            let modified = false;
            if (trip.groups) {
                trip.groups.forEach(group => {
                    if (group.guests) {
                        group.guests.forEach(guest => {
                            if (guest.dni === dni) {
                                let newFullName = window.getFullName(customerDatabase[index]);
                                let newTitulacion = customerDatabase[index].titulacion || '';
                                let newTelefono = customerDatabase[index].telefono || '';
                                let newEmail = customerDatabase[index].email || '';
                                if (guest.nombre !== newFullName || guest.titulacion !== newTitulacion || guest.telefono !== newTelefono || guest.email !== newEmail) {
                                    guest.nombre = newFullName;
                                    guest.titulacion = newTitulacion;
                                    guest.telefono = newTelefono;
                                    guest.email = newEmail;
                                    modified = true;
                                }
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
                                    if (gst.dni === dni) {
                                        gst.nombre = window.getFullName(customerDatabase[index]);
                                        gst.titulacion = customerDatabase[index].titulacion || '';
                                        gst.telefono = customerDatabase[index].telefono || '';
                                        gst.email = customerDatabase[index].email || '';
                                    }
                                });
                            }
                        });
                    }
                }
                const payload = {
                    captain: trip.captain || '',
                    guide: trip.guide || '',
                    groups: trip.groups || [],
                    isInternalTrip: true
                };
                if (trip.isVisorTrip) payload.visorTripFallback = true;
                if (typeof window.saveInternalBoatData === 'function') {
                    boatSyncPromises.push(window.saveInternalBoatData(trip.id, trip.date, payload));
                }
            }
        });

        if (boatSyncPromises.length > 0) {
            Promise.all(boatSyncPromises).catch(e => console.error("Error bg boat sync:", e));
        }

        // Redraw boats if manifest is active (unconditionally, instantly)
        if (typeof window.renderGroups === 'function' && document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) {
            window.renderGroups();
        }

        // Instant local redraw of the daily grid
        if (typeof window.renderDailyGrid === 'function') {
            window.renderDailyGrid();
        }

        document.getElementById('edit-customer-modal-full').classList.add('hidden');
        showToast("👍 Perfil actualizado correctamente.");

        // Soft refresh local visuals ONLY if Ficha is already open
        if (!document.getElementById('customer-profile-modal').classList.contains('hidden')) {
            openCustomerProfile(dni, window.getFullName(customerDatabase[index]), false, 'ficha');
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
    customerDatabase = customerDatabase.filter(c => c.dni !== dni);
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
                await db.collection('mangamar_directory').doc('master_list').set({ clients: updated }, { merge: true });
            }
        } catch (e) {
            console.error("Error background deleting customer:", e);
        } finally {
            btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Borrar Cliente';
            btn.disabled = false;
        }
    })();
};