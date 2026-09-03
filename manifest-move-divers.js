// ==========================================
// MOVE DIVERS SIDE-BY-SIDE MODAL MODULE
// ==========================================
window.openMoveDiversModal = function(timeSlot) {
    const modal = document.getElementById('move-divers-modal');
    if (!modal) return;
    
    // Reset undo state on open
    const undoBtn = document.getElementById('move-divers-undo-btn');
    if (undoBtn) undoBtn.classList.add('hidden');
    window.lastMoveState = null;
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const targetDateStr = `${year}-${month}-${day}`;
    
    document.getElementById('move-divers-time-title').innerText = timeSlot;
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateFormatted = currentDate.toLocaleDateString('es-ES', options);
    document.getElementById('move-divers-date-subtitle').innerText = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
    
    window.renderMoveDiversModalContent(timeSlot, targetDateStr);
    modal.classList.remove('hidden');
};

window.closeMoveDiversModal = function() {
    const modal = document.getElementById('move-divers-modal');
    if (modal) modal.classList.add('hidden');
    
    // Clear undo state on close
    const undoBtn = document.getElementById('move-divers-undo-btn');
    if (undoBtn) undoBtn.classList.add('hidden');
    window.lastMoveState = null;
};

window.getDeduplicatedTripsWithDynamicBoats = function(timeSlot, targetDateStr) {
    const rawTrips = (window.mergedAllocations || mergedAllocations || []).filter(t => 
        t.date === targetDateStr && 
        t.time === timeSlot
    );

    // Make a deep copy to avoid polluting global state's assignedBoat references directly
    const rawCopies = JSON.parse(JSON.stringify(rawTrips));
    const todaysTrips = typeof getMergedTrips === 'function' ? getMergedTrips(rawCopies) : rawCopies;

    // Apply the same boat assignment algorithm as app.js
    let aTrip = null, kTrip = null, sTrip = null;
    let aConflicts = [], kConflicts = [], sConflicts = [];

    const forcePlace = (t, targetBoat) => {
        if (targetBoat === 'ares') {
            if (!aTrip) aTrip = t; else aConflicts.push(t);
        } else if (targetBoat === 'kaiser') {
            if (!kTrip) kTrip = t; else kConflicts.push(t);
        } else if (targetBoat === 'shore') {
            if (!sTrip) sTrip = t; else sConflicts.push(t);
        }
    };

    const findEmptyBoat = (t) => {
        if (!aTrip) { t.assignedBoat = 'ares'; aTrip = t; }
        else if (!kTrip) { t.assignedBoat = 'kaiser'; kTrip = t; }
        else { t.assignedBoat = 'ares'; aConflicts.push(t); } 
    };

    const activeTrips = todaysTrips.filter(t => !t.cancelled);
    const cancelledTrips = todaysTrips.filter(t => t.cancelled);

    const processTrips = (list) => {
        list.filter(t => (t.isVisorTrip || t.isVisor) && t.assignedBoat).forEach(t => forcePlace(t, t.assignedBoat));
        list.filter(t => !(t.isVisorTrip || t.isVisor) && t.assignedBoat).forEach(t => forcePlace(t, t.assignedBoat));
        list.filter(t => (t.isVisorTrip || t.isVisor) && !t.assignedBoat).forEach(t => findEmptyBoat(t));
        list.filter(t => !(t.isVisorTrip || t.isVisor) && !t.assignedBoat).forEach(t => findEmptyBoat(t));
    };

    processTrips(activeTrips);
    processTrips(cancelledTrips);

    return todaysTrips;
};

