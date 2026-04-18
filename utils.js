// ==========================================
// GLOBAL NAVIGATION ROUTER
// ==========================================
window.modalHistory = [];
window.modalHistoryIndex = -1;

window.recordModalHistory = function(actionObj) {
    if (actionObj.isNavBackForward) return; // Prevent infinite history loops
    
    // Auto-hide previous modal
    window.hideAllNavModals();

    // Prevent duplicate adjacent additions
    if (window.modalHistoryIndex >= 0) {
        const curr = window.modalHistory[window.modalHistoryIndex];
        if (JSON.stringify(curr) === JSON.stringify(actionObj)) {
            updateModalNavButtons();
            return;
        }
    }

    // Truncate future history if we navigated back and then clicked something new
    window.modalHistory = window.modalHistory.slice(0, window.modalHistoryIndex + 1);
    window.modalHistory.push(actionObj);
    window.modalHistoryIndex++;
    updateModalNavButtons();
};

window.goModalBack = function() {
    if (window.modalHistoryIndex > 0) {
        window.hideAllNavModals();
        window.modalHistoryIndex--;
        executeNavState(window.modalHistory[window.modalHistoryIndex]);
        updateModalNavButtons();
    }
};

window.goModalForward = function() {
    if (window.modalHistoryIndex < window.modalHistory.length - 1) {
        window.hideAllNavModals();
        window.modalHistoryIndex++;
        executeNavState(window.modalHistory[window.modalHistoryIndex]);
        updateModalNavButtons();
    }
};

function executeNavState(state) {
    if (state.type === 'customer') {
        openCustomerProfile(state.args[0], state.args[1], true, state.targetTab || 'caja');
    } else if (state.type === 'today') {
        openTodayDiversModal(true);
    } else if (state.type === 'boat') {
        openManageBoatModal(state.args[0], state.args[1], state.args[2], state.args[3], true);
    } else if (state.type === 'crm') {
        if (typeof openCrmModal === 'function') openCrmModal(true);
    } else if (state.type === 'staff') {
        if (typeof openStaffViewsModal === 'function') openStaffViewsModal(true);
    } else if (state.type === 'contabilidad') {
        if (typeof openContabilidadView === 'function') openContabilidadView(true);
    }
}

window.updateModalNavButtons = function() {
    const canGoBack = window.modalHistoryIndex > 0;
    const canGoFwd = window.modalHistoryIndex < window.modalHistory.length - 1;
    
    document.querySelectorAll('.nav-back-btn').forEach(btn => {
        btn.disabled = !canGoBack;
    });
    document.querySelectorAll('.nav-fwd-btn').forEach(btn => {
        btn.disabled = !canGoFwd;
    });
};

window.hideAllNavModals = function() {
    document.getElementById('customer-profile-modal').classList.add('hidden');
    document.getElementById('today-divers-modal').classList.add('hidden');
    document.getElementById('manage-boat-modal').classList.add('hidden');
    document.getElementById('crm-modal').classList.add('hidden');
    document.getElementById('staff-views-modal')?.classList.add('hidden');
    document.getElementById('contabilidad-modal')?.classList.add('hidden');
};

window.clearModalHistory = function() {
    window.modalHistory = [];
    window.modalHistoryIndex = -1;
    updateModalNavButtons();
};

window.closeGlobalModal = function(modalIdOrEl) {
    if (typeof modalIdOrEl === 'string') {
        document.getElementById(modalIdOrEl).classList.add('hidden');
    } else {
        modalIdOrEl.classList.add('hidden');
    }
    clearModalHistory();
};

window.switchHelpTab = function(tabId) {
    // Toggling the buttons
    ['crm', 'barcos', 'tools'].forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        if(t === tabId) {
            btn.className = "px-4 py-3 text-sm font-black border-b-2 border-blue-600 text-blue-600 transition-colors";
        } else {
            btn.className = "px-4 py-3 text-sm font-black border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors";
        }
    });
    
    // Hiding all contents
    document.querySelectorAll('.help-tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block');
    });
    
    // Showing active ones matching the current language
    const currentLang = document.getElementById('help-content-es').classList.contains('hidden') ? 'en' : 'es';
    
    // BUT we need to actually enforce the active language toggle inside the modal
    // Because toggleHelpLanguage only switches the parent container:
    // So we just activate the requested tab block. The parent will inherently hide the wrong language container.
    document.getElementById(`help-tab-${tabId}-es`).classList.remove('hidden');
    document.getElementById(`help-tab-${tabId}-es`).classList.add('block');
    document.getElementById(`help-tab-${tabId}-en`).classList.remove('hidden');
    document.getElementById(`help-tab-${tabId}-en`).classList.add('block');
};

