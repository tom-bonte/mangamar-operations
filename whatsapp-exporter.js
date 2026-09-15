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
    
    const orderedSites = ['Fuera', 'Bajo de Dentro', 'Piles I', 'Piles II', 'Morra', 'Testa', 'Palomas', 'Naranjito', 'Carbonero', 'Cala'];
    waSelectedSites = new Set(orderedSites);
    waSelectedIndividualDates.clear();
    
    setWaLevel('all'); 
    waRenderDateList();
    renderWaCalendar(); // Render native calendar
    setWaLang('es'); 
    if (window.populateWaTemplateDropdown) window.populateWaTemplateDropdown();
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
    const orderedSites = ['Fuera', 'Bajo de Dentro', 'Piles I', 'Piles II', 'Morra', 'Testa', 'Palomas', 'Naranjito', 'Carbonero', 'Cala'];
    
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
    const orderedSites = ['Fuera', 'Bajo de Dentro', 'Piles I', 'Piles II', 'Morra', 'Testa', 'Palomas', 'Naranjito', 'Carbonero', 'Cala'];
    
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
    waCalendarViewDate.setDate(1);
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
    window.waActiveTemplateId = null; // Reset custom template on language switch
    
    ['es', 'en', 'nl', 'fr'].forEach(l => {
        const btn = document.getElementById(`wa-lang-${l}`);
        if(l === lang) {
            btn.classList.add('opacity-100', 'ring-2', 'ring-blue-500');
            btn.classList.remove('opacity-50', 'hover:bg-slate-50');
        } else {
            btn.classList.add('opacity-50', 'hover:bg-slate-50');
            btn.classList.remove('opacity-100', 'ring-2', 'ring-blue-500');
        }
    });
    if (typeof window.populateWaTemplateDropdown === 'function') {
        window.populateWaTemplateDropdown();
    }
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
        if (t.cancelled) return false;
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
        if (t.site === 'Bloqueado' || t.site === '⛔ Bloqueado') return false;
        
        const guestsCount = t.guests ? t.guests.length : 0;
        const tripCapacity = parseInt(t.maxDives) || parseInt(t.pax) || parseInt(t.plazas) || (t.assignedBoat && window.BOATS && window.BOATS[t.assignedBoat] ? window.BOATS[t.assignedBoat].maxGuests : 11);
        if (guestsCount >= tripCapacity) return false;

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
        es: {
            header: "⚠️ *Información importante:*\n- Las horas indicadas corresponden a la hora de llegada al centro de buceo (no a la salida del barco).\n- Por favor, sé puntual y trae tu DNI, Pasaporte o documento de identidad en físico.\n- Al llegar al centro, primero, hay que pasar por recepción para entregar tu DNI en físico.",
            spots: 'plazas libres',
            confirm: 'Por confirmar'
        },
        en: {
            header: "⚠️ *Important notice:*\n- The times indicated correspond to your arrival time at the dive center (not the boat departure).\n- Please be on time and remember to bring your physical DNI, Passport or ID card.\n- Upon arrival at the center, please first go to reception to hand in your physical ID.",
            spots: 'spots left',
            confirm: 'To be confirmed'
        },
        nl: {
            header: "⚠️ *Belangrijke informatie:*\n- De aangegeven tijden zijn de aankomsttijden bij het duikcentrum (niet de vertrektijd van de boot).\n- Wees alsjeblieft op tijd en neem je fysieke DNI, paspoort of ID-kaart mee.\n- Ga bij aankomst in het centrum eerst langs de receptie om je fysieke DNI/ID-kaart af te geven.",
            spots: 'plaatsen vrij',
            confirm: 'Nog te bevestigen'
        },
        fr: {
            header: "⚠️ *Information importante :*\n- Les heures indiquées correspondent à l'heure d'arrivée au centre de plongée (non au départ du bateau).\n- Merci d'être ponctuel et d'apporter votre DNI, Passeport ou pièce d'identité physique.\n- À l'arrivée au centre, veuillez vous présenter d'abord à l'accueil pour présenter votre pièce d'identité physique.",
            spots: 'places libres',
            confirm: 'À confirmer'
        }
    };
    const dateLocales = { es: 'es-ES', en: 'en-GB', nl: 'nl-NL', fr: 'fr-FR' };
    
    let output = `${txt[waCurrentLang].header}\n\n`;
    let scheduleText = '';
    
    Object.keys(grouped).sort().forEach(d => {
        const dateParts = d.split('-');
        const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        let dateTitle = dateObj.toLocaleDateString(dateLocales[waCurrentLang], { weekday: 'long', day: 'numeric', month: 'long' });
        dateTitle = dateTitle.charAt(0).toUpperCase() + dateTitle.slice(1);
        
        scheduleText += `📅 *${dateTitle}*\n`;
        
        grouped[d].sort((a,b) => a.time.localeCompare(b.time)).forEach(t => {
            const guestsCount = t.guests ? t.guests.length : 0;
            const tripCapacity = parseInt(t.maxDives) || parseInt(t.pax) || parseInt(t.plazas) || (t.assignedBoat && window.BOATS && window.BOATS[t.assignedBoat] ? window.BOATS[t.assignedBoat].maxGuests : 11);
            const freeSpots = tripCapacity - guestsCount;
            
            let cxTime = t.time;
            if (t.time) {
                const parts = t.time.split(':');
                if (parts.length === 2) {
                    let hour = parseInt(parts[0], 10);
                    hour = (hour - 1 + 24) % 24;
                    const paddedHour = String(hour).padStart(2, '0');
                    cxTime = `${paddedHour}:${parts[1]}`;
                }
            }

            const siteName = t.site || txt[waCurrentLang].confirm;
            const emoji = freeSpots >= 6 ? '🟢' : '🟡'; 
            
            const showSpots = document.getElementById('wa-toggle-plazas').checked;
            
            if (showSpots) {
                scheduleText += `${cxTime} - ${siteName} (${emoji} ${freeSpots} ${txt[waCurrentLang].spots})\n`;
            } else {
                scheduleText += `${cxTime} - ${siteName}\n`;
            }
        });
        scheduleText += `\n`;
    });

    if (window.waActiveTemplateId && window.waTemplates) {
        const selectedTpl = window.waTemplates.find(t => t.id === window.waActiveTemplateId);
        if (selectedTpl && selectedTpl.body) {
            let templateBody = selectedTpl.body;
            if (templateBody.includes('{{SCHEDULE}}')) {
                output = templateBody.replace('{{SCHEDULE}}', scheduleText.trim());
            } else {
                output = templateBody + "\n\n" + scheduleText.trim();
            }
        } else {
            output += scheduleText;
        }
    } else {
        output += scheduleText;
    }

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

