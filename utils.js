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
        openCustomerProfile(state.args[0], state.args[1], true);
    } else if (state.type === 'today') {
        openTodayDiversModal(true);
    } else if (state.type === 'boat') {
        openManageBoatModal(state.args[0], state.args[1], state.args[2], state.args[3], true);
    } else if (state.type === 'crm') {
        if (typeof openCrmModal === 'function') openCrmModal(true);
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
window.copyData = function(text, type) {
    if(!text) return;
    navigator.clipboard.writeText(text).then(() => { showToast(`${type} copiado: ${text}`); });
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