// ==========================================
// STANDARD UTILITY & HELPER FUNCTIONS
// ==========================================
// Helper to fix ALL CAPS or lowercase names from Jotform
window.formatNameStr = function(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word => {
        return word.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-');
    }).join(' ');
};

// Safely combine names without causing the "Double Apellido" duplication
window.getFullName = function(c) {
    let n = (c.nombre || '').trim();
    let a = (c.apellido || '').trim();
    let rawName = n;
    if (!(a && n.toLowerCase().endsWith(a.toLowerCase()))) {
        rawName = [n, a].filter(Boolean).join(' ');
    }
    return window.formatNameStr(rawName);
};

window.getTripLocationName = function(t) {
    if (t.assignedBoat === 'ares') return 'Ares';
    if (t.assignedBoat === 'kaiser') return 'Kaiser';
    if (t.assignedBoat === 'shore') return 'Shore / Aula';
    return t.site ? `${t.site} (Visor)` : 'Visor';
};

// Merges Visor and Internal trips to eliminate duplicate phantom rows
window.getMergedTrips = function(tripsArray) {
    let deduplicated = new Map();
    tripsArray.forEach(t => {
        if (t.isVisorTrip) deduplicated.set(t.id, { ...t, isVisor: true, originalVisorSite: t.site });
    });
    tripsArray.forEach(t => {
        if (t.isInternalTrip) {
            if (deduplicated.has(t.id)) deduplicated.set(t.id, { ...deduplicated.get(t.id), ...t, isVisor: true });
            else deduplicated.set(t.id, { ...t, isVisor: false });
        }
    });
    return Array.from(deduplicated.values());
};

// Checks if a person (by DNI or Name) is busy in ANY boat or ANY role at this time
window.getPersonLocation = function(dni, fullName, excludeType = null, excludeGroupIdx = -1, excludeGuestIdx = -1) {
    let dniLower = (dni || '').trim().toLowerCase();
    let nameLower = (fullName || '').trim().toLowerCase();
    if (!dniLower && !nameLower) return null;

    const matches = (targetDni, targetName) => {
        let td = (targetDni || '').trim().toLowerCase();
        let tn = (targetName || '').trim().toLowerCase();
        if (dniLower && td && dniLower === td) return true;
        if (nameLower && tn && nameLower === tn) return true;
        return false;
    };

    const rawOtherTrips = mergedAllocations.filter(t => t.date === activeBoatItem.date && t.time === activeBoatItem.time && t.id !== activeBoatItem.id);
    const deduplicatedOtherTrips = getMergedTrips(rawOtherTrips);

    for (const t of deduplicatedOtherTrips) {
        const boatName = getTripLocationName(t);
        if (t.captain && matches(null, t.captain)) return boatName;
        if (t.guide && matches(null, t.guide)) return boatName;
        if (t.groups) {
            for (const g of t.groups) {
                if (g.guide && matches(null, g.guide)) return boatName;
            }
        }
        if (t.guests) {
            for (const guest of t.guests) {
                if (matches(guest.dni, guest.nombre)) return boatName;
            }
        }
    }

    if (excludeType !== 'captain' && activeBoatItem.captain && matches(null, activeBoatItem.captain)) return "Este barco (Capitán)";
    
    if (activeBoatItem.groups) {
        for (let grpIdx = 0; grpIdx < activeBoatItem.groups.length; grpIdx++) {
            const group = activeBoatItem.groups[grpIdx];
            if (!(excludeType === 'guide' && excludeGroupIdx === grpIdx)) {
                if (group.guide && matches(null, group.guide)) return "Este barco (Guía)";
            }
            if (group.guests) {
                for (let gstIdx = 0; gstIdx < group.guests.length; gstIdx++) {
                    if (excludeType === 'guest' && excludeGroupIdx === grpIdx && excludeGuestIdx === gstIdx) continue;
                    const guest = group.guests[gstIdx];
                    if (matches(guest.dni, guest.nombre)) return "Este barco (Cliente)";
                }
            }
        }
    }
    return null;
};

