// ==========================================
// 7. CUSTOMER CRM & PRICING ENGINE
// ==========================================

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

function calculateDivePrice(historyItem) {
    if (historyItem.type === 'producto' || historyItem.type === 'servicio' || historyItem.type === 'pago') {
        const val = parseFloat(historyItem.customPrice) || 0;
        return { dive: 0, tasa: 0, gas: 0, rental: 0, insurance: 0, computer: 0, course: 0, custom: val, total: val };
    }

    let dive = 0, tasa = 0, gas = 0, rental = 0, insurance = 0, computer = 0;

    // 1. Dive Site Price (Split Tasa)
    const site = historyItem.site || '';
    if (['Cala', 'Shore', 'Aula'].includes(site)) dive = 40;
    else if (site === 'Naranjito') dive = 45;
    else if (site === 'Fuera') { dive = 50; tasa = 10; }
    else if (site) { dive = 44; tasa = 5; } // Reserva Marina

    if (historyItem.hasBono) dive = 0; // BONUS DEDUCTION

    // 2. Gas
    if (historyItem.gas && historyItem.gas.includes('EAN')) gas = 7;

    // 3. Rental
    if (historyItem.rental === 1) rental = 10;
    else if (historyItem.rental === 2) rental = 15;

    // 4. Insurance
    if (historyItem.insurance === '1D') insurance = 10;
    else if (historyItem.insurance === '1W') insurance = 18;
    else if (historyItem.insurance === '1M') insurance = 24;
    else if (historyItem.insurance === '1Y') insurance = 45;

    // 5. Computer Rental (uses stored price or fallback)
    if (historyItem.computer) {
        computer = historyItem.computerPrice || 7;
    }

    return { dive, tasa, gas, rental, insurance, computer, course: 0, custom: 0, total: dive + tasa + gas + rental + insurance + computer };
}
window.calculateDivePrice = calculateDivePrice;

// ==========================================
// 8. GLOBAL SEARCH & TODAY'S DIVERS
// ==========================================

function searchGlobalDivers(query) {
    const resEl = document.getElementById('global-search-results');
    query = query.toLowerCase().trim();
    if (query.length < 2) { resEl.innerHTML = ''; return; }

    const results = customerDatabase.filter(c => {
        const fullName = getFullName(c).toLowerCase();
        return fullName.includes(query) || (c.dni || '').toLowerCase().includes(query);
    }).slice(0, 15); // Show top 15 results

    if (results.length === 0) {
        resEl.innerHTML = '<div class="p-4 text-sm text-slate-500 italic text-center">No se encontraron resultados en la base de datos maestra.</div>';
        return;
    }

    resEl.innerHTML = results.map(c => `<div class="p-3 border-b border-slate-100 hover:bg-indigo-50 cursor-pointer transition-colors" onclick="openCustomerProfile('${c.dni}', '${getFullName(c).replace(/'/g, "\\'")}')">
        <div class="font-bold text-slate-800 text-sm">${getFullName(c)}</div>
        <div class="text-xs font-bold text-slate-500 font-mono">${c.titulacion || '-'} • ${c.dni}</div>
    </div>`).join('');
}

// ==========================================
// 9. DESTRUCTIVE ACTIONS & TESTING UTILITIES
// ==========================================

// This function acts as a 2-way sync. It deletes the debt from the Ficha, 
// AND reaches into the actual boat schedule to rip the diver out.
window.deleteHistoryItem = async function (dni, boatId, monthKey, itemType = 'buceo') {
    const isPago = itemType === 'pago';
    const isProd = itemType === 'producto' || itemType === 'servicio';
    const alertMsg = isPago ? 
        "⚠️ ¿Estás seguro de que quieres anular este PAGO?\n\nEsto ajustará el balance del cliente y eliminará el registro de los ingresos." : 
        (isProd ? "⚠️ ¿Estás seguro de que quieres anular este PRODUCTO/SERVICIO de la cuenta?" : "⚠️ ¿Estás seguro de que quieres anular este buceo?\n\nEsto ELIMINARÁ el cobro de la ficha Y SACARÁ físicamente a esta persona del barco en el calendario.");

    showAppConfirm(alertMsg, async () => {
        try {
            // 1. Shred the receipt in the Ficha
            await db.collection('mangamar_customers').doc(dni).collection('history').doc(boatId).delete();

            // 2. ONLY rip them out of the physical boat if it was actually a boat trip
            if (!isPago && !isProd) {
                const trip = internalTrips.find(t => t.id === boatId);
                if (trip) {
                    let clonedTrip = JSON.parse(JSON.stringify(trip));
                    clonedTrip.groups.forEach(g => {
                        g.guests = g.guests.filter(guest => guest.dni !== dni);
                    });
                    clonedTrip.guests = clonedTrip.guests.filter(guest => guest.dni !== dni);

                    await db.collection('mangamar_monthly').doc(monthKey).update({
                        [`allocations.${boatId}`]: clonedTrip
                    });
                }
            }

            // --- GARBAGE COLLECTOR TRIGGER ---
            if (window.cleanOrphanedInsurance) window.cleanOrphanedInsurance(dni);

            // 3. Refresh the UI dynamically
            const nombre = document.getElementById('profile-modal-name').innerText;
            const contextLayer = document.getElementById('tab-content-caja').classList.contains('hidden') ? 
                (document.getElementById('tab-content-pagos').classList.contains('hidden') ? 'historial' : 'pagos') : 'caja';
            openCustomerProfile(dni, nombre, false, contextLayer);

            if (!document.getElementById('today-divers-modal').classList.contains('hidden')) {
                openTodayDiversModal();
            }

            showToast("Registro anulado con éxito.");
        } catch (e) {
            console.error(e);
            showAppAlert("Error de conexión al eliminar.");
        }
    });
};

window.executeAdvancedWipe = async function () {
    const wipeDivers = document.getElementById('wipe-opt-divers').checked;
    const wipeTrips = document.getElementById('wipe-opt-trips').checked;
    const wipeStaff = document.getElementById('wipe-opt-staff').checked;
    const wipeGroups = document.getElementById('wipe-opt-groups').checked;

    if (!wipeDivers && !wipeTrips && !wipeStaff && !wipeGroups) {
        showAppAlert("No has seleccionado nada para borrar.");
        return;
    }

    showAppConfirm("⚠️ ADVERTENCIA: Esta acción eliminará los datos seleccionados de forma irreversible de la base de datos.", async () => {
        document.getElementById('debug-wipe-modal').classList.add('hidden');
        showToast("⏳ Purgando base de datos... (puede tardar unos segundos)");

        const updatesByMonth = {};
        
        if (wipeDivers || wipeTrips || wipeStaff) {
            internalTrips.forEach(t => {
                const monthKey = t.date.substring(0, 7);
                if (!updatesByMonth[monthKey]) updatesByMonth[monthKey] = {};

                if (wipeTrips && !t.isVisor) {
                    updatesByMonth[monthKey][`allocations.${t.id}`] = firebase.firestore.FieldValue.delete();
                    return; // Skip further modifications for this trip because it's deleted
                }

                const cloned = JSON.parse(JSON.stringify(t));
                let modified = false;

                if (wipeStaff) {
                    cloned.captain = '';
                    if (cloned.groups) cloned.groups.forEach(g => g.guide = '');
                    modified = true;
                }

                if (wipeDivers) {
                    if (cloned.groups) cloned.groups.forEach(g => g.guests = []);
                    cloned.guests = [];
                    modified = true;
                }

                if (modified) {
                    updatesByMonth[monthKey][`allocations.${t.id}`] = cloned;
                }
            });
        }

        try {
            const monthKeys = Object.keys(updatesByMonth);
            if (monthKeys.length > 0) {
                const batch = db.batch();
                monthKeys.forEach(mk => {
                    const ref = db.collection('mangamar_monthly').doc(mk);
                    if (Object.keys(updatesByMonth[mk]).length > 0) {
                        batch.update(ref, updatesByMonth[mk]);
                    }
                });
                await batch.commit();
            }

            if (wipeDivers) {
                const allHistorySnap = await db.collectionGroup('history').get();
                const deletePromises = [];
                allHistorySnap.forEach(hDoc => { deletePromises.push(hDoc.ref.delete()); });
                await Promise.all(deletePromises);
            }

            if (wipeGroups) {
                const allGroupsSnap = await db.collection("mangamar_groups").get();
                const groupDelPromises = [];
                allGroupsSnap.forEach(gDoc => { groupDelPromises.push(gDoc.ref.delete()); });
                await Promise.all(groupDelPromises);
            }

            showToast("✅ Purga completada exitosamente.");
            setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
            console.error(e);
            showAppAlert("Error al procesar la purga de la base de datos.");
        }
    });
};

// ==========================================
// 12. PAYMENT & PENDING ORDERS ENGINE
// ==========================================

window.activePaymentContext = null;

