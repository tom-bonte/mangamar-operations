console.log("CACHE BROKEN v9 - NEW ENGINE LOADED");

// ==========================================
// 1. INITIALIZATION & NAVIGATION
// ==========================================
let miniCalendarDate = new Date(); 

document.addEventListener('DOMContentLoaded', () => {
    monthlySiteFilters = [...SITES_MONTHLY]; 
    renderMonthlyFilters();
    updateDateHeaders();
    renderMiniCalendar();
    startFirestoreListeners(); 
    loadPrices(); // Initialize Dynamic Pricing Engine
});

function switchView(view) {
    activeViewMode = view;
    ['view-daily', 'view-monthly', 'view-staff'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('opacity-0', 'pointer-events-none', 'z-0');
        if(el) el.classList.remove('z-10');
    });
    const activeEl = document.getElementById(`view-${view}`);
    if(activeEl) activeEl.classList.remove('opacity-0', 'pointer-events-none', 'z-0');
    if(activeEl) activeEl.classList.add('z-10');
    
    ['daily', 'monthly', 'staff'].forEach(tab => {
        const btn = document.getElementById(`btn-view-${tab}`);
        if(!btn) return;
        
        // Active tab gets the solid Mangamar Orange gradient. Inactive tab gets subtle grey.
        if(tab === view) {
            btn.className = 'px-6 py-2 rounded-lg text-sm font-black transition-all bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm ring-1 ring-orange-500/20';
        } else {
            btn.className = 'px-6 py-2 rounded-lg text-sm font-bold transition-all text-slate-500 hover:text-slate-800 hover:bg-white/50';
        }
    });
}

function updateDateHeaders() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    let formattedStr = currentDate.toLocaleDateString('es-ES', options);
    formattedStr = formattedStr.charAt(0).toUpperCase() + formattedStr.slice(1);
    document.getElementById('daily-date-header').innerText = formattedStr;
}

// --- CALENDAR LOGIC ---
function changeDate(offset) {
    currentDate.setDate(currentDate.getDate() + offset);
    miniCalendarDate = new Date(currentDate); 
    updateDateHeaders(); renderDailyGrid(); renderMonthlyCalendar(); renderMiniCalendar();
}
function goToToday() {
    currentDate = new Date(); miniCalendarDate = new Date(currentDate); 
    updateDateHeaders(); renderDailyGrid(); renderMonthlyCalendar(); renderMiniCalendar();
}
function changeMonth(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    miniCalendarDate = new Date(currentDate);
    updateDateHeaders(); renderDailyGrid(); renderMonthlyCalendar(); renderMiniCalendar();
}
function changeMiniMonth(offset) {
    miniCalendarDate.setMonth(miniCalendarDate.getMonth() + offset);
    renderMiniCalendar();
}

function renderMiniCalendar() {
    const grid = document.getElementById('mini-calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    document.getElementById('mini-calendar-month').innerText = `${MONTHS_ES[miniCalendarDate.getMonth()]} ${miniCalendarDate.getFullYear()}`.toUpperCase();

    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(day => {
        const el = document.createElement('div'); el.className = 'text-[10px] font-black text-slate-400 py-1 uppercase'; el.innerText = day;
        grid.appendChild(el);
    });

    const year = miniCalendarDate.getFullYear(); const month = miniCalendarDate.getMonth();
    let firstDayIndex = new Date(year, month, 1).getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) grid.appendChild(document.createElement('div'));

    for (let day = 1; day <= daysInMonth; day++) {
        const isSelected = (day === currentDate.getDate() && month === currentDate.getMonth() && year === currentDate.getFullYear());
        const isToday = (day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear());
        const isWeekend = ((firstDayIndex + day - 1) % 7) >= 5;

        const cell = document.createElement('button');
        let baseClasses = 'w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center mx-auto transition-colors focus:outline-none ';
        
        if (isSelected) baseClasses += 'bg-blue-600 text-white shadow-md hover:bg-blue-700';
        else if (isToday) baseClasses += 'bg-blue-100 text-blue-700 hover:bg-blue-200';
        else baseClasses += isWeekend ? 'text-red-500 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-200';

        cell.className = baseClasses; cell.innerText = day;
        cell.onclick = () => {
            currentDate = new Date(year, month, day);
            updateDateHeaders(); renderDailyGrid(); renderMonthlyCalendar(); renderMiniCalendar(); 
        };
        grid.appendChild(cell);
    }
}