// Clipboard & Toast
window.copyData = function(text, type, hidePayload = false) {
    if(!text) return;
    navigator.clipboard.writeText(text).then(() => { 
        showToast(hidePayload ? type : `${type} copiado: ${text}`); 
    });
};

window.showToast = function(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg; toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => { toast.classList.add('translate-y-24', 'opacity-0'); }, 2000);
};

// Custom Confirm Alert (Overriding the default prompt)
window.showAppAlert = function(msg) {
    document.getElementById('custom-confirm-msg').innerText = msg;
    pendingConfirmAction = null;
    const modal = document.getElementById('custom-confirm-modal');
    const btns = modal.querySelectorAll('button');
    
    btns[0].classList.add('hidden'); 
    btns[1].innerText = "Entendido";
    btns[1].classList.replace('bg-red-500', 'bg-blue-600');
    btns[1].classList.replace('hover:bg-red-600', 'hover:bg-blue-700');
    
    const originalClose = window.closeAppConfirm;
    window.closeAppConfirm = function() {
        originalClose();
        setTimeout(() => {
            btns[0].classList.remove('hidden');
            btns[1].innerText = "Sí, Confirmar";
            btns[1].classList.replace('bg-blue-600', 'bg-red-500');
            btns[1].classList.replace('hover:bg-blue-700', 'hover:bg-red-600');
            window.closeAppConfirm = originalClose; 
        }, 300);
    };
    
    modal.classList.remove('hidden');
};

// --- STAFF VIEWS LOGIC ---
window.staffViewMode = 'diario';