window.renderMoveDiversModalContent = function(timeSlot, targetDateStr) {
    const container = document.getElementById('move-divers-columns-container');
    if (!container) return;
    container.innerHTML = '';

    const todaysTrips = window.getDeduplicatedTripsWithDynamicBoats(timeSlot, targetDateStr);

    const columns = [];
    const aresTrips = todaysTrips.filter(t => t.assignedBoat === 'ares');
    const kaiserTrips = todaysTrips.filter(t => t.assignedBoat === 'kaiser');

    if (aresTrips.length === 0) {
        columns.push({ type: 'empty', boatId: 'ares' });
    } else {
        // Sort so active trip is first
        aresTrips.sort((a, b) => (a.cancelled ? 1 : 0) - (b.cancelled ? 1 : 0));
        aresTrips.forEach(t => columns.push({ type: 'trip', trip: t, boatId: 'ares' }));
    }

    if (kaiserTrips.length === 0) {
        columns.push({ type: 'empty', boatId: 'kaiser' });
    } else {
        // Sort so active trip is first
        kaiserTrips.sort((a, b) => (a.cancelled ? 1 : 0) - (b.cancelled ? 1 : 0));
        kaiserTrips.forEach(t => columns.push({ type: 'trip', trip: t, boatId: 'kaiser' }));
    }

    columns.forEach(col => {
        const colDiv = document.createElement('div');
        colDiv.className = "flex-1 flex flex-col min-w-[320px] max-w-[480px] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm";
        
        let titleText = col.boatId === 'ares' ? 'Ares' : 'Kaiser';
        let bgClass = col.boatId === 'ares' ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gradient-to-r from-slate-700 to-slate-800';
        let capacityText = '';
        
        if (col.type === 'trip') {
            const trip = col.trip;
            if (trip.cancelled) {
                titleText += ' (ANULADA)';
                bgClass = col.boatId === 'ares' 
                    ? 'bg-gradient-to-r from-orange-600/70 to-orange-700/70' 
                    : 'bg-gradient-to-r from-slate-600/70 to-slate-700/70';
            }
            const guestsCount = (trip.groups || []).reduce((acc, g) => acc + (g.guests ? g.guests.filter(x => !x.cancelled).length : 0), 0);
            const capacity = parseInt(trip.maxDives) || parseInt(trip.pax) || parseInt(trip.plazas) || 12;
            capacityText = `(${guestsCount}/${capacity} Plazas)`;
        }

        colDiv.innerHTML = `
            <div class="px-4 py-3 ${bgClass} text-white font-black text-sm uppercase tracking-wider flex justify-between items-center shrink-0">
                <span>${titleText}</span>
                <span class="text-xs opacity-90 font-bold">${capacityText}</span>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-4">
                ${renderMoveDiversBoatContent(col.trip, col.boatId, timeSlot, targetDateStr)}
            </div>
        `;
        container.appendChild(colDiv);
    });
};

