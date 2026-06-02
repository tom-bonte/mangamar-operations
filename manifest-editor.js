let autoSaveTimeout = null;
let isSaving = false;
let hasPendingSave = false;
window.isSaving = false;
window.hasPendingSave = false;
window.hasPendingWrites = false;
window.lastLocalEditTime = 0;

// The Auto-Save Engine: Debounced to 1000ms for lightning-fast UI response times and reduced network congestion
window.triggerAutoSave = function() {
    window.lastLocalEditTime = Date.now();
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        window.triggerInstantSave();
    }, 1000);
};

window.triggerInstantSave = async function() {
    window.lastLocalEditTime = Date.now();
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
    
    if (isSaving) {
        hasPendingSave = true;
        window.hasPendingSave = true;
        return;
    }
    
    isSaving = true;
    window.isSaving = true;
    try {
        while (activeBoatItem && typeof saveBoatData === 'function') {
            hasPendingSave = false;
            window.hasPendingSave = false;
            await saveBoatData();
            // If another save request was queued up during the await, loop and save the fresh RAM state
            if (!hasPendingSave) {
                break;
            }
        }
    } catch (e) {
        console.error("Queue save failed:", e);
    } finally {
        isSaving = false;
        window.isSaving = false;
    }
};

window.propagateEquipmentInRAM = function(dni, equipmentPayload) {
    if (!dni) return;
    
    let viewedDateStr = new Date().toISOString().split('T')[0];
    if (typeof currentDate !== 'undefined' && currentDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        viewedDateStr = `${year}-${month}-${day}`;
    }
    const targetDateStr = (window.activeBoatItem && window.activeBoatItem.date) ? window.activeBoatItem.date : viewedDateStr;
    const earliestDateStr = targetDateStr < viewedDateStr ? targetDateStr : viewedDateStr;

    // 1. Update in mergedAllocations (RAM)
    if (window.mergedAllocations) {
        window.mergedAllocations.forEach(trip => {
            if (trip.date >= earliestDateStr && trip.groups) {
                let modified = false;
                trip.groups.forEach(group => {
                    if (group.guests) {
                        group.guests.forEach(guest => {
                            if (guest.dni === dni) {
                                for (const key in equipmentPayload) {
                                    if (guest[key] !== equipmentPayload[key]) {
                                        guest[key] = equipmentPayload[key];
                                        modified = true;
                                    }
                                }
                            }
                        });
                    }
                });
                if (modified) {
                    const newFlatGuests = [];
                    trip.groups.forEach(g => newFlatGuests.push(...g.guests));
                    trip.guests = newFlatGuests;
                }
            }
        });
    }

    // 2. Update in window.internalTrips (RAM)
    if (window.internalTrips) {
        window.internalTrips.forEach(trip => {
            if (trip.date >= earliestDateStr && trip.groups) {
                let modified = false;
                trip.groups.forEach(group => {
                    if (group.guests) {
                        group.guests.forEach(guest => {
                            if (guest.dni === dni) {
                                for (const key in equipmentPayload) {
                                    if (guest[key] !== equipmentPayload[key]) {
                                        guest[key] = equipmentPayload[key];
                                        modified = true;
                                    }
                                }
                            }
                        });
                    }
                });
                if (modified) {
                    const newFlatGuests = [];
                    trip.groups.forEach(g => newFlatGuests.push(...g.guests));
                    trip.guests = newFlatGuests;
                }
            }
        });
    }

    // 3. Update activeBoatItem if currently open and matches!
    if (window.activeBoatItem && window.activeBoatItem.groups) {
        window.activeBoatItem.groups.forEach(group => {
            if (group.guests) {
                group.guests.forEach(guest => {
                    if (guest.dni === dni) {
                        for (const key in equipmentPayload) {
                            guest[key] = equipmentPayload[key];
                        }
                    }
                });
            }
        });
    }

    // 4. Instant local redraw of daily grid and current groups list!
    if (typeof window.renderDailyGrid === 'function') {
        window.renderDailyGrid();
    }
    if (typeof window.renderGroups === 'function') {
        window.renderGroups();
    }
};

// Dynamic Auto-Width Utility for Select Dropdowns
window.adjustSelectElWidth = function(selectEl) {
    if (!selectEl) return;
    const tempSpan = document.createElement('span');
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.whiteSpace = 'nowrap';
    tempSpan.style.font = window.getComputedStyle(selectEl).font || 'bold 12px sans-serif';
    
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    tempSpan.innerText = selectedOption ? selectedOption.text : '';
    document.body.appendChild(tempSpan);
    const textWidth = tempSpan.getBoundingClientRect().width;
    document.body.removeChild(tempSpan);
    
    // Add spacious padding (80px for custom relative selects, 70px for others) to leave nice breathing white space
    const padding = (selectEl.id === 'input-site' || selectEl.id === 'input-activity') ? 80 : 70;
    const targetWidth = `${Math.ceil(textWidth + padding)}px`;
    
    const wrapper = selectEl.parentElement;
    if (wrapper && wrapper.classList.contains('relative') && (selectEl.id === 'input-site' || selectEl.id === 'input-activity')) {
        wrapper.style.width = targetWidth;
    } else {
        selectEl.style.width = targetWidth;
    }
};

window.adjustAllHeaderSelectWidths = function() {
    ['input-boat', 'input-time', 'input-site', 'input-activity', 'input-captain'].forEach(id => {
        const el = document.getElementById(id);
        if (el) window.adjustSelectElWidth(el);
    });
};



// ==========================================
// 5. MODAL & DYNAMIC TABLES 
// ==========================================
function openManageBoatModal(tripOrId, boatId, time, dateStr, isNavBackForward = false) {
    if (window.isStaffLoggedIn) {
        showToast("🔒 Acceso denegado: El Personal no tiene permiso para abrir manifiestos.", "error");
        return;
    }
    if (!window.isLoggedIn && !tripOrId) return;
    
    if (typeof isNavBackForward !== 'boolean') isNavBackForward = false;
    window.selectedGuestsForGroup = []; // Reset selection when opening a new modal
    window._activeSearchGroupIdx = 0; // Reset target group index to prevent leakage from previous modals
    
    let trip = tripOrId;
    if (typeof tripOrId === 'string') {
        trip = mergedAllocations.find(t => t.id === tripOrId);
        // If not found in DB yet (e.g. slow network), fallback to RAM if it matches
        if (!trip && activeBoatItem && activeBoatItem.id === tripOrId) {
            trip = activeBoatItem;
        }
    }
    
    // Preserve activeBoatItem if we are just returning to the exact same trip via modal history
    if (!isNavBackForward || !activeBoatItem || activeBoatItem.id !== (trip ? trip.id : tripOrId)) {
        activeBoatItem = trip ? { ...trip } : {
            id: typeof tripOrId === 'string' ? tripOrId : `internal_${Date.now()}`, 
            date: dateStr, time: time, assignedBoat: boatId, 
            site: boatId === 'shore' ? 'Shore' : SITES_INTERNAL[0], captain: '', isVisor: false, groups: [] 
        };
    }

    recordModalHistory({ type: 'boat', args: [activeBoatItem.id, boatId, time, dateStr], isNavBackForward });

    // Double-safety check: if groups is missing, empty, or has a total of 0 guests, but flat guests exist (e.g. from Visor), migrate them!
    let totalGroupGuests = 0;
    if (activeBoatItem.groups) {
        activeBoatItem.groups.forEach(g => {
            if (g.guests) totalGroupGuests += g.guests.length;
        });
    }

    if (!activeBoatItem.groups || activeBoatItem.groups.length === 0 || totalGroupGuests === 0) {
        const initialGuests = (activeBoatItem.guests && activeBoatItem.guests.length > 0)
            ? JSON.parse(JSON.stringify(activeBoatItem.guests))
            : [];
        
        if (initialGuests.length > 0) {
            activeBoatItem.groups = [{ guide: '', apoyo: '', guests: initialGuests }];
        } else if (!activeBoatItem.groups || activeBoatItem.groups.length === 0) {
            activeBoatItem.groups = [{ guide: '', apoyo: '', guests: [] }];
        }
    }

    // 🚨 CRITICAL TIMING FIX: Snapshot the DNIS synchronously when opening the modal to prevent network race conditions when tracking removed divers.
    const allGuests = [];
    activeBoatItem.groups.forEach(g => { if(g.guests) allGuests.push(...g.guests); });
    activeBoatItem.lastSavedDnis = allGuests.map(g => g.dni).filter(Boolean);

    // Fetch payment status, collector, and overall customer outstandingDebt for guests in the background (as a fallback/sync)
    window.activeTripPayments = {};
    const dnis = allGuests.map(g => g.dni).filter(Boolean);
    if (dnis.length > 0) {
        const promises = dnis.map(async (dni) => {
            try {
                const [tripHistSnap, customerSnap] = await Promise.all([
                    db.collection('mangamar_customers').doc(dni).collection('history').doc(activeBoatItem.id).get(),
                    db.collection('mangamar_customers').doc(dni).get()
                ]);
                return { dni, tripHistSnap, customerSnap };
            } catch (e) {
                console.error(`Error loading payment and customer data for ${dni}:`, e);
                return { dni, tripHistSnap: null, customerSnap: null };
            }
        });
        Promise.all(promises).then(results => {
            let needsReRender = false;
            results.forEach(({ dni, tripHistSnap, customerSnap }) => {
                let outstandingDebt = undefined;
                if (customerSnap && customerSnap.exists) {
                    const customerDocData = customerSnap.data();
                    outstandingDebt = customerDocData.outstandingDebt;
                    // Update in-memory customerDatabase to keep it perfectly updated
                    if (typeof customerDatabase !== 'undefined' && Array.isArray(customerDatabase)) {
                        const index = customerDatabase.findIndex(c => c.dni === dni);
                        if (index !== -1) {
                            if (outstandingDebt !== undefined) {
                                customerDatabase[index].outstandingDebt = outstandingDebt;
                            } else {
                                delete customerDatabase[index].outstandingDebt;
                            }
                        }
                    }
                }
                
                if (tripHistSnap && tripHistSnap.exists) {
                    const data = tripHistSnap.data();
                    window.activeTripPayments[dni] = {
                        paymentStatus: data.paymentStatus || 'pending',
                        paymentMethod: data.paymentMethod || '',
                        paidBy: data.paidBy || '',
                        outstandingDebt: outstandingDebt
                    };
                    
                    // Sync into in-memory activeBoatItem
                    activeBoatItem.groups.forEach(g => {
                        (g.guests || []).forEach(gst => {
                            if (gst.dni === dni) {
                                if (data.paymentStatus === 'paid' && gst.paymentStatus !== 'paid') {
                                    gst.paymentStatus = 'paid';
                                    gst.paymentMethod = data.paymentMethod || '';
                                    gst.paidBy = data.paidBy || '';
                                    needsReRender = true;
                                }
                            }
                        });
                    });
                } else {
                    window.activeTripPayments[dni] = {
                        paymentStatus: 'pending',
                        paymentMethod: '',
                        paidBy: '',
                        outstandingDebt: outstandingDebt
                    };
                }
            });
            if (needsReRender) {
                renderGroups(true);
            }
        }).catch(err => console.error("Error fetching payment states:", err));
    }

    const boatConfig = BOATS[boatId] || { name: 'Barco Desconocido' };
    
    let formattedDate = dateStr || '';
    if (dateStr && dateStr.includes('-')) {
        const [y, m, d] = dateStr.split('-');
        const dateObj = new Date(y, m - 1, d);
        formattedDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    }
    
    document.getElementById('modal-boat-title').innerText = `${formattedDate} | ${boatConfig.name} - ${activeBoatItem.site || 'Nueva Salida'}`;
    
    document.getElementById('input-boat').value = activeBoatItem.assignedBoat || 'ares';
    document.getElementById('input-time').value = activeBoatItem.time || '09:00';
    document.getElementById('input-time').disabled = activeBoatItem.isVisor;

    // Max Plazas field — only for internal trips
    const maxDivesContainer = document.getElementById('input-maxdives-container');
    const maxDivesInput = document.getElementById('input-maxdives');
    if (activeBoatItem.isVisor || boatId === 'shore') {
        if (maxDivesContainer) maxDivesContainer.classList.add('hidden');
    } else {
        if (maxDivesContainer) maxDivesContainer.classList.remove('hidden');
        if (maxDivesInput) maxDivesInput.value = activeBoatItem.maxDives || '';
    }
    
    // Dynamic Options for Boat
    const inputBoat = document.getElementById('input-boat');
    if (activeBoatItem.isVisor) {
        inputBoat.disabled = true; // Visor boats cannot be changed.
    } else {
        inputBoat.disabled = false;
        // Restrict Shore mapping: Boats stay boats, Shore stays Shore
        const currentBoat = activeBoatItem.assignedBoat || boatId;
        Array.from(inputBoat.options).forEach(opt => {
            if (currentBoat === 'shore') opt.disabled = (opt.value !== 'shore');
            else opt.disabled = (opt.value === 'shore');
        });
    }

    const delBtn = document.getElementById('btn-delete-boat');
    delBtn.classList.remove('hidden'); // UNLOCK SUPERUSER DELETE FOR ALL TRIPS

    if (boatId === 'shore') {
        document.getElementById('destino-container').classList.add('hidden');
        document.getElementById('captain-inline-container').classList.add('hidden');
        document.getElementById('radio-times-container').classList.add('hidden');
        document.getElementById('activity-container').classList.remove('hidden');
        document.getElementById('input-activity').value = activeBoatItem.site;
    } else {
        document.getElementById('destino-container').classList.remove('hidden');
        document.getElementById('captain-inline-container').classList.remove('hidden');
        document.getElementById('radio-times-container').classList.remove('hidden');
        document.getElementById('activity-container').classList.add('hidden');
        
        const siteSelect = document.getElementById('input-site');
        const boatSites = ALL_SITES.filter(s => s !== 'Shore' && s !== 'Aula');
        siteSelect.innerHTML = boatSites.map(s => `<option value="${s}">${s}</option>`).join('');
        siteSelect.value = activeBoatItem.site || SITES_INTERNAL[0]; 
        
        if (activeBoatItem.isVisor) {
            siteSelect.disabled = true;
            siteSelect.classList.add('bg-slate-200', 'cursor-not-allowed', 'opacity-70');
            // Adding a small visual hint that it's controlled by Visor
            siteSelect.title = "El punto de buceo está controlado por el Visor de la Reserva.";
        } else {
            siteSelect.disabled = false;
            siteSelect.classList.remove('bg-slate-200', 'cursor-not-allowed', 'opacity-70');
            siteSelect.title = "";
        }
        
        renderCaptainDropdown();
    }
    
    updateModalSubtitle(); renderGroups(true);
    if (typeof loadWaitlistForTrip === 'function') loadWaitlistForTrip();
    document.getElementById('manage-boat-modal').classList.remove('hidden');
    window.adjustAllHeaderSelectWidths();
    if (isNavBackForward) window.hideAllNavModals('manage-boat-modal');
}

function renderCaptainDropdown() {
    const capInlineContainer = document.getElementById('captain-inline-container');
    const radioContainer = document.getElementById('radio-times-container');
    if (!capInlineContainer || !radioContainer) return; 
    
    const options = (staffDatabase.capitanes || []).map(c => {
        const isSelected = activeBoatItem.captain === c.nombre;
        let conflictText = ""; let disabledClass = ""; let disabledAttr = "";
        
        // Use universal tracker for Captains
        let loc = getPersonLocation(c.dni, c.nombre, 'captain');
        
        if (!isSelected && loc) {
            conflictText = ` (En ${loc})`; disabledAttr = "disabled"; disabledClass = "text-slate-400 bg-slate-100 font-bold";
        }
        return `<option value="${c.nombre}" class="${disabledClass}" ${isSelected ? 'selected' : ''} ${disabledAttr}>${c.nombre}${conflictText}</option>`;
    }).join('');
    
    if (activeBoatItem.assignedBoat === 'shore') {
        capInlineContainer.innerHTML = '';
        capInlineContainer.classList.add('hidden');
        radioContainer.innerHTML = '';
        radioContainer.classList.add('hidden');
    } else {
        capInlineContainer.classList.remove('hidden');
        capInlineContainer.innerHTML = `
            <span class="text-xs font-black text-black uppercase tracking-wider shrink-0">Capitán:</span>
            <select id="input-captain" class="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs font-bold text-slate-700 cursor-pointer h-[32px]" onchange="activeBoatItem.captain = this.value; renderCaptainDropdown(); renderGroups(); window.triggerInstantSave();">
                <option value="">${window.isLoggedIn ? 'Seleccionar Capitán...' : 'Sin Asignar'}</option>
                ${options}
            </select>
            ${activeBoatItem.captain ? `<button onclick="window.clearCaptain()" title="Quitar Capitán" class="w-7 h-7 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 rounded-lg font-black text-xs transition-colors shadow-sm shrink-0 active:scale-95">✕</button>` : ''}
            <button onclick="copyStaffDni('capitanes', document.getElementById('input-captain').value)" title="Copiar DNI del Capitán" class="w-7 h-7 flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-orange-600 rounded-lg transition-colors shadow-sm shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"></path></svg></button>
            ${activeBoatItem.isVisor ? `
            <div class="flex items-center gap-1.5 ml-4 shrink-0 border-l border-slate-200 pl-4">
                <span class="text-xs font-black text-black uppercase tracking-wider select-none">RM</span>
                <div class="relative group inline-block select-none mr-1">
                    <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-serif italic text-[11px] cursor-pointer transition-colors shadow-sm select-none leading-none pb-[1px]">i</span>
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[220px] bg-slate-900 text-white text-[10px] font-bold leading-normal rounded-xl px-3 py-2.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center whitespace-normal select-none">
                        Para mostrar si la salida ya está bloqueada en el plataforma de la Reserva Marina
                    </div>
                </div>
                <input type="checkbox" id="input-rm-locked" onchange="window.toggleRmLocked(this.checked)" class="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer" ${activeBoatItem.rmLocked ? 'checked' : ''}>
            </div>
            ` : ''}
        `;
        document.getElementById('input-captain').value = activeBoatItem.captain || '';
        const capEl = document.getElementById('input-captain');
        if (capEl) window.adjustSelectElWidth(capEl);

        radioContainer.classList.remove('hidden');
        radioContainer.innerHTML = `
            <div class="flex flex-wrap items-center gap-x-8 gap-y-3 w-full md:w-auto">
                <div class="flex items-center gap-1.5 text-xs font-black text-black uppercase tracking-wider shrink-0 mr-1">
                    <svg class="w-4 h-4 text-black animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.1" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                    </svg>
                    Radio (Tiempos):
                </div>
                <div class="flex items-center gap-2.5">
                    <span class="text-xs font-black text-black uppercase tracking-wider">Saliendo:</span>
                    <input type="text" id="input-time-saliendo" placeholder="--:--" class="w-[60px] px-2 py-1 bg-white border border-orange-200 focus:border-orange-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs font-bold text-slate-700 text-center h-[30px]" 
                           value="${activeBoatItem.timeSaliendo || ''}" 
                           onkeydown="if(event.key === 'Enter') { this.blur(); }"
                           onblur="if(activeBoatItem.timeSaliendo !== this.value) { activeBoatItem.timeSaliendo = this.value; window.triggerAutoSave(); }">
                </div>
                <div class="flex items-center gap-2.5">
                    <span class="text-xs font-black text-black uppercase tracking-wider">Buzos en Agua:</span>
                    <input type="text" id="input-time-buzos-agua" placeholder="--:--" class="w-[60px] px-2 py-1 bg-white border border-orange-200 focus:border-orange-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs font-bold text-slate-700 text-center h-[30px]" 
                           value="${activeBoatItem.timeBuzosAgua || ''}" 
                           onkeydown="if(event.key === 'Enter') { this.blur(); }"
                           onblur="if(activeBoatItem.timeBuzosAgua !== this.value) { activeBoatItem.timeBuzosAgua = this.value; window.triggerAutoSave(); }">
                </div>
                <div class="flex items-center gap-2.5">
                    <span class="text-xs font-black text-black uppercase tracking-wider">Regreso:</span>
                    <input type="text" id="input-time-volviendo" placeholder="--:--" class="w-[60px] px-2 py-1 bg-white border border-orange-200 focus:border-orange-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs font-bold text-slate-700 text-center h-[30px]" 
                           value="${activeBoatItem.timeVolviendo || ''}" 
                           onkeydown="if(event.key === 'Enter') { this.blur(); }"
                           onblur="if(activeBoatItem.timeVolviendo !== this.value) { activeBoatItem.timeVolviendo = this.value; window.triggerAutoSave(); }">
                </div>
            </div>
        `;
    }
}