window.openStaffViewsModal = function(isNavBackForward = false) {
    if (typeof window.recordModalHistory === 'function' && !isNavBackForward) {
        window.recordModalHistory({ type: 'staff', isNavBackForward });
    }
    
    document.getElementById('staff-views-modal').classList.remove('hidden');
    
    if (isNavBackForward) return; // Preserve active staff/dates when reverting from Boat Manifest!
    
    // Set active date to dashboard's current date
    const offset = typeof currentDate !== 'undefined' ? currentDate.getTimezoneOffset() : new Date().getTimezoneOffset();
    const baseDate = typeof currentDate !== 'undefined' ? currentDate : new Date();
    document.getElementById('staff-views-date').value = new Date(baseDate.getTime() - (offset*60*1000)).toISOString().split('T')[0];
    
    document.getElementById('staff-views-dropdown').value = '';
    
    const capGroup = document.getElementById('optgroup-capitanes');
    const guiGroup = document.getElementById('optgroup-guias');
    if(capGroup) capGroup.innerHTML = '';
    if(guiGroup) guiGroup.innerHTML = '';

    if (staffDatabase.capitanes && capGroup) {
        let caps = [...staffDatabase.capitanes].sort((a,b) => a.nombre.localeCompare(b.nombre));
        caps.forEach(c => capGroup.innerHTML += `<option value="cap_${c.nombre}">${c.nombre}</option>`);
    }
    if (staffDatabase.guias && guiGroup) {
        let guias = [...staffDatabase.guias].sort((a,b) => a.nombre.localeCompare(b.nombre));
        guias.forEach(g => guiGroup.innerHTML += `<option value="gui_${g.nombre}">${g.nombre}</option>`);
    }

    document.getElementById('staff-views-timeline').innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-slate-400 mt-12 mb-12">
            <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
            <p class="font-bold text-lg">Selecciona a un Capitán o Guía</p>
            <p class="text-sm border-t border-slate-200 pt-2 mt-2 leading-relaxed">Usa el menú superior para ver su calendario de salidas</p>
        </div>
    `;
};

window.closeStaffViewsModal = function() {
    document.getElementById('staff-views-modal').classList.add('hidden');
};

window.setStaffViewMode = function(mode) {
    window.staffViewMode = mode;
    ['diario', 'semanal'].forEach(m => {
        const btn = document.getElementById(`btn-staff-${m}`);
        if(m === mode) {
            btn.className = "px-4 py-1.5 rounded-lg text-xs font-black shadow bg-white text-indigo-700 transition-colors";
        } else {
            btn.className = "px-4 py-1.5 rounded-lg text-xs font-black text-slate-500 hover:text-slate-800 transition-colors";
        }
    });

    const dateNav = document.getElementById('staff-views-date-nav');
    if(mode === 'diario' || mode === 'semanal') {
        dateNav.classList.remove('hidden');
    } else {
        dateNav.classList.add('hidden');
    }
    
    window.runStaffViewsFilter();
};

window.incrementStaffViewDate = function(days) {
    const input = document.getElementById('staff-views-date');
    if (!input.value) return;
    const current = new Date(input.value);
    
    if (window.staffViewMode === 'semanal') {
        current.setDate(current.getDate() + (days * 7));
    } else {
        current.setDate(current.getDate() + days);
    }
    
    input.value = current.toISOString().split('T')[0];
    window.runStaffViewsFilter();
};

window.runStaffViewsFilter = function() {
    const val = document.getElementById('staff-views-dropdown').value;
    if (!val) {
        window.openStaffViewsModal(); // resets to empty visualization gracefully
        return;
    }
    const isCap = val.startsWith('cap_');
    const isGui = val.startsWith('gui_');
    const name = val.substring(4);
    
    const timelineContainer = document.getElementById('staff-views-timeline');
    
    // Calculate Filtering Boundaries
    const activeDateValue = document.getElementById('staff-views-date').value;
    const activeDate = activeDateValue ? new Date(activeDateValue) : new Date();
    
    let filterStart = null;
    let filterEnd = null;
    
    if (window.staffViewMode === 'diario') {
        filterStart = new Date(activeDateValue);
        filterEnd = new Date(activeDateValue);
    } else if (window.staffViewMode === 'semanal') {
        const dayOfWeek = activeDate.getDay(); // 0 = Sunday, 1 = Monday
        const diffToMonday = activeDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is sunday
        
        filterStart = new Date(activeDate.setDate(diffToMonday));
        filterEnd = new Date(filterStart);
        filterEnd.setDate(filterEnd.getDate() + 6);
    } // If 'mensual', we apply no boundaries to show all, or limit to 1 year? Let's leave unbound for 'mensual' as original

    let matchTrips = [];
    mergedAllocations.forEach(trip => {
        let isCapMatch = trip.captain === name;
        let isGuiMatch = false;
        if (trip.groups) {
            isGuiMatch = trip.groups.some(g => g.guide === name);
        }
        
        if ((isCapMatch || isGuiMatch) && trip.date && trip.time) {
            // Apply bounding box dates if needed
            if (filterStart && filterEnd) {
                const tripDate = new Date(trip.date);
                // Strip time info to avoid edge cases
                tripDate.setHours(0,0,0,0);
                filterStart.setHours(0,0,0,0);
                filterEnd.setHours(0,0,0,0);
                
                if (tripDate < filterStart || tripDate > filterEnd) return;
            }
            matchTrips.push({ ...trip, actingAsCap: isCapMatch, actingAsGui: isGuiMatch });
        }
    });

    matchTrips.sort((a,b) => {
        let dateA = new Date(`${a.date}T${a.time}`);
        let dateB = new Date(`${b.date}T${b.time}`);
        return window.staffViewMode === 'diario' || window.staffViewMode === 'semanal' ? dateA - dateB : dateB - dateA; // Ascending for daily/weekly, Descending for monthly
    });

    if (matchTrips.length === 0) {
        timelineContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-slate-400 mt-12 mb-12">
            <svg class="w-12 h-12 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <p class="font-bold">No hay asignaciones cargadas para ${name}</p>
        </div>`;
        return;
    }

    // Group chronologically by Month/Year -> Day
    let groups = {};
    matchTrips.forEach(t => {
        let [y,m,d] = t.date.split('-');
        let dateObj = new Date(y, m-1, d);
        let monthStr = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        monthStr = monthStr.toUpperCase();
        
        if (window.staffViewMode === 'semanal') {
            const startStr = filterStart.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
            const endStr = filterEnd.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
            
            const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
            
            monthStr = `SEMANA ${weekNo}: ${startStr} - ${endStr}`.toUpperCase();
        }
        
        if (!groups[monthStr]) groups[monthStr] = {};
        
        let niceDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
        niceDate = niceDate.charAt(0).toUpperCase() + niceDate.slice(1);
        
        if(!groups[monthStr][niceDate]) groups[monthStr][niceDate] = [];
        groups[monthStr][niceDate].push(t);
    });

    let h = '<div class="space-y-6 max-w-5xl mx-auto pb-8">';
    
    Object.keys(groups).forEach(month => {
        h += `<div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="bg-slate-800 text-amber-500 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                    <h3 class="font-black tracking-widest uppercase text-xs">${month}</h3>
                    <span class="text-[10px] font-bold text-slate-400">${Object.keys(groups[month]).length} Días</span>
                </div>
                <div class="divide-y divide-slate-100">`;
                
        Object.keys(groups[month]).forEach(niceDate => {
            h += `<div class="flex flex-col md:flex-row md:items-stretch group hover:bg-slate-50/50 transition-colors">
                    <div class="w-full md:w-32 shrink-0 p-3 bg-slate-50/80 md:border-r border-b md:border-b-0 border-slate-100 flex flex-col justify-center text-center md:text-left">
                        <span class="text-sm font-black text-slate-800 tracking-tight uppercase">${niceDate.split(',')[1] || niceDate}</span>
                        <span class="text-[10px] font-bold text-slate-400 capitalize">${niceDate.split(',')[0] || ''}</span>
                    </div>
                    <div class="flex-1 p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">`;
            
            groups[month][niceDate].sort((a,b) => a.time.localeCompare(b.time));
            
            groups[month][niceDate].forEach(t => {
                let roleBadge = '';
                if (t.actingAsCap) roleBadge += `<span class="text-blue-600 font-black text-[9px] uppercase bg-blue-50 px-1.5 py-0.5 rounded shadow-sm shrink-0 border border-blue-100">Cap</span>`;
                if (t.actingAsGui) roleBadge += `<span class="text-emerald-600 font-black text-[9px] uppercase bg-emerald-50 px-1.5 py-0.5 rounded shadow-sm shrink-0 border border-emerald-100">Guía</span>`;

                h += `
                <div onclick="openBoatFromStaffView('${t.assignedBoat}', '${t.time}', '${t.date}')" class="bg-white border text-left border-slate-200 hover:border-indigo-300 hover:ring-1 hover:ring-indigo-100 p-2 rounded-lg shadow-sm transition-all cursor-pointer flex items-center justify-between gap-2 overflow-hidden">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-[10px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">${t.time}</span>
                        <div class="truncate">
                            <h4 class="text-[11px] font-black text-indigo-900 truncate uppercase tracking-wider">${t.site || 'Sin Destino'}</h4>
                            <p class="text-[9px] font-bold text-slate-400 truncate flex items-center gap-1 mt-0.5"><svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg> ${t.assignedBoat}</p>
                        </div>
                    </div>
                    <div class="shrink-0 flex items-center gap-1">
                        ${roleBadge}
                    </div>
                </div>`;
            });
            
            h += `      </div>
                  </div>`;
        });
        
        h += `</div></div>`;
    });
    
    h += '</div>';
    timelineContainer.innerHTML = h;
};

