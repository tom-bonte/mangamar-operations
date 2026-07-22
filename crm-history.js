// AND reaches into the actual boat schedule to rip the diver out.
window.deleteHistoryItem = async function (dni, boatId, monthKey, itemType = 'buceo') {
    const isPago = itemType === 'pago';
    const isProd = itemType === 'producto' || itemType === 'servicio';
    const alertMsg = isPago ? 
        "⚠️ ¿Estás seguro de que quieres anular este PAGO?\n\nEsto ajustará el balance del cliente y eliminará el registro de los ingresos." : 
        (isProd ? "⚠️ ¿Estás seguro de que quieres anular este PRODUCTO/SERVICIO de la cuenta?" : "⚠️ ¿Estás seguro de que quieres anular este buceo?\n\nEsto ELIMINARÁ el cobro de la ficha Y SACARÁ físicamente a esta persona del barco en el calendario.");

    showAppConfirm(alertMsg, async () => {
        try {
            // OPTIMISTIC FAST PATH!
            // 1. Immediately remove from local RAM array
            if (window.activeFichaRawDocs) {
                window.activeFichaRawDocs = window.activeFichaRawDocs.filter(doc => doc.id !== boatId);
            }
            
            // Get current active tab content layer
            const contextLayer = document.getElementById('tab-content-caja').classList.contains('hidden') ? 
                (document.getElementById('tab-content-pagos').classList.contains('hidden') ? 'historial' : 'pagos') : 'caja';

            // Recalculate and render immediately
            window.recalculateFichaHistory(dni);
            window.renderFichaFromCache(dni, contextLayer);
            
            showToast("Registro anulado con éxito.");
            closeAppConfirm(); // Make sure to close confirm modal instantly!

            // Now perform Firestore operations in the background
            let pagoData = null;
            if (isPago) {
                const pagoSnap = await db.collection('mangamar_customers').doc(dni).collection('history').doc(boatId).get();
                if (pagoSnap.exists) pagoData = pagoSnap.data();
            }

            // A. Shred receipt in the Ficha
            const deleteHistoryPromise = db.collection('mangamar_customers').doc(dni).collection('history').doc(boatId).delete();

            // B. Revert linked payments back to pending
            let revertPromise = Promise.resolve();
            if (isPago && pagoData) {
                if (pagoData.settledDocIds && Array.isArray(pagoData.settledDocIds)) {
                    const batch = db.batch();
                    const historyRef = db.collection('mangamar_customers').doc(dni).collection('history');
                    pagoData.settledDocIds.forEach(id => {
                        batch.update(historyRef.doc(id), {
                            paymentStatus: 'pending',
                            paymentMethod: firebase.firestore.FieldValue.delete(),
                            paidAt: firebase.firestore.FieldValue.delete(),
                            paidBy: firebase.firestore.FieldValue.delete()
                        });

                        // Clean up RAM activeBoatItem groups
                        if (window.activeBoatItem && window.activeBoatItem.id === id && window.activeBoatItem.groups) {
                            window.activeBoatItem.groups.forEach(g => {
                                (g.guests || []).forEach(gst => {
                                    if ((gst.dni || '').toLowerCase() === (dni || '').toLowerCase()) {
                                        delete gst.paymentStatus;
                                        delete gst.paymentMethod;
                                        delete gst.paidBy;
                                    }
                                });
                            });
                        }
                    });

                    // Clear RAM caches immediately
                    if (window.activeTripPayments && window.activeTripPayments[dni]) {
                        delete window.activeTripPayments[dni];
                    }

                    // Re-render groups if manifest is open
                    if (typeof renderGroups === 'function' && document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) {
                        setTimeout(() => renderGroups(true), 50);
                    }

                    const syncPromises = pagoData.settledDocIds.map(id => 
                        window.syncPaymentToManifest(dni, id, 'pending')
                    );
                    revertPromise = Promise.all([batch.commit(), ...syncPromises]);
                } else if (pagoData.description && pagoData.description.includes('Liquidación')) {
                    showToast("⚠️ Pago antiguo: Vuelve a marcar las inmersiones como 'Pendientes' manualmente.", 5000);
                }
            }

            // C. ONLY rip them out of the physical boat if it was actually a boat trip
            let ripPromise = Promise.resolve();
            if (!isPago && !isProd) {
                let trip = internalTrips.find(t => t.id === boatId);
                if (trip) {
                    let clonedTrip = JSON.parse(JSON.stringify(trip));
                    clonedTrip.groups.forEach(g => {
                        g.guests = g.guests.filter(guest => guest.dni !== dni);
                    });
                    clonedTrip.guests = clonedTrip.guests.filter(guest => guest.dni !== dni);

                    ripPromise = db.collection('mangamar_monthly').doc(monthKey).update({
                        [`allocations.${boatId}`]: clonedTrip
                    });

                    // Update in RAM for main calendar view
                    const ramTripIdx = window.internalTrips.findIndex(t => t.id === boatId);
                    if (ramTripIdx > -1) {
                        window.internalTrips[ramTripIdx] = clonedTrip;
                    }
                    if (window.mergeAndRender) window.mergeAndRender();
                } else {
                    // Fallback to fetch from Firestore directly and update (cross-month safety)
                    ripPromise = (async () => {
                        const monthlyRef = db.collection('mangamar_monthly').doc(monthKey);
                        const monthlySnap = await monthlyRef.get();
                        if (monthlySnap.exists) {
                            const data = monthlySnap.data();
                            const allocations = data.allocations || {};
                            const dbTrip = allocations[boatId];
                            if (dbTrip) {
                                let clonedTrip = JSON.parse(JSON.stringify(dbTrip));
                                if (clonedTrip.groups) {
                                    clonedTrip.groups.forEach(g => {
                                        if (g.guests) g.guests = g.guests.filter(guest => guest.dni !== dni);
                                    });
                                }
                                if (clonedTrip.guests) {
                                    clonedTrip.guests = clonedTrip.guests.filter(guest => guest.dni !== dni);
                                }
                                await monthlyRef.update({
                                    [`allocations.${boatId}`]: clonedTrip
                                });
                            }
                        }
                    })();
                }
            }

            // Wait for all database updates in the background
            await Promise.all([deleteHistoryPromise, revertPromise, ripPromise]);

            // Recalculate outstanding debt in the background
            if (typeof window.updateCustomerOutstandingDebt === 'function') {
                window.updateCustomerOutstandingDebt(dni);
            }

            // --- GARBAGE COLLECTOR TRIGGER ---
            if (window.cleanOrphanedInsurance) window.cleanOrphanedInsurance(dni);

            if (!document.getElementById('today-divers-modal').classList.contains('hidden')) {
                openTodayDiversModal();
            }

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
                batch.update(ref, { 
                    paymentStatus: 'pending',
                    paymentMethod: firebase.firestore.FieldValue.delete(),
                    paidAt: firebase.firestore.FieldValue.delete(),
                    paidBy: firebase.firestore.FieldValue.delete()
                });

                // Clean up RAM activeBoatItem groups
                if (window.activeBoatItem && window.activeBoatItem.id === item.docId && window.activeBoatItem.groups) {
                    window.activeBoatItem.groups.forEach(g => {
                        (g.guests || []).forEach(gst => {
                            if ((gst.dni || '').toLowerCase() === (item.dni || '').toLowerCase()) {
                                delete gst.paymentStatus;
                                delete gst.paymentMethod;
                                delete gst.paidBy;
                            }
                        });
                    });
                }
            });
            await batch.commit();

            // Clear RAM caches immediately
            itemsToUnpay.forEach(item => {
                if (window.activeTripPayments && window.activeTripPayments[item.dni]) {
                    delete window.activeTripPayments[item.dni];
                }
            });

            // Re-render groups if manifest is open
            if (typeof renderGroups === 'function' && document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) {
                setTimeout(() => renderGroups(true), 50);
            }

            // Sync each to manifest allocations in Firestore
            const syncPromises = itemsToUnpay.map(item => 
                window.syncPaymentToManifest(item.dni, item.docId, 'pending')
            );
            await Promise.all(syncPromises);

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

    const items = [...window.activeHistorialSelection];

    showAppConfirm(`⚠️ ATENCIÓN: ¿Anular ${items.length} registro(s) seleccionado(s) permanentemente?\n\nEsto borrará todos los cobros seleccionados de la ficha Y SACARÁ FÍSICAMENTE a la persona de esos marcos en el calendario.`, async () => {
        try {
            const dni = items[0].dni;

            // OPTIMISTIC FAST PATH!
            // 1. Immediately remove all deleted docIds from RAM
            const deletedDocIds = new Set(items.map(item => item.docId));
            if (window.activeFichaRawDocs) {
                window.activeFichaRawDocs = window.activeFichaRawDocs.filter(doc => !deletedDocIds.has(doc.id));
            }

            // Get current active tab context layer
            const contextLayer = document.getElementById('tab-content-caja').classList.contains('hidden') ? 
                (document.getElementById('tab-content-pagos').classList.contains('hidden') ? 'historial' : 'pagos') : 'caja';

            // 2. Instantly recalculate and render the UI
            window.recalculateFichaHistory(dni);
            window.renderFichaFromCache(dni, contextLayer);

            showToast("✅ Registros anulados con éxito");
            window.historialClearSelection();
            closeAppConfirm();

            // Background processing:
            // 1. Delete history documents from CRM history in parallel!
            const deleteHistoryPromises = items.map(item => 
                db.collection('mangamar_customers').doc(dni).collection('history').doc(item.docId).delete()
            );

            // 2. Collect all unique months we need to touch in `mangamar_monthly`
            const updatesByMonth = {};
            const monthsToFetchDirectly = new Set();

            for (const item of items) {
                const trip = internalTrips.find(t => t.id === item.docId);
                if (trip) {
                    if (!updatesByMonth[item.monthKey]) updatesByMonth[item.monthKey] = {};
                    let clonedTrip = JSON.parse(JSON.stringify(trip));
                    if (clonedTrip.groups) clonedTrip.groups.forEach(g => {
                        if (g.guests) g.guests = g.guests.filter(guest => guest.dni !== dni);
                    });
                    if (clonedTrip.guests) clonedTrip.guests = clonedTrip.guests.filter(guest => guest.dni !== dni);

                    updatesByMonth[item.monthKey][`allocations.${item.docId}`] = clonedTrip;

                    // Update in RAM as well
                    const ramTripIdx = window.internalTrips.findIndex(t => t.id === item.docId);
                    if (ramTripIdx > -1) {
                        window.internalTrips[ramTripIdx] = clonedTrip;
                    }
                } else {
                    // Not in RAM, we need to fetch and edit the monthly document directly!
                    monthsToFetchDirectly.add(item.monthKey);
                }
            }

            // Execute all updates for months we had in RAM
            const ramUpdatesPromises = [];
            const monthKeys = Object.keys(updatesByMonth);
            if (monthKeys.length > 0) {
                const batch = db.batch();
                monthKeys.forEach(mk => {
                    batch.update(db.collection('mangamar_monthly').doc(mk), updatesByMonth[mk]);
                });
                ramUpdatesPromises.push(batch.commit());
            }

            // Fetch and update monthly docs for items NOT in RAM
            const directUpdatesPromises = [];
            if (monthsToFetchDirectly.size > 0) {
                for (const mk of monthsToFetchDirectly) {
                    const promise = (async () => {
                        const monthlyRef = db.collection('mangamar_monthly').doc(mk);
                        const monthlySnap = await monthlyRef.get();
                        if (monthlySnap.exists) {
                            const data = monthlySnap.data() || {};
                            const allocations = data.allocations || {};
                            const updatePayload = {};
                            let updatedAny = false;

                            items.forEach(item => {
                                if (item.monthKey === mk && allocations[item.docId]) {
                                    let clonedTrip = JSON.parse(JSON.stringify(allocations[item.docId]));
                                    if (clonedTrip.groups) {
                                        clonedTrip.groups.forEach(g => {
                                            if (g.guests) g.guests = g.guests.filter(guest => guest.dni !== dni);
                                        });
                                    }
                                    if (clonedTrip.guests) {
                                        clonedTrip.guests = clonedTrip.guests.filter(guest => guest.dni !== dni);
                                    }
                                    updatePayload[`allocations.${item.docId}`] = clonedTrip;
                                    updatedAny = true;
                                }
                            });

                            if (updatedAny) {
                                await monthlyRef.update(updatePayload);
                            }
                        }
                    })();
                    directUpdatesPromises.push(promise);
                }
            }

            if (window.mergeAndRender) window.mergeAndRender();

            // Wait for all background tasks to finish
            await Promise.all([
                ...deleteHistoryPromises,
                ...ramUpdatesPromises,
                ...directUpdatesPromises
            ]);

            // Recalculate outstanding debt in the background
            if (typeof window.updateCustomerOutstandingDebt === 'function') {
                window.updateCustomerOutstandingDebt(dni);
            }

            if (window.cleanOrphanedInsurance) window.cleanOrphanedInsurance(dni);

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

window.inlineEditPrice = function(event, el, dni, docId, currentPrice) {
    event.stopPropagation();
    if (el.querySelector('input')) return;

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentPrice;
    // Styling to match the box exactly
    input.className = 'w-16 px-1 py-0.5 border-2 border-blue-500 rounded font-black text-right outline-none text-slate-800 shadow-sm bg-white';
    input.style.fontSize = 'inherit';

    const originalHTML = el.innerHTML;
    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();

    let isSaving = false;
    const save = async () => {
        if (isSaving) return;
        const val = parseFloat(input.value);
        
        // If invalid or unchanged, just revert
        if (isNaN(val) || val === currentPrice) {
            el.innerHTML = originalHTML;
            return;
        }

        isSaving = true;
        input.disabled = true;
        input.classList.replace('border-blue-500', 'border-slate-200');
        input.classList.add('opacity-50');

        try {
            await db.collection('mangamar_customers').doc(dni).collection('history').doc(docId).update({
                customPrice: val
            });
            showToast("✅ Precio guardado");
            const currentName = document.getElementById('profile-modal-name').innerText;
            window.openCustomerProfile(dni, currentName, true, 'historial');
        } catch (err) {
            console.error("Error updating price:", err);
            showToast("No se pudo guardar.", "error");
            el.innerHTML = originalHTML;
        }
    };

    input.onblur = save;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); el.innerHTML = originalHTML; }
    };
};

window.clearCustomerDeposits = async function (dni) {
    const alertMsg = "⚠️ ¿Estás seguro de que quieres eliminar TODOS los depósitos de este cliente?\n\nEsto pondrá a 0 tanto el depósito global de la ficha como las señales de todas las inmersiones pendientes.";

    showAppConfirm(alertMsg, async () => {
        try {
            closeAppConfirm();

            // 1. Update in-memory customer profile in customerDatabase
            const custIndex = customerDatabase.findIndex(c => window.isSameDni(c.dni, dni));
            if (custIndex !== -1) {
                customerDatabase[custIndex].deposit = 0;
                delete customerDatabase[custIndex].depositMethod;
                delete customerDatabase[custIndex].depositContasimple;
                customerDatabase[custIndex].deposits = [];
            }

            // 2. Update all pending history items in window.activeFichaDives (and window.activeFichaRawDocs)
            const pendingTripIds = [];
            if (window.activeFichaDives) {
                window.activeFichaDives.forEach(item => {
                    const { data, doc } = item;
                    const isPaid = data.paymentStatus === 'paid' || (data.type === 'pago' && !data.isPartialAbono);
                    if (!isPaid && data.type !== 'pago' && data.type !== 'producto' && data.type !== 'servicio' && data.localDeposit) {
                        data.localDeposit = 0;
                        data.localDepositMethod = '';
                        data.localDepositC = false;
                        pendingTripIds.push(doc.id);
                    }
                });
            }

            // Also reset in activeFichaRawDocs so re-rendering is aligned
            if (window.activeFichaRawDocs) {
                window.activeFichaRawDocs.forEach(doc => {
                    let data = typeof doc.data === 'function' ? doc.data() : doc.data;
                    const isPaid = data.paymentStatus === 'paid' || (data.type === 'pago' && !data.isPartialAbono);
                    if (!isPaid && data.type !== 'pago' && data.type !== 'producto' && data.type !== 'servicio' && data.localDeposit) {
                        data.localDeposit = 0;
                        data.localDepositMethod = '';
                        data.localDepositC = false;
                    }
                });
            }

            // Get current active tab content layer
            const contextLayer = document.getElementById('tab-content-caja').classList.contains('hidden') ? 
                (document.getElementById('tab-content-pagos').classList.contains('hidden') ? 'historial' : 'pagos') : 'caja';

            // 3. Re-render instantly
            window.recalculateFichaHistory(dni);
            window.renderFichaFromCache(dni, contextLayer);
            
            showToast("Depósitos eliminados con éxito.");

            // 4. Background updates to Firestore
            // A. Update customer document deposit field
            const customerRef = db.collection('mangamar_customers').doc(dni);
            await customerRef.set({
                deposit: 0,
                depositMethod: firebase.firestore.FieldValue.delete(),
                depositContasimple: firebase.firestore.FieldValue.delete(),
                deposits: []
            }, { merge: true });

            // B. Write customerDatabase update to master_list
            const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
            await window.safeMasterListWrite(cleanDatabase, 'clear-deposits');

            // C. Clean history items and manifest allocations for pending trips
            for (const tripId of pendingTripIds) {
                const historyRef = db.collection('mangamar_customers').doc(dni).collection('history').doc(tripId);
                await historyRef.set({
                    localDeposit: 0,
                    localDepositMethod: '',
                    localDepositC: firebase.firestore.FieldValue.delete()
                }, { merge: true }).catch(e => console.error("Error clearing history deposit:", e));

                // Sync to manifest allocations in background
                await window.syncPaymentToManifest(dni, tripId, 'pending', '', '', 0, '');

                // Update RAM activeBoatItem groups if that trip is currently open
                if (typeof activeBoatItem !== 'undefined' && activeBoatItem && activeBoatItem.id === tripId && activeBoatItem.groups) {
                    activeBoatItem.groups.forEach(g => {
                        (g.guests || []).forEach(gst => {
                            if (window.isSameDni(gst.dni, dni)) {
                                gst.localDeposit = 0;
                                gst.localDepositMethod = '';
                                delete gst.localDepositC;
                            }
                        });
                    });
                }
            }

            // Re-render groups if manifest editor is currently open
            if (typeof renderGroups === 'function' && document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) {
                renderGroups(true);
            }

            // Recalculate outstanding debt in CRM
            if (typeof window.updateCustomerOutstandingDebt === 'function') {
                await window.updateCustomerOutstandingDebt(dni);
            }

        } catch (e) {
            console.error("Error clearing deposits:", e);
            showAppAlert("Error al eliminar los depósitos.");
        }
    });
};