function copyStaffDni(type, name, groupIndex) {
    if(!name) return;
    if (groupIndex !== undefined && activeBoatItem && activeBoatItem.groups[groupIndex]) {
        const group = activeBoatItem.groups[groupIndex];
        if (group.guide === name && group.guideDni) {
            copyData(group.guideDni, 'DNI de Guía Personalizado');
            return;
        }
        if (group.apoyo === name && group.apoyoDni) {
            copyData(group.apoyoDni, 'DNI de Apoyo Personalizado');
            return;
        }
    }
    const person = (staffDatabase[type] || []).find(p => p.nombre === name);
    if(person) copyData(person.dni, 'DNI de Staff');
}
async function closeManageBoatModal() { 
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
    
    // Wait for the sequential save queue to completely empty out
    if (isSaving) {
        hasPendingSave = true; // force the queue to do one final save of the current state
        window.hasPendingSave = true;
        while (isSaving) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } else {
        // If no save is running, do one last instant save of any final changes
        if (activeBoatItem && typeof saveBoatData === 'function') {
            try {
                await saveBoatData();
            } catch (e) {
                console.error("Error saving manifest before close:", e);
            }
        }
    }
    
    document.getElementById('manage-boat-modal').classList.add('hidden'); 
    activeBoatItem = null; 
    window.clearModalHistory(); 

    // Preserve search state and popover popup on modal close if query is active
    if (window.activeDailySearchQuery && window.activeDailySearchQuery.trim().length >= 3) {
        if (typeof window.expandDailySearch === 'function') {
            window.expandDailySearch();
        }
        if (typeof window.executeDailySearch === 'function') {
            window.executeDailySearch(window.activeDailySearchQuery);
        }
    }
}


