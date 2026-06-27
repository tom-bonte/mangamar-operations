console.log("CACHE BROKEN v9 - NEW ENGINE LOADED");

// --- LOCAL ORIGIN-ISOLATED CSS ZOOM ENGINE ---
(function() {
    let currentZoom = parseFloat(sessionStorage.getItem('mangamar_local_zoom') || '1.0');
    function applyZoom(z) {
        currentZoom = Math.min(2.0, Math.max(0.5, z));
        if (document.body) {
            document.body.style.zoom = currentZoom;
        }
        sessionStorage.setItem('mangamar_local_zoom', currentZoom);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyZoom(currentZoom));
    } else {
        applyZoom(currentZoom);
    }
    window.addEventListener('keydown', function(e) {

        const isZoomIn = (e.key === '=' || e.key === '+');
        const isZoomOut = (e.key === '-');
        const isZoomReset = (e.key === '0');
        if ((e.metaKey || e.ctrlKey) && (isZoomIn || isZoomOut || isZoomReset)) {
            e.preventDefault();
            if (isZoomIn) applyZoom(currentZoom + 0.1);
            else if (isZoomOut) applyZoom(currentZoom - 0.1);
            else if (isZoomReset) applyZoom(1.0);
            return;
        }

        // 3. Cmd+F or Ctrl+F to focus and open our premium Daily Search Box
        const isF = (e.key === 'f' || e.key === 'F');
        if ((e.metaKey || e.ctrlKey) && isF) {
            e.preventDefault();
            const input = document.getElementById('daily-search-input');
            if (input) {
                input.focus();
                window.expandDailySearch();
            }
            return;
        }

        // 2. Keyboard date navigation (daily view ArrowLeft / ArrowRight)
        const activeEl = document.activeElement;
        const tag = activeEl ? activeEl.tagName : '';
        const isEditing = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
        
        // Don't navigate if any overlay modals are open
        const anyModalOpen = 
            (document.getElementById('manage-boat-modal') && !document.getElementById('manage-boat-modal').classList.contains('hidden')) ||
            (document.getElementById('crm-modal') && !document.getElementById('crm-modal').classList.contains('hidden')) ||
            (document.getElementById('bulk-add-modal') && !document.getElementById('bulk-add-modal').classList.contains('hidden')) ||
            (document.getElementById('guest-note-modal') && !document.getElementById('guest-note-modal').classList.contains('hidden'));
            
        // Check if TV view is open
        const tvModal = document.getElementById('tv-view-modal');
        const isTvOpen = tvModal && !tvModal.classList.contains('hidden');
        
        if (isTvOpen) {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const now = Date.now();
                if (now - (window._lastTvNavTime || 0) < 150) {
                    return; // Throttle to prevent keydown repeat event storms
                }
                window._lastTvNavTime = now;
                
                const offset = e.key === 'ArrowLeft' ? -1 : 1;
                if (typeof window.changeTVDate === 'function') {
                    window.changeTVDate(offset);
                } else {
                    changeDate(offset);
                }
                return;
            }
        }
            
        if (!anyModalOpen) {
            const isSearchFocused = activeEl && activeEl.id === 'daily-search-input';
            
            if (isSearchFocused) {
                // If search input is focused, allow Alt+Arrow or Ctrl+Arrow to navigate days instantly
                if ((e.ctrlKey || e.altKey) && e.key === 'ArrowLeft') {
                    e.preventDefault();
                    changeDate(-1);
                } else if ((e.ctrlKey || e.altKey) && e.key === 'ArrowRight') {
                    e.preventDefault();
                    changeDate(1);
                }
            } else if (!isEditing) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    changeDate(-1);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    changeDate(1);
                }
            }
        }
    }, { passive: false });
})();

window.normalizeDateStr = function(dateStr) {
    if (!dateStr) return '';
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(dateStr)) {
        const parts = dateStr.split(/[\/\-]/);
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
};

window.normalizeSearchString = function(str) {
    if (!str) return '';
    return str.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/ig, "").toLowerCase();
};

window.checkDniMatch = function(dni, normQuery) {
    if (!dni || !normQuery) return false;
    const normDni = window.normalizeSearchString(dni);
    if (normDni.includes(normQuery)) return true;
    
    // Generalized: Compare digits only if the query has at least 5 digits
    const queryDigits = normQuery.replace(/\D/g, '');
    if (queryDigits.length >= 5) {
        const dniDigits = normDni.replace(/\D/g, '');
        if (dniDigits.includes(queryDigits)) return true;
    }
    return false;
};

window.calculateTotalPeopleOnBoat = function(trip) {
    if (!trip) return 0;
    const guests = trip.guests || [];
    const guestCount = guests.filter(g => !g.cancelled).length;
    
    const staffSet = new Set();
    
    const isPlaceholder = (name) => {
        if (!name) return true;
        const lower = name.trim().toLowerCase();
        return lower === "" || lower === "sin asignar" || lower === "por asignar" || lower === "sin guia" || lower === "sin guía" || lower === "sin apoyo";
    };
    
    if (trip.captain && !isPlaceholder(trip.captain)) {
        staffSet.add(trip.captain.trim().toLowerCase());
    }
    
    if (trip.groups) {
        trip.groups.forEach(g => {
            if (g.guide && !isPlaceholder(g.guide)) {
                staffSet.add(g.guide.trim().toLowerCase());
            }
            if (g.apoyo && !isPlaceholder(g.apoyo)) {
                staffSet.add(g.apoyo.trim().toLowerCase());
            }
        });
    }
    
    return guestCount + staffSet.size;
};

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
    
    // Initialize Mobile Staff Tab View Default State
    if (typeof window.selectMobileStaff === 'function') {
        window.selectMobileStaff('capitanes');
    }

    // Initialize Mobile Date Picker (Flatpickr)
    const mInput = document.getElementById('mobile-date-picker-input');
    const trigger = document.getElementById('mobile-calendar-trigger');
    if(mInput) {
        const fp = flatpickr(mInput, {
            dateFormat: "Y-m-d",
            defaultDate: currentDate,
            disableMobile: true, // Prevent native date widgets that show duplicate boxes on mobile
            positionElement: trigger || undefined,
            onChange: function(selectedDates, dateStr, instance) {
                if(selectedDates.length > 0) {
                    currentDate = selectedDates[0];
                    miniCalendarDate = new Date(currentDate);
                    if (typeof window.syncActiveMonthListeners === 'function') window.syncActiveMonthListeners();
                    updateDateHeaders(); renderDailyGrid(); renderMiniCalendar();
                }
            }
        });
        if(trigger) {
            trigger.addEventListener('click', () => fp.open());
        }
    }
});