window.populateWaTemplateDropdown = function() {
    const selector = document.getElementById('wa-template-selector');
    if (!selector) return;
    
    const curLang = typeof waCurrentLang !== 'undefined' ? waCurrentLang : 'es';
    const templates = (window.waTemplates || []).filter(t => (t.lang || 'es') === curLang);
    const sections = typeof window.getWaSections === 'function' ? window.getWaSections() : ['General'];
    const currentVal = selector.value || window.waActiveTemplateId;
    
    selector.innerHTML = '';
    
    const optDefault = document.createElement('option');
    optDefault.value = '';
    optDefault.textContent = 'Predeterminado (Automático)';
    selector.appendChild(optDefault);
    
    // Group templates by section
    const grouped = {};
    sections.forEach(s => grouped[s] = []);
    templates.forEach(t => {
        const sec = t.section || t.category || 'General';
        if (!grouped[sec]) grouped[sec] = [];
        grouped[sec].push(t);
    });
    
    sections.forEach(sec => {
        const list = grouped[sec] || [];
        if (list.length === 0) return;
        const optgroup = document.createElement('optgroup');
        optgroup.label = sec;
        list.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name || 'Sin nombre';
            if (t.id === currentVal) opt.selected = true;
            optgroup.appendChild(opt);
        });
        selector.appendChild(optgroup);
    });
    
    if (currentVal && templates.some(t => t.id === currentVal)) {
        selector.value = currentVal;
    }
};