window.promptPaymentGateway = function(dni, totalDebt, docIds, mode) {
    window.activePaymentContext = {
        dni, totalDebt, docIds, mode, originalDeposit: 0
    };

    const profile = customerDatabase.find(c => c.dni === dni);
    if (profile && profile.deposit) {
        window.activePaymentContext.originalDeposit = profile.deposit;
    }

    document.getElementById('payment-engine-amount').value = totalDebt;
    document.getElementById('payment-engine-total-label').innerText = `${totalDebt}€`;
    
    // Reset inputs
    document.querySelector('input[name="payMethod"][value="Tarjeta"]').checked = true;
    document.getElementById('payment-engine-partial-label').classList.add('hidden');
    
    // Listener for partial payment UI
    const amtInput = document.getElementById('payment-engine-amount');
    amtInput.oninput = function() {
        const val = parseFloat(this.value) || 0;
        if (val < totalDebt) {
            document.getElementById('payment-engine-partial-label').classList.remove('hidden');
        } else {
            document.getElementById('payment-engine-partial-label').classList.add('hidden');
        }
    };

    // Show modal
    const modal = document.getElementById('payment-engine-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

window.executePaymentGateway = async function() {
    const ctx = window.activePaymentContext;
    if (!ctx) return;

    const amountStr = document.getElementById('payment-engine-amount').value;
    const amountPaid = parseFloat(amountStr);
    const method = document.querySelector('input[name="payMethod"]:checked').value;

    if (isNaN(amountPaid) || amountPaid <= 0) {
        showAppAlert("Introduce un monto válido mayor a 0.");
        return;
    }

    const btn = document.getElementById('payment-engine-btn');
    const origHtml = btn.innerHTML;
    btn.innerHTML = `<svg class="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Procesando...`;
    btn.disabled = true;

    // --- 1. OPTIMISTIC UI UPDATE ---
    let isPartial = amountPaid < ctx.totalDebt;
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (window.activeFichaDives) {
        if (isPartial) {
            window.activeFichaDives.unshift({
                doc: { id: "temp_pago_" + Date.now() },
                data: {
                    type: 'pago',
                    description: `Abono Parcial (${method})`,
                    customPrice: -Math.abs(amountPaid),
                    paymentStatus: 'pending',
                    paymentMethod: method,
                    date: dateStr,
                }
            });
        } else {
            // Mark all items as paid locally
            ctx.docIds.forEach(id => {
                let dive = window.activeFichaDives.find(i => i.doc.id === id);
                if (dive) dive.data.paymentStatus = 'paid';
            });
            // AND insert the final missing payment to balance the transaction exactly
            window.activeFichaDives.unshift({
                doc: { id: "temp_pago_" + Date.now() },
                data: {
                    type: 'pago',
                    description: `Liquidación de Cuenta (${method})`,
                    customPrice: -Math.abs(amountPaid),
                    paymentStatus: 'paid',
                    paymentMethod: method,
                    date: dateStr,
                }
            });
        }
    }

    showToast(`✅ Pago de ${amountPaid}€ procesado correctamente.`);
    document.getElementById('payment-engine-modal').classList.add('opacity-0');
    setTimeout(() => {
        document.getElementById('payment-engine-modal').classList.add('hidden');
        btn.innerHTML = origHtml;
        btn.disabled = false;
        window.activePaymentContext = null;
    }, 300);

    // Reload the UI instantly!
    if (window.activeFichaDni === ctx.dni) {
        const currentName = document.getElementById('profile-modal-name').innerText;
        const contextLayer = document.getElementById('tab-content-caja').classList.contains('hidden') ? 'historial' : 'caja';
        openCustomerProfile(ctx.dni, currentName, false, contextLayer);
    } else if (!document.getElementById('today-divers-modal').classList.contains('hidden')) {
        openTodayDiversModal();
    }

    // --- 2. ASYNC BACKGROUND SYNC ---
    (async () => {
        try {
            const batch = db.batch();
            const historyRef = db.collection('mangamar_customers').doc(ctx.dni).collection('history');
            let shouldClearDeposit = false;

            if (isPartial) {
                const newPagoRef = historyRef.doc();
                batch.set(newPagoRef, {
                    type: 'pago',
                    description: `Abono Parcial (${method})`,
                    customPrice: -Math.abs(amountPaid),
                    paymentStatus: 'pending',
                    paymentMethod: method,
                    date: dateStr,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    paidAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                ctx.docIds.forEach(docId => {
                    const diveObj = window.activeFichaDives ? window.activeFichaDives.find(d => d.doc.id === docId) : null;
                    const isPagoItem = diveObj && diveObj.data && diveObj.data.type === 'pago';
                    
                    let updatePayload = {
                        paymentStatus: 'paid',
                        paidAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    // ONLY overwrite the payment method if it's a dive/product.
                    // Legacy Abonos correctly retain their original payment methods (Efectivo/Tarjeta)
                    if (!isPagoItem) {
                        updatePayload.paymentMethod = method;
                    }
                    
                    batch.update(historyRef.doc(docId), updatePayload);
                });
                
                // ADDITION: Always create a tracking token for the actual liquidation cash flow
                // This guarantees the accounting dashboard only ever sees exact payments.
                const liquidacionRef = historyRef.doc();
                batch.set(liquidacionRef, {
                    type: 'pago',
                    description: `Liquidación de Cuenta (${method})`,
                    customPrice: -Math.abs(amountPaid),
                    paymentStatus: 'paid', // Immediately settled since it balanced the account
                    paymentMethod: method,
                    date: dateStr,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    paidAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                if (ctx.mode === 'bulk') shouldClearDeposit = true;
            }

            await batch.commit();

            if (shouldClearDeposit) {
                const custIndex = customerDatabase.findIndex(c => c.dni === ctx.dni);
                if (custIndex !== -1) {
                    customerDatabase[custIndex].deposit = 0;
                    await db.collection("mangamar_directory").doc("master_list").update({ clients: customerDatabase });
                }
            }
        } catch (e) {
            console.error("Background payment sync failed:", e);
            showToast("⚠️ Conexión inestable. El pago se sincronizará cuando vuelva la red.");
        }
    })();
};

// Toggles a dive between "paid" and "pending" in the database instantly using optimistic UI
window.togglePaymentStatus = async function (dni, boatId, currentStatus) {
    if (currentStatus === 'pending') {
        const dive = window.activeFichaDives ? window.activeFichaDives.find(d => d.doc.id === boatId) : null;
        // fallback to querying if we don't have activeFichaDives
        let debt = dive ? dive.p.total : 0;
        
        // If we are in Dia De Hoy, calculate the total dynamically for that row
        if (!dive) {
           const rowTotalText = event.currentTarget.closest('tr')?.querySelector('.text-amber-600')?.innerText;
           debt = rowTotalText ? parseFloat(rowTotalText) : 0;
        }

        window.promptPaymentGateway(dni, debt, [boatId], 'single');
    } else {
        // Simple Undo: Paid -> Pending (no money exchanged, just reversing a mistake)
        showAppConfirm("¿Deshacer cobro y volver a marcar como Pendiente?", async () => {
            try {
                await db.collection('mangamar_customers').doc(dni).collection('history').doc(boatId).update({
                    paymentStatus: 'pending',
                    paymentMethod: firebase.firestore.FieldValue.delete(),
                    paidAt: firebase.firestore.FieldValue.delete()
                });
                showToast("Dato restaurado a Pendiente.");
                
                if (window.activeFichaDni === dni) {
                    const currentName = document.getElementById('profile-modal-name').innerText;
                    const contextLayer = document.getElementById('tab-content-caja').classList.contains('hidden') ? 'historial' : 'caja';
                    openCustomerProfile(dni, currentName, false, contextLayer);
                } else {
                    openTodayDiversModal();
                }
            } catch (e) {
                console.error(e);
                showAppAlert("Error al deshacer cobro.");
            }
        });
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
            document.getElementById('ficha-tab-dob').innerText = customerInfo.dob || '---';
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
                    let dDate = new Date(testDateStr);
                    dDate.setHours(23, 59, 59, 999);
                    if (!isNaN(dDate.getTime()) && dDate.getTime() < new Date().getTime()) {
                        isRed = true;
                        displaySeg = `Sin seguro en vigor - ${typeStr} (Caducado el ${testDateStr})`;
                    } else {
                        displaySeg += ` (Hasta ${testDateStr})`;
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
    if (discountEl) discountEl.value = customerInfo.discount || 0;
    document.getElementById('profile-history-list').innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500 font-bold flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-blue-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Cargando historial...</td></tr>';
    document.getElementById('customer-profile-modal').classList.remove('hidden');

    try {
        const snapshot = await db.collection('mangamar_customers').doc(dni).collection('history').orderBy('date', 'desc').get();
        if (snapshot.empty) {
            document.getElementById('profile-history-list').innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">No hay inmersiones registradas aún.</td></tr>';

            const totalEl = document.getElementById('ficha-caja-total');
            if (totalEl) {
                totalEl.innerText = "0 €";
                totalEl.className = "text-3xl font-black text-slate-300 tracking-tighter";
                document.getElementById('ficha-caja-deuda').innerText = "0 €";
                document.getElementById('ficha-caja-senal').innerText = "- 0 €";
                document.getElementById('btn-liquidar').classList.add('opacity-50', 'pointer-events-none');
            }

            switchFichaTab(targetTab);
            return;
        }

        let html = '';
        let pagosHtml = '';
        let pendingServiciosHTML = '';
        let pendingProductosHTML = '';
        let pendingPagosHTML = '';
        let grandTotal = 0;
        let pendingTotal = 0;
        let pagosTotalSum = 0;

        let docsArray = [];
        snapshot.forEach(doc => docsArray.push(doc));
        docsArray.reverse();

        let activeInsExpiry = null;
        let processedDives = [];
        let billedCourses = new Set();

        docsArray.forEach(doc => {
            let data = doc.data();
            let p = window.calculateDivePrice(data);

            let isCourseCovered = false;
            let courseRate = 0;

            if (data.course) {
                let baseCourse = data.baseCourse || data.course.split(' | ')[0].trim();

                if (!billedCourses.has(baseCourse)) {
                    if (data.coursePrice !== undefined && data.coursePrice !== null) {
                        courseRate = data.coursePrice;
                    } else if (typeof dynamicPrices !== 'undefined') {
                        const found = dynamicPrices.find(dp => dp.name === baseCourse);
                        courseRate = found ? found.price : 0;
                    }
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
                // Treat custom/external texts like 'DAN Sport Bronze Pro', 'Propio', 'INC' implicitly as active policies:
                isCovered = true;
                p.insurance = 0;
            }

            if (customerInfo.discount > 0 && customerInfo.discountType !== 'fixed') {
                p.dive = p.dive * (1 - (customerInfo.discount / 100));
                if (p.course) p.course = p.course * (1 - (customerInfo.discount / 100));
            }

            p.total = p.dive + p.tasa + p.gas + p.rental + p.insurance + (p.course || 0) + (p.computer || 0) + (p.custom || 0);
            processedDives.push({ doc, data, p, cleanIns, isCovered, isCourseCovered });
        });

        processedDives.reverse();

        // Apply fixed € discount across the whole total (not per-dive)
        let fixedDiscountAmount = 0;
        if (customerInfo.discount > 0 && customerInfo.discountType === 'fixed') {
            fixedDiscountAmount = customerInfo.discount;
        }
        let positivePendingTotal = 0;
        let negativePendingTotal = 0;

        if (typeof window.fichaDisplayLimit === 'undefined') window.fichaDisplayLimit = 15;

        processedDives.forEach((item, index) => {
            const { doc, data, p, cleanIns, isCovered, isCourseCovered } = item;

            // Only sum up non-pago operational values for the overall lifetime value metric 
            if (data.type !== 'pago') grandTotal += p.total;

            const isPaid = data.paymentStatus === 'paid';
            if (!isPaid) pendingTotal += p.total;

            let breakdownHtml = '';
            if (data.type === 'producto' || data.type === 'servicio') {
                breakdownHtml = `<span class="text-slate-500 font-bold">${p.custom}€ ${data.description}</span>`;
            } else if (data.type === 'pago') {
                breakdownHtml = `<span class="text-emerald-500 font-black">${p.custom}€ Aplicado a cuenta</span>`;
            } else if (data.course) {
                let displayCourse = data.baseCourse || data.course.split(' | ')[0];
                if (!isCourseCovered) breakdownHtml += `<span class="text-pink-600 font-black">${p.course}€ ${displayCourse}</span>`;
                else breakdownHtml += `<span class="text-pink-400 font-bold">✔ Curso Incl.</span>`;
            } else {
                breakdownHtml = `<span class="text-slate-500">${p.dive}€ Inm.</span>`;
            }

            if (!data.type) {
                if (p.tasa > 0) breakdownHtml += `<span class="text-slate-300 mx-1.5">+</span><span class="text-amber-600 font-bold">${p.tasa}€ Tasa</span>`;
                const extrasTotal = p.gas + p.rental + p.insurance;
                if (extrasTotal > 0) breakdownHtml += `<span class="text-slate-300 mx-1.5">+</span><span class="text-slate-400">${extrasTotal}€ Ext.</span>`;
                if (p.computer > 0) breakdownHtml += `<span class="text-slate-300 mx-1.5">+</span><span class="text-cyan-600 font-bold">${p.computer}€ <span style="font-variant:small-caps">Comp</span></span>`;
            }

            const isNitrox = (data.gas || '').includes('EAN');
            const gasColor = isNitrox ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-50 text-blue-600 border-blue-200';
            const gasShortText = (data.gas || '15L Aire').replace('Aire', 'Air').replace(/EAN(\d+)/, '$1%');

            let rentalClass = 'bg-diagonal-yellow text-slate-300 border-yellow-200';
            let rentalText = 'Eq';
            if (data.rental === 1) { rentalClass = 'bg-half-yellow border-yellow-400 text-yellow-800'; }
            else if (data.rental === 2) { rentalClass = 'bg-full-yellow border-yellow-500 text-yellow-900'; }
            else if (data.rental === 'INC') {
                rentalClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner';
                rentalText = 'INC';
            }

            const compHistClass = data.computer ? 'bg-cyan-500 text-white border-cyan-600 font-black shadow-inner' : 'bg-slate-50 text-slate-200 border-slate-100';
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
                        <div class="w-9 h-6 flex justify-center items-center rounded border text-[9px] font-black shrink-0 whitespace-nowrap ${compHistClass}">Comp</div>
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
                                <div class="font-black text-slate-800 text-sm whitespace-nowrap shrink-0">${p.total} €</div>
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

            // --- BUILD CAJA PENDING OUTPUT ---
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
                        <div class="font-black ${data.type === 'pago' ? 'text-emerald-500' : 'text-amber-600'} text-sm">${p.total} €</div>
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

        // UPDATE CAJA LIST
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
            
            const profileCaja = customerDatabase.find(c => c.dni === dni);
            const depositCaja = profileCaja && profileCaja.deposit ? profileCaja.deposit : 0;
            
            if (pendingPagosHTML || fixedDiscountAmount > 0 || depositCaja > 0) {
                 finalCajaHTML += `
                 <tr class="bg-slate-50 border-y border-slate-100"><td colspan="2" class="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Subtotal:</td><td class="px-3 py-2 text-slate-700 text-right font-bold text-sm whitespace-nowrap">${positivePendingTotal} €</td><td></td></tr>
                 ${pendingPagosHTML}`;
                 
                 if (fixedDiscountAmount > 0) {
                    finalCajaHTML += `<tr class="bg-rose-50/50 border-t border-rose-100"><td colspan="2" class="px-3 py-1.5 text-[10px] font-black uppercase text-rose-500 tracking-widest text-right">Descuento Global:</td><td class="px-3 py-1.5 text-rose-600 text-right font-bold text-xs whitespace-nowrap">-${fixedDiscountAmount} €</td><td></td></tr>`;
                 }
                 
                 if (depositCaja > 0) {
                    finalCajaHTML += `<tr class="bg-emerald-50/50 border-t border-emerald-100"><td colspan="2" class="px-3 py-1.5 text-[10px] font-black uppercase text-emerald-600 tracking-widest text-right">Depósito a Cuenta:</td><td class="px-3 py-1.5 text-emerald-600 text-right font-bold text-xs whitespace-nowrap">-${depositCaja} €</td><td></td></tr>`;
                 }

                 const finalDebtObj = Math.max(0, positivePendingTotal + negativePendingTotal - depositCaja - fixedDiscountAmount);
                 
                 finalCajaHTML += `<tr class="bg-amber-50 border-t-2 border-amber-200"><td colspan="2" class="px-3 py-3 text-right"><span class="text-[10px] font-black uppercase text-amber-800 tracking-widest mr-4">Total a Pagar:</span></td><td class="px-3 py-3 text-lg font-black text-amber-600 text-right whitespace-nowrap w-24">${finalDebtObj} €</td><td></td></tr>
                 `;
            } else if (positivePendingTotal > 0) {
                 finalCajaHTML += `
                 <tr class="bg-amber-50 border-t-2 border-amber-200"><td colspan="2" class="px-3 py-3 text-right"><span class="text-[10px] font-black uppercase text-amber-800 tracking-widest mr-4">Total a Pagar:</span></td><td class="px-3 py-3 text-lg font-black text-amber-600 text-right whitespace-nowrap w-24">${positivePendingTotal} €</td><td></td></tr>
                 `;
            }

            if (!finalCajaHTML) {
                finalCajaHTML = `<tr><td colspan="4" class="p-8 text-center"><div class="text-3xl mb-2">🎉</div><div class="text-sm font-bold text-slate-400">Sin cargos pendientes</div></td></tr>`;
            }
            cajaListEl.innerHTML = finalCajaHTML;
            document.getElementById('caja-pending-count').innerText = `${totalPendingCount} items`;
        }

        // --- NEW DYNAMIC MATH FOOTER ---
        const profile = customerDatabase.find(c => c.dni === dni);
        const deposit = profile && profile.deposit ? profile.deposit : 0;
        let totalAPagar = Math.max(0, pendingTotal - deposit - fixedDiscountAmount);

        if (pendingTotal > 0 || deposit > 0) {
            html += `
            <tr class="bg-slate-50/80 border-t-2 border-slate-200">
                <td colspan="4" class="py-2 px-3 text-right font-black text-slate-500 uppercase tracking-widest text-[9px] align-middle">Deuda Pendiente</td>
                <td class="py-2 px-3 text-right font-black text-slate-700 text-sm align-middle">${pendingTotal} €</td>
                <td></td>
            </tr>`;

            if (deposit > 0) {
                html += `
                <tr class="bg-emerald-50/50 border-t border-emerald-100">
                    <td colspan="4" class="py-2 px-3 text-right font-black text-emerald-600 uppercase tracking-widest text-[9px] align-middle">Depósito</td>
                    <td class="py-2 px-3 text-right font-black text-emerald-600 text-sm align-middle">- ${deposit} €</td>
                    <td></td>
                </tr>`;
            }

            html += `
            <tr class="${totalAPagar <= 0 && pendingTotal > 0 ? 'bg-emerald-100' : 'bg-amber-50'} border-t ${totalAPagar <= 0 && pendingTotal > 0 ? 'border-emerald-200' : 'border-amber-200'}">
                <td colspan="4" class="py-3 px-3 text-right font-black ${totalAPagar <= 0 && pendingTotal > 0 ? 'text-emerald-700' : 'text-amber-700'} uppercase tracking-widest text-[11px] align-middle">A Pagar Hoy</td>
                <td class="py-3 px-3 text-right font-black ${totalAPagar <= 0 && pendingTotal > 0 ? 'text-emerald-600' : 'text-amber-600'} text-xl align-middle">${totalAPagar <= 0 ? '0' : totalAPagar} €</td>
                <td></td>
            </tr>`;
        } else if (grandTotal > 0) {
            html += `
            <tr class="bg-slate-50 border-t-2 border-slate-200">
                <td colspan="4" class="py-3 px-3 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px] align-middle">Total Historial (Pagado)</td>
                <td class="py-3 px-3 text-right font-black text-slate-400 text-lg align-middle">${grandTotal} €</td>
                <td></td>
            </tr>`;
        }

        if (processedDives.length > window.fichaDisplayLimit) {
            const moreBtn = `
            <tr>
                <td colspan="6" class="p-6 text-center">
                    <button onclick="window.fichaDisplayLimit += 15; window.openCustomerProfile(window.activeFichaDni, document.getElementById('profile-modal-name').innerText, true);" class="px-6 py-2.5 bg-slate-50 border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200 font-black text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 mx-auto">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        Cargar Más (${processedDives.length - window.fichaDisplayLimit} ocultos)
                    </button>
                </td>
            </tr>`;
            html += moreBtn;
            if (pagosHtml) pagosHtml += moreBtn;
        }

        document.getElementById('profile-history-list').innerHTML = html;
        
        if (pagosTotalSum > 0) {
            const headerSumHtml = `
            <tr class="bg-emerald-50 border-b-2 border-emerald-200 sticky top-0 z-10 shadow-sm">
                <td colspan="3" class="py-4 px-3 text-right font-black text-emerald-700 uppercase tracking-widest text-[11px] align-middle">Total Historial (Pagos Realizados)</td>
                <td class="py-4 px-3 text-right font-black text-emerald-600 text-lg align-middle">-${pagosTotalSum} €</td>
                <td></td>
            </tr>`;
            pagosHtml = headerSumHtml + pagosHtml;
        }
        
        document.getElementById('profile-pagos-list').innerHTML = pagosHtml || '<tr><td colspan="5" class="p-8 text-center text-slate-500 italic">No hay pagos registrados.</td></tr>';
        if (document.getElementById('ficha-tab-dives') && document.getElementById('ficha-tab-dives').innerText === '---') {
            document.getElementById('ficha-tab-dives').innerText = processedDives.length + ' (Historial)';
        }

        const elDeuda = document.getElementById('ficha-caja-deuda');
        if (elDeuda) {
            elDeuda.innerText = `${pendingTotal} €`;
            document.getElementById('ficha-caja-senal').innerText = `- ${deposit} €`;

            // Restore discount type toggle UI — use global state to avoid loop
            const discType = customerInfo.discountType || 'percent';
            window.activeDiscountType = discType;
            const discVal = customerInfo.discount || 0;
            document.getElementById('ficha-caja-discount').value = discVal;
            // Only update the button visuals, do NOT call setDiscountType (avoids recursion)
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
                totalEl.innerText = "0 €";
                totalEl.className = "text-3xl font-black text-slate-300 tracking-tighter";
                btnLiq.classList.add('opacity-50', 'pointer-events-none');
            } else if (totalAPagar <= 0 && pendingTotal > 0) {
                totalEl.innerText = "0 € (Pagado)";
                totalEl.className = "text-3xl font-black text-emerald-500 tracking-tighter";
                btnLiq.classList.remove('opacity-50', 'pointer-events-none');
            } else {
                totalEl.innerText = `${totalAPagar} €`;
                totalEl.className = "text-3xl font-black text-amber-600 tracking-tighter";
                btnLiq.classList.remove('opacity-50', 'pointer-events-none');
            }

            window.activeFichaPendingDocs = processedDives.filter(d => d.data.paymentStatus === 'pending').map(d => d.doc.id);
            window.activeFichaDives = processedDives;
        }

        switchFichaTab(targetTab);
    } catch (e) {
        console.error(e);
        document.getElementById('profile-history-list').innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Error de red al cargar el historial.</td></tr>';
        switchFichaTab(targetTab);
    }
};

// Handles switching tabs in the Today's Divers view
window.activeJointSelection = [];
window.currentTodayDiversData = []; // Cache of natural order
window.todaySortMode = 'asc'; // 'asc', 'desc'

window.toggleTodaySort = function () {
    window.todaySortMode = window.todaySortMode === 'asc' ? 'desc' : 'asc';

    const btn = document.getElementById('btn-today-sort');
    btn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${window.todaySortMode === 'asc' ? 'M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12' : 'M3 4h13M3 8h9m-9 4h6m4 4l4 4m0 0l4-4m-4 4V4'}"></path></svg> Sort: ${window.todaySortMode === 'asc' ? 'A-Z' : 'Z-A'}`;

    // Refresh the currently active tab
    const activeTab = document.getElementById('tab-primary-global').classList.contains('bg-white') ? 'global' : 'today';
    switchTodayTab(activeTab);
};

window.todayFilterMode = 'pending';

window.certsFilterMode = 'pendiente';
window.certsSearchQuery = '';
window.certsCourseFilter = '';
window.lastFetchedCerts = null;
window.lastFetchedCertsMode = null;
window.setTodayFilter = function (mode) {
    window.todayFilterMode = mode;
    const btnPending = document.getElementById('sub-filter-pending');
    const btnPaid = document.getElementById('sub-filter-paid');

    if (mode === 'pending') {
        btnPending.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-amber-200 bg-amber-50 text-amber-700 tracking-wider shadow-sm transition-all";
        btnPaid.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-emerald-600 transition-all tracking-wider";
    } else {
        btnPaid.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 tracking-wider shadow-sm transition-all";
        btnPending.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-amber-600 transition-all tracking-wider";
    }

    switchTodayTab('today');
};

window.setCertsFilter = function (mode) {
    window.certsFilterMode = mode;
    const btnPending = document.getElementById('sub-filter-certs-pending');
    const btnProcessed = document.getElementById('sub-filter-certs-processed');

    if (mode === 'pendiente') {
        if (btnPending) btnPending.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-pink-200 bg-pink-50 text-pink-700 tracking-wider shadow-sm transition-all";
        if (btnProcessed) btnProcessed.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-emerald-600 transition-all tracking-wider";
    } else {
        if (btnProcessed) btnProcessed.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 tracking-wider shadow-sm transition-all";
        if (btnPending) btnPending.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-pink-600 transition-all tracking-wider";
    }

    window.certsSearchQuery = '';
    window.certsCourseFilter = '';
    renderTodayCerts(true);
};

window.switchTodayTab = async function (tabId) {
    const btnToday = document.getElementById('tab-primary-today');
    const btnGlobal = document.getElementById('tab-primary-global');
    const listEl = document.getElementById('today-divers-list');
    const subnav = document.getElementById('subnav-today');
    const subnavCerts = document.getElementById('subnav-certs');

    // Default inactive states
    btnToday.className = 'px-4 py-1.5 text-xs font-bold rounded-md text-slate-500 hover:text-slate-800 transition-all';
    btnGlobal.className = 'px-4 py-1.5 text-xs font-bold rounded-md text-slate-500 hover:text-slate-800 transition-all flex items-center gap-1.5';
    btnGlobal.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500"></span> Todos los Clientes`;
    const btnCerts = document.getElementById('tab-primary-certs');
    if (btnCerts) btnCerts.className = 'px-4 py-1.5 text-xs font-bold rounded-md text-slate-500 hover:text-slate-800 transition-all flex items-center gap-1.5';

    // UI Switch
    if (tabId === 'today') {
        btnToday.className = 'px-4 py-1.5 text-xs font-bold rounded-md bg-white text-slate-800 shadow-sm transition-all';
        if (subnav) subnav.classList.remove('hidden');
        if (subnavCerts) subnavCerts.classList.add('hidden');

        // Fetch and show local boat divers
        if (currentTodayDiversData.length === 0) {
            listEl.innerHTML = '<div class="p-6 text-center text-slate-500 italic text-sm">No hay clientes registrados en los barcos de hoy.</div>';
        } else {
            listEl.innerHTML = '<div class="p-10 text-center text-slate-500 font-bold flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-blue-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Analizando perfiles...</div>';

            try {
                const pendingDnis = currentTodayDiversData.map(d => d.dni);
                let pendingHtml = '';
                let visibleCount = 0;
                let visibleDebt = 0;
                let debtors = [];

                if (pendingDnis.length > 0) {
                    const historyPromises = pendingDnis.map(dni => db.collection('mangamar_customers').doc(dni).collection('history').get());
                    const histories = await Promise.all(historyPromises);

                    histories.forEach((histSnap, index) => {
                        const dni = pendingDnis[index];
                        const c = customerDatabase.find(cust => cust.dni === dni);
                        const nombre = c ? getFullName(c) : 'Cliente ' + dni;

                        let debt = 0;
                        let divesList = [];

                        let docsArray = [];
                        histSnap.forEach(doc => docsArray.push(doc));
                        docsArray.sort((a, b) => {
                            const dateA = a.data().date + ' ' + (a.data().time || '00:00');
                            const dateB = b.data().date + ' ' + (b.data().time || '00:00');
                            return dateA.localeCompare(dateB);
                        });

                        let activeInsExpiry = null;
                        let billedCourses = new Set();

                        docsArray.forEach(doc => {
                            let data = doc.data();
                            let p = calculateDivePrice(data);

                            if (data.course) {
                                let baseCourse = data.baseCourse || data.course.split(' | ')[0].trim();
                                if (!billedCourses.has(baseCourse)) {
                                    p.course = data.coursePrice !== undefined ? data.coursePrice : ((window.PRICES && window.PRICES[baseCourse]) ? window.PRICES[baseCourse] : 0);
                                    billedCourses.add(baseCourse);
                                } else { p.course = 0; }
                                p.dive = 0; p.tasa = 0;
                                if (data.rental === 'INC') p.rental = 0;
                                if (data.insurance === 'INC') p.insurance = 0;
                            }

                            let cleanIns = (data.insurance || 0).toString().replace(' ✔', '');
                            if (['1D', '1W', '1M', '1Y'].includes(cleanIns)) {
                                if (activeInsExpiry && data.date <= activeInsExpiry) { p.insurance = 0; }
                                else {
                                    let [y, m, d] = data.date.split('-').map(Number);
                                    let dateObj = new Date(y, m - 1, d);
                                    if (cleanIns === '1D') dateObj.setDate(dateObj.getDate() + 0);
                                    if (cleanIns === '1W') dateObj.setDate(dateObj.getDate() + 6);
                                    if (cleanIns === '1M') dateObj.setMonth(dateObj.getMonth() + 1);
                                    if (cleanIns === '1Y') dateObj.setFullYear(dateObj.getFullYear() + 1);
                                    activeInsExpiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                                }
                            } else if (cleanIns === 'Propio' || cleanIns === 'INC') { p.insurance = 0; }

                            p.total = p.dive + p.tasa + p.gas + p.rental + p.insurance + (p.course || 0) + (p.computer || 0) + (p.custom || 0);

                            if (data.paymentStatus === 'pending') {
                                debt += p.total;
                                if (data.assignedBoat) {
                                    divesList.push(`${data.date.substring(5)} ${data.assignedBoat.charAt(0).toUpperCase() + data.assignedBoat.slice(1)}`);
                                }
                            }
                        });

                        const deposit = c && c.deposit ? c.deposit : 0;
                        const finalDebt = Math.max(0, debt - deposit);
                        const isClean = finalDebt === 0;

                        let shouldShow = false;
                        if (window.todayFilterMode === 'paid') {
                            shouldShow = isClean;
                        } else {
                            shouldShow = !isClean; // Everyone who hasn't fully paid for today and cleared all debt
                        }

                        if (shouldShow) {
                            visibleCount++;
                            visibleDebt += finalDebt;
                            debtors.push({ dni, nombre, debt: finalDebt, isClean: isClean });
                        }
                    });
                }

                debtors.sort((a, b) => window.todaySortMode === 'asc' ? a.nombre.localeCompare(b.nombre) : b.nombre.localeCompare(a.nombre));

                debtors.forEach(d => {
                    let isSel = window.activeJointSelection && window.activeJointSelection.find(x => x.dni === d.dni);

                    let avatarHtml = `<div class="w-6 h-6 mx-auto rounded-full bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center opacity-50"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg></div>`;
                    if (!d.isClean) {
                        avatarHtml = isSel ?
                            `<div class="w-6 h-6 mx-auto rounded-full bg-blue-500 text-white flex items-center justify-center transition-colors shadow-inner cursor-pointer" onclick="toggleDiverJointSelection(this, '${d.dni}', '${d.nombre.replace(/'/g, "\\'")}', '${d.debt}')"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>` :
                            `<div class="w-6 h-6 mx-auto rounded-full bg-slate-100 text-slate-400 border border-slate-200 group hover:border-blue-300 hover:bg-blue-50 hover:text-blue-500 flex items-center justify-center transition-all shadow-inner cursor-pointer" onclick="toggleDiverJointSelection(this, '${d.dni}', '${d.nombre.replace(/'/g, "\\'")}', '${d.debt}')"><svg class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg></div>`;
                    }

                    pendingHtml += `
                    <div class="flex justify-between items-center p-3 border-b border-slate-100 transition-colors group relative hover:bg-slate-50 ${d.isClean ? 'opacity-60' : ''}">
                        <div class="flex items-center gap-3 flex-1">
                            ${avatarHtml}
                            <div class="cursor-pointer flex-1" onclick="openCustomerProfile('${d.dni}', '${d.nombre.replace(/'/g, "\\'")}')">
                                <div class="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">${d.nombre} <span class="text-xs text-slate-500 font-mono ml-2 font-normal">${d.dni}</span></div>
                            </div>
                        </div>
                        <div class="flex items-center gap-4 text-right">
                            <div class="text-lg font-black ${d.isClean ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-slate-800'} cursor-pointer" onclick="openCustomerProfile('${d.dni}', '${d.nombre.replace(/'/g, "\\'")}')">${d.isClean ? 'Liquidado' : d.debt + ' €'}</div>
                        </div>
                    </div>`;
                });

                if (pendingHtml === '') {
                    listEl.innerHTML = `<div class="p-10 text-center text-slate-400 font-bold italic">${window.todayFilterMode === 'paid' ? 'No hay clientes cobrados aún hoy.' : '¡Todos los clientes de hoy han pagado! o el barco está vacío.'}</div>`;
                } else {
                    listEl.innerHTML = `
                        <div class="bg-slate-800 text-white p-4 flex justify-between items-center sticky top-0 z-10 shadow-md">
                            <span class="text-xs font-black uppercase tracking-widest text-slate-400">Total ${window.todayFilterMode === 'paid' ? 'Cobrado' : 'Pendiente'} (Hoy):</span>
                            <span class="text-xl font-black ${window.todayFilterMode === 'paid' ? 'text-emerald-400' : 'text-blue-400'}">${window.todayFilterMode === 'paid' ? visibleCount + ' Clientes' : visibleDebt + ' €'}</span>
                        </div>
                        ${pendingHtml}
                    `;
                }
            } catch (e) {
                console.error("FIREBASE ERROR:", e);
                listEl.innerHTML = '<div class="p-8 text-center text-red-500 font-bold">Error de red al cargar perfiles.</div>';
            }
        }
    } else if (tabId === 'global') {
        btnGlobal.className = 'px-4 py-1.5 text-xs font-bold rounded-md bg-white text-slate-800 shadow-sm transition-all flex items-center gap-1.5 ring-1 ring-amber-200';
        if (subnav) subnav.classList.add('hidden');
        if (subnavCerts) subnavCerts.classList.add('hidden');

        listEl.innerHTML = '<div class="p-10 text-center text-slate-500 font-bold flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-amber-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Buscando deudas globales...</div>';

        try {
            // 1. Identify everyone who owes money
            const snap = await db.collectionGroup('history').where('paymentStatus', '==', 'pending').get();
            const pendingDnis = [...new Set(snap.docs.map(doc => doc.ref.parent.parent.id))];

            let pendingHtml = '';
            let totalPendingDebt = 0;
            let debtors = [];

            if (pendingDnis.length > 0) {
                // 2. Fetch full history ONLY for the people who owe money
                // This guarantees the math matches their Ficha perfectly without scanning the whole DB.
                const historyPromises = pendingDnis.map(dni => db.collection('mangamar_customers').doc(dni).collection('history').get());
                const histories = await Promise.all(historyPromises);

                histories.forEach((histSnap, index) => {
                    const dni = pendingDnis[index];
                    const c = customerDatabase.find(cust => cust.dni === dni);
                    const nombre = c ? getFullName(c) : 'Cliente ' + dni;

                    let debt = 0;
                    let divesList = [];

                    // Sort history oldest to newest to run the engine
                    let docsArray = [];
                    histSnap.forEach(doc => docsArray.push(doc));
                    docsArray.sort((a, b) => {
                        const dateA = a.data().date + ' ' + (a.data().time || '00:00');
                        const dateB = b.data().date + ' ' + (b.data().time || '00:00');
                        return dateA.localeCompare(dateB);
                    });

                    let activeInsExpiry = null;
                    let billedCourses = new Set();

                    docsArray.forEach(doc => {
                        let data = doc.data();
                        let p = calculateDivePrice(data);

                        // Engine 1: Course Deduplication
                        if (data.course) {
                            let baseCourse = data.baseCourse || data.course.split(' | ')[0].trim();
                            if (!billedCourses.has(baseCourse)) {
                                p.course = data.coursePrice !== undefined ? data.coursePrice : ((window.PRICES && window.PRICES[baseCourse]) ? window.PRICES[baseCourse] : 0);
                                billedCourses.add(baseCourse);
                            } else {
                                p.course = 0;
                            }
                            p.dive = 0;
                            p.tasa = 0;
                            if (data.rental === 'INC') p.rental = 0;
                            if (data.insurance === 'INC') p.insurance = 0;
                        }

                        // Engine 2: Insurance Deduplication
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
                        } else if (cleanIns === 'Propio' || cleanIns === 'INC') {
                            p.insurance = 0;
                        }

                        p.total = p.dive + p.tasa + p.gas + p.rental + p.insurance + (p.course || 0) + (p.computer || 0) + (p.custom || 0);

                        // 3. Only add it to their total debt if this specific dive is unpaid
                        if (data.paymentStatus === 'pending') {
                            debt += p.total;
                            if (data.assignedBoat) {
                                divesList.push(`${data.date.substring(5)} ${data.assignedBoat.charAt(0).toUpperCase() + data.assignedBoat.slice(1)}`);
                            }
                        }
                    });

                    if (debt > 0) {
                        const deposit = c && c.deposit ? c.deposit : 0;
                        const finalDebt = Math.max(0, debt - deposit);
                        if (finalDebt > 0) {
                            totalPendingDebt += finalDebt;
                            debtors.push({ dni, nombre, debt: finalDebt, divesList });
                        }
                    }
                });
            }

            debtors.sort((a, b) => window.todaySortMode === 'asc' ? a.nombre.localeCompare(b.nombre) : b.nombre.localeCompare(a.nombre));

            debtors.forEach(d => {
                const divesStr = d.divesList.join(' • ');
                let isSel = window.activeJointSelection && window.activeJointSelection.find(x => x.dni === d.dni);
                let avatarHtml = isSel ?
                    `<div class="w-6 h-6 mx-auto rounded-full bg-blue-500 text-white flex items-center justify-center transition-colors shadow-inner cursor-pointer" onclick="toggleDiverJointSelection(this, '${d.dni}', '${d.nombre.replace(/'/g, "\\'")}', '${d.debt}')"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>` :
                    `<div class="w-6 h-6 mx-auto rounded-full bg-slate-100 text-slate-400 border border-slate-200 group hover:border-blue-300 hover:bg-blue-50 hover:text-blue-500 flex items-center justify-center transition-all shadow-inner cursor-pointer" onclick="toggleDiverJointSelection(this, '${d.dni}', '${d.nombre.replace(/'/g, "\\'")}', '${d.debt}')"><svg class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg></div>`;

                pendingHtml += `
                <div class="flex justify-between items-center p-3 border-b border-slate-100 transition-colors group relative hover:bg-amber-50">
                    <div class="flex items-center gap-3 flex-1">
                        ${avatarHtml}
                        <div class="cursor-pointer flex-1" onclick="openCustomerProfile('${d.dni}', '${d.nombre.replace(/'/g, "\\'")}')">
                            <div class="font-bold text-slate-800 text-sm group-hover:text-amber-600 transition-colors">${d.nombre} <span class="text-xs text-slate-500 font-mono ml-2 font-normal">${d.dni}</span></div>
                        </div>
                    </div>
                    <div class="flex items-center gap-4 text-right">
                        <div class="text-lg font-black text-slate-800 cursor-pointer" onclick="openCustomerProfile('${d.dni}', '${d.nombre.replace(/'/g, "\\'")}')">${d.debt} €</div>
                    </div>
                </div>`;
            });

            if (pendingHtml === '') {
                listEl.innerHTML = '<div class="p-10 text-center text-emerald-600 font-black"><div class="text-4xl mb-2">🎉</div>¡Cero deudas!<br><span class="text-sm font-medium text-slate-500">Ningún cliente en la base de datos tiene cobros pendientes.</span></div>';
            } else {
                listEl.innerHTML = `
                    <div class="bg-slate-800 text-white p-4 flex justify-between items-center sticky top-0 z-10 shadow-md">
                        <span class="text-xs font-black uppercase tracking-widest text-slate-400">Total Global Pendiente:</span>
                        <span class="text-xl font-black text-amber-400">${totalPendingDebt} €</span>
                    </div>
                    ${pendingHtml}
                `;
            }
        } catch (e) {
            console.error("FIREBASE ERROR:", e);
            listEl.innerHTML = `<div class="p-8 text-center text-red-600">
                <svg class="w-12 h-12 mx-auto mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                <div class="font-black text-lg">Error de Carga / Índice</div>
                <div class="text-sm font-medium text-slate-500 mt-2">No se pudieron cargar las deudas globales. Si es la primera vez, comprueba la consola (F12) por si falta un índice.</div>
            </div>`;
        }
    } else if (tabId === 'certs') {
        const bCert = document.getElementById('tab-primary-certs');
        if (bCert) bCert.className = 'px-4 py-1.5 text-xs font-bold rounded-md bg-white text-slate-800 shadow-sm transition-all';
        if (subnav) subnav.classList.add('hidden');
        if (subnavCerts) subnavCerts.classList.remove('hidden');
        renderTodayCerts();
    }
};

window.renderTodayCerts = async function (forceFetch = false) {
    const listEl = document.getElementById('today-divers-list');

    // 1. Fetching Logic
    if (forceFetch || window.lastFetchedCertsMode !== window.certsFilterMode || window.lastFetchedCerts === null) {
        listEl.innerHTML = '<div class="p-10 text-center text-slate-500 font-bold flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-pink-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Escaneando base de datos (' + window.certsFilterMode + ')...</div>';

        try {
            let snap;
            if (window.certsFilterMode === 'pendiente') {
                snap = await db.collectionGroup('history').where('certStatus', '==', 'pendiente').get();
            } else {
                snap = await db.collectionGroup('history').where('certStatus', '==', 'procesado').orderBy('processedAt', 'desc').limit(150).get();
            }

            let tempCertsMap = new Map();
            snap.forEach(doc => {
                const data = doc.data();
                const dni = doc.ref.parent.parent.id;
                const c = customerDatabase.find(x => x.dni === dni);
                const nombre = c ? getFullName(c) : 'Cliente ' + dni;

                let rawCourse = data.course || data.baseCourse || 'Curso Desconocido';
                let cleanCourse = rawCourse.split(' | ')[0].trim();
                let uniqKey = dni + '_' + cleanCourse;

                if (!tempCertsMap.has(uniqKey)) {
                    tempCertsMap.set(uniqKey, {
                        dni, nombre,
                        date: data.date,
                        course: cleanCourse
                    });
                }
            });

            let certs = Array.from(tempCertsMap.values());

            // Fallback sorting: Newest primary date bounds
            certs.sort((a, b) => b.date.localeCompare(a.date));
            window.lastFetchedCerts = certs;
            window.lastFetchedCertsMode = window.certsFilterMode;
        } catch (e) {
            console.error("CERT_QUERY_ERROR", e);
            listEl.innerHTML = `<div class="p-8 text-center text-red-600"><div class="font-black text-lg">Error de Índice Firebase</div><div class="text-xs mt-2 text-slate-500 font-bold break-all">${e.message}</div></div>`;
            return;
        }
    }

    // 2. Local Filtering
    let filteredCerts = window.lastFetchedCerts.filter(item => {
        let matchSearch = true;
        let matchCourse = true;

        if (window.certsSearchQuery) {
            const q = window.certsSearchQuery.toLowerCase();
            matchSearch = item.nombre.toLowerCase().includes(q) || item.dni.toLowerCase().includes(q);
        }
        if (window.certsCourseFilter) {
            matchCourse = item.course.toLowerCase().includes(window.certsCourseFilter.toLowerCase());
        }
        return matchSearch && matchCourse;
    });

    // 3. Render HTML
    let coursesList = [...new Set(window.lastFetchedCerts.map(c => c.course))];
    let courseOptions = coursesList.map(c => `<option value="${c}" ${window.certsCourseFilter === c ? 'selected' : ''}>${c}</option>`).join('');

    let html = `
        <div class="p-3 bg-slate-50 border-b border-slate-200 flex gap-2 w-full sticky top-0 z-10">
             <input type="text" placeholder="Buscar por DNI o Nombre..." class="flex-1 px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500 shadow-sm" value="${window.certsSearchQuery}" oninput="window.certsSearchQuery=this.value; renderTodayCerts()">
             <select class="px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500 shadow-sm bg-white" onchange="window.certsCourseFilter=this.value; renderTodayCerts()">
                 <option value="">Cualquier Curso</option>
                 ${courseOptions}
             </select>
        </div>
        <div class="divide-y divide-slate-100 flex-1">
    `;

    if (filteredCerts.length === 0) {
        html += `<div class="p-10 text-center text-slate-400 font-bold italic">${window.certsFilterMode === 'pendiente' ? 'No hay certificaciones pendientes. 🎉' : 'No se encontraron registros.'}</div></div>`;
        listEl.innerHTML = html;
        return;
    }

    filteredCerts.forEach(item => {
        let actionBtn = '';
        if (window.certsFilterMode === 'pendiente') {
            actionBtn = `
            <button onclick="toggleCertStatus('${item.dni}', '${item.course.replace(/'/g, "\\'")}', '${item.nombre.replace(/'/g, "\\'")}', 'procesado')" class="px-3 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl text-xs font-black transition-all border border-amber-100 shadow-sm flex items-center gap-1.5 focus:scale-95">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Pendiente
            </button>`;
        } else {
            actionBtn = `
            <button onclick="toggleCertStatus('${item.dni}', '${item.course.replace(/'/g, "\\'")}', '${item.nombre.replace(/'/g, "\\'")}', 'pendiente')" class="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-black transition-all border border-emerald-100 shadow-sm flex items-center gap-1.5 focus:scale-95">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Procesado
            </button>`;
        }

        html += `
        <div class="flex justify-between items-center p-4 hover:bg-pink-50 transition-colors group">
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-xs font-black bg-pink-100 text-pink-700 px-2 py-0.5 rounded uppercase tracking-wider">${item.course}</span>
                    <span class="text-[10px] font-bold text-slate-400 font-mono">${item.date}</span>
                </div>
                <div class="font-black text-slate-800 group-hover:text-pink-600 transition-colors cursor-pointer" onclick="openCustomerProfile('${item.dni}', '${item.nombre.replace(/'/g, "\\'")}')">
                    ${item.nombre} <span class="text-xs text-slate-400 font-normal ml-1">${item.dni}</span>
                </div>
            </div>
            ${actionBtn}
        </div>`;
    });

    html += '</div>';
    listEl.innerHTML = html;
};

window.toggleCertStatus = async function (dni, cleanCourseName, studentName, newStatus) {
    try {
        const snap = await db.collection('mangamar_customers').doc(dni).collection('history').get();
        let batch = db.batch();
        let updateCount = 0;

        snap.forEach(doc => {
            let data = doc.data();
            let docCourse = data.course || data.baseCourse || '';
            let docCleanCourse = docCourse.split(' | ')[0].trim();
            const oldStatus = newStatus === 'procesado' ? 'pendiente' : 'procesado';

            if (docCleanCourse === cleanCourseName && data.certStatus === oldStatus) {
                let updateData = { certStatus: newStatus };
                if (newStatus === 'procesado') {
                    updateData.processedAt = firebase.firestore.FieldValue.serverTimestamp();
                }
                batch.update(doc.ref, updateData);
                updateCount++;
            }
        });

        if (updateCount > 0) {
            await batch.commit();
            showToast(`Certificación de ${studentName} marcada como ${newStatus}.`);
            renderTodayCerts(true);
        } else {
            console.warn("No data matched to update certStatus.");
        }
    } catch (e) {
        console.error(e);
        showAppAlert("Error al actualizar certificación.");
    }
};

window.openTodayDiversModal = function (isNavBackForward = false) {
    if (typeof isNavBackForward !== 'boolean') isNavBackForward = false;
    recordModalHistory({ type: 'today', isNavBackForward });

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const targetDateStr = `${year}-${month}-${day}`;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    let prettyDate = currentDate.toLocaleDateString('es-ES', options);

    // Writes the date into the new top-pinned Header
    document.getElementById('today-modal-date-display').innerText = prettyDate.charAt(0).toUpperCase() + prettyDate.slice(1);

    const todaysTrips = mergedAllocations.filter(t => t.date === targetDateStr);
    let uniqueDivers = new Map();
    todaysTrips.forEach(t => {
        // Collect all guests from the flat array OR the grouped array
        const allGuests = [];
        if (t.guests) allGuests.push(...t.guests);
        if (t.groups) t.groups.forEach(g => { if (g.guests) allGuests.push(...g.guests) });

        allGuests.forEach(g => {
            if (g.dni) {
                if (!uniqueDivers.has(g.dni)) uniqueDivers.set(g.dni, { nombre: g.nombre, dni: g.dni, boats: [], hasBono: false });
                uniqueDivers.get(g.dni).boats.push(`${t.time} ${(t.assignedBoat || 'Sin Barco').toUpperCase()}`);
                // If they are marked as using a bono on ANY boat today, tag them
                if (g.hasBono) uniqueDivers.get(g.dni).hasBono = true;
            }
        });
    });

    window.currentTodayDiversData = Array.from(uniqueDivers.values());
    switchTodayTab('today');

    document.getElementById('today-divers-modal').classList.remove('hidden');
    document.getElementById('global-diver-search').value = '';
    document.getElementById('global-search-results').innerHTML = '';
    setTimeout(() => document.getElementById('global-diver-search').focus(), 100);
};

// Jumps from a Customer's History directly to the Boat Manifest
window.openBoatFromHistory = function (e, dateStr, time, assignedBoat) {
    // Prevent the row click if the user was just clicking the "Pagado" or "Delete" buttons
    if (e && e.target.closest('button')) return;

    // Find the actual boat trip in the active memory
    const trip = mergedAllocations.find(t => t.date === dateStr && t.time === time && t.assignedBoat === assignedBoat);

    // Hide the Customer Profile modal
    document.getElementById('customer-profile-modal').classList.add('hidden');

    // Open the Manifest Editor
    if (typeof openManageBoatModal === 'function') {
        openManageBoatModal(trip, assignedBoat, time, dateStr);
    } else {
        console.error("Manifest editor not linked properly.");
    }
};

window.updateGuestDeposit = async function (dni, amount, groupIndex, guestIndex) {
    const val = parseFloat(amount) || 0;

    if (!dni || String(dni) === 'undefined') {
        if (typeof activeBoatItem !== 'undefined' && activeBoatItem.groups[groupIndex] && activeBoatItem.groups[groupIndex].guests[guestIndex]) {
            activeBoatItem.groups[groupIndex].guests[guestIndex].localDeposit = val;
            if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
            showToast("Anticipo guardado solo para este barco.");
        }
        return;
    }

    const custIndex = customerDatabase.findIndex(c => c.dni === dni);
    if (custIndex !== -1) {
        customerDatabase[custIndex].deposit = val;
        try {
            // Saves the deposit to their master profile so it shows up on all boats!
            await db.collection("mangamar_directory").doc("master_list").update({ clients: customerDatabase });
            renderGroups();
        } catch (e) {
            console.error(e);
            showAppAlert("Error al guardar el depósito");
        }
    }
};

window.addCustomCajaConcept = async function() {
    const typeStr = document.getElementById('caja-new-type').value;
    const desc = document.getElementById('caja-new-desc').value.trim();
    const priceStr = document.getElementById('caja-new-price').value;
    const price = parseFloat(priceStr);

    if (!desc) { showAppAlert("La descripción es obligatoria."); return; }
    if (isNaN(price) || price < 0) { showAppAlert("Introduce un precio válido."); return; }

    const btn = event.currentTarget || event.target;
    if (!btn) return;
    
    const origHtml = btn.innerHTML;
    btn.innerHTML = `<svg class="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Añadiendo...`;
    btn.disabled = true;

    try {
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        await db.collection('mangamar_customers').doc(window.activeFichaDni).collection('history').add({
            type: typeStr,
            description: desc,
            customPrice: price,
            paymentStatus: 'pending',
            date: dateStr,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('caja-new-desc').value = '';
        document.getElementById('caja-new-price').value = '';
        showToast(`✅ ${typeStr === 'producto' ? 'Producto' : 'Servicio'} añadido a la cuenta.`);
        
        // Re-render
        if (window.activeFichaDni) {
            const currentName = document.getElementById('profile-modal-name').innerText;
            openCustomerProfile(window.activeFichaDni, currentName, false, 'caja');
        }
    } catch (e) {
        console.error(e);
        showAppAlert("Error al añadir concepto.");
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
};

window.liquidarCuenta = async function () {
    const dni = window.activeFichaDni;
    const pendingDocs = window.activeFichaPendingDocs || [];

    if (pendingDocs.length === 0) return;

    const totalElText = document.getElementById('ficha-caja-total').innerText.replace(' €', '');
    const totalDebt = parseFloat(totalElText) || 0;

    window.promptPaymentGateway(dni, totalDebt, pendingDocs, 'bulk');
};

window.generateFactura = function (targetDocId = null) {
    window.currentFacturaType = 'individual';
    const dni = window.activeFichaDni;
    if (!dni || !window.activeFichaDives) return;

    let pendingDives = [];
    if (targetDocId) {
        pendingDives = window.activeFichaDives.filter(item => item.doc.id === targetDocId);
    } else {
        pendingDives = window.activeFichaDives.filter(item => item.data.paymentStatus === 'pending');
    }

    if (pendingDives.length === 0) {
        showToast("No hay datos para construir el resumen.", "error");
        return;
    }

    const profile = customerDatabase.find(c => c.dni === dni) || { discount: 0 };
    const nombre = profile && profile.nombre ? getFullName(profile) : 'Cliente ' + dni;

    if (!window.originalAppTitle) window.originalAppTitle = document.title;

    // Format timestamp as dd/mm/yyyy and convert spaces in the name to underscores
    const safeName = nombre.replace(/\s+/g, '_');
    const safeDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.title = `Resumen_Cuenta_${safeName}_${safeDate}`;

    document.getElementById('factura-cx-name').innerText = nombre;
    document.getElementById('factura-cx-dni').innerText = dni;
    document.getElementById('factura-date').innerText = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    let itemsMap = {};
    let exentoMap = {};
    let totalBase21 = 0;
    let totalIva21 = 0;
    let totalExento = 0;
    let totalFactura = 0;
    let totalPago = 0;

    function addFacturaItem(map, name, price) {
        if (price <= 0) return;
        const key = name + '_' + price;
        if (!map[key]) {
            map[key] = { name, price, qty: 0 };
        }
        map[key].qty++;
    }

    pendingDives.forEach(item => {
        const p = item.p;

        if (item.data.type === 'pago') {
            totalPago += Math.abs(parseFloat(p.custom) || 0);
            return;
        }

        if (item.data.type === 'producto' || item.data.type === 'servicio') {
            const prefix = item.data.type === 'producto' ? 'Producto: ' : 'Servicio: ';
            addFacturaItem(itemsMap, prefix + item.data.description, p.custom);
            return;
        }

        let diveName = 'Inmersión';
        if (['Cala', 'Shore', 'Aula'].includes(item.data.site)) diveName = 'Inmersión (Cala/Costa)';
        else if (item.data.site === 'Naranjito') diveName = 'Inmersión (Naranjito)';
        else if (item.data.site === 'Fuera') diveName = 'Inmersión (Fuera)';
        else diveName = 'Inmersión (Reserva Marina)';

        let isPercentDiscount = profile.discount > 0 && profile.discountType !== 'fixed';
        let discountVal = parseFloat(profile.discount) || 0;
        
        let appliedDiveStr = isPercentDiscount ? `${diveName} (${discountVal}% Dto)` : diveName;
        addFacturaItem(itemsMap, appliedDiveStr, p.dive);

        if (item.data.course && p.course > 0) {
            let courseNameStr = 'Curso: ' + (item.data.baseCourse || item.data.course.split(' | ')[0]);
            let appliedCourseStr = isPercentDiscount ? `${courseNameStr} (${discountVal}% Dto)` : courseNameStr;
            addFacturaItem(itemsMap, appliedCourseStr, p.course);
        }

        if (p.gas > 0) addFacturaItem(itemsMap, 'Suplemento Gas (Nitrox)', p.gas);
        if (p.rental > 0) addFacturaItem(itemsMap, 'Alquiler Equipamiento', p.rental);
        if (p.insurance > 0) addFacturaItem(itemsMap, 'Seguro de Buceo', p.insurance);
        if (p.computer > 0) addFacturaItem(itemsMap, 'Alquiler Ordenador', p.computer);

        if (p.tasa > 0) {
            let tasaName = item.data.site === 'Fuera' ? 'Tasa (Puerto Cerrado)' : 'Tasa (Reserva Marina)';
            addFacturaItem(exentoMap, tasaName, p.tasa);
        }
    });

    let facturaHtml = '';

    const sortedItems = Object.values(itemsMap).sort((a, b) => {
        const getWeight = (name) => {
            let n = name.toLowerCase();
            if (n.startsWith('inmersión') || n.startsWith('curso')) return 1;
            if (n.startsWith('suplemento') || n.startsWith('alquiler') || n.startsWith('seguro')) return 2;
            return 3;
        };
        const wA = getWeight(a.name);
        const wB = getWeight(b.name);
        if (wA !== wB) return wA - wB;
        return a.name.localeCompare(b.name);
    });

    sortedItems.forEach(item => {
        let itemTotal = item.price * item.qty;
        let itemBase = itemTotal / 1.21;
        let itemIva = itemBase * 0.21;

        totalBase21 += itemBase;
        totalIva21 += itemIva;
        totalFactura += itemTotal;

        facturaHtml += `
        <tr class="border-b border-slate-100">
            <td class="py-3 px-2 text-sm font-bold text-slate-800">${item.name}</td>
            <td class="py-3 px-2 text-sm font-bold text-slate-600 text-center">${item.qty}</td>
            <td class="py-3 px-2 text-sm font-bold text-slate-600 text-right">${(item.price / 1.21).toFixed(2)} €</td>
            <td class="py-3 px-2 text-sm font-black text-slate-800 text-right">${itemTotal.toFixed(2)} €</td>
        </tr>`;
    });


    Object.values(exentoMap).forEach(item => {
        let itemTotal = item.price * item.qty;
        totalExento += itemTotal;
        totalFactura += itemTotal;

        facturaHtml += `
        <tr class="border-b border-slate-100 bg-slate-50/50">
            <td class="py-3 px-2 text-sm font-bold text-slate-800">
                ${item.name} - <i>Exento IVA</i>
            </td>
            <td class="py-3 px-2 text-sm font-bold text-slate-600 text-center">${item.qty}</td>
            <td class="py-3 px-2 text-sm font-bold text-slate-600 text-right">${item.price.toFixed(2)} €</td>
            <td class="py-3 px-2 text-sm font-black text-slate-800 text-right">${itemTotal.toFixed(2)} €</td>
        </tr>`;
    });

    // Apply fixed € discount as a separate global item
    if (!targetDocId && profile.discount > 0 && profile.discountType === 'fixed') {
        let discountAmount = -parseFloat(profile.discount);
        let dBase = discountAmount / 1.21;
        let dIva = dBase * 0.21;
        
        totalBase21 += dBase;
        totalIva21 += dIva;
        totalFactura += discountAmount;

        facturaHtml += `
        <tr class="border-b border-slate-100 bg-rose-50/50">
            <td class="py-3 px-2 text-sm font-bold text-rose-600">Descuento Global Aplicado</td>
            <td class="py-3 px-2 text-sm font-bold text-rose-600 text-center">1</td>
            <td class="py-3 px-2 text-sm font-bold text-rose-600 text-right">${dBase.toFixed(2)} €</td>
            <td class="py-3 px-2 text-sm font-black text-rose-600 text-right">${discountAmount.toFixed(2)} €</td>
        </tr>`;
    }

    if (!targetDocId && totalPago > 0) {
        totalFactura -= totalPago;
        facturaHtml += `
        <tr class="border-b border-emerald-100 bg-emerald-50/50">
            <td class="py-3 px-2 text-sm font-bold text-emerald-600">Abono Parcial Aplicado</td>
            <td class="py-3 px-2 text-sm font-bold text-emerald-600 text-center">1</td>
            <td class="py-3 px-2 text-sm font-bold text-emerald-600 text-right">-</td>
            <td class="py-3 px-2 text-sm font-black text-emerald-600 text-right">-${totalPago.toFixed(2)} €</td>
        </tr>`;
    }

    const depositAmount = parseFloat(profile.deposit) || 0;
    if (!targetDocId && depositAmount > 0) {
        totalFactura -= depositAmount;
        facturaHtml += `
        <tr class="border-b border-emerald-100 bg-emerald-50/50">
            <td class="py-3 px-2 text-sm font-bold text-emerald-600">Depósito Entregado a Cuenta</td>
            <td class="py-3 px-2 text-sm font-bold text-emerald-600 text-center">1</td>
            <td class="py-3 px-2 text-sm font-bold text-emerald-600 text-right">-</td>
            <td class="py-3 px-2 text-sm font-black text-emerald-600 text-right">-${depositAmount.toFixed(2)} €</td>
        </tr>`;
    }

    document.getElementById('factura-items').innerHTML = facturaHtml || '<tr><td colspan="4" class="p-4 text-center">No hay inmersiones para facturar</td></tr>';

    document.getElementById('factura-base-21').innerText = totalBase21.toFixed(2) + ' €';
    document.getElementById('factura-iva-amount').innerText = totalIva21.toFixed(2) + ' €';
    document.getElementById('factura-exento').innerText = totalExento.toFixed(2) + ' €';
    document.getElementById('factura-total').innerText = totalFactura.toFixed(2) + ' €';

    const targetTab = document.getElementById('tab-content-factura');
    if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('flex');
    }

    // Add print utility class for isolated printing
    document.body.classList.add('print-factura');
};

window.closeFacturaView = function () {
    const targetTab = document.getElementById('tab-content-factura');
    if (targetTab) {
        targetTab.classList.add('hidden');
        targetTab.classList.remove('flex');
    }
    document.body.classList.remove('print-factura');
};

window.updateCustomerDiscount = async function (val) {
    if (!window.activeFichaDni) return;
    let disc = parseFloat(val) || 0;
    if (disc < 0) disc = 0;

    // Get the current type from the global state variable
    const discType = window.activeDiscountType || 'percent';

    let cx = customerDatabase.find(c => c.dni === window.activeFichaDni);
    if (cx) { cx.discount = disc; cx.discountType = discType; }

    try {
        await db.collection('mangamar_customers').doc(window.activeFichaDni).update({ discount: disc, discountType: discType });
    } catch (e) {
        await db.collection('mangamar_customers').doc(window.activeFichaDni).set({ discount: disc, discountType: discType }, { merge: true });
    }

    const currName = document.getElementById('profile-modal-name').innerText;
    openCustomerProfile(window.activeFichaDni, currName); // Re-calculate everything
}

window.setDiscountType = function(type) {
    window.activeDiscountType = type; // save state globally
    const btnPct = document.getElementById('disc-type-pct');
    const btnEur = document.getElementById('disc-type-eur');
    if (!btnPct || !btnEur) return;

    if (type === 'percent' || type === 'pct') {
        btnPct.className = 'px-2 py-0.5 text-[10px] font-black rounded-md bg-white text-rose-500 shadow-sm transition-all';
        btnEur.className = 'px-2 py-0.5 text-[10px] font-black rounded-md text-slate-400 hover:text-slate-600 transition-all';
        document.getElementById('ficha-caja-discount').max = 100;
    } else {
        btnEur.className = 'px-2 py-0.5 text-[10px] font-black rounded-md bg-white text-rose-500 shadow-sm transition-all';
        btnPct.className = 'px-2 py-0.5 text-[10px] font-black rounded-md text-slate-400 hover:text-slate-600 transition-all';
        document.getElementById('ficha-caja-discount').removeAttribute('max');
    }
    // User manually toggled type — save immediately if there's a value
    const val = document.getElementById('ficha-caja-discount').value;
    if (parseFloat(val) > 0) updateCustomerDiscount(val);
}

window.toggleDiverJointSelection = function (el, dni, nombre, debt) {
    if (!window.activeJointSelection) window.activeJointSelection = [];
    let idx = window.activeJointSelection.findIndex(x => x.dni === dni);
    if (idx > -1) {
        window.activeJointSelection.splice(idx, 1);
        el.className = 'w-6 h-6 mx-auto rounded-full bg-slate-100 text-slate-400 border border-slate-200 group hover:border-blue-300 hover:bg-blue-50 hover:text-blue-500 flex items-center justify-center transition-all shadow-inner cursor-pointer';
        el.innerHTML = '<svg class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
    } else {
        window.activeJointSelection.push({ dni, nombre, debt: parseFloat(debt) });
        el.className = 'w-6 h-6 mx-auto rounded-full bg-blue-500 text-white flex items-center justify-center transition-colors shadow-inner cursor-pointer';
        el.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';
    }

    updateJointCheckoutBar();
}

window.updateJointCheckoutBar = function () {
    const bar = document.getElementById('joint-checkout-bar');
    if (!window.activeJointSelection || window.activeJointSelection.length === 0) {
        bar.classList.add('hidden');
        return;
    }

    let total = 0;
    let names = [];
    window.activeJointSelection.forEach(c => {
        total += c.debt;
        names.push(c.nombre.split(' ')[0]);
    });

    bar.classList.remove('hidden');
    document.getElementById('joint-checkout-count').innerText = `${window.activeJointSelection.length} Cliente${window.activeJointSelection.length > 1 ? 's' : ''} Seleccionado${window.activeJointSelection.length > 1 ? 's' : ''} — ${total.toFixed(2)} €`;
    document.getElementById('joint-checkout-names').innerText = names.join(', ');
}

window.openJointFacturaPrompt = function () {
    if (!window.activeJointSelection || window.activeJointSelection.length === 0) return;

    document.getElementById('joint-custom-name').value = '';
    document.getElementById('joint-custom-dni').value = '';
    document.getElementById('joint-rep-custom-fields').classList.add('hidden');

    let html = '';
    window.activeJointSelection.forEach((c, i) => {
        html += `
        <label class="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="radio" name="jointRep" value="${c.dni}" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500" ${i === 0 ? 'checked' : ''} onchange="document.getElementById('joint-rep-custom-fields').classList.add('hidden')">
            <div>
                <div class="text-sm font-bold text-slate-700">${c.nombre}</div>
                <div class="text-xs text-slate-500 font-mono">${c.dni}</div>
            </div>
        </label>`;
    });

    document.getElementById('joint-rep-options-container').innerHTML = html;
    document.getElementById('joint-factura-rep-modal').classList.remove('hidden');
}

window.confirmJointFacturaRep = function () {
    const radios = document.getElementsByName('jointRep');
    let selectedVal = null;
    radios.forEach(r => { if (r.checked) selectedVal = r.value; });

    if (!selectedVal) return;

    let repName = '';
    let repDni = '';

    if (selectedVal === 'custom') {
        repName = document.getElementById('joint-custom-name').value.trim();
        repDni = document.getElementById('joint-custom-dni').value.trim();
        if (!repName || !repDni) {
            showToast("Debes introducir Nombre y DNI del representante.");
            return;
        }
    } else {
        const found = window.activeJointSelection.find(x => x.dni === selectedVal);
        repName = found.nombre;
        repDni = found.dni;
    }
    let groupDiscVal = document.getElementById('joint-group-discount').value;
    let groupDiscount = parseFloat(groupDiscVal) || 0;

    document.getElementById('joint-factura-rep-modal').classList.add('hidden');
    generateJointFactura(repName, repDni, groupDiscount);
}

window.generateJointFactura = async function (repName, repDni, groupDiscount = 0) {
    window.currentFacturaType = 'joint';
    window.currentJointFacturaRefs = [];

    if (!window.activeJointSelection || window.activeJointSelection.length === 0) return;
    const selectedDnis = window.activeJointSelection.map(c => c.dni);

    const safeName = repName.replace(/\s+/g, '_');
    const safeDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (!window.originalAppTitle) window.originalAppTitle = document.title;
    document.title = `Resumen_Grupo_${safeName}_${safeDate}`;

    document.getElementById('factura-cx-name').innerHTML = `Resumen Conjunto <br><span class="text-sm font-normal text-slate-500">Rep: ${repName}</span>`;
    document.getElementById('factura-cx-dni').innerText = repDni;
    document.getElementById('factura-date').innerText = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    let itemsMap = {};
    let exentoMap = {};
    let totalBase21 = 0;
    let totalIva21 = 0;
    let totalExento = 0;
    let totalFactura = 0;

    function addFacturaItem(map, name, price) {
        if (price <= 0) return;
        const key = name + '_' + price;
        if (!map[key]) { map[key] = { name, price, qty: 0 }; }
        map[key].qty++;
    }

    // Process all selected users
    const historyPromises = selectedDnis.map(dni => db.collection('mangamar_customers').doc(dni).collection('history').where('paymentStatus', '==', 'pending').get());
    const histories = await Promise.all(historyPromises);

    histories.forEach((snap, idx) => {
        const dni = selectedDnis[idx];
        const profile = customerDatabase.find(c => c.dni === dni) || { discount: 0 };

        let docsArray = [];
        snap.forEach(doc => docsArray.push(doc));
        docsArray.sort((a, b) => {
            const dateA = a.data().date + ' ' + (a.data().time || '00:00');
            const dateB = b.data().date + ' ' + (b.data().time || '00:00');
            return dateA.localeCompare(dateB);
        });

        let activeInsExpiry = null;
        let billedCourses = new Set();

        docsArray.forEach(doc => {
            let data = doc.data();
            if (data.paymentStatus === 'pending') window.currentJointFacturaRefs.push(doc.ref);

            let p = window.calculateDivePrice(data);

            if (data.course) {
                let baseCourse = data.baseCourse || data.course.split(' | ')[0].trim();
                if (!billedCourses.has(baseCourse)) {
                    p.course = data.coursePrice !== undefined ? data.coursePrice : ((window.PRICES && window.PRICES[baseCourse]) ? window.PRICES[baseCourse] : 0);
                    billedCourses.add(baseCourse);
                } else { p.course = 0; }
                p.dive = 0; p.tasa = 0;
                if (data.rental === 'INC') p.rental = 0;
                if (data.insurance === 'INC') p.insurance = 0;
            }

            let cleanIns = (data.insurance || 0).toString().replace(' ✔', '');
            if (['1D', '1W', '1M', '1Y'].includes(cleanIns)) {
                if (activeInsExpiry && data.date <= activeInsExpiry) { p.insurance = 0; }
                else {
                    let [y, m, d] = data.date.split('-').map(Number);
                    let dateObj = new Date(y, m - 1, d);
                    if (cleanIns === '1D') dateObj.setDate(dateObj.getDate() + 0);
                    if (cleanIns === '1W') dateObj.setDate(dateObj.getDate() + 6);
                    if (cleanIns === '1M') dateObj.setMonth(dateObj.getMonth() + 1);
                    if (cleanIns === '1Y') dateObj.setFullYear(dateObj.getFullYear() + 1);
                    activeInsExpiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                }
            } else if (cleanIns === 'Propio' || cleanIns === 'INC') { p.insurance = 0; }

            else if (data.site === 'Fuera') diveName = 'Inmersión (Fuera)';
            else diveName = 'Inmersión (Reserva Marina)';

            let baseProfileDisc = parseFloat(profile.discount) || 0;
            let discountVal = Math.max(baseProfileDisc, groupDiscount);
            let appliedDiveStr = (discountVal > 0) ? `${diveName} (${discountVal}% Dto)` : diveName;
            addFacturaItem(itemsMap, appliedDiveStr, p.dive * (1 - (discountVal / 100)));

            if (data.course && p.course > 0) {
                let courseNameStr = 'Curso: ' + (data.baseCourse || data.course.split(' | ')[0]);
                let appliedCourseStr = (discountVal > 0) ? `${courseNameStr} (${discountVal}% Dto)` : courseNameStr;
                addFacturaItem(itemsMap, appliedCourseStr, p.course * (1 - (discountVal / 100)));
            }

            if (p.gas > 0) addFacturaItem(itemsMap, 'Suplemento Gas (Nitrox)', p.gas);
            if (p.rental > 0) addFacturaItem(itemsMap, 'Alquiler Equipamiento', p.rental);
            if (p.insurance > 0) addFacturaItem(itemsMap, 'Seguro de Buceo', p.insurance);

            if (p.tasa > 0) {
                let tasaName = data.site === 'Fuera' ? 'Tasa (Puerto Cerrado)' : 'Tasa (Reserva Marina)';
                addFacturaItem(exentoMap, tasaName, p.tasa);
            }
        });
    });

    let facturaHtml = '';

    const sortedItems = Object.values(itemsMap).sort((a, b) => {
        const getWeight = (name) => {
            let n = name.toLowerCase();
            if (n.startsWith('inmersión') || n.startsWith('curso')) return 1;
            if (n.startsWith('suplemento') || n.startsWith('alquiler') || n.startsWith('seguro')) return 2;
            return 3;
        };
        const wA = getWeight(a.name);
        const wB = getWeight(b.name);
        if (wA !== wB) return wA - wB;
        return a.name.localeCompare(b.name);
    });

    sortedItems.forEach(item => {
        let itemTotal = item.price * item.qty;
        let itemBase = itemTotal / 1.21;
        let itemIva = itemBase * 0.21;

        totalBase21 += itemBase;
        totalIva21 += itemIva;
        totalFactura += itemTotal;

        facturaHtml += `
        <tr class="border-b border-slate-100">
            <td class="py-3 px-2 text-sm font-bold text-slate-800">${item.name}</td>
            <td class="py-3 px-2 text-sm font-bold text-slate-600 text-center">${item.qty}</td>
            <td class="py-3 px-2 text-sm font-bold text-slate-600 text-right">${(item.price / 1.21).toFixed(2)} €</td>
            <td class="py-3 px-2 text-sm font-black text-slate-800 text-right">${itemTotal.toFixed(2)} €</td>
        </tr>`;
    });

    Object.values(exentoMap).forEach(item => {
        let itemTotal = item.price * item.qty;
        totalExento += itemTotal;
        totalFactura += itemTotal;

        facturaHtml += `
        <tr class="border-b border-slate-100 bg-slate-50/50">
            <td class="py-3 px-2 text-sm font-bold text-slate-800">${item.name} - <i>Exento IVA</i></td>
            <td class="py-3 px-2 text-sm font-bold text-slate-600 text-center">${item.qty}</td>
            <td class="py-3 px-2 text-sm font-bold text-slate-600 text-right">${item.price.toFixed(2)} €</td>
            <td class="py-3 px-2 text-sm font-black text-slate-800 text-right">${itemTotal.toFixed(2)} €</td>
        </tr>`;
    });

    document.getElementById('factura-items').innerHTML = facturaHtml || '<tr><td colspan="4" class="p-4 text-center">No hay inmersiones para facturar</td></tr>';
    document.getElementById('factura-base-21').innerText = totalBase21.toFixed(2) + ' €';
    document.getElementById('factura-iva-amount').innerText = totalIva21.toFixed(2) + ' €';
    document.getElementById('factura-exento').innerText = totalExento.toFixed(2) + ' €';
    document.getElementById('factura-total').innerText = totalFactura.toFixed(2) + ' €';

    document.getElementById('factura-modal').classList.remove('hidden');
    document.getElementById('today-divers-modal').classList.add('opacity-0');

    // Add print utility class for isolated printing
    document.body.classList.add('print-factura');
};

window.liquidarFacturaActual = async function () {
    window.showAppConfirm("¿Confirmas que este documento está cobrado? Esto marcará todas sus inmersiones como completadas.", async () => {
        const btn = document.getElementById('btn-factura-liquidar');
        const originalHtml = btn.innerHTML;
        // 🌟 0ms INSTANT SUPER-FAST UI FEEDBACK 🌟
        // Uncouple state immediately
        const modalRefIds = window.currentJointFacturaRefs ? [...window.currentJointFacturaRefs] : [];
        const activeDocs = window.activeFichaPendingDocs ? [...window.activeFichaPendingDocs] : [];
        const currentType = window.currentFacturaType;
        const currentSelection = window.activeJointSelection ? [...window.activeJointSelection] : [];
        const currentFicha = window.activeFichaDni;
        const profileEl = document.getElementById('profile-modal-name') ? document.getElementById('profile-modal-name').innerText : '';
        const todayModalOpen = document.getElementById('today-divers-modal').classList.contains('hidden') === false;
        const activeTab = document.getElementById('tab-today-pending')?.classList.contains('bg-white') ? 'pending' : 'all';

        // 1. INSTANT UX MUTATION
        closeFacturaModal();
        showToast("✅ Documento liquidado correctamente.");

        if (todayModalOpen) {
            // Optimistically delete the rows from the Dia de Hoy list instantly!
            const listRoot = document.getElementById('today-divers-list');
            if (listRoot) {
                currentSelection.forEach(c => {
                    // Iterate direct children divs of listRoot
                    Array.from(listRoot.children).forEach(div => {
                        if (div.innerHTML.includes(c.dni)) {
                            div.classList.add('opacity-0', 'transition-all', 'duration-300', 'scale-95');
                            setTimeout(() => div.remove(), 300);
                        }
                    });
                });
            }
            window.activeJointSelection = [];
            updateJointCheckoutBar();
        } else if (currentFicha) {
            window.activeFichaPendingDocs = [];
            openCustomerProfile(currentFicha, profileEl);
        }

        // 2. BACKGROUND DATABASE SYNC
        (async () => {
            try {
                if (currentType === 'joint' && modalRefIds.length > 0) {
                    const batch = db.batch();
                    modalRefIds.forEach(ref => {
                        batch.update(ref, { paymentStatus: 'paid' });
                    });
                    await batch.commit();

                    let masterChanged = false;
                    currentSelection.forEach(c => {
                        let cxIdx = customerDatabase.findIndex(cust => cust.dni === c.dni);
                        if (cxIdx !== -1) { customerDatabase[cxIdx].deposit = 0; masterChanged = true; }
                    });
                    if (masterChanged) {
                        await db.collection("mangamar_directory").doc("master_list").update({ clients: customerDatabase });
                    }
                } else if (currentType === 'individual' && currentFicha && activeDocs.length > 0) {
                    const batch = db.batch();
                    activeDocs.forEach(docId => {
                        const ref = db.collection('mangamar_customers').doc(currentFicha).collection('history').doc(docId);
                        batch.update(ref, { 
                            paymentStatus: 'paid', 
                            paidAt: firebase.firestore.FieldValue.serverTimestamp() 
                        });
                    });
                    await batch.commit();

                    let cxIdx = customerDatabase.findIndex(cust => cust.dni === currentFicha);
                    if (cxIdx !== -1) {
                        customerDatabase[cxIdx].deposit = 0;
                        await db.collection("mangamar_directory").doc("master_list").update({ clients: customerDatabase });
                    }
                }

                // Refresh final background integrity safely AFTER Firebase digests the commit
                if (todayModalOpen) {
                    switchTodayTab(activeTab);
                }
            } catch (e) {
                console.error("Delayed checkout failed:", e);
                showToast("Fallo de red transparente.", "error");
            }
        })();
    });
};

// ==========================================
// 15. CRM DIRECTORY
// ==========================================
let crmSearchStr = '';
let crmSortKey = 'fullName';
let crmSortDesc = false;

window.openCrmModal = function (isNavBackForward = false) {
    if (!isNavBackForward && typeof window.recordModalHistory === 'function') {
        window.hideAllNavModals();
        window.recordModalHistory({ type: 'crm', isNavBackForward });
    }

    crmSearchStr = '';
    document.getElementById('crm-search-input').value = '';
    document.getElementById('crm-search-input-mobile').value = '';
    document.getElementById('crm-modal').classList.remove('hidden');

    // Animate in
    setTimeout(() => {
        document.getElementById('crm-modal-content').classList.remove('scale-95', 'opacity-0');
        document.getElementById('crm-modal-content').classList.add('scale-100', 'opacity-100');
    }, 10);

    renderCrmTable();
};

window.crmDisplayLimit = 30;

window.c_onCrmSearch = function (val) {
    window.crmDisplayLimit = 30; // reset on search
    crmSearchStr = val.toLowerCase().trim();
    if (document.getElementById('crm-search-input').value !== val) document.getElementById('crm-search-input').value = val;
    if (document.getElementById('crm-search-input-mobile').value !== val) document.getElementById('crm-search-input-mobile').value = val;
    renderCrmTable();
};

window.c_sortCrm = function (key) {
    window.crmDisplayLimit = 30; // reset on sort
    if (crmSortKey === key) {
        crmSortDesc = !crmSortDesc;
    } else {
        crmSortKey = key;
        crmSortDesc = false;
    }
    renderCrmTable();
};

window.renderCrmTable = function () {
    const listEl = document.getElementById('crm-list');
    const countEl = document.getElementById('crm-total-count');
    if (!listEl || !customerDatabase) return;

    ['fullName', 'dni', 'titulacion', 'dives', 'insuranceType'].forEach(k => {
        const el = document.getElementById('crm-sort-' + k);
        if (el) el.innerText = '';
    });
    const sEl = document.getElementById('crm-sort-' + crmSortKey);
    if (sEl) sEl.innerText = crmSortDesc ? '↓' : '↑';

    let filtered = customerDatabase.filter(c => {
        if (!crmSearchStr) return true;
        const cName = window.getFullName(c) || '';
        const searchTarget = `${cName} ${c.dni || ''} ${c.email || ''} ${c.telefono || ''}`.toLowerCase();
        return searchTarget.includes(crmSearchStr);
    });

    countEl.innerText = `${filtered.length} CLIENTES ENCONTRADOS`;

    filtered.sort((a, b) => {
        let valA = a[crmSortKey];
        let valB = b[crmSortKey];

        if (crmSortKey === 'insuranceType') {
            valA = (a.insurance && typeof a.insurance === 'object') ? a.insurance.type : (a.insurance || '');
            valB = (b.insurance && typeof b.insurance === 'object') ? b.insurance.type : (b.insurance || '');
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return crmSortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
        } else if (typeof valA === 'number' && typeof valB === 'number') {
            return crmSortDesc ? valB - valA : valA - valB;
        } else {
            valA = valA || ''; valB = valB || '';
            return crmSortDesc ? String(valB).localeCompare(String(valA)) : String(valA).localeCompare(String(valB));
        }
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="p-12 text-center text-slate-500 font-bold"><svg class="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>No se encontraron clientes coincidiendo con esos datos.</div>`;
        return;
    }

    let html = '';
    
    if (typeof window.crmDisplayLimit === 'undefined') window.crmDisplayLimit = 30;
    const renderLimit = Math.min(filtered.length, window.crmDisplayLimit);
    
    for (let i = 0; i < renderLimit; i++) {
        const c = filtered[i];
        const name = window.getFullName(c) || 'Sin Nombre';
        const safeNameQuotes = name.replace(/'/g, "\\'");
        const dni = c.dni || 'S/N';
        const tit = c.titulacion || '---';
        const dives = c.dives || 0;

        let insHTML = `<span class="px-2.5 py-1 bg-slate-100 text-slate-400 border-slate-200 rounded text-[10px] font-bold">---</span>`;
        let computedExpiryStr = '---';
        if (c.insurance) {
            let insObj = c.insurance;
            let typeStr = "";
            let expiryStr = "";
            let isRed = false;

            if (typeof insObj === 'string') { typeStr = insObj; }
            else if (insObj && typeof insObj === 'object') { typeStr = insObj.type || 'S/N'; expiryStr = insObj.expiry || ''; }
            else { typeStr = String(insObj); }

            if (!typeStr || typeStr === '0' || typeStr === '---' || String(typeStr).toLowerCase() === 'no' || String(typeStr).toLowerCase() === 'none') {
                isRed = true;
                typeStr = 'Sin Seguro';
            } else {
                let testDateStr = expiryStr;
                if (!testDateStr) {
                    const strForMatch = String(typeStr);
                    const match = strForMatch.match(/\d{4}-\d{2}-\d{2}/);
                    if (match) testDateStr = match[0];
                }
                if (testDateStr) {
                    computedExpiryStr = testDateStr;
                    let dDate = new Date(testDateStr);
                    dDate.setHours(23, 59, 59, 999);
                    if (!isNaN(dDate.getTime()) && dDate.getTime() < new Date().getTime()) {
                        isRed = true;
                    }
                }
            }
            if (isRed) {
                insHTML = `<span class="truncate px-2.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-black border border-red-200" title="${typeStr}">🛑 ${typeStr}</span>`;
            } else {
                insHTML = `<span class="truncate px-2.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-black border border-emerald-200" title="${typeStr}">✔ ${typeStr}</span>`;
            }
        }

        const phoneHtml = c.telefono ? `<span onclick="navigator.clipboard.writeText('${c.telefono}'); showToast('Teléfono copiado');" title="Copiar Tel ${c.telefono}" class="cursor-pointer text-slate-400 hover:text-blue-500 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg></span>` : '';
        const emailHtml = c.email ? `<span onclick="navigator.clipboard.writeText('${c.email}'); showToast('Email copiado');" title="Copiar Email ${c.email}" class="cursor-pointer text-slate-400 hover:text-blue-500 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></span>` : '';

        html += `
        <div class="px-4 py-3 border-b border-slate-100 hover:bg-blue-50 transition-colors group cursor-pointer" onclick="openCustomerProfile('${dni}', '${safeNameQuotes}')">
            <!-- Mobile View -->
            <div class="md:hidden flex flex-col gap-2">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-black text-slate-800">${name}</div>
                        <div class="text-[10px] font-mono text-slate-500 cursor-pointer hover:text-blue-500" onclick="event.stopPropagation(); navigator.clipboard.writeText('${dni}'); showToast('DNI copiado');" title="Copiar DNI">${dni}</div>
                    </div>
                    ${insHTML}
                    <div class="text-[9px] font-mono font-bold text-slate-400 mt-1 uppercase" title="Expiración">${computedExpiryStr}</div>
                </div>
                <div class="flex justify-between items-center text-xs text-slate-600">
                    <div class="truncate max-w-[150px] font-medium px-2 py-0.5 bg-slate-100 rounded-md">${tit}</div>
                    <div class="font-bold flex items-center gap-1">Inmers: ${dives}</div>
                </div>
            </div>
            
            <!-- Desktop View -->
            <div class="hidden md:grid grid-cols-12 gap-4 items-center">
                <div class="col-span-3 font-bold text-slate-800 text-sm truncate group-hover:text-amber-600 transition-colors">${name}</div>
                <div class="col-span-1 text-xs font-mono text-slate-500 truncate cursor-pointer hover:text-blue-600" onclick="event.stopPropagation(); navigator.clipboard.writeText('${dni}'); showToast('DNI copiado')">${dni}</div>
                <div class="col-span-2 text-xs font-medium text-slate-600 truncate"><span class="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">${tit}</span></div>
                <div class="col-span-1 text-center font-black text-slate-700 text-[11px]">${dives}</div>
                <div class="col-span-2 text-center truncate">${insHTML}</div>
                <div class="col-span-1 text-center font-mono font-bold text-slate-500 text-[10px] truncate">${computedExpiryStr}</div>
                <div class="col-span-1 flex items-center justify-center gap-3" onclick="event.stopPropagation()">${phoneHtml} ${emailHtml}</div>
                <div class="col-span-1 text-right">
                    <button class="px-3 py-1 bg-white text-blue-600 border border-slate-200 rounded drop-shadow-sm font-bold text-[10px] group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:text-white transition-colors uppercase tracking-wider">Ficha</button>
                </div>
            </div>
        </div>`;
    }

    if (filtered.length > window.crmDisplayLimit) {
        html += `
        <div class="col-span-full p-6 flex justify-center w-full bg-slate-50 border-t border-slate-100 mt-2">
            <button onclick="window.crmDisplayLimit += 30; window.renderCrmTable();" class="px-6 py-2.5 bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200 font-black text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                Cargar Más (${filtered.length - window.crmDisplayLimit} ocultos)
            </button>
        </div>`;
    }

    listEl.innerHTML = html;
};

// Hook auto-refresh if CRM is open locally and modifications are made via Ficha
const _crm_originalCloseProfile = window.closeGlobalModal;
window.closeGlobalModal = function (id) {
    _crm_originalCloseProfile(id);
    if (id === 'customer-profile-modal' || (id && id.id === 'customer-profile-modal')) {
        const crmModal = document.getElementById('crm-modal');
        if (crmModal && !crmModal.classList.contains('hidden')) {
            renderCrmTable();
        }
    }
};

window.promptEditCustomer = function () {
    if (!window.activeFichaDni) return;
    const customerInfo = customerDatabase.find(c => c.dni === window.activeFichaDni) || {};

    document.getElementById('edit-f-dni').value = window.activeFichaDni;
    document.getElementById('edit-f-nombre').value = window.getFullName(customerInfo);
    document.getElementById('edit-f-dob').value = customerInfo.dob || '';
    document.getElementById('edit-f-telefono').value = customerInfo.telefono || '';
    document.getElementById('edit-f-email').value = customerInfo.email || '';
    document.getElementById('edit-f-titulacion').value = customerInfo.titulacion || '';
    document.getElementById('edit-f-dives').value = customerInfo.dives || '';

    if (customerInfo.insurance) {
        document.getElementById('edit-f-insurance-type').value = customerInfo.insurance.type || '';
        document.getElementById('edit-f-insurance-exp').value = customerInfo.insurance.expiry || '';
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
            if (customerDatabase[index].apellidos) delete customerDatabase[index].apellidos;
            customerDatabase[index].dob = dob;
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
                                if (guest.nombre !== newFullName) {
                                    guest.nombre = newFullName;
                                    modified = true;
                                }
                            }
                        });
                    }
                });
            }
            if (modified) {
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
            // Redraw boats if manifest is active
            if (typeof window.renderGroups === 'function' && document.getElementById('boat-modal') && !document.getElementById('boat-modal').classList.contains('hidden')) {
                window.renderGroups();
            }
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

// ==========================================
// 1X. HISTORIAL MULTI-SELECT Bulk Actions
// ==========================================

window.activeHistorialSelection = [];

window.historialClearSelection = function () {
    window.activeHistorialSelection = [];
    window.updateHistorialActionBar();
    if (document.getElementById('historial-select-all-btn')) {
        document.getElementById('historial-select-all-btn').innerHTML = '<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
        document.getElementById('historial-select-all-btn').classList.remove('bg-blue-500', 'text-white');
        document.getElementById('historial-select-all-btn').classList.add('bg-slate-200');
    }
};

window.toggleHistorialRowSelection = function (el, docId, dni, total, status, monthKey) {
    if (!window.activeHistorialSelection) window.activeHistorialSelection = [];
    let idx = window.activeHistorialSelection.findIndex(x => x.docId === docId);

    // Find the enclosing check badge wrapper
    const badge = el.querySelector('div.w-6');
    if (!badge) return;

    if (idx > -1) {
        window.activeHistorialSelection.splice(idx, 1);
        badge.className = 'w-6 h-6 rounded-full bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500 flex items-center justify-center transition-colors shadow-inner';
        badge.innerHTML = '<svg class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
    } else {
        window.activeHistorialSelection.push({ docId, dni, total: parseFloat(total), status, monthKey });
        badge.className = 'w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center transition-colors shadow-inner';
        badge.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';
    }

    window.updateHistorialActionBar();
};

window.updateHistorialActionBar = function () {
    const bar = document.getElementById('historial-action-bar');
    if (!bar) return;

    if (!window.activeHistorialSelection || window.activeHistorialSelection.length === 0) {
        bar.classList.add('hidden');
        return;
    }

    let total = 0;
    window.activeHistorialSelection.forEach(item => {
        total += item.total;
    });

    bar.classList.remove('hidden');
    document.getElementById('historial-action-count').innerText = `${window.activeHistorialSelection.length} seleccionado${window.activeHistorialSelection.length > 1 ? 's' : ''}`;
    document.getElementById('historial-action-total').innerText = `${total.toFixed(2)} €`;

    // Update select-all button state loosely
    const tbody = document.getElementById('profile-history-list');
    const validRows = tbody.querySelectorAll('tr[data-doc-id]');
    const selectAllBtn = document.getElementById('historial-select-all-btn');
    if (selectAllBtn && validRows.length > 0) {
        if (window.activeHistorialSelection.length === validRows.length) {
            selectAllBtn.innerHTML = '<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';
            selectAllBtn.classList.remove('bg-slate-200');
            selectAllBtn.classList.add('bg-blue-500', 'text-white');
        } else {
            selectAllBtn.innerHTML = '<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
            selectAllBtn.classList.remove('bg-blue-500', 'text-white');
            selectAllBtn.classList.add('bg-slate-200');
        }
    }
};

window.historialToggleSelectAll = function () {
    const tbody = document.getElementById('profile-history-list');
    const rows = tbody.querySelectorAll('tr[data-doc-id]'); // that filters out the generic footer sum rows!

    if (!window.activeHistorialSelection) window.activeHistorialSelection = [];

    const isAllSelected = window.activeHistorialSelection.length > 0 && window.activeHistorialSelection.length === rows.length;

    if (isAllSelected) {
        // Deselect all
        historialClearSelection();
        // Reset DOM natively to clear state instantly
        rows.forEach(r => {
            const el = r.querySelector('td:first-child');
            if (!el) return;
            const badge = el.querySelector('div.w-6');
            if (badge) {
                badge.className = 'w-6 h-6 rounded-full bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500 flex items-center justify-center transition-colors shadow-inner';
                badge.innerHTML = '<svg class="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
            }
        });
    } else {
        // Select all
        window.activeHistorialSelection = [];
        rows.forEach(r => {
            const docId = r.getAttribute('data-doc-id');
            // We unfortunately don't have the DNI, Total, etc. cleanly available directly in the DOM state here without re-parsing,
            // EXCEPT if we simulate clicks!
            const el = r.querySelector('td:first-child');
            if (el) {
                // If the badge is not already selected (blue), click it! Or just re-build the array.
                // Re-parsing is safer. We have window.activeFichaDives!
                const matched = window.activeFichaDives.find(d => d.doc.id === docId);
                if (matched) {
                    window.activeHistorialSelection.push({ docId: matched.doc.id, dni: window.activeFichaDni, total: matched.p.total, status: matched.data.paymentStatus, monthKey: matched.data.date.substring(0, 7) });
                    const badge = el.querySelector('div.w-6');
                    if (badge) {
                        badge.className = 'w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center transition-colors shadow-inner';
                        badge.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';
                    }
                }
            }
        });
        window.updateHistorialActionBar();
    }
};

window.historialBulkPay = async function () {
    if (!window.activeHistorialSelection || window.activeHistorialSelection.length === 0) return;

    // Filter to only those pending
    const itemsToPay = window.activeHistorialSelection.filter(item => item.status === 'pending');
    if (itemsToPay.length === 0) {
        showToast("Todo está pagado");
        return;
    }

    showAppConfirm(`¿Marcar las ${itemsToPay.length} inmersiones seleccionadas como pagadas?`, async () => {
        try {
            const batch = db.batch();
            itemsToPay.forEach(item => {
                const ref = db.collection('mangamar_customers').doc(item.dni).collection('history').doc(item.docId);
                batch.update(ref, { 
                    paymentStatus: 'paid', 
                    paidAt: firebase.firestore.FieldValue.serverTimestamp() 
                });
            });
            await batch.commit();
            showToast("✅ Marcados como pagado");

            // Reload the profile silently!
            const nombre = document.getElementById('profile-modal-name').innerText;
            openCustomerProfile(window.activeFichaDni, nombre, false, 'historial');
            closeAppConfirm();
        } catch (e) {
            console.error(e);
            showAppAlert("Error al actualizar estados.");
        }
    });
};

window.historialBulkMarkPending = async function () {
    if (!window.activeHistorialSelection || window.activeHistorialSelection.length === 0) return;

    // Filter to only those paid
    const itemsToUnpay = window.activeHistorialSelection.filter(item => item.status === 'paid');
    if (itemsToUnpay.length === 0) return;

    showAppConfirm(`¿Marcar las ${itemsToUnpay.length} inmersiones seleccionadas de nuevo a pendiente?`, async () => {
        try {
            const batch = db.batch();
            itemsToUnpay.forEach(item => {
                const ref = db.collection('mangamar_customers').doc(item.dni).collection('history').doc(item.docId);
                batch.update(ref, { paymentStatus: 'pending' });
            });
            await batch.commit();
            showToast("⚠️ Marcados de nuevo como pendiente");

            // Reload the profile silently!
            const nombre = document.getElementById('profile-modal-name').innerText;
            openCustomerProfile(window.activeFichaDni, nombre, false, 'historial');
            closeAppConfirm();
        } catch (e) {
            console.error(e);
            showAppAlert("Error al actualizar estados.");
        }
    });
};

window.historialBulkDelete = async function () {
    if (!window.activeHistorialSelection || window.activeHistorialSelection.length === 0) return;

    const items = window.activeHistorialSelection;

    showAppConfirm(`⚠️ ATENCIÓN: ¿Anular ${items.length} registro(s) seleccionado(s) permanentemente?\n\nEsto borrará todos los cobros seleccionados de la ficha Y SACARÁ FÍSICAMENTE a la persona de esos marcos en el calendario.`, async () => {
        try {
            showToast("⏳ Eliminando registros, por favor espera...");
            const dni = items[0].dni;

            // Collect all unique months we need to touch in `mangamar_monthly`
            const updatesByMonth = {};

            for (const item of items) {
                // Delete from Customer history subcollection natively via await inline to avoid complex batch limits if doing tons
                await db.collection('mangamar_customers').doc(dni).collection('history').doc(item.docId).delete();

                // Find trip in the global array to pluck it
                const trip = internalTrips.find(t => t.id === item.docId);
                if (trip) {
                    if (!updatesByMonth[item.monthKey]) updatesByMonth[item.monthKey] = {};
                    let clonedTrip = JSON.parse(JSON.stringify(trip));
                    if (clonedTrip.groups) clonedTrip.groups.forEach(g => {
                        if (g.guests) g.guests = g.guests.filter(guest => guest.dni !== dni);
                    });
                    if (clonedTrip.guests) clonedTrip.guests = clonedTrip.guests.filter(guest => guest.dni !== dni);

                    updatesByMonth[item.monthKey][`allocations.${item.docId}`] = clonedTrip;
                }
            }

            // Exectute all monthly manifest updates
            const monthKeys = Object.keys(updatesByMonth);
            if (monthKeys.length > 0) {
                const batch = db.batch();
                monthKeys.forEach(mk => {
                    batch.update(db.collection('mangamar_monthly').doc(mk), updatesByMonth[mk]);
                });
                await batch.commit();
            }

            if (window.cleanOrphanedInsurance) window.cleanOrphanedInsurance(dni);

            showToast("✅ Eliminados con éxito");

            // Reload the profile silently!
            const nombre = document.getElementById('profile-modal-name').innerText;
            openCustomerProfile(window.activeFichaDni, nombre, false, 'historial');
            closeAppConfirm();

            if (!document.getElementById('today-divers-modal').classList.contains('hidden')) {
                openTodayDiversModal();
            }
        } catch (e) {
            console.error(e);
            showAppAlert("Error al eliminar los registros conjuntamente.");
        }
    });
};

// ==========================================
// 19. CONTABILIDAD (Cash Flow Accounting)
// ==========================================

window.activeContabilidadData = {
    tarjeta: [],
    bizum: [],
    efectivo: []
};
window.currentContaMonth = new Date(); // Start at current dynamic month

window.openContabilidadView = function(isNavBackForward = false) {
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
    
    if (typeof window.recordModalHistory === 'function' && !isNavBackForward) {
        window.recordModalHistory({ type: 'contabilidad', isNavBackForward });
    }

    // Don't close main views, this is an overlay modal
    const view = document.getElementById('contabilidad-modal');
    const inner = document.getElementById('conta-modal-inner');
    view.classList.remove('hidden');
    
    setTimeout(() => {
        view.classList.remove('opacity-0');
        if (inner) {
            inner.classList.replace('scale-95', 'scale-100');
            inner.classList.replace('opacity-0', 'opacity-100');
        }
    }, 10);

    fetchContabilidadMonth();
};

window.closeContabilidadView = function() {
    const view = document.getElementById('contabilidad-modal');
    const inner = document.getElementById('conta-modal-inner');
    view.classList.add('opacity-0');
    if (inner) {
        inner.classList.replace('scale-100', 'scale-95');
        inner.classList.replace('opacity-100', 'opacity-0');
    }
    setTimeout(() => {
        view.classList.add('hidden');
    }, 300);
};

window.changeContabilidadMonth = function(delta) {
    currentContaMonth.setMonth(currentContaMonth.getMonth() + delta);
    fetchContabilidadMonth();
};

window.fetchContabilidadMonth = async function() {
    const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
    const monthNum = currentContaMonth.getMonth();
    const yearNum = currentContaMonth.getFullYear();
    document.getElementById('contabilidad-month-label').innerText = `${monthNames[monthNum]} ${yearNum}`;

    document.getElementById('conta-index-warning').innerHTML = '';
    document.getElementById('conta-total-tarjeta').innerText = '...';
    document.getElementById('conta-total-efectivo').innerText = '...';
    document.getElementById('conta-total-bizum').innerText = '...';
    document.getElementById('conta-table-body').innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-400 text-sm font-bold"><div class="flex flex-col items-center justify-center"><svg class="w-6 h-6 animate-spin text-blue-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Cargando...</div></td></tr>`;

    // Active boundaries 
    const startObj = new Date(yearNum, monthNum, 1, 0, 0, 0);
    const endObj = new Date(yearNum, monthNum + 1, 0, 23, 59, 59);
    
    const startStr = `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-01`;
    const endStr = `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-31`;

    try {
        // DUAL FALLBACK QUERY STRATEGY:
        // Query 1: Extract all explicitly cash-flow documented items in this month window.
        // Query 2: Extract all old/legacy items assigned sequentially via the old dive 'date' method.
        const q1 = db.collectionGroup('history').where('paidAt', '>=', startObj).where('paidAt', '<=', endObj).get();
        const q2 = db.collectionGroup('history').where('date', '>=', startStr).where('date', '<=', endStr).get();
        
        let snapshots = [];
        try {
            const results = await Promise.allSettled([q1, q2]);
            const rejections = results.filter(r => r.status === 'rejected');
            
            if (rejections.length > 0) {
                let errHtml = `Error de Índice Firebase.<br><span class="text-xs text-red-400 font-normal">La base de datos se está optimizando o requiere índices. (Tardan ~5 minutos en activarse).</span><br><br>`;
                
                let linkCount = 0;
                rejections.forEach((rej, idx) => {
                    console.error("Index Error:", rej.reason);
                    const errUrlMatch = String(rej.reason).match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
                    if (errUrlMatch) {
                        linkCount++;
                        errHtml += `<a href="${errUrlMatch[0]}" target="_blank" class="px-5 py-2 inline-block bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 shadow-sm mt-2">🚀 Crear Índice ${linkCount}</a><br>`;
                    }
                });
                
                if (linkCount > 0) {
                    const warnDiv = document.getElementById('conta-index-warning');
                    if (warnDiv) {
                        warnDiv.innerHTML = `<div class="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6 shadow-sm"><span class="font-bold text-amber-800 block mb-2">⚠️ Modo Inicialización Parcial</span><div class="text-[11px] text-amber-700 leading-relaxed max-w-2xl">Firebase está generando los índices en sus servidores. Mientras tanto, la app funcionará mediante un escaneo maestro del directorio (puede tardar un poco dependiendo de tu base de clientes).<br><br>${errHtml}</div></div>`;
                    }
                    
                    // BRUTE FORCE FALLBACK
                    const allSnaps = [];
                    // Ensure window.customerDatabase exists. If it doesn't, this will crash the try block and go to generalErr (which is safe)
                    const batchPromises = window.customerDatabase.map(c => db.collection('mangamar_customers').doc(c.dni).collection('history').get());
                    const bruteResults = await Promise.all(batchPromises);
                    bruteResults.forEach(res => {
                         res.forEach(doc => allSnaps.push(doc));
                    });
                    snapshots = [allSnaps, []]; 
                } else {
                     throw new Error(rejections[0].reason);
                }
            } else {
                 snapshots = results.map(r => r.value);
            }
        } catch (generalErr) {
            console.error("Query execution error:", generalErr);
            document.getElementById('conta-table-body').innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-600 text-sm font-bold"><div class="flex flex-col items-center justify-center">Error al consultar datos. Comprueba la conexión o consola.</div></td></tr>`;
            return;
        }

        // Deduplicate
        const uniqueDocs = new Map();
        snapshots[0].forEach(doc => uniqueDocs.set(doc.ref.path, doc));
        snapshots[1].forEach(doc => uniqueDocs.set(doc.ref.path, doc));

        activeContabilidadData = { tarjeta: [], bizum: [], efectivo: [] };
        let subTarj = 0; let subBiz = 0; let subEfe = 0;

        const groupedDocs = new Map();

        uniqueDocs.forEach(docSnap => {
            const data = docSnap.data();
            
            // Validate it's paid revenue
            if (data.paymentStatus !== 'paid' && data.type !== 'pago') return;

            // HORIZON CUTOFF: Prevent double counting for any checkout done after the strict ledger patch (April 18, 2026)
            const isStrictLedgerEra = data.paidAt && (data.paidAt.toDate ? data.paidAt.toDate().getTime() : new Date(data.paidAt).getTime()) >= new Date('2026-04-18T00:00:00Z').getTime();
            
            // If we are in the strict ledger era, ONLY 'pago' tokens are allowed to represent revenue.
            // Dives/Products with paymentStatus='paid' are ignored because they are covered by a 'pago' token.
            if (isStrictLedgerEra && data.type !== 'pago') return;

            // Is it legally within the requested month?
            let isCurrentMonth = false;
            let displayDate = data.date;
            let paidTimeKey = 'legacy'; // Key to group multi-activity checkouts
            
            if (data.paidAt) {
                 // Has formal timestamp
                 const paidObj = data.paidAt.toDate ? data.paidAt.toDate() : new Date(data.paidAt);
                 if (paidObj >= startObj && paidObj <= endObj) {
                     isCurrentMonth = true;
                     displayDate = paidObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                     paidTimeKey = paidObj.getTime();
                 }
            } else {
                 // Fallback to legacy date
                 if (data.date && data.date >= startStr && data.date <= endStr) {
                     isCurrentMonth = true;
                     const parts = data.date.split('-');
                     displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                 }
            }

            if (!isCurrentMonth) return;

            // Calculate precise monetary extraction
            let amount = 0;
            if (data.type === 'pago') {
                amount = Math.abs(parseFloat(data.customPrice) || 0);
            } else {
                amount = parseFloat(window.calculateDivePrice(data).total) || 0;
            }
            
            if (amount <= 0) return;

            if (!docSnap.ref.parent || !docSnap.ref.parent.parent) return;
            const safeMethod = (data.paymentMethod || 'efectivo').toLowerCase().trim();
            const parentDni = docSnap.ref.parent.parent.id;
            
            let conceptDisplay = '';
            let groupSubIdentifier = ''; // Make atomic pagos unique in UI list

            if (data.type === 'pago') {
                conceptDisplay = data.description || 'Abono Parcial';
                groupSubIdentifier = '_' + docSnap.id;
            } else if (data.type === 'producto' || data.type === 'servicio') {
                conceptDisplay = data.description;
            } else {
                conceptDisplay = data.site || 'Inmersión';
            }

            const groupKey = `${parentDni}_${safeMethod}_${paidTimeKey}${groupSubIdentifier}`;

            if (groupedDocs.has(groupKey)) {
                 const existing = groupedDocs.get(groupKey);
                 existing.amount += amount;
                 existing.count += 1;
                 if (existing.count === 2) {
                     existing.concept = existing.concept + " (y otros)";
                 } else if (existing.concept.includes("Abono Parcial") || !existing.concept.includes("Liquidación")) {
                      existing.concept = `Liquidación Múltiple (${existing.count} conceptos)`;
                 } else if (existing.concept.includes("Liquidación")) {
                      existing.concept = `Liquidación Múltiple (${existing.count} conceptos)`;
                 }
            } else {
                 groupedDocs.set(groupKey, {
                     id: docSnap.id,
                     dni: parentDni,
                     date: displayDate,
                     amount: amount,
                     concept: conceptDisplay,
                     method: safeMethod,
                     count: 1
                 });
            }
        });

        groupedDocs.forEach(record => {
            if (record.method === 'tarjeta') { activeContabilidadData.tarjeta.push(record); subTarj += record.amount; }
            else if (record.method === 'bizum') { activeContabilidadData.bizum.push(record); subBiz += record.amount; }
            else { activeContabilidadData.efectivo.push(record); subEfe += record.amount; }
        });

        const numFormat = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        document.getElementById('conta-total-tarjeta').innerText = numFormat.format(subTarj) + ' €';
        document.getElementById('conta-total-efectivo').innerText = numFormat.format(subEfe) + ' €';
        document.getElementById('conta-total-bizum').innerText = numFormat.format(subBiz) + ' €';

        document.getElementById('conta-table-body').innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-400 text-sm font-bold">Haz clic en un origen arriba para ver el desglose</td></tr>`;
        document.getElementById('conta-table-dot').classList.add('hidden');
        document.getElementById('conta-table-title').innerText = "Selecciona un método";
        document.getElementById('conta-table-count').innerText = "";

        // Reset ring highlights
        ['tarjeta', 'efectivo', 'bizum'].forEach(m => document.getElementById('conta-card-' + m).classList.remove('ring-blue-500', 'ring-emerald-500', 'ring-teal-500', 'bg-blue-50/50', 'bg-emerald-50/50', 'bg-teal-50/50'));

    } catch (e) {
        console.error("General error loading accounting:", e);
        showToast("Error de lectura de base de datos.", "error");
    }
};

window.openContabilidadCustomerProfile = function(dni, nameFallback) {
    document.getElementById('contabilidad-modal').classList.add('hidden');
    window._returnToContabilidadOnProfileClose = true;
    window.openCustomerProfile(dni, nameFallback, false, 'historial');
};

window.selectContabilidadMethod = function(method) {
    // Styling toggle
    ['tarjeta', 'efectivo', 'bizum'].forEach(m => document.getElementById('conta-card-' + m).classList.remove('ring-blue-500', 'ring-emerald-500', 'ring-teal-500', 'bg-blue-50/50', 'bg-emerald-50/50', 'bg-teal-50/50'));
    
    let ringClass = 'ring-emerald-500'; let bgClass = 'bg-emerald-50/50'; let dotClass = 'bg-emerald-500';
    if (method === 'tarjeta') { ringClass = 'ring-blue-500'; bgClass = 'bg-blue-50/50'; dotClass = 'bg-blue-500'; }
    if (method === 'bizum') { ringClass = 'ring-teal-500'; bgClass = 'bg-teal-50/50'; dotClass = 'bg-teal-500'; }

    const card = document.getElementById('conta-card-' + method);
    card.classList.add(ringClass, bgClass);

    const dot = document.getElementById('conta-table-dot');
    dot.className = `w-2 h-2 rounded-full ${dotClass}`;

    document.getElementById('conta-table-title').innerText = `Desglose: ${method.charAt(0).toUpperCase() + method.slice(1)}`;
    
    const records = activeContabilidadData[method] || [];
    document.getElementById('conta-table-count').innerText = `${records.length} cobros`;

    // Sort by Date descending naturally
    try {
        records.sort((a,b) => {
            const dA = a.date ? a.date.split('/').reverse().join('') : '0';
            const dB = b.date ? b.date.split('/').reverse().join('') : '0';
            return (dB - dA);
        });
    } catch(err) {
        console.warn("Could not sort records organically", err);
    }

    let html = '';
    try {
        records.forEach(r => {
            const cInfo = customerDatabase.find(c => c.dni === r.dni) || {};
            const fullName = window.getFullName(cInfo).trim() || cInfo.nombre || r.dni;
            
            let typeBadge = '';
            if (r.concept.includes('Abono') || r.concept.includes('PAGO')) {
                typeBadge = `<span class="px-1 bg-emerald-100 text-emerald-700 rounded text-[8px] uppercase font-black mr-2">ABONO</span>`;
            }

            html += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                <td class="py-2.5 px-4 text-xs font-bold text-slate-500 align-middle shrink-0 w-32">${r.date}</td>
                <td class="py-2.5 px-4 align-middle">
                     <div class="text-[11px] font-black tracking-widest text-[#242b3d] leading-tight cursor-pointer hover:text-blue-600 transition-colors" onclick="window.openContabilidadCustomerProfile('${r.dni}', '${fullName.replace(/'/g, "\\'")}')">${fullName.toUpperCase()}</div>
                     <div class="text-[9px] font-medium text-slate-400 mt-0.5">${r.dni}</div>
                </td>
                <td class="py-2.5 px-4 align-middle">
                     <div class="text-[11px] font-bold text-slate-600 flex items-center leading-tight">${typeBadge}${r.concept}</div>
                </td>
                <td class="py-2.5 px-4 align-middle text-right shrink-0 w-32">
                     <div class="font-black text-slate-800 text-sm whitespace-nowrap">${r.amount.toFixed(2)} €</div>
                </td>
            </tr>`;
        });
    } catch(err) {
        html = `<tr><td colspan="4" class="p-8 text-center text-red-500 font-mono text-xs whitespace-pre-wrap">${err.stack}</td></tr>`;
    }

    if (records.length === 0) {
        html = `<tr><td colspan="4" class="p-8 text-center"><div class="text-3xl mb-2">💸</div><div class="text-sm font-bold text-slate-400">Sin ingresos registrados en este canal</div></td></tr>`;
    }
    
    document.getElementById('conta-table-body').innerHTML = html;
};