function switchView(view) {
    // Block staff users from accessing staff management dashboard
    if (view === 'staff' && window.isStaffLoggedIn) {
        showToast("🔒 Acceso denegado", "error");
        return;
    }
    activeViewMode = view;
    ['view-daily', 'view-monthly', 'view-staff'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('opacity-0', 'pointer-events-none', 'z-0');
        if(el) el.classList.remove('z-10');
    });
    const activeEl = document.getElementById(`view-${view}`);
    if(activeEl) activeEl.classList.remove('opacity-0', 'pointer-events-none', 'z-0');
    if(activeEl) activeEl.classList.add('z-10');
    
    // Desktop Nav Items Highlight
    ['daily', 'monthly', 'staff'].forEach(tab => {
        const btn = document.getElementById(`btn-view-${tab}`);
        if(btn) {
            if(tab === view) {
                btn.className = 'px-6 py-2 rounded-lg text-sm font-black transition-all bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm ring-1 ring-orange-500/20';
            } else {
                btn.className = 'px-6 py-2 rounded-lg text-sm font-bold transition-all text-slate-500 hover:text-slate-800 hover:bg-white/50';
            }
        }
    });

    // Mobile Bottom Nav Items Highlight
    ['daily', 'monthly', 'staff'].forEach(tab => {
        const mBtn = document.getElementById(`m-nav-${tab}`);
        if(mBtn) {
            if(tab === view) {
                mBtn.classList.remove('text-slate-400');
                mBtn.classList.add('text-orange-500');
                const span = mBtn.querySelector('span');
                if (span) {
                    span.classList.remove('font-bold');
                    span.classList.add('font-black');
                }
            } else {
                mBtn.classList.remove('text-orange-500');
                mBtn.classList.add('text-slate-400');
                const span = mBtn.querySelector('span');
                if (span) {
                    span.classList.remove('font-black');
                    span.classList.add('font-bold');
                }
            }
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
    if (typeof window.syncActiveMonthListeners === 'function') window.syncActiveMonthListeners();
    updateDateHeaders(); renderDailyGrid(); renderMonthlyCalendar(); renderMiniCalendar();
}
function goToToday() {
    currentDate = new Date(); miniCalendarDate = new Date(currentDate); 
    if (typeof window.syncActiveMonthListeners === 'function') window.syncActiveMonthListeners();
    updateDateHeaders(); renderDailyGrid(); renderMonthlyCalendar(); renderMiniCalendar();
}
function changeMonth(offset) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    
    // Create temporary date at the 1st of the target month
    const targetDate = new Date(year, month + offset, 1);
    const maxDays = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(day, maxDays);
    
    currentDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDay);
    miniCalendarDate = new Date(currentDate);
    
    if (typeof window.syncActiveMonthListeners === 'function') window.syncActiveMonthListeners();
    updateDateHeaders(); renderDailyGrid(); renderMonthlyCalendar(); renderMiniCalendar();
}
function changeMiniMonth(offset) {
    miniCalendarDate.setDate(1);
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
            if (typeof window.syncActiveMonthListeners === 'function') window.syncActiveMonthListeners();
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
        
        const tripsToday = allTrips.filter(t => t.date === dateStr && !t.cancelled && monthlySiteFilters.includes(t.site || ''));
        const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
        
        const cell = document.createElement('div');
        cell.className = `bg-white rounded-xl border ${isToday ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'} p-2 min-h-[120px] flex flex-col transition-all cursor-pointer`;
        cell.onclick = () => {
            currentDate = new Date(year, month, day);
            if (typeof window.syncActiveMonthListeners === 'function') window.syncActiveMonthListeners();
            updateDateHeaders(); switchView('daily'); renderDailyGrid(); renderMiniCalendar();
        };

        let tripsHtml = '<div class="space-y-1 mt-2">';
        tripsToday.forEach(trip => {
            const siteColor = SITE_COLORS[trip.site] || 'bg-slate-100 text-slate-800 border-slate-200';
            const guests = trip.guests ? trip.guests.filter(g => !g.cancelled).length : 0;
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
// Render warning alerts at the top of daily view (e.g. Captains on Day Off)
function renderDailyAlerts(targetDateStr) {
    const alertsContainer = document.getElementById('daily-alerts-container');
    if (!alertsContainer) return;
    
    alertsContainer.innerHTML = '';
    
    const monthKey = targetDateStr.substring(0, 7);
    const schedule = window.staffSchedulesData ? window.staffSchedulesData.get(monthKey) : null;
    
    const captainsOff = [];
    const captains = window.staffDatabase ? (window.staffDatabase.capitanes || []) : [];
    
    if (schedule && schedule.daysOff) {
        captains.forEach(captain => {
            const list = schedule.daysOff[captain.nombre] || [];
            if (list.includes(targetDateStr)) {
                // Get display name: Abel, Tom, etc.
                const firstName = window.getFirstName ? window.getFirstName(captain.nombre) : captain.nombre;
                const capitalized = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
                captainsOff.push(capitalized);
            }
        });
    }
    
    if (captainsOff.length > 0) {
        alertsContainer.classList.remove('hidden');
        captainsOff.forEach(name => {
            const badge = document.createElement('div');
            badge.className = 'flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm animate-pulse';
            badge.innerHTML = `
                <svg class="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                <span>${name} libre</span>
            `;
            alertsContainer.appendChild(badge);
        });
    } else {
        alertsContainer.classList.add('hidden');
    }
}

function renderDailyGrid() {
    const container = document.getElementById('daily-grid-container');
    if(!container) return;
    container.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const targetDateStr = `${year}-${month}-${day}`;

    // Render Captain on Day Off alerts at the top
    renderDailyAlerts(targetDateStr);

    const todaysTrips = mergedAllocations.filter(t => t.date === targetDateStr);
    
    // We establish the 4 columns: Time, Ares, Kaiser, Shore
    container.className = 'grid grid-cols-[60px_1fr_1fr_1fr] gap-8 pb-12 px-2 md:min-w-[800px] min-w-0 w-full';

    const timeCol = document.createElement('div');
    timeCol.className = 'flex flex-col gap-4 pt-[60px]';
    
    const createCol = (title) => {
        const col = document.createElement('div');
        col.className = 'bg-orange-100/60 rounded-[24px] p-3 flex flex-col gap-4 border border-orange-200/50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] min-h-[600px] w-full min-w-0';
        
        // Enlarged font and applied the solid Mangamar Orange gradient
        col.innerHTML = `<div class="h-12 flex items-center justify-center bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl mb-1 shadow-md border border-orange-300 shrink-0 z-20">
            <span class="text-sm font-black text-white uppercase tracking-widest">${title}</span>
        </div>`;
        return col;
    };

    const aresCol = createCol('Ares');
    const kaiserCol = createCol('Kaiser');
    const shoreCol = createCol('Shore / Aula');

    const activeTimes = todaysTrips.some(t => t.time === '07:00') ? TIMES : TIMES.filter(t => t !== '07:00');

    activeTimes.forEach(time => {
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

        // Prioritize active (not cancelled) trips first so they are assigned to the main slot (rendered on the left)
        const activeTrips = finalTrips.filter(t => !t.cancelled);
        const cancelledTrips = finalTrips.filter(t => t.cancelled);

        const processTrips = (list) => {
            // 1. Asignaciones explícitas primero (Visor y luego Interno)
            list.filter(t => t.isVisor && t.assignedBoat).forEach(t => forcePlace(t, t.assignedBoat));
            list.filter(t => !t.isVisor && t.assignedBoat).forEach(t => forcePlace(t, t.assignedBoat));

            // 2. Viajes sin asignar llenan los huecos vacíos
            list.filter(t => t.isVisor && !t.assignedBoat).forEach(t => findEmptyBoat(t));
            list.filter(t => !t.isVisor && !t.assignedBoat).forEach(t => findEmptyBoat(t));
        };

        processTrips(activeTrips);
        processTrips(cancelledTrips);

        // Creates a fixed-height slot that can accept drag-and-drop and squishes cards side-by-side on conflict
        const appendSlot = (parentCol, mainTrip, conflictArray, boatId, timeSlot) => {
            const slotContainer = document.createElement('div');
            // Fixed height container ensures the grid NEVER shifts out of alignment
            slotContainer.className = "h-[130px] w-full flex gap-2 relative rounded-2xl transition-all min-w-0";
            
            // Mobile-only time indicator at the top of the slot
            const mobileTimeDivider = document.createElement('div');
            mobileTimeDivider.className = "flex md:hidden items-center gap-2 w-full mt-2 mb-1 shrink-0 select-none";
            mobileTimeDivider.innerHTML = `
                <span class="text-[10px] font-black text-slate-500 bg-slate-100 border border-slate-200/85 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-xs shrink-0">
                    <svg class="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${timeSlot}
                </span>
                <div class="h-px bg-slate-200/80 flex-1"></div>
            `;
            slotContainer.appendChild(mobileTimeDivider);
            
            // Drag and Drop Zones
            slotContainer.ondragover = (e) => { e.preventDefault(); slotContainer.classList.add('bg-blue-50', 'ring-2', 'ring-blue-400'); };
            slotContainer.ondragleave = (e) => { slotContainer.classList.remove('bg-blue-50', 'ring-2', 'ring-blue-400'); };
            slotContainer.ondrop = (e) => {
                e.preventDefault();
                slotContainer.classList.remove('bg-blue-50', 'ring-2', 'ring-blue-400');
                handleDrop(e, boatId, timeSlot);
            };

            const allTripsInSlot = [mainTrip, ...(conflictArray || [])].filter(Boolean);
            const hasActiveTrip = allTripsInSlot.some(t => !t.cancelled);
            const showEmptySlot = (allTripsInSlot.length === 0) || !hasActiveTrip;
            
            const totalItemsToRender = allTripsInSlot.length + (showEmptySlot && allTripsInSlot.length > 0 ? 1 : 0);
            const isCompact = totalItemsToRender > 1;

            if (allTripsInSlot.length === 0) {
                const empty = document.createElement('div');
                empty.className = "w-full h-full rounded-2xl border border-dashed border-slate-300 hover:bg-white hover:shadow-sm cursor-pointer transition-all flex items-center justify-center group auth-hide";
                empty.onclick = () => openManageBoatModal(null, boatId, timeSlot, targetDateStr);
                empty.innerHTML = `<svg class="w-8 h-8 text-slate-200 group-hover:text-blue-400 group-hover:scale-110 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>`;
                slotContainer.appendChild(empty);
            } else {
                const getIsConflict = (trip, isIndexConflict) => {
                    if (trip.cancelled) return false;
                    const activeTripsInSlot = allTripsInSlot.filter(t => !t.cancelled);
                    if (boatId !== 'shore') {
                        return activeTripsInSlot.length > 1;
                    }
                    const countSameSite = activeTripsInSlot.filter(t => t.site === trip.site).length;
                    return countSameSite > 1;
                };

                if (mainTrip) {
                    slotContainer.appendChild(buildBoatCard(mainTrip, boatId, timeSlot, targetDateStr, isCompact, getIsConflict(mainTrip, false)));
                }
                if (conflictArray) {
                    conflictArray.forEach(conflictTrip => {
                        slotContainer.appendChild(buildBoatCard(conflictTrip, boatId, timeSlot, targetDateStr, isCompact, getIsConflict(conflictTrip, true)));
                    });
                }
                if (showEmptySlot && allTripsInSlot.length > 0) {
                    const empty = document.createElement('div');
                    empty.className = "flex-1 min-w-0 h-full rounded-2xl border border-dashed border-slate-300 hover:bg-white hover:shadow-sm cursor-pointer transition-all flex items-center justify-center group auth-hide";
                    empty.onclick = () => openManageBoatModal(null, boatId, timeSlot, targetDateStr);
                    empty.innerHTML = `<svg class="w-8 h-8 text-slate-200 group-hover:text-blue-400 group-hover:scale-110 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>`;
                    slotContainer.appendChild(empty);
                }
            }

            // Append the hover gap zone between Ares and Kaiser
            if (boatId === 'ares' && aTrip && kTrip) {
                const gapZone = document.createElement('div');
                gapZone.className = "absolute top-0 flex items-center justify-center group/gap z-20 cursor-default";
                gapZone.style.right = "-45px";
                gapZone.style.width = "32px";
                gapZone.style.height = "130px";
                gapZone.innerHTML = `
                    <button onclick="window.openMoveDiversModal('${timeSlot}')" 
                            title="Mover buceadores/grupos" 
                            class="hidden group-hover/gap:flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-md border border-orange-400 hover:scale-110 active:scale-95 transition-all duration-150 cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4-4m-4 4l4 4" />
                        </svg>
                    </button>
                `;
                slotContainer.appendChild(gapZone);
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

    // Automatically re-run live search on render if a query is active
    if (window.activeDailySearchQuery) {
        window.executeDailySearch(window.activeDailySearchQuery);
    }

    // Apply selected mobile boat grid visibility
    if (typeof window.selectMobileBoat === 'function') {
        window.selectMobileBoat(window.activeMobileBoat || 'ares');
    }
}

function buildBoatCard(trip, boatId, time, dateStr, isCompact = false, isConflict = false) {
    const col = document.createElement('div');
    col.setAttribute('data-trip-id', trip.id);
    const guests = trip.guests || [];
    const guestCount = guests.filter(g => !g.cancelled).length;
    const siteColorConfig = trip.cancelled
        ? 'bg-slate-200 text-slate-500 border-slate-350'
        : (SITE_COLORS[trip.site] || 'bg-slate-100 text-slate-800 border-slate-300');
    
    let hasVisorTag = (trip.isVisor && (!trip.isInternalTrip || trip.site === trip.originalVisorSite));

    let previewHtml = (trip.groups || []).map(group => {
        const guideName = window.getFirstName(group.guide || 'Sin Guía').toUpperCase();
        const apoyoName = group.apoyo ? `(APOYO: ${window.getFirstName(group.apoyo)})`.toUpperCase() : '';
        const titleText = apoyoName ? `${guideName} ${apoyoName}` : guideName;

        // Cluster guests by bookingTag so we can wrap them in subtle colored background boxes
        const clusters = [];
        let currentCluster = null;
        (group.guests || []).forEach(g => {
            const tag = g.bookingTag || 'NONE';
            if (!currentCluster || currentCluster.tag !== tag) {
                currentCluster = { tag: tag, guests: [] };
                clusters.push(currentCluster);
            }
            currentCluster.guests.push(g);
        });

        const clustersHtml = clusters.map(cluster => {
            let wrapStart = '<div class="px-1 py-0.5">';
            let wrapEnd = '</div>';

            if (cluster.tag !== 'NONE' && typeof getGroupColorClass === 'function') {
                const hexColor = getGroupColorClass(cluster.tag);
                if (hexColor && hexColor !== '#ffffff') {
                    const r = parseInt(hexColor.slice(1, 3), 16) || 0;
                    const gHex = parseInt(hexColor.slice(3, 5), 16) || 0;
                    const b = parseInt(hexColor.slice(5, 7), 16) || 0;
                    wrapStart = `<div class="px-1.5 py-0.5 mb-1 rounded-md" style="background-color: rgba(${r},${gHex},${b},0.15); box-shadow: inset 0 0 0 1px rgba(${r},${gHex},${b},0.25);">`;
                }
            }

            const guestsHtml = cluster.guests.map(g => {
                const isNitrox = (g.gas || '').includes('EAN');
                const gasColorClass = g.cancelled ? 'text-slate-500 line-through' : isNitrox ? 'text-green-400' : 'text-blue-300';
                const gasColorHex = g.cancelled ? '#64748b' : isNitrox ? '#4ade80' : '#93c5fd'; // Slate for Cancelled, Green for Nitrox, Blue for Aire
                const gasShort = (g.gas || '15L Aire').replace('Aire', 'Aire').replace(/EAN\s*(\d+)/i, '$1%');
                const arrivedDot = g.cancelled 
                    ? `<span class="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mr-1.5" title="Cancelado"></span>` 
                    : g.arrived 
                        ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mr-1.5" title="Llegado"></span>` 
                        : '';
                
                let displayName = g.nombre;
                if (window.activeDailySearchQuery) {
                    const normQuery = window.normalizeSearchString(window.activeDailySearchQuery);
                    if (normQuery) {
                        const dniMatch = g.dni && window.normalizeSearchString(g.dni).includes(normQuery);
                        const nameNorm = window.normalizeSearchString(g.nombre);
                        
                        if (nameNorm.includes(normQuery)) {
                            const searchWords = window.activeDailySearchQuery.split(/\s+/).filter(w => w.length >= 2);
                            if (searchWords.length > 0) {
                                searchWords.forEach(word => {
                                    const wordNorm = window.normalizeSearchString(word);
                                    if (wordNorm) {
                                        displayName = displayName.replace(new RegExp(word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), match => `<mark class="bg-emerald-400 text-slate-950 font-black rounded-sm px-1 shadow-sm">${match}</mark>`);
                                    }
                                });
                            } else {
                                displayName = displayName.replace(new RegExp(window.activeDailySearchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), match => `<mark class="bg-emerald-400 text-slate-950 font-black rounded-sm px-1 shadow-sm">${match}</mark>`);
                            }
                        } else if (dniMatch) {
                            displayName = `<mark class="bg-emerald-400/40 text-white font-black rounded-sm px-1 shadow-xs">${g.nombre}</mark>`;
                        }
                    }
                }

                // Same logic as TV board to construct an orange course badge (visible on desktop and mobile)
                const isSnorkel = (g.baseCourse === "Snorkeling" || g.courseBadge === "Snorkel" || (g.baseCourse && g.baseCourse.toLowerCase().includes("snorkel")) || (g.course && g.course.toLowerCase().includes("snorkel")));
                const courseText = isSnorkel ? 'SNORKEL' : (g.courseBadge || g.course || '');
                let mobileCourseHtml = '';
                if (courseText) {
                    mobileCourseHtml = `<span class="inline-block text-[8.5px] font-black text-white rounded px-1.5 py-0.5 ml-1.5 uppercase tracking-wide shrink-0 leading-none shadow-sm" style="background-color: #f97316 !important; border-color: #ea580c !important; color: #ffffff !important;">${courseText}</span>`;
                }

                const cancelledClass = g.cancelled ? 'line-through text-slate-400/80 opacity-60' : 'text-white group-hover:text-blue-300 hover:text-blue-400';

                // Paid indicator (gold euro coin badge)
                let outstandingDebt = undefined;
                const customerInfo = (window.customerDatabase || []).find(c => c.dni === g.dni);
                if (customerInfo) {
                    outstandingDebt = customerInfo.outstandingDebt;
                    
                    const now = Date.now();
                    const shouldFetch = (outstandingDebt === undefined) || 
                                        (g.paymentStatus === 'paid' && outstandingDebt > 0 && (!customerInfo.lastDebtFetchTime || now - customerInfo.lastDebtFetchTime > 8000));
                    
                    if (shouldFetch && !g.cancelled) {
                        if (!window._fetchingDnis) window._fetchingDnis = new Set();
                        if (!window._fetchingDnis.has(g.dni)) {
                            window._fetchingDnis.add(g.dni);
                            customerInfo.lastDebtFetchTime = now;
                            db.collection('mangamar_customers').doc(g.dni).get().then(snap => {
                                if (snap.exists) {
                                    const debtVal = snap.data().outstandingDebt;
                                    if (debtVal !== undefined) {
                                        // If this guest's trip is paid but Firestore shows debt > 0,
                                        // the stored value is stale (e.g. from before a payment was fixed).
                                        // Queue for batched recalculation — avoids 22 simultaneous
                                        // history-collection reads + Firestore writes when a large trip loads.
                                        if (debtVal > 0 && g.paymentStatus === 'paid') {
                                            if (!window._pendingDebtRecalcDnis) window._pendingDebtRecalcDnis = new Set();
                                            window._pendingDebtRecalcDnis.add(g.dni);
                                            clearTimeout(window._debtRecalcTimer);
                                            window._debtRecalcTimer = setTimeout(() => {
                                                const dnis = Array.from(window._pendingDebtRecalcDnis);
                                                window._pendingDebtRecalcDnis.clear();
                                                window._debtRecalcTimer = null;
                                                // updateMultipleCustomersOutstandingDebt runs them sequentially
                                                // (one history fetch at a time) and does a single master_list write.
                                                if (typeof window.updateMultipleCustomersOutstandingDebt === 'function') {
                                                    window.updateMultipleCustomersOutstandingDebt(dnis);
                                                }
                                            }, 500);
                                        } else {
                                            customerInfo.outstandingDebt = debtVal;
                                            if (window.mergeAndRender) window.mergeAndRender();
                                        }
                                    } else {
                                        // Legacy client without computed debt — also batch.
                                        if (!window._pendingDebtRecalcDnis) window._pendingDebtRecalcDnis = new Set();
                                        window._pendingDebtRecalcDnis.add(g.dni);
                                        clearTimeout(window._debtRecalcTimer);
                                        window._debtRecalcTimer = setTimeout(() => {
                                            const dnis = Array.from(window._pendingDebtRecalcDnis);
                                            window._pendingDebtRecalcDnis.clear();
                                            window._debtRecalcTimer = null;
                                            if (typeof window.updateMultipleCustomersOutstandingDebt === 'function') {
                                                window.updateMultipleCustomersOutstandingDebt(dnis);
                                            }
                                        }, 500);
                                    }
                                } else {
                                    customerInfo.outstandingDebt = 999;
                                }
                                window._fetchingDnis.delete(g.dni);
                            }).catch(() => window._fetchingDnis.delete(g.dni));
                        }
                    }
                }

                const isPaid = (outstandingDebt === 0) || (g.paymentStatus === 'paid' && outstandingDebt === undefined);
                const euroBadge = (isPaid && !g.cancelled) 
                    ? `<span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ml-1 shadow-sm shrink-0 select-none" style="vertical-align: middle; background: linear-gradient(135deg, #ffe066, #d4af37);" title="Liquidado (Pagado)"><svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 2.5C8 2.1 7.3 1.8 6.5 1.8C4.3 1.8 2.5 3.2 2.5 5C2.5 6.8 4.3 8.2 6.5 8.2C7.3 8.2 8.0 7.9 8.5 7.5M1.5 4.2H6M1.5 5.8H6" stroke="black" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` 
                    : '';

                return `<div class="flex justify-between items-center text-[10px] mb-0.5 last:mb-0 group/item">
                            <div class="flex items-center min-w-0 flex-1">
                                ${arrivedDot}
                                <button onclick="if(!window.isLoggedIn || window.isStaffLoggedIn) { event.preventDefault(); return; } event.stopPropagation(); openCustomerProfile('${g.dni}', '${g.nombre.replace(/'/g, "\\'")}')" 
                                        class="block truncate flex-1 min-w-0 pr-1 font-bold focus:outline-none focus:ring-opacity-0 transition-colors cursor-pointer text-left auth-lock ${cancelledClass}">
                                    ${displayName}
                                </button>
                                ${euroBadge}
                                ${mobileCourseHtml}
                            </div>
                            <span class="shrink-0 font-black ${gasColorClass} text-[8px] ml-2" style="color: ${gasColorHex} !important;">${gasShort}</span>
                        </div>`;
            }).join('');

            return wrapStart + guestsHtml + wrapEnd;
        }).join('');

        return `<div class="mb-1.5 last:mb-0 border-b border-white/10 pb-1 last:border-0 last:pb-0">
                    <div class="text-[8px] font-black text-orange-400 mb-0.5 tracking-widest">${titleText}</div>
                    ${clustersHtml || '<div class="text-[9px] italic text-slate-500">Vacío</div>'}
                </div>`;
    }).join('');

    if(!previewHtml || guestCount === 0) previewHtml = `<div class="text-[10px] text-slate-400 italic text-center">Sin grupos</div>`;

    const topBarColor = siteColorConfig.split(' ')[0] || 'bg-slate-200';
    const capacityNum = boatId === 'shore' ? 0 : (parseInt(trip.maxDives) || parseInt(trip.pax) || parseInt(trip.plazas) || (BOATS[boatId] ? BOATS[boatId].maxGuests : 12));
    const capacity = boatId === 'shore' ? '-' : capacityNum;
    
    if (!window.isStaffLoggedIn) {
        col.draggable = true;
        col.ondragstart = (e) => {
            e.stopPropagation();
            e.dataTransfer.setData('text/plain', trip.id);
            document.body.classList.add('is-dragging');
        };
        col.ondragend = (e) => {
            document.body.classList.remove('is-dragging');
        };
    } else {
        col.draggable = false;
    }

    let capName = trip.captain ? window.getFirstName(trip.captain) : '';
    let isShore = boatId === 'shore';
    let percent = isShore ? 0 : Math.min(100, Math.round((guestCount / capacityNum) * 100));
    
    let barColor = trip.cancelled ? 'bg-slate-300' : 'bg-orange-500';

    let cardBaseClass = trip.cancelled
        ? "bg-slate-50 border-slate-200 opacity-60 shadow-none border border-dashed"
        : (isConflict ? "bg-red-50 border-red-500 shadow-md border-2" : "bg-white border-slate-200 shadow-sm border hover:shadow-md hover:border-blue-300");
    
    // Increased height to 115px to fit the new lines comfortably
    col.className = `group-tooltip relative rounded-2xl transition-all flex flex-col h-[115px] shrink-0 z-10 hover:z-[100] ${isCompact ? 'flex-1 min-w-0' : 'w-full'} ${cardBaseClass}`;
    if (!window.isStaffLoggedIn) {
        col.className += " cursor-grab active:cursor-grabbing";
        col.onclick = () => openManageBoatModal(trip, boatId, time, dateStr);
    } else {
        col.className += " cursor-default";
    }

    let guideNames = '';
    if (trip.groups && trip.groups.length > 0) {
        const parts = trip.groups.map(g => {
            if (!g.guide && !g.apoyo) return null;
            if (g.guide && g.apoyo) return `${window.getFirstName(g.guide)} (Apoyo: ${window.getFirstName(g.apoyo)})`;
            if (g.guide) return window.getFirstName(g.guide);
            return `Apoyo: ${window.getFirstName(g.apoyo)}`;
        }).filter(Boolean);
        if (parts.length > 0) guideNames = parts.join(', ');
    } else if (trip.guide) { guideNames = window.getFirstName(trip.guide); }

    const radioTimesHtml = `
    <div class="md:grid hidden grid-cols-3 gap-2 text-center mb-3">
        <div class="flex flex-col items-center justify-center p-1 rounded-lg border transition-all duration-200 ${trip.timeSaliendo ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 font-black' : 'bg-slate-800/40 border-slate-700/50 text-slate-500 font-bold'}" title="Saliendo">
            <span class="text-[7px] font-black uppercase tracking-wider mb-0.5 opacity-60">Saliendo</span>
            <div class="flex items-center gap-0.5 text-[8.5px] leading-none">
                <span>${(window.formatTimeToHHMM && window.formatTimeToHHMM(trip.timeSaliendo)) || trip.timeSaliendo || '--:--'}</span>
            </div>
        </div>
        <div class="flex flex-col items-center justify-center p-1 rounded-lg border transition-all duration-200 ${trip.timeBuzosAgua ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 font-black' : 'bg-slate-800/40 border-slate-700/50 text-slate-500 font-bold'}" title="Buzos en Agua">
            <span class="text-[7px] font-black uppercase tracking-wider mb-0.5 opacity-60">En Agua</span>
            <div class="flex items-center gap-0.5 text-[8.5px] leading-none">
                <span>${(window.formatTimeToHHMM && window.formatTimeToHHMM(trip.timeBuzosAgua)) || trip.timeBuzosAgua || '--:--'}</span>
            </div>
        </div>
        <div class="flex flex-col items-center justify-center p-1 rounded-lg border transition-all duration-200 ${trip.timeVolviendo ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-black' : 'bg-slate-800/40 border-slate-700/50 text-slate-500 font-bold'}" title="Volviendo a Puerto">
            <span class="text-[7px] font-black uppercase tracking-wider mb-0.5 opacity-60">Regreso</span>
            <div class="flex items-center gap-0.5 text-[8.5px] leading-none">
                <span>${(window.formatTimeToHHMM && window.formatTimeToHHMM(trip.timeVolviendo)) || trip.timeVolviendo || '--:--'}</span>
            </div>
        </div>
    </div>
    `;

    col.innerHTML = `
        <div class="w-full h-full flex flex-col overflow-hidden rounded-[15px]">
            ${(!trip.cancelled && isConflict) ? `<div class="bg-red-500 text-white text-[9px] font-black text-center uppercase py-0.5 shrink-0">⚠️ OVERBOOK</div>` : ''}
            <div class="h-1.5 w-full shrink-0 ${trip.cancelled ? 'bg-slate-300' : topBarColor}"></div> 
            <div class="p-2.5 flex-1 flex flex-col justify-between overflow-hidden gap-1">
                <div class="flex items-center gap-1.5 overflow-hidden min-w-0 shrink-0 w-full">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-black border ${siteColorConfig} truncate leading-tight shrink-0 max-w-[70%]">${trip.site || 'Sin Destino'}</span>
                    ${trip.cancelled 
                        ? `<span class="text-[7px] font-black uppercase text-rose-700 tracking-widest bg-rose-50 px-1 rounded border border-rose-200 flex items-center shrink-0">ANULADA</span>`
                        : hasVisorTag 
                            ? (trip.rmLocked 
                                ? `<span class="text-[7px] font-black uppercase text-emerald-700 tracking-widest bg-emerald-50 px-1 rounded border border-emerald-300 flex items-center shrink-0">VISOR</span>`
                                : `<span class="text-[7px] font-black uppercase text-orange-600 tracking-widest bg-orange-50 px-1 rounded border border-orange-200 flex items-center shrink-0">VISOR</span>`
                            ) 
                            : ''
                    }
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
                        <span class="text-[10px] font-black ${(!isShore && guestCount >= capacityNum) ? 'text-red-500' : 'text-slate-800'} leading-none">${guestCount} ${isShore ? 'pax' : '/ ' + capacityNum} (total: ${window.calculateTotalPeopleOnBoat(trip)})</span>
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
        </div>
        
        <div class="tooltip-content absolute z-[999] p-3 bg-slate-900 rounded-xl shadow-2xl w-64 border border-slate-700 pointer-events-auto" style="${boatId === 'shore' ? 'top: -5px; right: calc(100% + 2px);' : 'top: -5px; left: calc(100% + 2px);'}">
            ${radioTimesHtml}
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
    if (window.isStaffLoggedIn) {
        showToast("🔒 Acceso denegado", "error");
        return;
    }
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
                if (gst.dni && !gst.cancelled) {
                    const historyRef = db.collection('mangamar_customers').doc(gst.dni).collection('history').doc(tripId);
                    historyBatch.set(historyRef, {
                        date: updatedTrip.date || '',
                        time: updatedTrip.time || '',
                        site: updatedTrip.site || '',
                        assignedBoat: updatedTrip.assignedBoat || '',
                        gas: gst.gas || '15L Aire',
                        rental: gst.course ? 'INC' : (gst.rental || 0),
                        computer: gst.course ? 'INC' : (gst.computer || 0),
                        computerPrice: gst.course ? 0 : (gst.computer ? (gst.computerPrice || 7) : 0),
                        insurance: gst.course ? 'INC' : (gst.insurance || 0),
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
    const gate = document.getElementById('login-gate');
    const token = localStorage.getItem('mangaToken');
    const role = localStorage.getItem('mangaRole');
    
    if (token === 'true') {
        window.isLoggedIn = true;
        document.body.classList.add('logged-in');
        if (gate) gate.classList.add('hidden');
        
        if (role === 'staff') {
            window.isStaffLoggedIn = true;
            document.body.classList.add('staff-logged-in');
        } else {
            window.isStaffLoggedIn = false;
            document.body.classList.remove('staff-logged-in');
        }
    } else {
        window.isLoggedIn = false;
        window.isStaffLoggedIn = false;
        document.body.classList.remove('logged-in');
        document.body.classList.remove('staff-logged-in');
        if (gate) gate.classList.remove('hidden');
        
        const tvModal = document.getElementById('tv-view-modal');
        if (tvModal) tvModal.classList.add('hidden');
    }
    updateAuthButtonUI();
};

window.toggleGatePasswordView = function(btn) {
    const p = document.getElementById('gate-password-input');
    if (!p) return;
    const isPass = p.type === 'password';
    p.type = isPass ? 'text' : 'password';
    btn.innerHTML = isPass ?
        '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>'
        : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>';
};

window.attemptGateLogin = function() {
    const pwInput = document.getElementById('gate-password-input');
    const roleSelect = document.getElementById('gate-role-select');
    if (!pwInput) return;
    const pw = pwInput.value;
    const selectedRole = roleSelect ? roleSelect.value : 'admin';
    
    if (selectedRole === 'admin') {
        if (pw !== window.adminPassword) {
            showToast("❌ Contraseña incorrecta para Administración", "error");
            return;
        }
        window.isLoggedIn = true;
        window.isStaffLoggedIn = false;
        localStorage.setItem('mangaToken', 'true');
        localStorage.setItem('mangaRole', 'admin');
        document.body.classList.add('logged-in');
        document.body.classList.remove('staff-logged-in');
        
        const gate = document.getElementById('login-gate');
        if (gate) gate.classList.add('hidden');
        
        updateAuthButtonUI();
        showToast("✅ ¡Bienvenido, Administrador (Mangamar)!");
        pwInput.value = "";
    } else if (selectedRole === 'staff') {
        if (pw !== "mangastaff123") {
            showToast("❌ Contraseña incorrecta para Staff", "error");
            return;
        }
        window.isLoggedIn = true;
        window.isStaffLoggedIn = true;
        localStorage.setItem('mangaToken', 'true');
        localStorage.setItem('mangaRole', 'staff');
        document.body.classList.add('logged-in');
        document.body.classList.add('staff-logged-in');
        
        const gate = document.getElementById('login-gate');
        if (gate) gate.classList.add('hidden');
        
        updateAuthButtonUI();
        showToast("✅ Has iniciado sesión como Personal (Staff)");
        pwInput.value = "";
    }
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
    const roleSelect = document.getElementById('login-role-select');
    const selectedRole = roleSelect ? roleSelect.value : 'admin';
    
    if (selectedRole === 'admin') {
        if (pw !== window.adminPassword) {
            showToast("❌ Contraseña incorrecta para Administración", "error");
            return;
        }
        window.isLoggedIn = true;
        window.isStaffLoggedIn = false;
        localStorage.setItem('mangaToken', 'true');
        localStorage.setItem('mangaRole', 'admin');
        document.body.classList.add('logged-in');
        document.body.classList.remove('staff-logged-in');
        
        if(typeof closeGlobalModal === 'function') closeGlobalModal('login-modal');
        else document.getElementById('login-modal').classList.add('hidden');
        
        const gate = document.getElementById('login-gate');
        if (gate) gate.classList.add('hidden');
        
        updateAuthButtonUI();
        showToast("✅ Has iniciado sesión como Administrador (Mangamar)");
        document.getElementById('login-password-input').value = "";
    } else if (selectedRole === 'staff') {
        if (pw !== "mangastaff123") {
            showToast("❌ Contraseña incorrecta para Staff", "error");
            return;
        }
        window.isLoggedIn = true;
        window.isStaffLoggedIn = true;
        localStorage.setItem('mangaToken', 'true');
        localStorage.setItem('mangaRole', 'staff');
        document.body.classList.add('logged-in');
        document.body.classList.add('staff-logged-in');
        
        if(typeof closeGlobalModal === 'function') closeGlobalModal('login-modal');
        else document.getElementById('login-modal').classList.add('hidden');
        
        const gate = document.getElementById('login-gate');
        if (gate) gate.classList.add('hidden');
        
        updateAuthButtonUI();
        showToast("✅ Has iniciado sesión como Personal (Staff)");
        document.getElementById('login-password-input').value = "";
    }
};

window.logout = function() {
    window.isLoggedIn = false;
    window.isStaffLoggedIn = false;
    localStorage.removeItem('mangaToken');
    localStorage.removeItem('mangaRole');
    document.body.classList.remove('logged-in');
    document.body.classList.remove('staff-logged-in');
    
    const tvModal = document.getElementById('tv-view-modal');
    if (tvModal) tvModal.classList.add('hidden');
    
    const gate = document.getElementById('login-gate');
    if (gate) gate.classList.remove('hidden');
    
    updateAuthButtonUI();
    showToast("🔒 Sesión cerrada.");
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
            // Update the button label to reflect the role
            const roleLabel = btnIn.querySelector('button');
            if (roleLabel) {
                const svgPart = roleLabel.querySelector('svg');
                const svgHTML = svgPart ? svgPart.outerHTML : '';
                roleLabel.innerHTML = (window.isStaffLoggedIn ? 'Staff ' : 'Mangamar ') + svgHTML;
            }
        } else {
            btnOut.classList.remove('hidden');
            btnIn.classList.add('hidden');
        }
    }

    // Mobile auth buttons support
    const mBtnOut = document.getElementById('m-auth-btn-logged-out');
    const mBtnIn = document.getElementById('m-auth-btn-logged-in');
    const mRoleLabel = document.getElementById('m-auth-role-label');
    if(mBtnOut && mBtnIn) {
        if(window.isLoggedIn) {
            mBtnOut.classList.add('hidden');
            mBtnIn.classList.remove('hidden');
            if(mRoleLabel) {
                mRoleLabel.innerText = window.isStaffLoggedIn ? 'Staff ▾' : 'Mangamar ▾';
            }
        } else {
            mBtnOut.classList.remove('hidden');
            mBtnIn.classList.add('hidden');
        }
    }
};

window.toggleAuthDropdown = function() {
    const dd = document.getElementById('auth-dropdown');
    if(dd) dd.classList.toggle('hidden');
};

window.toggleMobileAuthDropdown = function() {
    const dd = document.getElementById('m-auth-dropdown');
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

// ==========================================
// 14. APPLICATION SETTINGS SYSTEM
// ==========================================
window.appSettings = window.appSettings || {};
if (window.appSettings.showTVRadioTimes === undefined) {
    window.appSettings.showTVRadioTimes = localStorage.getItem('mangamar_setting_show_tv_radio_times') !== 'false';
}

window.openSettingsModal = function() {
    const toggleInput = document.getElementById('setting-toggle-radio-times');
    if (toggleInput) {
        toggleInput.checked = window.appSettings.showTVRadioTimes !== false;
    }
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('hidden');
};

window.handleSettingsRadioTimesToggle = function(checked) {
    // Optimistic local update
    window.appSettings.showTVRadioTimes = checked;
    localStorage.setItem('mangamar_setting_show_tv_radio_times', checked ? 'true' : 'false');
    
    // If the TV view modal is currently open, re-render it in real-time immediately
    const tvModal = document.getElementById('tv-view-modal');
    if (tvModal && !tvModal.classList.contains('hidden')) {
        if (typeof window._buildTVContent === 'function') {
            window._buildTVContent();
            setTimeout(window.adjustCardScaling, 50);
        }
    }

    // Write to Firestore settings document to broadcast the toggle state to all devices/screens
    if (typeof db !== 'undefined' && db.collection) {
        db.collection("mangamar_directory").doc("settings").set({
            showTVRadioTimes: checked
        }, { merge: true }).catch(err => {
            console.error("Error synchronizing settings to Firestore:", err);
        });
    }
};

// ==========================================
// 15. DAILY VIEW GUEST LIVE SEARCH
// ==========================================
window.activeDailySearchQuery = '';

window.expandDailySearch = function() {
    const container = document.getElementById('daily-search-container');
    const input = document.getElementById('daily-search-input');
    if (container && input) {
        container.classList.remove('w-10', 'justify-center');
        container.classList.add('w-64', 'px-3', 'ring-2', 'ring-blue-500', 'border-blue-500');
        input.classList.remove('w-0', 'opacity-0');
        input.classList.add('w-full', 'opacity-100', 'ml-2');
        
        window.showDailySearchPopup();
    }
};

window.collapseDailySearch = function() {
    if (window._searchEnterPressed) return;
    
    const container = document.getElementById('daily-search-container');
    const input = document.getElementById('daily-search-input');
    
    // Keep open if there's an active query so the clear button is clickable
    if (window.activeDailySearchQuery && window.activeDailySearchQuery.trim().length >= 3) {
        return;
    }
    
    if (container && input) {
        container.classList.remove('w-64', 'px-3', 'ring-2', 'ring-blue-500', 'border-blue-500');
        container.classList.add('w-10', 'justify-center');
        input.classList.remove('w-full', 'opacity-100', 'ml-2');
        input.classList.add('w-0', 'opacity-0');
        
        window.hideDailySearchPopup();
    }
};

window.executeDailySearch = function(query) {
    const input = document.getElementById('daily-search-input');
    const clearBtn = document.getElementById('daily-search-clear');
    const countBadge = document.getElementById('daily-search-count');
    const popup = document.getElementById('daily-search-popup');
    
    if (input && input.value !== query) {
        input.value = query;
    }
    
    window.activeDailySearchQuery = query || '';
    const normQuery = window.normalizeSearchString(query);
    
    // Helper to clear all card highlights safely without causing layout shifting
    const clearAllHighlights = () => {
        document.querySelectorAll('[data-trip-id]').forEach(card => {
            card.classList.remove('ring-[3px]', 'ring-emerald-500', 'ring-offset-0', 'shadow-[0_0_20px_rgba(16,185,129,0.4)]', 'border-emerald-500', 'z-30');
            if (!card.classList.contains('border-red-500')) {
                card.classList.add('border-slate-200');
            }
        });
    };
    
    // 3-character minimum — reset and exit if too short
    if (!normQuery || query.trim().length < 3) {
        if (clearBtn) clearBtn.classList.add('hidden');
        if (countBadge) countBadge.classList.add('hidden');
        if (popup) popup.style.display = 'none';
        clearAllHighlights();
        return;
    }
    
    if (clearBtn) clearBtn.classList.remove('hidden');
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const targetDateStr = `${year}-${month}-${day}`;
    
    let matchCount = 0;
    const matchingTripIds = new Set();
    const allMergedTrips = typeof getMergedTrips === 'function' ? getMergedTrips(mergedAllocations) : mergedAllocations;
    const todaysTrips = allMergedTrips.filter(t => t.date === targetDateStr);
    
    todaysTrips.forEach(trip => {
        const guests = trip.guests || [];
        const matchesThisTrip = guests.some(g => {
            const nameMatch = window.normalizeSearchString(g.nombre).includes(normQuery);
            const dniMatch = g.dni && window.normalizeSearchString(g.dni).includes(normQuery);
            return nameMatch || dniMatch;
        });
        if (matchesThisTrip) {
            matchingTripIds.add(trip.id);
            guests.forEach(g => {
                const nameMatch = window.normalizeSearchString(g.nombre).includes(normQuery);
                const dniMatch = g.dni && window.normalizeSearchString(g.dni).includes(normQuery);
                if (nameMatch || dniMatch) matchCount++;
            });
        }
    });
    
    // Highlight matching cards with an elegant box-shadow ring (never overlaps colored top borders!)
    document.querySelectorAll('[data-trip-id]').forEach(card => {
        const tripId = card.getAttribute('data-trip-id');
        if (matchingTripIds.has(tripId)) {
            card.classList.add('ring-[3px]', 'ring-emerald-500', 'ring-offset-0', 'shadow-[0_0_20px_rgba(16,185,129,0.4)]', 'border-emerald-500', 'z-30');
            card.classList.remove('border-slate-200', 'hover:border-blue-300');
        } else {
            card.classList.remove('ring-[3px]', 'ring-emerald-500', 'ring-offset-0', 'shadow-[0_0_20px_rgba(16,185,129,0.4)]', 'border-emerald-500', 'z-30');
            if (!card.classList.contains('border-red-500')) {
                card.classList.add('border-slate-200');
            }
        }
    });

    
    // Update match count badge
    if (countBadge) {
        countBadge.innerText = `${matchCount} ${matchCount === 1 ? 'coincidencia' : 'coincidencias'}`;
        countBadge.classList.remove('hidden');
    }

    // Render dropdown list of search results
    if (popup) {
        if (matchCount > 0) {
            let resultsHtml = '';
            todaysTrips.forEach(trip => {
                const guests = trip.guests || [];
                guests.forEach(g => {
                    const nameMatch = window.normalizeSearchString(g.nombre).includes(normQuery);
                    const dniMatch = g.dni && window.normalizeSearchString(g.dni).includes(normQuery);

                    if (nameMatch || dniMatch) {
                        const boatName = trip.assignedBoat === 'ares' ? 'Ares' : (trip.assignedBoat === 'kaiser' ? 'Kaiser' : 'Shore');
                        const siteName = trip.site || 'Sin Destino';
                        const timeVal = trip.time || '';

                        let highlightedName = g.nombre;
                        const searchWords = query.split(/\s+/).filter(w => w.length >= 2);
                        if (searchWords.length > 0) {
                            searchWords.forEach(word => {
                                highlightedName = highlightedName.replace(new RegExp(word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), match => `<mark style="background:rgba(16,185,129,0.2);color:#34d399;font-weight:700;padding:1px 4px;border-radius:3px">${match}</mark>`);
                            });
                        } else {
                            highlightedName = highlightedName.replace(new RegExp(query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi'), match => `<mark style="background:rgba(16,185,129,0.2);color:#34d399;font-weight:700;padding:1px 4px;border-radius:3px">${match}</mark>`);
                        }

                        resultsHtml += `
                        <div onclick="window.openSearchManageBoatModal('${trip.id}')" style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-radius:8px;cursor:pointer;border:1px solid transparent;margin-bottom:4px" onmouseover="this.style.background='#1e293b';this.style.borderColor='#334155'; window.hoverSearchCard('${trip.id}')" onmouseout="this.style.background='';this.style.borderColor='transparent'; window.unhoverSearchCard('${trip.id}')">
                            <div style="flex:1;min-width:0;padding-right:12px;text-align:left">
                                <div style="font-size:12px;font-weight:900;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${highlightedName}</div>
                                <div style="font-size:9px;font-weight:700;color:#94a3b8;margin-top:2px;text-transform:uppercase;letter-spacing:0.05em">${g.dni || 'Sin DNI'}</div>
                            </div>
                            <div style="text-align:right;flex-shrink:0">
                                <div style="font-size:10px;font-weight:900;color:#fb923c;text-transform:uppercase">${boatName} &bull; ${timeVal}</div>
                                <div style="font-size:9px;font-weight:700;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;margin-top:2px">${siteName}</div>
                            </div>
                        </div>
                        `;
                    }
                });
            });
            popup.innerHTML = resultsHtml;
            popup.style.display = 'block';
        } else {
            popup.innerHTML = `<div style="color:#94a3b8;font-size:11px;font-weight:700;text-align:center;padding:12px;font-style:italic">No se encontraron buceadores</div>`;
            popup.style.display = 'block';
        }
    }
};

window.clearDailySearch = function() {
    window.activeDailySearchQuery = '';
    const input = document.getElementById('daily-search-input');
    if (input) input.value = '';
    
    window.executeDailySearch('');
    
    // Collapse search bar after clearing if blurred
    window.collapseDailySearch();
    
    // Re-render grid to clear highlighted text inside tooltips
    renderDailyGrid();
};

window.refocusDailySearch = function() {
    const input = document.getElementById('daily-search-input');
    if (input && window.activeDailySearchQuery) {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
    }
};

window.showDailySearchPopup = function() {
    const popup = document.getElementById('daily-search-popup');
    if (popup && window.activeDailySearchQuery && window.activeDailySearchQuery.trim().length >= 3) {
        popup.style.display = 'block';
    }
};

window.hideDailySearchPopup = function() {
    if (window._searchEnterPressed) return; // Don't hide if Enter was pressed to blur
    const popup = document.getElementById('daily-search-popup');
    if (popup) {
        popup.style.display = 'none';
    }
};

// Close search popup when clicking outside the input and popup itself
document.addEventListener('click', function(event) {
    const popup = document.getElementById('daily-search-popup');
    const input = document.getElementById('daily-search-input');
    const container = document.getElementById('daily-search-container');

    if (popup && popup.style.display !== 'none') {
        if (!popup.contains(event.target) && !input.contains(event.target) && (!container || !container.contains(event.target))) {
            popup.style.display = 'none';
        }
    }
});

window.hoverSearchCard = function(tripId) {
    const card = document.querySelector(`[data-trip-id="${tripId}"]`);
    if (card) {
        // Temporarily remove standard green outline classes and z-30 elevation
        card.classList.remove('ring-[3px]', 'shadow-[0_0_20px_rgba(16,185,129,0.4)]', 'border-emerald-500', 'z-30');
        
        // Add thick, extremely bright emerald ring, high-opacity glow shadow, elevated z-50, and subtle scale pop
        card.classList.add('ring-[6px]', 'ring-emerald-400', 'shadow-[0_0_40px_rgba(52,211,153,0.95)]', 'z-50', 'scale-[1.03]', 'border-emerald-400');
        card.classList.remove('border-slate-200', 'hover:border-blue-300');
    }
};

window.unhoverSearchCard = function(tripId) {
    const card = document.querySelector(`[data-trip-id="${tripId}"]`);
    if (card) {
        // Remove high glow classes, scale pop, and z-50
        card.classList.remove('ring-[6px]', 'ring-emerald-400', 'shadow-[0_0_40px_rgba(52,211,153,0.95)]', 'z-50', 'scale-[1.03]', 'border-emerald-400');
        
        // Re-apply standard daily search highlights dynamically
        window.executeDailySearch(window.activeDailySearchQuery);
    }
};


window.openSearchManageBoatModal = function(tripId) {
    const allTrips = typeof getMergedTrips === 'function' ? getMergedTrips(mergedAllocations) : mergedAllocations;
    const trip = allTrips.find(t => t.id === tripId);
    if (trip) {
        const card = document.querySelector(`[data-trip-id="${tripId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (typeof openManageBoatModal === 'function') {
            openManageBoatModal(trip, trip.assignedBoat || 'ares', trip.time, trip.date);
        }
    }
};

// ==========================================
// PREMIUM MOBILE HELPER FUNCTIONS
// ==========================================
window.activeMobileBoat = 'ares';
window.selectMobileBoat = function(boat) {
    window.activeMobileBoat = boat;
    const grid = document.getElementById('daily-grid-container');
    if (grid) {
        grid.classList.remove('show-ares', 'show-kaiser', 'show-shore');
        grid.classList.add(`show-${boat}`);
    }
    
    // Style active tab
    ['ares', 'kaiser', 'shore'].forEach(b => {
        const btn = document.getElementById(`m-btn-${b}`);
        if (!btn) return;
        if (b === boat) {
            btn.className = 'flex-1 py-2 text-xs font-black rounded-lg transition-all text-center bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm';
        } else {
            btn.className = 'flex-1 py-2 text-xs font-bold transition-all text-center text-slate-500 hover:text-slate-800';
        }
    });
};

window.activeMobileStaff = 'capitanes';
window.selectMobileStaff = function(tab) {
    window.activeMobileStaff = tab;
    const view = document.getElementById('view-staff');
    if (view) {
        view.classList.remove('show-capitanes', 'show-guias', 'show-recepcion');
        view.classList.add(`show-${tab}`);
    }
    
    // Style active tab
    ['capitanes', 'guias', 'recepcion'].forEach(t => {
        const btn = document.getElementById(`m-staff-btn-${t}`);
        if (!btn) return;
        if (t === tab) {
            btn.className = 'flex-1 py-2 text-xs font-black rounded-lg transition-all text-center bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm';
        } else {
            btn.className = 'flex-1 py-2 text-xs font-bold transition-all text-center text-slate-500 hover:text-slate-800';
        }
    });
};

window.toggleMobileToolsModal = function() {
    const modal = document.getElementById('mobile-tools-modal');
    const inner = document.getElementById('mobile-tools-inner');
    if (modal && inner) {
        if (modal.classList.contains('hidden')) {
            modal.classList.remove('hidden');
            // Force reflow
            modal.offsetHeight;
            modal.classList.add('active');
            inner.classList.add('translate-y-0');
            inner.classList.remove('translate-y-full');
        } else {
            modal.classList.remove('active');
            inner.classList.remove('translate-y-0');
            inner.classList.add('translate-y-full');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300); // Wait for transition
        }
    }
};

// ============================================
// EXPORT MANIFESTS TO CSV LOGIC
// ============================================
window.openExportCsvModal = function() {
    const modal = document.getElementById('export-csv-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    
    // Initialize date range selector
    const today = new Date();
    const displayDate = (d) => {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };
    
    if (window.exportFlatpickr) window.exportFlatpickr.destroy();
    window.exportFlatpickr = flatpickr("#export-date-range", {
        mode: "range",
        dateFormat: "d/m/Y",
        defaultDate: [displayDate(today), displayDate(today)],
        locale: {
            firstDayOfWeek: 1,
            rangeSeparator: " hasta ",
            weekdays: { shorthand: ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"], longhand: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] },
            months: { shorthand: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"], longhand: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] }
        }
    });
};

function getMonthsInRange(startDateStr, endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const months = [];
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        months.push(`${y}-${m}`);
        current.setMonth(current.getMonth() + 1);
    }
    return months;
}

async function fetchTripsForDateRange(startDateStr, endDateStr) {
    const monthKeys = getMonthsInRange(startDateStr, endDateStr);
    const allVisorTrips = [];
    const allInternalTrips = [];
    const allTombstones = new Set();

    const fetchPromises = monthKeys.map(async (monthKey) => {
        // If months are currently loaded dynamically in active listeners, use memory
        if (typeof visorMonthData !== 'undefined' && typeof internalMonthData !== 'undefined' &&
            visorMonthData.has(monthKey) && internalMonthData.has(monthKey)) {
            allVisorTrips.push(...(visorMonthData.get(monthKey) || []));
            allInternalTrips.push(...(internalMonthData.get(monthKey) || []));
            const tombstones = internalMonthTombstones.get(monthKey);
            if (tombstones) {
                tombstones.forEach(id => allTombstones.add(id));
            }
            return;
        }

        // Fetch from Firestore
        const visorPromise = db.collection('reservations_monthly').doc(monthKey).get()
            .then(doc => {
                if (doc.exists) {
                    const monthData = doc.data().allocations || {};
                    for (const id in monthData) {
                        if (monthData[id].center === MANGAMAR_CODE) {
                            if (monthData[id]._deleted) continue;
                            const tripMonth = monthData[id].date ? monthData[id].date.substring(0, 7) : "";
                            if (tripMonth && tripMonth !== doc.id) continue;
                            allVisorTrips.push({ id, ...monthData[id], isVisorTrip: true, _sourceDocId: doc.id });
                        }
                    }
                }
            })
            .catch(err => console.warn("Error fetching visor monthly for export:", err));

        const internalPromise = db.collection('mangamar_monthly').doc(monthKey).get()
            .then(doc => {
                if (doc.exists) {
                    const monthData = doc.data().allocations || {};
                    for (const id in monthData) {
                        if (monthData[id]._deleted) {
                            allTombstones.add(id);
                            continue;
                        }
                        const tripMonth = monthData[id].date ? monthData[id].date.substring(0, 7) : "";
                        if (tripMonth && tripMonth !== doc.id) continue;
                        allInternalTrips.push({ id, ...monthData[id], isInternalTrip: true, _sourceDocId: doc.id });
                    }
                }
            })
            .catch(err => console.warn("Error fetching internal monthly for export:", err));

        await Promise.all([visorPromise, internalPromise]);
    });

    await Promise.all(fetchPromises);

    // Filter out tombstones
    const filteredVisor = allVisorTrips.filter(t => !allTombstones.has(t.id));
    const filteredInternal = allInternalTrips.filter(t => !allTombstones.has(t.id));

    // Align Internal shadows with Visor masters
    const visorMap = new Map(filteredVisor.map(t => [t.id, t]));
    const alignedInternal = filteredInternal.map(internal => {
        if (visorMap.has(internal.id)) {
            const visorMaster = visorMap.get(internal.id);
            return {
                ...internal,
                date: visorMaster.date,
                time: visorMaster.time,
                plazas: visorMaster.pax,
                site: visorMaster.site
            };
        }
        return internal;
    });

    // Merge logic matching window.getMergedTrips
    const combined = [...filteredVisor, ...alignedInternal];
    const deduplicated = new Map();
    combined.forEach(t => {
        if (t.isVisorTrip) {
            deduplicated.set(t.id, { ...t, isVisor: true, originalVisorSite: t.site });
        }
    });
    combined.forEach(t => {
        if (t.isInternalTrip) {
            if (deduplicated.has(t.id)) {
                deduplicated.set(t.id, { ...deduplicated.get(t.id), ...t, isVisor: true });
            } else {
                deduplicated.set(t.id, { ...t, isVisor: false });
            }
        }
    });

    return Array.from(deduplicated.values()).filter(t => {
        return t.date >= startDateStr && t.date <= endDateStr;
    });
}

window.downloadCsvExport = async function() {
    const rangeInput = document.getElementById('export-date-range');
    const rangeVal = rangeInput ? rangeInput.value : '';
    if (!rangeVal) {
        showToast("⚠️ Selecciona un rango de fechas", "error");
        return;
    }
    
    const dates = rangeVal.split(' hasta ');
    const toStorageDate = (s) => {
        if (!s) return '';
        const p = s.split('/');
        if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
        return s;
    };
    
    const startStr = toStorageDate(dates[0]);
    const endStr = toStorageDate(dates[1] || dates[0]);
    
    showToast("⏳ Preparando exportación...");
    
    try {
        const trips = await fetchTripsForDateRange(startStr, endStr);
        
        // Sort trips chronologically by date and time
        trips.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return (a.time || '').localeCompare(b.time || '');
        });
        
        // Build CSV lines
        const csvRows = [];
        
        // Header line
        csvRows.push([
            "Fecha",
            "Barco",
            "Destino",
            "Hora",
            "Guia",
            "Apoyo",
            "Nombre Cliente",
            "DNI",
            "Telefono",
            "Gas",
            "Alquiler",
            "Seguro",
            "Grupo/Reserva",
            "Estado Salida"
        ].map(val => `"${val.replace(/"/g, '""')}"`).join(','));
        
        trips.forEach(trip => {
            const dateDisplay = trip.date.split('-').reverse().join('/');
            const boatName = (trip.assignedBoat || '').toUpperCase() || 'SIN ASIGNAR';
            const siteName = trip.site || 'Sin Destino';
            const timeVal = trip.time || '';
            const status = trip.cancelled ? 'ANULADA' : 'ACTIVA';
            
            // Loop through groups and guests
            if (trip.groups && trip.groups.length > 0) {
                trip.groups.forEach(group => {
                    const guideName = group.guide || '';
                    const apoyoName = group.apoyo || '';
                    
                    if (group.guests && group.guests.length > 0) {
                        group.guests.forEach(guest => {
                            const guestName = guest.nombre || '';
                            const guestDni = guest.dni || '';
                            const guestPhone = guest.telefono || '';
                            const guestGas = guest.gas || '15L Aire';
                            
                            // Map rental code/count to readable text
                            let rentalText = 'No';
                            if (guest.rental === 1 || guest.rental === '1') rentalText = 'Sí';
                            else if (guest.rental > 1) rentalText = `Sí (${guest.rental})`;
                            else if (guest.rental === 'INC') rentalText = 'Incluido';
                            
                            // Map insurance code to readable text
                            let insText = 'No';
                            if (guest.insurance === 1 || guest.insurance === '1') insText = 'Diario';
                            else if (guest.insurance === 2 || guest.insurance === '2') insText = 'Anual';
                            else if (guest.insurance === 'INC') insText = 'Incluido';
                            else if (guest.insurance && typeof guest.insurance === 'string') insText = guest.insurance;
                            
                            const bookingTag = guest.bookingTag || '';
                            
                            csvRows.push([
                                dateDisplay,
                                boatName,
                                siteName,
                                timeVal,
                                guideName,
                                apoyoName,
                                guestName,
                                guestDni,
                                guestPhone,
                                guestGas,
                                rentalText,
                                insText,
                                bookingTag,
                                status
                            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
                        });
                    }
                });
            } else if (trip.guests && trip.guests.length > 0) {
                trip.guests.forEach(guest => {
                    const guestName = guest.nombre || '';
                    const guestDni = guest.dni || '';
                    const guestPhone = guest.telefono || '';
                    const guestGas = guest.gas || '15L Aire';
                    
                    let rentalText = 'No';
                    if (guest.rental === 1 || guest.rental === '1') rentalText = 'Sí';
                    else if (guest.rental > 1) rentalText = `Sí (${guest.rental})`;
                    else if (guest.rental === 'INC') rentalText = 'Incluido';
                    
                    let insText = 'No';
                    if (guest.insurance === 1 || guest.insurance === '1') insText = 'Diario';
                    else if (guest.insurance === 2 || guest.insurance === '2') insText = 'Anual';
                    else if (guest.insurance === 'INC') insText = 'Incluido';
                    else if (guest.insurance && typeof guest.insurance === 'string') insText = guest.insurance;
                    
                    const bookingTag = guest.bookingTag || '';
                    
                    csvRows.push([
                        dateDisplay,
                        boatName,
                        siteName,
                        timeVal,
                        '',
                        '',
                        guestName,
                        guestDni,
                        guestPhone,
                        guestGas,
                        rentalText,
                        insText,
                        bookingTag,
                        status
                    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
                });
            }
        });
        
        // Generate CSV file download (including UTF-8 BOM for Spanish character encoding in Excel)
        const csvContent = "\uFEFF" + csvRows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        
        const displayStart = startStr.split('-').reverse().join('-');
        const displayEnd = endStr.split('-').reverse().join('-');
        link.setAttribute("download", `manifiestos_mangamar_${displayStart}_a_${displayEnd}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast("✅ CSV descargado correctamente");
        document.getElementById('export-csv-modal').classList.add('hidden');
    } catch (e) {
        console.error("Export error:", e);
        showToast("❌ Error al exportar los datos", "error");
    }
};