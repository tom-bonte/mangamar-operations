
function calculateDivePrice(historyItem) {
    let dive = 0, tasa = 0, gas = 0, rental = 0, insurance = 0, computer = 0, course = 0, custom = 0;

    if (historyItem.type === 'producto' || historyItem.type === 'servicio' || historyItem.type === 'pago') {
        custom = parseFloat(historyItem.customPrice) || 0;
    } else {
        // 1. Dive Site Price (Split Tasa)
        const site = historyItem.site || '';
        const siteLower = site.toLowerCase().trim();
        
        let searchKeywords = [siteLower];
        const reserveSites = ['dentro', 'piles i', 'piles ii', 'morra', 'testa', 'paloma'];
        
        if (['cala', 'shore', 'aula'].includes(siteLower)) {
            searchKeywords = ['cala', 'shore', 'local'];
        } else if (siteLower === 'naranjito') {
            searchKeywords = ['naranjito'];
        } else if (siteLower === 'fuera') {
            searchKeywords = ['fuera'];
        } else if (reserveSites.some(s => siteLower.includes(s))) {
            searchKeywords = ['reserva marina', 'reserva'];
        }

        const normalize = str => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Try to find in dynamic prices first
        const dynamicMatch = (window.dynamicPrices || []).find(p => {
            if (!p.name || p.category !== 'Inmersiones') return false;
            const n = normalize(p.name);
            return searchKeywords.some(kw => n.includes(normalize(kw)));
        });

        let dynamicTasa = null;
        if (dynamicMatch) {
            dive = dynamicMatch.price || 0;
            if (dynamicMatch.tasa !== undefined && dynamicMatch.tasa !== null && dynamicMatch.tasa !== '') {
                dynamicTasa = parseFloat(dynamicMatch.tasa);
            }
        } else {
            // Fallbacks for core sites
            if (['cala', 'shore', 'aula'].includes(siteLower)) dive = 40;
            else if (siteLower === 'naranjito') dive = 45;
            else if (siteLower === 'fuera') dive = 50;
            else if (site) dive = 44; 
        }

        // --- TASA RULES (Dynamic Priority) ---
        if (dynamicTasa !== null) {
            tasa = dynamicTasa;
        } else if (siteLower === 'fuera') {
            tasa = 10;
        } else if (reserveSites.some(s => siteLower.includes(s))) {
            tasa = 5; // Default for Reserva Marina sites
        } else {
            tasa = 0; // Default for unknown sites (Cala, Naranjito, Carbonero, etc)
        }

        if (historyItem.hasBono) dive = 0; // BONUS DEDUCTION

        const findPrice = (searchStrings, defaultPrice) => {
            const dp = (window.dynamicPrices || []).find(p => {
                if (!p.name || ['Cursos', 'Especialidades'].includes(p.category)) return false;
                const n = normalize(p.name);
                return searchStrings.some(s => n === normalize(s) || n.includes(normalize(s)));
            });
            return dp ? dp.price : defaultPrice;
        };

        // 2. Gas
        if (historyItem.gas && historyItem.gas.includes('EAN')) gas = findPrice(['nitrox', 'ean'], 7);

        // 3. Rental
        if (historyItem.rental === 1) rental = findPrice(['pieza suelta', 'equipo ligero'], 10);
        else if (historyItem.rental === 2) rental = findPrice(['equipo completo', 'equipo pesado'], 15);

        // 4. Insurance
        const insClean = (historyItem.insurance || '').toString().replace(' ✔', '');
        if (insClean === '1D') insurance = findPrice(['seguro 1 dia', 'seguro diario', '1 dia', '1 día'], 10);
        else if (insClean === '1W') insurance = findPrice(['seguro 1 semana', 'seguro semanal', '1 semana'], 18);
        else if (insClean === '1M') insurance = findPrice(['seguro 1 mes', 'seguro mensual', '1 mes'], 24);
        else if (insClean === '1Y') insurance = findPrice(['seguro 1 año', 'seguro anual', '1 año'], 45);

        // 5. Computer Rental
        if (historyItem.computer === 'INC') {
            computer = 0;
        } else if (historyItem.computer) {
            computer = findPrice(['ordenador', 'alquiler ordenador', 'computadora'], 7);
        }

        // 6. Course Price Calculation
        if (historyItem.course) {
            const baseCourse = historyItem.baseCourse || historyItem.course.split(' | ')[0].trim();
            course = (historyItem.coursePrice !== undefined && historyItem.coursePrice !== null && historyItem.coursePrice !== 0)
                ? parseFloat(historyItem.coursePrice)
                : ((window.PRICES && window.PRICES[baseCourse]) ? window.PRICES[baseCourse] : 0);
            
            dive = 0;
            tasa = 0;
            if (historyItem.rental === 'INC') rental = 0;
            if (historyItem.insurance === 'INC') insurance = 0;
            if (historyItem.computer === 'INC') computer = 0;
        }
    }

    let total = dive + tasa + gas + rental + insurance + computer + course + custom;
    
    // Override if a customPrice is manually set on ANY record (including dives)
    if (historyItem.customPrice !== undefined && historyItem.customPrice !== null) {
        total = parseFloat(historyItem.customPrice) || 0;
        // Adjust components so the breakdown UI (small grey text) matches the manual total
        dive = total;
        tasa = 0; gas = 0; rental = 0; insurance = 0; computer = 0; course = 0; custom = 0;
    }

    return { dive, tasa, gas, rental, insurance, computer, course, custom, total };
}
window.calculateDivePrice = calculateDivePrice;