window.selectWaTemplate = function(templateId) {
    window.waActiveTemplateId = templateId || null;
    if (typeof generateWhatsAppText === 'function') {
        generateWhatsAppText();
    }
};

// ==========================================
// WhatsApp Templates CRUD Logic with Sections
// ==========================================

window.waActiveTemplateId = null; // Currently applied template in WhatsApp exporter
window.waTemplateLang = 'es';
let activeTemplateId = null; // Currently editing template ID
window.waCollapsedSections = window.waCollapsedSections || new Set();
window.waTemplateSearchQuery = '';

// Helper to get all available sections
window.getWaSections = function() {
    let sections = (window.waTemplateSections && Array.isArray(window.waTemplateSections) && window.waTemplateSections.length > 0) 
        ? [...window.waTemplateSections] 
        : ['General', 'WhatsApp', 'Cursos', 'Tarifas', 'Logística'];
    
    // Ensure 'General' is always first
    if (!sections.includes('General')) sections.unshift('General');
    
    // Include any custom section already stored on existing templates
    (window.waTemplates || []).forEach(t => {
        const s = t.section || t.category;
        if (s && !sections.includes(s)) sections.push(s);
    });
    
    return sections;
};

window.setWaTemplateLang = function(lang) {
    window.waTemplateLang = lang;
    
    // Update tabs UI with modern active styling
    ['es', 'en', 'nl', 'fr'].forEach(l => {
        const btn = document.getElementById(`wa-tpl-lang-${l}`);
        if (!btn) return;
        if (l === lang) {
            btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs bg-white text-blue-600 ring-1 ring-slate-200/80';
        } else {
            btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100/70 transition-all';
        }
    });
    
    window.renderWaTemplateList();
    
    const templates = (window.waTemplates || []).filter(t => (t.lang || 'es') === window.waTemplateLang);
    if (templates.length > 0) {
        window.loadWaTemplateIntoEditor(templates[0].id);
    } else {
        window.createNewWaTemplate();
    }
};

