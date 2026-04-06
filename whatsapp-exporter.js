// ==========================================
// 14. WHATSAPP EXPORTER ENGINE
// ==========================================
let waCurrentLang = 'es';
let waCurrentLevel = 'all';
let waSelectedIndividualDates = new Set();
let waSelectedSites = new Set();

// Native Calendar Variables
let waCalendarViewDate = new Date();
let waRangeStart = null;
let waRangeEnd = null;

window.openWhatsAppModal = function() {
    // Start completely empty
    waRangeStart = null;
    waRangeEnd = null;
    waCalendarViewDate = new Date(currentDate);
    
    const orderedSites = ['Fuera', 'Bajo de Dentro', 'Piles I', 'Piles II', 'Morra', 'Testa', 'Palomas', 'Naranjito', 'Cala'];
    waSelectedSites = new Set(orderedSites);
    waSelectedIndividualDates.clear();
    
    setWaLevel('all'); 
    waRenderDateList();
    renderWaCalendar(); // Render native calendar
    setWaLang('es'); 
    document.getElementById('whatsapp-export-modal').classList.remove('hidden');
};

    window.setWaLevel = function(level) {
        waCurrentLevel = level;
        const btnAll = document.getElementById('wa-lvl-all');
        const btnOw = document.getElementById('wa-lvl-ow');
        
        if (level === 'all') {
            btnAll.className = 'flex-1 py-1.5 text-[11px] font-bold rounded-lg bg-white text-slate-800 shadow-sm transition-all';
            btnOw.className = 'flex-1 py-1.5 text-[11px] font-bold rounded-lg text-slate-500 hover:text-slate-800 transition-all';
        } else {
            btnOw.className = 'flex-1 py-1.5 text-[11px] font-bold rounded-lg bg-white text-slate-800 shadow-sm transition-all';
            btnAll.className = 'flex-1 py-1.5 text-[11px] font-bold rounded-lg text-slate-500 hover:text-slate-800 transition-all';
        }
        waUpdateSiteFilters();
    };

    window.waUpdateSiteFilters = function() {
    const level = waCurrentLevel;
    const listEl = document.getElementById('wa-site-list');
    const orderedSites = ['Fuera', 'Bajo de Dentro', 'Piles I', 'Piles II', 'Morra', 'Testa', 'Palomas', 'Naranjito', 'Cala'];
    
    // Automatically manage Naranjito based on certification level
    if (level === 'ow') {
        waSelectedSites.delete('Naranjito');
    } else if (!waSelectedSites.has('Naranjito')) {
        waSelectedSites.add('Naranjito'); 
    }

    listEl.innerHTML = orderedSites.map(site => {
        const isNaranjito = site === 'Naranjito';
        const isDisabled = isNaranjito && level === 'ow';
        const isChecked = waSelectedSites.has(site) && !isDisabled;
        
        return `
        <label class="flex items-center gap-2 py-1 px-1.5 hover:bg-slate-50 rounded cursor-pointer transition-colors ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}">
            <input type="checkbox" value="${site}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} onchange="waToggleSite(this)" class="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer">
            <span class="text-xs font-bold text-slate-700">${site}</span>
        </label>`;
    }).join('');
    
    generateWhatsAppText();
};

window.waToggleSite = function(checkbox) {
    if (checkbox.checked) waSelectedSites.add(checkbox.value);
    else waSelectedSites.delete(checkbox.value);
    generateWhatsAppText();
};

window.waToggleAllSites = function(state) {
    const level = waCurrentLevel;
    const orderedSites = ['Fuera', 'Bajo de Dentro', 'Piles I', 'Piles II', 'Morra', 'Testa', 'Palomas', 'Naranjito', 'Cala'];
    
    if(state) {
        waSelectedSites = new Set(orderedSites);
        if(level === 'ow') waSelectedSites.delete('Naranjito');
    } else {
        waSelectedSites.clear();
    }
    waUpdateSiteFilters();
};

