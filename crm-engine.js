// ==========================================
// 7. CUSTOMER CRM & PRICING ENGINE
// ==========================================

window.switchFichaTab = function(tabId) {
    // 1. Reset all buttons
    ['historial', 'caja', 'resumen', 'ficha'].forEach(id => {
        const btn = document.getElementById(`tab-btn-${id}`);
        if(btn) btn.className = 'pb-3 text-sm font-bold text-slate-500 border-b-[3px] border-transparent hover:text-slate-800 transition-all';
        const content = document.getElementById(`tab-content-${id}`);
        if(content) {
            content.classList.add('hidden');
            content.classList.remove('block');
        }
    });

    // 2. Activate selected
    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    activeBtn.className = 'pb-3 text-sm font-black text-blue-600 border-b-[3px] border-blue-600 transition-all';
    
    document.getElementById(`tab-content-${tabId}`).classList.remove('hidden');
    document.getElementById(`tab-content-${tabId}`).classList.add('block');
};

function calculateDivePrice(historyItem) {
    let dive = 0, tasa = 0, gas = 0, rental = 0, insurance = 0;
    
   // 1. Dive Site Price (Split Tasa)
    const site = historyItem.site;
    if (['Cala', 'Shore', 'Aula'].includes(site)) dive = 40;
    else if (site === 'Naranjito') dive = 45;
    else if (site === 'Fuera') { dive = 50; tasa = 10; }
    else { dive = 44; tasa = 5; } // Reserva Marina

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
    
    return { dive, tasa, gas, rental, insurance, total: dive + tasa + gas + rental + insurance };
}

// ==========================================
// 8. GLOBAL SEARCH & TODAY'S DIVERS
// ==========================================