window.openWaTemplateModal = function() {
    const modal = document.getElementById('wa-template-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    
    // Default to the language currently selected in the main export view
    window.setWaTemplateLang(typeof waCurrentLang !== 'undefined' ? waCurrentLang : 'es');
};

window.filterWaTemplates = function(query) {
    window.waTemplateSearchQuery = (query || '').toLowerCase().trim();
    window.renderWaTemplateList();
};

window.toggleWaSectionCollapse = function(secName) {
    if (window.waCollapsedSections.has(secName)) {
        window.waCollapsedSections.delete(secName);
    } else {
        window.waCollapsedSections.add(secName);
    }
    window.renderWaTemplateList();
};

window.renderWaTemplateList = function() {
    const list = document.getElementById('wa-template-list');
    if (!list) return;
    
    const allTemplates = window.waTemplates || [];
    const langTemplates = allTemplates.filter(t => (t.lang || 'es') === window.waTemplateLang);
    const sections = window.getWaSections();
    const query = window.waTemplateSearchQuery;
    
    list.innerHTML = '';
    
    // Group templates by section
    const grouped = {};
    sections.forEach(s => { grouped[s] = []; });
    
    langTemplates.forEach(t => {
        const sec = t.section || t.category || 'General';
        if (!grouped[sec]) {
            grouped[sec] = [];
            sections.push(sec);
        }
        if (query) {
            const matchName = (t.name || '').toLowerCase().includes(query);
            const matchBody = (t.body || '').toLowerCase().includes(query);
            const matchSec = sec.toLowerCase().includes(query);
            if (matchName || matchBody || matchSec) {
                grouped[sec].push(t);
            }
        } else {
            grouped[sec].push(t);
        }
    });

    let totalVisible = 0;
    
    sections.forEach(secName => {
        const items = grouped[secName] || [];
        if (query && items.length === 0) return;
        
        totalVisible += items.length;
        const isCollapsed = window.waCollapsedSections.has(secName);
        
        const secContainer = document.createElement('div');
        secContainer.className = 'mb-2.5 bg-white/70 rounded-xl border border-slate-200/70 overflow-hidden shadow-2xs transition-all';
        
        // Section Header
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between px-3 py-2 bg-slate-50/90 hover:bg-slate-100/80 cursor-pointer select-none transition-colors border-b border-slate-100 group';
        
        const isDefaultGeneral = secName === 'General';
        
        header.innerHTML = `
            <div class="flex items-center gap-2 min-w-0 flex-1" onclick="window.toggleWaSectionCollapse('${window.escapeHtml(secName)}')">
                <svg class="w-3.5 h-3.5 text-slate-400 transform transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
                </svg>
                <span class="font-black text-xs text-slate-700 tracking-tight truncate">${window.escapeHtml(secName)}</span>
                <span class="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-slate-200/70 text-slate-600">${items.length}</span>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                <button type="button" onclick="event.stopPropagation(); window.createNewWaTemplate('${window.escapeHtml(secName)}')" class="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Nueva plantilla en ${window.escapeHtml(secName)}">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                </button>
                ${!isDefaultGeneral ? `
                <button type="button" onclick="event.stopPropagation(); window.promptRenameWaSection('${window.escapeHtml(secName)}')" class="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title="Renombrar sección">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </button>
                <button type="button" onclick="event.stopPropagation(); window.promptDeleteWaSection('${window.escapeHtml(secName)}')" class="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Eliminar sección">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>` : ''}
            </div>
        `;
        
        secContainer.appendChild(header);
        
        // Section Items
        if (!isCollapsed) {
            const bodyContainer = document.createElement('div');
            bodyContainer.className = 'p-1.5 space-y-1';
            
            if (items.length === 0) {
                bodyContainer.innerHTML = `
                    <div class="py-2 px-3 text-[11px] text-slate-400 italic text-center">
                        Sin plantillas
                        <button type="button" onclick="window.createNewWaTemplate('${window.escapeHtml(secName)}')" class="block mx-auto mt-0.5 text-blue-600 font-bold hover:underline">+ Crear una</button>
                    </div>
                `;
            } else {
                items.forEach(t => {
                    const isSelected = activeTemplateId === t.id;
                    const itemBtn = document.createElement('button');
                    itemBtn.type = 'button';
                    itemBtn.className = `w-full text-left p-2.5 rounded-lg transition-all flex flex-col gap-0.5 border ${
                        isSelected 
                            ? 'bg-blue-50/90 border-blue-200 text-blue-900 shadow-xs ring-1 ring-blue-400/20' 
                            : 'bg-transparent border-transparent hover:bg-slate-100/80 text-slate-700'
                    }`;
                    
                    const previewText = (t.body || '').replace(/[\r\n]+/g, ' ').trim();
                    
                    itemBtn.innerHTML = `
                        <div class="flex items-center justify-between w-full">
                            <span class="text-xs font-bold truncate flex-1 ${isSelected ? 'text-blue-900' : 'text-slate-800'}">${window.escapeHtml(t.name || 'Sin nombre')}</span>
                            ${isSelected ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 ml-1.5"></span>' : ''}
                        </div>
                        <p class="text-[11px] text-slate-400 truncate w-full font-normal leading-tight">${window.escapeHtml(previewText || 'Vacía')}</p>
                    `;
                    
                    itemBtn.onclick = () => window.loadWaTemplateIntoEditor(t.id);
                    bodyContainer.appendChild(itemBtn);
                });
            }
            secContainer.appendChild(bodyContainer);
        }
        
        list.appendChild(secContainer);
    });
    
    if (query && totalVisible === 0) {
        list.innerHTML = `
            <div class="p-6 text-center text-slate-400 text-xs">
                <svg class="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                No hay resultados para "${window.escapeHtml(query)}"
            </div>
        `;
    }
};

window.populateWaTemplateSectionDropdown = function(selectedSec = 'General') {
    const sel = document.getElementById('wa-tpl-section');
    if (!sel) return;
    
    const sections = window.getWaSections();
    sel.innerHTML = '';
    
    sections.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (s === selectedSec) opt.selected = true;
        sel.appendChild(opt);
    });
    
    // Add separator & option to create a new section
    const newOpt = document.createElement('option');
    newOpt.value = '__NEW_SECTION__';
    newOpt.textContent = '➕ Nueva sección...';
    sel.appendChild(newOpt);
};