function getContrastColor(hexColor) {
    if (typeof getContrastYIQ === 'function') return getContrastYIQ(hexColor);
    if (typeof window.getContrastYIQ === 'function') return window.getContrastYIQ(hexColor);
    const r = parseInt(hexColor.slice(1, 3), 16) || 0;
    const g = parseInt(hexColor.slice(3, 5), 16) || 0;
    const b = parseInt(hexColor.slice(5, 7), 16) || 0;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

function renderMoveDiversBoatContent(trip, boatId, timeSlot, targetDateStr) {
    if (!trip) {
        return `
            <div class="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 italic">
                <svg class="w-10 h-10 text-slate-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                <span class="text-xs font-bold">Sin salida programada</span>
                <button onclick="window.createMoveDiversTrip('${boatId}', '${timeSlot}', '${targetDateStr}')" 
                        class="mt-3 px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 font-black text-[10px] rounded-xl hover:bg-orange-100 transition-all shadow-xs cursor-pointer uppercase tracking-wider">
                    + Crear Salida
                </button>
            </div>
        `;
    }

    let html = `
        <div class="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-600 flex justify-between gap-2 shrink-0">
            <span class="truncate">Destino: <strong class="text-slate-800">${trip.site || 'Sin Destino'}</strong></span>
            <span class="truncate shrink-0">Capitán: <strong class="text-slate-800">${trip.captain ? window.getFirstName(trip.captain) : 'Sin Asignar'}</strong></span>
        </div>
        <div class="space-y-3 mt-3">
    `;

    if (!trip.groups || trip.groups.length === 0) {
        html += `<div class="text-center text-slate-400 italic text-xs py-4">No hay grupos asignados</div>`;
    } else {
        trip.groups.forEach((group, grpIdx) => {
            const guideName = group.guide ? window.getFirstName(group.guide) : 'Sin Guía';
            const apoyoText = group.apoyo ? ` (Apoyo: ${window.getFirstName(group.apoyo)})` : '';
            const moveGroupBtn = `
                <div class="relative shrink-0">
                    <button onclick="window.toggleMoveGroupBtnDropdown(event, '${timeSlot}', '${targetDateStr}', '${trip.id}', ${grpIdx})" 
                            title="Mover todo el grupo" 
                            class="px-2 py-0.5 text-[8.5px] font-black bg-orange-100 hover:bg-orange-500 hover:text-white text-orange-700 rounded-md border border-orange-200 transition-colors cursor-pointer shrink-0 uppercase tracking-wide">
                        Mover Grupo
                    </button>
                    <div class="move-entire-group-dropdown hidden absolute right-0 top-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl py-1 w-48 z-40">
                    </div>
                </div>
            `;
            html += `
                <div class="bg-slate-50/50 border border-slate-200/60 rounded-xl p-3">
                    <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-200/50 flex justify-between items-center gap-2">
                        <span class="truncate">Guía: ${guideName}${apoyoText}</span>
                        <div class="flex items-center gap-1.5 shrink-0">
                            ${moveGroupBtn}
                            <span class="text-[9px] font-bold text-slate-500">(${(group.guests || []).length})</span>
                        </div>
                    </div>
                    <div class="space-y-1.5">
            `;

            if (!group.guests || group.guests.length === 0) {
                html += `<div class="text-center text-slate-300 italic text-[10px] py-1">Vacío</div>`;
            } else {
                group.guests.forEach((guest, gstIdx) => {
                    const isNitrox = (guest.gas || '').includes('EAN');
                    const gasBadge = isNitrox ? `<span class="px-1 py-0.5 text-[8px] font-black bg-emerald-500 text-white border border-emerald-600 rounded">NITROX</span>` : '';
                    
                    const isSnorkel = (guest.baseCourse === "Snorkeling" || guest.courseBadge === "Snorkel" || (guest.baseCourse && guest.baseCourse.toLowerCase().includes("snorkel")) || (guest.course && guest.course.toLowerCase().includes("snorkel")));
                    const courseText = isSnorkel ? 'SNORKEL' : (guest.courseBadge || guest.course || '');
                    const courseBadge = courseText ? `<span class="px-1.5 py-0.5 text-[8.5px] font-black bg-orange-500 text-white rounded uppercase shrink-0 leading-none shadow-xs ml-1">${courseText}</span>` : '';
                    
                    const arrivedClass = guest.cancelled
                        ? 'bg-red-500 border-red-600'
                        : guest.arrived
                            ? 'bg-emerald-500 border-emerald-600'
                            : 'bg-white border-slate-300';
                    const arrivedDot = `<span class="w-2 h-2 rounded-full border shrink-0 ${arrivedClass}"></span>`;
                    
                    const cancelledClass = guest.cancelled ? 'line-through text-slate-400' : 'text-slate-700 font-bold';
                    
                    const buttonArrow = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4-4m-4 4l4 4" /></svg>`;

                    let groupStyle = '';
                    if (guest.bookingTag && typeof getGroupColorClass === 'function') {
                        const hexColor = getGroupColorClass(guest.bookingTag);
                        if (hexColor && hexColor !== '#ffffff') {
                            const r = parseInt(hexColor.slice(1, 3), 16) || 0;
                            const gHex = parseInt(hexColor.slice(3, 5), 16) || 0;
                            const b = parseInt(hexColor.slice(5, 7), 16) || 0;
                            groupStyle = `style="background-color: rgba(${r},${gHex},${b},0.08); border-left: 4px solid ${hexColor};"`;
                        }
                    }

                    html += `
                        <div ${groupStyle} class="flex items-center justify-between bg-white border border-slate-100 rounded-lg p-2 hover:border-slate-300 transition-colors shadow-xs">
                            <div class="flex items-center gap-1.5 overflow-hidden min-w-0 flex-1 pr-2">
                                ${arrivedDot}
                                <span class="text-xs truncate ${cancelledClass}" title="${guest.nombre}">${guest.nombre}</span>
                                ${courseBadge}
                                ${gasBadge}
                            </div>
                            <div class="relative shrink-0 flex items-center">
                                <button onclick="window.toggleMoveGroupDropdown(event, '${timeSlot}', '${targetDateStr}', '${trip.id}', '${guest.dni || ''}', '${guest.nombre.replace(/'/g, "\\'")}')" 
                                        title="Mover buceador" 
                                        class="w-7 h-7 flex items-center justify-center rounded-full bg-slate-50 hover:bg-orange-500 hover:text-white border border-slate-200 text-slate-500 transition-all duration-150 cursor-pointer shadow-xs">
                                    ${buttonArrow}
                                </button>
                                <div class="move-group-dropdown hidden absolute right-0 top-full mt-1 bg-white border border-slate-200 shadow-xl rounded-xl py-1 w-48 z-40">
                                </div>
                            </div>
                        </div>
                    `;
                });
            }

            html += `
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    return html;
}

window.createMoveDiversTrip = function(boatId, timeSlot, targetDateStr) {
    const newTrip = {
        id: `internal_${Date.now()}`,
        date: targetDateStr,
        time: timeSlot,
        assignedBoat: boatId,
        site: 'Sin Destino',
        captain: '',
        isVisor: false,
        groups: [
            {
                guide: '',
                apoyo: '',
                guests: []
            }
        ]
    };
    
    if (typeof internalTrips !== 'undefined') internalTrips.push(newTrip);
    if (window.internalTrips) window.internalTrips.push(newTrip);
    (window.mergedAllocations || mergedAllocations || []).push(newTrip);

    window.saveMultipleTripsData([newTrip])
        .catch(e => console.error("Error creating empty trip via Move Divers modal:", e));

    if (typeof renderDailyGrid === 'function') renderDailyGrid();
    else if (typeof window.renderDailyGrid === 'function') window.renderDailyGrid();
    window.renderMoveDiversModalContent(timeSlot, targetDateStr);
};

// Helper to find a guest inside a trip by DNI or Name
function findGuestInTrip(trip, dni, nombre) {
    if (!trip) return null;
    let found = null;
    let groupIdx = -1;
    let guestIdx = -1;

    const queryDni = dni ? String(dni).trim().toLowerCase() : '';
    const queryName = nombre ? String(nombre).trim().toLowerCase() : '';

    if (trip.groups) {
        for (let gIdx = 0; gIdx < trip.groups.length; gIdx++) {
            const group = trip.groups[gIdx];
            if (group && group.guests) {
                const idx = group.guests.findIndex(g => {
                    const gd = g.dni ? String(g.dni).trim().toLowerCase() : '';
                    const gn = g.nombre ? String(g.nombre).trim().toLowerCase() : '';
                    return (queryDni && gd === queryDni) || (queryName && gn === queryName);
                });
                if (idx > -1) {
                    found = group.guests[idx];
                    groupIdx = gIdx;
                    guestIdx = idx;
                    break;
                }
            }
        }
    }

    if (!found && trip.guests) {
        const idx = trip.guests.findIndex(g => {
            const gd = g.dni ? String(g.dni).trim().toLowerCase() : '';
            const gn = g.nombre ? String(g.nombre).trim().toLowerCase() : '';
            return (queryDni && gd === queryDni) || (queryName && gn === queryName);
        });
        if (idx > -1) {
            found = trip.guests[idx];
        }
    }

    return { guest: found, groupIdx, guestIdx };
}

window.toggleMoveGroupDropdown = function(event, timeSlot, targetDateStr, sourceTripId, guestDni, guestName) {
    event.stopPropagation();
    
    const todaysTrips = window.getDeduplicatedTripsWithDynamicBoats(timeSlot, targetDateStr);
    const sourceTrip = todaysTrips.find(t => String(t.id) === String(sourceTripId));
    if (!sourceTrip) return;

    if (!sourceTrip.groups) {
        sourceTrip.groups = (sourceTrip.guests && sourceTrip.guests.length > 0)
            ? [{ guide: '', apoyo: '', guests: sourceTrip.guests }]
            : [{ guide: '', apoyo: '', guests: [] }];
    }

    const otherTrips = todaysTrips.filter(t => String(t.id) !== String(sourceTripId) && (t.assignedBoat === 'ares' || t.assignedBoat === 'kaiser'));
    if (otherTrips.length === 0) return;

    const btn = event.currentTarget;
    const dropdown = btn.nextElementSibling;
    
    document.querySelectorAll('.move-entire-group-dropdown, .move-group-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.add('hidden');
    });

    if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        return;
    }

    let html = `<div class="text-[9px] font-black text-slate-400 uppercase px-3 py-1 tracking-wider border-b border-slate-100">Mover a:</div>`;
    
    otherTrips.forEach(targetTrip => {
        const boatName = targetTrip.assignedBoat === 'ares' ? 'Ares' : (targetTrip.assignedBoat === 'kaiser' ? 'Kaiser' : 'Astec');
        const statusText = targetTrip.cancelled ? ' (ANULADA)' : '';
        const tripLabel = `${boatName}${statusText}`;
        
        html += `<div class="bg-slate-100 px-3 py-1 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200/60">${tripLabel}</div>`;
        
        if (!targetTrip.groups) {
            targetTrip.groups = (targetTrip.guests && targetTrip.guests.length > 0)
                ? [{ guide: '', apoyo: '', guests: targetTrip.guests }]
                : [{ guide: '', apoyo: '', guests: [] }];
        }

        if (targetTrip.groups && targetTrip.groups.length > 0) {
            targetTrip.groups.forEach((g, gIdx) => {
                const guideLabel = g.guide ? `Guía: ${window.getFirstName(g.guide)}` : `Grupo ${gIdx + 1} (Sin Guía)`;
                html += `<button onclick="window.moveDiverBetweenTrips('${timeSlot}', '${targetDateStr}', '${sourceTripId}', '${targetTrip.id}', '${guestDni}', '${guestName.replace(/'/g, "\\'")}', ${gIdx})" class="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 truncate block border-b border-slate-50">${guideLabel}</button>`;
            });
        }
        
        html += `<button onclick="window.moveDiverBetweenTrips('${timeSlot}', '${targetDateStr}', '${sourceTripId}', '${targetTrip.id}', '${guestDni}', '${guestName.replace(/'/g, "\\'")}', -1)" class="w-full text-left px-4 py-2 hover:bg-orange-50 text-xs font-black text-orange-600 block border-b border-slate-50">+ Nuevo Grupo</button>`;
    });

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');

    const closeAll = () => {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeAll);
    };
    setTimeout(() => document.addEventListener('click', closeAll), 10);
};