window.waRenderDateList = function() {
    const listEl = document.getElementById('wa-date-list');
    const sortedDates = Array.from(waSelectedIndividualDates).sort();
    
    listEl.innerHTML = sortedDates.map(dateStr => {
        const dateParts = dateStr.split('-');
        const curr = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        const prettyDate = curr.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        
        return `
        <div class="flex items-center justify-between py-1 px-1.5 hover:bg-slate-50 rounded transition-colors group">
            <span class="text-xs font-bold text-slate-700 capitalize">${prettyDate}</span>
            <button onclick="waRemoveDate('${dateStr}')" class="text-slate-300 hover:text-red-500 px-1 transition-colors" title="Eliminar">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>`;
    }).join('');
    
    generateWhatsAppText();
};

window.waAddManualDate = function() {
    const input = document.getElementById('wa-manual-date');
    if (input.value) {
        waSelectedIndividualDates.add(input.value);
        input.value = ''; // clear input after adding
        waRenderDateList();
    }
};

window.changeWaMonth = function(offset) {
    waCalendarViewDate.setMonth(waCalendarViewDate.getMonth() + offset);
    renderWaCalendar();
};

window.waClearRange = function() {
    waRangeStart = null;
    waRangeEnd = null;
    renderWaCalendar();
    generateWhatsAppText();
};

window.renderWaCalendar = function() {
    const grid = document.getElementById('wa-calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    document.getElementById('wa-calendar-month').innerText = `${MONTHS_ES[waCalendarViewDate.getMonth()]} ${waCalendarViewDate.getFullYear()}`.toUpperCase();

    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(day => {
        const el = document.createElement('div'); el.className = 'text-[9px] font-black text-slate-400 py-1 uppercase'; el.innerText = day;
        grid.appendChild(el);
    });

    const year = waCalendarViewDate.getFullYear(); 
    const month = waCalendarViewDate.getMonth();
    let firstDayIndex = new Date(year, month, 1).getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) grid.appendChild(document.createElement('div'));

    for (let day = 1; day <= daysInMonth; day++) {
        const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        let isStart = waRangeStart === cellDateStr;
        let isEnd = waRangeEnd === cellDateStr;
        let isInRange = waRangeStart && waRangeEnd && cellDateStr > waRangeStart && cellDateStr < waRangeEnd;
        let isToday = (day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear());
        let isWeekend = ((firstDayIndex + day - 1) % 7) >= 5;

        const cell = document.createElement('button');
        let baseClasses = 'w-6 h-6 text-xs font-bold flex items-center justify-center mx-auto transition-colors focus:outline-none ';
        
        if (isStart || isEnd) {
            baseClasses += 'bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700';
        } else if (isInRange) {
            baseClasses += 'bg-blue-100 text-blue-800 rounded-md w-full hover:bg-blue-200';
        } else if (isToday) {
            baseClasses += 'bg-slate-200 text-slate-700 rounded-full hover:bg-slate-300';
        } else {
            baseClasses += isWeekend ? 'text-red-500 hover:bg-red-50 rounded-full' : 'text-slate-700 hover:bg-slate-200 rounded-full';
        }

        cell.className = baseClasses; 
        cell.innerText = day;

        cell.onclick = () => {
            if (!waRangeStart || (waRangeStart && waRangeEnd)) {
                waRangeStart = cellDateStr;
                waRangeEnd = null;
            } else if (waRangeStart && !waRangeEnd) {
                if (cellDateStr < waRangeStart) {
                    waRangeEnd = waRangeStart;
                    waRangeStart = cellDateStr;
                } else {
                    waRangeEnd = cellDateStr;
                }
            }
            renderWaCalendar();
            generateWhatsAppText();
        };
        grid.appendChild(cell);
    }
};

window.waRemoveDate = function(dateStr) {
    waSelectedIndividualDates.delete(dateStr);
    waRenderDateList();
};

window.setWaLang = function(lang) {
    waCurrentLang = lang;
    ['es', 'en', 'nl'].forEach(l => {
        const btn = document.getElementById(`wa-lang-${l}`);
        if(l === lang) {
            btn.classList.add('opacity-100', 'ring-2', 'ring-blue-500');
            btn.classList.remove('opacity-50', 'hover:bg-slate-50');
        } else {
            btn.classList.add('opacity-50', 'hover:bg-slate-50');
            btn.classList.remove('opacity-100', 'ring-2', 'ring-blue-500');
        }
    });
    generateWhatsAppText();
};