window.onWaTemplateSectionChange = function(val) {
    if (val === '__NEW_SECTION__') {
        window.promptCreateWaSection(true);
    }
};

window.loadWaTemplateIntoEditor = function(id) {
    activeTemplateId = id;
    const templates = window.waTemplates || [];
    const tpl = templates.find(t => t.id === id);
    
    const emptyState = document.getElementById('wa-template-empty-state');
    
    if (tpl) {
        emptyState.classList.add('hidden');
        document.getElementById('wa-tpl-name').value = tpl.name || '';
        const sec = tpl.section || tpl.category || 'General';
        window.populateWaTemplateSectionDropdown(sec);
        document.getElementById('wa-tpl-body').value = tpl.body || '';
        window.updateWaTemplateStats();
    } else {
        emptyState.classList.remove('hidden');
    }
    
    window.renderWaTemplateList();
};

window.createNewWaTemplate = function(targetSection = 'General') {
    activeTemplateId = 'temp_' + Date.now();
    const emptyState = document.getElementById('wa-template-empty-state');
    emptyState.classList.add('hidden');
    
    const nameEl = document.getElementById('wa-tpl-name');
    nameEl.value = 'Nueva Plantilla';
    window.populateWaTemplateSectionDropdown(targetSection);
    
    document.getElementById('wa-tpl-body').value = "Hola,\n\nEsta es nuestra disponibilidad:\n\n{{SCHEDULE}}\n\n¡Te esperamos!";
    
    window.updateWaTemplateStats();
    window.renderWaTemplateList();
    nameEl.focus();
    nameEl.select();
};

window.updateWaTemplateStats = function() {
    const textarea = document.getElementById('wa-tpl-body');
    const statsEl = document.getElementById('wa-tpl-stats');
    if (!textarea || !statsEl) return;
    
    const text = textarea.value;
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lineCount = text ? text.split('\n').length : 0;
    
    statsEl.textContent = `${charCount} caracteres • ${wordCount} palabras • ${lineCount} líneas`;
};

window.insertWaTemplateVariable = function(varName) {
    const textarea = document.getElementById('wa-tpl-body');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;
    
    const replacement = varName;
    textarea.value = current.substring(0, start) + replacement + current.substring(end);
    textarea.focus();
    const newPos = start + replacement.length;
    textarea.setSelectionRange(newPos, newPos);
    window.updateWaTemplateStats();
};

