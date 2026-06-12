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
        window.modalHistoryIndex--;
        executeNavState(window.modalHistory[window.modalHistoryIndex]);
        updateModalNavButtons();
    }
};

window.goModalForward = function() {
    if (window.modalHistoryIndex < window.modalHistory.length - 1) {
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
    } else if (state.type === 'group-checkout') {
        if (typeof openGroupCheckoutModal === 'function') openGroupCheckoutModal(true);
    } else if (state.type === 'factura') {
        if (typeof generateFactura === 'function') generateFactura(state.args[0], true);
    } else if (state.type === 'factura-joint') {
        if (typeof generateJointFactura === 'function') generateJointFactura(state.args[0], state.args[1], state.args[2], true);
    } else if (state.type === 'group') {
        if (typeof openGroupLinkModal === 'function') openGroupLinkModal(state.args[0], true);
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

window.hideAllNavModals = function(exceptId = null) {
    if (exceptId !== 'customer-profile-modal') document.getElementById('customer-profile-modal').classList.add('hidden');
    if (exceptId !== 'today-divers-modal') document.getElementById('today-divers-modal').classList.add('hidden');
    if (exceptId !== 'manage-boat-modal') document.getElementById('manage-boat-modal').classList.add('hidden');
    if (exceptId !== 'crm-modal') document.getElementById('crm-modal').classList.add('hidden');
    if (exceptId !== 'group-checkout-modal') document.getElementById('group-checkout-modal')?.classList.add('hidden');
    if (exceptId !== 'staff-views-modal') document.getElementById('staff-views-modal')?.classList.add('hidden');
    if (exceptId !== 'contabilidad-modal') document.getElementById('contabilidad-modal')?.classList.add('hidden');
    if (exceptId !== 'group-link-modal') document.getElementById('group-link-modal')?.classList.add('hidden');
    
    if (exceptId !== 'tab-content-factura') {
        const targetTab = document.getElementById('tab-content-factura');
        if (targetTab) {
            targetTab.classList.add('hidden');
            targetTab.classList.remove('flex');
        }
        document.body.classList.remove('print-factura');
    }
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
window.getFullName = function(c, includeApodo = true) {
    let n = (c.nombre || '').trim();
    let a = (c.apellido || '').trim();
    let rawName = n;
    if (!(a && n.toLowerCase().endsWith(a.toLowerCase()))) {
        rawName = [n, a].filter(Boolean).join(' ');
    }
    let formatted = window.formatNameStr(rawName);
    
    if (includeApodo && c.apodo && c.apodo.trim()) {
        formatted += ` (${c.apodo.trim()})`;
    }
    
    return formatted;
};

window.getFirstAndLastName = function(fullName) {
    if (!fullName) return '';
    // Strip apodo suffix if present, e.g. "Tom E Bonte (Tom)" -> "Tom E Bonte"
    return fullName.split(' (')[0].trim();
};

window.isProfileComplete = function(p) {
    if (!p) return false;
    const hasPhone = p.telefono && p.telefono.toString().trim() !== '' && p.telefono.toString().trim() !== '-' && p.telefono.toString().trim() !== '---';
    const hasEmail = p.email && p.email.toString().trim() !== '' && p.email.toString().trim() !== '-' && p.email.toString().trim() !== '---';
    return !!(hasPhone && hasEmail);
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
window.getPersonLocation = function(dni, fullName, excludeType = null, excludeGroupIdx = -1, excludeGuestIdx = -1, targetDate = null, targetTime = null, targetId = null) {
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

    const refItem = activeBoatItem || {};
    const dStr = targetDate || refItem.date;
    const tStr = targetTime || refItem.time;
    const idStr = targetId || refItem.id;
    if (!dStr || !tStr) return null;

    const rawOtherTrips = mergedAllocations.filter(t => t.date === dStr && t.time === tStr && t.id !== idStr);
    const deduplicatedOtherTrips = getMergedTrips(rawOtherTrips);

    for (const t of deduplicatedOtherTrips) {
        const boatName = getTripLocationName(t);
        if (t.captain && matches(null, t.captain)) return boatName;
        if (t.guide && matches(null, t.guide)) return boatName;
        if (t.groups) {
            for (const g of t.groups) {
                if (g.guide && matches(null, g.guide)) return boatName;
                if (g.apoyo && matches(null, g.apoyo)) return boatName;
            }
        }
        if (t.guests) {
            for (const guest of t.guests) {
                if (matches(guest.dni, guest.nombre)) return boatName;
            }
        }
    }

    if (refItem && refItem.id === idStr) {
        if (excludeType !== 'captain' && refItem.captain && matches(null, refItem.captain)) return "Este barco (Capitán)";
        
        if (refItem.groups) {
            for (let grpIdx = 0; grpIdx < refItem.groups.length; grpIdx++) {
                const group = refItem.groups[grpIdx];
                if (!(excludeType === 'guide' && excludeGroupIdx === grpIdx)) {
                    if (group.guide && matches(null, group.guide)) return "Este barco (Guía)";
                }
                if (!(excludeType === 'apoyo' && excludeGroupIdx === grpIdx)) {
                    if (group.apoyo && matches(null, group.apoyo)) return "Este barco (Apoyo)";
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
    if (isNavBackForward) window.hideAllNavModals('staff-views-modal');
    
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

    window.runStaffViewsFilter();
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
    const timelineContainer = document.getElementById('staff-views-timeline');
    
    // Calculate Filtering Boundaries
    const activeDateValue = document.getElementById('staff-views-date').value;
    const activeDate = activeDateValue ? new Date(activeDateValue) : new Date();

    if (!val) {
        if (window.staffViewMode === 'diario') {
            renderDailyGeneralStaffView(activeDateValue, timelineContainer);
        } else if (window.staffViewMode === 'semanal') {
            renderWeeklyGeneralStaffView(activeDate, timelineContainer);
        }
        return;
    }
    
    const isCap = val.startsWith('cap_');
    const isGui = val.startsWith('gui_');
    const name = val.substring(4);
    
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
    <div class="max-w-2xl mx-auto space-y-4 md:space-y-6 pb-6 md:pb-12 pt-2 md:pt-4">
        <div class="bg-white border text-center border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div class="bg-green-50 px-4 py-3 sm:px-6 sm:py-4 border-b border-green-100 flex items-center justify-between">
                <span class="text-xs sm:text-sm font-black text-green-800 uppercase tracking-widest flex items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg> Resumen para Compresor</span>
            </div>
            <textarea id="nitrox-whatsapp-text" class="w-full h-[220px] sm:h-[380px] p-4 sm:p-6 font-mono text-sm text-slate-800 focus:outline-none resize-none overflow-y-auto">${textOutput}</textarea>
            <div class="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
                <button onclick="copyData(document.getElementById('nitrox-whatsapp-text').value, '¡Datos copiados!', true)" class="w-full py-3 sm:py-4 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-black text-xs sm:text-sm uppercase tracking-widest rounded-xl transition-all shadow-md shadow-green-500/20 flex items-center justify-center gap-2 transform active:scale-[0.98]">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                    Copiar
                </button>
            </div>
        </div>
    </div>`;
};

window.getAbbreviatedCourseName = function(baseName) {
    if (!baseName) return "";
    let name = baseName.trim();
    
    // Check standard maps
    const lower = name.toLowerCase();
    if (lower.includes("dsd") && (lower.includes("doble") || lower.includes("double"))) {
        return "DSD (doble)";
    }
    if (name === "DSD (Bautismo) desde Playa" || name === "DSD (Bautismo) desde Barco") return "DSD";
    if (name === "Open Water Diver (OWC)") return "OWc";
    if (name === "Advanced Open Water (AOWC)") return "AOWc";
    if (name === "Rescate") return "Resc";
    if (name === "Snorkeling") return "Snorkel";
    
    // Custom mappings:
    if (lower.includes("deep")) return "Deep Spec.";
    if (lower.includes("nitrox")) return "Nitrox Spec.";
    if (lower.includes("dry suit") || lower.includes("traje seco")) return "Dry Suit Spec.";
    if (lower.includes("wreck") || lower.includes("pecios")) return "Wreck Spec.";
    if (lower.includes("navigation") || lower.includes("navegacion")) return "Nav Spec.";
    if (lower.includes("night") || lower.includes("nocturna")) return "Night Spec.";
    if (lower.includes("perfect buoyancy") || lower.includes("flotabilidad")) return "Buoyancy Spec.";
    if (lower.includes("react right") || lower.includes("primeros auxilios")) return "React Right";
    
    // Otherwise, truncate if it is too long
    return name.length > 18 ? name.substring(0, 16) + '...' : name;
};

window.getFirstName = function(name) {
    if (!name) return "";
    let trimmed = name.trim();
    // Keep placeholder/default texts intact
    const lower = trimmed.toLowerCase();
    if (lower === "sin asignar" || lower === "por asignar" || lower === "sin guía" || lower === "sin guia" || lower === "sin apoyo") {
        return trimmed;
    }
    // Handle names separated by comma, e.g. "PAOLO, TOM"
    if (trimmed.includes(',')) {
        return trimmed.split(',').map(n => window.getFirstName(n.trim())).join(', ');
    }
    return trimmed.split(' ')[0];
};

window.formatInsuranceDate = function(dateStr) {
    if (!dateStr) return '---';
    const trimmed = dateStr.trim();
    if (trimmed === '0' || trimmed === '---' || trimmed.toLowerCase() === 'no' || trimmed.toLowerCase() === 'none') {
        return '---';
    }
    
    // Normalize date first
    const normalized = window.normalizeDateStr(trimmed);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        return trimmed;
    }
    
    const parts = normalized.split('-');
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const dayStr = String(parseInt(parts[2], 10));
    
    // Months as requested: ene, feb, mar, apr, may, jun, jul, ago, sep, oct, nov, dic
    const months = ['Ene', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthStr = months[monthIndex] || '---';
    
    return `${dayStr}/${monthStr}/${year}`;
};

window.matchCourseNames = function(a, b) {
    if (!a || !b) return false;
    const cleanA = a.trim().toLowerCase();
    const cleanB = b.trim().toLowerCase();
    
    if (cleanA === cleanB) return true;
    
    const getNormalizedNames = (name) => {
        const lower = name.toLowerCase().trim();
        const names = [lower];
        
        if (lower === 'advanced open water (aowc)' || lower === 'aowc') {
            names.push('advanced open water (aowc)', 'aowc');
        } else if (lower === 'open water diver (owc)' || lower === 'owc') {
            names.push('open water diver (owc)', 'owc');
        } else if (lower === 'rescate' || lower === 'resc' || lower === 'rescue') {
            names.push('rescate', 'resc', 'rescue');
        } else if (lower === 'snorkeling' || lower === 'snorkel') {
            names.push('snorkeling', 'snorkel');
        } else if (lower.includes('dsd') || lower === 'dsd') {
            names.push('dsd', 'dsd (bautismo) desde playa', 'dsd (bautismo) desde barco');
        }
        return names;
    };
    const listA = getNormalizedNames(cleanA);
    const listB = getNormalizedNames(cleanB);
    
    return listA.some(x => listB.includes(x));
};

function renderDailyGeneralStaffView(dateStr, container) {
    if (!container) return;

    const captains = [...(staffDatabase.capitanes || [])].sort((a,b) => a.nombre.localeCompare(b.nombre));
    const guides   = [...(staffDatabase.guias || [])].sort((a,b) => a.nombre.localeCompare(b.nombre));

    // Get all trips on this day
    const dayTrips = mergedAllocations.filter(t => t.date === dateStr);

    // Helper to extract assignments for a person
    const getAssignments = (name) => {
        let list = [];
        dayTrips.forEach(t => {
            let isCap = t.captain === name;
            let isGui = false;
            let isApo = false;
            if (t.groups) {
                isGui = t.groups.some(g => g.guide === name);
                isApo = t.groups.some(g => g.apoyo === name);
            }
            if (isCap || isGui || isApo) {
                list.push({ trip: t, isCap, isGui, isApo });
            }
        });
        return list.sort((a,b) => a.trip.time.localeCompare(b.trip.time));
    };

    // Deduplicate staff by name
    const allStaffNames = [
        ...captains.map(c => c.nombre),
        ...guides.map(g => g.nombre)
    ];
    // Filter to only include staff members with assignments today
    const uniqueActiveStaffNames = [...new Set(allStaffNames)].filter(name => {
        const assigns = getAssignments(name);
        return assigns.length > 0;
    }).sort((a, b) => a.localeCompare(b));

    // Extract unique time slots for today
    const timeSlots = [...new Set(dayTrips.map(t => t.time))].filter(Boolean).sort();

    // Calculate quick stats
    let totalAssigned = 0;
    let activeCapsCount = 0;
    let activeGuiCount = 0;

    uniqueActiveStaffNames.forEach(name => {
        const assigns = getAssignments(name);
        totalAssigned += assigns.length;
        
        // Determine if active as Captain or Guide today
        const hasCapAssign = assigns.some(a => a.isCap);
        const hasGuiAssign = assigns.some(a => a.isGui || a.isApo);
        if (hasCapAssign) activeCapsCount++;
        if (hasGuiAssign) activeGuiCount++;
    });

    // Stats bar HTML
    const statsHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100/50">
            <div class="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actividad Total</span>
                <span class="text-xl font-black text-indigo-900 mt-1">${totalAssigned} Inmersiones</span>
            </div>
            <div class="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Capitanes Activos</span>
                <span class="text-xl font-black text-indigo-900 mt-1">${activeCapsCount} Capitanes</span>
            </div>
            <div class="bg-white rounded-xl p-3 shadow-sm border border-slate-100 flex flex-col justify-center">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Guías Activos</span>
                <span class="text-xl font-black text-indigo-900 mt-1">${activeGuiCount} Guías</span>
            </div>
        </div>
    `;

    let bodyHtml = '';
    if (uniqueActiveStaffNames.length === 0 || timeSlots.length === 0) {
        bodyHtml = `
            <div class="flex flex-col items-center justify-center py-16 text-slate-400 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <svg class="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                <p class="font-bold text-lg">No hay operaciones ni salidas programadas para hoy.</p>
            </div>
        `;
    } else {
        let ths = timeSlots.map(slot => `<th class="px-3 py-3.5 text-center text-xs font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">${slot}</th>`).join('');
        
        let rowsHtml = uniqueActiveStaffNames.map(name => {
            const onDayOff = window.isStaffOnDayOff(name, dateStr);
            const isCapDb = captains.some(c => c.nombre === name);
            const isGuiDb = guides.some(g => g.nombre === name);
            
            let roleLabel = '';
            let roleClass = '';
            if (isCapDb && isGuiDb) {
                roleLabel = 'Capitán / Guía';
                roleClass = 'bg-indigo-50 text-indigo-700 border-indigo-100';
            } else if (isCapDb) {
                roleLabel = 'Capitán';
                roleClass = 'bg-blue-50 text-blue-700 border-blue-100';
            } else {
                roleLabel = 'Guía';
                roleClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
            }

            let dayOffWarning = '';
            if (onDayOff) {
                dayOffWarning = `<span class="text-[8px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 mt-1 inline-block">⚠️ DÍA LIBRE</span>`;
            }

            let cellsHtml = timeSlots.map(slot => {
                const assigns = dayTrips.filter(t => {
                    if (t.time !== slot) return false;
                    let matches = t.captain === name;
                    if (!matches && t.groups) {
                        matches = t.groups.some(g => g.guide === name || g.apoyo === name);
                    }
                    return matches;
                });
                
                if (assigns.length === 0) {
                    return `<td class="px-2 py-3 border border-slate-100 text-center text-[10px] font-bold text-slate-300 uppercase bg-slate-50/30">Dispo</td>`;
                }
                
                let cards = assigns.map(t => {
                    const boat = t.assignedBoat === 'ares' ? 'Ares' : (t.assignedBoat === 'kaiser' ? 'Kaiser' : (t.assignedBoat === 'astec' ? 'Astec' : 'Shore / Aula'));
                    const site = t.site || 'Sin Destino';
                    
                    let roleBadge = '';
                    if (t.captain === name) {
                        roleBadge = `<span class="text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 flex items-center gap-1">Cap <button onclick="event.stopPropagation(); window.showStaffReassignPopover(this, '${t.id}', '${t.date}', 'captain', -1, '${name}')" class="hover:text-blue-900 font-bold shrink-0 opacity-60 hover:opacity-100 transition-opacity">✏️</button></span>`;
                    } else if (t.groups) {
                        const grpIdx = t.groups.findIndex(g => g.guide === name || g.apoyo === name);
                        if (grpIdx !== -1) {
                            const isGui = t.groups[grpIdx].guide === name;
                            const roleType = isGui ? 'guide' : 'apoyo';
                            const badgeClass = isGui ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-purple-50 text-purple-700 border-purple-100';
                            const roleLabel = isGui ? 'Guía' : 'Apoyo';
                            roleBadge = `<span class="text-[8px] font-black px-1.5 py-0.5 rounded ${badgeClass} flex items-center gap-1">${roleLabel} <button onclick="event.stopPropagation(); window.showStaffReassignPopover(this, '${t.id}', '${t.date}', '${roleType}', ${grpIdx}, '${name}')" class="hover:text-indigo-900 font-bold shrink-0 opacity-60 hover:opacity-100 transition-opacity">✏️</button></span>`;
                        }
                    }
                    
                    return `
                        <div onclick="openBoatFromStaffView('${t.assignedBoat}', '${t.time}', '${t.date}')" class="bg-white border border-slate-100 rounded-xl p-2 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer text-left flex flex-col gap-1 w-full max-w-[150px] mx-auto">
                            <div class="flex items-center justify-between gap-1">
                                <span class="text-[10px] font-black text-indigo-900 truncate uppercase tracking-wider">${site}</span>
                                ${roleBadge}
                            </div>
                            <span class="text-[8px] font-bold text-slate-400 capitalize">${boat}</span>
                        </div>
                    `;
                }).join('');
                
                return `<td class="px-2 py-2 border border-slate-100 text-center bg-indigo-50/10 align-middle"><div class="flex flex-col gap-1.5 items-center justify-center">${cards}</div></td>`;
            }).join('');

            return `
                <tr class="hover:bg-slate-50/50 transition-colors">
                    <td class="px-4 py-3 border border-slate-100 min-w-[160px] bg-white">
                        <div class="font-black text-slate-800 text-sm">${name}</div>
                        <div class="flex flex-wrap gap-1 mt-1">
                            <span class="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border ${roleClass}">${roleLabel}</span>
                            ${dayOffWarning}
                        </div>
                    </td>
                    ${cellsHtml}
                </tr>
            `;
        }).join('');

        bodyHtml = `
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full border-collapse">
                        <thead>
                            <tr class="bg-slate-50 border-b border-slate-200">
                                <th class="px-4 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider w-[18%] min-w-[160px]">Personal</th>
                                ${ths}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    let html = `
    <div class="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in">
        ${statsHtml}
        ${bodyHtml}
    </div>
    `;
    container.innerHTML = html;
}

function renderWeeklyGeneralStaffView(activeDate, container) {
    if (!container) return;

    // Get the Monday of the activeDate week
    const dayOfWeek = activeDate.getDay();
    const diffToMonday = activeDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(activeDate.setDate(diffToMonday));

    // Generate dates array for Mon-Sun
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        weekDates.push(d.toISOString().split('T')[0]);
    }

    const captains = [...(staffDatabase.capitanes || [])].sort((a,b) => a.nombre.localeCompare(b.nombre));
    const guides   = [...(staffDatabase.guias || [])].sort((a,b) => a.nombre.localeCompare(b.nombre));

    // Deduplicate weekly staff names
    const allStaffNames = [
        ...captains.map(c => c.nombre),
        ...guides.map(g => g.nombre)
    ];
    const uniqueStaffNames = [...new Set(allStaffNames)].sort((a, b) => a.localeCompare(b));

    // Helper to get number of assignments for a person on a specific date
    const getWorkload = (name, dateStr) => {
        let count = 0;
        mergedAllocations.forEach(t => {
            if (t.date === dateStr) {
                let matches = t.captain === name;
                if (!matches && t.groups) {
                    matches = t.groups.some(g => g.guide === name || g.apoyo === name);
                }
                if (matches) count++;
            }
        });
        return count;
    };

    const daysShort = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

    // Render table headers
    let ths = weekDates.map((dStr, i) => {
        const parts = dStr.split('-');
        return `<th class="px-3 py-3.5 text-center text-xs font-black text-slate-500 uppercase tracking-wider w-[12%]">${daysShort[i]}<br/><span class="text-[10px] text-slate-400 font-bold">${parts[2]}/${parts[1]}</span></th>`;
    }).join('');

    // Function to handle switching date and view mode when clicking a grid cell
    window.testFueraJumpToDay = function(dateStr) {
        document.getElementById('staff-views-date').value = dateStr;
        window.setStaffViewMode('diario');
    };

    let rowsHtml = uniqueStaffNames.map(name => {
        const isCapDb = captains.some(c => c.nombre === name);
        const isGuiDb = guides.some(g => g.nombre === name);
        
        let roleLabel = '';
        let roleClass = '';
        if (isCapDb && isGuiDb) {
            roleLabel = 'Capitán / Guía';
            roleClass = 'bg-indigo-50 text-indigo-700 border-indigo-100';
        } else if (isCapDb) {
            roleLabel = 'Capitán';
            roleClass = 'bg-blue-50 text-blue-700 border-blue-100';
        } else {
            roleLabel = 'Guía';
            roleClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';
        }

        let cellsHtml = weekDates.map(dStr => {
            const onDayOff = window.isStaffOnDayOff(name, dStr);
            const workload = getWorkload(name, dStr);

            let cellClass = '';
            let cellText = '';
            if (onDayOff) {
                cellText = 'LIBRE';
                cellClass = 'bg-red-50 text-red-600 border-red-200/50 hover:bg-red-100/60 font-black';
            } else if (workload === 0) {
                cellText = 'DISPO';
                cellClass = 'bg-slate-50 text-slate-400 border-slate-200/50 hover:bg-slate-100/60';
            } else if (workload >= 3) {
                cellText = `${workload} Dives`;
                cellClass = 'bg-amber-50 text-amber-700 border-amber-200/80 hover:bg-amber-100/60 font-black animate-pulse';
            } else {
                cellText = `${workload} ${workload === 1 ? 'Dive' : 'Dives'}`;
                cellClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100/60 font-bold';
            }

            return `<td onclick="window.testFueraJumpToDay('${dStr}')" class="px-2 py-3 border border-slate-100 text-center cursor-pointer transition-all duration-150 rounded-xl ${cellClass} text-[10px] uppercase tracking-wider">${cellText}</td>`;
        }).join('');

        return `
            <tr class="hover:bg-slate-50/50 transition-colors">
                <td class="px-4 py-3 border border-slate-100 min-w-[150px]">
                    <div class="font-black text-slate-800 text-sm">${name}</div>
                    <span class="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border mt-1 inline-block ${roleClass}">${roleLabel}</span>
                </td>
                ${cellsHtml}
            </tr>
        `;
    }).join('');

    let html = `
    <div class="max-w-7xl mx-auto pb-12 animate-fade-in space-y-4">
        <div class="bg-indigo-50/30 rounded-2xl p-4 border border-indigo-100/50 text-center max-w-lg mx-auto shadow-sm">
            <p class="text-xs text-indigo-700 font-bold leading-normal">💡 <strong>Consejo del Planificador:</strong> Haz clic en cualquier celda de la cuadrícula para saltar directamente a la <strong>Vista Diario General</strong> de ese día específico.</p>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="w-full table-fixed border-collapse">
                    <thead>
                        <tr class="bg-slate-50 border-b border-slate-200">
                            <th class="px-4 py-3.5 text-left text-xs font-black text-slate-500 uppercase tracking-wider w-[16%]">Personal</th>
                            ${ths}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${rowsHtml || '<tr><td colspan="8" class="text-center py-6 text-slate-400 italic">No hay datos de personal.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    `;

    container.innerHTML = html;
}

window.showStaffReassignPopover = function(triggerEl, tripId, dateStr, roleType, grpIdx, currentName) {
    const existing = document.getElementById('staff-reassign-popover');
    if (existing) existing.remove();

    const trip = (window.mergedAllocations || []).find(t => t.id === tripId);
    if (!trip) {
        window.showToast("No se pudo localizar el viaje en la memoria.", "error");
        return;
    }

    const candidates = [];
    const isCap = roleType === 'captain';
    const databaseList = isCap ? (staffDatabase.capitanes || []) : (staffDatabase.guias || []);

    databaseList.forEach(p => {
        const name = p.nombre;
        const onDayOff = window.isStaffOnDayOff(name, dateStr);
        
        const isBusyOnOtherTrips = mergedAllocations.some(t => {
            if (t.date === dateStr && t.time === trip.time && t.id !== tripId) {
                let matches = t.captain === name;
                if (!matches && t.groups) {
                    matches = t.groups.some(g => g.guide === name || g.apoyo === name);
                }
                return matches;
            }
            return false;
        });

        let status = 'dispo';
        let statusLabel = 'Disponible';
        let statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-100';

        if (onDayOff) {
            status = 'libre';
            statusLabel = 'Libre';
            statusClass = 'bg-red-50 text-red-600 border-red-100';
        } else if (isBusyOnOtherTrips) {
            status = 'busy';
            statusLabel = 'Ocupado';
            statusClass = 'bg-amber-50 text-amber-700 border-amber-100';
        }

        candidates.push({ name, status, statusLabel, statusClass });
    });

    const statusWeight = { dispo: 1, busy: 2, libre: 3 };
    candidates.sort((a, b) => {
        if (statusWeight[a.status] !== statusWeight[b.status]) {
            return statusWeight[a.status] - statusWeight[b.status];
        }
        return a.name.localeCompare(b.name);
    });

    const popover = document.createElement('div');
    popover.id = 'staff-reassign-popover';
    popover.className = 'fixed bg-white border border-slate-200 rounded-2xl shadow-xl p-4 flex flex-col gap-2 min-w-[220px] max-h-[300px] overflow-hidden';
    popover.style.zIndex = '1000';

    const roleTitle = isCap ? 'Capitán' : (roleType === 'guide' ? 'Guía' : 'Apoyo');
    let headerHtml = `
        <div class="flex items-center justify-between border-b border-slate-100 pb-1.5 shrink-0">
            <span class="text-xs font-black text-slate-800 uppercase tracking-wider">Reasignar ${roleTitle}</span>
            <button onclick="document.getElementById('staff-reassign-popover').remove()" class="text-slate-400 hover:text-slate-600">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
    `;

    let listHtml = candidates.map(c => {
        const isCurrent = c.name === currentName;
        const currentClass = isCurrent ? 'font-black text-indigo-700 bg-indigo-50/50' : 'text-slate-700 hover:bg-slate-50';
        return `
            <div onclick="window.confirmReassignStaff('${tripId}', '${dateStr}', '${roleType}', ${grpIdx}, '${c.name}')" class="flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${currentClass}">
                <span class="truncate pr-2">${c.name}</span>
                <span class="text-[8px] font-black px-1.5 py-0.5 rounded border shrink-0 uppercase tracking-widest ${c.statusClass}">${c.statusLabel}</span>
            </div>
        `;
    }).join('');

    let clearHtml = `
        <div onclick="window.confirmReassignStaff('${tripId}', '${dateStr}', '${roleType}', ${grpIdx}, '')" class="flex items-center justify-center p-1.5 rounded-lg text-xs font-black text-red-600 hover:bg-red-50 cursor-pointer border border-dashed border-red-200 mt-1 shrink-0 uppercase tracking-wider">
            ❌ Quitar Asignación
        </div>
    `;

    popover.innerHTML = `
        ${headerHtml}
        <div class="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50 pr-1">
            ${listHtml || '<p class="text-xs text-slate-400 italic text-center py-4">No hay personal disponible.</p>'}
        </div>
        ${clearHtml}
    `;

    document.body.appendChild(popover);

    const rect = triggerEl.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;
    
    if (top + 300 > window.innerHeight) {
        top = rect.top - 6 - Math.min(300, popover.offsetHeight || 250);
    }
    if (left + 220 > window.innerWidth) {
        left = window.innerWidth - 240;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    const handleOutsideClick = (e) => {
        const pop = document.getElementById('staff-reassign-popover');
        if (pop && !pop.contains(e.target) && !triggerEl.contains(e.target)) {
            pop.remove();
            document.removeEventListener('mousedown', handleOutsideClick);
        }
    };
    document.addEventListener('mousedown', handleOutsideClick);
};

window.confirmReassignStaff = async function(tripId, dateStr, roleType, grpIdx, newName) {
    const pop = document.getElementById('staff-reassign-popover');
    if (pop) pop.remove();

    const originalTrip = (window.mergedAllocations || []).find(t => t.id === tripId);
    if (!originalTrip) {
        window.showToast("No se pudo localizar el viaje en la memoria.", "error");
        return;
    }

    const tripCopy = JSON.parse(JSON.stringify(originalTrip));
    if (roleType === 'captain') {
        tripCopy.captain = newName;
    } else if (roleType === 'guide') {
        if (tripCopy.groups && tripCopy.groups[grpIdx]) {
            tripCopy.groups[grpIdx].guide = newName;
        }
    } else if (roleType === 'apoyo') {
        if (tripCopy.groups && tripCopy.groups[grpIdx]) {
            tripCopy.groups[grpIdx].apoyo = newName;
        }
    }

    const payload = {
        date: tripCopy.date,
        time: tripCopy.time,
        assignedBoat: tripCopy.assignedBoat,
        site: tripCopy.site,
        captain: tripCopy.captain,
        groups: tripCopy.groups,
        guests: tripCopy.guests || [],
        waitlist: tripCopy.waitlist || [],
        timeSaliendo: tripCopy.timeSaliendo || '',
        timeBuzosAgua: tripCopy.timeBuzosAgua || '',
        timeVolviendo: tripCopy.timeVolviendo || '',
        rmLocked: tripCopy.rmLocked || false
    };
    if (tripCopy.maxDives) payload.maxDives = tripCopy.maxDives;

    try {
        if (typeof saveInternalBoatData === 'function') {
            await saveInternalBoatData(tripId, dateStr, payload);
            window.showToast("Asignación actualizada correctamente");
        } else {
            console.error("saveInternalBoatData not found!");
            window.showToast("Error al guardar: Función saveInternalBoatData no disponible", "error");
        }
    } catch (err) {
        console.error("Error updating assignment:", err);
        window.showToast("Error al guardar la asignación", "error");
    }
};