window.generateWhatsAppText = function() {
    // If absolutely nothing is selected, clear output
    if (!waRangeStart && !waRangeEnd && waSelectedIndividualDates.size === 0) {
        document.getElementById('wa-output-text').value = '';
        return;
    }

    const allTrips = getMergedTrips(mergedAllocations);
    
    const filteredTrips = allTrips.filter(t => {
        let matchesDate = false;
        
        // 1. Check if it's within the Native Rango de Fechas
        if (waRangeStart && waRangeEnd && t.date >= waRangeStart && t.date <= waRangeEnd) {
            matchesDate = true;
        }
        // If only 1 click is registered on the calendar, show that single day temporarily
        if (waRangeStart && !waRangeEnd && t.date === waRangeStart) {
            matchesDate = true;
        }
        
        // 2. Check if it's explicitly added to the manual list
        if (waSelectedIndividualDates.has(t.date)) {
            matchesDate = true;
        }
        
        if (!matchesDate) return false;

        if (t.assignedBoat === 'shore' || t.assignedBoat === 'aula') return false;
        
        const guestsCount = t.guests ? t.guests.length : 0;
        if (guestsCount >= 12) return false;

        if (t.site && !waSelectedSites.has(t.site)) return false;
        if (!t.site && waSelectedSites.size === 0) return false;

        return true;
    });

    const grouped = {};
    filteredTrips.forEach(t => {
        if(!grouped[t.date]) grouped[t.date] = [];
        grouped[t.date].push(t);
    });

    const txt = {
        es: { spots: 'plazas libres', confirm: 'Por confirmar' },
        en: { spots: 'spots left', confirm: 'To be confirmed' },
        nl: { spots: 'plaatsen vrij', confirm: 'Nog te bevestigen' }
    };
    const dateLocales = { es: 'es-ES', en: 'en-GB', nl: 'nl-NL' };
    
    let output = "";
    
    Object.keys(grouped).sort().forEach(d => {
        const dateParts = d.split('-');
        const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        let dateTitle = dateObj.toLocaleDateString(dateLocales[waCurrentLang], { weekday: 'long', day: 'numeric', month: 'long' });
        dateTitle = dateTitle.charAt(0).toUpperCase() + dateTitle.slice(1);
        
        output += `📅 *${dateTitle}*\n`;
        
        grouped[d].sort((a,b) => a.time.localeCompare(b.time)).forEach(t => {
            const guestsCount = t.guests ? t.guests.length : 0;
            const freeSpots = 12 - guestsCount;
            
            let cxTime = t.time;
            if (t.time === '09:00') cxTime = '08:00';
            else if (t.time === '10:30') cxTime = '09:30';
            else if (t.time === '12:00') cxTime = '11:00';
            else if (t.time === '13:30') {
                const isReserva = SITES_RESERVE.includes(t.site);
                cxTime = isReserva ? '14:00' : '13:00';
            }
            else if (t.time === '15:00') cxTime = '15:30';

            const siteName = t.site || txt[waCurrentLang].confirm;
            const emoji = freeSpots >= 6 ? '🟢' : '🟡'; 
            
            const showSpots = document.getElementById('wa-toggle-plazas').checked;
            
            if (showSpots) {
                output += `🚤 ${cxTime} - ${siteName} (${emoji} ${freeSpots} ${txt[waCurrentLang].spots})\n`;
            } else {
                output += `🚤 ${cxTime} - ${siteName}\n`;
            }
        });
        output += `\n`;
    });

    document.getElementById('wa-output-text').value = output.trim();
};

window.copyWhatsAppText = function() {
    const text = document.getElementById('wa-output-text').value;
    navigator.clipboard.writeText(text).then(() => {
        showToast('¡Texto copiado al portapapeles!');
        document.getElementById('whatsapp-export-modal').classList.add('hidden');
    }).catch(err => {
        console.error('Error copying text: ', err);
        showAppAlert('Error al copiar el texto.');
    });
};