window.toggleMoveGroupBtnDropdown = function(event, timeSlot, targetDateStr, sourceTripId, groupIdx) {
    event.stopPropagation();
    
    const todaysTrips = window.getDeduplicatedTripsWithDynamicBoats(timeSlot, targetDateStr);
    const sourceTrip = todaysTrips.find(t => String(t.id) === String(sourceTripId));
    if (!sourceTrip) return;

    if (!sourceTrip.groups) {
        sourceTrip.groups = (sourceTrip.guests && sourceTrip.guests.length > 0)
            ? [{ guide: '', apoyo: '', guests: sourceTrip.guests }]
            : [{ guide: '', apoyo: '', guests: [] }];
    }

    const otherTrips = todaysTrips.filter(t => String(t.id) !== String(sourceTripId) && (t.assignedBoat === 'ares' || t.assignedBoat === 'kaiser'));
    if (otherTrips.length === 0) return;

    if (otherTrips.length === 1) {
        // Move immediately!
        window.moveGroupBetweenTrips(timeSlot, targetDateStr, sourceTripId, otherTrips[0].id, groupIdx);
        return;
    }

    const btn = event.currentTarget;
    const dropdown = btn.nextElementSibling;
    
    document.querySelectorAll('.move-entire-group-dropdown, .move-group-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.add('hidden');
    });

    if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        return;
    }

    let html = `<div class="text-[9px] font-black text-slate-400 uppercase px-3 py-1 tracking-wider border-b border-slate-100">Mover a:</div>`;
    
    otherTrips.forEach(targetTrip => {
        const boatName = targetTrip.assignedBoat === 'ares' ? 'Ares' : (targetTrip.assignedBoat === 'kaiser' ? 'Kaiser' : 'Astec');
        const statusText = targetTrip.cancelled ? ' (ANULADA)' : '';
        const tripLabel = `${boatName}${statusText}`;
        
        html += `<button onclick="window.moveGroupBetweenTrips('${timeSlot}', '${targetDateStr}', '${sourceTripId}', '${targetTrip.id}', ${groupIdx})" class="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 truncate block border-b border-slate-50">${tripLabel}</button>`;
    });

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');

    const closeAll = () => {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeAll);
    };
    setTimeout(() => document.addEventListener('click', closeAll), 10);
};

