let selectedGuestsForGroup = []; // Array to track selected divers for linking
let autoSaveTimeout = null;

// The Auto-Save Engine: Waits 0.5s after your last click before saving
window.triggerAutoSave = function() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        if (activeBoatItem && typeof saveBoatData === 'function') {
            saveBoatData(); // Guardado silencioso en segundo plano
        }
    }, 500); 
};


// ==========================================
// 5. MODAL & DYNAMIC TABLES 
// ==========================================
function openManageBoatModal(trip, boatId, time, dateStr, isNavBackForward = false) {
    if (!window.isLoggedIn && !trip) return;
    
    if (typeof isNavBackForward !== 'boolean') isNavBackForward = false;
    recordModalHistory({ type: 'boat', args: [trip, boatId, time, dateStr], isNavBackForward });
    selectedGuestsForGroup = []; // Reset selection when opening a new modal
    
    activeBoatItem = trip ? { ...trip } : {
        id: `internal_${Date.now()}`, date: dateStr, time: time, assignedBoat: boatId, 
        site: boatId === 'shore' ? 'Shore' : SITES_INTERNAL[0], captain: '', isVisor: false, groups: [] 
    };

    if (!activeBoatItem.groups || activeBoatItem.groups.length === 0) {
        activeBoatItem.groups = [{ guide: '', guests: [] }];
    }

    const boatConfig = BOATS[boatId];
    document.getElementById('modal-boat-title').innerText = `${boatConfig.name} - ${activeBoatItem.site || 'Nueva Salida'}`;
    
    document.getElementById('input-boat').value = activeBoatItem.assignedBoat || 'ares';
    document.getElementById('input-time').value = activeBoatItem.time || '09:00';
    document.getElementById('input-time').disabled = activeBoatItem.isVisor; // Bloquear hora si viene del Visor
    
    const delBtn = document.getElementById('btn-delete-boat');
    if (activeBoatItem.isVisor && !activeBoatItem.isVisorEdited) delBtn.classList.add('hidden');
    else delBtn.classList.remove('hidden');

    if (boatId === 'shore') {
        document.getElementById('destino-container').classList.add('hidden');
        document.getElementById('captain-container').classList.add('hidden');
        document.getElementById('activity-container').classList.remove('hidden');
        document.getElementById('input-activity').value = activeBoatItem.site;
    } else {
        document.getElementById('destino-container').classList.remove('hidden');
        document.getElementById('captain-container').classList.remove('hidden');
        document.getElementById('activity-container').classList.add('hidden');
        
        const siteSelect = document.getElementById('input-site');
        siteSelect.innerHTML = ALL_SITES.map(s => `<option value="${s}">${s}</option>`).join('');
        siteSelect.value = activeBoatItem.site || SITES_INTERNAL[0]; 
        siteSelect.disabled = false; siteSelect.classList.remove('bg-slate-200', 'cursor-not-allowed', 'opacity-70');
        renderCaptainDropdown();
    }
    
    updateModalSubtitle(); renderGroups(); 
    document.getElementById('manage-boat-modal').classList.remove('hidden');
}

function renderCaptainDropdown() {
    const capContainer = document.getElementById('captain-container');
    if (!capContainer) return; 
    
    const options = (staffDatabase.capitanes || []).map(c => {
        const isSelected = activeBoatItem.captain === c.nombre;
        let conflictText = ""; let disabledClass = ""; let disabledAttr = "";
        
        // Use universal tracker for Captains
        let loc = getPersonLocation(c.dni, c.nombre, 'captain');
        
        if (!isSelected && loc) {
            conflictText = ` (En ${loc})`; disabledAttr = "disabled"; disabledClass = "text-slate-400 bg-slate-100 font-bold";
        }
        return `<option value="${c.nombre}" class="${disabledClass}" ${disabledAttr}>${c.nombre}${conflictText}</option>`;
    }).join('');
    
    capContainer.innerHTML = `
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Capitán del Barco</label>
        <div class="flex gap-2">
            <select id="input-captain" class="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-700 cursor-pointer" onchange="activeBoatItem.captain = this.value; renderCaptainDropdown();">
                <option value="">${window.isLoggedIn ? 'Seleccionar Capitán...' : 'Sin Asignar'}</option>
                ${options}
            </select>
            <button onclick="copyStaffDni('capitanes', document.getElementById('input-captain').value)" title="Copiar DNI del Capitán" class="bg-slate-100 border border-slate-200 text-slate-500 hover:text-blue-600 px-3 rounded-lg transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"></path></svg></button>
        </div>
    `;
    document.getElementById('input-captain').value = activeBoatItem.captain || '';
}

function copyStaffDni(type, name) {
    if(!name) return;
    const person = (staffDatabase[type] || []).find(p => p.nombre === name);
    if(person) copyData(person.dni, 'DNI de Staff');
}
function closeManageBoatModal() { document.getElementById('manage-boat-modal').classList.add('hidden'); activeBoatItem = null; window.clearModalHistory(); }

function updateModalSubtitle() {
    let total = 0; activeBoatItem.groups.forEach(g => total += g.guests.length);
    let capText = activeBoatItem.assignedBoat === 'shore' ? 'Personas' : '12 Plazas Ocupadas';
    document.getElementById('modal-boat-subtitle').innerText = `${activeBoatItem.time} • ${total}/${capText}`;
}

function checkDiverConflict(dni, fullName, skipGroupIdx = -1, skipGuestIdx = -1) {
    // Use universal tracker for Divers
    const loc = getPersonLocation(dni, fullName, 'guest', skipGroupIdx, skipGuestIdx);
    if (loc) return { conflict: true, where: loc };
    return { conflict: false, where: "" };
}

// HANDLES MOVING A DIVER FROM ONE GROUP TO ANOTHER
window.handleDiverMove = function(event, targetGroupIdx, targetGuestIdx = -1) {
    const data = event.dataTransfer.getData('diverInfo');
    if (!data) return;
    
    const { fromGroup, guestIdx } = JSON.parse(data);
    const diver = activeBoatItem.groups[fromGroup].guests[guestIdx];

    // Remove from original position
    activeBoatItem.groups[fromGroup].guests.splice(guestIdx, 1);
    
    // Insert at target position
    if (targetGuestIdx === -1) {
        // Dropped on header (add to end of group)
        activeBoatItem.groups[targetGroupIdx].guests.push(diver);
    } else {
        // Dropped on a specific row (insert exactly there)
        activeBoatItem.groups[targetGroupIdx].guests.splice(targetGuestIdx, 0, diver);
    }
    
    renderGroups();
};

