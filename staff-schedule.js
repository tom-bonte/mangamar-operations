/**
 * @file staff-schedule.js
 * @description Controller for the monthly staff schedule (Horario Staff) and days off tracking.
 */

window.activeStaffSchedule = null;
window.activeStaffScheduleMonthKey = null;
window.staffScheduleRoleFilter = 'all';

// Opens the Horario Staff modal and initializes dropdowns
window.openStaffScheduleModal = function() {
    const modal = document.getElementById('staff-schedule-modal');
    if (!modal) return;
    
    // Populate month dropdown options
    window.initializeMonthDropdown();
    
    // Conditionally show/hide staff addition dropdown
    const addSelect = document.getElementById('staff-schedule-add-select');
    if (addSelect) {
        if (window.isStaffLoggedIn) {
            addSelect.classList.add('hidden');
        } else {
            addSelect.classList.remove('hidden');
        }
    }
    
    modal.classList.remove('hidden');
};

// Closes the Horario Staff modal
window.closeStaffScheduleModal = function() {
    const modal = document.getElementById('staff-schedule-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    
    // Clean up active listener when modal closes to save resources
    if (window.unsubscribeStaffSchedule) {
        window.unsubscribeStaffSchedule();
        window.unsubscribeStaffSchedule = null;
    }
    window.activeStaffSchedule = null;
};

// Populates the Month Selection dropdown dynamically around the current month
window.initializeMonthDropdown = function() {
    const select = document.getElementById('staff-schedule-month-select');
    if (!select) return;
    
    select.innerHTML = '';
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    
    const months = [];
    // Start generating from 3 months in the past to 12 months in the future
    const date = new Date(currentYear, currentMonth - 3, 1);
    
    for (let i = 0; i < 16; i++) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        
        const monthNames = [
            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
        ];
        const label = `${monthNames[date.getMonth()]} de ${y}`;
        
        months.push({ key, label });
        date.setMonth(date.getMonth() + 1);
    }
    
    select.innerHTML = months.map(m => `<option value="${m.key}">${m.label}</option>`).join('');
    
    // Select current month by default
    const defaultKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    select.value = defaultKey;
    
    // Load schedule for this month
    window.handleStaffScheduleMonthChange(defaultKey);
};

// Handles changing month, subscribes to new Firestore schedule snapshot
window.handleStaffScheduleMonthChange = function(monthKey) {
    window.activeStaffScheduleMonthKey = monthKey;
    window.subscribeToStaffSchedule(monthKey);
};

// Subscribes to Firestore Staff Schedule for real-time multiplayer updates
window.subscribeToStaffSchedule = function(monthKey) {
    if (window.unsubscribeStaffSchedule) {
        window.unsubscribeStaffSchedule();
    }
    
    window.unsubscribeStaffSchedule = db.collection('mangamar_staff_schedule').doc(monthKey).onSnapshot((doc) => {
        if (doc.exists) {
            window.activeStaffSchedule = doc.data();
        } else {
            window.activeStaffSchedule = {
                monthKey: monthKey,
                columns: [],
                daysOff: {}
            };
        }
        
        // Cache to global map for dropdown conflict checks
        window.staffSchedulesData.set(monthKey, window.activeStaffSchedule);
        
        // Redraw grid
        window.renderStaffScheduleGrid();
        
        // Populate available staff list in the add-staff dropdown
        window.populateAddStaffDropdown();
    }, (err) => {
        console.error("Error subscribing to staff schedule:", err);
    });
};

// Saves the active staff schedule document back to Firestore
window.saveStaffSchedule = async function() {
    if (!window.activeStaffSchedule || !window.activeStaffSchedule.monthKey) return;
    try {
        await db.collection('mangamar_staff_schedule').doc(window.activeStaffSchedule.monthKey).set(window.activeStaffSchedule);
    } catch (e) {
        console.error("Error saving staff schedule:", e);
        if (typeof showToast === 'function') showToast("Error al guardar horario", "error");
    }
};