window.findAuthoritativeTrip = function(tripId) {
    const allAllocations = window.mergedAllocations || mergedAllocations || [];
    // 1. MUST FIRST search for the internal trip object in mergedAllocations (contains groups, guests, captain)
    let trip = allAllocations.find(t => String(t.id) === String(tripId) && t.isInternalTrip);
    if (trip) return trip;

    // 2. Search in window.internalTrips
    if (window.internalTrips) {
        trip = window.internalTrips.find(t => String(t.id) === String(tripId));
        if (trip) return trip;
    }

    // 3. Fallback to visor trip in mergedAllocations if no internal trip exists yet
    trip = allAllocations.find(t => String(t.id) === String(tripId));
    if (trip) {
        trip.isInternalTrip = true;
        if (!trip.groups) trip.groups = [];
        if (!trip.guests) trip.guests = [];
        return trip;
    }
    return null;
};

window.moveDiverBetweenTrips = function(timeSlot, targetDateStr, sourceTripId, targetTripId, guestDni, guestName, targetGroupIdx) {
    if (typeof showToast === 'function') {
        showToast(`Mover: ${guestName || guestDni}`);
    }

    let sourceTrip = window.findAuthoritativeTrip(sourceTripId);
    let targetTrip = window.findAuthoritativeTrip(targetTripId);

    if (!sourceTrip || !targetTrip) {
        if (typeof showToast === 'function') showToast("Error: No se pudo localizar origen o destino.");
        return;
    }

    // Initialize groups safely without EVER discarding existing passengers
    if (!sourceTrip.groups || sourceTrip.groups.length === 0) {
        sourceTrip.groups = (sourceTrip.guests && sourceTrip.guests.length > 0)
            ? [{ guide: sourceTrip.guide || '', apoyo: sourceTrip.apoyo || '', guests: [...sourceTrip.guests] }]
            : [{ guide: '', apoyo: '', guests: [] }];
    }
    if (!targetTrip.groups || targetTrip.groups.length === 0) {
        targetTrip.groups = (targetTrip.guests && targetTrip.guests.length > 0)
            ? [{ guide: targetTrip.guide || '', apoyo: targetTrip.apoyo || '', guests: [...targetTrip.guests] }]
            : [{ guide: '', apoyo: '', guests: [] }];
    }

    // Locate guest inside the source object
    const lookup = findGuestInTrip(sourceTrip, guestDni, guestName);
    const foundGuest = lookup.guest;
    if (!foundGuest) {
        if (typeof showToast === 'function') showToast("Error: Buceador no localizado en origen.");
        return;
    }

    // --- SAVE UNDO STATE ---
    window.lastMoveState = {
        actionType: 'diver',
        timeSlot: timeSlot,
        targetDateStr: targetDateStr,
        sourceTripId: sourceTripId,
        targetTripId: targetTripId,
        guestDni: guestDni,
        guestName: guestName,
        sourceGroups: JSON.parse(JSON.stringify(sourceTrip.groups || [])),
        sourceGuests: JSON.parse(JSON.stringify(sourceTrip.guests || [])),
        targetGroups: JSON.parse(JSON.stringify(targetTrip.groups || [])),
        targetGuests: JSON.parse(JSON.stringify(targetTrip.guests || []))
    };
    const undoBtn = document.getElementById('move-divers-undo-btn');
    if (undoBtn) undoBtn.classList.remove('hidden');

    // Remove guest from source groups
    if (lookup.groupIdx > -1 && lookup.guestIdx > -1) {
        sourceTrip.groups[lookup.groupIdx].guests.splice(lookup.guestIdx, 1);
    }
    // Remove guest from source flat guests list
    if (sourceTrip.guests) {
        const idx = sourceTrip.guests.findIndex(g => g === foundGuest || (g.dni && guestDni && String(g.dni) === String(guestDni)) || (g.nombre && guestName && g.nombre === guestName));
        if (idx > -1) sourceTrip.guests.splice(idx, 1);
    }

    // Add guest to target groups
    if (targetGroupIdx === -1) {
        targetTrip.groups.push({
            guide: '',
            apoyo: '',
            guests: [foundGuest]
        });
    } else {
        while (targetTrip.groups.length <= targetGroupIdx) {
            targetTrip.groups.push({ guide: '', apoyo: '', guests: [] });
        }
        targetTrip.groups[targetGroupIdx].guests.push(foundGuest);
    }

    // Add guest to target flat list
    if (!targetTrip.guests) targetTrip.guests = [];
    const alreadyHas = targetTrip.guests.some(g => (g.dni && foundGuest.dni && String(g.dni) === String(foundGuest.dni)) || (g.nombre && foundGuest.nombre && g.nombre === foundGuest.nombre));
    if (!alreadyHas) {
        targetTrip.guests.push(foundGuest);
    }

    // Synchronize matching objects in mergedAllocations and internalTrips
    const allAllocations = window.mergedAllocations || mergedAllocations || [];
    allAllocations.forEach(t => {
        if (String(t.id) === String(sourceTripId)) {
            t.groups = sourceTrip.groups;
            t.guests = sourceTrip.guests;
            if (sourceTrip.captain) t.captain = sourceTrip.captain;
            if (sourceTrip.guide) t.guide = sourceTrip.guide;
        }
        if (String(t.id) === String(targetTripId)) {
            t.groups = targetTrip.groups;
            t.guests = targetTrip.guests;
            if (targetTrip.captain) t.captain = targetTrip.captain;
            if (targetTrip.guide) t.guide = targetTrip.guide;
        }
    });
    if (window.internalTrips) {
        window.internalTrips.forEach(t => {
            if (String(t.id) === String(sourceTripId)) {
                t.groups = sourceTrip.groups;
                t.guests = sourceTrip.guests;
                if (sourceTrip.captain) t.captain = sourceTrip.captain;
                if (sourceTrip.guide) t.guide = sourceTrip.guide;
            }
            if (String(t.id) === String(targetTripId)) {
                t.groups = targetTrip.groups;
                t.guests = targetTrip.guests;
                if (targetTrip.captain) t.captain = targetTrip.captain;
                if (targetTrip.guide) t.guide = targetTrip.guide;
            }
        });
    }

    // Force RAM update UI instantly
    if (typeof renderDailyGrid === 'function') renderDailyGrid();
    else if (typeof window.renderDailyGrid === 'function') window.renderDailyGrid();
    window.renderMoveDiversModalContent(timeSlot, targetDateStr);

    if (typeof showToast === 'function') showToast(`Éxito: ${foundGuest.nombre} movido.`);

    // Save in background
    window.saveMultipleTripsData([sourceTrip, targetTrip])
        .catch(e => console.error("Error saving moved trips:", e));

    // Migrate customer history doc in background if guest has DNI
    if (foundGuest.dni) {
        (async () => {
            try {
                const firestoreDb = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
                if (!firestoreDb) return;
                const dniStr = String(foundGuest.dni);
                const oldHistoryRef = firestoreDb.collection('mangamar_customers').doc(dniStr).collection('history').doc(String(sourceTripId));
                const oldHistorySnap = await oldHistoryRef.get();
                if (oldHistorySnap.exists) {
                    const historyData = oldHistorySnap.data();
                    
                    const targetBoat = targetTrip.assignedBoat 
                        || (String(targetTripId).toLowerCase().includes('ares') ? 'ares' : '')
                        || (String(targetTripId).toLowerCase().includes('kaiser') ? 'kaiser' : '')
                        || 'ares';

                    historyData.assignedBoat = targetBoat;
                    historyData.time = timeSlot;
                    historyData.date = targetDateStr;
                    historyData.site = targetTrip.site || 'Sin Destino';
                    
                    const newHistoryRef = firestoreDb.collection('mangamar_customers').doc(dniStr).collection('history').doc(String(targetTripId));
                    const batch = firestoreDb.batch();
                    batch.set(newHistoryRef, historyData);
                    batch.delete(oldHistoryRef);
                    await batch.commit();
                }
            } catch (err) {
                console.error("Error migrating customer history:", err);
            }
        })();
    }
};