window.saveWaTemplate = async function() {
    if (!activeTemplateId) return;
    
    const name = document.getElementById('wa-tpl-name').value.trim() || 'Sin nombre';
    const sectionEl = document.getElementById('wa-tpl-section');
    let section = (sectionEl ? sectionEl.value : 'General');
    if (section === '__NEW_SECTION__') section = 'General';
    
    const body = document.getElementById('wa-tpl-body').value;
    
    let templates = window.waTemplates ? [...window.waTemplates] : [];
    
    // Check if updating existing
    const existingIndex = templates.findIndex(t => t.id === activeTemplateId);
    
    if (existingIndex >= 0) {
        templates[existingIndex].name = name;
        templates[existingIndex].section = section;
        templates[existingIndex].body = body;
    } else {
        const newId = 'tpl_' + Date.now();
        templates.push({
            id: newId,
            name: name,
            section: section,
            body: body,
            lang: window.waTemplateLang || 'es'
        });
        activeTemplateId = newId;
    }
    
    // Ensure section exists in waTemplateSections
    let sections = window.getWaSections();
    if (!sections.includes(section)) {
        sections.push(section);
        window.waTemplateSections = sections;
    }
    
    const saveBtn = document.getElementById('btn-save-wa-template');
    let originalHtml = '';
    if (saveBtn) {
        originalHtml = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<svg class="animate-spin w-4 h-4 text-white inline mr-1" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Guardando...`;
    }
    
    if (typeof window.saveWaTemplatesToFirebase === 'function') {
        const success = await window.saveWaTemplatesToFirebase(templates, sections);
        if (success) {
            window.waTemplates = templates;
            window.waTemplateSections = sections;
            if (window.showToast) window.showToast("Plantilla guardada correctamente.");
            window.renderWaTemplateList();
            window.populateWaTemplateSectionDropdown(section);
        } else {
            if (window.showAppAlert) window.showAppAlert("Error al guardar la plantilla.");
        }
    }
    
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
    }
};

window.deleteCurrentWaTemplate = function() {
    if (!activeTemplateId) return;
    
    const doDelete = async () => {
        let templates = window.waTemplates ? [...window.waTemplates] : [];
        templates = templates.filter(t => t.id !== activeTemplateId);
        
        if (typeof window.saveWaTemplatesToFirebase === 'function') {
            const success = await window.saveWaTemplatesToFirebase(templates, window.getWaSections());
            if (success) {
                window.waTemplates = templates;
                if (window.showToast) window.showToast("Plantilla eliminada.");
                
                activeTemplateId = null;
                const remaining = templates.filter(t => (t.lang || 'es') === window.waTemplateLang);
                if (remaining.length > 0) {
                    window.loadWaTemplateIntoEditor(remaining[0].id);
                } else {
                    document.getElementById('wa-tpl-name').value = '';
                    document.getElementById('wa-tpl-body').value = '';
                    const emptyState = document.getElementById('wa-template-empty-state');
                    if (emptyState) emptyState.classList.remove('hidden');
                    window.renderWaTemplateList();
                }
            } else {
                if (window.showAppAlert) window.showAppAlert("Error al eliminar.");
            }
        }
    };
    
    if (window.showAppConfirm) {
        window.showAppConfirm("¿Estás seguro de que quieres eliminar esta plantilla?", doDelete);
    } else {
        if (confirm("¿Estás seguro de que quieres eliminar esta plantilla?")) doDelete();
    }
};

window.promptCreateWaSection = async function(selectInEditor = false) {
    const secName = prompt("Nombre de la nueva sección (ej: Cursos, Tarifas, WhatsApp):");
    if (!secName || !secName.trim()) return;
    
    const cleanName = secName.trim();
    let sections = window.getWaSections();
    if (sections.map(s => s.toLowerCase()).includes(cleanName.toLowerCase())) {
        if (window.showToast) window.showToast("La sección ya existe.");
        if (selectInEditor) {
            const match = sections.find(s => s.toLowerCase() === cleanName.toLowerCase());
            window.populateWaTemplateSectionDropdown(match);
        }
        return;
    }
    
    sections.push(cleanName);
    window.waTemplateSections = sections;
    
    if (typeof window.saveWaTemplatesToFirebase === 'function') {
        await window.saveWaTemplatesToFirebase(window.waTemplates || [], sections);
    }
    
    if (window.showToast) window.showToast(`Sección "${cleanName}" creada.`);
    window.renderWaTemplateList();
    
    if (selectInEditor) {
        window.populateWaTemplateSectionDropdown(cleanName);
    } else {
        const curSec = document.getElementById('wa-tpl-section')?.value || 'General';
        window.populateWaTemplateSectionDropdown(curSec);
    }
};

window.promptRenameWaSection = async function(oldName) {
    if (oldName === 'General') {
        if (window.showToast) window.showToast("La sección 'General' no se puede renombrar.");
        return;
    }
    
    const newName = prompt(`Renombrar sección "${oldName}" a:`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    
    const cleanNew = newName.trim();
    let sections = window.getWaSections().map(s => s === oldName ? cleanNew : s);
    window.waTemplateSections = sections;
    
    let templates = window.waTemplates ? [...window.waTemplates] : [];
    templates.forEach(t => {
        if ((t.section || t.category) === oldName) {
            t.section = cleanNew;
        }
    });
    window.waTemplates = templates;
    
    if (typeof window.saveWaTemplatesToFirebase === 'function') {
        await window.saveWaTemplatesToFirebase(templates, sections);
    }
    
    if (window.showToast) window.showToast(`Sección renombrada a "${cleanNew}".`);
    window.renderWaTemplateList();
    
    const curSec = document.getElementById('wa-tpl-section')?.value;
    window.populateWaTemplateSectionDropdown(curSec === oldName ? cleanNew : curSec);
};

window.promptDeleteWaSection = async function(secName) {
    if (secName === 'General') {
        if (window.showToast) window.showToast("La sección 'General' no se puede eliminar.");
        return;
    }
    
    const confirmDelete = confirm(`¿Eliminar la sección "${secName}"?\nLas plantillas dentro de esta sección se moverán a "General".`);
    if (!confirmDelete) return;
    
    let sections = window.getWaSections().filter(s => s !== secName);
    window.waTemplateSections = sections;
    
    let templates = window.waTemplates ? [...window.waTemplates] : [];
    templates.forEach(t => {
        if ((t.section || t.category) === secName) {
            t.section = 'General';
        }
    });
    window.waTemplates = templates;
    
    if (typeof window.saveWaTemplatesToFirebase === 'function') {
        await window.saveWaTemplatesToFirebase(templates, sections);
    }
    
    if (window.showToast) window.showToast(`Sección "${secName}" eliminada.`);
    window.renderWaTemplateList();
    
    const curSec = document.getElementById('wa-tpl-section')?.value;
    window.populateWaTemplateSectionDropdown(curSec === secName ? 'General' : curSec);
};

window.copyWaTemplateText = function() {
    const text = document.getElementById('wa-tpl-body').value;
    if (!text.trim()) {
        if (window.showAppAlert) window.showAppAlert("No hay texto para copiar.");
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        if (window.showToast) window.showToast("¡Texto copiado al portapapeles!");
        const copyBtn = document.getElementById('btn-copy-wa-template');
        if (copyBtn) {
            const orig = copyBtn.innerHTML;
            copyBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg> ¡Copiado!`;
            copyBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
            copyBtn.classList.add('bg-emerald-700');
            setTimeout(() => {
                copyBtn.innerHTML = orig;
                copyBtn.classList.remove('bg-emerald-700');
                copyBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
            }, 1800);
        }
    }).catch(err => {
        console.error('Error copying text: ', err);
        if (window.showAppAlert) window.showAppAlert('Error al copiar el texto.');
    });
};

