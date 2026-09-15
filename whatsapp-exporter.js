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

// ==========================================
// WhatsApp Templates CRUD Logic
// ==========================================

window.waActiveTemplateId = null; // Currently applied template
window.waTemplateLang = 'es';
let activeTemplateId = null; // Currently editing template

window.setWaTemplateLang = function(lang) {
    window.waTemplateLang = lang;
    
    // Update tabs UI
    ['es', 'en', 'nl', 'fr'].forEach(l => {
        const btn = document.getElementById(`wa-tpl-lang-${l}`);
        if (!btn) return;
        if(l === lang) {
            btn.classList.add('opacity-100', 'ring-2', 'ring-blue-500');
            btn.classList.remove('opacity-50', 'hover:bg-slate-50');
        } else {
            btn.classList.add('opacity-50', 'hover:bg-slate-50');
            btn.classList.remove('opacity-100', 'ring-2', 'ring-blue-500');
        }
    });
    
    window.renderWaTemplateList();
    
    const templates = (window.waTemplates || []).filter(t => t.lang === window.waTemplateLang);
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
    
    // Default to the same language currently selected in the main view
    window.setWaTemplateLang(waCurrentLang);
};

window.renderWaTemplateList = function() {
    const list = document.getElementById('wa-template-list');
    if (!list) return;
    
    const allTemplates = window.waTemplates || [];
    const templates = allTemplates.filter(t => t.lang === window.waTemplateLang);
    list.innerHTML = '';
    
    templates.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `w-full text-left px-3 py-2 rounded-lg text-sm font-bold truncate transition-colors ${activeTemplateId === t.id ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`;
        btn.textContent = t.name || 'Sin nombre';
        btn.onclick = () => window.loadWaTemplateIntoEditor(t.id);
        list.appendChild(btn);
    });
};

window.loadWaTemplateIntoEditor = function(id) {
    activeTemplateId = id;
    const templates = window.waTemplates || [];
    const tpl = templates.find(t => t.id === id);
    
    const emptyState = document.getElementById('wa-template-empty-state');
    
    if (tpl) {
        emptyState.classList.add('hidden');
        document.getElementById('wa-tpl-name').value = tpl.name || '';
        document.getElementById('wa-tpl-body').value = tpl.body || '';
    } else {
        emptyState.classList.remove('hidden');
    }
    
    window.renderWaTemplateList();
};

window.createNewWaTemplate = function() {
    activeTemplateId = 'temp_' + Date.now();
    const emptyState = document.getElementById('wa-template-empty-state');
    emptyState.classList.add('hidden');
    
    document.getElementById('wa-tpl-name').value = 'New Template';
    document.getElementById('wa-tpl-body').value = "Hello,\n\nHere is our availability:\n\n{{SCHEDULE}}\n\nSee you soon!";
    
    // Deselect list items
    const list = document.getElementById('wa-template-list');
    if (list) {
        Array.from(list.children).forEach(child => {
            child.className = 'w-full text-left px-3 py-2 rounded-lg text-sm font-bold truncate transition-colors text-slate-600 hover:bg-slate-100';
        });
    }
};

window.saveWaTemplate = async function() {
    if (!activeTemplateId) return;
    
    const name = document.getElementById('wa-tpl-name').value.trim() || 'Sin nombre';
    const body = document.getElementById('wa-tpl-body').value;
    
    let templates = window.waTemplates ? [...window.waTemplates] : [];
    
    // Check if updating existing
    const existingIndex = templates.findIndex(t => t.id === activeTemplateId);
    
    if (existingIndex >= 0) {
        templates[existingIndex].name = name;
        templates[existingIndex].body = body;
    } else {
        // It's a new template, assign a real ID
        const newId = 'tpl_' + Date.now();
        templates.push({
            id: newId,
            name: name,
            body: body,
            lang: window.waTemplateLang
        });
        activeTemplateId = newId;
    }
    
    if (typeof window.saveWaTemplatesToFirebase === 'function') {
        const success = await window.saveWaTemplatesToFirebase(templates);
        if (success) {
            window.waTemplates = templates;
            if (window.showToast) window.showToast("Template saved successfully.");
            
            activeTemplateId = null;
            document.getElementById('wa-tpl-name').value = '';
            document.getElementById('wa-tpl-body').value = '';
            const emptyState = document.getElementById('wa-template-empty-state');
            if (emptyState) emptyState.classList.remove('hidden');
            
            window.renderWaTemplateList();
        } else {
            if (window.showAppAlert) window.showAppAlert("Error al guardar la plantilla.");
        }
    }
};

window.deleteCurrentWaTemplate = function() {
    if (!activeTemplateId) return;
    
    if (window.showAppConfirm) {
        window.showAppConfirm("¿Estás seguro de que quieres eliminar este template?", async () => {
            await executeDeleteWaTemplate();
        });
    } else {
        if (!confirm("Are you sure you want to delete this template?")) return;
        executeDeleteWaTemplate();
    }
};

async function executeDeleteWaTemplate() {
    let templates = window.waTemplates ? [...window.waTemplates] : [];
    templates = templates.filter(t => t.id !== activeTemplateId);
    
    if (typeof window.saveWaTemplatesToFirebase === 'function') {
        const success = await window.saveWaTemplatesToFirebase(templates);
        if (success) {
            window.waTemplates = templates;
            if (window.showToast) window.showToast("Template deleted.");
            
            activeTemplateId = null;
            document.getElementById('wa-tpl-name').value = '';
            document.getElementById('wa-tpl-body').value = '';
            const emptyState = document.getElementById('wa-template-empty-state');
            if (emptyState) emptyState.classList.remove('hidden');
            
            window.renderWaTemplateList();
        } else {
            if (window.showAppAlert) window.showAppAlert("Error al eliminar.");
        }
    }
}

window.copyWaTemplateText = function() {
    const text = document.getElementById('wa-tpl-body').value;
    
    if (!text.trim()) {
        if (window.showAppAlert) window.showAppAlert("No hay texto para copiar.");
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        if (window.showToast) window.showToast("¡Texto copiado al portapapeles!");
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
    
    // Using execCommand preserves the native undo stack
    if (!document.execCommand('insertText', false, replacement)) {
        // Fallback for browsers that don't support execCommand on textarea
        textarea.value = beforeText + replacement + afterText;
    }
    
    // Reselect the core text inside/outside the markers
    textarea.setSelectionRange(newStart, newStart + newSelectionLength);
};

window.undoWaTemplateText = function() {
    const textarea = document.getElementById('wa-tpl-body');
    if (textarea) {
        textarea.focus();
        document.execCommand('undo');
    }
};

window.redoWaTemplateText = function() {
    const textarea = document.getElementById('wa-tpl-body');
    if (textarea) {
        textarea.focus();
        document.execCommand('redo');
    }
};