window.moveGroupBetweenTrips = function(timeSlot, targetDateStr, sourceTripId, targetTripId, groupIdx) {
    if (typeof showToast === 'function') {
        showToast("Mover grupo...");
    }

    let sourceTrip = window.findAuthoritativeTrip(sourceTripId);
    let targetTrip = window.findAuthoritativeTrip(targetTripId);

    if (!sourceTrip || !targetTrip) {
        if (typeof showToast === 'function') showToast("Error: No se pudo localizar origen o destino.");
        return;
    }

    if (!sourceTrip.groups || !sourceTrip.groups[groupIdx]) {
        if (typeof showToast === 'function') showToast("Error: No se pudo localizar el grupo en el origen.");
        return;
    }

    // Ensure target groups array exists and preserves any existing passengers
    if (!targetTrip.groups || targetTrip.groups.length === 0) {
        targetTrip.groups = (targetTrip.guests && targetTrip.guests.length > 0)
            ? [{ guide: targetTrip.guide || '', apoyo: targetTrip.apoyo || '', guests: [...targetTrip.guests] }]
            : [];
    }

    const groupToMove = sourceTrip.groups[groupIdx];

    // --- SAVE UNDO STATE ---
    window.lastMoveState = {
        actionType: 'group',
        timeSlot: timeSlot,
        targetDateStr: targetDateStr,
        sourceTripId: sourceTripId,
        targetTripId: targetTripId,
        groupIdx: groupIdx,
        sourceGroups: JSON.parse(JSON.stringify(sourceTrip.groups || [])),
        sourceGuests: JSON.parse(JSON.stringify(sourceTrip.guests || [])),
        targetGroups: JSON.parse(JSON.stringify(targetTrip.groups || [])),
        targetGuests: JSON.parse(JSON.stringify(targetTrip.guests || []))
    };
    const undoBtn = document.getElementById('move-divers-undo-btn');
    if (undoBtn) undoBtn.classList.remove('hidden');

    // Remove group from source groups
    sourceTrip.groups.splice(groupIdx, 1);

    // Remove group guests from source flat guests list
    if (sourceTrip.guests && groupToMove.guests) {
        groupToMove.guests.forEach(guest => {
            const idx = sourceTrip.guests.findIndex(g => g === guest || (g.dni && guest.dni && String(g.dni) === String(guest.dni)) || (g.nombre && guest.nombre && g.nombre === guest.nombre));
            if (idx > -1) sourceTrip.guests.splice(idx, 1);
        });
    }

    // Add group copy to target groups
    const groupCopy = JSON.parse(JSON.stringify(groupToMove));
    targetTrip.groups.push(groupCopy);

    // Add group guests to target flat list
    if (!targetTrip.guests) targetTrip.guests = [];
    if (groupCopy.guests) {
        groupCopy.guests.forEach(guest => {
            const alreadyHas = targetTrip.guests.some(g => (g.dni && guest.dni && String(g.dni) === String(guest.dni)) || (g.nombre && guest.nombre && g.nombre === guest.nombre));
            if (!alreadyHas) {
                targetTrip.guests.push(guest);
            }
        });
    }

    // Synchronize matching objects in mergedAllocations and internalTrips
    const allAllocations = window.mergedAllocations || mergedAllocations || [];
    allAllocations.forEach(t => {
        if (String(t.id) === String(sourceTripId)) {
            t.groups = sourceTrip.groups;
            t.guests = sourceTrip.guests;
            if (sourceTrip.captain) t.captain = sourceTrip.captain;
            if (sourceTrip.guide) t.guide = sourceTrip.guide;
        }
        if (String(t.id) === String(targetTripId)) {
            t.groups = targetTrip.groups;
            t.guests = targetTrip.guests;
            if (targetTrip.captain) t.captain = targetTrip.captain;
            if (targetTrip.guide) t.guide = targetTrip.guide;
        }
    });
    if (window.internalTrips) {
        window.internalTrips.forEach(t => {
            if (String(t.id) === String(sourceTripId)) {
                t.groups = sourceTrip.groups;
                t.guests = sourceTrip.guests;
                if (sourceTrip.captain) t.captain = sourceTrip.captain;
                if (sourceTrip.guide) t.guide = sourceTrip.guide;
            }
            if (String(t.id) === String(targetTripId)) {
                t.groups = targetTrip.groups;
                t.guests = targetTrip.guests;
                if (targetTrip.captain) t.captain = targetTrip.captain;
                if (targetTrip.guide) t.guide = targetTrip.guide;
            }
        });
    }

    // Force RAM update UI instantly
    if (typeof renderDailyGrid === 'function') renderDailyGrid();
    else if (typeof window.renderDailyGrid === 'function') window.renderDailyGrid();
    window.renderMoveDiversModalContent(timeSlot, targetDateStr);

    if (typeof showToast === 'function') showToast("Éxito: Grupo movido.");

    // Save in background
    window.saveMultipleTripsData([sourceTrip, targetTrip])
        .catch(e => console.error("Error saving moved group:", e));

    // Migrate history for all guests in this group in background
    if (groupCopy.guests && groupCopy.guests.length > 0) {
        groupCopy.guests.forEach(guest => {
            if (guest.dni) {
                (async () => {
                    try {
                        const firestoreDb = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
                        if (!firestoreDb) return;
                        const dniStr = String(guest.dni);
                        const oldHistoryRef = firestoreDb.collection('mangamar_customers').doc(dniStr).collection('history').doc(String(sourceTripId));
                        const oldHistorySnap = await oldHistoryRef.get();
                        if (oldHistorySnap.exists) {
                            const historyData = oldHistorySnap.data();
                            
                            const targetBoat = targetTrip.assignedBoat 
                                || (String(targetTripId).toLowerCase().includes('ares') ? 'ares' : '')
                                || (String(targetTripId).toLowerCase().includes('kaiser') ? 'kaiser' : '')
                                || 'ares';

                            historyData.assignedBoat = targetBoat;
                            historyData.time = timeSlot;
                            historyData.date = targetDateStr;
                            historyData.site = targetTrip.site || 'Sin Destino';
                            
                            const newHistoryRef = firestoreDb.collection('mangamar_customers').doc(dniStr).collection('history').doc(String(targetTripId));
                            const batch = firestoreDb.batch();
                            batch.set(newHistoryRef, historyData);
                            batch.delete(oldHistoryRef);
                            await batch.commit();
                        }
                    } catch (err) {
                        console.error("Error migrating group guest history:", err);
                    }
                })();
            }
        });
    }
};