// ==========================================
// 12. PAYMENT & PENDING ORDERS ENGINE
// ==========================================

window.activePaymentContext = null;

window.syncPaymentToManifest = async function(dni, tripId, paymentStatus, paymentMethod = '', paidBy = '') {
    try {
        const trip = (window.mergedAllocations || []).find(t => t.id === tripId);
        if (!trip) return;

        const groups = JSON.parse(JSON.stringify(trip.groups || []));
        let updated = false;
        groups.forEach(g => {
            (g.guests || []).forEach(gst => {
                if ((gst.dni || '').toLowerCase() === (dni || '').toLowerCase()) {
                    if (paymentStatus === 'paid') {
                        gst.paymentStatus = 'paid';
                        gst.paymentMethod = paymentMethod;
                        gst.paidBy = paidBy;
                    } else {
                        delete gst.paymentStatus;
                        delete gst.paymentMethod;
                        delete gst.paidBy;
                    }
                    updated = true;
                }
            });
        });

        if (updated) {
            const monthKey = trip.date.substring(0, 7);
            const updates = {};
            updates[`allocations.${tripId}.groups`] = groups;
            
            if (trip.guests) {
                const flatGuests = JSON.parse(JSON.stringify(trip.guests));
                flatGuests.forEach(gst => {
                    if ((gst.dni || '').toLowerCase() === (dni || '').toLowerCase()) {
                        if (paymentStatus === 'paid') {
                            gst.paymentStatus = 'paid';
                            gst.paymentMethod = paymentMethod;
                            gst.paidBy = paidBy;
                        } else {
                            delete gst.paymentStatus;
                            delete gst.paymentMethod;
                            delete gst.paidBy;
                        }
                    }
                });
                updates[`allocations.${tripId}.guests`] = flatGuests;
            }
            await db.collection('mangamar_monthly').doc(monthKey).update(updates);
            console.log(`[syncPaymentToManifest] Updated manifest for trip ${tripId}, guest ${dni}`);
        }
    } catch (e) {
        console.error("[syncPaymentToManifest] Error syncing payment to manifest:", e);
    }
};

window.toggleCustomCollectorField = function() {
    const isCustom = document.getElementById('collector-radio-custom').checked;
    const wrapper = document.getElementById('payment-engine-custom-collector-wrapper');
    if (wrapper) {
        if (isCustom) {
            wrapper.classList.remove('hidden');
            const input = document.getElementById('payment-engine-custom-collector');
            if (input) input.focus();
        } else {
            wrapper.classList.add('hidden');
        }
    }
};