// --- MONTHLY FILTERS & RENDER ---
function renderMonthlyFilters() {
    const list = document.getElementById('monthly-filters-list');
    if(!list) return;
    list.innerHTML = SITES_MONTHLY.map(site => {
        const checked = monthlySiteFilters.includes(site) ? 'checked' : '';
        return `
        <label class="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer transition-colors">
            <input type="checkbox" value="${site}" ${checked} onchange="toggleSiteFilter(this)" class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer">
            <span class="text-sm font-bold text-slate-700">${site}</span>
        </label>`;
    }).join('');
}
function toggleSiteFilter(checkbox) {
    if(checkbox.checked) monthlySiteFilters.push(checkbox.value);
    else monthlySiteFilters = monthlySiteFilters.filter(s => s !== checkbox.value);
    renderMonthlyCalendar();
}

function selectAllFilters() { monthlySiteFilters = [...SITES_MONTHLY]; renderMonthlyFilters(); renderMonthlyCalendar(); }
function clearAllFilters() { monthlySiteFilters = []; renderMonthlyFilters(); renderMonthlyCalendar(); }

function renderMonthlyCalendar() {
    const grid = document.getElementById('monthly-grid');
    if(!grid) return;
    grid.innerHTML = ''; 
    document.getElementById('monthly-month-header').innerText = `${MONTHS_ES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

    DAYS_ES.forEach(day => {
        const el = document.createElement('div'); el.className = 'text-center text-xs font-black text-slate-400 py-2'; el.innerText = day.substring(0, 3);
        grid.appendChild(el);
    });

    const year = currentDate.getFullYear(); const month = currentDate.getMonth();
    let firstDayIndex = new Date(year, month, 1).getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div'); empty.className = 'bg-slate-50/50 rounded-xl border border-slate-100 min-h-[120px]'; grid.appendChild(empty);
    }

    const allTrips = getMergedTrips(mergedAllocations);

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const tripsToday = allTrips.filter(t => t.date === dateStr && monthlySiteFilters.includes(t.site || ''));
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
        
        const cell = document.createElement('div');
        cell.className = `bg-white rounded-xl border ${isToday ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'} p-2 min-h-[120px] flex flex-col transition-all cursor-pointer`;
        cell.onclick = () => { currentDate = new Date(year, month, day); updateDateHeaders(); switchView('daily'); renderDailyGrid(); renderMiniCalendar(); };

        let tripsHtml = '<div class="space-y-1 mt-2">';
        tripsToday.forEach(trip => {
            const siteColor = SITE_COLORS[trip.site] || 'bg-slate-100 text-slate-800 border-slate-200';
            const guests = trip.guests ? trip.guests.length : 0;
            tripsHtml += `<div class="text-[10px] font-bold px-1.5 py-1 rounded border ${siteColor} flex justify-between items-center truncate"><span class="truncate pr-1">${trip.site}</span><span class="opacity-70 shrink-0">${guests} pax</span></div>`;
        });
        tripsHtml += '</div>';

        cell.innerHTML = `<span class="text-sm font-black px-1 ${isToday ? 'text-blue-600' : 'text-slate-700'}">${day}</span>${tripsHtml}`;
        grid.appendChild(cell);
    }
}