window.openBoatFromStaffView = function(boatName, timeStr, dateStr) {
    if (window.activeBoatUnsubscribe) window.activeBoatUnsubscribe();
    
    const tripObj = mergedAllocations.find(t => t.date === dateStr && t.time === timeStr && t.assignedBoat === boatName && t.isInternalTrip);
    
    if (tripObj && typeof window.openManageBoatModal === 'function') {
        window.openManageBoatModal(tripObj, boatName, timeStr, dateStr);
    } else {
        window.showToast("No se pudo localizar el viaje en la memoria.");
    }
};

// --- NITROX FORECAST LOGIC ---
window.openNitroxForecastModal = function() {
    document.getElementById('nitrox-forecast-modal').classList.remove('hidden');
    
    // Use generic global namespace binding for currentDate
    const offset = typeof currentDate !== 'undefined' ? currentDate.getTimezoneOffset() : new Date().getTimezoneOffset();
    const baseDate = typeof currentDate !== 'undefined' ? currentDate : new Date();
    const localDate = new Date(baseDate.getTime() - (offset*60*1000)).toISOString().split('T')[0];
    
    document.getElementById('nitrox-forecast-date').value = localDate;
    window.renderNitroxForecast();
};

window.closeNitroxForecastModal = function() {
    document.getElementById('nitrox-forecast-modal').classList.add('hidden');
};