window.promptPaymentGateway = function(dni, totalDebt, docIds, mode) {
    window.activePaymentContext = {
        dni, totalDebt, docIds, mode, originalDeposit: 0
    };

    const profile = customerDatabase.find(c => c.dni === dni);
    if (profile && profile.deposit) {
        window.activePaymentContext.originalDeposit = profile.deposit;
        window.activePaymentContext.originalDepositMethod = profile.depositMethod || 'Efectivo';
    }

    document.getElementById('payment-engine-amount').value = totalDebt;
    document.getElementById('payment-engine-total-label').innerText = `${totalDebt}€`;
    
    // Reset inputs
    document.querySelector('input[name="payMethod"][value="Tarjeta"]').checked = true;
    document.getElementById('payment-engine-partial-label').classList.add('hidden');
    
    // Reset collector inputs
    const tbRadio = document.querySelector('input[name="payCollector"][value="TB"]');
    if (tbRadio) tbRadio.checked = true;
    const customWrapper = document.getElementById('payment-engine-custom-collector-wrapper');
    if (customWrapper) customWrapper.classList.add('hidden');
    const customInput = document.getElementById('payment-engine-custom-collector');
    if (customInput) customInput.value = '';
    
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

    const collectorRadio = document.querySelector('input[name="payCollector"]:checked');
    let collector = collectorRadio ? collectorRadio.value : 'TB';
    if (collector === 'Custom') {
        collector = (document.getElementById('payment-engine-custom-collector').value || '').trim().toUpperCase() || 'OTRO';
    }

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
                    paymentStatus: 'paid',
                    paymentMethod: method,
                    paidBy: collector,
                    isPartialAbono: true,
                    date: dateStr,
                },
                p: { dive:0, tasa:0, gas:0, rental:0, insurance:0, computer:0, course:0, custom: -Math.abs(amountPaid), total: -Math.abs(amountPaid) },
                cleanIns: 0, isCovered: false, isCourseCovered: false
            });
        } else {
            // Mark all items as paid locally
            ctx.docIds.forEach(id => {
                let dive = window.activeFichaDives.find(i => i.doc.id === id);
                if (dive) {
                    dive.data.paymentStatus = 'paid';
                    dive.data.paymentMethod = method;
                    dive.data.paidBy = collector;
                }
            });
            // Insert the liquidation payment with a proper p object
            const liqAmt = Math.abs(amountPaid);
            window.activeFichaDives.unshift({
                doc: { id: "temp_pago_" + Date.now() },
                data: { type: 'pago', description: `Liquidación de Cuenta (${method})`, customPrice: -liqAmt, paymentStatus: 'paid', paymentMethod: method, paidBy: collector, date: dateStr },
                p: { dive:0, tasa:0, gas:0, rental:0, insurance:0, computer:0, course:0, custom: -liqAmt, total: -liqAmt },
                cleanIns: 0, isCovered: false, isCourseCovered: false
            });
            // Inject deposit record locally
            if (ctx.originalDeposit > 0) {
                const depAmt = Math.abs(ctx.originalDeposit);
                window.activeFichaDives.unshift({
                    doc: { id: "temp_deposit_" + Date.now() },
                    data: { type: 'pago', description: `Aplicación de Depósito a Cuenta`, customPrice: -depAmt, paymentStatus: 'paid', paymentMethod: 'Depósito Previo', paidBy: collector, date: dateStr },
                    p: { dive:0, tasa:0, gas:0, rental:0, insurance:0, computer:0, course:0, custom: -depAmt, total: -depAmt },
                    cleanIns: 0, isCovered: false, isCourseCovered: false
                });
                // Clear deposit locally
                const profileIdx = customerDatabase.findIndex(c => c.dni === ctx.dni);
                if (profileIdx !== -1) customerDatabase[profileIdx].deposit = 0;
            }
        }
    }

    // Sync to manifest RAM immediately
    if (!isPartial) {
        if (!window.activeTripPayments) window.activeTripPayments = {};
        window.activeTripPayments[ctx.dni] = {
            paymentStatus: 'paid',
            paymentMethod: method,
            paidBy: collector
        };

        if (window.activeBoatItem && window.activeBoatItem.groups) {
            window.activeBoatItem.groups.forEach(g => {
                (g.guests || []).forEach(gst => {
                    if (gst.dni === ctx.dni && ctx.docIds.includes(window.activeBoatItem.id)) {
                        gst.paymentStatus = 'paid';
                        gst.paymentMethod = method;
                        gst.paidBy = collector;
                    }
                });
            });
        }
    }

    document.getElementById('payment-engine-modal').classList.add('opacity-0');
    setTimeout(() => {
        document.getElementById('payment-engine-modal').classList.add('hidden');
        btn.innerHTML = origHtml;
        btn.disabled = false;
        window.activePaymentContext = null;
    }, 300);

    // --- INSTANT RE-RENDER FROM LOCAL CACHE (zero Firestore reads) ---
    if (window.activeFichaDni === ctx.dni && window.activeFichaDives) {
        const contextLayer = document.getElementById('tab-content-caja') && !document.getElementById('tab-content-caja').classList.contains('hidden') ? 'caja' : 'historial';
        window.renderFichaFromCache(ctx.dni, contextLayer);
    } else if (!document.getElementById('today-divers-modal').classList.contains('hidden')) {
        openTodayDiversModal();
    }

    // Re-render open manifest modal groups if visible
    if (typeof renderGroups === 'function' && document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) {
        renderGroups(true);
    }

    // --- ASYNC BACKGROUND SYNC ---
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
                    paymentStatus: 'paid',
                    paymentMethod: method,
                    paidBy: collector,
                    isPartialAbono: true,
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
                        paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                        paidBy: collector
                    };
                    
                    // ONLY overwrite the payment method if it's a dive/product.
                    // Legacy Abonos correctly retain their original payment methods (Efectivo/Tarjeta)
                    if (isPagoItem) {
                        updatePayload.isPartialAbono = false;
                    } else {
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
                    paidBy: collector,
                    date: dateStr,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                    settledDocIds: ctx.docIds
                });

                if (ctx.mode === 'bulk') shouldClearDeposit = true;

                // ADDITION: Convert the standing deposit into a permanent pago record to balance the history
                if (shouldClearDeposit && ctx.originalDeposit > 0) {
                    const depositRef = historyRef.doc();
                    batch.set(depositRef, {
                        type: 'pago',
                        description: `Aplicación de Depósito a Cuenta`,
                        customPrice: -Math.abs(ctx.originalDeposit),
                        paymentStatus: 'paid',
                        paymentMethod: ctx.originalDepositMethod || 'Efectivo',
                        paidBy: collector,
                        date: dateStr,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        paidAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            await batch.commit();

            // Sync to Firestore manifest allocations
            if (!isPartial) {
                ctx.docIds.forEach(docId => {
                    const diveObj = window.activeFichaDives ? window.activeFichaDives.find(d => d.doc.id === docId) : null;
                    const isPagoItem = diveObj && diveObj.data && diveObj.data.type === 'pago';
                    if (!isPagoItem) {
                        window.syncPaymentToManifest(ctx.dni, docId, 'paid', method, collector);
                    }
                });
            }

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
                    paidAt: firebase.firestore.FieldValue.delete(),
                    paidBy: firebase.firestore.FieldValue.delete()
                });
                showToast("Dato restaurado a Pendiente.");
                
                // Sync back to manifest allocations in Firestore
                await window.syncPaymentToManifest(dni, boatId, 'pending');

                // Clear RAM caches immediately
                if (window.activeTripPayments && window.activeTripPayments[dni]) {
                    delete window.activeTripPayments[dni];
                }

                if (window.activeBoatItem && window.activeBoatItem.groups) {
                    window.activeBoatItem.groups.forEach(g => {
                        (g.guests || []).forEach(gst => {
                            if (gst.dni === dni && window.activeBoatItem.id === boatId) {
                                delete gst.paymentStatus;
                                delete gst.paymentMethod;
                                delete gst.paidBy;
                            }
                        });
                    });
                }
                
                if (window.activeFichaDni === dni) {
                    const currentName = document.getElementById('profile-modal-name').innerText;
                    const contextLayer = document.getElementById('tab-content-caja').classList.contains('hidden') ? 'historial' : 'caja';
                    openCustomerProfile(dni, currentName, false, contextLayer);
                } else {
                    openTodayDiversModal();
                }

                // If manifest is open, re-render to update classes
                if (typeof renderGroups === 'function' && document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) {
                    renderGroups(true);
                }
            } catch (e) {
                console.error(e);
                showAppAlert("Error al deshacer cobro.");
            }
        });
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
        const payload = {
            type: typeStr,
            description: desc,
            customPrice: price,
            paymentStatus: 'pending',
            date: dateStr,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('mangamar_customers').doc(window.activeFichaDni).collection('history').add(payload);
        
        document.getElementById('caja-new-desc').value = '';
        document.getElementById('caja-new-price').value = '';
        
        // Optimistically inject into local memory to avoid a 4-second network reload
        if (window.activeFichaRawDocs) {
            const fakeDoc = { id: docRef.id, data: () => payload };
            window.activeFichaRawDocs.unshift(fakeDoc);
            
            if (typeof window.recalculateFichaHistory === 'function') {
                window.recalculateFichaHistory(window.activeFichaDni);
                window.renderFichaFromCache(window.activeFichaDni, 'caja');
            }
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

window.generateFactura = function (targetDocId = null, isNavBackForward = false) {
    if (typeof isNavBackForward !== 'boolean') isNavBackForward = false;

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
        if (Math.abs(price) < 0.01) return;
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

        let isPercentDiscount = profile.discount > 0 && profile.discountType !== 'fixed' && !item.data.customPrice;
        let discountVal = parseFloat(profile.discount) || 0;
        
        let appliedDiveStr = isPercentDiscount ? `${diveName} (${discountVal}% Dto)` : diveName;
        
        if (item.data.customPrice !== undefined && item.data.customPrice !== null) {
            // MANUAL OVERRIDE: Show as a single consolidated line, skip separate extras
            addFacturaItem(itemsMap, appliedDiveStr, p.total);
            return; 
        }

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
            addFacturaItem(exentoMap, 'Tasa', p.tasa);
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

    recordModalHistory({ type: 'factura', args: [targetDocId], isNavBackForward });

    const targetTab = document.getElementById('tab-content-factura');
    if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('flex');
        if (isNavBackForward) window.hideAllNavModals('tab-content-factura');
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

window.applyDiscountManual = function() {
    console.log("Applying discount manual...");
    const valEl = document.getElementById('ficha-caja-discount');
    if (!valEl) return;
    const val = valEl.value;
    window.updateCustomerDiscount(val);
}

window.updateCustomerDiscount = function (val) {
    if (!window.activeFichaDni) {
        console.error("No active DNI for discount update");
        return;
    }
    
    let disc = parseFloat(val) || 0;
    if (disc < 0) disc = 0;

    const discType = window.activeDiscountType || 'percent';

    // 1. Update LOCAL database immediately for instant UI response
    if (typeof customerDatabase !== 'undefined' && Array.isArray(customerDatabase)) {
        let cxIndex = customerDatabase.findIndex(c => c.dni === window.activeFichaDni);
        if (cxIndex !== -1) {
            customerDatabase[cxIndex].discount = disc;
            customerDatabase[cxIndex].discountType = discType;
        }
    }

    // 2. Instant UI Update
    const currName = document.getElementById('profile-modal-name').innerText;
    if (typeof window.recalculateFichaHistory === 'function') {
        window.recalculateFichaHistory(window.activeFichaDni);
        window.renderFichaFromCache(window.activeFichaDni, 'caja');
    }

    // 3. Background Database Save
    (async () => {
        try {
            await db.collection("mangamar_directory").doc("master_list").update({ clients: customerDatabase });
            await db.collection('mangamar_customers').doc(window.activeFichaDni).set({ 
                discount: disc, 
                discountType: discType 
            }, { merge: true });
        } catch (e) {
            console.error("Error saving discount:", e);
            showToast("❌ Error al guardar descuento");
        }
    })();
}

window.setDiscountType = function(type, skipSave = false) {
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
    // User manually toggled type — save immediately if there's a value (and skipSave is false)
    if (!skipSave) {
        const val = document.getElementById('ficha-caja-discount').value;
        if (parseFloat(val) > 0) updateCustomerDiscount(val);
    }
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

window.openGroupCheckoutModal = function(isNavBackForward = false) {
    if (typeof isNavBackForward !== 'boolean') isNavBackForward = false;
    recordModalHistory({ type: 'group-checkout', isNavBackForward });

    if (!window.activeJointSelection || window.activeJointSelection.length === 0) return;

    let html = '';
    let total = 0;

    window.activeJointSelection.forEach(c => {
        let debt = c.debt || 0;
        let originalDebt = c.originalDebt !== undefined ? c.originalDebt : debt;
        total += debt;
        html += `
        <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg group hover:border-blue-200 transition-colors">
            <div class="cursor-pointer" onclick="openCustomerProfile('${c.dni}', '${c.nombre}')">
                <div class="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">${c.nombre}</div>
                <div class="text-[10px] font-black text-slate-400 font-mono">${c.dni}</div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden group-hover:block transition-all">Pago Parcial</span>
                <div class="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden transition-all">
                    <input type="number" 
                           step="0.01"
                           value="${debt.toFixed(2)}" 
                           max="${originalDebt}"
                           onchange="updateGroupCheckoutDebt('${c.dni}', this.value, ${originalDebt})"
                           class="w-20 text-right py-1.5 px-2 text-sm font-black ${debt < originalDebt ? 'text-amber-500' : 'text-slate-800'} focus:outline-none bg-transparent" />
                    <span class="text-sm font-black text-slate-500 pr-3 py-1.5 bg-slate-50 border-l border-slate-200">€</span>
                </div>
            </div>
        </div>`;
    });

    document.getElementById('group-checkout-diver-list').innerHTML = html;
    document.getElementById('group-checkout-total').innerText = total.toFixed(2) + ' €';
    document.getElementById('group-checkout-subtitle').innerText = `Liquidando a ${window.activeJointSelection.length} clientes`;
    
    document.getElementById('group-checkout-modal').classList.remove('hidden');
    if (isNavBackForward) window.hideAllNavModals('group-checkout-modal');
};

window.updateGroupCheckoutDebt = function(dni, val, maxDebt) {
    let newVal = parseFloat(val);
    if (isNaN(newVal) || newVal < 0) newVal = maxDebt;
    if (newVal > maxDebt) newVal = maxDebt;
    
    // Update activeJointSelection array directly
    let idx = window.activeJointSelection.findIndex(c => c.dni === dni);
    if (idx !== -1) {
        window.activeJointSelection[idx].debt = newVal;
    }
    
    // Refresh modal to update totals and colors
    openGroupCheckoutModal();
};

window.processGroupCheckout = async function(method) {
    if (!window.activeJointSelection || window.activeJointSelection.length === 0) return;

    const modal = document.getElementById('group-checkout-modal');
    modal.classList.add('pointer-events-none', 'opacity-50');

    // Make a copy of the selection
    const selection = [...window.activeJointSelection];
    const dateStr = new Date().toISOString().split('T')[0];

    // Optimistically update the "Día de Hoy" UI immediately for instant feedback
    const listRoot = document.getElementById('today-divers-list');
    if (listRoot) {
        selection.forEach(c => {
            // Only hide them if they are fully paid off
            let isPartial = c.debt < (c.originalDebt || c.debt);
            if (!isPartial) {
                Array.from(listRoot.children).forEach(div => {
                    if (div.innerHTML.includes(c.dni)) {
                        div.classList.add('opacity-0', 'transition-all', 'duration-300', 'scale-95');
                        setTimeout(() => div.remove(), 300);
                    }
                });
            }
        });
    }

    // Hide the group checkout modal and clear selection immediately
    modal.classList.add('hidden');
    modal.classList.remove('pointer-events-none', 'opacity-50');
    window.activeJointSelection = [];
    if (typeof updateJointCheckoutBar === 'function') updateJointCheckoutBar();

    // 2. BACKGROUND DATABASE SYNC (ASYNC)
    (async () => {
        try {
            const batch = db.batch();
            
            // Collect all pending docs for each DNI to build the batch
            for (let c of selection) {
                if (c.debt <= 0) continue; // No payment being made for this user

                const historyRef = db.collection('mangamar_customers').doc(c.dni).collection('history');
                const snap = await historyRef.where('paymentStatus', '==', 'pending').get();
                
                let docIds = [];
                snap.forEach(doc => docIds.push(doc.id));
                
                let isPartial = c.originalDebt !== undefined && c.debt < c.originalDebt;

                if (isPartial) {
                    // Partial Payment: Add an Abono Parcial and DO NOT mark pending items as paid
                    const abonoRef = historyRef.doc();
                    batch.set(abonoRef, {
                        type: 'pago',
                        description: `Abono Parcial Grupal (${method})`,
                        customPrice: -Math.abs(c.debt),
                        paymentStatus: 'paid',
                        paymentMethod: method,
                        isPartialAbono: true,
                        date: dateStr,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        paidAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    // Full Payment: Mark all items as paid and log a standard liquidation record
                    snap.forEach(doc => {
                        batch.update(doc.ref, { 
                            paymentStatus: 'paid',
                            paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                            paymentMethod: method 
                        });
                    });

                    const liquidacionRef = historyRef.doc();
                    batch.set(liquidacionRef, {
                        type: 'pago',
                        description: `Liquidación de Cuenta Grupal (${method})`,
                        customPrice: -Math.abs(c.debt),
                        paymentStatus: 'paid',
                        paymentMethod: method,
                        date: dateStr,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                        settledDocIds: docIds
                    });
                    
                    // Clear their deposits globally just like savePayment does ONLY IF full payment
                    let cxIdx = customerDatabase.findIndex(cust => cust.dni === c.dni);
                    if (cxIdx !== -1 && customerDatabase[cxIdx].deposit > 0) { 
                        customerDatabase[cxIdx].deposit = 0; 
                        await db.collection("mangamar_directory").doc("master_list").update({ clients: customerDatabase });
                    }
                }
            }

            // Commit the batch
            await batch.commit();

            showToast("Facturación Conjunta procesada correctamente.");
            
            // Re-render Dia de Hoy entirely if there were partial payments to update the displayed totals
            if (selection.some(c => c.debt < (c.originalDebt || c.debt))) {
                if (typeof openTodayDiversModal === 'function') openTodayDiversModal();
            }
            
        } catch (e) {
            console.error("Group Checkout Sync Error:", e);
            showToast("Fallo de red transparente durante el pago grupal.", "error");
        }
    })();
};

window.generateJointFactura = async function (repName, repDni, groupDiscount = 0, isNavBackForward = false) {
    if (typeof isNavBackForward !== 'boolean') isNavBackForward = false;

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
                    p.course = data.coursePrice ? data.coursePrice : ((window.PRICES && window.PRICES[baseCourse]) ? window.PRICES[baseCourse] : 0);
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

            let diveName = '';
            if (data.site === 'Fuera') diveName = 'Inmersión (Fuera)';
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

    recordModalHistory({ type: 'factura-joint', args: [repName, repDni, groupDiscount], isNavBackForward });

    document.getElementById('tab-content-factura').classList.remove('hidden');
    document.getElementById('tab-content-factura').classList.add('flex');
    if (isNavBackForward) window.hideAllNavModals('tab-content-factura');

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
        // showToast("✅ Documento liquidado correctamente.");

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