function updateModalSubtitle() {
    let total = 0; activeBoatItem.groups.forEach(g => total += g.guests.filter(guest => !guest.cancelled).length);
    let capacityNum = parseInt(activeBoatItem.maxDives) || parseInt(activeBoatItem.plazas) || parseInt(activeBoatItem.pax) || (window.BOATS && window.BOATS[activeBoatItem.assignedBoat] ? window.BOATS[activeBoatItem.assignedBoat].maxGuests : 12);
    let capText = activeBoatItem.assignedBoat === 'shore' ? 'Personas' : `${capacityNum} Plazas Ocupadas`;
    const totalPeople = typeof window.calculateTotalPeopleOnBoat === 'function' ? window.calculateTotalPeopleOnBoat(activeBoatItem) : total;
    document.getElementById('modal-boat-subtitle').innerText = `${activeBoatItem.time} • ${total}/${capText} (total: ${totalPeople})`;
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

function renderGroups(skipAutoSave = false) {
    const container = document.getElementById('groups-container');
    container.innerHTML = '';
    
    // --- INJECT LINK ACTION BAR ---
    if (window.selectedGuestsForGroup.length > 0) {
        const bar = document.createElement('div');
        // Added 'sticky top-0 z-[60]' so it floats when you scroll!
        bar.className = 'sticky top-0 z-[60] bg-blue-50/90 backdrop-blur border border-blue-200 rounded-xl p-3 mb-4 flex justify-between items-center shadow-md';
        bar.innerHTML = `
            <span class="text-sm font-black text-blue-800">${window.selectedGuestsForGroup.length} seleccionados</span>
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

        let hasGuideMatch = false;
        const guideOpts = (staffDatabase.guias || []).map(g => {
            const isSelected = group.guide === g.nombre;
            if (isSelected) hasGuideMatch = true;
            let conflictText = ""; let disabledClass = ""; let disabledAttr = "";
            
            // Use universal tracker for Guides
            let loc = getPersonLocation(g.dni, g.nombre, 'guide', groupIndex);

            if (!isSelected && loc) {
                conflictText = ` (En ${loc})`; disabledAttr = "disabled"; disabledClass = "text-slate-400 bg-slate-100 font-bold";
            }
            
            const roleStr = g.role && g.role !== 'Guía' ? ` (${g.role.substring(0,3).toUpperCase()})` : '';
            return `<option value="${g.nombre}" class="${disabledClass}" ${isSelected ? 'selected' : ''} ${disabledAttr}>${g.nombre}${roleStr}${conflictText}</option>`;
        }).join('');

        let customGuideOpt = "";
        if (group.guide && !hasGuideMatch) {
            customGuideOpt = `<option value="${group.guide}" selected>${group.guide} (Personalizado)</option>`;
        }

        let hasApoyoMatch = false;
        const apoyoOpts = (staffDatabase.guias || []).map(g => {
            const isSelected = group.apoyo === g.nombre;
            if (isSelected) hasApoyoMatch = true;
            let conflictText = ""; let disabledClass = ""; let disabledAttr = "";
            
            // Use universal tracker for Apoyo
            let loc = getPersonLocation(g.dni, g.nombre, 'apoyo', groupIndex);

            if (!isSelected && loc) {
                conflictText = ` (En ${loc})`; disabledAttr = "disabled"; disabledClass = "text-slate-400 bg-slate-100 font-bold";
            }
            
            const roleStr = g.role && g.role !== 'Guía' ? ` (${g.role.substring(0,3).toUpperCase()})` : '';
            return `<option value="${g.nombre}" class="${disabledClass}" ${isSelected ? 'selected' : ''} ${disabledAttr}>${g.nombre}${roleStr}${conflictText}</option>`;
        }).join('');

        let customApoyoOpt = "";
        if (group.apoyo && !hasApoyoMatch) {
            customApoyoOpt = `<option value="${group.apoyo}" selected>${group.apoyo} (Personalizado)</option>`;
        }

        let html = `
            <div ondragover="event.preventDefault(); this.classList.add('bg-orange-200')" 
                 ondragleave="this.classList.remove('bg-orange-200')"
                 ondrop="event.preventDefault(); this.classList.remove('bg-orange-200'); handleDiverMove(event, ${groupIndex})"
                 class="bg-orange-100 px-4 py-3 border-b border-orange-300 flex items-center justify-between rounded-t-xl transition-colors">
                <div class="flex items-center gap-4 flex-1">
                    <div class="flex items-center gap-1.5">
                        <span class="text-xs font-black text-black uppercase tracking-wider">${activeBoatItem.assignedBoat === 'shore' ? 'INSTR:' : 'GUÍA:'}</span>
                        <select id="guide-select-${groupIndex}" onfocus="window._activeSearchGroupIdx = ${groupIndex}" class="px-2 py-1 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-slate-800 w-[380px] cursor-pointer" onchange="updateGuide(${groupIndex}, this.value)">
                            <option value="">${window.isLoggedIn ? 'Seleccionar...' : 'Sin Guía'}</option>
                            <option value="CUSTOM_NAME_PROMPT" class="text-orange-600 font-black">+ Nombre Personalizado...</option>
                            ${customGuideOpt}
                            ${guideOpts}
                        </select>
                        ${group.guide ? `<button onclick="window.clearGuide(${groupIndex})" title="Quitar Guía" class="w-7 h-7 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 rounded-lg font-black text-xs transition-all shadow-sm shrink-0 active:scale-95">✕</button>` : ''}
                        <button onclick="copyStaffDni('guias', '${(group.guide || '').replace(/'/g, "\\'")}', ${groupIndex})" title="Copiar DNI del Guía" class="text-slate-400 hover:text-black transition-colors bg-white px-2 py-1 rounded border border-slate-200 shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"></path></svg></button>
                    </div>
                    
                    <div class="flex items-center gap-1.5">
                        <span class="text-xs font-black text-black uppercase tracking-wider">APOYO:</span>
                        <select id="apoyo-select-${groupIndex}" onfocus="window._activeSearchGroupIdx = ${groupIndex}" class="px-2 py-1 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold text-slate-800 w-[380px] cursor-pointer" onchange="updateApoyo(${groupIndex}, this.value)">
                            <option value="">${window.isLoggedIn ? 'Seleccionar...' : 'Sin Apoyo'}</option>
                            <option value="CUSTOM_NAME_PROMPT" class="text-orange-600 font-black">+ Nombre Personalizado...</option>
                            ${customApoyoOpt}
                            ${apoyoOpts}
                        </select>
                        ${group.apoyo ? `<button onclick="window.clearApoyo(${groupIndex})" title="Quitar Apoyo" class="w-7 h-7 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 rounded-lg font-black text-xs transition-all shadow-sm shrink-0 active:scale-95">✕</button>` : ''}
                        <button onclick="copyStaffDni('guias', '${(group.apoyo || '').replace(/'/g, "\\'")}', ${groupIndex})" title="Copiar DNI del Apoyo" class="text-slate-400 hover:text-black transition-colors bg-white px-2 py-1 rounded border border-slate-200 shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"></path></svg></button>
                    </div>
                </div>
                <button onclick="removeGroup(${groupIndex})" class="text-slate-400 hover:text-red-500 p-1" title="Eliminar Grupo"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            </div>
            
            <div class="rounded-b-xl overflow-visible"> 
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                            <th class="p-3 w-8 text-center">#</th>
                            <th class="p-3 w-64">Nombre</th>
                            <th class="p-3 w-36 text-center">Titulación</th>
                            <th class="p-3 w-44 text-center">Extras</th>
                            <th class="p-3 w-12 text-center ${window.isLoggedIn ? '' : 'hidden'}">Depósito</th>
                            <th class="p-3 w-8 text-center ${window.isLoggedIn ? '' : 'hidden'}">DNI</th>
                            <th class="p-3 w-10 text-center ${window.isLoggedIn ? '' : 'hidden'}">Contacto</th>
                            <th class="p-3 w-14 text-center ${window.isLoggedIn ? '' : 'hidden'}">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        group.guests.forEach((guest, guestIndex) => {
            let nameHtml = '';
            if (guest.isRelinking) {
                nameHtml = `<div class="relative">
                    <input type="text" id="relink-${groupIndex}-${guestIndex}" class="w-full px-2 py-1 border border-red-300 rounded focus:ring-2 focus:ring-red-500" placeholder="Buscar en DB..." oninput="searchRelink(${groupIndex}, ${guestIndex}, this.value)" onkeydown="checkRelinkEnter(event, ${groupIndex}, ${guestIndex})" onblur="setTimeout(() => { const d = document.getElementById('global-autocomplete'); if(d) d.classList.add('hidden'); if(activeBoatItem && activeBoatItem.groups[${groupIndex}] && activeBoatItem.groups[${groupIndex}].guests[${guestIndex}]) { activeBoatItem.groups[${groupIndex}].guests[${guestIndex}].isRelinking = false; renderGroups(); } }, 200)" autocomplete="off">
                </div>`;
            } else {
                let manualDot = guest.isManual ? `<button onclick="activateRelink(${groupIndex}, ${guestIndex})" title="Cliente Manual - Click para enlazar a la Base de Datos" class="w-2.5 h-2.5 rounded-full bg-red-500 hover:bg-red-700 animate-pulse mr-2 inline-block shrink-0 shadow-sm"></button>` : '';
                
                // Arrived indicator circle (3-state: white/default, green/arrived, red/cancelled)
                const arrivedClass = guest.cancelled
                    ? 'bg-red-500 border-red-600 shadow-[0_0_0_3px_rgba(239,68,68,0.25)] shadow-red-200'
                    : guest.arrived
                        ? 'bg-emerald-500 border-emerald-600 shadow-[0_0_0_3px_rgba(16,185,129,0.25)] shadow-emerald-200'
                        : 'bg-white border-slate-300 hover:border-emerald-400 hover:shadow-[0_0_0_2px_rgba(16,185,129,0.15)]';
                const arrivedTitle = guest.cancelled 
                    ? 'Cancelado — Click para desmarcar' 
                    : guest.arrived 
                        ? 'Llegado ✔ — Click para cancelar' 
                        : 'Marcar como llegado';
                const arrivedDot = `<button id="btn-arrived-${groupIndex}-${guestIndex}" onclick="window.toggleArrived(${groupIndex}, ${guestIndex})" title="${arrivedTitle}" class="w-5 h-5 rounded-full border-2 transition-all duration-200 shrink-0 mr-2 ${arrivedClass}"></button>`;
                
                nameHtml = `<div class="flex items-center">${manualDot}${arrivedDot}<span class="truncate cursor-pointer hover:text-blue-600 transition-colors" onclick="copyData('${guest.nombre}', 'Nombre')" title="Click para copiar">${guest.nombre}</span></div>`;
            }

            let divesCountText = '';
            if (guest.dni && typeof customerDatabase !== 'undefined') {
                const crmMatch = customerDatabase.find(c => c.dni === guest.dni);
                if (crmMatch && crmMatch.dives !== undefined && crmMatch.dives !== null && crmMatch.dives !== '') {
                    divesCountText = ` (${crmMatch.dives})`;
                }
            }

            let titHtml = '';
            if (guest.course) {
                let badgeText = guest.courseBadge || guest.course;
                const lowerCourse = (guest.course || '').toLowerCase();
                const lowerBadge = (guest.courseBadge || '').toLowerCase();
                if ((lowerCourse.includes("dsd") && (lowerCourse.includes("doble") || lowerCourse.includes("double"))) || 
                    (lowerBadge.includes("dsd") && (lowerBadge.includes("doble") || lowerBadge.includes("double")))) {
                    badgeText = "DSD (doble)";
                }
                titHtml = `<button onclick="openTitPopup(event, ${groupIndex}, ${guestIndex})" title="Curso: ${guest.course}" class="text-[10px] font-black text-pink-700 bg-pink-100 border border-pink-300 rounded px-1.5 py-0.5 truncate max-w-[150px] mx-auto block hover:bg-pink-200 transition-colors shadow-sm cursor-pointer">${badgeText}${divesCountText}</button>`;
            } else if (guest.titulacion) {
                titHtml = `<button onclick="openTitPopup(event, ${groupIndex}, ${guestIndex})" title="Titulación: ${guest.titulacion}" class="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 truncate max-w-[150px] mx-auto block hover:bg-slate-200 transition-colors cursor-pointer">${guest.titulacion}${divesCountText}</button>`;
            } else if (guest.isManual) {
                titHtml = `<button onclick="openTitPopup(event, ${groupIndex}, ${guestIndex})" title="Falta Titulación" class="text-amber-500 hover:text-amber-600 bg-amber-50 rounded-full w-5 h-5 flex items-center justify-center font-black text-[10px] mx-auto border border-amber-200 cursor-pointer">?</button>`;
            } else {
                titHtml = `<button onclick="openTitPopup(event, ${groupIndex}, ${guestIndex})" class="text-xs font-bold text-slate-300 hover:text-slate-500 cursor-pointer w-full text-center">-</button>`;
            }

            let dniHtml = '';
            if (guest.dni) dniHtml = `<button onclick="copyData('${guest.dni}', 'DNI Cliente')" title="${guest.dni}" class="text-slate-400 hover:text-indigo-600 transition-colors"><svg class="w-5 h-5 inline mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"></path></svg></button>`;
            else if (guest.isManual) dniHtml = `<button onclick="openEditGuestModal(${groupIndex}, ${guestIndex})" title="Falta DNI" class="text-amber-500 hover:text-amber-600 bg-amber-50 rounded-full w-5 h-5 flex items-center justify-center font-black text-[10px] mx-auto border border-amber-200">?</button>`;
            else dniHtml = `<span class="text-xs font-bold text-slate-300">-</span>`;
            
            // Live Lookup for Contact Info (Manifest snapshots might be missing it)
            let phoneToUse = guest.telefono;
            let emailToUse = guest.email;
            if ((!phoneToUse || !emailToUse) && guest.dni && typeof customerDatabase !== 'undefined') {
                const crmMatch = customerDatabase.find(c => window.normalizeSearchString(c.dni || '') === window.normalizeSearchString(guest.dni));
                if (crmMatch) {
                    if (!phoneToUse) phoneToUse = crmMatch.telefono || '';
                    if (!emailToUse) emailToUse = crmMatch.email || '';
                }
            }

            let contactHtml = '';
            if (phoneToUse || emailToUse) {
                contactHtml = `<div class="flex justify-center gap-1">` + (phoneToUse ? `<button onclick="copyData('${phoneToUse}', 'Teléfono')" title="${phoneToUse}" class="text-slate-400 hover:text-green-600 transition-colors"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg></button>` : '') + (emailToUse ? `<button onclick="copyData('${emailToUse}', 'Email')" title="${emailToUse}" class="text-slate-400 hover:text-blue-600 transition-colors"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 00-2 2z"></path></svg></button>` : '') + `</div>`;
            } else if (guest.isManual) {
                contactHtml = `<button onclick="openEditGuestModal(${groupIndex}, ${guestIndex})" title="Falta Contacto" class="text-amber-500 hover:text-amber-600 bg-amber-50 rounded-full w-5 h-5 flex items-center justify-center font-black text-[10px] mx-auto border border-amber-200">?</button>`;
            } else {
                contactHtml = `<span class="text-xs font-bold text-slate-300">-</span>`;
            }

            const gasStates = ['15L Aire', '12L Aire', '15L EAN28', '12L EAN28', '15L EAN32', '12L EAN32'];
            const gasCurrent = guest.gas || '15L Aire';
            const isNitrox = gasCurrent.includes('EAN');
            const gasColor = isNitrox ? 'bg-green-500 text-white border-green-600 font-black' : 'bg-blue-50 text-blue-600 border-blue-200';
            const gasShortText = gasCurrent.replace('Aire', 'Aire').replace(/EAN\s*(\d+)/i, '$1%');

            const rentalCurrent = guest.rental || 0;
            let rentalClass = 'bg-diagonal-yellow text-slate-300 border-yellow-200';
            let rentalText = 'Eq';
            if (rentalCurrent === 1) { rentalClass = 'bg-half-yellow border-yellow-400 text-yellow-800'; rentalText = 'Eq'; }
            if (rentalCurrent === 2) { rentalClass = 'bg-full-yellow border-yellow-500 text-yellow-900'; rentalText = 'Eq'; }
            if (rentalCurrent === 'INC') { rentalClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner'; rentalText = 'INC'; }

            // Computer rental button
            const compCurrent = guest.computer || 0;
            let compClass = 'bg-slate-50 text-slate-300 border-slate-200 hover:bg-slate-100';
            let compText = 'Comp';
            if (compCurrent === 1) { compClass = 'bg-cyan-500 text-white border-cyan-600 font-black shadow-inner'; }
            if (compCurrent === 'INC') { compClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner'; compText = 'INC'; }

            let globalIns = null;
            let isInsExpired = false;
            if (guest.dni && !guest.course) {
                const profile = customerDatabase.find(c => c.dni === guest.dni);
                if (profile && profile.insurance) {
                    globalIns = profile.insurance;
                    const expiryStr = window.normalizeDateStr(globalIns.expiry);
                    if (expiryStr < activeBoatItem.date) {
                        isInsExpired = true;
                    }
                }
            }

            let insHtml = '';
            if (globalIns) {
                let insVal = globalIns.type.toString();
                let cleanIns = insVal.replace(' ✔', '');
                
                if (isInsExpired) {
                    guest.insurance = cleanIns; // remove stale checkmark
                    let displayVal = `Seg 🛑`;
                    insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex}, true)" title="Seguro CADUCADO el ${window.formatInsuranceDate(globalIns.expiry)} (${cleanIns})" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-red-500 text-white border-red-600 hover:bg-red-600 cursor-pointer shrink-0 whitespace-nowrap">${displayVal}</button>`;
                } else {
                    guest.insurance = globalIns.type; 
                    const isTemp = ['1D', '1W', '1M', '1Y'].includes(cleanIns);
                    if (isTemp) {
                        const isBought = insVal.includes(' ✔');
                        if (isBought) {
                            let displayVal = `Seg ✓ (${cleanIns})`;
                            insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex}, true)" title="Seguro Activo hasta ${window.formatInsuranceDate(globalIns.expiry)} (${cleanIns}) (Comprado)" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner hover:bg-emerald-600 cursor-pointer shrink-0 whitespace-nowrap">${displayVal}</button>`;
                        } else {
                            let displayVal = `Seg (${cleanIns})`;
                            insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex}, true)" title="Seguro Activo hasta ${window.formatInsuranceDate(globalIns.expiry)} (${cleanIns}) (Pendiente de comprar)" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-orange-500 text-white border-orange-600 shadow-inner hover:bg-orange-600 cursor-pointer shrink-0 whitespace-nowrap">${displayVal}</button>`;
                        }
                    } else {
                        let displayVal = 'Seg ✓';
                        insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex}, true)" title="Seguro Activo hasta ${window.formatInsuranceDate(globalIns.expiry)} (${globalIns.type})" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner hover:bg-emerald-600 cursor-pointer shrink-0 whitespace-nowrap">${displayVal}</button>`;
                    }
                }
            } else {
                let insCurrent = guest.insurance || 0;
                if (insCurrent && typeof insCurrent === 'object') {
                    insCurrent = insCurrent.type || 0;
                }
                if (insCurrent === '0') insCurrent = 0;
                let cleanIns = insCurrent.toString().replace(' ✔', '');
                guest.insurance = cleanIns === '0' ? 0 : insCurrent; 

                if (cleanIns === 'INC') {
                    insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex})" title="Seguro Incluido" class="w-8 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0">INC</button>`;
                } else if (cleanIns !== '0') {
                    const isTemp = ['1D', '1W', '1M', '1Y'].includes(cleanIns);
                    if (isTemp) {
                        const isBought = insCurrent.toString().includes(' ✔');
                        if (isBought) {
                            let displayVal = `Seg ✓ (${cleanIns})`;
                            insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex})" title="Seguro: ${cleanIns} (Comprado)" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0 whitespace-nowrap cursor-pointer hover:bg-emerald-600">${displayVal}</button>`;
                        } else {
                            let displayVal = `Seg (${cleanIns})`;
                            insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex})" title="Seguro: ${cleanIns} (Pendiente de comprar)" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-orange-500 text-white border-orange-600 shadow-inner shrink-0 whitespace-nowrap cursor-pointer hover:bg-orange-600">${displayVal}</button>`;
                        }
                    } else {
                        let displayVal = 'Seg ✓';
                        insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex})" title="Seguro: ${cleanIns} (Activo)" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0 whitespace-nowrap cursor-pointer hover:bg-emerald-600">${displayVal}</button>`;
                    }
                } else {
                    insHtml = `<button id="btn-ins-${groupIndex}-${guestIndex}" onclick="openInsPopup(event, ${groupIndex}, ${guestIndex})" title="Falta Seguro" class="px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-bold bg-red-500 text-white border-red-600 hover:bg-red-600 cursor-pointer shrink-0 whitespace-nowrap">Seg 🛑</button>`;
                }
            }
            
            let bonoClass = guest.hasBono ? 'bg-indigo-500 text-white border-indigo-600 font-bold' : 'bg-diagonal-indigo text-indigo-300 border-indigo-200 hover:bg-slate-50';
            const isSelectedForGroup = window.selectedGuestsForGroup.some(s => s.groupIndex === groupIndex && s.guestIndex === guestIndex);
            let tagHtml = `<button onclick="toggleGuestSelection(${groupIndex}, ${guestIndex})" class="w-6 h-6 rounded-full border-2 text-[10px] font-black mx-auto flex items-center justify-center transition-all ${isSelectedForGroup ? 'border-blue-600 shadow-[0_0_0_2px_rgba(37,99,235,0.3)] text-blue-600' : 'border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-500'}">${guestIndex + 1}</button>`;

            if (guest.bookingTag) {
                const bgColor = getGroupColorClass(guest.bookingTag);
                const textColor = getContrastYIQ(bgColor);
                tagHtml = `<div class="relative flex items-center justify-center"><button onclick="toggleGuestSelection(${groupIndex}, ${guestIndex})" class="w-6 h-6 rounded-full border text-[10px] shadow-sm font-black mx-auto flex items-center justify-center transition-all ${isSelectedForGroup ? 'ring-2 ring-offset-2 ring-blue-600 border-white' : 'border-white/30'}" style="background-color: ${bgColor}; color: ${textColor};">${guestIndex + 1}</button></div>`;
            }

            let customerDeposit = guest.localDeposit || 0;
            let depositContasimple = guest.localDepositC || false;
            if (guest.dni) {
                const profile = customerDatabase.find(c => c.dni === guest.dni);
                if (profile) {
                    if (profile.deposit !== undefined) customerDeposit = profile.deposit;
                    if (profile.depositContasimple !== undefined) depositContasimple = profile.depositContasimple;
                }
            }
            
            // Orange by default if there's any deposit, green if Contasimple (C) checked
            let depositColor = depositContasimple ? 'text-emerald-600 font-black' : 'text-orange-500 font-black';
            let depositFocusRing = depositContasimple ? 'focus:ring-emerald-500' : 'focus:ring-orange-500';
            let cClass = depositContasimple ? 'bg-blue-600 text-white border-blue-700 font-bold' : 'bg-white text-blue-400 border-blue-200 hover:bg-blue-50';
            
            let senalHtml = 
                `<div class="flex items-center justify-center gap-1">
                    <input type="number" value="${customerDeposit}" onchange="updateGuestDeposit('${guest.dni || ''}', this.value, ${groupIndex}, ${guestIndex})" class="w-12 px-1 py-1 text-center bg-white border border-slate-200 rounded text-[10px] ${depositColor} focus:outline-none focus:ring-1 ${depositFocusRing} shadow-inner" style="-moz-appearance: textfield;" title="Depósito / Anticipo">
                    <button onclick="toggleContasimple(${groupIndex}, ${guestIndex})" class="w-5 h-5 flex justify-center items-center rounded border transition-colors text-[9px] font-black shrink-0 ${cClass}" title="Contasimple (Contabilizado)">
                        C
                    </button>
                </div>`;

            html += `
                <tr draggable="${window.isLoggedIn ? 'true' : 'false'}"
                    id="guest-row-${groupIndex}-${guestIndex}"
                    onmousedown="if(window.isLoggedIn) { this.draggable = !event.target.closest('button, input, select, .absolute'); }"
                    ondragstart="event.dataTransfer.setData('diverInfo', JSON.stringify({fromGroup: ${groupIndex}, guestIdx: ${guestIndex}}))"
                    ondragover="event.preventDefault(); this.classList.add('bg-blue-100')"
                    ondragleave="this.classList.remove('bg-blue-100')"
                    ondrop="event.preventDefault(); this.classList.remove('bg-blue-100'); handleDiverMove(event, ${groupIndex}, ${guestIndex})"
                    class="border-b border-slate-100 transition-colors h-12 ${window.isLoggedIn ? 'cursor-move' : 'cursor-default'} ${isSelectedForGroup ? 'bg-blue-50/40' : guest.cancelled ? 'bg-red-50/40' : guest.arrived ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}">
                    <td class="p-3 text-center align-middle">${tagHtml}</td>
                    <td class="p-3 text-sm font-bold text-slate-800 align-middle">${nameHtml}</td>
                    <td class="p-3 text-center align-middle">${titHtml}</td>
                    <td class="p-3 align-middle">
                        <div class="flex items-center justify-center gap-1.5">
                            ${(guest.baseCourse === "Snorkeling" || guest.courseBadge === "Snorkel" || (guest.baseCourse && guest.baseCourse.toLowerCase().includes("snorkel"))) ? 
                            `<span class="text-[10px] font-black text-slate-300 italic px-2">- N/A -</span>` : 
                            `
                                <button id="btn-gas-${groupIndex}-${guestIndex}" onclick="cycleGas(${groupIndex}, ${guestIndex})" class="w-14 h-7 flex justify-center items-center rounded border text-[10px] font-black transition-colors shrink-0 ${gasColor}">
                                    ${gasShortText}
                                </button>
                                <button id="btn-rental-${groupIndex}-${guestIndex}" onclick="cycleRental(${groupIndex}, ${guestIndex})" class="w-8 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black shrink-0 ${rentalClass}">
                                    ${rentalText}
                                </button>
                                <button id="btn-comp-${groupIndex}-${guestIndex}" onclick="toggleComputer(${groupIndex}, ${guestIndex})" class="w-10 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black shrink-0 ${compClass}" title="Alquiler Ordenador">
                                    ${compText}
                                </button>
                                ${insHtml}
                                <button id="btn-bono-${groupIndex}-${guestIndex}" onclick="toggleBono(${groupIndex}, ${guestIndex})" class="w-8 h-7 flex justify-center items-center rounded border transition-colors text-[11px] font-black shrink-0 ${bonoClass}" title="Usa Bono">
                                    B
                                </button>
                            `}
                        </div>
                    </td>
                    <td class="p-3 text-center align-middle ${window.isLoggedIn ? '' : 'hidden'}">${senalHtml}</td>
                    <td class="p-3 text-center align-middle ${window.isLoggedIn ? '' : 'hidden'}">${dniHtml}</td>
                    <td class="p-3 text-center align-middle whitespace-nowrap ${window.isLoggedIn ? '' : 'hidden'}">${contactHtml}</td>
                    <td class="p-3 text-center align-middle whitespace-nowrap ${window.isLoggedIn ? '' : 'hidden'}">
                        ${guest.dni ? (() => {
                            const payInfo = (window.activeTripPayments && window.activeTripPayments[guest.dni]) ? window.activeTripPayments[guest.dni] : { paymentStatus: guest.paymentStatus || 'pending', paymentMethod: guest.paymentMethod || '', paidBy: guest.paidBy || '' };
                            
                            let outstandingDebt = payInfo.outstandingDebt;
                            if (outstandingDebt === undefined) {
                                const customerInfo = (window.customerDatabase || []).find(c => c.dni === guest.dni);
                                if (customerInfo) outstandingDebt = customerInfo.outstandingDebt;
                            }
                            
                            const isPaid = (payInfo.paymentStatus === 'paid') && (outstandingDebt === 0 || outstandingDebt === undefined);
                            const btnClass = 'text-slate-300 hover:text-emerald-500 transition-colors mr-2';
                            const btnTitle = isPaid 
                                ? `Cobrado con ${payInfo.paymentMethod || 'Tarjeta'} por ${payInfo.paidBy || 'N/A'}` 
                                : 'Ficha del Cliente / Cuenta (Pendiente de Pago)';
                            const svgHtml = isPaid 
                                ? `<svg class="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="18" height="14" x="3" y="5" rx="3" fill="#10b981" /><rect width="18" height="14" x="3" y="5" rx="3" stroke="currentColor" stroke-width="2" /><rect width="18" height="2.5" x="3" y="8.5" fill="white" opacity="0.85" /><rect width="3.5" height="2.5" x="6" y="13.5" rx="0.5" fill="white" opacity="0.85" /></svg>`
                                : `<svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>`;
                            return `<button onclick="openCustomerProfile('${guest.dni}', '${guest.nombre.replace(/'/g, "\\'")}')" class="${btnClass}" title="${btnTitle}">${svgHtml}</button>`;
                        })() : ''}
                        <button onclick="openEditGuestModal(${groupIndex}, ${guestIndex})" class="text-slate-300 hover:text-blue-500 transition-colors mr-2" title="Editar Info"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                        ${guest.note ? `<div class="relative group/note inline-block mr-2"><button onclick="toggleGuestNote(${groupIndex}, ${guestIndex})" class="text-amber-400 hover:text-amber-600 transition-colors"><svg class="w-4 h-4 inline" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg></button><div class="absolute bottom-full right-0 mb-1.5 w-max max-w-[180px] bg-slate-800 text-white text-[10px] font-semibold rounded-lg px-2.5 py-1.5 shadow-lg opacity-0 group-hover/note:opacity-100 transition-opacity pointer-events-none z-50 whitespace-pre-wrap break-words">${guest.note}</div></div>` : `<button onclick="toggleGuestNote(${groupIndex}, ${guestIndex})" title="Añadir nota" class="text-slate-200 hover:text-amber-400 transition-colors mr-2"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg></button>`}
                        <button onclick="removeGuest(${groupIndex}, ${guestIndex})" class="text-slate-300 hover:text-red-500 transition-colors" title="Eliminar Cliente"><svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                    </td>
                </tr>
            `;
        });

        html += `
                <tr class="bg-blue-50/30 focus-within:z-50 relative add-guest-row">
                    <td class="p-3 text-center text-blue-400 text-sm font-black">+</td>
                    <td colspan="6" class="p-2 relative">
                        <input type="text" id="search-${groupIndex}" class="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Buscar cliente por DNI o Nombre... (o presiona Enter para manual)" oninput="searchCustomers(${groupIndex}, this.value)" onkeydown="checkEnter(event, ${groupIndex})" onfocus="window._activeSearchGroupIdx = ${groupIndex}" autocomplete="off" onblur="setTimeout(() => { const d = document.getElementById('global-autocomplete'); if(d) d.classList.add('hidden'); }, 200)">
                    </td>
                </tr>
        `;
        html += `</tbody></table></div>`;
        groupDiv.innerHTML = html;
        container.appendChild(groupDiv);
    });
    
    // Automatically saves instantly after the UI updates
    if (!skipAutoSave) {
        triggerInstantSave(); 
    }
}

function addGroup() { if(!window.isLoggedIn) return; activeBoatItem.groups.push({ guide: '', apoyo: '', guests: [] }); renderGroups(); }

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

// --- CUSTOM GUIDE/APOYO MODAL LOGIC ---
let pendingGuideGroupIdx = null;
let pendingGuideType = null; // 'guide' or 'apoyo'

window.openCustomGuideModal = function(groupIndex, type) {
    pendingGuideGroupIdx = groupIndex;
    pendingGuideType = type;
    
    const group = activeBoatItem.groups[groupIndex];
    let defaultName = '';
    let defaultDni = '';
    
    if (type === 'guide') {
        document.getElementById('custom-guide-title').innerHTML = `
            <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            Escribe el nombre personalizado del guía:
        `;
        document.getElementById('custom-guide-name-label').innerText = 'Nombre del Guía';
        if (group.guide && group.guide !== 'CUSTOM_NAME_PROMPT') {
            defaultName = group.guide;
            defaultDni = group.guideDni || '';
        }
    } else {
        document.getElementById('custom-guide-title').innerHTML = `
            <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            Escribe el nombre personalizado del apoyo:
        `;
        document.getElementById('custom-guide-name-label').innerText = 'Nombre del Apoyo';
        if (group.apoyo && group.apoyo !== 'CUSTOM_NAME_PROMPT') {
            defaultName = group.apoyo;
            defaultDni = group.apoyoDni || '';
        }
    }
    
    document.getElementById('custom-guide-name-input').value = defaultName;
    document.getElementById('custom-guide-dni-input').value = defaultDni;
    
    document.getElementById('custom-guide-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('custom-guide-name-input').focus(), 50);
};

window.closeCustomGuideModal = function() {
    document.getElementById('custom-guide-modal').classList.add('hidden');
    pendingGuideGroupIdx = null;
    pendingGuideType = null;
    renderGroups(); // Refresh select dropdowns
};

window.confirmCustomGuideModal = function() {
    if (pendingGuideGroupIdx === null || !pendingGuideType) return;
    const name = document.getElementById('custom-guide-name-input').value.trim();
    const dni = document.getElementById('custom-guide-dni-input').value.trim();
    
    if (name) {
        const group = activeBoatItem.groups[pendingGuideGroupIdx];
        if (pendingGuideType === 'guide') {
            group.guide = name;
            group.guideDni = dni || '';
        } else {
            group.apoyo = name;
            group.apoyoDni = dni || '';
        }
    }
    
    document.getElementById('custom-guide-modal').classList.add('hidden');
    pendingGuideGroupIdx = null;
    pendingGuideType = null;
    
    renderGroups();
    renderCaptainDropdown();
    triggerAutoSave();
};

function updateGuide(groupIndex, value) { 
    if (value === "CUSTOM_NAME_PROMPT") {
        window.openCustomGuideModal(groupIndex, 'guide');
        return;
    } else {
        activeBoatItem.groups[groupIndex].guide = value; 
        if (activeBoatItem.groups[groupIndex].guideDni) {
            delete activeBoatItem.groups[groupIndex].guideDni;
        }
    }
    renderGroups();
    renderCaptainDropdown();
    triggerAutoSave();
}

function updateApoyo(groupIndex, value) {
    if (value === "CUSTOM_NAME_PROMPT") {
        window.openCustomGuideModal(groupIndex, 'apoyo');
        return;
    } else {
        activeBoatItem.groups[groupIndex].apoyo = value;
        if (activeBoatItem.groups[groupIndex].apoyoDni) {
            delete activeBoatItem.groups[groupIndex].apoyoDni;
        }
    }
    renderGroups();
    renderCaptainDropdown();
    triggerAutoSave();
}

window.clearGuide = function(groupIndex) {
    activeBoatItem.groups[groupIndex].guide = '';
    renderGroups();
    renderCaptainDropdown();
    triggerAutoSave();
};

window.clearApoyo = function(groupIndex) {
    activeBoatItem.groups[groupIndex].apoyo = '';
    renderGroups();
    renderCaptainDropdown();
    triggerAutoSave();
};

window.clearCaptain = function() {
    activeBoatItem.captain = '';
    renderCaptainDropdown();
    renderGroups();
    triggerAutoSave();
};

window.toggleRmLocked = function(checked) {
    if (!activeBoatItem) return;
    activeBoatItem.rmLocked = checked;
    
    // Propagate state instantly in RAM
    const trip = mergedAllocations.find(t => t.id === activeBoatItem.id);
    if (trip) trip.rmLocked = checked;
    
    const intTrip = (window.internalTrips || []).find(t => t.id === activeBoatItem.id);
    if (intTrip) intTrip.rmLocked = checked;

    if (typeof window.renderDailyGrid === 'function') {
        window.renderDailyGrid();
    }
    window.triggerAutoSave();
};

function removeGuest(groupIndex, guestIndex) { 
    if(!window.isLoggedIn) return;
    const dni = activeBoatItem.groups[groupIndex].guests[guestIndex].dni;
    activeBoatItem.groups[groupIndex].guests.splice(guestIndex, 1); 
    updateModalSubtitle(); 
    renderGroups(); // Has to re-render because it changes the table layout
    if (dni && window.cleanOrphanedInsurance) setTimeout(() => window.cleanOrphanedInsurance(dni), 1500);
    triggerAutoSave();
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
        const gasColor = isNitrox ? 'bg-green-500 text-white border-green-600 font-black' : 'bg-blue-50 text-blue-600 border-blue-200';
        btn.className = `w-14 h-7 flex justify-center items-center rounded border text-[10px] font-black transition-colors shrink-0 ${gasColor}`;
        btn.innerText = nextGas.replace('Aire', 'Aire').replace(/EAN\s*(\d+)/i, '$1%');
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
        let rentalClass = 'bg-diagonal-yellow text-slate-300 border-yellow-200';
        if (nextRental === 1) { rentalClass = 'bg-half-yellow border-yellow-400 text-yellow-800'; }
        if (nextRental === 2) { rentalClass = 'bg-full-yellow border-yellow-500 text-yellow-900'; }
        btn.className = `w-8 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black shrink-0 ${rentalClass}`;
        btn.innerHTML = 'Eq';
    }
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    if (guest.dni) {
        window.propagateEquipmentInRAM(guest.dni, { rental: nextRental });
    }
    triggerInstantSave();
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
    triggerInstantSave();
};

window.toggleArrived = function(groupIndex, guestIndex) {
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    
    // Cycle: White/Default -> Green/Arrived -> Red/Cancelled -> White/Default
    if (!guest.arrived && !guest.cancelled) {
        guest.arrived = true;
        guest.cancelled = false;
    } else if (guest.arrived) {
        guest.arrived = false;
        guest.cancelled = true;
    } else {
        guest.arrived = false;
        guest.cancelled = false;
    }

    // Targeted DOM update — no full re-render needed
    const btn = document.getElementById(`btn-arrived-${groupIndex}-${guestIndex}`);
    if (btn) {
        if (guest.cancelled) {
            btn.className = `w-5 h-5 rounded-full border-2 transition-all duration-200 shrink-0 mr-2 bg-red-500 border-red-600 shadow-[0_0_0_3px_rgba(239,68,68,0.25)] shadow-red-200`;
            btn.title = 'Cancelado — Click para desmarcar';
        } else if (guest.arrived) {
            btn.className = `w-5 h-5 rounded-full border-2 transition-all duration-200 shrink-0 mr-2 bg-emerald-500 border-emerald-600 shadow-[0_0_0_3px_rgba(16,185,129,0.25)] shadow-emerald-200`;
            btn.title = 'Llegado ✔ — Click para cancelar';
        } else {
            btn.className = `w-5 h-5 rounded-full border-2 transition-all duration-200 shrink-0 mr-2 bg-white border-slate-300 hover:border-emerald-400 hover:shadow-[0_0_0_2px_rgba(16,185,129,0.15)]`;
            btn.title = 'Marcar como llegado';
        }
    }

    // Also update the row background for a nice visual cue
    const row = document.getElementById(`guest-row-${groupIndex}-${guestIndex}`);
    if (row) {
        if (guest.cancelled) {
            row.classList.add('bg-red-50/40');
            row.classList.remove('bg-emerald-50/40', 'hover:bg-slate-50');
        } else if (guest.arrived) {
            row.classList.add('bg-emerald-50/40');
            row.classList.remove('bg-red-50/40', 'hover:bg-slate-50');
        } else {
            row.classList.remove('bg-emerald-50/40', 'bg-red-50/40');
            row.classList.add('hover:bg-slate-50');
        }
    }

    // Update modal subtitle dynamically to reflect new counts
    updateModalSubtitle();

    triggerInstantSave();
};

window.toggleComputer = function(groupIndex, guestIndex) {
    if(!window.isLoggedIn) return;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    if (guest.computer === 'INC') {
        guest.computer = 0;
        guest.computerPrice = 0;
    } else {
        guest.computer = guest.computer ? 0 : 1;
    }

    // Auto-look up the price from the price list
    const compPriceItem = (window.dynamicPrices || []).find(p => 
        p.name && p.name.toLowerCase().includes('ordenador')
    );
    guest.computerPrice = compPriceItem ? compPriceItem.price : 7; // fallback 7€

    // Targeted DOM Update
    const btn = document.getElementById(`btn-comp-${groupIndex}-${guestIndex}`);
    if (btn) {
        let compClass = 'bg-slate-50 text-slate-300 border-slate-200 hover:bg-slate-100';
        let compText = 'Comp';
        if (guest.computer === 1) { compClass = 'bg-cyan-500 text-white border-cyan-600 font-black shadow-inner'; }
        if (guest.computer === 'INC') { compClass = 'bg-emerald-500 text-white border-emerald-600 font-black shadow-inner'; compText = 'INC'; }
        
        btn.className = `w-10 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black shrink-0 ${compClass}`;
        btn.innerText = compText;
    }
    if (guest.dni) {
        window.propagateEquipmentInRAM(guest.dni, { computer: guest.computer, computerPrice: guest.computer ? guest.computerPrice : 0 });
    }
    triggerInstantSave();
};
let activeInsGroup = null;
let activeInsGuest = null;

window.cleanOrphanedInsurance = async function(dni) {
    try {
        const profile = customerDatabase.find(c => c.dni === dni);
        if (!profile || !profile.insurance) return;

        // ONLY clean up short-term daily (1D) or weekly (1W) insurances if orphaned
        let insType = '';
        if (typeof profile.insurance === 'string') {
            insType = profile.insurance;
        } else if (profile.insurance && profile.insurance.type) {
            insType = profile.insurance.type;
        }
        insType = insType.toString().replace(' ✔', '');
        if (insType !== '1D' && insType !== '1W') return;

        const snap = await db.collection('mangamar_customers').doc(dni).collection('history').get();
        let hasValidDive = false;
        snap.forEach(doc => {
            const d = doc.data();
            const cleanDIns = (d.insurance || '').toString().replace(' ✔', '');
            const cleanProfileIns = (profile.insurance.type || '').toString().replace(' ✔', '');
            if (cleanDIns === cleanProfileIns) {
                // Check if the dive falls inside the exact window of THIS specific purchase
                if (profile.insurance.purchaseDate) {
                    if (d.date >= profile.insurance.purchaseDate && d.date <= window.normalizeDateStr(profile.insurance.expiry)) hasValidDive = true;
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
    
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    let insRaw = guest.insurance || '';
    if (insRaw && typeof insRaw === 'object') {
        insRaw = insRaw.type || '';
    }
    const ins = insRaw.toString();
    const hasAnyIns = hasGlobal || (ins && ins !== '0' && ins !== '0 ✔');
    
    const popup = document.getElementById('ins-popup');
    const removeCont = document.getElementById('ins-popup-remove-container');
    if (removeCont) {
        if (hasAnyIns) removeCont.classList.remove('hidden');
        else removeCont.classList.add('hidden');
    }

    const tramitarCont = document.getElementById('ins-popup-tramitar-container');
    const tramitarBtn = document.getElementById('btn-ins-popup-tramitar');
    
    if (tramitarCont && tramitarBtn) {
        const isTempIns = ['1D', '1W', '1M', '1Y'].some(type => ins.startsWith(type));
        
        if (isTempIns) {
            tramitarCont.classList.remove('hidden');
            if (ins.includes('✔')) {
                tramitarBtn.innerHTML = `🟠 Desmarcar Compra`;
                tramitarBtn.className = "w-full text-left px-2 py-2 text-xs font-black text-amber-600 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-2";
            } else {
                tramitarBtn.innerHTML = `✅ Marcar Comprado`;
                tramitarBtn.className = "w-full text-left px-2 py-2 text-xs font-black text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-2";
            }
        } else {
            tramitarCont.classList.add('hidden');
        }
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
        if (guest.dni) {
            const newIns = { type: 'Propio ✔', expiry: '2099-12-31', purchaseDate: activeBoatItem.date };
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
    window.updateGuestInsuranceButton(activeInsGroup, activeInsGuest);
    
    if (guest.dni) {
        window.propagateEquipmentInRAM(guest.dni, { insurance: guest.insurance });
    }
    triggerAutoSave();
};

window.updateGuestInsuranceButton = function(groupIndex, guestIndex) {
    const btn = document.getElementById(`btn-ins-${groupIndex}-${guestIndex}`);
    if (!btn) return;
    
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    if (!guest) return;
    
    let globalIns = null;
    let isInsExpired = false;
    if (guest.dni && !guest.course) {
        const profile = customerDatabase.find(c => c.dni === guest.dni);
        if (profile && profile.insurance) {
            globalIns = profile.insurance;
            const expiryStr = window.normalizeDateStr(globalIns.expiry);
            if (expiryStr < activeBoatItem.date) {
                isInsExpired = true;
            }
        }
    }
    
    let insRaw = guest.insurance || 0;
    if (insRaw && typeof insRaw === 'object') {
        insRaw = insRaw.type || 0;
    }
    let insVal = insRaw.toString();
    let cleanIns = insVal.replace(' ✔', '');
    
    if (globalIns) {
        let displayVal = 'Seg ✓';
        if (isInsExpired) {
            displayVal = 'Seg 🛑';
            btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-red-500 text-white border-red-600 hover:bg-red-600 cursor-pointer shrink-0 whitespace-nowrap";
            btn.innerText = displayVal;
            btn.title = `Seguro CADUCADO el ${window.formatInsuranceDate(globalIns.expiry)} (${cleanIns})`;
        } else {
            const isTemp = ['1D', '1W', '1M', '1Y'].includes(cleanIns);
            if (isTemp) {
                const isBought = insVal.includes(' ✔');
                if (isBought) {
                    displayVal = `Seg ✓ (${cleanIns})`;
                    btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner hover:bg-emerald-600 cursor-pointer shrink-0 whitespace-nowrap";
                    btn.innerText = displayVal;
                    btn.title = `Seguro Activo hasta ${window.formatInsuranceDate(globalIns.expiry)} (${cleanIns}) (Comprado)`;
                } else {
                    displayVal = `Seg (${cleanIns})`;
                    btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-orange-500 text-white border-orange-600 shadow-inner hover:bg-orange-600 cursor-pointer shrink-0 whitespace-nowrap";
                    btn.innerText = displayVal;
                    btn.title = `Seguro Activo hasta ${window.formatInsuranceDate(globalIns.expiry)} (${cleanIns}) (Pendiente de comprar)`;
                }
            } else {
                displayVal = 'Seg ✓';
                btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner hover:bg-emerald-600 cursor-pointer shrink-0 whitespace-nowrap";
                btn.innerText = displayVal;
                btn.title = `Seguro Activo hasta ${window.formatInsuranceDate(globalIns.expiry)} (${globalIns.type})`;
            }
        }
    } else {
        if (cleanIns === 'INC') {
            btn.className = "w-8 h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0";
            btn.innerText = "INC";
            btn.title = "Seguro Incluido";
        } else if (cleanIns !== '0' && cleanIns !== 0) {
            const isTemp = ['1D', '1W', '1M', '1Y'].includes(cleanIns);
            if (isTemp) {
                const isBought = insVal.includes(' ✔');
                if (isBought) {
                    let displayVal = `Seg ✓ (${cleanIns})`;
                    btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0 whitespace-nowrap cursor-pointer hover:bg-emerald-600";
                    btn.innerText = displayVal;
                    btn.title = `Seguro: ${cleanIns} (Comprado)`;
                } else {
                    let displayVal = `Seg (${cleanIns})`;
                    btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-orange-500 text-white border-orange-600 shadow-inner shrink-0 whitespace-nowrap cursor-pointer hover:bg-orange-600";
                    btn.innerText = displayVal;
                    btn.title = `Seguro: ${cleanIns} (Pendiente de comprar)`;
                }
            } else {
                let displayVal = 'Seg ✓';
                btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-black bg-emerald-500 text-white border-emerald-600 shadow-inner shrink-0 whitespace-nowrap cursor-pointer hover:bg-emerald-600";
                btn.innerText = displayVal;
                btn.title = `Seguro: ${cleanIns} (Activo)`;
            }
        } else {
            btn.className = "px-1.5 min-w-[32px] h-7 flex justify-center items-center rounded border transition-colors text-[10px] font-bold bg-red-500 text-white border-red-600 hover:bg-red-600 shrink-0 whitespace-nowrap cursor-pointer";
            btn.innerText = "Seg 🛑";
            btn.title = "Falta Seguro";
        }
    }
};

window.openSeguroPropioModal = function() {
    // Hide the dropdown menu list
    document.getElementById('ins-popup').classList.add('hidden');
    
    if (activeInsGroup === null || activeInsGuest === null) return;
    
    const guest = activeBoatItem.groups[activeInsGroup].guests[activeInsGuest];
    if (!guest) return;
    
    // Default initial form values
    let typeVal = "";
    let expVal = "";
    
    if (guest.dni) {
        const profile = customerDatabase.find(c => c.dni === guest.dni);
        if (profile && profile.insurance) {
            typeVal = profile.insurance.type || "";
            if (profile.insurance.expiry) {
                expVal = window.normalizeDateStr(profile.insurance.expiry);
            }
        } else if (guest.insurance && guest.insurance !== '0' && guest.insurance !== 0) {
            let currentIns = guest.insurance;
            if (typeof currentIns === 'object') {
                typeVal = currentIns.type || "";
                if (currentIns.expiry) {
                    expVal = window.normalizeDateStr(currentIns.expiry);
                }
            } else {
                typeVal = currentIns.toString();
            }
        }
    } else if (guest.insurance && guest.insurance !== '0' && guest.insurance !== 0) {
        let currentIns = guest.insurance;
        if (typeof currentIns === 'object') {
            typeVal = currentIns.type || "";
            if (currentIns.expiry) {
                expVal = window.normalizeDateStr(currentIns.expiry);
            }
        } else {
            typeVal = currentIns.toString();
        }
    }
    
    document.getElementById('seguro-propio-tipo').value = typeVal;
    document.getElementById('seguro-propio-expiracion').value = expVal;
    
    // Show the modal
    document.getElementById('seguro-propio-modal').classList.remove('hidden');
};

window.closeSeguroPropioModal = function() {
    document.getElementById('seguro-propio-modal').classList.add('hidden');
};

window.saveSeguroPropioChanges = async function() {
    const type = document.getElementById('seguro-propio-tipo').value.trim();
    const expiry = document.getElementById('seguro-propio-expiracion').value;
    
    if (activeInsGroup === null || activeInsGuest === null) {
        closeSeguroPropioModal();
        return;
    }
    
    const guest = activeBoatItem.groups[activeInsGroup].guests[activeInsGuest];
    if (!guest) {
        closeSeguroPropioModal();
        return;
    }
    
    if (!type) {
        // If type is left blank, remove/clear insurance just like 'Remove' action
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
                        masterDocRef.set({ clients }, { merge: true }).catch(e => console.error("Error saving master list:", e));
                    }
                }
            });
            const profile = customerDatabase.find(c => c.dni === guest.dni);
            if (profile) delete profile.insurance;
        }
    } else {
        guest.insurance = type;
        if (guest.dni) {
            const newIns = { type, expiry, purchaseDate: activeBoatItem.date };
            
            // Update local memory database
            const profile = customerDatabase.find(c => c.dni === guest.dni);
            if (profile) profile.insurance = newIns;
            
            // Save to Firestore for this customer
            db.collection('mangamar_customers').doc(guest.dni).set({ insurance: newIns }, { merge: true }).catch(e => console.error("Error saving insurance to Firestore:", e));
            
            // Update master_list
            const masterDocRef = db.collection('mangamar_directory').doc('master_list');
            masterDocRef.get().then(doc => {
                if (doc.exists) {
                    let clients = doc.data().clients || [];
                    let idx = clients.findIndex(c => c.dni === guest.dni);
                    if (idx > -1) {
                        clients[idx].insurance = newIns;
                        masterDocRef.set({ clients }, { merge: true }).catch(e => console.error("Error saving master list:", e));
                    }
                }
            });
        }
    }
    
    // Propagate equipment changes if applicable
    if (guest.dni && typeof window.propagateEquipmentInRAM === 'function') {
        window.propagateEquipmentInRAM(guest.dni, { insurance: guest.insurance });
    }
    
    // Refresh customer profile (diver's ficha) UI if it's currently open!
    if (guest.dni && window.activeFichaDni === guest.dni && typeof window.openCustomerProfile === 'function') {
        const currentTab = (document.getElementById('tab-content-caja') && !document.getElementById('tab-content-caja').classList.contains('hidden')) ? 'caja' : 'historial';
        window.openCustomerProfile(guest.dni, guest.nombre, false, currentTab);
    }
    
    // Targeted DOM Update for the grid button
    window.updateGuestInsuranceButton(activeInsGroup, activeInsGuest);
    
    // Auto-save changes
    if (typeof triggerAutoSave === 'function') {
        triggerAutoSave();
    }
    
    closeSeguroPropioModal();
};

window.toggleTramitado = function() {
    document.getElementById('ins-popup').classList.add('hidden');
    if (activeInsGroup === null || activeInsGuest === null) return;
    
    const guest = activeBoatItem.groups[activeInsGroup].guests[activeInsGuest];
    let insRaw = guest.insurance || '';
    if (insRaw && typeof insRaw === 'object') {
        insRaw = insRaw.type || '';
    }
    let ins = insRaw.toString();
    if (!ins) return;

    let newInsVal = '';
    if (ins.includes('✔')) {
        newInsVal = ins.replace(' ✔', '');
    } else {
        newInsVal = `${ins} ✔`;
    }
    guest.insurance = newInsVal;

    // Sync state back to CRM customer profile in Firestore & local customerDatabase if DNI exists
    if (guest.dni) {
        const profile = customerDatabase.find(c => c.dni === guest.dni);
        if (profile) {
            let [y, m, d] = activeBoatItem.date.split('-').map(Number);
            let dateObj = new Date(y, m - 1, d);
            const cleanType = newInsVal.replace(' ✔', '');
            
            if (cleanType === '1D') dateObj.setDate(dateObj.getDate() + 0);
            if (cleanType === '1W') dateObj.setDate(dateObj.getDate() + 6);
            if (cleanType === '1M') dateObj.setMonth(dateObj.getMonth() + 1);
            if (cleanType === '1Y') dateObj.setFullYear(dateObj.getFullYear() + 1);
            
            const expiry = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
            
            if (!newInsVal.includes('✔')) {
                // If unmarked as purchased, set expiry to past to represent expired/unpurchased state
                profile.insurance = { type: cleanType, expiry: '1970-01-01', purchaseDate: activeBoatItem.date };
            } else {
                // Marked as purchased, set valid future expiry!
                profile.insurance = { type: newInsVal, expiry, purchaseDate: activeBoatItem.date };
            }
            
            // Save to Firestore mangamar_customers
            db.collection('mangamar_customers').doc(guest.dni).set({
                insurance: profile.insurance
            }, { merge: true }).catch(e => console.error("Error updating CRM insurance:", e));
            
            // Save to master_list directory
            const masterDocRef = db.collection('mangamar_directory').doc('master_list');
            masterDocRef.get().then(doc => {
                if (doc.exists) {
                    let clients = doc.data().clients || [];
                    let idx = clients.findIndex(c => c.dni === guest.dni);
                    if (idx > -1) {
                        clients[idx].insurance = profile.insurance;
                        masterDocRef.set({ clients }, { merge: true });
                    }
                }
            });
        }
    }

    // Targeted DOM Update
    window.updateGuestInsuranceButton(activeInsGroup, activeInsGuest);
    
    if (guest.dni) {
        window.propagateEquipmentInRAM(guest.dni, { insurance: newInsVal });
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
    const dropdown = getGlobalDropdown();
    const normQuery = window.normalizeSearchString(query);
    if (normQuery.length < 2) { dropdown.classList.add('hidden'); return; }

    const results = customerDatabase.filter(c => {
        const fullName = window.normalizeSearchString(getFullName(c));
        return fullName.includes(normQuery) || window.checkDniMatch(c.dni, normQuery);
    });

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="px-4 py-2 text-xs text-slate-500 italic">No encontrado</div>`;
    } else {
        dropdown.innerHTML = results.map(c => {
            const fullName = getFullName(c);
            const conflict = checkDiverConflict(c.dni, fullName, groupIndex, guestIndex);
            if (conflict.conflict) {
                return `<div class="px-3 py-2 bg-slate-50 border-b border-slate-100 opacity-60 cursor-not-allowed flex justify-between items-center">
                    <div>
                        <div class="font-bold text-slate-500 text-xs">${fullName}</div>
                        <div class="text-[10px] text-slate-400">${c.titulacion || '-'} • ${c.dni}</div>
                    </div>
                </div>`;
            } else {
                const encodedData = encodeURIComponent(JSON.stringify(c));
                return `<div class="px-3 py-2 bg-white hover:bg-blue-50 cursor-pointer border-b border-slate-100 text-left global-ac-item" onmousedown="executeRelink(${groupIndex}, ${guestIndex}, '${encodedData}')">
                    <div class="font-bold text-slate-800 text-xs">${fullName}</div>
                    <div class="text-[10px] text-slate-500">${c.titulacion || '-'} • ${c.dni}</div>
                </div>`;
            }
        }).join('');
    }

    const inputRect = document.getElementById(`relink-${groupIndex}-${guestIndex}`).getBoundingClientRect();
    dropdown.style.top = inputRect.bottom + 'px';
    dropdown.style.left = inputRect.left + 'px';
    dropdown.style.width = inputRect.width + 'px';
    dropdown.classList.remove('hidden');
}