window.incrementNitroxDate = function(days) {
    const dateInput = document.getElementById('nitrox-forecast-date');
    if (!dateInput.value) return;
    const current = new Date(dateInput.value);
    current.setDate(current.getDate() + days);
    dateInput.value = current.toISOString().split('T')[0];
    window.renderNitroxForecast();
};

window.renderNitroxForecast = function() {
    const dateStr = document.getElementById('nitrox-forecast-date').value;
    const container = document.getElementById('nitrox-forecast-content');
    
    if (!dateStr) {
        container.innerHTML = `<p class="text-center text-slate-400 font-bold mt-12">Selecciona una fecha válida.</p>`;
        return;
    }

    // 1. Find all trips on this date
    let dayTrips = mergedAllocations.filter(t => t.date === dateStr);
    
    if (dayTrips.length === 0) {
        container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-slate-400 mt-12">
            <svg class="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
            <p class="font-bold text-lg">No hay operaciones hoy.</p>
        </div>`;
        return;
    }

    // 2. Aggregate Nitrox Tanks chronologically across ALL boats
    let timeGroups = {}; // e.g. { "08:00": { "15L 32%": 2, "12L 28%": 1 } }
    
    dayTrips.forEach(trip => {
        if (trip.groups) {
            trip.groups.forEach(group => {
                if (group.guests) {
                    group.guests.forEach(guest => {
                        const gas = guest.gas || '15L Aire';
                        if (gas.includes('EAN')) {
                            let shortGas = gas.replace('EAN', '') + '%';
                            const timeObj = trip.time || '09:00';
                            
                            if(!timeGroups[timeObj]) timeGroups[timeObj] = {};
                            if(!timeGroups[timeObj][shortGas]) timeGroups[timeObj][shortGas] = 0;
                            
                            timeGroups[timeObj][shortGas]++;
                        }
                    });
                }
            });
        }
    });

    if (Object.keys(timeGroups).length === 0) {
        container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-emerald-400 mt-12 mb-12 bg-emerald-50 rounded-3xl p-8 border border-emerald-100 max-w-lg mx-auto">
            <svg class="w-20 h-20 mb-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            <p class="font-black text-2xl text-emerald-700 mb-2">¡Todo es Aire!</p>
            <p class="text-sm font-bold text-emerald-600/70 text-center">No hay ninguna botella de Nitrox programada para este día.</p>
        </div>`;
        return;
    }

    // 3. Generate WhatsApp text
    let activeDate = new Date(dateStr);
    let titleDate = activeDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    titleDate = titleDate.charAt(0).toUpperCase() + titleDate.slice(1);
    
    let textOutput = `Previsión Nitrox - ${titleDate}\n\n`;
    Object.keys(timeGroups).sort((a,b) => a.localeCompare(b)).forEach((time, index) => {
        if (index > 0) textOutput += `\n`; // Add single newline before subsequent time blocks, removing double empty lines.
        textOutput += `${time}\n`;
        Object.keys(timeGroups[time]).sort().forEach(gas => {
            textOutput += `- ${timeGroups[time][gas]}x ${gas}\n`;
        });
    });
    
    textOutput = textOutput.trim();

    // 4. Render directly to Text Area with Copy Button
    container.innerHTML = `
    <div class="max-w-2xl mx-auto space-y-6 pb-12 pt-4">
        <div class="bg-white border text-center border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div class="bg-green-50 px-6 py-4 border-b border-green-100 flex items-center justify-between">
                <span class="text-sm font-black text-green-800 uppercase tracking-widest flex items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg> Resumen para Compresor</span>
            </div>
            <textarea id="nitrox-whatsapp-text" class="w-full h-[400px] p-6 font-mono text-sm text-slate-800 focus:outline-none resize-none hide-scrollbar">${textOutput}</textarea>
            <div class="p-6 bg-slate-50 border-t border-slate-100">
                <button onclick="copyData(document.getElementById('nitrox-whatsapp-text').value, '¡Datos copiados!', true)" class="w-full py-4 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-md shadow-green-500/20 flex items-center justify-center gap-2 transform active:scale-[0.98]">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                    Copiar
                </button>
            </div>
        </div>
    </div>`;
};