function renderGroups() {
    const container = document.getElementById('groups-container');
    container.innerHTML = '';
    
    // --- INJECT LINK ACTION BAR ---
    if (selectedGuestsForGroup.length > 0) {
        const bar = document.createElement('div');
        // Added 'sticky top-0 z-[60]' so it floats when you scroll!
        bar.className = 'sticky top-0 z-[60] bg-blue-50/90 backdrop-blur border border-blue-200 rounded-xl p-3 mb-4 flex justify-between items-center shadow-md';
        bar.innerHTML = `
            <span class="text-sm font-black text-blue-800">${selectedGuestsForGroup.length} seleccionados</span>
            <div class="flex gap-2">
                <button onclick="openGroupLinkModal()" class="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-700 flex items-center gap-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg> Group</button>
                <button onclick="unlinkSelected()" class="px-3 py-1.5 bg-white text-red-600 border border-red-200 text-xs font-bold rounded-lg shadow-sm hover:bg-red-50">Disband</button>
            </div>
        `;
        container.appendChild(bar);
    }

    activeBoatItem.groups.forEach((group, groupIndex) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'bg-white border border-slate-200 rounded-xl shadow-sm relative focus-within:z-50';

        const guideOpts = (staffDatabase.guias || []).map(g => {
            const isSelected = group.guide === g.nombre;
            let conflictText = ""; let disabledClass = ""; let disabledAttr = "";
            
            // Use universal tracker for Guides
            let loc = getPersonLocation(g.dni, g.nombre, 'guide', groupIndex);

            if (!isSelected && loc) {
                conflictText = ` (En ${loc})`; disabledAttr = "disabled"; disabledClass = "text-slate-400 bg-slate-100 font-bold";
            }
            
            const roleStr = g.role && g.role !== 'Guía' ? ` (${g.role.substring(0,3).toUpperCase()})` : '';
            return `<option value="${g.nombre}" class="${disabledClass}" ${isSelected ? 'selected' : ''} ${disabledAttr}>${g.nombre}${roleStr}${conflictText}</option>`;
        }).join('');

        let html = `
            <div ondragover="event.preventDefault(); this.classList.add('bg-blue-200')" 
                 ondragleave="this.classList.remove('bg-blue-200')"
                 ondrop="event.preventDefault(); this.classList.remove('bg-blue-200'); handleDiverMove(event, ${groupIndex})"
                 class="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between rounded-t-xl transition-colors">
                <div class="flex items-center gap-3 flex-1">
                    <span class="text-xs font-black text-slate-500 uppercase tracking-widest">${activeBoatItem.assignedBoat === 'shore' ? 'INSTR:' : 'GUÍA:'}</span>
                    <select id="guide-select-${groupIndex}" class="px-3 py-1 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 w-1/2 cursor-pointer" onchange="updateGuide(${groupIndex}, this.value)">
                        <option value="">${window.isLoggedIn ? 'Seleccionar...' : 'Sin Guía'}</option>
                        ${guideOpts}
                    </select>
                    <button onclick="copyStaffDni('guias', document.getElementById('guide-select-${groupIndex}').value)" title="Copiar DNI del Guía" class="text-slate-400 hover:text-blue-600 transition-colors bg-white px-2 py-1 rounded border border-slate-200 shadow-sm"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"></path></svg></button>
                </div>
                <button onclick="removeGroup(${groupIndex})" class="text-slate-400 hover:text-red-500 p-1" title="Eliminar Grupo"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            </div>
            
            <div class="rounded-b-xl overflow-visible"> 
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                            <th class="p-3 w-8 text-center">#</th>
                            <th class="p-3 w-40">Nombre</th>
                            <th class="p-3 w-36 text-center">Titulación</th>
                            <th class="p-3 w-56 text-center">Extras</th>
                            <th class="p-3 w-16 text-center ${window.isLoggedIn ? '' : 'hidden'}">Señal</th>
                            <th class="p-3 w-12 text-center ${window.isLoggedIn ? '' : 'hidden'}">DNI</th>
                            <th class="p-3 w-16 text-center ${window.isLoggedIn ? '' : 'hidden'}">Contacto</th>
                            <th class="p-3 w-20 text-center ${window.isLoggedIn ? '' : 'hidden'}">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        group.guests.forEach((guest, guestIndex) => {
            let nameHtml = '';
            if (guest.isRelinking) {
                nameHtml = `<div class="relative">
                    <input type="text" id="relink-${groupIndex}-${guestIndex}" class="w-full px-2 py-1 border border-red-300 rounded focus:ring-2 focus:ring-red-500" placeholder="Buscar en DB..." oninput="searchRelink(${groupIndex}, ${guestIndex}, this.value)" autocomplete="off">
                    <div id="relink-dropdown-${groupIndex}-${guestIndex}" class="absolute z-[100] left-0 right-0 bg-white border border-slate-200 rounded shadow-2xl mt-1 hidden max-h-48 overflow-y-auto"></div>
                </div>`;
            } else {
                let manualDot = guest.isManual ? `<button onclick="activateRelink(${groupIndex}, ${guestIndex})" title="Cliente Manual - Click para enlazar a la Base de Datos" class="w-2.5 h-2.5 rounded-full bg-red-500 hover:bg-red-700 animate-pulse mr-2 inline-block shrink-0 shadow-sm"></button>` : '';
                nameHtml = `<div class="flex items-center">${manualDot}<span class="truncate cursor-pointer hover:text-blue-600 transition-colors" onclick="copyData('${guest.nombre}', 'Nombre')" title="Click para copiar">${guest.nombre}</span></div>`;
            }

            let titHtml = '';
            if (guest.course) {
                const badgeText = guest.courseBadge || guest.course;
                titHtml = `<button onclick="openTitPopup(event, ${groupIndex}, ${guestIndex})" title="Curso: ${guest.course}" class="text-[10px] font-black text-pink-700 bg-pink-100 border border-pink-300 rounded px-1.5 py-0.5 truncate max-w-[140px] mx-auto block hover:bg-pink-200 transition-colors shadow-sm cursor-pointer">${badgeText}</button>`;
            } else if (guest.titulacion) {
                titHtml = `<button onclick="openTitPopup(event, ${groupIndex}, ${guestIndex})" title="Titulación: ${guest.titulacion}" class="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 truncate max-w-[130px] mx-auto block hover:bg-slate-200 transition-colors cursor-pointer">${guest.titulacion}</button>`;
            } else if (guest.isManual) {
                titHtml = `<button onclick="openTitPopup(event, ${groupIndex}, ${guestIndex})" title="Falta Titulación" class="text-amber-500 hover:text-amber-600 bg-amber-50 rounded-full w-5 h-5 flex items-center justify-center font-black text-[10px] mx-auto border border-amber-200 cursor-pointer">?</button>`;
            } else {
                titHtml = `<button onclick="openTitPopup(event, ${groupIndex}, ${guestIndex})" class="text-xs font-bold text-slate-300 hover:text-slate-500 cursor-pointer w-full text-center">-</button>`;
            }

            let dniHtml = '';
            if (guest.dni) dniHtml = `<button onclick="copyData('${guest.dni}', 'DNI Cliente')" title="${guest.dni}" class="text-slate-400 hover:text-indigo-600 transition-colors"><svg class="w-5 h-5 inline mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"></path></svg></button>`;
            else if (guest.isManual) dniHtml = `<button onclick="openEditGuestModal(${groupIndex}, ${guestIndex})" title="Falta DNI" class="text-amber-500 hover:text-amber-600 bg-amber-50 rounded-full w-5 h-5 flex items-center justify-center font-black text-[10px] mx-auto border border-amber-200">?</button>`;
            else dniHtml = `<span class="text-xs font-bold text-slate-300">-</span>`;
            
            let contactHtml = '';
            if (guest.telefono || guest.email) {
                contactHtml = `<div class="flex justify-center gap-1">` + (guest.telefono ? `<button onclick="copyData('${guest.telefono}', 'Teléfono')" title="${guest.telefono}" class="text-slate-400 hover:text-green-600 transition-colors"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg></button>` : '') + (guest.email ? `<button onclick="copyData('${guest.email}', 'Email')" title="${guest.email}" class="text-slate-400 hover:text-blue-600 transition-colors"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 00-2 2z"></path></svg></button>` : '') + `</div>`;
            } else if (guest.isManual) {
                contactHtml = `<button onclick="openEditGuestModal(${groupIndex}, ${guestIndex})" title="Falta Contacto" class="text-amber-500 hover:text-amber-600 bg-amber-50 rounded-full w-5 h-5 flex items-center justify-center font-black text-[10px] mx-auto border border-amber-200">?</button>`;
            } else {
                contactHtml = `<span class="text-xs font-bold text-slate-300">-</span>`;
            }

            const gasStates = ['15L Aire', '12L Aire', '15L EAN28', '12L EAN28', '15L EAN32', '12L EAN32'];
            const gasCurrent = guest.gas || '15L Aire';
            const isNitrox = gasCurrent.includes('EAN');
            const gasColor = isNitrox ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-50 text-blue-600 border-blue-200';
            const gasShortText = gasCurrent.replace('L ', ' ').replace('Aire', 'Air').replace('EAN', 'Nx');

            const rentalCurrent = guest.rental || 0;
            let rentalClass = 'bg-diagonal-yellow text-transparent border-yellow-200';
            let rentalText = '';
            if (rentalCurrent === 1) rentalClass = 'bg-half-yellow border-yellow-400';
            if (rentalCurrent === 2) rentalClass = 'bg-full-yellow border-yellow-500';
            if (rentalCurrent === 'INC') { rentalClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner'; rentalText = 'INC'; }

            let globalIns = null;
            if (guest.dni && !guest.course) {
                const profile = customerDatabase.find(c => c.dni === guest.dni);
                if (profile && profile.insurance && profile.insurance.expiry >= activeBoatItem.date) {
                    globalIns = profile.insurance;
                }
            }

            let insHtml = '';
            if (globalIns) {
                guest.insurance = globalIns.type; 
                let displayVal = ['1D', '1W', '1M', '1Y'].includes(globalIns.type) ? `Seg ✔ (${globalIns.type})` : 'Seg ✔';
                insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex}, true)" title="Seguro Activo hasta ${globalIns.expiry} (${globalIns.type})" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner hover:bg-emerald-600 cursor-pointer shrink-0 whitespace-nowrap">${displayVal}</button>`;
            } else {
                let insCurrent = guest.insurance || 0;
                let cleanIns = insCurrent.toString().replace(' ✔', '');
                guest.insurance = cleanIns === '0' ? 0 : cleanIns; 

                if (cleanIns === 'INC') {
                    insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex})" title="Seguro Incluido" class="w-8 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0">INC</button>`;
                } else if (cleanIns !== '0') {
                    let displayVal = ['1D', '1W', '1M', '1Y'].includes(cleanIns) ? `Seg ✔ (${cleanIns})` : 'Seg ✔';
                    insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex})" title="Seguro: ${cleanIns}" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0 whitespace-nowrap cursor-pointer hover:bg-emerald-600">${displayVal}</button>`;
                } else {
                    insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex})" title="Falta Seguro" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-bold bg-red-500 text-white border-red-600 hover:bg-red-600 cursor-pointer shrink-0 whitespace-nowrap">Seg 🛑</button>`;
                }
            }
            
            let bonoClass = guest.hasBono ? 'bg-indigo-500 text-white border-indigo-600 font-bold' : 'bg-diagonal-indigo text-indigo-300 border-indigo-200 hover:bg-slate-50';
            const isSelectedForGroup = selectedGuestsForGroup.some(s => s.groupIndex === groupIndex && s.guestIndex === guestIndex);
            let tagHtml = `<button onclick="toggleGuestSelection(${groupIndex}, ${guestIndex})" class="w-6 h-6 rounded-full border-2 text-[10px] font-black mx-auto flex items-center justify-center transition-all ${isSelectedForGroup ? 'border-blue-600 shadow-[0_0_0_2px_rgba(37,99,235,0.3)] text-blue-600' : 'border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-500'}">${guestIndex + 1}</button>`;

            if (guest.bookingTag) {
                const colorClass = getGroupColorClass(guest.bookingTag);
                tagHtml = `<div class="relative flex items-center justify-center"><button onclick="toggleGuestSelection(${groupIndex}, ${guestIndex})" class="w-6 h-6 rounded-full border text-[10px] shadow-sm font-black mx-auto flex items-center justify-center transition-all ${colorClass} ${isSelectedForGroup ? 'ring-2 ring-offset-2 ring-blue-600 border-white' : 'border-white/30'}">${guestIndex + 1}</button></div>`;
            }

            let customerDeposit = guest.localDeposit || 0;
            if (guest.dni) {
                const profile = customerDatabase.find(c => c.dni === guest.dni);
                if (profile && profile.deposit) customerDeposit = profile.deposit;
            }
            let senalHtml = 
                `<div class="relative flex items-center justify-center">
                    <input type="number" value="${customerDeposit}" onchange="updateGuestDeposit('${guest.dni || ''}', this.value, ${groupIndex}, ${guestIndex})" class="w-12 px-1 py-1 text-center bg-white border border-slate-200 rounded text-[10px] font-black text-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-inner" style="-moz-appearance: textfield;" title="Señal / Anticipo">
                </div>`;

            html += `
                <tr draggable="${window.isLoggedIn ? 'true' : 'false'}"
                    id="guest-row-${groupIndex}-${guestIndex}"
                    onmousedown="if(window.isLoggedIn) { this.draggable = !event.target.closest('button, input, select, .absolute'); }"
                    ondragstart="event.dataTransfer.setData('diverInfo', JSON.stringify({fromGroup: ${groupIndex}, guestIdx: ${guestIndex}}))"
                    ondragover="event.preventDefault(); this.classList.add('bg-blue-100')"
                    ondragleave="this.classList.remove('bg-blue-100')"
                    ondrop="event.preventDefault(); this.classList.remove('bg-blue-100'); handleDiverMove(event, ${groupIndex}, ${guestIndex})"
                    class="border-b border-slate-100 transition-colors h-12 ${window.isLoggedIn ? 'cursor-move' : 'cursor-default'} ${isSelectedForGroup ? 'bg-blue-50/40' : 'hover:bg-slate-50'}">
                    <td class="p-3 text-center align-middle">${tagHtml}</td>
                    <td class="p-3 text-sm font-bold text-slate-800 align-middle max-w-[140px]">${nameHtml}</td>
                    <td class="p-3 text-center align-middle">${titHtml}</td>
                    <td class="p-3 align-middle">
                        <div class="flex items-center justify-center gap-2">
                            <button id="btn-gas-${groupIndex}-${guestIndex}" onclick="cycleGas(${groupIndex}, ${guestIndex})" class="w-14 h-7 flex justify-center items-center rounded border text-[10px] font-black transition-colors shrink-0 ${gasColor}">
                                ${gasShortText}
                            </button>
                            <button id="btn-rental-${groupIndex}-${guestIndex}" onclick="cycleRental(${groupIndex}, ${guestIndex})" class="w-8 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black shrink-0 ${rentalClass}">
                                ${rentalText}
                            </button>
                            ${insHtml}
                            <button id="btn-bono-${groupIndex}-${guestIndex}" onclick="toggleBono(${groupIndex}, ${guestIndex})" class="w-8 h-7 flex justify-center items-center rounded border transition-colors text-[11px] font-black shrink-0 ${bonoClass}" title="Usa Bono">
                                B
                            </button>
                        </div>
                    </td>
                    <td class="p-3 text-center align-middle ${window.isLoggedIn ? '' : 'hidden'}">${senalHtml}</td>
                    <td class="p-3 text-center align-middle ${window.isLoggedIn ? '' : 'hidden'}">${dniHtml}</td>
                    <td class="p-3 text-center align-middle whitespace-nowrap ${window.isLoggedIn ? '' : 'hidden'}">${contactHtml}</td>
                    <td class="p-3 text-center align-middle whitespace-nowrap ${window.isLoggedIn ? '' : 'hidden'}">
                        ${guest.dni ? `<button onclick="openCustomerProfile('${guest.dni}', '${guest.nombre.replace(/'/g, "\\'")}')" class="text-slate-300 hover:text-emerald-500 transition-colors mr-2" title="Ficha del Cliente / Cuenta"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg></button>` : ''}
                        <button onclick="openEditGuestModal(${groupIndex}, ${guestIndex})" class="text-slate-300 hover:text-blue-500 transition-colors mr-2" title="Editar Info"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                        <button onclick="removeGuest(${groupIndex}, ${guestIndex})" class="text-slate-300 hover:text-red-500 transition-colors" title="Eliminar Cliente"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                    </td>
                </tr>
            `;
        });

        html += `
                <tr class="bg-blue-50/30 focus-within:z-50 relative add-guest-row">
                    <td class="p-3 text-center text-blue-400 text-sm font-black">+</td>
                    <td colspan="6" class="p-2 relative">
                        <input type="text" id="search-${groupIndex}" class="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Buscar cliente por DNI o Nombre... (o presiona Enter para manual)" oninput="searchCustomers(${groupIndex}, this.value)" onkeydown="checkEnter(event, ${groupIndex})" autocomplete="off">
                        <div id="dropdown-${groupIndex}" class="absolute z-[100] left-2 right-2 bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 hidden max-h-64 overflow-y-auto"></div>
                    </td>
                </tr>
        `;
        html += `</tbody></table></div>`;
        groupDiv.innerHTML = html;
        container.appendChild(groupDiv);
    });
    
    // Automatically saves 0.5s after the UI updates
    triggerAutoSave(); 
}

function addGroup() { if(!window.isLoggedIn) return; activeBoatItem.groups.push({ guide: '', guests: [] }); renderGroups(); }

function removeGroup(groupIndex) { 
    showAppConfirm("¿Eliminar este grupo entero?", () => { 
        const dnis = activeBoatItem.groups[groupIndex].guests.map(g => g.dni).filter(Boolean);
        activeBoatItem.groups.splice(groupIndex, 1); 
        updateModalSubtitle(); 
        renderGroups(); 
        // Force Garbage Collection 1.5s later to ensure Auto-Save finished deleting the dive
        dnis.forEach(dni => { if (window.cleanOrphanedInsurance) setTimeout(() => window.cleanOrphanedInsurance(dni), 1500); });
    }); 
}

function updateGuide(groupIndex, value) { 
    activeBoatItem.groups[groupIndex].guide = value; 
    triggerAutoSave(); // No redraw needed, select already updated!
}

function removeGuest(groupIndex, guestIndex) { 
    if(!window.isLoggedIn) return;
    const dni = activeBoatItem.groups[groupIndex].guests[guestIndex].dni;
    activeBoatItem.groups[groupIndex].guests.splice(guestIndex, 1); 
    updateModalSubtitle(); 
    renderGroups(); // Has to re-render because it changes the table layout
    if (dni && window.cleanOrphanedInsurance) setTimeout(() => window.cleanOrphanedInsurance(dni), 1500);
}

function cycleGas(groupIndex, guestIndex) {
    if(!window.isLoggedIn) return;
    const states = ['15L Aire', '12L Aire', '15L EAN28', '12L EAN28', '15L EAN32', '12L EAN32'];
    const current = activeBoatItem.groups[groupIndex].guests[guestIndex].gas || '15L Aire';
    const nextGas = states[(states.indexOf(current) + 1) % states.length];
    activeBoatItem.groups[groupIndex].guests[guestIndex].gas = nextGas;
    
    // Targeted DOM Update (Instant!)
    const btn = document.getElementById(`btn-gas-${groupIndex}-${guestIndex}`);
    if (btn) {
        const isNitrox = nextGas.includes('EAN');
        const gasColor = isNitrox ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-50 text-blue-600 border-blue-200';
        btn.className = `w-14 h-7 flex justify-center items-center rounded border text-[10px] font-black transition-colors shrink-0 ${gasColor}`;
        btn.innerText = nextGas.replace('L ', ' ').replace('Aire', 'Air').replace('EAN', 'Nx');
    }
    triggerAutoSave();
}

function cycleRental(groupIndex, guestIndex) {
    if(!window.isLoggedIn) return;
    const current = activeBoatItem.groups[groupIndex].guests[guestIndex].rental || 0;
    let nextRental = 0;
    if (current === 0) nextRental = 1;
    else if (current === 1) nextRental = 2;
    else if (current === 2) nextRental = 0;
    else if (current === 'INC') nextRental = 0; // Fixes the crash if it was INC
    activeBoatItem.groups[groupIndex].guests[guestIndex].rental = nextRental;
    
    // Targeted DOM Update
    const btn = document.getElementById(`btn-rental-${groupIndex}-${guestIndex}`);
    if (btn) {
        let rentalClass = 'bg-diagonal-yellow text-transparent border-yellow-200';
        if (nextRental === 1) rentalClass = 'bg-half-yellow border-yellow-400';
        if (nextRental === 2) rentalClass = 'bg-full-yellow border-yellow-500';
        btn.className = `w-8 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black shrink-0 ${rentalClass}`;
        btn.innerText = '';
    }
    triggerAutoSave();
}

window.toggleBono = function(groupIndex, guestIndex) {
    if(!window.isLoggedIn) return;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    guest.hasBono = !guest.hasBono;

    // Targeted DOM Update
    const btn = document.getElementById(`btn-bono-${groupIndex}-${guestIndex}`);
    if (btn) {
        const bonoClass = guest.hasBono ? 'bg-indigo-500 text-white border-indigo-600 font-bold' : 'bg-diagonal-indigo text-indigo-300 border-indigo-200 hover:bg-slate-50';
        btn.className = `w-8 h-7 flex justify-center items-center rounded border transition-colors text-[11px] font-black shrink-0 ${bonoClass}`;
    }
    triggerAutoSave();
};
let activeInsGroup = null;
let activeInsGuest = null;

window.cleanOrphanedInsurance = async function(dni) {
    try {
        const profile = customerDatabase.find(c => c.dni === dni);
        if (!profile || !profile.insurance) return;

        const snap = await db.collection('mangamar_customers').doc(dni).collection('history').get();
        let hasValidDive = false;
        snap.forEach(doc => {
            const d = doc.data();
            if (d.insurance === profile.insurance.type) {
                // Check if the dive falls inside the exact window of THIS specific purchase
                if (profile.insurance.purchaseDate) {
                    if (d.date >= profile.insurance.purchaseDate && d.date <= profile.insurance.expiry) hasValidDive = true;
                } else {
                    hasValidDive = true; // Fallback for old purchases
                }
            }
        });

        if (!hasValidDive) {
            // Delete from DB
            await db.collection('mangamar_customers').doc(dni).update({ insurance: firebase.firestore.FieldValue.delete() });
            
            // Delete from Master List
            const masterRef = db.collection('mangamar_directory').doc('master_list');
            const masterDoc = await masterRef.get();
            if (masterDoc.exists) {
                let clients = masterDoc.data().clients || [];
                let idx = clients.findIndex(c => c.dni === dni);
                if (idx > -1) {
                    delete clients[idx].insurance;
                    await masterRef.set({ clients }, { merge: true });
                }
            }
            
            // Delete from UI Memory and refresh
            delete profile.insurance;
            if (typeof renderGroups === 'function') renderGroups();
        }
    } catch (e) { console.error("Garbage Collector Error:", e); }
};

window.openInsPopup = function(event, groupIndex, guestIndex, hasGlobal = false) {
    activeInsGroup = groupIndex;
    activeInsGuest = guestIndex;
    
    const popup = document.getElementById('ins-popup');
    const removeCont = document.getElementById('ins-popup-remove-container');
    if (removeCont) {
        if (hasGlobal) removeCont.classList.remove('hidden');
        else removeCont.classList.add('hidden');
    }
    
    popup.classList.remove('hidden');
    const rect = event.target.getBoundingClientRect();
    popup.style.top = `${rect.top + window.scrollY - 10}px`;
    popup.style.left = `${rect.right + window.scrollX + 10}px`;
};

window.setIns = async function(type) {
    document.getElementById('ins-popup').classList.add('hidden');
    if (activeInsGroup === null || activeInsGuest === null) return;
    
    const guest = activeBoatItem.groups[activeInsGroup].guests[activeInsGuest];
    
    if (type === 'Remove') {
        guest.insurance = 0; 
        if (guest.dni) {
            db.collection('mangamar_customers').doc(guest.dni).update({ insurance: firebase.firestore.FieldValue.delete() }).catch(e=>{});
            const masterDocRef = db.collection('mangamar_directory').doc('master_list');
            masterDocRef.get().then(doc => {
                if (doc.exists) {
                    let clients = doc.data().clients || [];
                    let idx = clients.findIndex(c => c.dni === guest.dni);
                    if (idx > -1) {
                        delete clients[idx].insurance;
                        masterDocRef.set({ clients }, { merge: true });
                    }
                }
            });
            const profile = customerDatabase.find(c => c.dni === guest.dni);
            if (profile) delete profile.insurance;
        }
    } else if (type === 'Propio') {
        guest.insurance = 'Propio ✔'; 
    } else {
        guest.insurance = type; 
        if (guest.dni) {
            let [y, m, d] = activeBoatItem.date.split('-').map(Number);
            let dateObj = new Date(y, m - 1, d);
            
            if (type === '1D') dateObj.setDate(dateObj.getDate() + 0);
            if (type === '1W') dateObj.setDate(dateObj.getDate() + 6);
            if (type === '1M') dateObj.setMonth(dateObj.getMonth() + 1);
            if (type === '1Y') dateObj.setFullYear(dateObj.getFullYear() + 1);
            
            const expiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
            // Added purchaseDate to make the window strict!
            const newIns = { type, expiry, purchaseDate: activeBoatItem.date };
            
            const profile = customerDatabase.find(c => c.dni === guest.dni);
            if (profile) profile.insurance = newIns;
            
            db.collection('mangamar_customers').doc(guest.dni).set({ insurance: newIns }, { merge: true });
            
            const masterDocRef = db.collection('mangamar_directory').doc('master_list');
            masterDocRef.get().then(doc => {
                if (doc.exists) {
                    let clients = doc.data().clients || [];
                    let idx = clients.findIndex(c => c.dni === guest.dni);
                    if (idx > -1) {
                        clients[idx].insurance = newIns;
                        masterDocRef.set({ clients }, { merge: true });
                    }
                }
            });
        }
    }
    
    // Targeted DOM Update
    const btn = document.getElementById(`btn-ins-${activeInsGroup}-${activeInsGuest}`);
    if (btn) {
        let cleanIns = (guest.insurance || 0).toString().replace(' ✔', '');
        if (cleanIns === 'INC') {
            btn.className = "w-8 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0";
            btn.innerText = "INC";
            btn.title = "Seguro Incluido";
        } else if (cleanIns !== '0' && cleanIns !== 0) {
            btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0 whitespace-nowrap";
            let displayVal = ['1D', '1W', '1M', '1Y'].includes(cleanIns) ? `Seg ✔ (${cleanIns})` : 'Seg ✔';
            btn.innerText = displayVal;
            btn.title = `Seguro: ${cleanIns}`;
        } else {
            btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-bold bg-red-500 text-white border-red-600 hover:bg-red-600 shrink-0 whitespace-nowrap cursor-pointer";
            btn.innerText = "Seg 🛑";
            btn.title = "Falta Seguro";
        }
    }
    triggerAutoSave();
};

// --- RELINK LOGIC ---
function activateRelink(groupIndex, guestIndex) {
    activeBoatItem.groups[groupIndex].guests[guestIndex].isRelinking = true;
    renderGroups();
    setTimeout(() => document.getElementById(`relink-${groupIndex}-${guestIndex}`).focus(), 50);
}

function searchRelink(groupIndex, guestIndex, query) {
    const dropdown = document.getElementById(`relink-dropdown-${groupIndex}-${guestIndex}`);
    query = query.toLowerCase().trim();
    if (query.length < 2) { dropdown.classList.add('hidden'); return; }

    const results = customerDatabase.filter(c => {
        const fullName = getFullName(c).toLowerCase();
        return fullName.includes(query) || (c.dni || '').toLowerCase().includes(query);
    });

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="px-4 py-2 text-xs text-slate-500 italic">No encontrado</div>`;
        dropdown.classList.remove('hidden'); return;
    }
    dropdown.innerHTML = results.map(c => {
        const fullName = getFullName(c);
        const conflict = checkDiverConflict(c.dni, fullName, groupIndex, guestIndex);
        if (conflict.conflict) {
            return `<div class="px-3 py-2 bg-slate-50 border-b border-slate-100 opacity-60 cursor-not-allowed flex justify-between items-center">
                <div>
                    <div class="font-bold text-slate-500 text-xs">${fullName}</div>
                    <div class="text-[10px] text-slate-400">${c.titulacion || '-'} • ${c.dni}</div>
                </div>
                <span class="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">En ${conflict.where}</span>
            </div>`;
        } else {
            const encodedData = encodeURIComponent(JSON.stringify(c));
            return `<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 text-left" onclick="executeRelink(${groupIndex}, ${guestIndex}, '${encodedData}')">
                <div class="font-bold text-slate-800 text-xs">${fullName}</div>
                <div class="text-[10px] text-slate-500">${c.titulacion || '-'} • ${c.dni}</div>
            </div>`;
        }
    }).join('');
    dropdown.classList.remove('hidden');
}