window.formatWaTemplateText = function(type) {
    const textarea = document.getElementById('wa-tpl-body');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let beforeText = textarea.value.substring(0, start);
    let afterText = textarea.value.substring(end);
    
    let marker = '';
    switch (type) {
        case 'bold': marker = '*'; break;
        case 'italic': marker = '_'; break;
        case 'strikethrough': marker = '~'; break;
        case 'monospace': marker = '```'; break;
    }

    let leadingSpace = '';
    let trailingSpace = '';
    let coreText = selectedText;

    if (selectedText) {
        const matchLeading = selectedText.match(/^\s*/);
        if (matchLeading) leadingSpace = matchLeading[0];
        
        const matchTrailing = selectedText.match(/\s*$/);
        if (matchTrailing) trailingSpace = matchTrailing[0];
        
        if (leadingSpace.length + trailingSpace.length < selectedText.length) {
            coreText = selectedText.substring(leadingSpace.length, selectedText.length - trailingSpace.length);
        } else {
            coreText = '';
        }
    }
    
    let isWrappedInside = coreText.length >= marker.length * 2 && coreText.startsWith(marker) && coreText.endsWith(marker);
    let isWrappedOutside = beforeText.endsWith(marker) && afterText.startsWith(marker);
    
    let replacement, startAction, endAction, newStart, newSelectionLength;

    if (isWrappedInside) {
        coreText = coreText.substring(marker.length, coreText.length - marker.length);
        replacement = leadingSpace + coreText + trailingSpace;
        startAction = start;
        endAction = end;
        newStart = start + leadingSpace.length;
        newSelectionLength = coreText.length;
    } else if (isWrappedOutside) {
        beforeText = beforeText.substring(0, beforeText.length - marker.length);
        afterText = afterText.substring(marker.length);
        replacement = selectedText; 
        startAction = start - marker.length;
        endAction = end + marker.length;
        newStart = start - marker.length;
        newSelectionLength = selectedText.length;
    } else {
        replacement = leadingSpace + marker + coreText + marker + trailingSpace;
        startAction = start;
        endAction = end;
        newStart = start + leadingSpace.length + marker.length;
        newSelectionLength = coreText.length;
    }
    
    textarea.focus();
    textarea.setSelectionRange(startAction, endAction);
    
    if (!document.execCommand('insertText', false, replacement)) {
        textarea.value = beforeText + replacement + afterText;
    }
    
    textarea.setSelectionRange(newStart, newStart + newSelectionLength);
    window.updateWaTemplateStats();
};