window.undoLastMove = function() {
    if (!window.lastMoveState) {
        if (typeof showToast === 'function') showToast("No hay cambios que deshacer.");
        return;
    }

    const state = window.lastMoveState;
    let sourceTrip = window.findAuthoritativeTrip(state.sourceTripId);
    let targetTrip = window.findAuthoritativeTrip(state.targetTripId);

    if (sourceTrip && state.sourceGroups) {
        sourceTrip.groups = JSON.parse(JSON.stringify(state.sourceGroups));
        sourceTrip.guests = JSON.parse(JSON.stringify(state.sourceGuests || []));
    }
    if (targetTrip && state.targetGroups) {
        targetTrip.groups = JSON.parse(JSON.stringify(state.targetGroups));
        targetTrip.guests = JSON.parse(JSON.stringify(state.targetGuests || []));
    }

    // Sync all memory copies
    const allAllocations = window.mergedAllocations || mergedAllocations || [];
    allAllocations.forEach(t => {
        if (sourceTrip && String(t.id) === String(state.sourceTripId) && state.sourceGroups) {
            t.groups = sourceTrip.groups;
            t.guests = sourceTrip.guests;
        }
        if (targetTrip && String(t.id) === String(state.targetTripId) && state.targetGroups) {
            t.groups = targetTrip.groups;
            t.guests = targetTrip.guests;
        }
    });
    if (window.internalTrips) {
        window.internalTrips.forEach(t => {
            if (sourceTrip && String(t.id) === String(state.sourceTripId) && state.sourceGroups) {
                t.groups = sourceTrip.groups;
                t.guests = sourceTrip.guests;
            }
            if (targetTrip && String(t.id) === String(state.targetTripId) && state.targetGroups) {
                t.groups = targetTrip.groups;
                t.guests = targetTrip.guests;
            }
        });
    }

    // Force RAM update UI instantly
    if (typeof renderDailyGrid === 'function') renderDailyGrid();
    else if (typeof window.renderDailyGrid === 'function') window.renderDailyGrid();
    window.renderMoveDiversModalContent(state.timeSlot, state.targetDateStr);

    if (typeof showToast === 'function') showToast("Último cambio deshecho.");

    // Save restored state to database
    if (sourceTrip && targetTrip) {
        window.saveMultipleTripsData([sourceTrip, targetTrip])
            .catch(e => console.error("Error saving undone trips:", e));
    }

    // Hide Undo button
    const undoBtn = document.getElementById('move-divers-undo-btn');
    if (undoBtn) undoBtn.classList.add('hidden');
    window.lastMoveState = null;
};