window.executeRelink = function(groupIndex, guestIndex, encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const fullName = [data.nombre, data.apellido].filter(Boolean).join(' ').trim();
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    const tag = findActiveTagForGuest(data.dni, fullName); // Auto-sync group!
    guest.nombre = fullName; guest.titulacion = data.titulacion || ''; guest.telefono = data.telefono || ''; 
    guest.email = data.email || ''; guest.dni = data.dni || ''; guest.isManual = false; guest.isRelinking = false;
    if (tag) guest.bookingTag = tag;
    renderGroups();
};

// --- EDIT MODAL LOGIC (GLOBAL VS LOCAL DRAFT) ---
let editingLocalGuestInfo = null;

function openEditGuestModal(groupIndex, guestIndex) {
    if(!window.isLoggedIn) return;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    
    // If they have a DNI, open the powerful CRM global modal
    if (guest.dni) {
        if (typeof window.promptEditCustomer === 'function') {
            window.activeFichaDni = guest.dni;
            window.promptEditCustomer();
        } else {
            showAppAlert("El motor del CRM aún no está cargado.");
        }
        return;
    }
    
    // If they DON'T have a DNI, open the local temporary modal
    editingLocalGuestInfo = { groupIndex, guestIndex };
    document.getElementById('edit-g-name').value = guest.nombre || '';
    document.getElementById('edit-g-tit').value = guest.titulacion || '';
    document.getElementById('edit-g-phone').value = guest.telefono || '';
    document.getElementById('edit-g-email').value = guest.email || '';
    document.getElementById('edit-guest-modal').classList.remove('hidden');
}