window.undoWaTemplateText = function() {
    const textarea = document.getElementById('wa-tpl-body');
    if (textarea) {
        textarea.focus();
        document.execCommand('undo');
        window.updateWaTemplateStats();
    }
};

window.redoWaTemplateText = function() {
    const textarea = document.getElementById('wa-tpl-body');
    if (textarea) {
        textarea.focus();
        document.execCommand('redo');
        window.updateWaTemplateStats();
    }
};

window.translateAllWaTemplates = async function() {
    let templates = window.waTemplates ? [...window.waTemplates] : [];
    if (templates.length === 0) {
        if (window.showAppAlert) window.showAppAlert("No hay plantillas para traducir.");
        return;
    }

    const doTranslate = async () => {
        await executeTranslateAll(templates);
    };

    if (window.showAppConfirm) {
        window.showAppConfirm("¿Quieres traducir y crear automáticamente las versiones en los idiomas que faltan para todas las plantillas?", doTranslate);
    } else {
        if (confirm("¿Quieres traducir y crear automáticamente las versiones en los idiomas que faltan para todas las plantillas?")) doTranslate();
    }
};

async function executeTranslateAll(templates) {
    if (window.showToast) window.showToast("Traduciendo plantillas, por favor espera...", 6000);

    const languages = ['es', 'en', 'nl', 'fr'];
    const uniqueNames = [...new Set(templates.map(t => t.name))];
    let changesMade = false;

    for (const name of uniqueNames) {
        const sourceTemplate = templates.find(t => t.name === name);
        if (!sourceTemplate) continue;

        for (const targetLang of languages) {
            const exists = templates.some(t => t.name === name && (t.lang || 'es') === targetLang);
            if (!exists) {
                try {
                    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceTemplate.body)}&langpair=${sourceTemplate.lang || 'es'}|${targetLang}`);
                    const data = await res.json();
                    
                    if (data.responseData && data.responseData.translatedText) {
                        templates.push({
                            id: 'tpl_' + Date.now() + Math.random().toString(36).substr(2, 5),
                            name: name,
                            section: sourceTemplate.section || sourceTemplate.category || 'General',
                            body: data.responseData.translatedText,
                            lang: targetLang
                        });
                        changesMade = true;
                        await new Promise(r => setTimeout(r, 600)); // Respect rate limits
                    }
                } catch (e) {
                    console.error("Translation error", e);
                }
            }
        }
    }

    if (changesMade) {
        if (typeof window.saveWaTemplatesToFirebase === 'function') {
            const success = await window.saveWaTemplatesToFirebase(templates, window.getWaSections());
            if (success) {
                window.waTemplates = templates;
                if (window.showToast) window.showToast("¡Traducciones completadas y guardadas!");
                window.renderWaTemplateList();
            } else {
                if (window.showAppAlert) window.showAppAlert("Error al guardar traducciones.");
            }
        }
    } else {
        if (window.showToast) window.showToast("Todas las plantillas ya están traducidas en todos los idiomas.");
    }
}