// ==========================================
// 2. GRID RENDERING & PREVIEWS
// ==========================================
function renderDailyGrid() {
    const container = document.getElementById('daily-grid-container');
    if(!container) return;
    container.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const targetDateStr = `${year}-${month}-${day}`;

    const todaysTrips = mergedAllocations.filter(t => t.date === targetDateStr);
    
    // We establish the 4 columns: Time, Ares, Kaiser, Shore
    container.className = 'grid grid-cols-[60px_1fr_1fr_1fr] gap-6 pb-12 px-2';

    const timeCol = document.createElement('div');
    timeCol.className = 'flex flex-col gap-4 pt-[60px]';
    
    const createCol = (title) => {
        const col = document.createElement('div');
        col.className = 'bg-orange-100/60 rounded-[24px] p-3 flex flex-col gap-4 border border-orange-200/50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] min-h-[600px]';
        
        // Enlarged font and applied the solid Mangamar Orange gradient
        col.innerHTML = `<div class="h-12 flex items-center justify-center bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl mb-1 shadow-md border border-orange-300 shrink-0 z-20">
            <span class="text-sm font-black text-white uppercase tracking-widest">${title}</span>
        </div>`;
        return col;
    };

    const aresCol = createCol('Ares');
    const kaiserCol = createCol('Kaiser');
    const shoreCol = createCol('Shore / Aula');

    TIMES.forEach(time => {
        // Time label perfectly locked to the same height as the cards
        const tLabel = document.createElement('div');
        tLabel.className = 'text-[11px] font-black text-slate-400 text-right pr-2 flex items-start justify-end h-[130px] shrink-0 pt-4 opacity-80';
        tLabel.innerText = time;
        timeCol.appendChild(tLabel);

        let finalTrips = getMergedTrips(todaysTrips.filter(t => t.time === time));
        
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

        // 1. Asignaciones explícitas primero (Visor y luego Interno)
        finalTrips.filter(t => t.isVisor && t.assignedBoat).forEach(t => forcePlace(t, t.assignedBoat));
        finalTrips.filter(t => !t.isVisor && t.assignedBoat).forEach(t => forcePlace(t, t.assignedBoat));

        // 2. Viajes sin asignar llenan los huecos vacíos
        finalTrips.filter(t => t.isVisor && !t.assignedBoat).forEach(t => findEmptyBoat(t));
        finalTrips.filter(t => !t.isVisor && !t.assignedBoat).forEach(t => findEmptyBoat(t));

        // Creates a fixed-height slot that can accept drag-and-drop and squishes cards side-by-side on conflict
        const appendSlot = (parentCol, mainTrip, conflictArray, boatId, timeSlot) => {
            const slotContainer = document.createElement('div');
            // Fixed height container ensures the grid NEVER shifts out of alignment
            slotContainer.className = "h-[130px] w-full flex gap-2 relative rounded-2xl transition-all";
            
            // Drag and Drop Zones
            slotContainer.ondragover = (e) => { e.preventDefault(); slotContainer.classList.add('bg-blue-50', 'ring-2', 'ring-blue-400'); };
            slotContainer.ondragleave = (e) => { slotContainer.classList.remove('bg-blue-50', 'ring-2', 'ring-blue-400'); };
            slotContainer.ondrop = (e) => {
                e.preventDefault();
                slotContainer.classList.remove('bg-blue-50', 'ring-2', 'ring-blue-400');
                handleDrop(e, boatId, timeSlot);
            };

            const totalTrips = (mainTrip ? 1 : 0) + (conflictArray ? conflictArray.length : 0);
            const isCompact = totalTrips > 1; // Flag to squish cards side-by-side

            if (totalTrips === 0) {
                const empty = document.createElement('div');
                empty.className = "w-full h-full rounded-2xl border border-dashed border-slate-300 hover:bg-white hover:shadow-sm cursor-pointer transition-all flex items-center justify-center group auth-hide";
                empty.onclick = () => openManageBoatModal(null, boatId, timeSlot, targetDateStr);
                empty.innerHTML = `<svg class="w-8 h-8 text-slate-200 group-hover:text-blue-400 group-hover:scale-110 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>`;
                slotContainer.appendChild(empty);
            } else {
                if (mainTrip) slotContainer.appendChild(buildBoatCard(mainTrip, boatId, timeSlot, targetDateStr, isCompact, false));
                if (conflictArray) {
                    conflictArray.forEach(conflictTrip => {
                        slotContainer.appendChild(buildBoatCard(conflictTrip, boatId, timeSlot, targetDateStr, isCompact, true));
                    });
                }
            }
            parentCol.appendChild(slotContainer);
        };

        appendSlot(aresCol, aTrip, aConflicts, 'ares', time);
        appendSlot(kaiserCol, kTrip, kConflicts, 'kaiser', time);
        appendSlot(shoreCol, sTrip, sConflicts, 'shore', time);
    });

    container.appendChild(timeCol);
    container.appendChild(aresCol);
    container.appendChild(kaiserCol);
    container.appendChild(shoreCol);
}