window.saveLocalGuestEdit = function() {
    if(!editingLocalGuestInfo) return;
    const { groupIndex, guestIndex } = editingLocalGuestInfo;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    
    // Only update these fields locally! Do not touch gas, deposits, or roles.
    guest.nombre = document.getElementById('edit-g-name').value.trim();
    guest.titulacion = document.getElementById('edit-g-tit').value.trim();
    guest.telefono = document.getElementById('edit-g-phone').value.trim();
    guest.email = document.getElementById('edit-g-email').value.trim();
    
    document.getElementById('edit-guest-modal').classList.add('hidden');
    renderGroups(); updateModalSubtitle();
};

function searchCustomers(groupIndex, query) {
    const dropdown = document.getElementById(`dropdown-${groupIndex}`);
    query = query.toLowerCase().trim();
    if (query.length < 2) { dropdown.classList.add('hidden'); return; }

    const results = customerDatabase.filter(c => {
        const fullName = getFullName(c).toLowerCase();
        return fullName.includes(query) || (c.dni || '').toLowerCase().includes(query);
    });

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="px-4 py-3 text-sm text-slate-500 italic">No encontrado.<br><span class="text-xs">Presiona <b>Enter</b> para añadir manualmente.</span></div>`;
        dropdown.classList.remove('hidden'); return;
    }

    dropdown.innerHTML = results.map(c => {
        const fullName = getFullName(c);
        const conflict = checkDiverConflict(c.dni, fullName);
        
        if (conflict.conflict) {
            return `<div class="px-4 py-2 bg-slate-50 border-b border-slate-100 opacity-60 cursor-not-allowed flex justify-between items-center">
                <div>
                    <div class="font-bold text-slate-500 text-sm">${fullName}</div>
                    <div class="text-xs text-slate-400 font-medium">${c.titulacion || '-'} • ${c.dni}</div>
                </div>
                <span class="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">En ${conflict.where}</span>
            </div>`;
        } else {
            const encodedData = encodeURIComponent(JSON.stringify(c));
            return `<div class="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors" onclick="selectCustomer(${groupIndex}, '${encodedData}')">
                <div class="font-bold text-slate-800 text-sm">${fullName}</div>
                <div class="text-xs text-slate-500 font-medium">${c.titulacion || '-'} • ${c.dni}</div>
            </div>`;
        }
    }).join('');
    dropdown.classList.remove('hidden');
}

window.selectCustomer = function(groupIndex, encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const fullName = getFullName(data);
    const tag = findActiveTagForGuest(data.dni, fullName); // Auto-sync group!
    activeBoatItem.groups[groupIndex].guests.push({ nombre: fullName, titulacion: data.titulacion || '', telefono: data.telefono || '', email: data.email || '', dni: data.dni || '', gas: '15L Aire', isManual: false, bookingTag: tag });
    updateModalSubtitle(); renderGroups(); 
};

function checkEnter(event, groupIndex) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = document.getElementById(`search-${groupIndex}`);
        const fullName = input.value.trim();
        if (fullName !== '') {
            const conflict = checkDiverConflict(null, fullName);
            if (conflict.conflict) { showAppAlert(`Imposible: Asignado en ${conflict.where}`); return; }
            const tag = findActiveTagForGuest(null, fullName); // Auto-sync group!
            activeBoatItem.groups[groupIndex].guests.push({ nombre: fullName, titulacion: '', telefono: '', email: '', dni: '', gas: '15L Aire', isManual: true, bookingTag: tag });
            updateModalSubtitle(); renderGroups();
        }
    }
}

document.addEventListener('click', function(event) {
    if (!event.target.closest('td')) document.querySelectorAll('[id^="dropdown-"], [id^="relink-dropdown-"]').forEach(el => el.classList.add('hidden'));
});

// --- SAVING & DELETING DATA ---
async function saveBoatData() {
    if (!activeBoatItem) return;

    // Guardar los cambios de Barco y Hora antes de evaluar el resto
    activeBoatItem.assignedBoat = document.getElementById('input-boat').value;
    activeBoatItem.time = document.getElementById('input-time').value;

    activeBoatItem.captain = activeBoatItem.assignedBoat === 'shore' ? '' : document.getElementById('input-captain').value;
    activeBoatItem.site = activeBoatItem.assignedBoat === 'shore' ? document.getElementById('input-activity').value : document.getElementById('input-site').value;

    // --- 🚨 STRICT CONFLICT FIREWALL ---
    // 1. Check Captain
    if (activeBoatItem.captain) {
        const cap = (staffDatabase.capitanes || []).find(c => c.nombre === activeBoatItem.captain);
        if (cap) {
            const loc = getPersonLocation(cap.dni, cap.nombre, 'captain');
            if (loc) { showAppAlert(`⚠️ Imposible guardar: El capitán ${cap.nombre} ya está en ${loc} a las ${activeBoatItem.time}.`); return; }
        }
    }

    // 2. Check Guides and Guests
    for (let grpIdx = 0; grpIdx < activeBoatItem.groups.length; grpIdx++) {
        const g = activeBoatItem.groups[grpIdx];
        
        if (g.guide) {
            const gui = (staffDatabase.guias || []).find(x => x.nombre === g.guide);
            if (gui) {
                const loc = getPersonLocation(gui.dni, gui.nombre, 'guide', grpIdx);
                if (loc) { showAppAlert(`⚠️ Imposible guardar: El guía ${gui.nombre} ya está en ${loc} a las ${activeBoatItem.time}.`); return; }
            }
        }
        
        for (let gstIdx = 0; gstIdx < g.guests.length; gstIdx++) {
            const gst = g.guests[gstIdx];
            const loc = getPersonLocation(gst.dni, gst.nombre, 'guest', grpIdx, gstIdx);
            if (loc) { showAppAlert(`⚠️ Imposible guardar: El cliente ${gst.nombre} ya está asignado en ${loc} a las ${activeBoatItem.time}.`); return; }
        }
    }
    // ------------------------------------

    const flatGuests = []; activeBoatItem.groups.forEach(g => flatGuests.push(...g.guests));
    
    // 🚨 CRITICAL TIMING FIX: Calculate who was removed BEFORE updating the database!
    let originalTrip = mergedAllocations.find(t => t.id === activeBoatItem.id && t.isInternalTrip);
    if (!originalTrip) originalTrip = mergedAllocations.find(t => t.id === activeBoatItem.id);
    
    const originalDnis = [];
    if (originalTrip && originalTrip.guests) {
        originalTrip.guests.forEach(g => { if(g.dni) originalDnis.push(g.dni); });
    }
    const currentDnis = flatGuests.map(g => g.dni).filter(Boolean);
    const removedDnis = originalDnis.filter(dni => !currentDnis.includes(dni));

    const payload = {
        date: activeBoatItem.date, time: activeBoatItem.time, assignedBoat: activeBoatItem.assignedBoat,
        site: activeBoatItem.site, captain: activeBoatItem.captain, groups: activeBoatItem.groups, guests: flatGuests 
    };
    
    try {
        await saveInternalBoatData(activeBoatItem.id, activeBoatItem.date, payload);
        
        // --- AUTO-SYNC EXACT TAG STATE TO OTHER BOATS RETROACTIVELY ---
        // This ensures if you disband/remove a tag, it removes it from their other dives that day too!
        const otherTrips = internalTrips.filter(t => t.date === activeBoatItem.date && t.id !== activeBoatItem.id);
        let needsUpdate = false;
        const monthKey = activeBoatItem.date.substring(0, 7);
        const updates = {};

        otherTrips.forEach(trip => {
            let tripChanged = false;
            const clonedTrip = JSON.parse(JSON.stringify(trip));

            clonedTrip.groups?.forEach(g => {
                g.guests?.forEach(otherGuest => {
                    // Find if this person on the other boat is currently sitting in the boat we are saving right now
                    const meInCurrentBoat = flatGuests.find(tg => 
                        (tg.dni && otherGuest.dni && tg.dni === otherGuest.dni) || 
                        (tg.nombre && otherGuest.nombre && tg.nombre.toLowerCase() === otherGuest.nombre.toLowerCase())
                    );
                    
                    if (meInCurrentBoat) {
                        // Force sync the tag state! If it exists, copy it. If it doesn't, delete it.
                        if (otherGuest.bookingTag !== meInCurrentBoat.bookingTag) {
                            if (meInCurrentBoat.bookingTag) {
                                otherGuest.bookingTag = meInCurrentBoat.bookingTag;
                            } else {
                                delete otherGuest.bookingTag;
                            }
                            tripChanged = true;
                        }
                    }
                });
            });

            if (tripChanged) {
                const newFlatGuests = []; clonedTrip.groups.forEach(g => newFlatGuests.push(...g.guests));
                clonedTrip.guests = newFlatGuests;
                updates[`allocations.${clonedTrip.id}`] = {
                    date: clonedTrip.date, time: clonedTrip.time, assignedBoat: clonedTrip.assignedBoat,
                    site: clonedTrip.site, captain: clonedTrip.captain, groups: clonedTrip.groups, guests: clonedTrip.guests
                };
                needsUpdate = true;
            }
        });

        if (needsUpdate) {
            await db.collection('mangamar_monthly').doc(monthKey).update(updates);
        }
        
        // --- 3. TRACKER: SAVE DIVE HISTORY TO CUSTOMER PROFILE (PHASE 1) ---
        const historyBatch = db.batch();
        let historyWrites = 0;
        
        // A. Delete ghost history for divers we calculated as REMOVED earlier
        removedDnis.forEach(dni => {
            const historyRef = db.collection('mangamar_customers').doc(dni).collection('history').doc(activeBoatItem.id);
            historyBatch.delete(historyRef);
            historyWrites++;
        });

        // B. Fetch existing network history profiles to ensure we don't accidentally overwrite payment states via autosave
        const validGuests = flatGuests.filter(g => g.dni);
        const checkPromises = validGuests.map(gst => db.collection('mangamar_customers').doc(gst.dni).collection('history').doc(activeBoatItem.id).get());
        const historicSnaps = await Promise.all(checkPromises);
        
        validGuests.forEach((gst, idx) => {
            const historyRef = historicSnaps[idx].ref;
            const curDoc = historicSnaps[idx];
            // CRITICAL BUGFIX: Detect if the invoice was already liquidated manually in the CRM, never overwrite to pending.
            const persistentState = (curDoc.exists && curDoc.data().paymentStatus) ? curDoc.data().paymentStatus : (gst.paymentStatus || 'pending');

            historyBatch.set(historyRef, {
                date: activeBoatItem.date,
                time: activeBoatItem.time,
                site: activeBoatItem.site,
                assignedBoat: activeBoatItem.assignedBoat,
                gas: gst.gas || '15L Aire',
                rental: gst.rental || 0,
                insurance: gst.insurance || 0,
                course: gst.course || null,           
                baseCourse: gst.baseCourse || null,   
                courseBadge: gst.courseBadge || null, 
                coursePrice: gst.coursePrice || 0,    
                hasBono: gst.hasBono || false,
                paymentStatus: persistentState,
                timestamp: firebase.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });
            historyWrites++;
        });
        if (historyWrites > 0) await historyBatch.commit();
        
        // --- GARBAGE COLLECTOR TRIGGER ---
        // Clean up insurance profiles for anyone who was removed from this boat
        removedDnis.forEach(dni => {
            if (window.cleanOrphanedInsurance) window.cleanOrphanedInsurance(dni);
        });

        // Flash the "Guardado" badge
        const indicator = document.getElementById('auto-save-indicator');
        if (indicator) {
            indicator.classList.remove('hidden', 'opacity-0');
            setTimeout(() => indicator.classList.add('opacity-0'), 2000);
        }
        
    } catch (e) {
        // Error alert is handled safely in saveInternalBoatData
    }
}

function deleteBoatData() {
    if(!window.isLoggedIn) return;
    if(!activeBoatItem || (activeBoatItem.isVisor && !activeBoatItem.isVisorEdited)) return;
    document.getElementById('delete-confirm-modal').classList.remove('hidden');
}

async function confirmDeleteBoatData() {
    try {
        const monthKey = activeBoatItem.date.substring(0, 7);
        
        // 1. Wipe ghost history for anyone currently assigned to this deleted boat
        const historyBatch = db.batch();
        let historyWrites = 0;
        
        // CRITICAL FIX: Look at the internal shadow trip, not the empty Visor trip
        let originalTrip = mergedAllocations.find(t => t.id === activeBoatItem.id && t.isInternalTrip);
        if (!originalTrip) originalTrip = mergedAllocations.find(t => t.id === activeBoatItem.id);
        
        if (originalTrip && originalTrip.guests) {
            originalTrip.guests.forEach(g => {
                if (g.dni) {
                    const ref = db.collection('mangamar_customers').doc(g.dni).collection('history').doc(activeBoatItem.id);
                    historyBatch.delete(ref);
                    historyWrites++;
                }
            });
        }
        
        // 2. Delete boat from schedule
        const mainUpdate = db.collection(INTERNAL_DB).doc(monthKey).update({ [`allocations.${activeBoatItem.id}`]: firebase.firestore.FieldValue.delete() });
        
        // Run both safely
        await Promise.all([mainUpdate, historyWrites > 0 ? historyBatch.commit() : Promise.resolve()]);
        
        // --- GARBAGE COLLECTOR TRIGGER ---
        if (originalTrip && originalTrip.guests) {
            originalTrip.guests.forEach(g => {
                if (g.dni && window.cleanOrphanedInsurance) window.cleanOrphanedInsurance(g.dni);
            });
        }

        showToast("Salida eliminada correctamente.");
        document.getElementById('delete-confirm-modal').classList.add('hidden');
        closeManageBoatModal();
    } catch (e) {
        console.error(e); showAppAlert("Error al eliminar la salida.");
    }
}

// ==========================================
// 6. GROUP LINKING LOGIC (CROSS-BOAT)
// ==========================================

// Converts a group name into a guaranteed, permanent color
function getGroupColorClass(groupName) {
    const colors = [
        'bg-red-500 text-white', 'bg-blue-500 text-white', 
        'bg-emerald-500 text-white', 'bg-purple-500 text-white', 
        'bg-pink-500 text-white', 'bg-orange-500 text-white', 
        'bg-teal-500 text-white', 'bg-indigo-500 text-white',
        'bg-fuchsia-500 text-white', 'bg-cyan-500 text-white'
    ];
    let hash = 0;
    for (let i = 0; i < groupName.length; i++) hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function toggleGuestSelection(groupIndex, guestIndex) {
    if(!window.isLoggedIn) return;
    const idx = selectedGuestsForGroup.findIndex(s => s.groupIndex === groupIndex && s.guestIndex === guestIndex);
    if (idx > -1) selectedGuestsForGroup.splice(idx, 1);
    else selectedGuestsForGroup.push({groupIndex, guestIndex});
    renderGroups();
}

// Scans the whole day to see if a specific diver already belongs to a group on another boat
function findActiveTagForGuest(guestDni, guestName) {
    if(!guestDni && !guestName) return null;
    let foundTag = null;
    const todaysTrips = mergedAllocations.filter(t => t.date === activeBoatItem.date);
    todaysTrips.forEach(t => {
        if(t.guests) t.guests.forEach(g => {
            if (g.bookingTag) {
                if (guestDni && g.dni && g.dni === guestDni) foundTag = g.bookingTag;
                else if (guestName && g.nombre && g.nombre.toLowerCase() === guestName.toLowerCase()) foundTag = g.bookingTag;
            }
        });
    });
    return foundTag;
}

function openGroupLinkModal() {
    document.getElementById('group-name-input').value = '';
    let existingTags = new Set();
    
    // Find all active tags today to build the clickable shortcut buttons
    mergedAllocations.filter(t => t.date === activeBoatItem.date).forEach(t => {
        if(t.guests) t.guests.forEach(g => { 
            if(g.bookingTag && !g.bookingTag.startsWith('anon_')) existingTags.add(g.bookingTag); 
        });
    });
    
    const listEl = document.getElementById('active-groups-list');
    const contEl = document.getElementById('active-groups-container');
    
    if(existingTags.size > 0) {
        listEl.innerHTML = Array.from(existingTags).map(tag => {
            const color = getGroupColorClass(tag);
            return `<button onclick="document.getElementById('group-name-input').value = '${tag}'" class="px-3 py-1.5 rounded-full text-[11px] font-bold shadow-sm hover:opacity-80 transition-opacity ${color}">${tag}</button>`;
        }).join('');
        contEl.classList.remove('hidden');
    } else {
        contEl.classList.add('hidden');
    }
    
    document.getElementById('group-link-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('group-name-input').focus(), 100);
}

function confirmGroupLink(groupName) {
    let finalName = groupName;
    if (!finalName || finalName.trim() === '') {
        // If "Sin Nombre", generate a silent random tag so they share a color on THIS boat
        finalName = 'anon_' + Math.random().toString(36).substr(2, 5); 
    } else {
        finalName = finalName.trim();
    }
    
    selectedGuestsForGroup.forEach(s => {
        activeBoatItem.groups[s.groupIndex].guests[s.guestIndex].bookingTag = finalName;
    });
    selectedGuestsForGroup = []; 
    document.getElementById('group-link-modal').classList.add('hidden');
    renderGroups(); 
}

function unlinkSelected() {
    selectedGuestsForGroup.forEach(s => {
        delete activeBoatItem.groups[s.groupIndex].guests[s.guestIndex].bookingTag;
    });
    selectedGuestsForGroup = []; // Clear selection
    renderGroups();
}

window.toggleBono = function(groupIndex, guestIndex) {
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    guest.hasBono = !guest.hasBono; // Flips between true/false
    renderGroups();
};

// --- COURSE / TITULACION ENGINE ---
window.activeTitTemp = { baseCourse: '', coursePrice: 0, isCustom: false };
let activeTitGroup = null;
let activeTitGuest = null;

window.switchTitTab = function(tabName) {
    ['Cursos', 'Especialidades', 'Personalizado'].forEach(name => {
        const btn = document.getElementById(`tit-tab-${name}`);
        if (btn) {
            if (name === tabName) btn.className = 'pb-3 text-sm font-black text-pink-600 border-b-[3px] border-pink-600 transition-all whitespace-nowrap';
            else btn.className = 'pb-3 text-sm font-bold text-slate-500 border-b-[3px] border-transparent hover:text-slate-800 transition-all whitespace-nowrap';
        }
    });

    const listContainer = document.getElementById('tit-list-container');
    const customContainer = document.getElementById('tit-custom-container');

    if (tabName === 'Personalizado') {
        listContainer.classList.add('hidden');
        customContainer.classList.remove('hidden');
        activeTitTemp.isCustom = true;
        document.getElementById('tit-custom-name').value = activeTitTemp.baseCourse || '';
        document.getElementById('tit-custom-price').value = activeTitTemp.coursePrice || 0;
    } else {
        listContainer.classList.remove('hidden');
        customContainer.classList.add('hidden');
        activeTitTemp.isCustom = false;
        
        const items = typeof dynamicPrices !== 'undefined' ? dynamicPrices.filter(p => p.category === tabName) : [];
        listContainer.innerHTML = items.map(item => {
            const isSelected = activeTitTemp.baseCourse === item.name;
            const baseClass = isSelected 
                ? "border-pink-500 bg-pink-50 ring-2 ring-pink-200" 
                : "border-slate-100 bg-white hover:border-pink-300 hover:bg-pink-50";
            const textClass = isSelected ? "text-pink-700" : "text-slate-700 group-hover:text-pink-700";
            const priceClass = isSelected ? "bg-pink-200 text-pink-800 border-pink-300" : "bg-slate-50 text-slate-500 group-hover:bg-pink-100 border-slate-100 group-hover:border-pink-200";
            
            return `
            <button onclick="selectTitCourse('${item.name.replace(/'/g, "\\'")}', ${item.price})" class="w-full flex justify-between items-center p-3 border rounded-xl transition-all group shadow-sm ${baseClass}">
                <span class="font-bold text-sm text-left leading-tight pr-4 ${textClass}">${item.name}</span>
                <span class="font-black text-xs px-3 py-1.5 rounded-lg border shrink-0 ${priceClass}">${item.price} €</span>
            </button>
            `;
        }).join('');
    }
    
    updateQuickButtonsHighlight();
};

window.updateQuickButtonsHighlight = function() {
    const quickMap = {
        'DSD': activeBoatItem.assignedBoat === 'shore' ? "DSD (Bautismo) desde Playa" : "DSD (Bautismo) desde Barco",
        'OWc': "Open Water Diver (OWC)",
        'AOWc': "Advanced Open Water (AOWC)",
        'Resc': "Rescate"
    };
    ['DSD', 'OWc', 'AOWc', 'Resc'].forEach(id => {
        const btn = document.getElementById(`tit-quick-${id}`);
        if (btn) {
            if (activeTitTemp.baseCourse === quickMap[id]) {
                btn.className = "py-2 bg-pink-500 text-white font-black text-sm rounded-xl transition-colors shadow-md";
            } else {
                btn.className = "py-2 bg-pink-50 text-pink-600 hover:bg-pink-100 font-black text-sm rounded-xl transition-colors border border-pink-200 shadow-sm";
            }
        }
    });
};

window.selectTitCourse = function(name, price) {
    activeTitTemp.baseCourse = name;
    activeTitTemp.coursePrice = price;
    activeTitTemp.isCustom = false;
    
    const currentTab = document.querySelector('[id^="tit-tab-"].text-pink-600').id.replace('tit-tab-', '');
    switchTitTab(currentTab);
};

window.selectQuickCourse = function(type) {
    let mappedName = type;
    if (type === 'DSD') mappedName = activeBoatItem.assignedBoat === 'shore' ? "DSD (Bautismo) desde Playa" : "DSD (Bautismo) desde Barco";
    else if (type === 'OWc') mappedName = "Open Water Diver (OWC)";
    else if (type === 'AOWc') mappedName = "Advanced Open Water (AOWC)";
    else if (type === 'Resc') mappedName = "Rescate";

    const foundItem = typeof dynamicPrices !== 'undefined' ? dynamicPrices.find(p => p.name === mappedName) : null;
    let price = foundItem ? foundItem.price : 0;

    selectTitCourse(mappedName, price);
};

window.updateTempCustom = function() {
    activeTitTemp.baseCourse = document.getElementById('tit-custom-name').value.trim();
    activeTitTemp.coursePrice = parseFloat(document.getElementById('tit-custom-price').value) || 0;
    updateQuickButtonsHighlight();
};

window.openTitPopup = function(event, groupIndex, guestIndex) {
    activeTitGroup = groupIndex;
    activeTitGuest = guestIndex;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    
    activeTitTemp = {
        baseCourse: guest.baseCourse || '',
        coursePrice: guest.coursePrice || 0,
        isCustom: false
    };

    let existingDetail = '';
    if (guest.course && guest.course.includes(' | ')) {
        existingDetail = guest.course.split(' | ')[1];
    }
    document.getElementById('tit-course-detail').value = existingDetail;
    
    const popup = document.getElementById('tit-popup');
    popup.classList.remove('hidden');
    
    let tabToOpen = 'Cursos';
    if (activeTitTemp.baseCourse) {
        const found = typeof dynamicPrices !== 'undefined' ? dynamicPrices.find(p => p.name === activeTitTemp.baseCourse) : null;
        if (found && found.category === 'Especialidades') tabToOpen = 'Especialidades';
        else if (!found && activeTitTemp.baseCourse !== '') tabToOpen = 'Personalizado';
    }
    switchTitTab(tabToOpen); 
};

window.saveTitCourse = function() {
    if (activeTitGroup === null || activeTitGuest === null) return;
    const guest = activeBoatItem.groups[activeTitGroup].guests[activeTitGuest];
    
    if (activeTitTemp.isCustom) updateTempCustom(); 
    
    if (!activeTitTemp.baseCourse) {
        showAppAlert("Selecciona o escribe un curso primero.");
        return;
    }

    let detail = document.getElementById('tit-course-detail').value.trim();
    let baseName = activeTitTemp.baseCourse;
    
    let displayBadge = baseName;
    if (baseName === "DSD (Bautismo) desde Playa" || baseName === "DSD (Bautismo) desde Barco") displayBadge = "DSD";
    else if (baseName === "Open Water Diver (OWC)") displayBadge = "OWc";
    else if (baseName === "Advanced Open Water (AOWC)") displayBadge = "AOWc";
    else if (baseName === "Rescate") displayBadge = "Resc";
    else displayBadge = baseName.length > 24 ? baseName.substring(0, 22) + '...' : baseName;

    guest.baseCourse = baseName;
    guest.course = detail ? `${baseName} | ${detail}` : baseName;
    guest.courseBadge = detail ? `${displayBadge} (${detail})` : displayBadge;
    guest.coursePrice = activeTitTemp.coursePrice;
    
    guest.rental = 'INC';
    guest.insurance = 'INC';

    document.getElementById('tit-popup').classList.add('hidden');
    renderGroups();
};

window.clearTitCourse = function() {
    if (activeTitGroup === null || activeTitGuest === null) return;
    const guest = activeBoatItem.groups[activeTitGroup].guests[activeTitGuest];
    
    delete guest.course;
    delete guest.baseCourse;
    delete guest.courseBadge;
    delete guest.coursePrice;
    if (guest.rental === 'INC') guest.rental = 0;
    if (guest.insurance === 'INC') guest.insurance = 0;
    
    document.getElementById('tit-popup').classList.add('hidden');
    renderGroups();
};