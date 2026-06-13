// ==========================================
// 7. CUSTOMER CRM & PRICING ENGINE
// ==========================================
// ==========================================
// 8. GLOBAL SEARCH & TODAY'S DIVERS
// ==========================================

function searchGlobalDivers(query) {
    const resEl = document.getElementById('global-search-results');
    const normQuery = window.normalizeSearchString(query);
    if (normQuery.length < 2) { resEl.innerHTML = ''; return; }

    const results = customerDatabase.filter(c => {
        const fullName = window.normalizeSearchString(getFullName(c));
        return fullName.includes(normQuery) || window.checkDniMatch(c.dni, normQuery);
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
window.certsSortMode = 'date-desc';
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
    const btnFuture = document.getElementById('sub-filter-certs-future');
    const btnProcessed = document.getElementById('sub-filter-certs-processed');

    if (btnPending) {
        if (mode === 'pendiente') {
            btnPending.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-amber-200 bg-amber-50 text-amber-700 tracking-wider shadow-sm transition-all";
        } else {
            btnPending.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-amber-600 transition-all tracking-wider";
        }
    }
    if (btnFuture) {
        if (mode === 'futuro') {
            btnFuture.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-blue-200 bg-blue-50 text-blue-700 tracking-wider shadow-sm transition-all";
        } else {
            btnFuture.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-blue-600 transition-all tracking-wider";
        }
    }
    if (btnProcessed) {
        if (mode === 'procesado') {
            btnProcessed.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 tracking-wider shadow-sm transition-all";
        } else {
            btnProcessed.className = "px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-emerald-600 transition-all tracking-wider";
        }
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
                            let p = window.calculateDivePrice(data);

                            if (data.course) {
                                let baseCourse = data.baseCourse || data.course.split(' | ')[0].trim();
                                if (!billedCourses.has(baseCourse)) {
                                    p.course = data.coursePrice ? data.coursePrice : ((window.PRICES && window.PRICES[baseCourse]) ? window.PRICES[baseCourse] : 0);
                                    billedCourses.add(baseCourse);
                                } else { p.course = 0; }
                                p.dive = 0; p.tasa = 0;
                                if (data.rental === 'INC') p.rental = 0;
                                p.insurance = 0;
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
                            debtors.push({ dni, nombre, debt: finalDebt, originalDebt: finalDebt, isClean: isClean });
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
                        let p = window.calculateDivePrice(data);

                        // Engine 1: Course Deduplication
                        if (data.course) {
                            let baseCourse = data.baseCourse || data.course.split(' | ')[0].trim();
                            if (!billedCourses.has(baseCourse)) {
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

    const dbMode = (window.certsFilterMode === 'pendiente' || window.certsFilterMode === 'futuro') ? 'db_pending' : 'db_processed';

    // 1. Fetching Logic
    if (forceFetch || window.lastFetchedCertsMode !== dbMode || window.lastFetchedCerts === null) {
        listEl.innerHTML = '<div class="p-10 text-center text-slate-500 font-bold flex flex-col items-center"><svg class="animate-spin h-8 w-8 text-pink-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Escaneando base de datos (' + window.certsFilterMode + ')...</div>';

        try {
            let snap;
            if (dbMode === 'db_pending') {
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
                
                // Skip snorkelers as they don't need to be certified
                if (cleanCourse.toLowerCase().includes('snorkel')) return;

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
            window.lastFetchedCerts = certs;
            window.lastFetchedCertsMode = dbMode;
        } catch (e) {
            console.error("CERT_QUERY_ERROR", e);
            listEl.innerHTML = `<div class="p-8 text-center text-red-600"><div class="font-black text-lg">Error de Índice Firebase</div><div class="text-xs mt-2 text-slate-500 font-bold break-all">${e.message}</div></div>`;
            return;
        }
    }

    // 2. Local Filtering
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    let filteredCerts = window.lastFetchedCerts.filter(item => {
        if (dbMode === 'db_pending') {
            if (window.certsFilterMode === 'pendiente') {
                if (item.date > todayStr) return false;
            } else if (window.certsFilterMode === 'futuro') {
                if (item.date <= todayStr) return false;
            }
        }

        let matchSearch = true;
        let matchCourse = true;

        if (window.certsSearchQuery) {
            const q = window.normalizeSearchString(window.certsSearchQuery);
            matchSearch = window.normalizeSearchString(item.nombre).includes(q) || window.normalizeSearchString(item.dni).includes(q);
        }
        if (window.certsCourseFilter) {
            matchCourse = item.course.toLowerCase().includes(window.certsCourseFilter.toLowerCase());
        }
        return matchSearch && matchCourse;
    });

    // 2.5 Local Sorting
    const sortMode = window.certsSortMode || 'date-desc';
    filteredCerts.sort((a, b) => {
        if (sortMode === 'date-desc') {
            return b.date.localeCompare(a.date) || a.nombre.localeCompare(b.nombre);
        } else if (sortMode === 'date-asc') {
            return a.date.localeCompare(b.date) || a.nombre.localeCompare(b.nombre);
        } else if (sortMode === 'name-asc') {
            return a.nombre.localeCompare(b.nombre) || b.date.localeCompare(a.date);
        } else if (sortMode === 'name-desc') {
            return b.nombre.localeCompare(a.nombre) || b.date.localeCompare(a.date);
        }
        return 0;
    });

    // 3. Render HTML
    let coursesList = [...new Set(window.lastFetchedCerts.map(c => c.course))];
    let courseOptions = coursesList.map(c => `<option value="${c}" ${window.certsCourseFilter === c ? 'selected' : ''}>${c}</option>`).join('');

    let searchBarContainer = document.getElementById('certs-search-bar-container');
    if (!searchBarContainer) {
        let wrapperHtml = `
            <div id="certs-search-bar-container" class="p-3 bg-slate-50 border-b border-slate-200 flex gap-2 w-full sticky top-0 z-10">
                 <input type="text" id="certs-search-input" placeholder="Buscar por DNI o Nombre..." class="flex-1 px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500 shadow-sm" value="${window.certsSearchQuery}" oninput="window.certsSearchQuery=this.value; renderTodayCerts()">
                 <select id="certs-course-select" class="px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-pink-500 shadow-sm bg-white" onchange="window.certsCourseFilter=this.value; renderTodayCerts()">
                     <option value="">Cualquier Curso</option>
                     ${courseOptions}
                 </select>
            </div>
            <div id="certs-items-list" class="divide-y divide-slate-100 flex-1"></div>
        `;
        listEl.innerHTML = wrapperHtml;
        
        // Retain focus if input was typed
        const inputEl = document.getElementById('certs-search-input');
        if (inputEl && window.certsSearchQuery) {
            inputEl.focus();
            inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        }
    } else {
        const selectEl = document.getElementById('certs-course-select');
        if (selectEl) {
            const currentVal = selectEl.value;
            selectEl.innerHTML = `<option value="">Cualquier Curso</option>${courseOptions}`;
            selectEl.value = currentVal;
        }
    }

    const itemsListEl = document.getElementById('certs-items-list');
    if (!itemsListEl) return;

    let itemsHtml = '';

    if (filteredCerts.length === 0) {
        let emptyMsg = 'No se encontraron registros.';
        if (window.certsFilterMode === 'pendiente') {
            emptyMsg = 'No hay certificaciones pendientes hasta hoy. 🎉';
        } else if (window.certsFilterMode === 'futuro') {
            emptyMsg = 'No hay certificaciones futuras programadas.';
        } else if (window.certsFilterMode === 'procesado') {
            emptyMsg = 'No hay certificaciones procesadas.';
        }
        itemsListEl.innerHTML = `<div class="p-10 text-center text-slate-400 font-bold italic">${emptyMsg}</div>`;
        return;
    }

    filteredCerts.forEach(item => {
        let actionBtn = '';
        if (dbMode === 'db_pending') {
            actionBtn = `
            <button onclick="toggleCertStatus('${item.dni}', '${item.course.replace(/'/g, "\\'")}', '${item.nombre.replace(/'/g, "\\'")}', 'procesado', this)" class="group px-3 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl text-xs font-black transition-all border border-amber-100 shadow-sm flex items-center gap-1.5 focus:scale-95 cursor-pointer min-w-[100px] justify-center">
                <span class="inline-flex items-center gap-1.5 group-hover:hidden">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Pendiente
                </span>
                <span class="hidden group-hover:inline-flex items-center gap-1.5">
                    ⚡ Procesar
                </span>
            </button>`;
        } else {
            actionBtn = `
            <button onclick="toggleCertStatus('${item.dni}', '${item.course.replace(/'/g, "\\'")}', '${item.nombre.replace(/'/g, "\\'")}', 'pendiente', this)" class="group px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-black transition-all border border-emerald-100 shadow-sm flex items-center gap-1.5 focus:scale-95 cursor-pointer min-w-[100px] justify-center">
                <span class="inline-flex items-center gap-1.5 group-hover:hidden">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Procesado
                </span>
                <span class="hidden group-hover:inline-flex items-center gap-1.5">
                    ↩️ Revertir
                </span>
            </button>`;
        }

        itemsHtml += `
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

    itemsListEl.innerHTML = itemsHtml;
};

window.toggleCertStatus = async function (dni, cleanCourseName, studentName, newStatus, btnEl) {
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.style.pointerEvents = 'none';
        btnEl.innerHTML = `
            <svg class="animate-spin h-3.5 w-3.5 text-current mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        `;
    }
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
            if (btnEl) {
                renderTodayCerts();
            }
        }
    } catch (e) {
        console.error(e);
        showAppAlert("Error al actualizar certificación.");
        if (btnEl) {
            renderTodayCerts();
        }
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
    let dailyCustomGroups = new Map(); // Store custom groups and their divers

    todaysTrips.forEach(t => {
        const allGuests = [];
        if (t.guests) allGuests.push(...t.guests);
        if (t.groups) t.groups.forEach(g => { 
            if (g.guests) allGuests.push(...g.guests);
        });

        allGuests.forEach(g => {
            if (g.dni) {
                let tag = g.bookingTag || 'Sin Grupo';
                if (!dailyCustomGroups.has(tag)) dailyCustomGroups.set(tag, []);
                
                // Ensure unique DNIs in the group
                if (!dailyCustomGroups.get(tag).includes(g.dni)) {
                    dailyCustomGroups.get(tag).push(g.dni);
                }
                
                if (!uniqueDivers.has(g.dni)) uniqueDivers.set(g.dni, { nombre: g.nombre, dni: g.dni, boats: [], hasBono: false });
                uniqueDivers.get(g.dni).boats.push(`${t.time} ${(t.assignedBoat || 'Sin Barco').toUpperCase()}`);
                if (g.hasBono) uniqueDivers.get(g.dni).hasBono = true;
            }
        });
    });

    window.currentTodayDiversData = Array.from(uniqueDivers.values());
    window.currentTodayGuidesMap = dailyCustomGroups;
    
    // Populate Guide Dropdown
    const guideSelect = document.getElementById('today-guide-filter');
    if (guideSelect) {
        let opts = `<option value="">Seleccionar por Grupo/Guía...</option>`;
        Array.from(dailyCustomGroups.keys()).forEach(guide => {
            opts += `<option value="${guide}">${guide} (${dailyCustomGroups.get(guide).length} clientes)</option>`;
        });
        guideSelect.innerHTML = opts;
    }

    switchTodayTab('today');

    document.getElementById('today-divers-modal').classList.remove('hidden');
    if (isNavBackForward) window.hideAllNavModals('today-divers-modal');
    document.getElementById('global-diver-search').value = '';
    document.getElementById('global-search-results').innerHTML = '';
    setTimeout(() => document.getElementById('global-diver-search').focus(), 100);
};

// Select divers by guide in Día de Hoy
window.selectDiversByGuide = function(guideName) {
    if (!guideName || !window.currentTodayGuidesMap) return;
    
    // Clear current selection
    window.activeJointSelection = [];
    
    const dnisToSelect = window.currentTodayGuidesMap.get(guideName) || [];
    
    // Only select if they have pending debt shown in the list
    const listRoot = document.getElementById('today-divers-list');
    if (!listRoot) return;
    
    Array.from(listRoot.children).forEach(div => {
        // Exclude the header row
        if (div.classList.contains('bg-slate-800')) return;
        
        // Find the toggle button
        const toggleBtn = div.querySelector('div[onclick^="toggleDiverJointSelection"]');
        if (!toggleBtn) return;
        
        // Extract DNI from the onclick handler
        const onclickAttr = toggleBtn.getAttribute('onclick');
        if (!onclickAttr) return;
        
        // toggleDiverJointSelection(this, 'DNI', 'NOMBRE', 'DEBT')
        const args = onclickAttr.match(/'([^']+)'/g);
        if (args && args.length >= 3) {
            const dni = args[0].replace(/'/g, '');
            const nombre = args[1].replace(/'/g, '');
            const debt = args[2].replace(/'/g, '');
            
            if (dnisToSelect.includes(dni)) {
                // If it's not already selected (blue bg), click it
                if (!toggleBtn.classList.contains('bg-blue-500')) {
                    toggleDiverJointSelection(toggleBtn, dni, nombre, debt);
                }
            } else {
                // If it is selected, unclick it
                if (toggleBtn.classList.contains('bg-blue-500')) {
                    toggleDiverJointSelection(toggleBtn, dni, nombre, debt);
                }
            }
        }
    });
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

    const finalizeDeposit = (method) => {
        // ALWAYS write localDeposit on the guest object in activeBoatItem manifest!
        if (typeof activeBoatItem !== 'undefined' && activeBoatItem.groups[groupIndex] && activeBoatItem.groups[groupIndex].guests[guestIndex]) {
            activeBoatItem.groups[groupIndex].guests[guestIndex].localDeposit = val;
            activeBoatItem.groups[groupIndex].guests[guestIndex].localDepositMethod = method;
            if (val > 0) {
                activeBoatItem.groups[groupIndex].guests[guestIndex].localDepositC = false; // Reset to pending (orange) by default when adding/updating deposit!
            } else {
                delete activeBoatItem.groups[groupIndex].guests[guestIndex].localDepositC;
            }
            if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
        }

        if (!dni || String(dni) === 'undefined') {
            return;
        }

        const custIndex = customerDatabase.findIndex(c => c.dni === dni);
        if (custIndex !== -1) {
            customerDatabase[custIndex].deposit = val;
            if (val > 0) {
                customerDatabase[custIndex].depositMethod = method;
                customerDatabase[custIndex].depositContasimple = false; // Reset to pending (orange) by default when adding/updating deposit!
            } else {
                delete customerDatabase[custIndex].depositMethod;
                delete customerDatabase[custIndex].depositContasimple;
            }

            // Update UI Instantly
            if (typeof renderGroups === 'function') renderGroups();
            if (window.activeFichaDni === dni && typeof window.renderFichaFromCache === 'function') {
                window.renderFichaFromCache(dni);
            }

            // Background Save
            (async () => {
                try {
                    const cleanDatabase = JSON.parse(JSON.stringify(customerDatabase));
                    await window.safeMasterListWrite(cleanDatabase, 'save-deposit');
                    if (typeof window.updateCustomerOutstandingDebt === 'function') {
                        await window.updateCustomerOutstandingDebt(dni);
                    }
                    // if (val > 0) showToast(`Depósito de ${val}€ (${method}) guardado.`);
                } catch (e) {
                    console.error(e);
                    showAppAlert("Error al guardar el depósito");
                }
            })();
        }
    };

    if (val > 0) {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center opacity-0 transition-opacity';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 transform scale-95 transition-transform duration-300">
                <h3 class="text-xl font-black text-slate-800 text-center mb-2">Método de Pago</h3>
                <p class="text-sm text-slate-500 text-center mb-6">¿Cómo se abonó este depósito de <span class="font-bold text-slate-800">${val}€</span>?</p>
                <div class="flex flex-col gap-3">
                    <button class="dep-method-btn px-4 py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-700 font-black hover:bg-emerald-100 hover:border-emerald-400 transition-colors text-left pl-6" data-method="Efectivo">💵 Efectivo</button>
                    <button class="dep-method-btn px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-black hover:bg-blue-100 hover:border-blue-400 transition-colors text-left pl-6" data-method="Tarjeta">💳 Tarjeta</button>
                    <button class="dep-method-btn px-4 py-3 rounded-xl border-2 border-teal-200 bg-teal-50 text-teal-700 font-black hover:bg-teal-100 hover:border-teal-400 transition-colors text-left pl-6" data-method="Bizum">📱 Bizum</button>
                    <button class="dep-method-btn px-4 py-3 rounded-xl border-2 border-purple-200 bg-purple-50 text-purple-700 font-black hover:bg-purple-100 hover:border-purple-400 transition-colors text-left pl-6" data-method="Transferencia">🏦 Transferencia</button>
                    <button class="dep-method-btn px-4 py-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-indigo-700 font-black hover:bg-indigo-100 hover:border-indigo-400 transition-colors text-left pl-6" data-method="PayPal">🅿️ PayPal</button>
                    <button class="dep-method-btn px-4 py-3 rounded-xl border-2 border-red-200 bg-red-50 text-red-700 font-black hover:bg-red-100 hover:border-red-400 transition-colors text-left pl-6" data-method="PADI">🅿️ PADI</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Animate in
        setTimeout(() => {
            overlay.classList.remove('opacity-0');
            overlay.querySelector('div').classList.replace('scale-95', 'scale-100');
        }, 10);

        const closeOverlay = (method) => {
            overlay.classList.add('opacity-0');
            overlay.querySelector('div').classList.replace('scale-100', 'scale-95');
            setTimeout(() => {
                overlay.remove();
                if (method) finalizeDeposit(method);
                else {
                    // Revert input to previous value if cancelled
                    if (typeof renderGroups === 'function') renderGroups();
                }
            }, 300);
        };

        const btns = overlay.querySelectorAll('.dep-method-btn');
        btns.forEach(btn => {
            btn.onclick = () => closeOverlay(btn.getAttribute('data-method'));
        });
        
        overlay.onclick = (e) => {
            if (e.target === overlay) closeOverlay(null);
        };
    } else {
        finalizeDeposit('Efectivo');
    }
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
    if (isNavBackForward) window.hideAllNavModals('crm-modal');

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
    crmSearchStr = window.normalizeSearchString(val);
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
        const searchTarget = window.normalizeSearchString(`${cName} ${c.apodo || ''} ${c.dni || ''} ${c.email || ''} ${c.telefono || ''}`);
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
                    computedExpiryStr = window.formatInsuranceDate(testDateStr);
                    let dDate = new Date(window.normalizeDateStr(testDateStr));
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


window.openContabilidadView = function(isNavBackForward = false) {
    if (typeof closeSidebarOnMobile === 'function') closeSidebarOnMobile();
    
    if (typeof window.recordModalHistory === 'function' && !isNavBackForward) {
        window.recordModalHistory({ type: 'contabilidad', isNavBackForward });
    }

    // Don't close main views, this is an overlay modal
    const view = document.getElementById('contabilidad-modal');
    const inner = document.getElementById('conta-modal-inner');
    view.classList.remove('hidden');
    if (isNavBackForward) window.hideAllNavModals('contabilidad-modal');
    
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
    currentContaMonth.setDate(1);
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
    document.getElementById('conta-total-transferencia').innerText = '...';
    document.getElementById('conta-total-paypal').innerText = '...';
    document.getElementById('conta-total-padi').innerText = '...';
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

        activeContabilidadData = { tarjeta: [], bizum: [], efectivo: [], transferencia: [], paypal: [], padi: [] };
        let subTarj = 0; let subBiz = 0; let subEfe = 0; let subTrans = 0; let subPay = 0; let subPadi = 0;

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
            else if (record.method === 'transferencia') { activeContabilidadData.transferencia.push(record); subTrans += record.amount; }
            else if (record.method === 'paypal') { activeContabilidadData.paypal.push(record); subPay += record.amount; }
            else if (record.method === 'padi') { activeContabilidadData.padi.push(record); subPadi += record.amount; }
            else { activeContabilidadData.efectivo.push(record); subEfe += record.amount; }
        });

        const numFormat = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        document.getElementById('conta-total-tarjeta').innerText = numFormat.format(subTarj) + ' €';
        document.getElementById('conta-total-efectivo').innerText = numFormat.format(subEfe) + ' €';
        document.getElementById('conta-total-bizum').innerText = numFormat.format(subBiz) + ' €';
        document.getElementById('conta-total-transferencia').innerText = numFormat.format(subTrans) + ' €';
        document.getElementById('conta-total-paypal').innerText = numFormat.format(subPay) + ' €';
        document.getElementById('conta-total-padi').innerText = numFormat.format(subPadi) + ' €';

        document.getElementById('conta-table-body').innerHTML = `<tr><td colspan="4" class="p-8 text-center text-slate-400 text-sm font-bold">Haz clic en un origen arriba para ver el desglose</td></tr>`;
        document.getElementById('conta-table-dot').classList.add('hidden');
        document.getElementById('conta-table-title').innerText = "Selecciona un método";
        document.getElementById('conta-table-count').innerText = "";

        // Reset ring highlights
        ['tarjeta', 'efectivo', 'bizum', 'transferencia', 'paypal', 'padi'].forEach(m => document.getElementById('conta-card-' + m).classList.remove('ring-blue-500', 'ring-emerald-500', 'ring-teal-500', 'ring-purple-500', 'ring-indigo-500', 'ring-red-500', 'bg-blue-50/50', 'bg-emerald-50/50', 'bg-teal-50/50', 'bg-purple-50/50', 'bg-indigo-50/50', 'bg-red-50/50'));

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
    ['tarjeta', 'efectivo', 'bizum', 'transferencia', 'paypal', 'padi'].forEach(m => document.getElementById('conta-card-' + m).classList.remove('ring-blue-500', 'ring-emerald-500', 'ring-teal-500', 'ring-purple-500', 'ring-indigo-500', 'ring-red-500', 'bg-blue-50/50', 'bg-emerald-50/50', 'bg-teal-50/50', 'bg-purple-50/50', 'bg-indigo-50/50', 'bg-red-50/50'));
    
    let ringClass = 'ring-emerald-500'; let bgClass = 'bg-emerald-50/50'; let dotClass = 'bg-emerald-500';
    if (method === 'tarjeta') { ringClass = 'ring-blue-500'; bgClass = 'bg-blue-50/50'; dotClass = 'bg-blue-500'; }
    if (method === 'bizum') { ringClass = 'ring-teal-500'; bgClass = 'bg-teal-50/50'; dotClass = 'bg-teal-500'; }
    if (method === 'transferencia') { ringClass = 'ring-purple-500'; bgClass = 'bg-purple-50/50'; dotClass = 'bg-purple-500'; }
    if (method === 'paypal') { ringClass = 'ring-indigo-500'; bgClass = 'bg-indigo-50/50'; dotClass = 'bg-indigo-500'; }
    if (method === 'padi') { ringClass = 'ring-red-500'; bgClass = 'bg-red-50/50'; dotClass = 'bg-red-500'; }

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
            let fullName = window.getFullName(cInfo).trim() || cInfo.nombre || r.dni;
            if (r.dni === 'VARIOUS') fullName = 'VENTA DIRECTA';
            
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
// ==========================================
// 17. JOTFORM CRM SYNC (Smart Merge)
// ==========================================
window.syncJotformCustomers = async function() {
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxPxNj7SC42YeCXBJ1jg-qxY5b94e0ZCHstGokj8006DVm-12C-GejERSI5jVZLSqzw/exec';
    const TOKEN = 'mangamar2026';

    showToast("Sincronizando y completando perfiles incompletos...");

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?token=${TOKEN}`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();

        if (data.error) throw new Error(data.error);
        if (!data.clients || !Array.isArray(data.clients)) throw new Error('Respuesta inválida del servidor.');

        // Helper to fix ALL CAPS or lowercase names
        const fixNameCaps = (str) => {
            if (!str) return '';
            return str.toLowerCase().split(' ').map(word =>
                word.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-')
            ).join(' ');
        };

        let newCount = 0;
        let mergedCount = 0;

        data.clients.forEach(sheetClient => {
            const rawDni = (sheetClient.dni || '').trim().toUpperCase();
            if (!rawDni) return;

            const normDni = window.normalizeSearchString(rawDni);

            // Find if this DNI already exists in the CRM
            const existing = customerDatabase.find(c => window.normalizeSearchString(c.dni || '') === normDni);
            
            if (existing) {
                // SMART MERGE: If it's a blank shell (e.g. from boat manifest), fill it in!
                let modified = false;
                let nameModified = false;
                const sheetFullName = [sheetClient.nombre, sheetClient.apellido].filter(Boolean).join(' ').trim();
                const existingFullName = [existing.nombre, existing.apellido].filter(Boolean).join(' ').trim();
                
                if (!existing.nombre || existing.nombre === 'Sin Nombre' || existing.nombre.toLowerCase().includes('sin nombre')) {
                    existing.nombre = fixNameCaps(sheetClient.nombre) || existing.nombre;
                    nameModified = true;
                } else if (sheetFullName && (existingFullName.toLowerCase() === 'sin nombre' || existingFullName.length < sheetFullName.length || existingFullName.split(/\s+/).length < sheetFullName.split(/\s+/).length)) {
                    // Update name to Jotform's full official details
                    existing.nombre = fixNameCaps(sheetClient.nombre) || existing.nombre;
                    nameModified = true;
                }
                
                if (nameModified) {
                    if (sheetClient.apellido) existing.apellido = fixNameCaps(sheetClient.apellido);
                    modified = true;
                } else if (!existing.apellido && sheetClient.apellido) {
                    existing.apellido = fixNameCaps(sheetClient.apellido);
                    modified = true;
                }
                if (!existing.email && sheetClient.email) { existing.email = sheetClient.email; modified = true; }
                if (!existing.telefono && sheetClient.telefono) { existing.telefono = sheetClient.telefono; modified = true; }
                if (!existing.titulacion && sheetClient.titulacion) { existing.titulacion = sheetClient.titulacion; modified = true; }
                if (!existing.dob && sheetClient.dob) { existing.dob = window.normalizeDateStr(sheetClient.dob); modified = true; }
                if (!existing.dives && sheetClient.dives) { existing.dives = sheetClient.dives; modified = true; }
                
                // Force sync insurance if provided from Jotform, but only if it's newer than the CRM's current record
                if (sheetClient.insurance && sheetClient.insurance.type) { 
                    const sheetExpiry = window.normalizeDateStr(sheetClient.insurance.expiry);
                    const existingExpiry = existing.insurance ? window.normalizeDateStr(existing.insurance.expiry) : '';
                    
                    if (!existing.insurance || sheetExpiry > existingExpiry) {
                        existing.insurance = {
                            type: sheetClient.insurance.type,
                            expiry: sheetExpiry // Save normalized as YYYY-MM-DD
                        };
                        modified = true; 
                    }
                }
                if (modified) mergedCount++;
            } else {
                // Completely new record
                let normalizedInsurance = null;
                if (sheetClient.insurance && sheetClient.insurance.type) {
                    normalizedInsurance = {
                        type: sheetClient.insurance.type,
                        expiry: window.normalizeDateStr(sheetClient.insurance.expiry)
                    };
                }

                customerDatabase.push({
                    dni:        window.normalizeDni(rawDni),
                    nombre:     fixNameCaps(sheetClient.nombre),
                    apellido:   fixNameCaps(sheetClient.apellido),
                    email:      sheetClient.email     || '',
                    telefono:   sheetClient.telefono  || '',
                    titulacion: sheetClient.titulacion || '',
                    dob:        window.normalizeDateStr(sheetClient.dob) || '',
                    dives:      sheetClient.dives || '',
                    insurance:  normalizedInsurance
                });
                newCount++;
            }
        });

        if (newCount > 0 || mergedCount > 0) {
            await window.safeMasterListWrite(customerDatabase, 'jotform-import');
            
            // Sync all updated/created customer profiles to their individual Firestore documents as well
            if (typeof db !== 'undefined') {
                const syncPromises = customerDatabase.map(c => {
                    if (c.dni) {
                        return db.collection('mangamar_customers').doc(c.dni).set(c, { merge: true })
                            .catch(err => console.error("Error syncing individual doc inside jotform:", err));
                    }
                });
                await Promise.all(syncPromises);
            }

            // Propagate these updated details month-wide to all manifest sheets and waitlists
            if (typeof mergedAllocations !== 'undefined') {
                const isEmptyValue = (val) => {
                    if (!val) return true;
                    const s = val.toString().trim();
                    return s === '' || s === '-' || s === '---' || s.toLowerCase() === 'sin titulación' || s.toLowerCase() === 'sin titulacion';
                };
                
                const modifiedTrips = [];
                mergedAllocations.forEach(trip => {
                    let modified = false;
                    if (trip.groups) {
                        trip.groups.forEach(group => {
                            if (group.guests) {
                                group.guests.forEach(gst => {
                                    if (gst.dni) {
                                        const normDni = window.normalizeDni(gst.dni);
                                        const profile = customerDatabase.find(c => window.normalizeDni(c.dni) === normDni);
                                        if (profile) {
                                            const dbFullName = window.getFullName(profile);
                                            const profileName = !isEmptyValue(dbFullName) ? window.getFirstAndLastName(dbFullName) : gst.nombre;
                                            const profileTit = !isEmptyValue(profile.titulacion) ? profile.titulacion : gst.titulacion;
                                            const profilePhone = !isEmptyValue(profile.telefono) ? profile.telefono : gst.telefono;
                                            const profileEmail = !isEmptyValue(profile.email) ? profile.email : gst.email;
                                            
                                            let profileIns = gst.insurance || 0;
                                            if (profile.insurance) {
                                                const insObj = profile.insurance;
                                                const expiry = insObj.expiry ? window.normalizeDateStr(insObj.expiry) : '';
                                                const activeDate = trip.date || '';
                                                if (expiry && expiry >= activeDate) {
                                                    profileIns = insObj.type || 0;
                                                } else {
                                                    profileIns = 0;
                                                }
                                            }
                                            
                                            if (gst.nombre !== profileName || gst.titulacion !== profileTit || gst.telefono !== profilePhone || gst.email !== profileEmail || gst.insurance !== profileIns) {
                                                gst.nombre = profileName;
                                                gst.titulacion = profileTit;
                                                gst.telefono = profilePhone;
                                                gst.email = profileEmail;
                                                gst.insurance = profileIns;
                                                modified = true;
                                            }
                                        }
                                    }
                                });
                            }
                        });
                    }
                    if (trip.waitlist) {
                        trip.waitlist.forEach(w => {
                            if (w.dni) {
                                const normDni = window.normalizeDni(w.dni);
                                const profile = customerDatabase.find(c => window.normalizeDni(c.dni) === normDni);
                                if (profile) {
                                    const dbFullName = window.getFullName(profile);
                                    const profileName = !isEmptyValue(dbFullName) ? window.getFirstAndLastName(dbFullName) : w.nombre;
                                    const profileTit = !isEmptyValue(profile.titulacion) ? profile.titulacion : w.titulacion;
                                    const profilePhone = !isEmptyValue(profile.telefono) ? profile.telefono : w.telefono;
                                    const profileEmail = !isEmptyValue(profile.email) ? profile.email : w.email;
                                    
                                    if (w.nombre !== profileName || w.titulacion !== profileTit || w.telefono !== profilePhone || w.email !== profileEmail) {
                                        w.nombre = profileName;
                                        w.titulacion = profileTit;
                                        w.telefono = profilePhone;
                                        w.email = profileEmail;
                                        modified = true;
                                    }
                                }
                            }
                        });
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

            let msg = '';
            if (newCount > 0) msg += `${newCount} nuevos. `;
            if (mergedCount > 0) msg += `${mergedCount} perfiles completados.`;
            showToast(`¡Sincronización completada! ${msg}`);
            if (!document.getElementById('crm-modal').classList.contains('hidden')) {
                renderCrmTable();
            }
        } else {
            showToast(`✅ Todo al día. ${data.clients.length} entradas revisadas, sin cambios.`);
        }

    } catch(e) {
        console.error('syncJotformCustomers error:', e);
        if (typeof showAppAlert === 'function') showAppAlert(`Error al importar: ${e.message}`);
    }
};




// ==========================================
// 18. INCIDENCIA RESERVA MARINA
// ==========================================

// When boat select changes, show/hide the manual matricula input
window.incidenciaBoatChanged = function(sel) {
    const matEl = document.getElementById('inc-matricula');
    if (!matEl) return;
    if (sel.value === '__custom__') {
        sel.style.display = 'none';
        matEl.style.display = 'block';
        matEl.value = '';
        matEl.focus();
    } else {
        matEl.style.display = 'none';
        matEl.value = sel.value;
    }
};

// Populate a select with staff options + blue "Otro" custom option.
// When "Otro" is chosen, the select hides and an input appears IN ITS PLACE.
// Enter confirms the name; blur-while-empty reverts to the select.
function incidenciaPopulateSelect(id, options, currentVal) {
    const el = document.getElementById(id);
    if (!el) return;

    // If there's a leftover custom input, remove it and restore the select
    const td = el.closest('td') || el.parentNode;
    td.querySelectorAll('.inc-custom-inp').forEach(e => e.remove());

    // Ensure select is visible (might have been hidden by a previous custom edit)
    if (el.tagName === 'SELECT') el.style.display = '';
    else {
        // Element was replaced — nothing more to do here
        return;
    }

    const blank  = '<option value="">\u2014 Sin asignar \u2014</option>';
    const opts   = options.map(o => `<option value="${o}">${o}</option>`).join('');
    const custom = '<option value="__custom__" style="color:#2563eb;font-weight:bold">\u270f\ufe0f Otro (personalizado)...</option>';
    el.innerHTML = blank + opts + custom;
    el.value = currentVal || '';

    el.onchange = function() {
        if (this.value !== '__custom__') return; // Real option chosen — nothing to do

        const sel = this;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'inc-inp inc-custom-inp';
        inp.dataset.targetSelect = id;
        inp.style.cssText = 'width:100%;height:100%;border:none;background:#fff9c4;font-family:Arial,sans-serif;font-size:11px;text-align:center;box-sizing:border-box;display:block;';
        inp.placeholder = 'Escribe y pulsa Enter\u2026';

        // Enter = confirm (keep showing the input with the typed value)
        // Escape or blur-while-empty = revert to select
        const revert = () => {
            inp.remove();
            sel.style.display = '';
            sel.value = '';
        };

        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.value.trim()) {
                    // Confirmed — style as "done", stay visible
                    this.style.background = '#e8f5e9';
                    this.blur();
                } else {
                    revert();
                }
            }
            if (e.key === 'Escape') revert();
        });

        inp.addEventListener('blur', function() {
            if (!this.value.trim()) revert();
            // If it has a value, leave it — user confirmed with Enter or tabbed away with text
        });

        // Insert input before the select, then hide the select
        sel.parentNode.insertBefore(inp, sel);
        sel.style.display = 'none';
        inp.focus();
    };
}


window.openIncidenciaModal = function() {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    document.getElementById('inc-wizard-date').value       = `${yyyy}-${mm}-${dd}`;
    document.getElementById('inc-dia').value               = `${dd}/${mm}/${yyyy}`;
    document.getElementById('inc-dia-incidencia').value    = `${dd}/${mm}/${yyyy}`;
    document.getElementById('inc-responsable-nombre').value = 'Brenda Van Seumeren';
    document.getElementById('inc-responsable-nif').value   = 'B737854420';

    // Populate staff selects
    const captainNames = (staffDatabase.capitanes || []).map(c => c.nombre);
    const guideNames   = (staffDatabase.guias   || []).map(g => g.nombre);
    incidenciaPopulateSelect('inc-patron',   captainNames, '');
    incidenciaPopulateSelect('inc-monitor1', guideNames,   '');
    incidenciaPopulateSelect('inc-monitor2', guideNames,   '');
    incidenciaPopulateSelect('inc-monitor3', guideNames,   '');

    // Reset boat select
    const boatSel = document.getElementById('inc-boat-select');
    const matEl   = document.getElementById('inc-matricula');
    if (boatSel) { boatSel.value = ''; boatSel.style.display = 'block'; }
    if (matEl)   { matEl.value = ''; matEl.style.display = 'none'; }

    // Clear search
    const srch = document.getElementById('inc-diver-search');
    const sres = document.getElementById('inc-search-results');
    if (srch) srch.value = '';
    if (sres) { sres.innerHTML = ''; sres.classList.add('hidden'); }

    // Clear diver rows
    document.querySelectorAll('#inc-diver-rows .inc-inp').forEach(inp => inp.value = '');
    document.querySelectorAll('#inc-diver-rows .inc-row-clear').forEach(btn => btn.classList.add('hidden'));

    incidenciaWizardLoadTrips();
    document.getElementById('incidencia-modal').classList.remove('hidden');
};

window.closeIncidenciaModal = function() {
    document.getElementById('incidencia-modal').classList.add('hidden');
};

window.incidenciaWizardLoadTrips = function() {
    const dateVal = document.getElementById('inc-wizard-date').value;
    if (!dateVal) return;
    const [y, m, d] = dateVal.split('-');
    document.getElementById('inc-dia').value            = `${d}/${m}/${y}`;
    document.getElementById('inc-dia-incidencia').value = `${d}/${m}/${y}`;

    const allTripsOnDate = mergedAllocations.filter(t =>
        t.date === dateVal && t.assignedBoat !== 'shore'
    );

    // Dedup by ID: prefer internal trip (has guests) over Visor-only
    const tripMap = new Map();
    allTripsOnDate.forEach(t => {
        if (!tripMap.has(t.id)) {
            tripMap.set(t.id, t);
        } else {
            const existing   = tripMap.get(t.id);
            const existCount = (existing.groups||[]).reduce((a,g)=>a+(g.guests||[]).length,0) + (existing.guests||[]).length;
            const newCount   = (t.groups||[]).reduce((a,g)=>a+(g.guests||[]).length,0) + (t.guests||[]).length;
            if (newCount > existCount || t.isInternalTrip) tripMap.set(t.id, t);
        }
    });
    // Sort chronologically by time (HH:MM string sort works correctly)
    const tripsOnDate = [...tripMap.values()].sort((a, b) => (a.time||'').localeCompare(b.time||''));

    const select = document.getElementById('inc-wizard-trip');
    if (tripsOnDate.length === 0) {
        select.innerHTML = '<option value="">— No hay salidas este día —</option>';
        document.getElementById('inc-wizard-divers').innerHTML = '<p class="text-xs text-slate-400 italic text-center pt-4">No hay salidas para esta fecha.</p>';
        return;
    }

    // Auto-assign unassigned Visor trips to match the main calendar logic
    const tripsByTime = {};
    tripsOnDate.forEach(t => {
        if (!tripsByTime[t.time]) tripsByTime[t.time] = [];
        tripsByTime[t.time].push(t);
    });
    Object.values(tripsByTime).forEach(timeTrips => {
        let hasAres   = timeTrips.some(t => (t.assignedBoat||'').toLowerCase() === 'ares');
        let hasKaiser = timeTrips.some(t => (t.assignedBoat||'').toLowerCase() === 'kaiser');
        timeTrips.filter(t => !t.assignedBoat || t.assignedBoat === '').forEach(t => {
            if (!hasAres) { t.assignedBoat = 'ares'; hasAres = true; }
            else if (!hasKaiser) { t.assignedBoat = 'kaiser'; hasKaiser = true; }
            else { t.assignedBoat = 'ares'; }
        });
    });

    // DEBUG
    console.log("[Incidencia] Trips:", (window._incWizardTrips||[]).map(t=>({time:t.time,boat:t.assignedBoat})));
    // Case-insensitive boat label lookup
    const boatLabel = b => {
        const k = (b||'').toLowerCase().trim();
        if (k === 'ares')   return 'Ares';
        if (k === 'kaiser') return 'Kaiser';
        return b || 'Barco';
    };
    select.innerHTML = tripsOnDate.map((t, i) => {
        const boat = boatLabel(t.assignedBoat);
        const site = t.site || 'Sin Destino';
        return `<option value="${i}">${t.time} — ${boat} (${site})</option>`;
    }).join('');
    select.selectedIndex = 0;
    window._incWizardTrips = tripsOnDate;
    incidenciaWizardLoadDivers();
};

window.incidenciaWizardLoadDivers = function() {
    const select = document.getElementById('inc-wizard-trip');
    const idx    = parseInt(select.value);
    const trips  = window._incWizardTrips || [];
    const trip   = trips[idx];
    if (!trip) {
        document.getElementById('inc-wizard-divers').innerHTML = '<p class="text-xs text-slate-400 italic text-center pt-4">Sin datos.</p>';
        return;
    }

    // Fill trip fields
    document.getElementById('inc-hora').value            = trip.time || '';
    document.getElementById('inc-hora-incidencia').value = trip.time || '';
    document.getElementById('inc-punto').value           = trip.site || '';

    // Boat + matricula
    const boatSel = document.getElementById('inc-boat-select');
    const matEl   = document.getElementById('inc-matricula');
    // Case-insensitive matricula lookup
    const boatMat = b => {
        const k = (b||'').toLowerCase().trim();
        if (k === 'ares')   return '6ª CT-4-14-19';
        if (k === 'kaiser') return '6ª CT-4-4-17';
        return null;
    };
    if (boatSel && matEl && boatMat(trip.assignedBoat)) {
        boatSel.value = boatMat(trip.assignedBoat);
        boatSel.style.display = 'block';
        matEl.style.display   = 'none';
        matEl.value = boatMat(trip.assignedBoat);
    }

    // Staff selects
    const captainNames = (staffDatabase.capitanes || []).map(c => c.nombre);
    const guideNames   = (staffDatabase.guias   || []).map(g => g.nombre);
    const groupGuides  = (trip.groups || []).map(g => g.guide).filter(Boolean);
    incidenciaPopulateSelect('inc-patron',   captainNames, trip.captain  || '');
    incidenciaPopulateSelect('inc-monitor1', guideNames,   groupGuides[0] || '');
    incidenciaPopulateSelect('inc-monitor2', guideNames,   groupGuides[1] || '');
    incidenciaPopulateSelect('inc-monitor3', guideNames,   groupGuides[2] || '');

    // Collect guests from all sources
    const allGuests = [];
    const addGuest = (g) => {
        if (!g) return;
        const name = g.nombre || g.firstName || g.name || '';
        if (!name) return;
        const key = g.dni || g.passportId || (name + (g.apellido||g.lastName||''));
        const dup = allGuests.some(x => {
            const xkey = x.dni || x.passportId || ((x.nombre||x.firstName||x.name||'') + (x.apellido||x.lastName||''));
            return key && xkey && key === xkey;
        });
        if (!dup) allGuests.push(g);
    };

    (trip.groups  || []).forEach(g => (g.guests||[]).forEach(addGuest));
    (trip.guests  || []).forEach(addGuest);

    // Fallback: find the internal shadow trip if this one has no guests
    if (allGuests.length === 0) {
        const shadow = mergedAllocations.find(t =>
            t.id === trip.id && t !== trip &&
            ((t.groups||[]).some(g => (g.guests||[]).length > 0) || (t.guests||[]).length > 0)
        );
        if (shadow) {
            (shadow.groups || []).forEach(g => (g.guests||[]).forEach(addGuest));
            (shadow.guests || []).forEach(addGuest);
            const shadowGuides = (shadow.groups||[]).map(g=>g.guide).filter(Boolean);
            incidenciaPopulateSelect('inc-patron',   captainNames, shadow.captain   || '');
            incidenciaPopulateSelect('inc-monitor1', guideNames,   shadowGuides[0] || '');
            incidenciaPopulateSelect('inc-monitor2', guideNames,   shadowGuides[1] || '');
            incidenciaPopulateSelect('inc-monitor3', guideNames,   shadowGuides[2] || '');
        }
    }

    if (allGuests.length === 0) {
        document.getElementById('inc-wizard-divers').innerHTML = '<p class="text-xs text-slate-400 italic text-center pt-4">No hay buceadores registrados en esta salida.</p>';
        window._incWizardDiverData = [];
        return;
    }

    // Store diver data by index to avoid HTML encoding issues
    window._incWizardDiverData = allGuests.map(g => ({
        nombre: [g.nombre||g.firstName, g.apellido||g.lastName].filter(Boolean).join(' ') || g.name || '—',
        dni:    g.dni || g.passportId || '—'
    }));

    document.getElementById('inc-wizard-divers').innerHTML = window._incWizardDiverData.map((d, i) =>
        incidenciaDiverRow(d.nombre, d.dni, i)
    ).join('');
};

function incidenciaDiverRow(nombre, dni, idx) {
    // Use data-index to reference stored data — avoids all HTML encoding issues
    return `<label class="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all"><input type="checkbox" class="inc-diver-check w-4 h-4 rounded accent-blue-600" data-index="${idx}"><div class="flex-1 min-w-0"><div class="text-sm font-bold text-slate-800 truncate">${nombre}</div><div class="text-xs text-slate-400 font-mono">${dni}</div></div></label>`;
}

window.incidenciaSearchDiver = function(query) {
    const resEl = document.getElementById('inc-search-results');
    if (!resEl) return;
    const q = (query || '').trim();
    if (q.length < 2) { resEl.innerHTML = ''; resEl.classList.add('hidden'); return; }

    // Normalize: strip accents and lowercase for fuzzy matching
    const normalize = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'');
    const norm = normalize(q);

    const matches = (customerDatabase || []).filter(c => {
        // Build full name by combining nombre + apellido (in case they're separate)
        const fullName = normalize([c.nombre, c.apellido, c.name].filter(Boolean).join(' '));
        const dniStr   = normalize(c.dni || '');
        return fullName.includes(norm) || dniStr.includes(norm);
    }).slice(0, 8);

    if (matches.length === 0) {
        resEl.innerHTML = '<p class="text-xs text-slate-400 italic px-1 py-1">Sin resultados.</p>';
        resEl.classList.remove('hidden');
        return;
    }

    // Store search results by index to avoid encoding issues in onclick
    window._incSearchResults = matches;
    resEl.classList.remove('hidden');
    resEl.innerHTML = matches.map((c, i) => {
        const disp = [c.nombre, c.apellido].filter(Boolean).join(' ') || c.name || '—';
        const dni  = c.dni || '';
        return `<button onclick="incidenciaAddSearchResult(${i})" class="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 rounded-lg flex justify-between items-center gap-1"><span class="font-bold text-slate-700 truncate">${disp}</span><span class="text-slate-400 font-mono shrink-0">${dni}</span></button>`;
    }).join('');
};

window.incidenciaClearRow = function(btn) {
    const td = btn.parentElement;
    const tr = td.parentElement;
    const nombre = tr.querySelector('.inc-diver-nombre');
    const dni    = tr.querySelector('.inc-diver-dni');
    const tasa   = tr.querySelector('.inc-diver-tasa');
    if (nombre) nombre.value = '';
    if (dni)    dni.value = '';
    if (tasa)   tasa.value = '';
    btn.classList.add('hidden');
};

window.incidenciaAddSearchResult = function(idx) {
    const results = window._incSearchResults || [];
    const c = results[idx];
    if (!c) return;
    const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ') || c.name || '—';
    const dni    = c.dni || '';
    const nombreInputs = document.querySelectorAll('#inc-diver-rows .inc-diver-nombre');
    const dniInputs    = document.querySelectorAll('#inc-diver-rows .inc-diver-dni');
    const tasaInputs   = document.querySelectorAll('#inc-diver-rows .inc-diver-tasa');
    const clearBtns    = document.querySelectorAll('#inc-diver-rows .inc-row-clear');

    for (let i = 0; i < nombreInputs.length; i++) {
        if (!nombreInputs[i].value) {
            nombreInputs[i].value = nombre;
            dniInputs[i].value   = dni;
            if (tasaInputs[i]) tasaInputs[i].value = 'NO';
            if (clearBtns[i]) clearBtns[i].classList.remove('hidden');

            showToast('✅ ' + nombre + ' añadido al formulario.');
            const srch = document.getElementById('inc-diver-search');
            const sres = document.getElementById('inc-search-results');
            if (srch) srch.value = '';
            if (sres) { sres.innerHTML = ''; sres.classList.add('hidden'); }
            return;
        }
    }
    showToast('⚠️ No hay filas vacías disponibles.');
};

window.incidenciaApplySelected = function() {
    const checked = [...document.querySelectorAll('.inc-diver-check:checked')];
    if (checked.length === 0) { showToast('Selecciona al menos un buceador.'); return; }

    const diverData    = window._incWizardDiverData || [];
    const nombreInputs = document.querySelectorAll('#inc-diver-rows .inc-diver-nombre');
    const dniInputs    = document.querySelectorAll('#inc-diver-rows .inc-diver-dni');
    const tasaInputs   = document.querySelectorAll('#inc-diver-rows .inc-diver-tasa');
    const clearBtns    = document.querySelectorAll('#inc-diver-rows .inc-row-clear');

    let filled = 0;
    for (const cb of checked) {
        const diver = diverData[parseInt(cb.dataset.index)];
        if (!diver) continue;
        let placed = false;
        for (let i = 0; i < nombreInputs.length; i++) {
            if (!nombreInputs[i].value) {
                nombreInputs[i].value = diver.nombre || '';
                dniInputs[i].value   = diver.dni !== '—' ? diver.dni : '';
                if (tasaInputs[i]) tasaInputs[i].value = 'NO';
                if (clearBtns[i]) clearBtns[i].classList.remove('hidden');

                filled++;
                placed = true;
                break;
            }
        }
        if (!placed) break;
    }
    document.querySelectorAll('.inc-diver-check').forEach(cb => cb.checked = false);
    if (filled > 0) showToast('✅ ' + filled + ' buceadores añadidos al formulario.');
    else showToast('⚠️ No hay filas vacías disponibles.');
};


window.printIncidencia = function() {
    // Hide "— Sin asignar —" text in empty selects by making it transparent
    const emptySelects = document.querySelectorAll('#incidencia-form-area select');
    emptySelects.forEach(sel => {
        if (!sel.value) {
            sel.style.color = 'transparent';
            sel.dataset.printHidden = '1';
        }
    });

    const style = document.createElement('style');
    style.id = 'inc-print-style';
    style.innerHTML = [
        '@media print {',
        // @page margin:0 removes Chrome/Edge browser header+footer (timestamp, URL, page#)
        '  @page { margin: 0; size: A4 portrait; }',
        '  body > *:not(#incidencia-modal) { display: none !important; }',
        '  body { margin: 0 !important; padding: 0 !important; }',
        '  #incidencia-modal { position: static !important; background: none !important; display: block !important; padding: 0 !important; }',
        '  #incidencia-modal > div { box-shadow: none !important; border: none !important; height: auto !important; max-width: 100% !important; border-radius: 0 !important; display: block !important; }',
        '  #incidencia-modal > div > div:first-child { display: none !important; }',
        '  .flex.flex-1.overflow-hidden { display: block !important; }',
        '  .flex.flex-1.overflow-hidden > div.w-80 { display: none !important; }',
        // Apply 2cm padding on the form content to provide visual whitespace
        '  #incidencia-form-area { overflow: visible !important; padding: 2cm !important; flex: unset !important; display: block !important; box-sizing: border-box !important; }',
        '  .inc-inp.hl, .inc-inline { background-color: transparent !important; }',
        '  .inc-custom-revert { display: none !important; }',
        '  select { -webkit-appearance: none; border: none !important; background: transparent !important; }',
        '}'
    ].join('\n');
    document.head.appendChild(style);
    window.print();
    setTimeout(function() {
        // Restore empty select text colors
        document.querySelectorAll('#incidencia-form-area select[data-print-hidden]').forEach(sel => {
            sel.style.color = '';
            delete sel.dataset.printHidden;
        });
        var s = document.getElementById('inc-print-style');
        if (s) s.remove();
    }, 2000);
};

// Global listener for manual typing in diver rows to show/hide the 'X'
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('inc-diver-nombre') || e.target.classList.contains('inc-diver-dni')) {
        const tr = e.target.closest('tr');
        if (tr && tr.parentElement && tr.parentElement.id === 'inc-diver-rows') {
            const btn = tr.querySelector('.inc-row-clear');
            if (btn) {
                const hasVal = tr.querySelector('.inc-diver-nombre').value || tr.querySelector('.inc-diver-dni').value;
                btn.classList.toggle('hidden', !hasVal);
            }
        }
    }
});



// ── DIRECT SALES LOGIC ──────────────────────────────────────────────

window.openAddSaleModal = function() {
    document.getElementById('add-sale-modal').classList.remove('hidden');
};

window.closeAddSaleModal = function() {
    document.getElementById('add-sale-modal').classList.add('hidden');
};

window.saveDirectSale = async function() {
    const concept = document.getElementById('sale-concept').value.trim();
    const amountVal = document.getElementById('sale-amount').value;
    const amount = parseFloat(amountVal);
    const method = document.getElementById('sale-method').value;

    if (!concept || isNaN(amount) || amount <= 0) {
        showToast("Por favor, rellena todos los campos correctamente.", "error");
        return;
    }

    const btn = document.getElementById('btn-save-sale');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Guardando...";

    try {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        
        const saleDoc = {
            type: 'pago',
            description: concept,
            customPrice: amount,
            paymentMethod: method,
            paymentStatus: 'paid',
            paidAt: firebase.firestore.FieldValue.serverTimestamp(),
            date: dateStr,
            nombre: 'VENTA DIRECTA'
        };

        // We use a dedicated virtual customer 'VENTA DIRECTA' for shop walk-ins
        await db.collection('mangamar_customers').doc('VENTA DIRECTA').collection('history').add(saleDoc);
        
        showToast("✅ Venta registrada con éxito");
        window.closeAddSaleModal();
        
        // Reset form
        document.getElementById('sale-concept').value = '';
        document.getElementById('sale-amount').value = '';
        
        // Refresh accounting view
        if (typeof fetchContabilidadMonth === 'function') fetchContabilidadMonth();
        
     } catch (e) {
         console.error("Error saving direct sale:", e);
         showToast("Error al guardar la venta.", "error");
     } finally {
         btn.disabled = false;
         btn.innerText = originalText;
     }
};


// ==========================================
// 19. TEST DE BUCEADOR (FUERA)
// ==========================================

window.openTestFueraModal = function() {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    
    document.getElementById('test-wizard-date').value       = `${yyyy}-${mm}-${dd}`;
    document.getElementById('test-global-date').value       = `${dd}-${mm}-${yyyy.toString().slice(-2)}`;
    document.getElementById('test-global-certificado').value = 'Mangamar Dive Center';

    // Clear search
    const srch = document.getElementById('test-diver-search');
    const sres = document.getElementById('test-search-results');
    if (srch) srch.value = '';
    if (sres) { sres.innerHTML = ''; sres.classList.add('hidden'); }

    // Clear table rows
    document.querySelectorAll('#test-diver-rows .test-inp').forEach(inp => inp.value = '');
    document.querySelectorAll('#test-diver-rows .test-row-clear').forEach(btn => btn.classList.add('hidden'));
    window.testFueraActiveTableDivers = [];

    testFueraLoadTrips();
    document.getElementById('test-fuera-modal').classList.remove('hidden');
};

window.closeTestFueraModal = function() {
    document.getElementById('test-fuera-modal').classList.add('hidden');
};

window.openTestFueraFromManifest = function() {
    if (!window.activeBoatItem) return;
    const dateVal = window.activeBoatItem.date;
    if (!dateVal) return;
    
    // Set date inputs
    const [y, m, d] = dateVal.split('-');
    document.getElementById('test-wizard-date').value       = dateVal;
    document.getElementById('test-global-date').value       = `${d}-${m}-${y.slice(-2)}`;
    document.getElementById('test-global-certificado').value = 'Mangamar Dive Center';

    // Clear search
    const srch = document.getElementById('test-diver-search');
    const sres = document.getElementById('test-search-results');
    if (srch) srch.value = '';
    if (sres) { sres.innerHTML = ''; sres.classList.add('hidden'); }

    // Clear table rows
    document.querySelectorAll('#test-diver-rows .test-inp').forEach(inp => inp.value = '');
    document.querySelectorAll('#test-diver-rows .test-row-clear').forEach(btn => btn.classList.add('hidden'));
    window.testFueraActiveTableDivers = [];

    // Load trips for the date
    testFueraLoadTrips();

    // Select this specific trip
    const trips = window._testWizardTrips || [];
    let tripIdx = trips.findIndex(t => t.id === window.activeBoatItem.id);
    if (tripIdx === -1) {
        // Fallback by time and boat
        tripIdx = trips.findIndex(t => t.time === window.activeBoatItem.time && (t.assignedBoat||'').toLowerCase() === (window.activeBoatItem.assignedBoat||'').toLowerCase());
    }
    
    const select = document.getElementById('test-wizard-trip');
    if (tripIdx !== -1 && select) {
        select.value = tripIdx;
        testFueraLoadDivers();
    }

    // Check all divers checkboxes
    const checkboxes = document.querySelectorAll('.test-diver-check');
    checkboxes.forEach(cb => cb.checked = true);

    // Apply selected divers to the printable form
    testFueraApplySelected();

    // Show the modal
    document.getElementById('test-fuera-modal').classList.remove('hidden');
};

window.testFueraLoadTrips = function() {
    const dateVal = document.getElementById('test-wizard-date').value;
    if (!dateVal) return;
    const [y, m, d] = dateVal.split('-');
    document.getElementById('test-global-date').value = `${d}-${m}-${y.slice(-2)}`;

    const allTripsOnDate = mergedAllocations.filter(t =>
        t.date === dateVal && 
        t.assignedBoat !== 'shore' && 
        t.site && 
        t.site.toLowerCase().includes('fuera')
    );

    // Dedup by ID: prefer internal trip over Visor-only
    const tripMap = new Map();
    allTripsOnDate.forEach(t => {
        if (!tripMap.has(t.id)) {
            tripMap.set(t.id, t);
        } else {
            const existing   = tripMap.get(t.id);
            const existCount = (existing.groups||[]).reduce((a,g)=>a+(g.guests||[]).length,0) + (existing.guests||[]).length;
            const newCount   = (t.groups||[]).reduce((a,g)=>a+(g.guests||[]).length,0) + (t.guests||[]).length;
            if (newCount > existCount || t.isInternalTrip) tripMap.set(t.id, t);
        }
    });
    const tripsOnDate = [...tripMap.values()].sort((a, b) => (a.time||'').localeCompare(b.time||''));

    const select = document.getElementById('test-wizard-trip');
    if (tripsOnDate.length === 0) {
        select.innerHTML = '<option value="">— No hay salidas a Fuera —</option>';
        document.getElementById('test-wizard-divers').innerHTML = '<p class="text-xs text-slate-400 italic text-center pt-4">No hay salidas a Fuera para esta fecha.</p>';
        return;
    }

    // Auto-assign unassigned Visor trips
    const tripsByTime = {};
    tripsOnDate.forEach(t => {
        if (!tripsByTime[t.time]) tripsByTime[t.time] = [];
        tripsByTime[t.time].push(t);
    });
    Object.values(tripsByTime).forEach(timeTrips => {
        let hasAres   = timeTrips.some(t => (t.assignedBoat||'').toLowerCase() === 'ares');
        let hasKaiser = timeTrips.some(t => (t.assignedBoat||'').toLowerCase() === 'kaiser');
        timeTrips.filter(t => !t.assignedBoat || t.assignedBoat === '').forEach(t => {
            if (!hasAres) { t.assignedBoat = 'ares'; hasAres = true; }
            else if (!hasKaiser) { t.assignedBoat = 'kaiser'; hasKaiser = true; }
            else { t.assignedBoat = 'ares'; }
        });
    });

    const boatLabel = b => {
        const k = (b||'').toLowerCase().trim();
        if (k === 'ares')   return 'Ares';
        if (k === 'kaiser') return 'Kaiser';
        return b || 'Barco';
    };
    select.innerHTML = tripsOnDate.map((t, i) => {
        const boat = boatLabel(t.assignedBoat);
        return `<option value="${i}">${t.time} — ${boat}</option>`;
    }).join('');
    select.selectedIndex = 0;
    window._testWizardTrips = tripsOnDate;
    testFueraLoadDivers();
};

window.testFueraLoadDivers = function() {
    const select = document.getElementById('test-wizard-trip');
    const idx    = parseInt(select.value);
    const trips  = window._testWizardTrips || [];
    const trip   = trips[idx];
    if (!trip) {
        document.getElementById('test-wizard-divers').innerHTML = '<p class="text-xs text-slate-400 italic text-center pt-4">Sin datos.</p>';
        return;
    }

    // Collect guests from all sources
    const allGuests = [];
    const addGuest = (g) => {
        if (!g) return;
        const name = g.nombre || g.firstName || g.name || '';
        if (!name) return;
        const key = g.dni || g.passportId || (name + (g.apellido||g.lastName||''));
        const dup = allGuests.some(x => {
            const xkey = x.dni || x.passportId || ((x.nombre||x.firstName||x.name||'') + (x.apellido||x.lastName||''));
            return key && xkey && key === xkey;
        });
        if (!dup) allGuests.push(g);
    };

    (trip.groups  || []).forEach(g => (g.guests||[]).forEach(addGuest));
    (trip.guests  || []).forEach(addGuest);

    // Fallback: find internal shadow trip
    if (allGuests.length === 0) {
        const shadow = mergedAllocations.find(t =>
            t.id === trip.id && t !== trip &&
            ((t.groups||[]).some(g => (g.guests||[]).length > 0) || (t.guests||[]).length > 0)
        );
        if (shadow) {
            (shadow.groups || []).forEach(g => (g.guests||[]).forEach(addGuest));
            (shadow.guests || []).forEach(addGuest);
        }
    }

    if (allGuests.length === 0) {
        document.getElementById('test-wizard-divers').innerHTML = '<p class="text-xs text-slate-400 italic text-center pt-4">No hay buceadores registrados en esta salida.</p>';
        window._testWizardDiverData = [];
        return;
    }

    window._testWizardDiverData = allGuests.map(g => ({
        nombre: [g.nombre||g.firstName, g.apellido||g.lastName].filter(Boolean).join(' ') || g.name || '—',
        dni:    g.dni || g.passportId || '—'
    }));

    document.getElementById('test-wizard-divers').innerHTML = window._testWizardDiverData.map((d, i) =>
        `<label class="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer hover:bg-cyan-50 border border-transparent hover:border-cyan-200 transition-all"><input type="checkbox" class="test-diver-check w-4 h-4 rounded accent-cyan-600" data-index="${i}" onchange="window.testFueraToggleDiverCheckbox(this)"><div class="flex-1 min-w-0"><div class="text-sm font-bold text-slate-800 truncate">${d.nombre}</div><div class="text-xs text-slate-400 font-mono">${d.dni}</div></div></label>`
    ).join('');
    window.testFueraSyncCheckboxesFromTable();
};

window.testFueraActiveTableDivers = [];

window.testFueraUpdateStateFromDOM = function() {
    const nombreInputs = document.querySelectorAll('#test-diver-rows .test-diver-nombre');
    const dniInputs    = document.querySelectorAll('#test-diver-rows .test-diver-dni');
    const fechaInputs  = document.querySelectorAll('#test-diver-rows .test-diver-fecha');
    const certInputs   = document.querySelectorAll('#test-diver-rows .test-diver-certificado');

    window.testFueraActiveTableDivers = [];
    for (let i = 0; i < nombreInputs.length; i++) {
        const nombre = nombreInputs[i].value.trim();
        const dni    = dniInputs[i].value.trim();
        if (nombre || dni) {
            window.testFueraActiveTableDivers.push({
                nombre: nombre,
                dni: dni,
                fechaCert: fechaInputs[i].value.trim(),
                certificadoPor: certInputs[i].value.trim()
            });
        }
    }
};

window.testFueraRenderTableFromState = function() {
    const diverData = window._testWizardDiverData || [];
    
    const getDiverOrderIndex = (item) => {
        const nameLower = (item.nombre || '').trim().toLowerCase();
        const dniLower = (item.dni || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const idx = diverData.findIndex(d => {
            const checklistName = (d.nombre || '').trim().toLowerCase();
            const checklistDni  = (d.dni || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (checklistDni && checklistDni !== '' && checklistDni !== '—' && checklistDni === dniLower) {
                return true;
            }
            return checklistName && checklistName === nameLower;
        });
        return idx !== -1 ? idx : 9999;
    };

    window.testFueraActiveTableDivers.sort((a, b) => {
        return getDiverOrderIndex(a) - getDiverOrderIndex(b);
    });

    const nombreInputs = document.querySelectorAll('#test-diver-rows .test-diver-nombre');
    const dniInputs    = document.querySelectorAll('#test-diver-rows .test-diver-dni');
    const fechaInputs  = document.querySelectorAll('#test-diver-rows .test-diver-fecha');
    const certInputs   = document.querySelectorAll('#test-diver-rows .test-diver-certificado');
    const clearBtns    = document.querySelectorAll('#test-diver-rows .test-row-clear');

    for (let i = 0; i < nombreInputs.length; i++) {
        const item = window.testFueraActiveTableDivers[i];
        if (item && i < 10) {
            nombreInputs[i].value = item.nombre || '';
            dniInputs[i].value   = item.dni || '';
            fechaInputs[i].value = item.fechaCert || '';
            certInputs[i].value  = item.certificadoPor || '';
            if (clearBtns[i]) clearBtns[i].classList.remove('hidden');
        } else {
            nombreInputs[i].value = '';
            dniInputs[i].value   = '';
            fechaInputs[i].value = '';
            certInputs[i].value  = '';
            if (clearBtns[i]) clearBtns[i].classList.add('hidden');
        }
    }

    window.testFueraSyncCheckboxesFromTable();
};

window.testFueraSyncCheckboxesFromTable = function() {
    const nombreInputs = [...document.querySelectorAll('#test-diver-rows .test-diver-nombre')].map(inp => inp.value.trim().toLowerCase());
    const dniInputs    = [...document.querySelectorAll('#test-diver-rows .test-diver-dni')].map(inp => inp.value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

    const checkboxes = document.querySelectorAll('.test-diver-check');
    const diverData  = window._testWizardDiverData || [];

    checkboxes.forEach(cb => {
        const diver = diverData[parseInt(cb.dataset.index)];
        if (!diver) return;
        const divName = (diver.nombre || '').trim().toLowerCase();
        const divDni  = (diver.dni || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

        let found = false;
        if (divDni && divDni !== '' && divDni !== '—') {
            found = dniInputs.some(d => d === divDni);
        }
        if (!found && divName) {
            found = nombreInputs.some(n => n === divName);
        }
        cb.checked = found;
    });
};

window.testFueraToggleDiverCheckbox = function(cb) {
    const diverData  = window._testWizardDiverData || [];
    const diver = diverData[parseInt(cb.dataset.index)];
    if (!diver) return;

    const divName = (diver.nombre || '').trim().toLowerCase();
    const divDni  = (diver.dni || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    window.testFueraUpdateStateFromDOM();

    if (cb.checked) {
        const globalDate   = document.getElementById('test-global-date').value || '';
        const globalCert   = document.getElementById('test-global-certificado').value || '';

        const exists = window.testFueraActiveTableDivers.some(item => {
            const rowDni = (item.dni || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const rowName = (item.nombre || '').trim().toLowerCase();
            return (divDni && divDni !== '' && divDni !== '—' && rowDni === divDni) || (divName && rowName === divName);
        });

        if (!exists) {
            if (window.testFueraActiveTableDivers.length < 10) {
                window.testFueraActiveTableDivers.push({
                    nombre: diver.nombre || '',
                    dni: diver.dni !== '—' ? diver.dni : '',
                    fechaCert: globalDate,
                    certificadoPor: globalCert
                });
                showToast('✅ ' + diver.nombre + ' añadido.');
            } else {
                cb.checked = false; // Revert
                showToast('⚠️ No hay filas vacías disponibles.');
                return;
            }
        }
    } else {
        window.testFueraActiveTableDivers = window.testFueraActiveTableDivers.filter(item => {
            const rowDni = (item.dni || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const rowName = (item.nombre || '').trim().toLowerCase();
            const match = (divDni && divDni !== '' && divDni !== '—' && rowDni === divDni) || (divName && rowName === divName);
            return !match;
        });
        showToast('❌ ' + diver.nombre + ' quitado.');
    }

    window.testFueraRenderTableFromState();
};

window.testFueraSearchDiver = function(query) {
    const resEl = document.getElementById('test-search-results');
    if (!resEl) return;
    const q = (query || '').trim();
    if (q.length < 2) { resEl.innerHTML = ''; resEl.classList.add('hidden'); return; }

    const normalize = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'');
    const norm = normalize(q);

    const matches = (customerDatabase || []).filter(c => {
        const fullName = normalize([c.nombre, c.apellido, c.name].filter(Boolean).join(' '));
        const dniStr   = normalize(c.dni || '');
        return fullName.includes(norm) || dniStr.includes(norm);
    }).slice(0, 8);

    if (matches.length === 0) {
        resEl.innerHTML = '<p class="text-xs text-slate-400 italic px-1 py-1">Sin resultados.</p>';
        resEl.classList.remove('hidden');
        return;
    }

    window._testSearchResults = matches;
    resEl.classList.remove('hidden');
    resEl.innerHTML = matches.map((c, i) => {
        const disp = [c.nombre, c.apellido].filter(Boolean).join(' ') || c.name || '—';
        const dni  = c.dni || '';
        return `<button onclick="testFueraAddSearchResult(${i})" class="w-full text-left px-2 py-1.5 text-xs hover:bg-cyan-50 rounded-lg flex justify-between items-center gap-1"><span class="font-bold text-slate-700 truncate">${disp}</span><span class="text-slate-400 font-mono shrink-0">${dni}</span></button>`;
    }).join('');
};

window.testFueraClearRow = function(btn) {
    const td = btn.parentElement;
    const tr = td.parentElement;
    const nombre = tr.querySelector('.test-diver-nombre');
    const dni    = tr.querySelector('.test-diver-dni');
    const fecha  = tr.querySelector('.test-diver-fecha');
    const cert   = tr.querySelector('.test-diver-certificado');
    if (nombre) nombre.value = '';
    if (dni)    dni.value = '';
    if (fecha)  fecha.value = '';
    if (cert)   cert.value = '';
    btn.classList.add('hidden');
    
    window.testFueraUpdateStateFromDOM();
    window.testFueraRenderTableFromState();
};

window.testFueraAddSearchResult = function(idx) {
    const results = window._testSearchResults || [];
    const c = results[idx];
    if (!c) return;
    const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ') || c.name || '—';
    const dni    = c.dni || '';
    
    const globalDate = document.getElementById('test-global-date').value || '';
    const globalCert = document.getElementById('test-global-certificado').value || '';

    const nombreInputs = document.querySelectorAll('#test-diver-rows .test-diver-nombre');
    const dniInputs    = document.querySelectorAll('#test-diver-rows .test-diver-dni');
    const fechaInputs  = document.querySelectorAll('#test-diver-rows .test-diver-fecha');
    const certInputs   = document.querySelectorAll('#test-diver-rows .test-diver-certificado');
    const clearBtns    = document.querySelectorAll('#test-diver-rows .test-row-clear');

    for (let i = 0; i < nombreInputs.length; i++) {
        if (!nombreInputs[i].value) {
            nombreInputs[i].value = nombre;
            dniInputs[i].value   = dni;
            fechaInputs[i].value = globalDate;
            certInputs[i].value  = globalCert;
            if (clearBtns[i]) clearBtns[i].classList.remove('hidden');

            showToast('✅ ' + nombre + ' añadido al formulario.');
            const srch = document.getElementById('test-diver-search');
            const sres = document.getElementById('test-search-results');
            if (srch) srch.value = '';
            if (sres) { sres.innerHTML = ''; sres.classList.add('hidden'); }
            window.testFueraSyncCheckboxesFromTable();
            return;
        }
    }
    showToast('⚠️ No hay filas vacías disponibles.');
};

window.testFueraApplySelected = function() {
    const checked = [...document.querySelectorAll('.test-diver-check:checked')];
    if (checked.length === 0) { showToast('Selecciona al menos un buceador.'); return; }

    const diverData    = window._testWizardDiverData || [];
    const globalDate   = document.getElementById('test-global-date').value || '';
    const globalCert   = document.getElementById('test-global-certificado').value || '';

    window.testFueraUpdateStateFromDOM();

    let addedCount = 0;
    for (const cb of checked) {
        const diver = diverData[parseInt(cb.dataset.index)];
        if (!diver) continue;
        
        const divName = (diver.nombre || '').trim().toLowerCase();
        const divDni  = (diver.dni || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const exists = window.testFueraActiveTableDivers.some(item => {
            const rowDni = (item.dni || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const rowName = (item.nombre || '').trim().toLowerCase();
            return (divDni && divDni !== '' && divDni !== '—' && rowDni === divDni) || (divName && rowName === divName);
        });

        if (!exists) {
            if (window.testFueraActiveTableDivers.length < 10) {
                window.testFueraActiveTableDivers.push({
                    nombre: diver.nombre || '',
                    dni: diver.dni !== '—' ? diver.dni : '',
                    fechaCert: globalDate,
                    certificadoPor: globalCert
                });
                addedCount++;
            }
        }
    }

    window.testFueraRenderTableFromState();

    if (addedCount > 0) {
        showToast(`✅ ${addedCount} buceadores añadidos.`);
    } else {
        showToast('⚠️ Los buceadores ya estaban en el formulario.');
    }
};

window.printTestFuera = function() {
    // Copy input values to print spans
    document.querySelectorAll('#test-diver-rows tr').forEach(tr => {
        tr.querySelectorAll('input.test-inp').forEach(inp => {
            const span = inp.parentNode.querySelector('.test-print-val');
            if (span) {
                span.textContent = inp.value || '';
            }
        });
    });

    const style = document.createElement('style');
    style.id = 'test-print-style';
    style.innerHTML = [
        '@media print {',
        '  @page { margin: 0; size: A4 portrait; }',
        '  body > *:not(#test-fuera-modal) { display: none !important; }',
        '  body { margin: 0 !important; padding: 0 !important; }',
        '  #test-fuera-modal { position: static !important; background: none !important; display: block !important; padding: 0 !important; }',
        '  #test-fuera-modal > div { box-shadow: none !important; border: none !important; height: auto !important; max-width: 100% !important; border-radius: 0 !important; display: block !important; }',
        '  #test-fuera-modal > div > div:first-child { display: none !important; }',
        '  .flex.flex-1.overflow-hidden { display: block !important; }',
        '  .flex.flex-1.overflow-hidden > div.w-80 { display: none !important; }',
        '  #test-fuera-form-area { overflow: visible !important; padding: 2cm !important; flex: unset !important; display: block !important; box-sizing: border-box !important; }',
        '  select { -webkit-appearance: none; border: none !important; background: transparent !important; }',
        '}'
    ].join('\n');
    document.head.appendChild(style);
    window.print();
    setTimeout(function() {
        var s = document.getElementById('test-print-style');
        if (s) s.remove();
    }, 2000);
};

// Global listener for manual typing in test diver rows to show/hide the 'X' and sync checkboxes
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('test-diver-nombre') || e.target.classList.contains('test-diver-dni')) {
        const tr = e.target.closest('tr');
        if (tr && tr.parentElement && tr.parentElement.id === 'test-diver-rows') {
            const btn = tr.querySelector('.test-row-clear');
            if (btn) {
                const hasVal = tr.querySelector('.test-diver-nombre').value || tr.querySelector('.test-diver-dni').value;
                btn.classList.toggle('hidden', !hasVal);
            }
            if (typeof window.testFueraUpdateStateFromDOM === 'function') {
                window.testFueraUpdateStateFromDOM();
            }
            if (typeof window.testFueraSyncCheckboxesFromTable === 'function') {
                window.testFueraSyncCheckboxesFromTable();
            }
        }
    }
});

// Global listener for blur to collapse empty lines and re-sort when typing finishes
document.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('test-diver-nombre') || e.target.classList.contains('test-diver-dni')) {
        const tr = e.target.closest('tr');
        if (tr && tr.parentElement && tr.parentElement.id === 'test-diver-rows') {
            if (typeof window.testFueraUpdateStateFromDOM === 'function' && typeof window.testFueraRenderTableFromState === 'function') {
                window.testFueraUpdateStateFromDOM();
                window.testFueraRenderTableFromState();
            }
        }
    }
});

window.generateTestFueraEmail = function() {
    const select = document.getElementById('test-wizard-trip');
    const idx    = parseInt(select.value);
    const trips  = window._testWizardTrips || [];
    const trip   = trips[idx];
    
    // Auto-select corresponding boat dropdown in email generator
    const emailBoatSelect = document.getElementById('email-boat-select');
    if (emailBoatSelect && trip) {
        const boatStr = (trip.assignedBoat || '').toLowerCase().trim();
        if (boatStr === 'ares') {
            emailBoatSelect.value = 'ARES 6CT4919';
        } else if (boatStr === 'kaiser') {
            emailBoatSelect.value = 'KAISER 6CT4417';
        } else {
            emailBoatSelect.value = 'ARES 6CT4919';
        }
    }
    
    window.updateTestFueraEmailText();
    document.getElementById('test-email-modal').classList.remove('hidden');
};

window.updateTestFueraEmailText = function() {
    const select = document.getElementById('test-wizard-trip');
    const idx    = parseInt(select.value);
    const trips  = window._testWizardTrips || [];
    const trip   = trips[idx];
    
    const boatVal = document.getElementById('email-boat-select').value;
    
    // Date
    const tripDate = document.getElementById('test-wizard-date').value; // YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];
    let dateText = "de hoy";
    if (tripDate && tripDate !== todayStr) {
        const [y, m, d] = tripDate.split('-');
        dateText = `${d}/${m}/${y}`;
    }
    
    // Time
    let timeText = "a las --:--h. aprox.";
    if (trip && trip.time) {
        timeText = `a las ${trip.time.replace(':', '.')}h .aprox.`;
    }
    
    // Patrón
    let patronText = "Patrón:\n  - Sin asignar";
    if (trip && trip.captain) {
        const dni = findStaffDni(trip.captain, 'capitanes');
        patronText = `Patrón:\n  - ${trip.captain}${dni ? ' DNI ' + dni : ''}`;
    }
    
    // Guías
    const guidesList = [];
    if (trip) {
        (trip.groups || []).forEach(g => {
            if (g.guide && !guidesList.includes(g.guide)) guidesList.push(g.guide);
            if (g.apoyo && !guidesList.includes(g.apoyo)) guidesList.push(g.apoyo);
        });
    }
    let guiasText = "Guías:\n  - Sin asignar";
    if (guidesList.length > 0) {
        guiasText = "Guías:\n" + guidesList.map(g => {
            const dni = findStaffDni(g, 'guias');
            return `  - ${g}${dni ? ' DNI ' + dni : ''}`;
        }).join('\n');
    }
    
    // Clientes (Divers)
    const clientsList = [];
    document.querySelectorAll('#test-diver-rows tr').forEach(tr => {
        const name = (tr.querySelector('.test-diver-nombre').value || '').trim();
        const dni = (tr.querySelector('.test-diver-dni').value || '').trim();
        if (name) {
            clientsList.push({ nombre: name, dni: dni });
        }
    });
    
    // Fallback if form is empty
    if (clientsList.length === 0 && window._testWizardDiverData) {
        window._testWizardDiverData.forEach(d => {
            clientsList.push({ nombre: d.nombre, dni: d.dni !== '—' ? d.dni : '' });
        });
    }
    
    let clientsText = "Clientes:\n  - Sin registrar";
    if (clientsList.length > 0) {
        clientsText = "Clientes:\n" + clientsList.map(c => `  - ${c.nombre}${c.dni ? ' ' + c.dni : ''}`).join('\n');
    }
    
    const emailBody = [
        "Buenos días",
        "",
        `Adjunto información de los guías y buceadores que vamos a hacer la salida al bajo de fuera el día ${dateText} ${timeText} Saldremos con la embarcación ${boatVal}`,
        "",
        patronText,
        "",
        guiasText,
        "",
        clientsText,
        "",
        "Muchas gracias!"
    ].join('\n');
    
    document.getElementById('email-text-area').value = emailBody;
};

function findStaffDni(name, type) {
    if (!name || !window.staffDatabase) return '';
    const list = window.staffDatabase[type] || [];
    const p = list.find(x => x.nombre === name);
    return p ? (p.dni || '') : '';
}