function checkRelinkEnter(event, groupIndex, guestIndex) {
    const dropdown = document.getElementById('global-autocomplete');
    const items = dropdown && !dropdown.classList.contains('hidden') ? Array.from(dropdown.querySelectorAll('.global-ac-item')) : [];

    if (items.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        let focusedIdx = items.findIndex(el => el.classList.contains('bg-blue-100'));
        if(focusedIdx > -1) {
            items[focusedIdx].classList.remove('bg-blue-100');
            items[focusedIdx].classList.add('bg-white');
        }
        
        if (event.key === 'ArrowDown') focusedIdx = (focusedIdx + 1) % items.length;
        if (event.key === 'ArrowUp') focusedIdx = (focusedIdx - 1 + items.length) % items.length;
        
        items[focusedIdx].classList.remove('bg-white');
        items[focusedIdx].classList.add('bg-blue-100');
        items[focusedIdx].scrollIntoView({ block: "nearest" });
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        if (items.length > 0) {
            let focusedItem = items.find(el => el.classList.contains('bg-blue-100'));
            if (focusedItem) focusedItem.dispatchEvent(new MouseEvent('mousedown'));
            else items[0].dispatchEvent(new MouseEvent('mousedown'));
        }
    }
}

window.executeRelink = async function(groupIndex, guestIndex, encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const fullName = [data.nombre, data.apellido].filter(Boolean).join(' ').trim();
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    
    // Save the old name and tempId to sync across other boats and groups
    const oldNameLower = guest.nombre ? guest.nombre.toLowerCase() : null;
    const guestTempId = guest.tempId || null;

    const tag = findActiveTagForGuest(data.dni, fullName); // Auto-sync group!
    guest.nombre = window.getFirstAndLastName(fullName); guest.titulacion = data.titulacion || ''; guest.telefono = data.telefono || ''; 
    guest.email = data.email || ''; guest.dni = data.dni || ''; guest.isManual = !window.isProfileComplete(data); guest.isRelinking = false;
    if (tag) guest.bookingTag = tag;
    if (guestTempId) delete guest.tempId;
    
    // Determine which months we need to sync based on Global Group overlap
    const monthsToFetch = new Set();
    monthsToFetch.add(activeBoatItem.date.substring(0, 7)); // Current month always
    
    console.log("[executeRelink] Starting relink for", fullName, "guestTempId:", guestTempId, "oldName:", oldNameLower);
    
    // --- 1. SYNC TO GLOBAL GROUPS ---
    if (window.globalGroups) {
        const matchTarget = guestTempId || (oldNameLower ? (typeof window.normalizeSearchString === 'function' ? window.normalizeSearchString(oldNameLower) : oldNameLower.trim()) : null);
        console.log("[executeRelink] matchTarget for Global Groups:", matchTarget);
        
        window.globalGroups.forEach(grp => {
            if (grp.members && matchTarget) {
                // Check if the group contains the old name/tempId
                const matchFound = grp.members.some(m => {
                    if (guestTempId && m === guestTempId) return true;
                    if (!guestTempId && m.toLowerCase().startsWith('temp_')) return false; // Don't text-match against tempIds
                    const normM = typeof window.normalizeSearchString === 'function' ? window.normalizeSearchString(m) : m.trim().toLowerCase();
                    return normM === matchTarget;
                });
                
                if (matchFound) {
                    console.log("[executeRelink] Found in Global Group:", grp.name, "Start:", grp.startDate, "End:", grp.endDate);
                    // It's in this group! Add its start/end months to our fetch list to guarantee cross-month sync
                    if (grp.startDate) monthsToFetch.add(grp.startDate.substring(0, 7));
                    if (grp.endDate) monthsToFetch.add(grp.endDate.substring(0, 7));
 
                    grp.members = grp.members.filter(m => {
                        if (guestTempId && m === guestTempId) return false;
                        if (!guestTempId && m.toLowerCase().startsWith('temp_')) return true;
                        const normM = typeof window.normalizeSearchString === 'function' ? window.normalizeSearchString(m) : m.trim().toLowerCase();
                        return normM !== matchTarget;
                    });
                    if (!grp.members.includes(data.dni)) grp.members.push(data.dni);
                    if (window.saveGlobalGroup) window.saveGlobalGroup(grp);
                }
            }
        });
    }

    // --- 2. SYNC ACROSS ALL REQUIRED MONTHS ---
    if ((guestTempId || oldNameLower) && typeof db !== 'undefined') {
        const matchTarget = guestTempId || (typeof window.normalizeSearchString === 'function' ? window.normalizeSearchString(oldNameLower) : oldNameLower.trim());
        
        for (const monthStr of monthsToFetch) {
            let tripsToCheck = [];
            
            // If it's the current month, use the in-memory array to be fast and safe
            if (monthStr === activeBoatItem.date.substring(0, 7) && window.internalTrips) {
                tripsToCheck = JSON.parse(JSON.stringify(window.internalTrips.filter(t => t.date && t.date.substring(0, 7) === monthStr)));
            } else {
                // Background fetch the adjacent month!
                console.log("[executeRelink] Fetching adjacent month:", monthStr);
                try {
                    const doc = await db.collection('mangamar_monthly').doc(monthStr).get();
                    if (doc.exists && doc.data().allocations) {
                        const monthData = doc.data().allocations;
                        tripsToCheck = [];
                        for (const tripId in monthData) {
                            tripsToCheck.push({ id: tripId, ...monthData[tripId] });
                        }
                    }
                } catch (e) { console.error("[executeRelink] Failed to fetch month", monthStr, e); }
            }

            let needsUpdate = false;
            const updates = {};

            tripsToCheck.forEach(clonedTrip => {
                if (clonedTrip.id === activeBoatItem.id) return;
                
                let tripChanged = false;
                
                clonedTrip.groups?.forEach(g => {
                    g.guests?.forEach(otherGuest => {
                        let isMatch = false;
                        if (guestTempId && otherGuest.tempId === guestTempId) {
                            isMatch = true;
                        } else if (data.dni && otherGuest.dni && window.normalizeDni(otherGuest.dni) === window.normalizeDni(data.dni)) {
                            isMatch = true;
                        } else if (matchTarget) {
                            const normOther = typeof window.normalizeSearchString === 'function' ? window.normalizeSearchString(otherGuest.nombre || '') : (otherGuest.nombre || '').trim().toLowerCase();
                            isMatch = (!otherGuest.dni && otherGuest.nombre && normOther === matchTarget);
                        }

                        if (isMatch) {
                            otherGuest.dni = data.dni || '';
                            otherGuest.nombre = window.getFirstAndLastName(fullName);
                            otherGuest.titulacion = data.titulacion || '';
                            otherGuest.telefono = data.telefono || '';
                            otherGuest.email = data.email || '';
                            otherGuest.isManual = !window.isProfileComplete(data);
                            if (tag) otherGuest.bookingTag = tag;
                            if (otherGuest.tempId) delete otherGuest.tempId;
                            tripChanged = true;
                        }
                    });
                });
                
                if (tripChanged) {
                    try {
                        const newFlatGuests = []; 
                        (clonedTrip.groups || []).forEach(g => {
                            if (g.guests && Array.isArray(g.guests)) {
                                newFlatGuests.push(...g.guests);
                            }
                        });
                        clonedTrip.guests = newFlatGuests;
                        updates[`allocations.${clonedTrip.id}`] = {
                            id: clonedTrip.id, date: clonedTrip.date, time: clonedTrip.time, assignedBoat: clonedTrip.assignedBoat,
                            site: clonedTrip.site, captain: clonedTrip.captain, groups: clonedTrip.groups, guests: clonedTrip.guests
                        };
                        needsUpdate = true;
                        
                        // Update in-memory models if it's the current month
                        if (monthStr === activeBoatItem.date.substring(0, 7)) {
                            if (window.mergedAllocations && Array.isArray(window.mergedAllocations)) {
                                const idx = window.mergedAllocations.findIndex(t => t.id === clonedTrip.id);
                                if (idx > -1) window.mergedAllocations[idx] = clonedTrip;
                            }
                            if (window.internalTrips && Array.isArray(window.internalTrips)) {
                                const idx2 = window.internalTrips.findIndex(t => t.id === clonedTrip.id);
                                if (idx2 > -1) window.internalTrips[idx2] = clonedTrip;
                            }
                        }
                    } catch (e) {
                        console.error("[executeRelink] Error flattening guests for trip", clonedTrip.id, e);
                    }
                }
            });
            
            if (needsUpdate) {
                // 🚨 SECONDARY FIX: Ensure history records are retroactively generated for these newly linked trips!
                const historyBatch = db.batch();
                let historyWrites = 0;
                
                Object.keys(updates).forEach(allocationKey => {
                    const clonedTrip = updates[allocationKey];
                    const linkedGuests = clonedTrip.guests.filter(g => g.dni === data.dni && !g.cancelled);
                    linkedGuests.forEach(g => {
                        const historyRef = db.collection('mangamar_customers').doc(data.dni).collection('history').doc(clonedTrip.id);
                        historyBatch.set(historyRef, {
                            date: clonedTrip.date,
                            time: clonedTrip.time,
                            site: clonedTrip.site,
                            assignedBoat: clonedTrip.assignedBoat,
                            gas: g.gas || '15L Aire',
                            rental: g.rental || 0,
                            computer: g.computer || 0,
                            computerPrice: g.computer ? (g.computerPrice || 7) : 0,
                            insurance: g.insurance || 0,
                            course: g.course || null,
                            baseCourse: g.baseCourse || null,
                            courseBadge: g.courseBadge || null,
                            coursePrice: g.coursePrice || 0,
                            hasBono: g.hasBono || false,
                            paymentStatus: g.paymentStatus || 'pending',
                            timestamp: firebase.firestore.FieldValue.serverTimestamp() 
                        }, { merge: true });
                        historyWrites++;
                    });
                });
                
                if (historyWrites > 0) {
                    historyBatch.commit().catch(e => console.error("[executeRelink] History batch FAILED", e));
                }

                db.collection('mangamar_monthly').doc(monthStr).update(updates).then(() => {
                    if (monthStr === activeBoatItem.date.substring(0, 7)) {
                        if (typeof renderDailyGrid === 'function') renderDailyGrid();
                        if (typeof renderMonthlyCalendar === 'function') renderMonthlyCalendar();
                    }
                }).catch(e => console.error("[executeRelink] Firebase update FAILED for", monthStr, e));
            }
        }
    }

    // --- 3. SYNC TO OTHER GROUPS IN *THIS* BOAT (just in case they are booked twice) ---
    activeBoatItem.groups.forEach((g, gIdx) => {
        g.guests.forEach((otherGuest, gstIdx) => {
            if (gIdx === groupIndex && gstIdx === guestIndex) return; // skip self
            
            let isMatch = false;
            if (guestTempId && otherGuest.tempId === guestTempId) {
                isMatch = true;
            } else if (data.dni && otherGuest.dni && window.normalizeDni(otherGuest.dni) === window.normalizeDni(data.dni)) {
                isMatch = true;
            } else if (oldNameLower) {
                const normOther = typeof window.normalizeSearchString === 'function' ? window.normalizeSearchString(otherGuest.nombre || '') : (otherGuest.nombre || '').trim().toLowerCase();
                const matchTarget = typeof window.normalizeSearchString === 'function' ? window.normalizeSearchString(oldNameLower) : oldNameLower.trim();
                isMatch = (!otherGuest.dni && otherGuest.nombre && normOther === matchTarget);
            }

            if (isMatch) {
                otherGuest.dni = data.dni || '';
                otherGuest.nombre = window.getFirstAndLastName(fullName);
                otherGuest.titulacion = data.titulacion || '';
                otherGuest.telefono = data.telefono || '';
                otherGuest.email = data.email || '';
                otherGuest.isManual = !window.isProfileComplete(data);
                if (tag) otherGuest.bookingTag = tag;
                if (otherGuest.tempId) delete otherGuest.tempId;
            }
        });
    });

    // 🚨 CLEANUP TEMPORARY CUSTOMER 🚨
    // Prevent the temporary "Cliente" profile from lingering in Dia de Hoy after linking a DNI
    if (guestTempId && typeof db !== 'undefined') {
        db.collection('mangamar_customers').doc(guestTempId).delete().catch(e => console.log("Silent temp cleanup fail", e));
        
        // Instantly remove from local RAM so Día de Hoy reflects the change immediately
        if (window.customerDatabase) {
            const tempIdx = window.customerDatabase.findIndex(c => c.dni === guestTempId);
            if (tempIdx > -1) window.customerDatabase.splice(tempIdx, 1);
        }
    }

    renderGroups();
    triggerAutoSave();
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
    document.getElementById('edit-g-dni').value = guest.dni || '';
    document.getElementById('edit-g-phone').value = guest.telefono || '';
    document.getElementById('edit-g-email').value = guest.email || '';

    document.getElementById('edit-guest-modal').classList.remove('hidden');
}