function buildBoatCard(trip, boatId, time, dateStr, isCompact = false, isConflict = false) {
    const col = document.createElement('div');
    const guests = trip.guests || [];
    const guestCount = guests.length;
    const siteColorConfig = SITE_COLORS[trip.site] || 'bg-slate-100 text-slate-800 border-slate-300';
    
    let hasVisorTag = (trip.isVisor && (!trip.isInternalTrip || trip.site === trip.originalVisorSite));

    let previewHtml = (trip.groups || []).map(group => {
        const guideName = (group.guide || 'Sin Guía').toUpperCase();
        const guestsHtml = (group.guests || []).map(g => {
            const gasShort = (g.gas || '15L Aire').replace('Aire', 'Air').replace(/EAN(\d+)/, '$1%');
            return `<div class="flex justify-between items-center text-[10px] mb-1 last:mb-0 group/item">
                        <button onclick="if(!window.isLoggedIn) { event.preventDefault(); return; } event.stopPropagation(); openCustomerProfile('${g.dni}', '${g.nombre.replace(/'/g, "\\'")}')" 
                                class="truncate pr-2 font-bold text-white group-hover:text-blue-300 hover:text-blue-400 focus:outline-none focus:ring-opacity-0 transition-colors cursor-pointer flex-1 text-left auth-lock">
                            ${g.nombre}
                        </button>
                        <span class="shrink-0 font-black text-blue-300 text-[8px] ml-2">${gasShort}</span>
                    </div>`;
        }).join('');
        
        return `<div class="mb-3 last:mb-0 border-b border-white/10 pb-2 last:border-0 last:pb-0">
                    <div class="text-[8px] font-black text-orange-400 mb-1 tracking-widest">${guideName}</div>
                    ${guestsHtml || '<div class="text-[9px] italic text-slate-500">Vacío</div>'}
                </div>`;
    }).join('');

    if(!previewHtml || guestCount === 0) previewHtml = `<div class="text-[10px] text-slate-400 italic text-center">Sin grupos</div>`;

    const topBarColor = siteColorConfig.split(' ')[0] || 'bg-slate-200';
    const capacityNum = boatId === 'shore' ? 0 : (parseInt(trip.maxDives) || parseInt(trip.plazas) || parseInt(trip.pax) || (BOATS[boatId] ? BOATS[boatId].maxGuests : 12));
    const capacity = boatId === 'shore' ? '-' : capacityNum;
    
    col.draggable = true;
    col.ondragstart = (e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', trip.id); };

    let capName = trip.captain || 'Sin Asignar';
    let isShore = boatId === 'shore';
    let percent = isShore ? 0 : Math.min(100, Math.round((guestCount / capacityNum) * 100));
    
    let barColor = 'bg-blue-500';
    if (!isShore) {
        if (guestCount >= capacityNum) barColor = 'bg-red-500';
        else if (guestCount >= capacityNum - 2) barColor = 'bg-amber-400';
    }

    let cardBaseClass = isConflict ? "bg-red-50 border-red-500 shadow-md border-2" : "bg-white border-slate-200 shadow-sm border hover:shadow-md hover:border-blue-300";
    
    // Increased height to 115px to fit the new lines comfortably
    col.className = `group-tooltip relative rounded-2xl transition-all cursor-grab active:cursor-grabbing flex flex-col h-[115px] shrink-0 z-10 hover:z-[100] ${isCompact ? 'flex-1 min-w-0' : 'w-full'} ${cardBaseClass}`;
    col.onclick = () => openManageBoatModal(trip, boatId, time, dateStr);

    let guideNames = 'Sin Asignar';
    if (trip.groups && trip.groups.length > 0) {
        const uniqueGuides = [...new Set(trip.groups.map(g => g.guide).filter(Boolean))];
        if (uniqueGuides.length > 0) guideNames = uniqueGuides.join(', ');
    } else if (trip.guide) { guideNames = trip.guide; }

    col.innerHTML = `
        ${isConflict ? `<div class="bg-red-500 text-white text-[9px] font-black text-center uppercase py-0.5 shrink-0">⚠️ OVERBOOK</div>` : ''}
        <div class="h-1.5 w-full shrink-0 ${topBarColor}"></div> 
        <div class="p-2.5 flex-1 flex flex-col justify-between overflow-hidden gap-1">
            <div class="flex items-center gap-1.5 overflow-hidden min-w-0 shrink-0 w-full">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-black border ${siteColorConfig} truncate leading-tight shrink-0 max-w-[70%]">${trip.site || 'Sin Destino'}</span>
                ${hasVisorTag ? `<span class="text-[7px] font-black uppercase text-orange-600 tracking-widest bg-orange-50 px-1 rounded border border-orange-200 flex items-center shrink-0">VISOR</span>` : ''}
            </div>

            <div class="flex-1 flex flex-col justify-center min-w-0 w-full px-0.5">
                ${isShore ? '' : `<div class="text-[9px] truncate">
                    <span class="font-bold text-slate-400">Cap:</span> <span class="font-bold text-slate-700">${capName}</span>
                </div>`}
                <div class="text-[9px] truncate">
                    <span class="font-bold text-slate-400">Guía:</span> <span class="font-bold text-slate-700">${guideNames}</span>
                </div>
            </div>

            <div class="mt-auto flex flex-col gap-1 w-full shrink-0">
                <div class="flex justify-between items-end px-0.5">
                    <span class="text-[10px] font-black ${(!isShore && guestCount >= capacityNum) ? 'text-red-500' : 'text-slate-800'} leading-none">${guestCount} ${isShore ? 'pax' : '/ ' + capacityNum}</span>
                </div>
                ${!isShore ? `
                <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                </div>
                ` : `
                <div class="w-full h-1.5"></div>
                `}
            </div>

        </div>
        
        <div class="tooltip-content absolute z-[999] p-3 bg-slate-900 rounded-xl shadow-2xl w-64 border border-slate-700 pointer-events-auto" style="top: -5px; left: calc(100% + 2px);">
            <div class="text-[9px] font-black uppercase text-slate-400 mb-2 border-b border-slate-700 pb-1">${boatId.toUpperCase()} - CLIENTES</div>
            <div class="max-h-none overflow-visible">${previewHtml}</div>
        </div>
    `;
    return col;
}


// --- NEW UTILITIES (SYNC, HELP, LOCATION, CONFLICTS) ---
function toggleHelpLanguage(lang) {
    document.getElementById('help-content-es').classList.toggle('hidden', lang !== 'es');
    document.getElementById('help-content-en').classList.toggle('hidden', lang !== 'en');
    document.getElementById('flag-es').classList.toggle('opacity-40', lang !== 'es');
    document.getElementById('flag-en').classList.toggle('opacity-40', lang !== 'en');
}



// ==========================================
// 11. DRAG AND DROP ENGINE
// ==========================================

window.handleDrop = async function(event, targetBoat, targetTime) {
    const tripId = event.dataTransfer.getData('text/plain');
    if (!tripId) return;

    // CRITICAL FIX: Scan the raw array to see if ANY version of this trip originated from the Visor
    const isVisor = mergedAllocations.some(t => t.id === tripId && t.isVisorTrip);
    
    // Grab the internal version of the trip to modify, or fallback to the base trip
    let trip = mergedAllocations.find(t => t.id === tripId && t.isInternalTrip);
    if (!trip) trip = mergedAllocations.find(t => t.id === tripId);
    
    if (!trip) return;

    // 1. REJECT MOVES TO THE SHORE COLUMN
    if (targetBoat === 'shore' && trip.assignedBoat !== 'shore') {
        showAppAlert("⚠️ Las salidas de barco no se pueden mover a la columna de Shore / Aula.");
        return; 
    }

    // 2. REJECT SHORE TRIPS MOVING TO BOATS
    if (trip.assignedBoat === 'shore' && targetBoat !== 'shore') {
        showAppAlert("⚠️ Las inmersiones de Shore / Aula no se pueden asignar a un barco.");
        return; 
    }

    // 3. REJECT VISOR TIME CHANGES
    if (isVisor && trip.time !== targetTime) {
        showAppAlert("⚠️ Este destino nos ha sido asignado por la Reserva Marina a esta hora. No se puede modificar la hora de la salida.");
        return; 
    }

    // 4. Do nothing if dropped in the exact same spot
    if (trip.assignedBoat === targetBoat && trip.time === targetTime) return;

    // Clone and update
    let updatedTrip = JSON.parse(JSON.stringify(trip));
    updatedTrip.assignedBoat = targetBoat;
    updatedTrip.time = targetTime;

    const payload = {
        date: updatedTrip.date || '', 
        time: updatedTrip.time || '', 
        assignedBoat: updatedTrip.assignedBoat || 'ares',
        site: updatedTrip.site || '', 
        captain: updatedTrip.captain || '', 
        groups: updatedTrip.groups || [], 
        guests: updatedTrip.guests || []
    };
    if (updatedTrip.maxDives) payload.maxDives = updatedTrip.maxDives;

    try {
        showToast("⏳ Moviendo salida...");
        await saveInternalBoatData(tripId, updatedTrip.date, payload);
        
        // Instant sync history for all guests on the dragged boat
        const historyBatch = db.batch();
        let historyWrites = 0;
        if (updatedTrip.guests) {
            updatedTrip.guests.forEach(gst => {
                if (gst.dni) {
                    const historyRef = db.collection('mangamar_customers').doc(gst.dni).collection('history').doc(tripId);
                    historyBatch.set(historyRef, {
                        date: updatedTrip.date || '',
                        time: updatedTrip.time || '',
                        site: updatedTrip.site || '',
                        assignedBoat: updatedTrip.assignedBoat || '',
                        gas: gst.gas || '15L Aire',
                        rental: gst.rental || 0,
                        insurance: gst.insurance || 0,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    historyWrites++;
                }
            });
        }
        if(historyWrites > 0) await historyBatch.commit();
        
        // This success message will ONLY trigger if it passes all the rules above
        showToast("✅ Salida movida con éxito.");
    } catch (e) {
        console.error(e);
    }
};

// ==========================================
// SESSION AUTHENTICATION
// ==========================================
window.checkSessionOnLoad = function() {
    if (localStorage.getItem('mangaToken') === 'true') {
        window.isLoggedIn = true;
        document.body.classList.add('logged-in');
    }
    updateAuthButtonUI();
};

window.toggleLoginPasswordView = function(btn) {
    const p = document.getElementById('login-password-input');
    const isPass = p.type === 'password';
    p.type = isPass ? 'text' : 'password';
    btn.innerHTML = isPass ?
        '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>'
        : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>';
};

window.attemptLogin = function() {
    const pw = document.getElementById('login-password-input').value;
    if (pw === window.adminPassword) {
        window.isLoggedIn = true;
        localStorage.setItem('mangaToken', 'true');
        document.body.classList.add('logged-in');
        if(typeof closeGlobalModal === 'function') closeGlobalModal('login-modal');
        else document.getElementById('login-modal').classList.add('hidden');
        updateAuthButtonUI();
        showToast("✅ Has iniciado sesión correctamente");
        document.getElementById('login-password-input').value = "";
    } else {
        alert("Contraseña incorrecta");
    }
};

window.logout = function() {
    window.isLoggedIn = false;
    localStorage.removeItem('mangaToken');
    document.body.classList.remove('logged-in');
    updateAuthButtonUI();
    showToast("🔒 Sesión cerrada. Vista de solo lectura.");
    const dd = document.getElementById('auth-dropdown');
    if (dd) dd.classList.add('hidden');
};

window.changeAdminPassword = function() {
    const newPw = prompt("Introduce la nueva contraseña para Mangamar:");
    if (newPw && newPw.trim().length > 0) {
        db.collection("mangamar_directory").doc("settings").set({ adminPassword: newPw.trim() }, {merge: true}).then(() => {
            showToast("✅ Contraseña cambiada globalmente.");
            const dd = document.getElementById('auth-dropdown');
            if (dd) dd.classList.add('hidden');
        });
    }
};

window.updateAuthButtonUI = function() {
    const btnOut = document.getElementById('auth-btn-logged-out');
    const btnIn = document.getElementById('auth-btn-logged-in');
    if(btnOut && btnIn) {
        if(window.isLoggedIn) {
            btnOut.classList.add('hidden');
            btnIn.classList.remove('hidden');
        } else {
            btnOut.classList.remove('hidden');
            btnIn.classList.add('hidden');
        }
    }
};

window.toggleAuthDropdown = function() {
    const dd = document.getElementById('auth-dropdown');
    if(dd) dd.classList.toggle('hidden');
};


document.addEventListener('DOMContentLoaded', () => {
    window.checkSessionOnLoad();
});

// Admin Tools
window.openResyncPrompt = function() {
    const input = document.getElementById('resync-date-input');
    input.value = currentDate; // Default to currently viewed date
    document.getElementById('resync-modal').classList.remove('hidden');
};

window.submitResync = async function() {
    const dateInput = document.getElementById('resync-date-input').value;
    if (!dateInput) {
        showAppAlert("Por favor, selecciona una fecha.");
        return;
    }

    try {
        const monthKey = dateInput.substring(0, 7);
        const internalRef = db.collection('mangamar_monthly').doc(monthKey);
        const docSnap = await internalRef.get();
        
        let restoredCount = 0;
        let updateBatch = {};

        if (docSnap.exists) {
            const allocations = docSnap.data().allocations || {};
            for (const id in allocations) {
                if (allocations[id]._deleted) {
                    // Check if the original Visor trip is scheduled for the selected date
                    const masterTrip = visorTrips.find(v => v.id === id);
                    if (masterTrip && masterTrip.date === dateInput) {
                        updateBatch[`allocations.${id}`] = firebase.firestore.FieldValue.delete();
                        restoredCount++;
                    } else if (!masterTrip) {
                        // If it's a completely orphaned tombstone (Visor deleted it entirely), clean it up too
                        updateBatch[`allocations.${id}`] = firebase.firestore.FieldValue.delete();
                    }
                }
            }
        }

        if (restoredCount > 0) {
            await internalRef.update(updateBatch);
            showToast(`✅ ¡Hecho! ${restoredCount} salidas del Visor restauradas para el ${dateInput}.`);
        } else {
            showToast(`ℹ️ No se encontraron salidas borradas para el ${dateInput}.`);
        }
        
        document.getElementById('resync-modal').classList.add('hidden');
    } catch (e) {
        console.error("Error resyncing:", e);
        showAppAlert("Error al intentar restaurar las salidas.");
    }
};