// Populates the "+ Añadir Staff al Horario..." select element
window.populateAddStaffDropdown = function() {
    const select = document.getElementById('staff-schedule-add-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">+ Añadir Staff al Horario...</option>';
    
    if (!window.activeStaffSchedule) return;
    const currentCols = window.activeStaffSchedule.columns || [];
    
    // Gather all unique staff names from the master list
    const allStaff = [];
    (window.staffDatabase.capitanes || []).forEach(c => {
        if (c.nombre && !allStaff.includes(c.nombre)) allStaff.push(c.nombre);
    });
    (window.staffDatabase.guias || []).forEach(g => {
        if (g.nombre && !allStaff.includes(g.nombre)) allStaff.push(g.nombre);
    });
    (window.staffDatabase.recepcion || []).forEach(r => {
        if (r.nombre && !allStaff.includes(r.nombre)) allStaff.push(r.nombre);
    });
    
    // Filter out already active columns
    const available = allStaff.filter(name => !currentCols.includes(name)).sort();
    
    available.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
};

// Adds a staff column to the current month's schedule
window.handleAddStaffColumn = async function(staffName) {
    if (window.isStaffLoggedIn) return;
    if (!staffName || !window.activeStaffSchedule) return;
    
    if (!window.activeStaffSchedule.columns) {
        window.activeStaffSchedule.columns = [];
    }
    
    if (!window.activeStaffSchedule.columns.includes(staffName)) {
        window.activeStaffSchedule.columns.push(staffName);
        
        // Reset add dropdown selection
        const select = document.getElementById('staff-schedule-add-select');
        if (select) select.value = '';
        
        await window.saveStaffSchedule();
    }
};

// Hides/removes a staff column from this month's schedule view
window.handleRemoveStaffColumn = function(staffName) {
    if (window.isStaffLoggedIn) return;
    if (!staffName || !window.activeStaffSchedule) return;
    
    showAppConfirm(`¿Quitar la columna de ${staffName} para este mes? (Esto no borra su historial de días libres, solo oculta la columna)`, async () => {
        const idx = window.activeStaffSchedule.columns.indexOf(staffName);
        if (idx !== -1) {
            window.activeStaffSchedule.columns.splice(idx, 1);
            await window.saveStaffSchedule();
        }
    });
};

// Toggles "Día Libre" date on/off for a specific staff member
// Toggles "Día Libre" date on/off for a specific staff member
window.toggleStaffDayOff = async function(staffName, dateStr) {
    if (window.isStaffLoggedIn) return;
    if (!staffName || !dateStr || !window.activeStaffSchedule) return;
    
    if (!window.activeStaffSchedule.daysOff) {
        window.activeStaffSchedule.daysOff = {};
    }
    if (!window.activeStaffSchedule.daysOff[staffName]) {
        window.activeStaffSchedule.daysOff[staffName] = [];
    }
    
    const list = window.activeStaffSchedule.daysOff[staffName];
    const idx = list.indexOf(dateStr);
    
    if (idx === -1) {
        list.push(dateStr);
    } else {
        list.splice(idx, 1);
        // Clean up note if day off is removed
        if (window.activeStaffSchedule.dayOffNotes?.[staffName]?.[dateStr]) {
            delete window.activeStaffSchedule.dayOffNotes[staffName][dateStr];
        }
        // Clean up category if day off is removed
        if (window.activeStaffSchedule.dayOffCategories?.[staffName]?.[dateStr]) {
            delete window.activeStaffSchedule.dayOffCategories[staffName][dateStr];
        }
    }
    
    await window.saveStaffSchedule();
};

let activeEditStaffName = null;
let activeEditDateStr = null;

// Opens the custom modal to edit a staff member's Day Off note and category
window.openStaffDayOffEditModal = function(staffName, dateStr) {
    if (window.isStaffLoggedIn) return;
    if (!staffName || !dateStr || !window.activeStaffSchedule) return;
    
    activeEditStaffName = staffName;
    activeEditDateStr = dateStr;
    
    const categorySelect = document.getElementById('staff-day-off-edit-category');
    const noteTextarea = document.getElementById('staff-day-off-edit-note');
    const titleEl = document.getElementById('staff-day-off-edit-title');
    
    // Set title
    if (titleEl) {
        titleEl.textContent = `Editar Día Libre - ${staffName} (${dateStr})`;
    }
    
    // Get existing note
    const currentNote = window.activeStaffSchedule.dayOffNotes?.[staffName]?.[dateStr] || '';
    if (noteTextarea) {
        noteTextarea.value = currentNote;
    }
    
    // Get existing category
    const currentCat = window.activeStaffSchedule.dayOffCategories?.[staffName]?.[dateStr] || 'libre';
    if (categorySelect) {
        categorySelect.value = currentCat;
    }
    
    const modal = document.getElementById('staff-day-off-edit-modal');
    if (modal) {
        modal.classList.remove('hidden');
        if (categorySelect) setTimeout(() => categorySelect.focus(), 50);
    }
};

window.closeStaffDayOffEditModal = function() {
    const modal = document.getElementById('staff-day-off-edit-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    activeEditStaffName = null;
    activeEditDateStr = null;
};

window.saveStaffDayOffEditModal = async function() {
    if (window.isStaffLoggedIn) return;
    if (!activeEditStaffName || !activeEditDateStr || !window.activeStaffSchedule) return;
    
    const categorySelect = document.getElementById('staff-day-off-edit-category');
    const noteTextarea = document.getElementById('staff-day-off-edit-note');
    
    const selectedCat = categorySelect ? categorySelect.value : 'libre';
    const newNote = noteTextarea ? noteTextarea.value.trim() : '';
    
    // Ensure dayOffCategories structure exists
    if (!window.activeStaffSchedule.dayOffCategories) {
        window.activeStaffSchedule.dayOffCategories = {};
    }
    if (!window.activeStaffSchedule.dayOffCategories[activeEditStaffName]) {
        window.activeStaffSchedule.dayOffCategories[activeEditStaffName] = {};
    }
    
    // Save category
    if (selectedCat === 'libre') {
        delete window.activeStaffSchedule.dayOffCategories[activeEditStaffName][activeEditDateStr];
    } else {
        window.activeStaffSchedule.dayOffCategories[activeEditStaffName][activeEditDateStr] = selectedCat;
    }
    
    // Ensure dayOffNotes structure exists
    if (!window.activeStaffSchedule.dayOffNotes) {
        window.activeStaffSchedule.dayOffNotes = {};
    }
    if (!window.activeStaffSchedule.dayOffNotes[activeEditStaffName]) {
        window.activeStaffSchedule.dayOffNotes[activeEditStaffName] = {};
    }
    
    // Save note
    if (newNote === '') {
        delete window.activeStaffSchedule.dayOffNotes[activeEditStaffName][activeEditDateStr];
    } else {
        window.activeStaffSchedule.dayOffNotes[activeEditStaffName][activeEditDateStr] = newNote;
    }
    
    await window.saveStaffSchedule();
    window.closeStaffDayOffEditModal();
};

// Role Filter controller
window.setStaffScheduleRoleFilter = function(filter) {
    window.staffScheduleRoleFilter = filter;
    
    const btnAll = document.getElementById('btn-sch-all');
    const btnCaps = document.getElementById('btn-sch-caps');
    const btnGuides = document.getElementById('btn-sch-guides');
    const btnRecep = document.getElementById('btn-sch-recep');
    
    if (btnAll) {
        btnAll.className = filter === 'all' 
            ? "px-3.5 py-1.5 rounded-lg text-xs font-black shadow bg-white text-violet-700 transition-all active:scale-95 cursor-pointer"
            : "px-3.5 py-1.5 rounded-lg text-xs font-black text-slate-500 hover:text-slate-800 transition-all active:scale-95 cursor-pointer";
    }
    if (btnCaps) {
        btnCaps.className = filter === 'capitanes'
            ? "px-3.5 py-1.5 rounded-lg text-xs font-black shadow bg-white text-violet-700 transition-all active:scale-95 cursor-pointer"
            : "px-3.5 py-1.5 rounded-lg text-xs font-black text-slate-500 hover:text-slate-800 transition-all active:scale-95 cursor-pointer";
    }
    if (btnGuides) {
        btnGuides.className = filter === 'guias'
            ? "px-3.5 py-1.5 rounded-lg text-xs font-black shadow bg-white text-violet-700 transition-all active:scale-95 cursor-pointer"
            : "px-3.5 py-1.5 rounded-lg text-xs font-black text-slate-500 hover:text-slate-800 transition-all active:scale-95 cursor-pointer";
    }
    if (btnRecep) {
        btnRecep.className = filter === 'recepcion'
            ? "px-3.5 py-1.5 rounded-lg text-xs font-black shadow bg-white text-violet-700 transition-all active:scale-95 cursor-pointer"
            : "px-3.5 py-1.5 rounded-lg text-xs font-black text-slate-500 hover:text-slate-800 transition-all active:scale-95 cursor-pointer";
    }
    
    window.renderStaffScheduleGrid();
};

// Drag & Drop Columns handlers
window.handleStaffColumnDragStart = function(event, staffName) {
    if (window.isStaffLoggedIn) {
        event.preventDefault();
        return;
    }
    event.dataTransfer.setData('text/plain', staffName);
    event.dataTransfer.effectAllowed = 'move';
};

window.handleStaffColumnDragOver = function(event) {
    if (window.isStaffLoggedIn) {
        event.preventDefault();
        return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
};

window.handleStaffColumnDrop = async function(event, targetStaffName) {
    event.preventDefault();
    if (window.isStaffLoggedIn) return;
    const draggedStaffName = event.dataTransfer.getData('text/plain');
    if (!draggedStaffName || draggedStaffName === targetStaffName) return;
    
    if (!window.activeStaffSchedule) return;
    const columns = window.activeStaffSchedule.columns || [];
    const draggedIdx = columns.indexOf(draggedStaffName);
    const targetIdx = columns.indexOf(targetStaffName);
    
    if (draggedIdx > -1 && targetIdx > -1) {
        // Reorder array
        columns.splice(draggedIdx, 1);
        columns.splice(targetIdx, 0, draggedStaffName);
        await window.saveStaffSchedule();
    }
};

// Floating Header Menu toggle
window.toggleStaffActionMenu = function(event, staffName) {
    if (window.isStaffLoggedIn) return;
    event.stopPropagation();
    
    const targetId = `staff-menu-${staffName.replace(/[^a-zA-Z0-9-]/g, '_')}`;
    
    // Close other open menus
    document.querySelectorAll('.staff-action-menu').forEach(menu => {
        if (menu.id !== targetId) {
            menu.classList.remove('active');
        }
    });
    
    const menu = document.getElementById(targetId);
    if (menu) {
        menu.classList.toggle('active');
    }
};

// Move Columns left / right via action menu
window.moveStaffColumnLeft = async function(staffName) {
    if (window.isStaffLoggedIn) return;
    if (!window.activeStaffSchedule) return;
    const columns = window.activeStaffSchedule.columns || [];
    const idx = columns.indexOf(staffName);
    if (idx > 0) {
        columns.splice(idx, 1);
        columns.splice(idx - 1, 0, staffName);
        await window.saveStaffSchedule();
    }
};

// Move Columns right via action menu
window.moveStaffColumnRight = async function(staffName) {
    if (window.isStaffLoggedIn) return;
    if (!window.activeStaffSchedule) return;
    const columns = window.activeStaffSchedule.columns || [];
    const idx = columns.indexOf(staffName);
    if (idx !== -1 && idx < columns.length - 1) {
        columns.splice(idx, 1);
        columns.splice(idx + 1, 0, staffName);
        await window.saveStaffSchedule();
    }
};

// Close action menus when clicking anywhere else
if (!window.staffScheduleGlobalListenerAdded) {
    document.addEventListener('click', function() {
        document.querySelectorAll('.staff-action-menu').forEach(menu => {
            menu.classList.remove('active');
        });
    });
    window.staffScheduleGlobalListenerAdded = true;
}

// Renders the interactive Monthly Schedule Table
window.renderStaffScheduleGrid = function() {
    const container = document.getElementById('staff-schedule-grid-container');
    if (!container) return;
    
    if (!window.activeStaffSchedule) {
        container.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold text-sm">Cargando horario...</div>';
        return;
    }
    
    const allColumns = window.activeStaffSchedule.columns || [];
    
    if (allColumns.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white max-w-lg mx-auto mt-10 shadow-sm">
                <svg class="w-12 h-12 text-violet-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                <h3 class="text-base font-black text-slate-800">Horario Vacío</h3>
                <p class="text-xs text-slate-500 font-bold mt-1.5 mb-4">No hay columnas de personal añadidas para este mes.</p>
                <p class="text-[11px] text-violet-600 bg-violet-50 font-black rounded-lg py-1.5 px-3 uppercase tracking-wider">Añade staff usando el menú de la esquina superior derecha</p>
            </div>
        `;
        return;
    }
    
    // Save scroll position of the table wrapper and the container itself
    const wrapper = container.querySelector('.staff-schedule-table-wrapper');
    const scrollTop = wrapper ? wrapper.scrollTop : 0;
    const scrollLeft = wrapper ? wrapper.scrollLeft : 0;
    const containerScrollTop = container.scrollTop;
    const containerScrollLeft = container.scrollLeft;
    
    // Filter columns based on Selected Role Filter
    const columns = allColumns.filter(col => {
        if (window.staffScheduleRoleFilter === 'capitanes') {
            return (window.staffDatabase.capitanes || []).some(c => c.nombre === col);
        }
        if (window.staffScheduleRoleFilter === 'guias') {
            return (window.staffDatabase.guias || []).some(g => g.nombre === col);
        }
        if (window.staffScheduleRoleFilter === 'recepcion') {
            return (window.staffDatabase.recepcion || []).some(r => r.nombre === col);
        }
        return true;
    });
    
    const monthKey = window.activeStaffSchedule.monthKey; // YYYY-MM
    const [yearStr, monthStr] = monthKey.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    
    // Total days in the selected month
    const totalDays = new Date(year, month, 0).getDate();
    
    // Helper to get initials
    const getInitials = (name) => {
        const p = name.trim().split(' ');
        return p.length > 1 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
    };

    // Helper to format staff display name (e.g. "ABEL BERENGUER GOMEZ" -> "ABEL B.")
    const formatStaffDisplayName = (name) => {
        if (!name) return '';
        const p = name.trim().split(/\s+/);
        if (p.length > 1) {
            return `${p[0]} ${p[1][0].toUpperCase()}.`;
        }
        return name;
    };
    
    // Helper to get weekday name abbreviation in Spanish
    const getWeekdayLabel = (dayNum) => {
        const d = new Date(year, month - 1, dayNum);
        const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        return days[d.getDay()];
    };
    
    // Helper to check if a date is a weekend day for visual cues
    const isWeekend = (dayNum) => {
        const d = new Date(year, month - 1, dayNum);
        const day = d.getDay();
        return day === 0 || day === 6; // Sunday or Saturday
    };

    let tableHtml = `
        <div class="staff-schedule-table-wrapper select-none custom-scrollbar">
            <table class="staff-schedule-table">
                <colgroup>
                    <col class="staff-schedule-col-day">
                    ${columns.map(() => '<col class="staff-schedule-col-staff">').join('')}
                </colgroup>
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200">
                        <th class="p-2 text-xs font-black text-slate-500 uppercase tracking-widest text-center border-r border-slate-200 sticky left-0 top-0 z-30" style="background-color: #f8fafc; border-right: 2px solid #cbd5e1;">Día</th>
                        ${columns.map((col, index) => {
                            const daysOffList = window.activeStaffSchedule.daysOff?.[col] || [];
                            const daysOffCount = daysOffList.length;
                                                        const menuSanitizedId = `staff-menu-${col.replace(/[^a-zA-Z0-9-]/g, '_')}`;
                            return `
                            <th class="p-2 text-xs font-black text-slate-500 uppercase tracking-widest text-center border-r border-slate-200 last:border-r-0 relative"
                                draggable="${!window.isStaffLoggedIn}"
                                ondragstart="window.handleStaffColumnDragStart(event, '${col.replace(/'/g, "\\'")}')"
                                ondragover="window.handleStaffColumnDragOver(event)"
                                ondrop="window.handleStaffColumnDrop(event, '${col.replace(/'/g, "\\'")}')">
                                <div class="relative flex flex-col items-center justify-center gap-1 py-1">
                                    <!-- Initials Circle -->
                                    <div ${!window.isStaffLoggedIn ? `onclick="window.toggleStaffActionMenu(event, '${col.replace(/'/g, "\\'")}')"` : ''} class="w-8 h-8 rounded-full flex flex-col items-center justify-center text-[10px] font-black bg-violet-100 text-violet-700 shadow-inner shrink-0 ${!window.isStaffLoggedIn ? 'hover:bg-violet-200 cursor-pointer' : 'cursor-default'} transition-colors" ${!window.isStaffLoggedIn ? 'title="Opciones de columna"' : ''}>
                                        ${getInitials(col)}
                                    </div>
                                    
                                    <div class="text-[11px] font-black text-slate-800 tracking-tight truncate max-w-full" title="${col}">${formatStaffDisplayName(col)}</div>
                                    
                                    <!-- Days Off Counter -->
                                    <div class="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                        ${daysOffCount} Libres
                                    </div>
                                    
                                    <!-- Floating Action Menu (Admin Only) -->
                                    ${!window.isStaffLoggedIn ? `
                                    <div id="${menuSanitizedId}" class="staff-action-menu absolute left-1/2 -translate-x-1/2 mt-1">
                                        ${index > 0 ? `<button onclick="event.stopPropagation(); window.moveStaffColumnLeft('${col.replace(/'/g, "\\'")}')">⬅️ Mover Izquierda</button>` : ''}
                                        ${index < columns.length - 1 ? `<button onclick="event.stopPropagation(); window.moveStaffColumnRight('${col.replace(/'/g, "\\'")}')">➡️ Mover Derecha</button>` : ''}
                                        <button class="text-red-500" onclick="event.stopPropagation(); window.handleRemoveStaffColumn('${col.replace(/'/g, "\\'")}')">❌ Quitar</button>
                                    </div>
                                    ` : ''}
                                </div>
                            </th>
                            `;
                        }).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const weekday = getWeekdayLabel(day);
        const weekend = isWeekend(day);
        const isMonday = weekday === "Lun";
        const isSunday = weekday === "Dom";
        
        const now = new Date();
        const isToday = now.getFullYear() === year && (now.getMonth() + 1) === month && now.getDate() === day;
        
        let rowBg = '';
        let cellBg = '';
        if (isToday) {
            rowBg = 'bg-blue-50/80 hover:bg-blue-100/50';
            cellBg = '#eff6ff'; // light blue
        } else if (weekend) {
            rowBg = 'bg-slate-100 hover:bg-slate-150';
            cellBg = '#f1f5f9'; // grey (slate-100)
        } else {
            rowBg = 'bg-white hover:bg-slate-50/30';
            cellBg = '#ffffff';
        }

        const rowClasses = [];
        if (rowBg) rowClasses.push(rowBg);
        if (isSunday) rowClasses.push('week-separator-row');

        tableHtml += `
            <tr class="${rowClasses.join(' ')} border-b border-slate-100 transition-colors">
                <!-- Date column sticky -->
                <td class="p-2 font-black text-center border-r border-slate-200 select-none text-xs leading-none sticky left-0 z-15" style="background-color: ${cellBg}; border-right: 2px solid #cbd5e1;">
                    <div class="flex items-center justify-center gap-1.5">
                        <span class="text-sm font-black ${isMonday ? 'text-rose-600' : ''}">${day}</span>
                        <span class="text-[9px] font-bold uppercase tracking-wider ${isMonday ? 'text-rose-600' : 'text-slate-400'}">${weekday}</span>
                        ${isToday ? `<span class="text-[8px] font-extrabold bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">Hoy</span>` : ''}
                    </div>
                </td>
                ${columns.map(staff => {
                    const daysOffList = window.activeStaffSchedule.daysOff?.[staff] || [];
                    const isDayOff = daysOffList.includes(dateStr);
                    const note = window.activeStaffSchedule.dayOffNotes?.[staff]?.[dateStr] || '';
                    
                    let cellContent = '';
                    if (isDayOff) {
                        const category = window.activeStaffSchedule.dayOffCategories?.[staff]?.[dateStr] || 'libre';
                        let labelText = '';
                        if (category === 'vacaciones') labelText = 'Vacaciones';
                        else if (category === 'baja') labelText = 'Baja Médica';
                        else if (category === 'asuntos') labelText = 'Asuntos P.';
                        
                        const displayNote = note || labelText;
                        
                        cellContent = `
                            <div class="day-off-container cat-${category}">
                                ${displayNote ? `<div class="text-[9px] font-black leading-tight select-none break-words max-w-[80px] text-center" title="${displayNote}">${displayNote}</div>` : ''}
                                ${!window.isStaffLoggedIn ? `
                                <div class="day-off-actions">
                                    <button onclick="event.stopPropagation(); window.openStaffDayOffEditModal('${staff.replace(/'/g, "\\'")}', '${dateStr}')" 
                                            class="day-off-action-btn shadow-sm" 
                                            title="Editar Categoría / Nota">
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                    </button>
                                    <button onclick="event.stopPropagation(); window.toggleStaffDayOff('${staff.replace(/'/g, "\\'")}', '${dateStr}')" 
                                            class="day-off-action-btn day-off-delete-btn shadow-sm" 
                                            title="Quitar Día Libre">
                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </div>
                                ` : ''}
                            </div>
                        `;
                    } else {
                        cellContent = !window.isStaffLoggedIn ? `
                            <div class="w-full h-full bg-slate-50/50 hover:bg-violet-50/50 border border-slate-200/50 hover:border-violet-300 text-slate-400 hover:text-violet-700 font-bold rounded-lg py-1 px-1.5 text-center transition-all flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 border-dashed select-none text-[9px]">
                                + Libre
                            </div>
                        ` : '';
                    }

                    const tdOnclick = (!isDayOff && !window.isStaffLoggedIn) ? `onclick="window.toggleStaffDayOff('${staff.replace(/'/g, "\\'")}', '${dateStr}')"` : '';

                    return `
                        <td ${tdOnclick} class="p-1.5 border-r border-slate-200 last:border-r-0 hover:bg-slate-50/80 transition-colors ${(!isDayOff && !window.isStaffLoggedIn) ? 'cursor-pointer' : 'cursor-default'} group">
                            <div class="w-full min-h-[30px] flex items-center justify-center">
                                ${cellContent}
                            </div>
                        </td>
                    `;
                }).join('')}
            </tr>
        `;
    }

    tableHtml += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = tableHtml;

    // Restore scroll positions
    const newWrapper = container.querySelector('.staff-schedule-table-wrapper');
    if (newWrapper) {
        newWrapper.scrollTop = scrollTop;
        newWrapper.scrollLeft = scrollLeft;
    }
    container.scrollTop = containerScrollTop;
    container.scrollLeft = containerScrollLeft;
};