window.saveLocalGuestEdit = async function() {
    if(!editingLocalGuestInfo) return;
    const { groupIndex, guestIndex } = editingLocalGuestInfo;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    
    const modalName = window.formatNameStr(document.getElementById('edit-g-name').value.trim());
    const modalTit = document.getElementById('edit-g-tit').value.trim();
    const rawDni = document.getElementById('edit-g-dni').value.trim();
    const modalPhone = document.getElementById('edit-g-phone').value.trim();
    const modalEmail = document.getElementById('edit-g-email').value.trim();
    
    const normDni = window.normalizeDni(rawDni);
    
    const isEmptyValue = (val) => {
        if (!val) return true;
        const s = val.toString().trim();
        return s === '' || s === '-' || s === '---' || s.toLowerCase() === 'sin titulación' || s.toLowerCase() === 'sin titulacion';
    };
    
    if (normDni) {
        guest.dni = normDni;
        
        // 1. Check or create/update in CRM database
        let existingProfile = customerDatabase.find(c => window.normalizeDni(c.dni) === normDni);
        
        // Dynamic direct fetch from Firestore to always get the most complete registration ficha
        try {
            const doc = await db.collection('mangamar_customers').doc(normDni).get();
            if (doc.exists) {
                const dbData = doc.data();
                if (existingProfile) {
                    // DEFENSIVE MERGE: Only overwrite if dbData has non-empty values
                    Object.keys(dbData).forEach(key => {
                        const val = dbData[key];
                        if (!isEmptyValue(val)) {
                            existingProfile[key] = val;
                        }
                    });
                } else {
                    existingProfile = { dni: normDni, ...dbData };
                    customerDatabase.push(existingProfile);
                }
            }
        } catch (err) {
            console.error("Error fetching rich customer profile from Firestore:", err);
        }
        
        if (existingProfile) {
            // SMART INHERITANCE: Prioritize rich existing database info but fill gaps if user entered something new
            if (modalName && (isEmptyValue(existingProfile.nombre) || existingProfile.nombre.toLowerCase().includes('sin nombre'))) {
                existingProfile.nombre = modalName;
            }
            if (modalTit && isEmptyValue(existingProfile.titulacion)) {
                existingProfile.titulacion = modalTit;
            }
            if (modalPhone && isEmptyValue(existingProfile.telefono)) {
                existingProfile.telefono = modalPhone;
            }
            if (modalEmail && isEmptyValue(existingProfile.email)) {
                existingProfile.email = modalEmail;
            }
            
            // Assign rich database profile values back to the local guest (using first and last name only)
            const dbFullName = window.getFullName(existingProfile);
            guest.nombre = !isEmptyValue(dbFullName) ? window.getFirstAndLastName(dbFullName) : (modalName || guest.nombre);
            guest.titulacion = !isEmptyValue(existingProfile.titulacion) ? existingProfile.titulacion : (modalTit || guest.titulacion);
            guest.telefono = !isEmptyValue(existingProfile.telefono) ? existingProfile.telefono : (modalPhone || guest.telefono);
            guest.email = !isEmptyValue(existingProfile.email) ? existingProfile.email : (modalEmail || guest.email);
            
            // If the profile is fully complete (has phone & email), the red manual dot should disappear. Otherwise, it stays active!
            guest.isManual = !window.isProfileComplete(existingProfile);
            
            // Handle active insurance check
            if (existingProfile.insurance) {
                const insObj = existingProfile.insurance;
                const expiry = insObj.expiry ? window.normalizeDateStr(insObj.expiry) : '';
                const activeDate = activeBoatItem ? activeBoatItem.date : '';
                if (expiry && expiry >= activeDate) {
                    guest.insurance = insObj.type || 0;
                } else {
                    guest.insurance = 0; // Expired for this trip date
                }
            }
        } else {
            // Create a brand new skeleton profile in the CRM
            existingProfile = {
                dni: normDni,
                nombre: modalName || 'Sin Nombre',
                titulacion: modalTit,
                telefono: modalPhone,
                email: modalEmail
            };
            customerDatabase.push(existingProfile);
            
            guest.nombre = modalName;
            guest.titulacion = modalTit;
            guest.telefono = modalPhone;
            guest.email = modalEmail;
        }
        
        // 2. Sync to Firestore (mangamar_customers + master_list)
        db.collection('mangamar_customers').doc(normDni).set(existingProfile, { merge: true }).catch(e => console.error("Error saving customer to Firestore:", e));
        db.collection('mangamar_directory').doc('master_list').set({ clients: customerDatabase }, { merge: true }).catch(e => console.error("Error bg master sync:", e));
        
        // 3. Propagate this rich database info to all matching trip bookings month-wide in mergedAllocations
        let boatSyncPromises = [];
        mergedAllocations.forEach(trip => {
            let modified = false;
            if (trip.groups) {
                trip.groups.forEach(group => {
                    if (group.guests) {
                        group.guests.forEach(gst => {
                            if (gst.dni && window.normalizeDni(gst.dni) === normDni) {
                                // Inherit full details from profile
                                const dbFullName = window.getFullName(existingProfile);
                                const profileName = !isEmptyValue(dbFullName) ? window.getFirstAndLastName(dbFullName) : gst.nombre;
                                const profileTit = !isEmptyValue(existingProfile.titulacion) ? existingProfile.titulacion : gst.titulacion;
                                const profilePhone = !isEmptyValue(existingProfile.telefono) ? existingProfile.telefono : gst.telefono;
                                const profileEmail = !isEmptyValue(existingProfile.email) ? existingProfile.email : gst.email;
                                
                                let profileIns = gst.insurance || 0;
                                if (existingProfile.insurance) {
                                    const insObj = existingProfile.insurance;
                                    const expiry = insObj.expiry ? window.normalizeDateStr(insObj.expiry) : '';
                                    const activeDate = trip.date || '';
                                    if (expiry && expiry >= activeDate) {
                                        profileIns = insObj.type || 0;
                                    } else {
                                        profileIns = 0;
                                    }
                                }
                                
                                const expectedIsManual = !window.isProfileComplete(existingProfile);
                                if (gst.nombre !== profileName || gst.titulacion !== profileTit || gst.telefono !== profilePhone || gst.email !== profileEmail || gst.insurance !== profileIns || gst.isManual !== expectedIsManual) {
                                     gst.nombre = profileName;
                                     gst.titulacion = profileTit;
                                     gst.telefono = profilePhone;
                                     gst.email = profileEmail;
                                     gst.insurance = profileIns;
                                     gst.isManual = expectedIsManual;
                                     modified = true;
                                }
                            }
                        });
                    }
                });
            }
            if (modified) {
                // If active in editor UI, keep it synced in activeBoatItem
                if (activeBoatItem && activeBoatItem.id === trip.id) {
                    activeBoatItem.groups.forEach(g => {
                        if (g.guests) {
                            g.guests.forEach(gst => {
                                if (gst.dni && window.normalizeDni(gst.dni) === normDni) {
                                    const dbFullName = window.getFullName(existingProfile);
                                    gst.nombre = !isEmptyValue(dbFullName) ? window.getFirstAndLastName(dbFullName) : gst.nombre;
                                    gst.titulacion = !isEmptyValue(existingProfile.titulacion) ? existingProfile.titulacion : gst.titulacion;
                                    gst.telefono = !isEmptyValue(existingProfile.telefono) ? existingProfile.telefono : gst.telefono;
                                    gst.email = !isEmptyValue(existingProfile.email) ? existingProfile.email : gst.email;
                                    
                                    let profileIns = gst.insurance || 0;
                                    if (existingProfile.insurance) {
                                        const insObj = existingProfile.insurance;
                                        const expiry = insObj.expiry ? window.normalizeDateStr(insObj.expiry) : '';
                                        const activeDate = activeBoatItem.date || '';
                                        if (expiry && expiry >= activeDate) {
                                            profileIns = insObj.type || 0;
                                        } else {
                                            profileIns = 0;
                                        }
                                    }
                                    gst.insurance = profileIns;
                                    gst.isManual = !window.isProfileComplete(existingProfile);
                                }
                            });
                        }
                    });
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
            Promise.all(boatSyncPromises).catch(e => console.error("Error bg boat sync in guest edit:", e));
        }
    } else {
        guest.nombre = modalName;
        guest.titulacion = modalTit;
        guest.telefono = modalPhone;
        guest.email = modalEmail;
        guest.isManual = true;
        if (guest.hasOwnProperty('dni')) {
            delete guest.dni;
        }
    }
    
    document.getElementById('edit-guest-modal').classList.add('hidden');
    renderGroups(); 
    updateModalSubtitle();
    triggerAutoSave();
};

function getGlobalDropdown() {
    let dropdown = document.getElementById('global-autocomplete');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'global-autocomplete';
        dropdown.className = 'fixed bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 hidden max-h-64 overflow-y-auto z-[999999]';
        document.body.appendChild(dropdown);
    }
    return dropdown;
}

function searchCustomers(groupIndex, query) {
    const dropdown = getGlobalDropdown();
    const originalQuery = query.trim();
    const normQuery = window.normalizeSearchString(query);
    if (normQuery.length < 2) { dropdown.classList.add('hidden'); return; }

    const results = customerDatabase.filter(c => {
        const fullName = window.normalizeSearchString(getFullName(c));
        const apodoMatch = c.apodo && window.normalizeSearchString(c.apodo).includes(normQuery);
        return fullName.includes(normQuery) || apodoMatch || window.checkDniMatch(c.dni, normQuery);
    });

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="px-4 py-3 text-sm text-slate-500 italic">No encontrado.<br><span class="text-xs">Presiona <b>Enter</b> para añadir manualmente.</span></div>`;
        
        // DNI FALLBACK: If query looks like a DNI (≥6 alphanumeric chars), check Firestore directly
        const looksLikeDni = /^[0-9a-z]{6,}/i.test(query);
        if (looksLikeDni && typeof db !== 'undefined') {
            const tryDni = window.normalizeDni(query);
            db.collection('mangamar_customers').doc(tryDni).get()
                .then(doc => {
                    if (!doc.exists) {
                        // Try raw uppercase query as fallback in case it's stored differently
                        return db.collection('mangamar_customers').doc(query.toUpperCase()).get();
                    }
                    return doc;
                })
                .then(doc => {
                    if (!doc.exists) return;
                    const d = doc.data();
                    const nombre = d.nombre || '';
                    const tit = d.titulacion || '';
                    const dni = window.normalizeDni(d.dni || query);
                    // Add to local cache so future searches find it
                    if (!customerDatabase.find(c => window.normalizeDni(c.dni) === dni)) {
                        customerDatabase.push({ nombre, apellido: '', titulacion: tit, telefono: d.telefono || '', email: d.email || '', dni });
                    }
                    // Rebuild dropdown with found result
                    const conflict = checkDiverConflict(dni, nombre);
                    const encodedData = encodeURIComponent(JSON.stringify({ nombre, apellido: '', titulacion: tit, telefono: d.telefono || '', email: d.email || '', dni }));
                    dropdown.innerHTML = conflict.conflict
                        ? `<div class="px-4 py-3 bg-slate-50 opacity-60 text-sm font-bold text-slate-500">${nombre} <span class="text-xs">(En ${conflict.where})</span></div>`
                        : `<div class="px-4 py-3 bg-white hover:bg-blue-50 cursor-pointer text-sm font-bold text-slate-800 global-ac-item" onmousedown="selectCustomer(${groupIndex}, '${encodedData}')">${nombre}<div class="text-xs text-slate-500 font-medium">${tit} • ${dni}</div></div>`;
                    dropdown.classList.remove('hidden');
                })
                .catch(() => {});
        }
    } else {
        dropdown.innerHTML = results.map(c => {
            const fullName = getFullName(c);
            const conflict = checkDiverConflict(c.dni, fullName);
            
            if (conflict.conflict) {
                return `<div class="px-4 py-3 bg-slate-50 border-b border-slate-100 opacity-60 cursor-not-allowed flex justify-between items-center">
                    <div>
                        <div class="font-bold text-slate-500 text-sm">${fullName}</div>
                        <div class="text-xs text-slate-400 font-medium">${c.titulacion || '-'} • ${c.dni}</div>
                    </div>
                    <span class="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded">En ${conflict.where}</span>
                </div>`;
            } else {
                const encodedData = encodeURIComponent(JSON.stringify(c));
                return `<div class="px-4 py-3 bg-white hover:bg-blue-50 cursor-pointer border-b border-slate-100 transition-colors global-ac-item" onmousedown="selectCustomer(${groupIndex}, '${encodedData}')">
                    <div class="font-bold text-slate-800 text-sm">${fullName}</div>
                    <div class="text-xs text-slate-500 font-medium">${c.titulacion || '-'} • ${c.dni}</div>
                </div>`;
            }
        }).join('');
    }

    const inputRect = document.getElementById(`search-${groupIndex}`).getBoundingClientRect();
    dropdown.style.top = inputRect.bottom + 'px';
    dropdown.style.left = inputRect.left + 'px';
    dropdown.style.width = inputRect.width + 'px';
    dropdown.classList.remove('hidden');
}

window.selectCustomer = function(groupIndex, encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const fullName = getFullName(data);
    
    // --- SMART RELINK DETECTION ---
    // If the user uses the search bar to find someone who is ALREADY a manual guest on this boat,
    // intercept it and RELINK them instead of duplicating!
    let intercepted = false;
    for (let gIdx = 0; gIdx < activeBoatItem.groups.length; gIdx++) {
        for (let gstIdx = 0; gstIdx < activeBoatItem.groups[gIdx].guests.length; gstIdx++) {
            const gst = activeBoatItem.groups[gIdx].guests[gstIdx];
            if (!gst.dni && gst.nombre && gst.nombre.toLowerCase() === data.nombre.toLowerCase()) {
                window.executeRelink(gIdx, gstIdx, encodedData);
                intercepted = true;
                break;
            }
        }
        if (intercepted) break;
    }
    
    if (!intercepted) {
        const tag = findActiveTagForGuest(data.dni, fullName); // Auto-sync group!
        const existingData = typeof findExistingDiverData === 'function' ? findExistingDiverData(data.dni || fullName) : null;
        
        let localIns = 0;
        if (existingData && existingData.insurance !== undefined && existingData.insurance !== null) {
            localIns = existingData.insurance;
        } else if (data && data.insurance) {
            const insObj = data.insurance;
            const expiry = insObj.expiry ? window.normalizeDateStr(insObj.expiry) : '';
            const activeDate = activeBoatItem ? activeBoatItem.date : '';
            if (expiry && expiry >= activeDate) {
                localIns = insObj.type || 0;
            }
        }

        const newGuest = { 
            nombre: window.getFirstAndLastName(fullName), 
            titulacion: data.titulacion || '', 
            telefono: data.telefono || '', 
            email: data.email || '', 
            dni: data.dni || '', 
            gas: '15L Aire', 
            isManual: !window.isProfileComplete(data), 
            bookingTag: tag,
            insurance: localIns
        };

        if (existingData && existingData.course) {
            newGuest.baseCourse = existingData.baseCourse || existingData.course;
            newGuest.course = existingData.course;
            newGuest.courseBadge = existingData.courseBadge;
            newGuest.coursePrice = existingData.coursePrice;
        }
        if (existingData && existingData.localDeposit) newGuest.localDeposit = existingData.localDeposit;
        if (existingData && existingData.note) newGuest.note = existingData.note;
        if (existingData && existingData.rental) newGuest.rental = existingData.rental;
        if (existingData && existingData.gas) newGuest.gas = existingData.gas;
        if (existingData && existingData.computer) newGuest.computer = existingData.computer;
        if (existingData && existingData.computerPrice) newGuest.computerPrice = existingData.computerPrice;
        if (existingData && existingData.hasPaid) newGuest.hasPaid = existingData.hasPaid;

        activeBoatItem.groups[groupIndex].guests.push(newGuest);
        updateModalSubtitle(); renderGroups(); 
    }
    
    const d = document.getElementById('global-autocomplete'); if(d) d.classList.add('hidden');
};

function checkEnter(event, groupIndex) {
    const dropdown = getGlobalDropdown();
    const items = dropdown && !dropdown.classList.contains('hidden') ? Array.from(dropdown.querySelectorAll('.global-ac-item')) : [];

    if (items.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        let focusedIdx = items.findIndex(el => el.classList.contains('bg-blue-100'));
        if(focusedIdx > -1) {
            items[focusedIdx].classList.remove('bg-blue-100');
            items[focusedIdx].classList.add('bg-white');
        }
        
        if (event.key === 'ArrowDown') focusedIdx = (focusedIdx + 1) % items.length;
        if (event.key === 'ArrowUp') focusedIdx = (focusedIdx - 1 + items.length) % items.length;
        
        items[focusedIdx].classList.remove('bg-white');
        items[focusedIdx].classList.add('bg-blue-100');
        items[focusedIdx].scrollIntoView({ block: "nearest" });
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        
        // Only auto-select if the user has EXPLICITLY highlighted an item with arrow keys
        const focusedItem = items.find(el => el.classList.contains('bg-blue-100'));
        if (focusedItem) {
            focusedItem.dispatchEvent(new MouseEvent('mousedown'));
            return;
        }
        
        // Hide the dropdown — user chose not to select any result
        const d = document.getElementById('global-autocomplete');
        if (d) d.classList.add('hidden');
 
        const input = document.getElementById(`search-${groupIndex}`);
        const fullName = window.formatNameStr(input.value.trim());
        if (fullName !== '') {
            const conflict = checkDiverConflict(null, fullName);
            if (conflict.conflict) { showAppAlert(`Imposible: Asignado en ${conflict.where}`); return; }
            const tag = findActiveTagForGuest(null, fullName);
            const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            activeBoatItem.groups[groupIndex].guests.push({ nombre: fullName, titulacion: '', telefono: '', email: '', dni: '', gas: '15L Aire', isManual: true, bookingTag: tag, tempId: tempId });
            input.value = '';
            updateModalSubtitle(); 
            renderGroups();
            
            // Auto-open Edit Guest modal to let user add DNI and details immediately
            const newGuestIdx = activeBoatItem.groups[groupIndex].guests.length - 1;
            openEditGuestModal(groupIndex, newGuestIdx);
        }
    }
}


// --- SAVING & DELETING DATA ---
async function saveBoatData() {
    if (!activeBoatItem) return false;
    
    // Proactive formatting guardrail: enforce Title Case for all guests in this trip before saving
    activeBoatItem.groups.forEach(g => {
        if (g.guests) {
            g.guests.forEach(gst => {
                if (gst.nombre) gst.nombre = window.formatNameStr(gst.nombre);
            });
        }
    });

    if (window.isDeletingTrip) {
        console.warn("⚠️ Save aborted globally because a deletion is in progress!");
        return false;
    }

    // RACE CONDITION PREVENTION: Abort any saves (manual or auto) if the user is currently deleting the trip
    const deleteModal = document.getElementById('delete-confirm-modal');
    if (deleteModal && !deleteModal.classList.contains('hidden')) {
        console.warn("⚠️ Save aborted because delete modal is open! Preventing ghost trip revival.");
        return false;
    }

    // Guardar los cambios de Barco y Hora antes de evaluar el resto
    activeBoatItem.assignedBoat = document.getElementById('input-boat').value;
    activeBoatItem.time = document.getElementById('input-time').value;

    // Save max dives capacity for internal trips
    if (!activeBoatItem.isVisor) {
        const maxDivesVal = parseInt(document.getElementById('input-maxdives').value);
        if (maxDivesVal > 0) activeBoatItem.maxDives = maxDivesVal;
        else delete activeBoatItem.maxDives;
    }

    activeBoatItem.captain = activeBoatItem.assignedBoat === 'shore' ? '' : document.getElementById('input-captain').value;
    activeBoatItem.site = activeBoatItem.assignedBoat === 'shore' ? document.getElementById('input-activity').value : document.getElementById('input-site').value;

    activeBoatItem.timeSaliendo = activeBoatItem.assignedBoat === 'shore' ? '' : (document.getElementById('input-time-saliendo')?.value || '');
    activeBoatItem.timeBuzosAgua = activeBoatItem.assignedBoat === 'shore' ? '' : (document.getElementById('input-time-buzos-agua')?.value || '');
    activeBoatItem.timeVolviendo = activeBoatItem.assignedBoat === 'shore' ? '' : (document.getElementById('input-time-volviendo')?.value || '');

    // --- 🚨 STRICT CONFLICT FIREWALL ---
    // 1. Check Captain
    if (activeBoatItem.captain) {
        const cap = (staffDatabase.capitanes || []).find(c => c.nombre === activeBoatItem.captain);
        if (cap) {
            const loc = getPersonLocation(cap.dni, cap.nombre, 'captain');
            if (loc) { showAppAlert(`⚠️ Imposible guardar: El capitán ${cap.nombre} ya está en ${loc} a las ${activeBoatItem.time}.`); return false; }
        }
    }

    // 2. Check Guides and Guests
    for (let grpIdx = 0; grpIdx < activeBoatItem.groups.length; grpIdx++) {
        const g = activeBoatItem.groups[grpIdx];
        
        if (g.guide) {
            const gui = (staffDatabase.guias || []).find(x => x.nombre === g.guide);
            if (gui) {
                const loc = getPersonLocation(gui.dni, gui.nombre, 'guide', grpIdx);
                if (loc) { showAppAlert(`⚠️ Imposible guardar: El guía ${gui.nombre} ya está en ${loc} a las ${activeBoatItem.time}.`); return false; }
            }
        }

        if (g.apoyo) {
            const apo = (staffDatabase.guias || []).find(x => x.nombre === g.apoyo);
            if (apo) {
                const loc = getPersonLocation(apo.dni, apo.nombre, 'apoyo', grpIdx);
                if (loc) { showAppAlert(`⚠️ Imposible guardar: El apoyo ${apo.nombre} ya está en ${loc} a las ${activeBoatItem.time}.`); return false; }
            }
        }
        
        for (let gstIdx = 0; gstIdx < g.guests.length; gstIdx++) {
            const gst = g.guests[gstIdx];
            const loc = getPersonLocation(gst.dni, gst.nombre, 'guest', grpIdx, gstIdx);
            if (loc) { showAppAlert(`⚠️ Imposible guardar: El cliente ${gst.nombre} ya está asignado en ${loc} a las ${activeBoatItem.time}.`); return false; }
        }
    }
    // ------------------------------------

    const flatGuests = []; activeBoatItem.groups.forEach(g => flatGuests.push(...g.guests));
    
    // 🚨 CRITICAL TIMING FIX: Use synchronous in-memory snapshot to prevent network race conditions!
    // Never rely on mergedAllocations here, as onSnapshot delays can cause it to be stale during rapid additions/removals.
    const originalDnis = activeBoatItem.lastSavedDnis || [];
    const currentDnis = flatGuests.filter(g => !g.cancelled).map(g => g.dni).filter(Boolean);
    const removedDnis = originalDnis.filter(dni => !currentDnis.includes(dni));

    // 🚨 CRITICAL ASYNC ISOLATION: Snapshot the active trip properties synchronously.
    // If the user clicks another boat while `await saveInternalBoatData` is yielding, activeBoatItem will mutate!
    // This snapshot prevents history records from bleeding into the "next" clicked boat.
    const targetTripId = activeBoatItem.id;
    const targetDate = activeBoatItem.date;
    const targetTime = activeBoatItem.time;
    const targetSite = activeBoatItem.site;
    const targetAssignedBoat = activeBoatItem.assignedBoat;

    const payload = {
        date: targetDate, time: targetTime, assignedBoat: targetAssignedBoat,
        site: targetSite, captain: activeBoatItem.captain, groups: activeBoatItem.groups, guests: flatGuests,
        waitlist: activeBoatItem.waitlist || [],
        timeSaliendo: activeBoatItem.timeSaliendo || '',
        timeBuzosAgua: activeBoatItem.timeBuzosAgua || '',
        timeVolviendo: activeBoatItem.timeVolviendo || '',
        rmLocked: activeBoatItem.rmLocked || false
    };
    if (activeBoatItem.maxDives) payload.maxDives = activeBoatItem.maxDives;
    
    try {
        await saveInternalBoatData(targetTripId, targetDate, payload);
        
        // --- AUTO-PROPAGATE EQUIPMENT TO ALL PENDING DIVES ---
        let viewedDateStr = new Date().toISOString().split('T')[0];
        if (typeof currentDate !== 'undefined' && currentDate) {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            viewedDateStr = `${year}-${month}-${day}`;
        }
        const targetDateStr = targetDate || activeBoatItem.date;
        const earliestDateStr = targetDateStr < viewedDateStr ? targetDateStr : viewedDateStr;
        const allOtherTrips = mergedAllocations.filter(t => t.date >= earliestDateStr && t.id !== targetTripId);
        
        const monthlyUpdates = {}; 

        allOtherTrips.forEach(trip => {
            let tripChanged = false;
            const clonedTrip = JSON.parse(JSON.stringify(trip));

            clonedTrip.groups?.forEach(g => {
                g.guests?.forEach(otherGuest => {
                    if (otherGuest.dni) {
                        const meInCurrentBoat = flatGuests.find(tg => tg.dni && tg.dni === otherGuest.dni);
                        if (meInCurrentBoat) {
                            const oldRental = otherGuest.rental;
                            const oldComp = otherGuest.computer;
                            const oldCompPrice = otherGuest.computerPrice;
                            const oldIns = otherGuest.insurance;

                            otherGuest.rental = meInCurrentBoat.rental || 0;
                            otherGuest.computer = meInCurrentBoat.computer || 0;
                            otherGuest.computerPrice = meInCurrentBoat.computerPrice || 0;
                            otherGuest.insurance = meInCurrentBoat.insurance || 0;

                            if (oldRental !== otherGuest.rental || 
                                oldComp !== otherGuest.computer || 
                                oldCompPrice !== otherGuest.computerPrice || 
                                oldIns !== otherGuest.insurance) {
                                tripChanged = true;
                            }
                        }
                    }
                });
            });

            if (tripChanged) {
                const newFlatGuests = [];
                clonedTrip.groups.forEach(g => newFlatGuests.push(...g.guests));
                clonedTrip.guests = newFlatGuests;

                const localTripIdx = (window.internalTrips || internalTrips || []).findIndex(t => t.id === trip.id);
                if (localTripIdx > -1) {
                    if (window.internalTrips) window.internalTrips[localTripIdx] = clonedTrip;
                    if (typeof internalTrips !== 'undefined') internalTrips[localTripIdx] = clonedTrip;
                } else {
                    if (window.internalTrips) window.internalTrips.push(clonedTrip);
                    if (typeof internalTrips !== 'undefined' && Array.isArray(internalTrips)) internalTrips.push(clonedTrip);
                }

                const mergedTripIdx = mergedAllocations.findIndex(t => t.id === trip.id);
                if (mergedTripIdx > -1) {
                    mergedAllocations[mergedTripIdx].groups = clonedTrip.groups;
                    mergedAllocations[mergedTripIdx].guests = clonedTrip.guests;
                }

                const mKey = trip.date.substring(0, 7);
                if (!monthlyUpdates[mKey]) {
                    monthlyUpdates[mKey] = {};
                }
                const otherPayload = {
                    date: clonedTrip.date, 
                    time: clonedTrip.time, 
                    assignedBoat: clonedTrip.assignedBoat || 'ares',
                    site: clonedTrip.site || '',
                    captain: clonedTrip.captain || '',
                    groups: clonedTrip.groups, 
                    guests: clonedTrip.guests,
                    waitlist: clonedTrip.waitlist || [],
                    timeSaliendo: clonedTrip.timeSaliendo || '',
                    timeBuzosAgua: clonedTrip.timeBuzosAgua || '',
                    timeVolviendo: clonedTrip.timeVolviendo || '',
                    rmLocked: clonedTrip.rmLocked || false
                };
                if (clonedTrip.maxDives) otherPayload.maxDives = clonedTrip.maxDives;
                if (clonedTrip.isVisor) otherPayload.visorTripFallback = true;

                monthlyUpdates[mKey][`allocations.${trip.id}`] = otherPayload;

                // --- HISTORY SYNC: also update those guests' history docs to match the propagated equipment ---
                clonedTrip.groups?.forEach(g => {
                    g.guests?.forEach(gst => {
                        if (gst.dni && !gst.cancelled) {
                            const histRef = db.collection('mangamar_customers').doc(gst.dni).collection('history').doc(trip.id);
                            histRef.update({
                                gas: gst.gas || '15L Aire',
                                rental: gst.rental || 0,
                                computer: gst.computer || 0,
                                computerPrice: gst.computer ? (gst.computerPrice || 7) : 0,
                                insurance: gst.insurance || 0,
                            }).catch(() => {
                                // History doc may not exist yet — safe to ignore
                            });
                        }
                    });
                });
            }
        });

        for (const [mKey, updates] of Object.entries(monthlyUpdates)) {
            await db.collection('mangamar_monthly').doc(mKey).update(updates).catch(async err => {
                console.warn(`Doc missing for ${mKey}, fallback to set`, err);
                const fields = {};
                for (const k in updates) {
                    const cleanField = k.replace('allocations.', '');
                    fields[cleanField] = updates[k];
                }
                await db.collection('mangamar_monthly').doc(mKey).set({ allocations: fields }, { merge: true });
            });
        }
        
        // --- AUTO-SYNC EXACT TAG STATE TO OTHER BOATS RETROACTIVELY ---
        // This ensures if you disband/remove a tag, it removes it from their other dives that day too!
        const otherTrips = internalTrips.filter(t => t.date === targetDate && t.id !== targetTripId);
        let needsUpdate = false;
        const monthKey = targetDate.substring(0, 7);
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
                    site: clonedTrip.site, captain: clonedTrip.captain, groups: clonedTrip.groups, guests: clonedTrip.guests,
                    waitlist: clonedTrip.waitlist || [],
                    timeSaliendo: clonedTrip.timeSaliendo || '',
                    timeBuzosAgua: clonedTrip.timeBuzosAgua || '',
                    timeVolviendo: clonedTrip.timeVolviendo || '',
                    rmLocked: clonedTrip.rmLocked || false
                };
                needsUpdate = true;
            }
        });

        if (needsUpdate) {
            await db.collection('mangamar_monthly').doc(monthKey).update(updates);
        }
        
        // --- 3. TRACKER: SAVE DIVE HISTORY TO CUSTOMER PROFILE (PHASE 1) ---
        // Run this in the background asynchronously so it doesn't block the main save queue!
        (async () => {
            try {
                const historyBatch = db.batch();
                let historyWrites = 0;
                
                // A. Delete ghost history for divers we calculated as REMOVED earlier
                removedDnis.forEach(dni => {
                    const historyRef = db.collection('mangamar_customers').doc(dni).collection('history').doc(targetTripId);
                    historyBatch.delete(historyRef);
                    historyWrites++;
                });

                // B. Fetch existing network history profiles to ensure we don't accidentally overwrite payment states via autosave
                const validGuests = flatGuests.filter(g => g.dni && !g.cancelled);
                const checkPromises = validGuests.map(gst => db.collection('mangamar_customers').doc(gst.dni).collection('history').doc(targetTripId).get());
                const historicSnaps = await Promise.all(checkPromises);
                
                validGuests.forEach((gst, idx) => {
                    const historyRef = historicSnaps[idx].ref;
                    const curDoc = historicSnaps[idx];
                    // CRITICAL BUGFIX: Detect if the invoice was already liquidated manually in the CRM, never overwrite to pending.
                    const persistentState = (curDoc.exists && curDoc.data().paymentStatus) ? curDoc.data().paymentStatus : (gst.paymentStatus || 'pending');

                    historyBatch.set(historyRef, {
                        date: targetDate,
                        time: targetTime,
                        site: targetSite,
                        assignedBoat: targetAssignedBoat,
                        gas: gst.gas || '15L Aire',
                        rental: gst.rental || 0,
                        computer: gst.computer || 0,
                        computerPrice: gst.computer ? (gst.computerPrice || 7) : 0,
                        insurance: gst.insurance || 0,
                        course: gst.course || null,           
                        baseCourse: gst.baseCourse || null,   
                        courseBadge: gst.courseBadge || null, 
                        coursePrice: gst.coursePrice || 0,    
                        hasBono: gst.hasBono || false,
                        paymentStatus: persistentState,
                        certStatus: (gst.course || gst.baseCourse) ? ((curDoc.exists && curDoc.data().certStatus) ? curDoc.data().certStatus : 'pendiente') : firebase.firestore.FieldValue.delete(),
                        timestamp: firebase.firestore.FieldValue.serverTimestamp() 
                    }, { merge: true });
                    historyWrites++;
                });
                if (historyWrites > 0) {
                    await historyBatch.commit();
                    const affectedDnis = [...removedDnis, ...validGuests.map(g => g.dni)];
                    if (typeof window.updateMultipleCustomersOutstandingDebt === 'function') {
                        window.updateMultipleCustomersOutstandingDebt(affectedDnis);
                    }
                }
            } catch (err) {
                console.error("Background history sync failed:", err);
            }
        })();
        
        // Update the synchronous snapshot for subsequent saves without closing the modal
        activeBoatItem.lastSavedDnis = currentDnis;
        
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
        return true;
    } catch (e) {
        // Error alert is handled safely in saveInternalBoatData
        return false;
    }
}

// Full manual save override with UI state management
window.manualSaveBoatData = async function(andClose = false) {
    if (!activeBoatItem) return;
    const btn = document.getElementById('btn-manual-save');
    const originalContent = btn.innerHTML;

    btn.disabled = true;
    showToast("⏳ Guardando salida internamente...");

    if (andClose) {
        // Instantly hide the modal visually to make the UI feel blazing fast!
        document.getElementById('manage-boat-modal').classList.add('hidden');
    }

    try {
        const success = await saveBoatData();
        if (success) {
            showToast("✅ Salida guardada con éxito");
            if (andClose) {
                // Clean up state completely after background save completes successfully
                activeBoatItem = null;
                window.clearModalHistory();
            }
        } else {
            // Validation or conflict failed! Bring the modal back so they can fix it
            if (andClose) {
                document.getElementById('manage-boat-modal').classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error(err);
        showAppAlert("No se pudo guardar la salida. Comprueba tu conexión.");
        if (andClose) {
            document.getElementById('manage-boat-modal').classList.remove('hidden');
        }
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

// ── WAITLIST ──────────────────────────────────────────────────────────

// Internal store for the currently-selected CRM customer (set by autocomplete)
let _waitlistPendingCustomer = null;

window.toggleWaitlist = function() {
    const panel   = document.getElementById('waitlist-panel');
    const chevron = document.getElementById('waitlist-chevron');
    const hidden  = panel.classList.toggle('hidden');
    chevron.style.transform = hidden ? '' : 'rotate(180deg)';
}

function getWaitlistDropdown() {
    let dd = document.getElementById('waitlist-autocomplete');
    if (!dd) {
        dd = document.createElement('div');
        dd.id = 'waitlist-autocomplete';
        dd.className = 'fixed bg-white border border-slate-200 rounded-xl shadow-2xl mt-1 hidden max-h-56 overflow-y-auto z-[999999]';
        document.body.appendChild(dd);
    }
    return dd;
}

window.searchWaitlistCustomers = function(query) {
    const dd = getWaitlistDropdown();
    _waitlistPendingCustomer = null; // clear previous selection

    const normQuery = window.normalizeSearchString ? window.normalizeSearchString(query) : query.toLowerCase().trim();
    if (normQuery.length < 2) { dd.classList.add('hidden'); return; }

    const getFullName = c => [c.nombre, c.apellido].filter(Boolean).join(' ');
    const results = (customerDatabase || []).filter(c => {
        const full = (window.normalizeSearchString ? window.normalizeSearchString(getFullName(c)) : getFullName(c).toLowerCase());
        return full.includes(normQuery) || (c.dni || '').toLowerCase().includes(normQuery);
    }).slice(0, 12);

    if (results.length === 0) {
        dd.innerHTML = `<div class="px-4 py-3 text-sm text-slate-400 italic">No encontrado — pulsa Añadir para entrada manual.</div>`;
    } else {
        dd.innerHTML = results.map(c => {
            const fullName = getFullName(c);
            const encoded  = encodeURIComponent(JSON.stringify(c));
            return `<div class="waitlist-ac-item px-4 py-3 bg-white hover:bg-amber-50 cursor-pointer border-b border-slate-100 transition-colors"
                        onmousedown="selectWaitlistCustomer('${encoded}')">
                <div class="font-black text-slate-800 text-sm">${fullName}</div>
                <div class="text-xs text-slate-500 font-medium">${c.titulacion || '-'} • ${c.dni || ''} ${c.telefono ? '• ' + c.telefono : ''}</div>
            </div>`;
        }).join('');
    }

    const rect = document.getElementById('waitlist-search-input').getBoundingClientRect();
    dd.style.top   = rect.bottom + 'px';
    dd.style.left  = rect.left   + 'px';
    dd.style.width = rect.width  + 'px';
    dd.classList.remove('hidden');
}

window.selectWaitlistCustomer = function(encoded) {
    const c = JSON.parse(decodeURIComponent(encoded));
    const getFullName = x => [x.nombre, x.apellido].filter(Boolean).join(' ');
    _waitlistPendingCustomer = { 
        name: getFullName(c), 
        phone: c.telefono || '', 
        email: c.email || '', 
        dni: c.dni || '' 
    };
    document.getElementById('waitlist-search-input').value = getFullName(c);
    getWaitlistDropdown().classList.add('hidden');
    window.addWaitlistEntry(); // Auto-add on selection
}

window.handleWaitlistSearchKey = function(event) {
    const dropdown = getWaitlistDropdown();
    const items = dropdown && !dropdown.classList.contains('hidden') ? Array.from(dropdown.querySelectorAll('.waitlist-ac-item')) : [];

    if (items.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        let focusedIdx = items.findIndex(el => el.classList.contains('bg-amber-100'));
        if(focusedIdx > -1) {
            items[focusedIdx].classList.remove('bg-amber-100');
            items[focusedIdx].classList.add('bg-white');
        }
        
        if (event.key === 'ArrowDown') focusedIdx = (focusedIdx + 1) % items.length;
        if (event.key === 'ArrowUp') focusedIdx = (focusedIdx - 1 + items.length) % items.length;
        
        items[focusedIdx].classList.remove('bg-white');
        items[focusedIdx].classList.add('bg-amber-100');
        items[focusedIdx].scrollIntoView({ block: "nearest" });
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        const focusedItem = items.find(el => el.classList.contains('bg-amber-100'));
        if (focusedItem) {
            focusedItem.dispatchEvent(new MouseEvent('mousedown'));
        } else {
            window.addWaitlistEntry();
        }
    }
}

window.addWaitlistEntry = function() {
    const searchInput = document.getElementById('waitlist-search-input');
    const rawText = (searchInput.value || '').trim();
    if (!rawText) { searchInput.focus(); return; }

    // Use CRM-selected data if available, otherwise treat typed text as manual entry
    const entry = _waitlistPendingCustomer
        ? { id: Date.now(), ..._waitlistPendingCustomer }
        : { id: Date.now(), name: rawText, phone: '', dni: '' };

    if (!activeBoatItem.waitlist) activeBoatItem.waitlist = [];
    activeBoatItem.waitlist.push(entry);

    searchInput.value = '';
    _waitlistPendingCustomer = null;
    getWaitlistDropdown().classList.add('hidden');
    renderWaitlist();
    showToast('✅ Añadido a la lista de espera');
}

window.removeWaitlistEntry = function(id) {
    if (!activeBoatItem.waitlist) return;
    activeBoatItem.waitlist = activeBoatItem.waitlist.filter(e => e.id !== id);
    renderWaitlist();
}

function renderWaitlist() {
    const entries   = activeBoatItem.waitlist || [];
    const container = document.getElementById('waitlist-entries');
    const badge     = document.getElementById('waitlist-count-badge');

    if (entries.length > 0) {
        badge.textContent = entries.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    if (entries.length === 0) {
        container.innerHTML = '<div class="text-center py-6 text-amber-300 text-sm font-bold uppercase tracking-widest">Sin entradas</div>';
        return;
    }

    container.innerHTML = entries.map((e, idx) => `
        <div class="flex items-center gap-3 px-4 py-3 hover:bg-amber-100/60 transition-colors">
            <span class="w-6 h-6 rounded-full bg-amber-200 text-amber-700 text-xs font-black flex items-center justify-center shrink-0">${idx + 1}</span>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-black text-slate-800 uppercase tracking-tight truncate">${e.name}</div>
            </div>
            <div class="flex gap-1 shrink-0">
                ${e.phone ? `<button onclick="copyData('${e.phone}', 'Teléfono')" class="p-2 rounded-lg bg-white border border-slate-200 hover:bg-green-50 hover:border-green-200 transition-colors" title="Copiar Teléfono: ${e.phone}">
                    <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                </button>` : ''}
                ${e.email ? `<button onclick="copyData('${e.email}', 'Email')" class="p-2 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-colors" title="Copiar Email: ${e.email}">
                    <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 00-2 2z"/></svg>
                </button>` : ''}
                <button onclick="promoteFromWaitlist(${e.id})" class="p-2 rounded-lg bg-white border border-blue-200 hover:bg-blue-50 hover:border-blue-300 transition-colors text-blue-600 flex items-center gap-1 shadow-sm" title="Mover al Barco">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>
                    <span class="text-[10px] font-black uppercase">Subir</span>
                </button>
                <button onclick="removeWaitlistEntry(${e.id})" class="p-2 rounded-lg bg-white border border-red-100 hover:bg-red-50 hover:border-red-200 transition-colors auth-hide" title="Eliminar">
                    <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
        </div>
    `).join('');
}


window.promoteFromWaitlist = function(id) {
    if (!activeBoatItem.waitlist) return;
    const entry = activeBoatItem.waitlist.find(e => e.id === id);
    if (!entry) return;

    // Safety: ensure at least one group exists
    if (!activeBoatItem.groups || activeBoatItem.groups.length === 0) {
        activeBoatItem.groups = [{ guide: '', apoyo: '', guests: [] }];
    }

    // Fetch full profile from CRM to get certification
    let titulacion = '';
    let email = entry.email || '';
    if (entry.dni && typeof customerDatabase !== 'undefined') {
        const profile = customerDatabase.find(c => window.normalizeSearchString(c.dni || '') === window.normalizeSearchString(entry.dni));
        if (profile) {
            titulacion = profile.titulacion || '';
            if (!email) email = profile.email || '';
        }
    }

    // Add to the first group
    activeBoatItem.groups[0].guests.push({
        nombre: entry.name,
        dni: entry.dni || '',
        telefono: entry.phone || '',
        email: email,
        titulacion: titulacion,
        gas: '15L Aire',
        rental: 0,
        insurance: 0,
        bookingTag: ''
    });

    // Remove from waitlist
    activeBoatItem.waitlist = activeBoatItem.waitlist.filter(e => e.id !== id);

    renderGroups();
    renderWaitlist();
    showToast(`✅ ${entry.name} movido al manifiesto`);
    window.triggerAutoSave();
}

// Called when the manifest modal opens — load existing waitlist data
window.loadWaitlistForTrip = function() {
    const panel   = document.getElementById('waitlist-panel');
    const chevron = document.getElementById('waitlist-chevron');
    panel.classList.add('hidden');
    chevron.style.transform = '';
    const si = document.getElementById('waitlist-search-input');
    if (si) si.value = '';
    _waitlistPendingCustomer = null;
    getWaitlistDropdown().classList.add('hidden');

    if (!activeBoatItem.waitlist) activeBoatItem.waitlist = [];
    renderWaitlist();
    if (activeBoatItem.waitlist.length > 0) {
        panel.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
    }
}



function deleteBoatData() {
    if(!window.isLoggedIn) return;
    if(!activeBoatItem) return; // Allow deletion of all trips, including Visor trips
    window.isDeletingTrip = true; // Lock the autosave engine
    document.getElementById('delete-confirm-modal').classList.remove('hidden');
}

async function confirmDeleteBoatData() {
    if (typeof autoSaveTimeout !== 'undefined') clearTimeout(autoSaveTimeout);
    
    // CRITICAL Safeguard: Wait for any active Firestore auto-saves to fully complete first 
    // to prevent network race conditions from resurrecting the trip document in Firestore.
    if (isSaving) {
        while (isSaving) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    
    try {
        let originalTrip = mergedAllocations.find(t => t.id === activeBoatItem.id && t.isInternalTrip) || mergedAllocations.find(t => t.id === activeBoatItem.id);
        const internalTargetMonth = originalTrip && originalTrip._sourceDocId ? originalTrip._sourceDocId : activeBoatItem.date.substring(0, 7);
        
        const historyBatch = db.batch();
        let historyWrites = 0;
        if (originalTrip && originalTrip.guests) {
            originalTrip.guests.forEach(g => {
                if (g.dni) {
                    const ref = db.collection('mangamar_customers').doc(g.dni).collection('history').doc(activeBoatItem.id);
                    historyBatch.delete(ref);
                    historyWrites++;
                }
            });
        }
        const targetMonths = new Set();
        targetMonths.add(activeBoatItem.date.substring(0, 7)); // Always include the target month of the date
        if (window.internalTrips) {
            window.internalTrips.forEach(t => {
                if (t.id === activeBoatItem.id && t._sourceDocId) {
                    targetMonths.add(t._sourceDocId);
                }
            });
        }

        const deletePromises = [];
        targetMonths.forEach(monthKey => {
            console.log(`🗑️ [HARD DELETE] Eliminando salida internamente de forma permanente: ${activeBoatItem.id} en ${INTERNAL_DB}/${monthKey}`);
            
            // Soft delete for Visor trips, physical deletion for internal trips
            const updatePayload = {};
            if (activeBoatItem.isVisor || activeBoatItem.isVisorTrip) {
                updatePayload[`allocations.${activeBoatItem.id}`] = { 
                    _deleted: true, 
                    date: activeBoatItem.date, 
                    id: activeBoatItem.id 
                };
            } else {
                updatePayload[`allocations.${activeBoatItem.id}`] = firebase.firestore.FieldValue.delete();
            }
            
            deletePromises.push(
                db.collection(INTERNAL_DB).doc(monthKey).update(updatePayload)
                .catch(err => {
                    console.warn(`Hard delete skipped for doc ${monthKey} (maybe it doesnt exist):`, err);
                })
            );
        });

        // Track tombstone for Visor trips (since we can't delete them from master DB)
        if (activeBoatItem.isVisorTrip || activeBoatItem.isVisor) {
            window.hiddenVisorTrips.add(activeBoatItem.id);
        }
        
        // INSTANT RAM FLUSH: Remove from local array so UI doesn't lag
        if (window.internalTrips) {
            window.internalTrips = window.internalTrips.filter(t => t.id !== activeBoatItem.id);
        }
        
        // Force an immediate UI re-render before waiting for Firebase round-trip
        if (typeof window.mergeAndRender === 'function') {
            window.mergeAndRender();
        }

        await Promise.all(deletePromises);

        // Update history Batch
        if (historyWrites > 0) await historyBatch.commit();
        
        // Clear activeBoatItem first to prevent closeManageBoatModal from reviving it!
        activeBoatItem = null;
        window.activeBoatItem = null;

        // Unlock the autosave engine
        window.isDeletingTrip = false;
        
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
        console.error(e); showAppAlert("Error al eliminar la salida: " + e.message);
    }
}


window.toggleBono = function(groupIndex, guestIndex) {
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    guest.hasBono = !guest.hasBono; // Flips between true/false
    renderGroups();
};

window.toggleContasimple = async function(groupIndex, guestIndex) {
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    const isLocal = !guest.dni || String(guest.dni) === 'undefined';
    
    if (isLocal) {
        guest.localDepositC = !guest.localDepositC;
        if (typeof window.triggerAutoSave === 'function') window.triggerAutoSave();
        renderGroups();
    } else {
        const custIndex = customerDatabase.findIndex(c => c.dni === guest.dni);
        if (custIndex !== -1) {
            const newVal = !customerDatabase[custIndex].depositContasimple;
            customerDatabase[custIndex].depositContasimple = newVal;
            
            // Also keep local guest sync'ed
            guest.localDepositC = newVal;
            
            // Update UI instantly
            renderGroups();
            if (window.activeFichaDni === guest.dni && typeof window.renderFichaFromCache === 'function') {
                window.renderFichaFromCache(guest.dni);
            }
            
            // Save to Master List in background
            try {
                await db.collection("mangamar_directory").doc("master_list").update({ clients: customerDatabase });
            } catch (e) {
                console.error(e);
                showAppAlert("Error al guardar el estado de Contasimple");
            }
        }
    }
};

/* =========================================================================
   BULK INSERTION (Global Groups Modal)
   ========================================================================= */

window.openBulkAddModal = function() {
    const listEl = document.getElementById('bulk-groups-accordion');
    listEl.innerHTML = '';
    
    const currentDate = activeBoatItem.date;
    const activeGroupsMap = new Map();

    // 1. From global groups
    (window.globalGroups || []).forEach(g => {
        if (g.startDate && g.endDate && currentDate >= g.startDate && currentDate <= g.endDate) {
            activeGroupsMap.set(g.name.toLowerCase(), { ...g, members: [...(g.members || [])] });
        }
    });

    // 2. From today's local allocations (for ad-hoc or unsynced groups)
    mergedAllocations.forEach(t => {
        if (t.date === currentDate && t.guests) {
            t.guests.forEach(guest => {
                if (guest.bookingTag && !guest.bookingTag.startsWith('anon_')) {
                    const nameKey = guest.bookingTag.toLowerCase();
                    if (!activeGroupsMap.has(nameKey)) {
                        activeGroupsMap.set(nameKey, { name: guest.bookingTag, members: [] });
                    }
                    const grp = activeGroupsMap.get(nameKey);
                    if (guest.dni && !grp.members.includes(guest.dni)) grp.members.push(guest.dni);
                    else if (!guest.dni && guest.nombre && !grp.members.includes(guest.nombre.toLowerCase())) {
                        grp.members.push(guest.nombre.toLowerCase());
                    }
                }
            });
        }
    });

    const activeGroups = Array.from(activeGroupsMap.values());

    if (activeGroups.length === 0) {
        listEl.innerHTML = '<div class="p-6 text-center text-slate-400 font-bold">No hay grupos activos o globales configurados para esta fecha.</div>';
    } else {
        activeGroups.forEach(grp => {
            // Find member data from Master List
            const membersHtml = grp.members.map(memberKey => {
                // If it's a DNI, look up. Otherwise, just print the name.
                let displayName = memberKey;
                let displayDni = '';
                
                const masterMatch = customerDatabase.find(c => c.dni === memberKey || (c.dni && c.dni.toLowerCase() === memberKey.toLowerCase()));
                if (masterMatch) {
                    displayName = getFullName(masterMatch);
                    displayDni = masterMatch.dni || '';
                } else if (!memberKey.match(/^[0-9xyzXYZ]/)) {
                    // It's just a raw name
                    displayName = memberKey.charAt(0).toUpperCase() + memberKey.slice(1);
                }

                // Make sure they are not ALREADY in the boat
                const alreadyInBoat = activeBoatItem.groups.some(bgrp => 
                    bgrp.guests && bgrp.guests.some(g => (g.dni && g.dni === displayDni) || (g.nombre && g.nombre.toLowerCase() === displayName.toLowerCase()))
                );

                if (alreadyInBoat) return ''; // Skip rendering if already in boat

                return `
                <label class="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer rounded-lg border border-transparent hover:border-slate-100 transition-all">
                    <input type="checkbox" value="${encodeURIComponent(JSON.stringify({nombre: displayName, dni: displayDni}))}" data-group="${grp.name}" class="bulk-member-checkbox w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500">
                    <div>
                        <div class="text-sm font-bold text-slate-800">${displayName}</div>
                        ${displayDni ? `<div class="text-[10px] text-slate-400 font-black tracking-widest">${displayDni}</div>` : ''}
                    </div>
                </label>`;
            }).filter(h => h !== '').join('');

            if (membersHtml === '') return; // All members already in boat

            listEl.innerHTML += `
            <div class="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                <div class="bg-slate-50/50 px-4 py-3 border-b border-slate-200 flex justify-between items-center cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <h4 class="font-black text-slate-800 flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${getGroupColorClass(grp.name)}"></span>
                        ${grp.name}
                    </h4>
                    <div class="flex items-center gap-3">
                        <button onclick="event.stopPropagation(); const p = this.closest('.bg-white.rounded-xl'); const cbxs = p.querySelectorAll('.bulk-member-checkbox'); cbxs.forEach(c=>c.checked=true); confirmBulkAdd();" class="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-600 rounded text-[10px] uppercase font-black tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-700 transition-all shadow-sm">Insertar Todos</button>
                        <span class="text-xs font-bold text-slate-400 font-mono tracking-widest">${grp.members.length} Miem.</span>
                    </div>
                </div>
                <div class="p-3 space-y-1 hidden">
                    ${membersHtml}
                </div>
            </div>`;
        });
        
        if (listEl.innerHTML === '') {
            listEl.innerHTML = '<div class="p-6 text-center text-slate-400 font-bold">Todos los miembros de los grupos activos ya están en el barco.</div>';
        }
    }

    document.getElementById('bulk-add-modal').classList.remove('hidden');
};

window.confirmBulkAdd = function() {
    const checkboxes = document.querySelectorAll('.bulk-member-checkbox:checked');
    if (checkboxes.length === 0) {
        document.getElementById('bulk-add-modal').classList.add('hidden');
        return;
    }

    if (!activeBoatItem.groups || activeBoatItem.groups.length === 0) {
        activeBoatItem.groups = [{ guide: '', apoyo: '', guests: [] }];
    }
    // Use the last focused group's search bar, fall back to 0
    const targetGroupIdx = (typeof window._activeSearchGroupIdx === 'number' && window._activeSearchGroupIdx < activeBoatItem.groups.length)
        ? window._activeSearchGroupIdx
        : 0;
    
    checkboxes.forEach(chk => {
        const data = JSON.parse(decodeURIComponent(chk.value));
        const groupTag = chk.getAttribute('data-group');
        const tit = data.dni ? customerDatabase.find(c => c.dni === data.dni)?.titulacion || '' : '';
        
        activeBoatItem.groups[targetGroupIdx].guests.push({
            nombre: data.nombre,
            dni: data.dni || '',
            titulacion: tit,
            telefono: '',
            email: '',
            gas: '15L Aire',
            isManual: false,
            bookingTag: groupTag
        });
    });

    document.getElementById('bulk-add-modal').classList.add('hidden');
    renderGroups();
    triggerAutoSave();
};
// ==========================================
// DIVER NOTE FEATURE
// ==========================================
window.toggleGuestNote = function(groupIndex, guestIndex) {
    if (!window.isLoggedIn) return;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];

    // Store context for when Save is clicked
    window._noteContext = { groupIndex, guestIndex };

    // Populate and open the custom modal
    document.getElementById('guest-note-name').textContent = guest.nombre;
    document.getElementById('guest-note-input').value = guest.note || '';
    document.getElementById('guest-note-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('guest-note-input').focus(), 100);
};

window.closeGuestNoteModal = function() {
    document.getElementById('guest-note-modal').classList.add('hidden');
    window._noteContext = null;
};

window.saveGuestNote = function() {
    if (!window._noteContext) return;
    const { groupIndex, guestIndex } = window._noteContext;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    const trimmed = document.getElementById('guest-note-input').value.trim();

    if (trimmed) {
        guest.note = trimmed;
    } else {
        delete guest.note;
    }

    closeGuestNoteModal();
    renderGroups();
    triggerAutoSave();
};

// Global Keyboard Event Listener
document.addEventListener('keydown', (e) => {
    // Escape to close active modals
    if (e.key === 'Escape') {
        const guestNoteModal = document.getElementById('guest-note-modal');
        if (guestNoteModal && !guestNoteModal.classList.contains('hidden')) {
            closeGuestNoteModal();
            return;
        }
        const boatModal = document.getElementById('manage-boat-modal');
        if (boatModal && !boatModal.classList.contains('hidden')) {
            closeManageBoatModal();
            return;
        }
    }

    
    // Left/Right arrow navigation for boat manifest
    const boatModal = document.getElementById('manage-boat-modal');
    if (boatModal && !boatModal.classList.contains('hidden')) {
        // Only if we aren't typing in an input/textarea
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        
        // Don't navigate if other popups are open
        if (document.getElementById('tit-popup') && !document.getElementById('tit-popup').classList.contains('hidden')) return;
        if (document.getElementById('ins-popup') && !document.getElementById('ins-popup').classList.contains('hidden')) return;
        if (document.getElementById('guest-note-modal') && !document.getElementById('guest-note-modal').classList.contains('hidden')) return;
        if (document.getElementById('staff-picker-modal') && !document.getElementById('staff-picker-modal').classList.contains('hidden')) return;
        
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateBoatManifest('prev');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateBoatManifest('next');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateBoatManifestIntraday('up');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateBoatManifestIntraday('down');
        }
    }
});

window.getSameDayBoatTrips = function(dateStr, boatId) {
    const todaysTrips = mergedAllocations.filter(t => t && t.date === dateStr);
    const activeTimes = todaysTrips.some(t => t.time === '07:00') ? TIMES : TIMES.filter(t => t !== '07:00');
    
    const boatTrips = [];
    
    activeTimes.forEach(time => {
        let finalTrips = window.getMergedTrips ? window.getMergedTrips(todaysTrips.filter(t => t.time === time)) : todaysTrips.filter(t => t.time === time);
        
        let aTrip = null, kTrip = null, sTrip = null;
        let aConflicts = [], kConflicts = [], sConflicts = [];

        // Helper to forcefully place a trip in its requested boat
        const forcePlace = (t, targetBoat) => {
            if (targetBoat === 'ares') {
                if (!aTrip) aTrip = t; else aConflicts.push(t);
            } else if (targetBoat === 'kaiser') {
                if (!kTrip) kTrip = t; else kConflicts.push(t);
            } else if (targetBoat === 'shore') {
                if (!sTrip) sTrip = t; else sConflicts.push(t);
            }
        };

        // Helper to find ANY empty boat for unassigned trips
        const findEmptyBoat = (t) => {
            if (!aTrip) { t.assignedBoat = 'ares'; aTrip = t; }
            else if (!kTrip) { t.assignedBoat = 'kaiser'; kTrip = t; }
            else { t.assignedBoat = 'ares'; aConflicts.push(t); } 
        };

        // 1. Explicit assignments first
        finalTrips.filter(t => t.isVisor && t.assignedBoat).forEach(t => forcePlace(t, t.assignedBoat));
        finalTrips.filter(t => !t.isVisor && t.assignedBoat).forEach(t => forcePlace(t, t.assignedBoat));

        // 2. Unassigned visor trips fill empty spots
        finalTrips.filter(t => t.isVisor && !t.assignedBoat).forEach(t => findEmptyBoat(t));
        finalTrips.filter(t => !t.isVisor && !t.assignedBoat).forEach(t => findEmptyBoat(t));
        
        // Add to our list if they match the requested boatId
        if (boatId === 'ares') {
            if (aTrip) { aTrip.assignedBoat = 'ares'; boatTrips.push(aTrip); }
            aConflicts.forEach(c => { c.assignedBoat = 'ares'; boatTrips.push(c); });
        } else if (boatId === 'kaiser') {
            if (kTrip) { kTrip.assignedBoat = 'kaiser'; boatTrips.push(kTrip); }
            kConflicts.forEach(c => { c.assignedBoat = 'kaiser'; boatTrips.push(c); });
        } else if (boatId === 'shore') {
            if (sTrip) { sTrip.assignedBoat = 'shore'; boatTrips.push(sTrip); }
            sConflicts.forEach(c => { c.assignedBoat = 'shore'; boatTrips.push(c); });
        }
    });
    
    return boatTrips.sort((a, b) => a.time.localeCompare(b.time));
};

window.navigateBoatManifestIntraday = function(direction) {
    if (!activeBoatItem) return;
    
    const targetBoat = activeBoatItem.assignedBoat || 'ares';
    const targetDate = activeBoatItem.date;
    
    // Get all dynamically assigned and explicit trips for this boat on this date
    const sameDayBoatTrips = window.getSameDayBoatTrips(targetDate, targetBoat);
    if (sameDayBoatTrips.length === 0) return;
    
    let nextTrip = null;
    if (direction === 'up') {
        // Find the closest existing trip before the current time
        nextTrip = [...sameDayBoatTrips].reverse().find(t => t.time < activeBoatItem.time);
    } else if (direction === 'down') {
        // Find the closest existing trip after the current time
        nextTrip = sameDayBoatTrips.find(t => t.time > activeBoatItem.time);
    }
    
    if (nextTrip) {
        // Save current trip before switching — ONLY if it has some actual data to prevent phantom empty trips
        const hasData = activeBoatItem.captain || 
                        activeBoatItem.groups.some(g => g.guide || g.apoyo || (g.guests && g.guests.length > 0)) ||
                        activeBoatItem.timeSaliendo || activeBoatItem.timeBuzosAgua || activeBoatItem.timeVolviendo ||
                        activeBoatItem.rmLocked;
                        
        if (hasData) {
            if (typeof triggerAutoSave === 'function') triggerAutoSave();
        }
        
        const nextBoat = nextTrip.assignedBoat || targetBoat;
        const nextDate = nextTrip.date;
        const nextTime = nextTrip.time;
        
        setTimeout(() => {
            openManageBoatModal(nextTrip, nextBoat, nextTime, nextDate);
        }, 50);
    }
};

window.navigateBoatManifest = function(direction) {
    if (!activeBoatItem) return;
    
    const allTrips = window.getMergedTrips ? window.getMergedTrips(mergedAllocations) : mergedAllocations;
    
    // Sort all trips chronologically (by date, then time, then boat name)
    const sortedTrips = [...allTrips]
        .filter(t => t && t.date && t.time)
        .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.time !== b.time) return a.time.localeCompare(b.time);
            return (a.assignedBoat || '').localeCompare(b.assignedBoat || '');
        });
    
    // Match exactly by ID first to guarantee we find it even if it's unassigned
    let currentIndex = sortedTrips.findIndex(t => t.id === activeBoatItem.id);
    
    // Fallback if ID doesn't match for some reason
    if (currentIndex === -1) {
        currentIndex = sortedTrips.findIndex(t => 
            t.date === activeBoatItem.date && 
            t.time === activeBoatItem.time && 
            (t.assignedBoat || '') === (activeBoatItem.assignedBoat || '')
        );
    }
    
    if (currentIndex === -1) return;
    
    let targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex >= 0 && targetIndex < sortedTrips.length) {
        const nextTrip = sortedTrips[targetIndex];
        
        // Save current trip before switching
        if (typeof triggerAutoSave === 'function') triggerAutoSave();
        
        // Add a tiny delay to ensure save completes before UI re-renders
        setTimeout(() => {
            openManageBoatModal(nextTrip, nextTrip.assignedBoat || 'ares', nextTrip.time, nextTrip.date);
        }, 50);
    }
};

// Allow Enter (without Shift) to save the note
document.getElementById('guest-note-input') && document.getElementById('guest-note-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveGuestNote(); }
});