function searchGlobalDivers(query) {
    const resEl = document.getElementById('global-search-results');
    query = query.toLowerCase().trim();
    if(query.length < 2) { resEl.innerHTML = ''; return; }
    
    const results = customerDatabase.filter(c => {
        const fullName = getFullName(c).toLowerCase();
        return fullName.includes(query) || (c.dni || '').toLowerCase().includes(query);
    }).slice(0, 15); // Show top 15 results
    
    if(results.length === 0) {
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
window.deleteHistoryItem = async function(dni, boatId, monthKey) {
    showAppConfirm("⚠️ ¿Estás seguro de que quieres anular este registro?\n\nEsto ELIMINARÁ el cobro de la ficha Y SACARÁ físicamente a esta persona del barco en el calendario.", async () => {
        try {
            // 1. Shred the receipt in the Ficha
            await db.collection('mangamar_customers').doc(dni).collection('history').doc(boatId).delete();
            
            // 2. Rip them out of the physical boat in the calendar
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

            // --- GARBAGE COLLECTOR TRIGGER ---
            if (window.cleanOrphanedInsurance) window.cleanOrphanedInsurance(dni);

            // 3. Refresh the UI dynamically
            const nombre = document.getElementById('profile-modal-name').innerText;
            openCustomerProfile(dni, nombre);
            
            if(!document.getElementById('today-divers-modal').classList.contains('hidden')) {
                openTodayDiversModal(); 
            }
            
            showToast("Registro anulado y cliente eliminado del barco.");
        } catch(e) {
            console.error(e); 
            showAppAlert("Error al eliminar el registro.");
        }
    });
}

// Global scrub that hits both the calendar arrays AND the customer Fichas
window.debugClearAllDivers = async function() {
    showAppConfirm("⚠️ TEST MODO DIOS: ¿VACIAR clientes de TODOS los barcos y BORRAR todos los historiales de cobro?", async () => {
        showToast("⏳ Purgando base de datos... (puede tardar unos segundos)");
        
        // 1. Wipe all Calendar Boats
        const updatesByMonth = {};
        internalTrips.forEach(t => {
            const monthKey = t.date.substring(0, 7);
            if (!updatesByMonth[monthKey]) updatesByMonth[monthKey] = {};
            
            const cloned = JSON.parse(JSON.stringify(t));
            if (cloned.groups) cloned.groups.forEach(g => g.guests = []); 
            cloned.guests = []; 
            
            updatesByMonth[monthKey][`allocations.${t.id}`] = cloned;
        });
        
        try {
            const monthKeys = Object.keys(updatesByMonth);
            if(monthKeys.length > 0) {
                const batch = db.batch();
                monthKeys.forEach(mk => {
                    const ref = db.collection('mangamar_monthly').doc(mk);
                    batch.update(ref, updatesByMonth[mk]);
                });
                await batch.commit();
            }

            // 2. Aggressively wipe ALL Customer Fichas using parallel execution via local database
            const deletePromises = [];
            if (customerDatabase && customerDatabase.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < customerDatabase.length; i += chunkSize) {
                    const chunk = customerDatabase.slice(i, i + chunkSize);
                    const chunkPromises = chunk.map(async cust => {
                        if (!cust.dni) return;
                        try {
                            const histSnap = await db.collection('mangamar_customers').doc(cust.dni).collection('history').get();
                            histSnap.forEach(hDoc => {
                                deletePromises.push(hDoc.ref.delete());
                            });
                        } catch(err) { console.error("Error reading history for", cust.dni, err); }
                    });
                    await Promise.all(chunkPromises);
                }
            }
            
            await Promise.all(deletePromises);
            
            showToast("✅ Barcos vaciados e historiales reseteados a 0€.");
            
            // Force a complete refresh so that state.js memory Arrays don't accidentally hold onto old debt data
            setTimeout(() => {
                window.location.reload();
            }, 800);
            
        } catch(e) {
            console.error(e); 
            showAppAlert("Error al vaciar la base de datos.");
        }
    });
}

// ==========================================
// 12. PAYMENT & PENDING ORDERS ENGINE
// ==========================================

// Toggles a dive between "paid" and "pending" in the database instantly using optimistic UI
window.togglePaymentStatus = async function(dni, boatId, currentStatus) {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    
    // 1. Optimistic DOM Update: Switch the button and row opacity
    const buttonElement = document.querySelector(`button[onclick="togglePaymentStatus('${dni}', '${boatId}', '${currentStatus}')"]`);
    if (buttonElement) {
        if (newStatus === 'paid') {
            buttonElement.outerHTML = `<button onclick="togglePaymentStatus('${dni}', '${boatId}', 'paid')" class="px-2.5 py-1 bg-green-50 text-green-600 border border-green-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-green-100 transition-colors shrink-0 w-full shadow-sm">Pagado</button>`;
        } else {
            buttonElement.outerHTML = `<button onclick="togglePaymentStatus('${dni}', '${boatId}', 'pending')" class="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5 shrink-0 w-full shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Pendiente</button>`;
        }
        
        // Find the TR safely: it could be directly in the table or nested
        const row = document.getElementById('profile-history-list')?.querySelector(`button[onclick*="'${boatId}'"]`)?.closest('tr');
        if (row) {
            if (newStatus === 'paid') {
                row.classList.add('opacity-70', 'hover:opacity-100');
            } else {
                row.classList.remove('opacity-70', 'hover:opacity-100');
            }
        }
    }

    // 2. Optimistic Data Model Update & Math Recalculation
    if (window.activeFichaDives) {
        const dive = window.activeFichaDives.find(d => d.doc.id === boatId);
        if (dive) {
            dive.data.paymentStatus = newStatus;
            
            let pendingTotal = 0;
            let grandTotal = 0;
            window.activeFichaDives.forEach(item => {
                grandTotal += item.p.total;
                if (item.data.paymentStatus !== 'paid') pendingTotal += item.p.total;
            });
            
            const profile = customerDatabase.find(c => c.dni === dni);
            const deposit = profile && profile.deposit ? profile.deposit : 0;
            const totalAPagar = pendingTotal - deposit;
            
            // Re-mount Caja fields
            const elDeuda = document.getElementById('ficha-caja-deuda');
            if (elDeuda) {
                elDeuda.innerText = `${pendingTotal} €`;
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
            }
            
            window.activeFichaPendingDocs = window.activeFichaDives.filter(d => d.data.paymentStatus === 'pending').map(d => d.doc.id);
            
            // Re-mount History Footer
            const tbody = document.getElementById('profile-history-list');
            if (tbody) {
                const summaryRows = Array.from(tbody.querySelectorAll('tr.bg-slate-50\\/80, tr.bg-emerald-50\\/50, tr.bg-amber-50, tr.bg-emerald-100, tr.bg-slate-50'));
                summaryRows.forEach(r => r.remove());
                
                let footerHtml = '';
                if (pendingTotal > 0 || deposit > 0) {
                    footerHtml += `
                    <tr class="bg-slate-50/80 border-t-2 border-slate-200">
                        <td colspan="3" class="py-2 px-3 text-right font-black text-slate-500 uppercase tracking-widest text-[9px] align-middle">Deuda Pendiente</td>
                        <td class="py-2 px-3 text-right font-black text-slate-700 text-sm align-middle">${pendingTotal} €</td>
                        <td></td>
                    </tr>`;
                    if (deposit > 0) {
                        footerHtml += `
                        <tr class="bg-emerald-50/50 border-t border-emerald-100">
                            <td colspan="3" class="py-2 px-3 text-right font-black text-emerald-600 uppercase tracking-widest text-[9px] align-middle">Señal / Anticipo</td>
                            <td class="py-2 px-3 text-right font-black text-emerald-600 text-sm align-middle">- ${deposit} €</td>
                            <td></td>
                        </tr>`;
                    }
                    footerHtml += `
                    <tr class="${totalAPagar <= 0 && pendingTotal > 0 ? 'bg-emerald-100' : 'bg-amber-50'} border-t ${totalAPagar <= 0 && pendingTotal > 0 ? 'border-emerald-200' : 'border-amber-200'}">
                        <td colspan="3" class="py-3 px-3 text-right font-black ${totalAPagar <= 0 && pendingTotal > 0 ? 'text-emerald-700' : 'text-amber-700'} uppercase tracking-widest text-[11px] align-middle">A Pagar Hoy</td>
                        <td class="py-3 px-3 text-right font-black ${totalAPagar <= 0 && pendingTotal > 0 ? 'text-emerald-600' : 'text-amber-600'} text-xl align-middle">${totalAPagar <= 0 ? '0' : totalAPagar} €</td>
                        <td></td>
                    </tr>`;
                } else if (grandTotal > 0) {
                    footerHtml += `
                    <tr class="bg-slate-50 border-t-2 border-slate-200">
                        <td colspan="3" class="py-3 px-3 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px] align-middle">Total Historial (Pagado)</td>
                        <td class="py-3 px-3 text-right font-black text-slate-400 text-lg align-middle">${grandTotal} €</td>
                        <td></td>
                    </tr>`;
                }
                tbody.insertAdjacentHTML('beforeend', footerHtml);
            }
        }
    }

    // 3. Background DB Update
    try {
        await db.collection('mangamar_customers').doc(dni).collection('history').doc(boatId).update({
            paymentStatus: newStatus
        });
        showToast(newStatus === 'paid' ? "✅ Marcado como Pagado" : "⚠️ Marcado como Pendiente");
        
        // Refresh the pending list if it's currently open in the background behind the modal
        if(!document.getElementById('today-divers-modal').classList.contains('hidden')) {
            switchTodayTab(document.getElementById('tab-today-pending').classList.contains('bg-white') ? 'pending' : 'all');
        }
    } catch(e) {
        console.error("Error updating payment status", e);
        showAppAlert("Error al actualizar el estado de pago. Refrescando visuales.");
        
        // Fallback: Hard reload if the database write failed over the network
        const nombre = document.getElementById('profile-modal-name').innerText;
        let activeTab = 'caja';
        ['historial', 'caja', 'resumen', 'ficha'].forEach(id => {
            if (!document.getElementById(`tab-content-${id}`).classList.contains('hidden')) activeTab = id;
        });
        openCustomerProfile(dni, nombre, false, activeTab);
    }
}

window.openCustomerProfile = async function(dni, nombre, isNavBackForward = false, targetTab = 'caja') {
    if (typeof isNavBackForward !== 'boolean') isNavBackForward = false;
    recordModalHistory({ type: 'customer', args: [dni, nombre], isNavBackForward });
    
    const customerInfo = customerDatabase.find(c => c.dni === dni) || { telefono: '', email: '', discount: 0 };
    const contactStr = [customerInfo.telefono, customerInfo.email].filter(Boolean).join(' • ');

    document.getElementById('profile-modal-name').innerText = nombre;
    document.getElementById('profile-modal-dni').innerText = contactStr ? `${dni}  —  ${contactStr}` : dni;
    window.activeFichaDni = dni;
    
    // Ficha auto-population details
    try {
        if(document.getElementById('ficha-tab-nombre')) {
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
            
            if (!isRed && (!typeStr || typeStr === '0' || typeStr === '---' || typeStr.toLowerCase() === 'no' || typeStr.toLowerCase() === 'none')) {
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
    } catch(e) {}
    
    const discountEl = document.getElementById('ficha-caja-discount');
    if (discountEl) discountEl.value = customerInfo.discount || 0;
    document.getElementById('profile-history-list').innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500 font-bold flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-blue-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Cargando historial...</td></tr>';
    document.getElementById('customer-profile-modal').classList.remove('hidden');

    try {
            const snapshot = await db.collection('mangamar_customers').doc(dni).collection('history').orderBy('date', 'desc').get();
            if(snapshot.empty) {
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
        let grandTotal = 0;
        let pendingTotal = 0;

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
                    activeInsExpiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
                }
            } else if (cleanIns === 'Propio' || cleanIns === 'INC') {
                isCovered = true;
                p.insurance = 0;
            }

            if (customerInfo.discount > 0) {
                p.dive = p.dive * (1 - (customerInfo.discount / 100));
                if (p.course) p.course = p.course * (1 - (customerInfo.discount / 100));
            }

            p.total = p.dive + p.tasa + p.gas + p.rental + p.insurance + (p.course || 0);
            processedDives.push({ doc, data, p, cleanIns, isCovered, isCourseCovered });
        });

        processedDives.reverse(); 

        processedDives.forEach(item => {
            const { doc, data, p, cleanIns, isCovered, isCourseCovered } = item;
            grandTotal += p.total;
            
            const isPaid = data.paymentStatus === 'paid';
            if (!isPaid) pendingTotal += p.total;

            let breakdownHtml = '';
            if (data.course) {
                let displayCourse = data.baseCourse || data.course.split(' | ')[0];
                if (!isCourseCovered) breakdownHtml += `<span class="text-pink-600 font-black">${p.course}€ ${displayCourse}</span>`;
                else breakdownHtml += `<span class="text-pink-400 font-bold">✔ Curso Incl.</span>`;
            } else {
                breakdownHtml = `<span class="text-slate-500">${p.dive}€ Inm.</span>`;
            }
            
            if (p.tasa > 0) breakdownHtml += `<span class="text-slate-300 mx-1.5">+</span><span class="text-amber-600 font-bold">${p.tasa}€ Tasa</span>`;
            const extrasTotal = p.gas + p.rental + p.insurance;
            if (extrasTotal > 0) breakdownHtml += `<span class="text-slate-300 mx-1.5">+</span><span class="text-slate-400">${extrasTotal}€ Ext.</span>`;
            
            const isNitrox = (data.gas || '').includes('EAN');
            const gasColor = isNitrox ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-50 text-blue-600 border-blue-200';
            const gasShortText = (data.gas || '15L Aire').replace('L ', ' ').replace('Aire', 'Air').replace('EAN', 'Nx');

            let rentalClass = 'bg-diagonal-yellow text-transparent border-yellow-200';
            let rentalText = '';
            if (data.rental === 1) rentalClass = 'bg-half-yellow border-yellow-400';
            else if (data.rental === 2) rentalClass = 'bg-full-yellow border-yellow-500';
            else if (data.rental === 'INC') {
                rentalClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner';
                rentalText = 'INC';
            }

            let bonoClass = data.hasBono ? 'bg-indigo-500 text-white border-indigo-600 font-bold' : 'bg-diagonal-indigo text-indigo-300 border-indigo-200';

            let insClass = 'bg-diagonal-red text-transparent border-red-200';
            let insText = '';
            if (cleanIns === 'INC') {
                insClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner';
                insText = 'INC'; 
            } else if (cleanIns !== '0' && cleanIns !== 0) {
                if (isCovered) {
                    insClass = 'bg-emerald-100 text-emerald-700 border-emerald-300';
                    insText = `✔ ${cleanIns}`; 
                } else {
                    insClass = 'bg-amber-500 text-white border-amber-600 font-bold shadow-sm';
                    insText = cleanIns; 
                }
            }

            const statusBtn = isPaid 
                ? `<button onclick="togglePaymentStatus('${dni}', '${doc.id}', 'paid')" class="px-2.5 py-1 bg-green-50 text-green-600 border border-green-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-green-100 transition-colors shrink-0 w-full shadow-sm">Pagado</button>`
                : `<button onclick="togglePaymentStatus('${dni}', '${doc.id}', 'pending')" class="px-2.5 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-amber-100 transition-colors flex items-center justify-center gap-1.5 shrink-0 w-full shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Pendiente</button>`;

            html += `
            <tr class="group border-b border-slate-100 hover:bg-blue-50 transition-colors h-12 ${isPaid ? 'opacity-70 hover:opacity-100' : ''}">
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
                        <div class="w-7 h-6 flex justify-center items-center rounded border text-[9px] font-black shrink-0 whitespace-nowrap ${insClass}">${insText}</div>
                        <div class="w-6 h-6 flex justify-center items-center rounded border text-[10px] font-bold shrink-0 ${bonoClass}" title="${data.hasBono ? 'Usa Bono' : 'Sin Bono'}">B</div>
                    </div>
                </td>
                <td class="py-2 px-3 text-right align-middle w-full">
                    <div class="flex items-center justify-end gap-3 w-full">
                        <div class="text-[9px] text-right truncate hidden sm:block">${breakdownHtml}</div>
                        <div class="font-black text-slate-800 text-sm whitespace-nowrap shrink-0">= ${p.total} €</div>
                        <div class="w-[85px] shrink-0 flex justify-end">${statusBtn}</div>
                    </div>
                </td>
                <td class="py-2 px-3 text-center align-middle shrink-0">
                    <button onclick="window.deleteHistoryItem('${dni}', '${doc.id}', '${data.date.substring(0, 7)}')" class="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50" title="Eliminar cobro y sacar del barco"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </td>
            </tr>`;
        });

        // --- NEW DYNAMIC MATH FOOTER ---
        const profile = customerDatabase.find(c => c.dni === dni);
        const deposit = profile && profile.deposit ? profile.deposit : 0;
        let totalAPagar = pendingTotal - deposit;

        if (pendingTotal > 0 || deposit > 0) {
            html += `
            <tr class="bg-slate-50/80 border-t-2 border-slate-200">
                <td colspan="3" class="py-2 px-3 text-right font-black text-slate-500 uppercase tracking-widest text-[9px] align-middle">Deuda Pendiente</td>
                <td class="py-2 px-3 text-right font-black text-slate-700 text-sm align-middle">${pendingTotal} €</td>
                <td></td>
            </tr>`;
            
            if (deposit > 0) {
                html += `
                <tr class="bg-emerald-50/50 border-t border-emerald-100">
                    <td colspan="3" class="py-2 px-3 text-right font-black text-emerald-600 uppercase tracking-widest text-[9px] align-middle">Señal / Anticipo</td>
                    <td class="py-2 px-3 text-right font-black text-emerald-600 text-sm align-middle">- ${deposit} €</td>
                    <td></td>
                </tr>`;
            }
            
            html += `
            <tr class="${totalAPagar <= 0 && pendingTotal > 0 ? 'bg-emerald-100' : 'bg-amber-50'} border-t ${totalAPagar <= 0 && pendingTotal > 0 ? 'border-emerald-200' : 'border-amber-200'}">
                <td colspan="3" class="py-3 px-3 text-right font-black ${totalAPagar <= 0 && pendingTotal > 0 ? 'text-emerald-700' : 'text-amber-700'} uppercase tracking-widest text-[11px] align-middle">A Pagar Hoy</td>
                <td class="py-3 px-3 text-right font-black ${totalAPagar <= 0 && pendingTotal > 0 ? 'text-emerald-600' : 'text-amber-600'} text-xl align-middle">${totalAPagar <= 0 ? '0' : totalAPagar} €</td>
                <td></td>
            </tr>`;
        } else if (grandTotal > 0) {
             html += `
            <tr class="bg-slate-50 border-t-2 border-slate-200">
                <td colspan="3" class="py-3 px-3 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px] align-middle">Total Historial (Pagado)</td>
                <td class="py-3 px-3 text-right font-black text-slate-400 text-lg align-middle">${grandTotal} €</td>
                <td></td>
            </tr>`;
        }

        document.getElementById('profile-history-list').innerHTML = html;
        if(document.getElementById('ficha-tab-dives') && document.getElementById('ficha-tab-dives').innerText === '---') {
            document.getElementById('ficha-tab-dives').innerText = processedDives.length + ' (Historial)';
        }
        
        const elDeuda = document.getElementById('ficha-caja-deuda');
        if (elDeuda) {
            elDeuda.innerText = `${pendingTotal} €`;
            document.getElementById('ficha-caja-senal').innerText = `- ${deposit} €`;
            
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
    } catch(e) {
        console.error(e);
        document.getElementById('profile-history-list').innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Error de red al cargar el historial.</td></tr>';
        switchFichaTab(targetTab);
    }
};

// Handles switching tabs in the Today's Divers view
window.activeJointSelection = [];
window.currentTodayDiversData = []; // Cache of natural order
window.todaySortMode = 'none'; // 'none', 'name', 'boat'

window.toggleTodaySort = function() {
    if (todaySortMode === 'none') todaySortMode = 'name';
    else if (todaySortMode === 'name') todaySortMode = 'boat';
    else todaySortMode = 'none';

    const btn = document.getElementById('btn-today-sort');
    const labels = { 'none': 'Natural', 'name': 'Nombre', 'boat': 'Barco' };
    btn.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"></path></svg> Sort: ${labels[todaySortMode]}`;
    
    // Refresh the currently active tab
    const activeTab = document.getElementById('tab-today-pending').classList.contains('bg-white') ? 'pending' : 'all';
    switchTodayTab(activeTab);
};

window.switchTodayTab = async function(tabId) {
    const btnAll = document.getElementById('tab-today-all');
    const btnPending = document.getElementById('tab-today-pending');
    const listEl = document.getElementById('today-divers-list');
    
    // UI Switch
    if (tabId === 'all') {
        btnAll.className = 'px-4 py-1.5 text-xs font-bold rounded-md bg-white text-slate-800 shadow-sm transition-all';
        btnPending.className = 'px-4 py-1.5 text-xs font-bold rounded-md text-slate-500 hover:text-slate-800 transition-all flex items-center gap-1.5';
        
        // Fetch and show only debtors for today
        if(currentTodayDiversData.length === 0) {
            listEl.innerHTML = '<div class="p-6 text-center text-slate-500 italic text-sm">No hay clientes registrados en los barcos de hoy.</div>';
        } else {
            listEl.innerHTML = '<div class="p-10 text-center text-slate-500 font-bold flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-blue-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Buscando cobros pendientes...</div>';
            
            try {
                const pendingDnis = currentTodayDiversData.map(d => d.dni);
                let pendingHtml = '';
                let totalPendingDebt = 0;
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
                        docsArray.sort((a,b) => {
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
                                    activeInsExpiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
                                }
                            } else if (cleanIns === 'Propio' || cleanIns === 'INC') { p.insurance = 0; }
                            
                            p.total = p.dive + p.tasa + p.gas + p.rental + p.insurance + (p.course || 0);
                            
                            if (data.paymentStatus === 'pending') {
                                debt += p.total;
                                divesList.push(`${data.date.substring(5)} ${data.assignedBoat.charAt(0).toUpperCase() + data.assignedBoat.slice(1)}`);
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

                debtors.sort((a,b) => a.nombre.localeCompare(b.nombre));

                debtors.forEach(d => {
                    let isSel = window.activeJointSelection && window.activeJointSelection.find(x => x.dni === d.dni);
                    let avatarHtml = isSel ? 
                        `<div class="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center transition-colors shadow-inner cursor-pointer" onclick="toggleDiverJointSelection(this, '${d.dni}', '${d.nombre.replace(/'/g, "\\'")}', '${d.debt}')"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>` :
                        `<div class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-colors shadow-inner cursor-pointer" onclick="toggleDiverJointSelection(this, '${d.dni}', '${d.nombre.replace(/'/g, "\\'")}', '${d.debt}')"><span class="font-black text-xs">€</span></div>`;

                    pendingHtml += `
                    <div class="flex justify-between items-center p-3 border-b border-slate-100 transition-colors group relative hover:bg-slate-50">
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
                    listEl.innerHTML = '<div class="p-10 text-center text-emerald-600 font-black"><div class="text-4xl mb-2">🎉</div>¡Todos los buceadores de hoy han pagado!</div>';
                } else {
                    listEl.innerHTML = `
                        <div class="bg-slate-800 text-white p-4 flex justify-between items-center sticky top-0 z-10 shadow-md">
                            <span class="text-xs font-black uppercase tracking-widest text-slate-400">Total Pendiente (Hoy):</span>
                            <span class="text-xl font-black text-blue-400">${totalPendingDebt} €</span>
                        </div>
                        ${pendingHtml}
                    `;
                }
            } catch (e) {
                console.error("FIREBASE ERROR:", e);
                listEl.innerHTML = '<div class="p-8 text-center text-red-500 font-bold">Error de red al cargar deudas.</div>';
            }
        }
    } else {
        btnPending.className = 'px-4 py-1.5 text-xs font-bold rounded-md bg-white text-slate-800 shadow-sm transition-all flex items-center gap-1.5 ring-1 ring-amber-200';
        btnAll.className = 'px-4 py-1.5 text-xs font-bold rounded-md text-slate-500 hover:text-slate-800 transition-all';
        
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
                    docsArray.sort((a,b) => {
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
                                activeInsExpiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
                            }
                        } else if (cleanIns === 'Propio' || cleanIns === 'INC') {
                            p.insurance = 0;
                        }
                        
                        p.total = p.dive + p.tasa + p.gas + p.rental + p.insurance + (p.course || 0);
                        
                        // 3. Only add it to their total debt if this specific dive is unpaid
                        if (data.paymentStatus === 'pending') {
                            debt += p.total;
                            divesList.push(`${data.date.substring(5)} ${data.assignedBoat.charAt(0).toUpperCase() + data.assignedBoat.slice(1)}`);
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

            debtors.sort((a,b) => a.nombre.localeCompare(b.nombre)); // Sort alphabetically

            debtors.forEach(d => {
                const divesStr = d.divesList.join(' • ');
                let isSel = window.activeJointSelection && window.activeJointSelection.find(x => x.dni === d.dni);
                let avatarHtml = isSel ? 
                    `<div class="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center transition-colors shadow-inner cursor-pointer" onclick="toggleDiverJointSelection(this, '${d.dni}', '${d.nombre.replace(/'/g, "\\'")}', '${d.debt}')"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>` :
                    `<div class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600 flex items-center justify-center transition-colors shadow-inner cursor-pointer" onclick="toggleDiverJointSelection(this, '${d.dni}', '${d.nombre.replace(/'/g, "\\'")}', '${d.debt}')"><span class="font-black text-xs">€</span></div>`;

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
                <div class="font-black text-lg">Falta Índice de Firebase</div>
                <div class="text-sm font-medium text-slate-500 mt-2">Para buscar en toda la base de datos sin gastar límite de lecturas, Firebase requiere crear un índice.<br><br><b>Abre la consola de tu navegador (clic derecho -> Inspeccionar -> Console)</b> y haz clic en el enlace azul que aparece en el mensaje de error para crearlo. Tarda 3 minutos.</div>
            </div>`;
        }
    }
};

window.openTodayDiversModal = function(isNavBackForward = false) {
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
        if (t.groups) t.groups.forEach(g => { if(g.guests) allGuests.push(...g.guests) });

        allGuests.forEach(g => {
            if(g.dni) {
                if(!uniqueDivers.has(g.dni)) uniqueDivers.set(g.dni, { nombre: g.nombre, dni: g.dni, boats: [], hasBono: false });
                uniqueDivers.get(g.dni).boats.push(`${t.time} ${t.assignedBoat.toUpperCase()}`);
                // If they are marked as using a bono on ANY boat today, tag them
                if (g.hasBono) uniqueDivers.get(g.dni).hasBono = true;
            }
        });
    });
    
    window.currentTodayDiversData = Array.from(uniqueDivers.values());
    switchTodayTab('all');

    document.getElementById('today-divers-modal').classList.remove('hidden');
    document.getElementById('global-diver-search').value = '';
    document.getElementById('global-search-results').innerHTML = '';
    setTimeout(() => document.getElementById('global-diver-search').focus(), 100);
};

// Jumps from a Customer's History directly to the Boat Manifest
window.openBoatFromHistory = function(e, dateStr, time, assignedBoat) {
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

window.updateGuestDeposit = async function(dni, amount, groupIndex, guestIndex) {
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
            showAppAlert("Error al guardar la señal");
        }
    }
};

window.liquidarCuenta = async function() {
    const dni = window.activeFichaDni;
    const pendingDocs = window.activeFichaPendingDocs || [];
    
    if (pendingDocs.length === 0) return;
    
    showAppConfirm("¿Liquidar cuenta completa y marcar todas las inmersiones como pagadas?", () => {
        
        // --- 1. OPTIMISTIC UI: Instant Visual Feedback (0.01 seconds) ---
        const custIndex = customerDatabase.findIndex(c => c.dni === dni);
        if (custIndex !== -1) customerDatabase[custIndex].deposit = 0; // Wipe local deposit
        
        const totalEl = document.getElementById('ficha-caja-total');
        if (totalEl) {
            totalEl.innerText = "0 € (Pagado)";
            totalEl.className = "text-3xl font-black text-emerald-500 tracking-tighter";
            document.getElementById('ficha-caja-deuda').innerText = "0 €";
            document.getElementById('ficha-caja-senal').innerText = "- 0 €";
            document.getElementById('btn-liquidar').classList.add('opacity-50', 'pointer-events-none');
        }
        
        // Magically turn all "Pendiente" buttons to "Pagado" instantly without refreshing
        document.querySelectorAll('#profile-history-list tr').forEach(row => {
            const btn = row.querySelector('button[onclick*="togglePaymentStatus"]');
            if (btn && btn.innerText.toLowerCase().includes('pendiente')) {
                row.classList.add('opacity-70', 'hover:opacity-100');
                const match = btn.getAttribute('onclick').match(/togglePaymentStatus\('[^']+',\s*'([^']+)'/);
                const boatId = match ? match[1] : '';
                btn.parentElement.innerHTML = `<button onclick="togglePaymentStatus('${dni}', '${boatId}', 'paid')" class="px-2.5 py-1 bg-green-50 text-green-600 border border-green-200 rounded text-[9px] font-black uppercase tracking-widest hover:bg-green-100 transition-colors shrink-0 w-full shadow-sm">Pagado</button>`;
            }
        });

        // Clear local memory
        window.activeFichaPendingDocs = [];
        closeAppConfirm();
        showToast("✅ Cuenta liquidada con éxito.");

        // --- 2. BACKGROUND SYNC: Silently process Firebase without freezing the screen ---
        (async () => {
            try {
                const batch = db.batch();
                pendingDocs.forEach(docId => {
                    const ref = db.collection('mangamar_customers').doc(dni).collection('history').doc(docId);
                    batch.update(ref, { paymentStatus: 'paid' });
                });
                await batch.commit();
                
                if (custIndex !== -1) {
                    await db.collection("mangamar_directory").doc("master_list").update({ clients: customerDatabase });
                }
                
                // Silently update the background "Día de Hoy" tab if it's open
                if (!document.getElementById('today-divers-modal').classList.contains('hidden')) {
                    window.switchTodayTab(document.getElementById('tab-today-pending').classList.contains('bg-white') ? 'pending' : 'all');
                }
            } catch(e) {
                console.error("Error en sincronización en 2do plano", e);
                showToast("⚠️ Conexión inestable. El pago se sincronizará cuando vuelva la red.");
            }
        })();
    });
};

window.generateFactura = function() {
    window.currentFacturaType = 'individual';
    const dni = window.activeFichaDni;
    if (!dni || !window.activeFichaDives) return;
    
    const pendingDives = window.activeFichaDives.filter(item => item.data.paymentStatus === 'pending');
    if (pendingDives.length === 0) {
        showToast("No hay importes pendientes para incluir en el resumen.", "error");
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
        
        let diveName = 'Inmersión';
        if (['Cala', 'Shore', 'Aula'].includes(item.data.site)) diveName = 'Inmersión (Cala/Costa)';
        else if (item.data.site === 'Naranjito') diveName = 'Inmersión (Naranjito)';
        else if (item.data.site === 'Fuera') diveName = 'Inmersión (Fuera)';
        else diveName = 'Inmersión (Reserva Marina)';

        let discountVal = parseFloat(profile.discount) || 0;
        let appliedDiveStr = (discountVal > 0) ? `${diveName} (${discountVal}% Dto)` : diveName;
        addFacturaItem(itemsMap, appliedDiveStr, p.dive * (1 - (discountVal / 100)));

        if (item.data.course && p.course > 0) {
            let courseNameStr = 'Curso: ' + (item.data.baseCourse || item.data.course.split(' | ')[0]);
            let appliedCourseStr = (discountVal > 0) ? `${courseNameStr} (${discountVal}% Dto)` : courseNameStr;
            addFacturaItem(itemsMap, appliedCourseStr, p.course * (1 - (discountVal / 100)));
        }
        
        if (p.gas > 0) addFacturaItem(itemsMap, 'Suplemento Gas (Nitrox)', p.gas);
        if (p.rental > 0) addFacturaItem(itemsMap, 'Alquiler Equipamiento', p.rental);
        if (p.insurance > 0) addFacturaItem(itemsMap, 'Seguro de Buceo', p.insurance);
        
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

    document.getElementById('factura-items').innerHTML = facturaHtml || '<tr><td colspan="4" class="p-4 text-center">No hay inmersiones para facturar</td></tr>';

    document.getElementById('factura-base-21').innerText = totalBase21.toFixed(2) + ' €';
    document.getElementById('factura-iva-amount').innerText = totalIva21.toFixed(2) + ' €';
    document.getElementById('factura-exento').innerText = totalExento.toFixed(2) + ' €';
    document.getElementById('factura-total').innerText = totalFactura.toFixed(2) + ' €';

    document.getElementById('factura-modal').classList.remove('hidden');
    // Hide customer profile temporarily so it doesn't leak out of borders behind fact
    document.getElementById('customer-profile-modal').classList.add('opacity-0');
    
    // Add print utility class for isolated printing
    document.body.classList.add('print-factura');
};

window.closeFacturaModal = function() {
    document.getElementById('factura-modal').classList.add('hidden');
    document.getElementById('customer-profile-modal').classList.remove('opacity-0');
    document.getElementById('today-divers-modal').classList.remove('opacity-0');
    document.body.classList.remove('print-factura');
    if (window.originalAppTitle) document.title = window.originalAppTitle;
};

window.updateCustomerDiscount = async function(val) {
    if(!window.activeFichaDni) return;
    let disc = parseFloat(val) || 0;
    if(disc < 0) disc = 0; if(disc > 100) disc = 100;
    
    let cx = customerDatabase.find(c => c.dni === window.activeFichaDni);
    if(cx) cx.discount = disc;

    try {
        await db.collection('mangamar_customers').doc(window.activeFichaDni).update({ discount: disc });
    } catch(e) {
        // Assume doc might not exist if it's purely from historic data, so map properly inside customer DB
        await db.collection('mangamar_customers').doc(window.activeFichaDni).set({ discount: disc }, { merge: true });
    }
    
    const currName = document.getElementById('profile-modal-name').innerText;
    openCustomerProfile(window.activeFichaDni, currName); // Re-calculate everything
}

window.toggleDiverJointSelection = function(el, dni, nombre, debt) {
    if (!window.activeJointSelection) window.activeJointSelection = [];
    let idx = window.activeJointSelection.findIndex(x => x.dni === dni);
    if(idx > -1) {
        window.activeJointSelection.splice(idx, 1);
        el.className = 'w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600 flex items-center justify-center transition-colors shadow-inner cursor-pointer';
        el.innerHTML = '<span class="font-black text-xs">€</span>';
    } else {
        window.activeJointSelection.push({ dni, nombre, debt: parseFloat(debt) });
        el.className = 'w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center transition-colors shadow-inner cursor-pointer';
        el.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';
    }
    
    updateJointCheckoutBar();
}

window.updateJointCheckoutBar = function() {
    const bar = document.getElementById('joint-checkout-bar');
    if(!window.activeJointSelection || window.activeJointSelection.length === 0) {
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

window.openJointFacturaPrompt = function() {
    if(!window.activeJointSelection || window.activeJointSelection.length === 0) return;
    
    document.getElementById('joint-custom-name').value = '';
    document.getElementById('joint-custom-dni').value = '';
    document.getElementById('joint-rep-custom-fields').classList.add('hidden');
    
    let html = '';
    window.activeJointSelection.forEach((c, i) => {
        html += `
        <label class="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <input type="radio" name="jointRep" value="${c.dni}" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500" ${i===0 ? 'checked' : ''} onchange="document.getElementById('joint-rep-custom-fields').classList.add('hidden')">
            <div>
                <div class="text-sm font-bold text-slate-700">${c.nombre}</div>
                <div class="text-xs text-slate-500 font-mono">${c.dni}</div>
            </div>
        </label>`;
    });
    
    document.getElementById('joint-rep-options-container').innerHTML = html;
    document.getElementById('joint-factura-rep-modal').classList.remove('hidden');
}

window.confirmJointFacturaRep = function() {
    const radios = document.getElementsByName('jointRep');
    let selectedVal = null;
    radios.forEach(r => { if(r.checked) selectedVal = r.value; });
    
    if(!selectedVal) return;
    
    let repName = '';
    let repDni = '';
    
    if (selectedVal === 'custom') {
        repName = document.getElementById('joint-custom-name').value.trim();
        repDni = document.getElementById('joint-custom-dni').value.trim();
        if(!repName || !repDni) {
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

window.generateJointFactura = async function(repName, repDni, groupDiscount = 0) {
    window.currentFacturaType = 'joint';
    window.currentJointFacturaRefs = [];
    
    if(!window.activeJointSelection || window.activeJointSelection.length === 0) return;
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
        docsArray.sort((a,b) => {
            const dateA = a.data().date + ' ' + (a.data().time || '00:00');
            const dateB = b.data().date + ' ' + (b.data().time || '00:00');
            return dateA.localeCompare(dateB);
        });
        
        let activeInsExpiry = null;
        let billedCourses = new Set();
        
        docsArray.forEach(doc => {
            let data = doc.data();
            if(data.paymentStatus === 'pending') window.currentJointFacturaRefs.push(doc.ref);
            
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
                    activeInsExpiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
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

window.liquidarFacturaActual = async function() {
    window.showAppConfirm("¿Confirmas que este documento está cobrado? Esto marcará todas sus inmersiones como completadas.", async () => {
        const btn = document.getElementById('btn-factura-liquidar');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Procesando...`;
        btn.classList.add('opacity-50', 'pointer-events-none');
        
        try {
            if (window.currentFacturaType === 'joint' && window.currentJointFacturaRefs) {
                // Batch update the group invoice logic directly
                const batchPromises = window.currentJointFacturaRefs.map(ref => ref.update({ paymentStatus: 'paid' }));
                await Promise.all(batchPromises);
                
                // Clear any leftover deposit (since entire debt was fully collected in a joint pool)
                const depositPromises = window.activeJointSelection.map(c => db.collection('mangamar_customers').doc(c.dni).update({ deposit: 0 }));
                await Promise.all(depositPromises);
                
                window.activeJointSelection = [];
            } else if (window.currentFacturaType === 'individual' && window.activeFichaDni && window.activeFichaPendingDocs) {
                const batchPromises = window.activeFichaPendingDocs.map(docId => db.collection('mangamar_customers').doc(window.activeFichaDni).collection('history').doc(docId).update({ paymentStatus: 'paid' }));
                await Promise.all(batchPromises);
                await db.collection('mangamar_customers').doc(window.activeFichaDni).update({ deposit: 0 });
            }
            
            showToast("Documento liquidado y archivado correctamente.", "success");
            closeFacturaModal();
            
            // Refresh underlying background UI dynamically
            if (document.getElementById('today-divers-modal').classList.contains('hidden') === false) {
                const activeTab = document.getElementById('tab-today-pending').classList.contains('bg-white') ? 'pending' : 'all';
                switchTodayTab(activeTab);
                updateJointCheckoutBar();
            } else if (window.activeFichaDni) {
                openCustomerProfile(window.activeFichaDni, document.getElementById('profile-modal-name').innerText); // Reload user specifically
            }
            
        } catch(e) {
            console.error(e);
            showToast("Error al liquidar el documento.");
        } finally {
            btn.innerHTML = originalHtml;
            btn.classList.remove('opacity-50', 'pointer-events-none');
        }
    });
};

// ==========================================
// 15. CRM DIRECTORY
// ==========================================
let crmSearchStr = '';
let crmSortKey = 'fullName';
let crmSortDesc = false;

window.openCrmModal = function(isNavBackForward = false) {
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

window.c_onCrmSearch = function(val) {
    crmSearchStr = val.toLowerCase().trim();
    if(document.getElementById('crm-search-input').value !== val) document.getElementById('crm-search-input').value = val;
    if(document.getElementById('crm-search-input-mobile').value !== val) document.getElementById('crm-search-input-mobile').value = val;
    renderCrmTable();
};

window.c_sortCrm = function(key) {
    if (crmSortKey === key) {
        crmSortDesc = !crmSortDesc;
    } else {
        crmSortKey = key;
        crmSortDesc = false;
    }
    renderCrmTable();
};

window.renderCrmTable = function() {
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
    const renderLimit = Math.min(filtered.length, 300);
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
    
    if (filtered.length > 300) {
        html += `<div class="p-6 text-center text-slate-400 text-xs font-bold bg-slate-50 border-t border-slate-100">+ ${filtered.length - 300} resultados adicionales. Por favor afina tu búsqueda.</div>`;
    }

    listEl.innerHTML = html;
};

// Hook auto-refresh if CRM is open locally and modifications are made via Ficha
const _crm_originalCloseProfile = window.closeGlobalModal;
window.closeGlobalModal = function(id) {
    _crm_originalCloseProfile(id);
    if(id === 'customer-profile-modal' || (id && id.id === 'customer-profile-modal')) {
        const crmModal = document.getElementById('crm-modal');
        if(crmModal && !crmModal.classList.contains('hidden')) {
            renderCrmTable();
        }
    }
};

window.promptEditCustomer = function() {
    if(!window.activeFichaDni) return;
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

window.saveCustomerEdits = async function() {
    if(!window.activeFichaDni) return;
    const dni = window.activeFichaDni;
    const nombre = document.getElementById('edit-f-nombre').value.trim();
    if(!nombre) {
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
        if(index > -1) {
            customerDatabase[index].nombre = nombre;
            if (customerDatabase[index].apellidos) delete customerDatabase[index].apellidos;
            customerDatabase[index].dob = dob;
            customerDatabase[index].telefono = telefono;
            customerDatabase[index].email = email;
            customerDatabase[index].titulacion = titulacion;
            if(divesRaw) customerDatabase[index].dives = parseInt(divesRaw);
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
                                if(guest.nombre !== newFullName) {
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
                if(trip.isVisorTrip) payload.visorTripFallback = true;
                if(typeof window.saveInternalBoatData === 'function') {
                    boatSyncPromises.push(window.saveInternalBoatData(trip.id, trip.date, payload));
                }
            }
        });
        
        if(boatSyncPromises.length > 0) {
            Promise.all(boatSyncPromises).catch(e => console.error("Error bg boat sync:", e));
            // Redraw boats if manifest is active
            if(typeof window.renderGroups === 'function' && document.getElementById('boat-modal') && !document.getElementById('boat-modal').classList.contains('hidden')) {
                window.renderGroups();
            }
        }

        document.getElementById('edit-customer-modal-full').classList.add('hidden');
        showToast("👍 Perfil actualizado correctamente.");
        
        // Soft refresh local visuals ONLY if Ficha is already open
        if(!document.getElementById('customer-profile-modal').classList.contains('hidden')) {
            openCustomerProfile(dni, window.getFullName(customerDatabase[index]));
        }
        
        if(!document.getElementById('crm-modal').classList.contains('hidden')) renderCrmTable();
        
    } catch(e) {
        console.error("Error al guardar perfil", e);
        showAppAlert("Ocurrió un error guardando el perfil. Por favor, revisa tu conexión.");
    } finally {
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Guardar Cambios';
        btn.disabled = false;
    }
};

window.promptDeleteCustomer = function() {
    const name = document.getElementById('profile-modal-name').innerText;
    document.getElementById('delete-customer-name').innerText = name;
    document.getElementById('delete-customer-modal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('delete-customer-modal-content').classList.remove('scale-95', 'opacity-0');
    }, 10);
};

window.executeDeleteCustomer = async function() {
    if(!window.activeFichaDni) return;
    const dni = window.activeFichaDni;
    
    try {
        const btn = document.getElementById('btn-confirm-delete');
        btn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
        btn.disabled = true;

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
        if(docSnap.exists) {
            let data = docSnap.data().clients || [];
            let updated = data.filter(c => c.dni !== dni);
            await db.collection('mangamar_directory').doc('master_list').set({ clients: updated }, { merge: true });
            
            // 4. Update memory natively
            customerDatabase = updated;
        }

        // Close UI windows
        window.closeGlobalModal('delete-customer-modal');
        window.closeGlobalModal('customer-profile-modal');
        
        // Return to CRM and re-render
        if(!document.getElementById('crm-modal').classList.contains('hidden')) {
            renderCrmTable();
        }
        
        showToast("🗑️ Cliente borrado permanentemente.");
        
    } catch(e) {
        console.error("Error al borrar el cliente", e);
        showAppAlert("Ocurrió un error al borrar el cliente. Por favor, revisa tu conexión.");
    } finally {
        const btn = document.getElementById('btn-confirm-delete');
        btn.innerHTML = 'Eliminar';
        btn.disabled = false;
        document.getElementById('delete-customer-modal-content').classList.add('scale-95', 'opacity-0');
    }
};