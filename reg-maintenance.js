// ==========================================
// REGULATOR MAINTENANCE & GEAR SERVICE ENGINE
// ==========================================

window.regServiceList = [];
window.activeRegTicketId = null;

// Default brand options
window.REG_BRANDS = [
    'Aqualung', 'Apeks', 'Scubapro', 'Mares', 'Cressi',
    'Atomic Aquatics', 'Poseidon', 'Halcyon', 'Tecline',
    'Hollis', 'Beuchat', 'Oceanic', 'Sherwood', 'Otra...'
];

// Initialize and listen to Firestore
window.initRegMaintenanceDB = function() {
    if (typeof db === 'undefined' || !db) return;
    try {
        db.collection(INTERNAL_DB).doc('reg_maintenance').onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                window.regServiceList = data.tickets || [];
            } else {
                window.regServiceList = [];
            }
            if (document.getElementById('reg-maintenance-modal') && !document.getElementById('reg-maintenance-modal').classList.contains('hidden')) {
                window.renderRegHistoryList();
            }
        }, err => {
            console.warn("Regulator maintenance db sync error:", err);
        });
    } catch (e) {
        console.warn("Error initializing reg maintenance db:", e);
    }
};

// Open the Modal
window.openRegMaintenanceModal = function(ticketId = null) {
    const modal = document.getElementById('reg-maintenance-modal');
    if (!modal) return;

    // Populate Staff dropdown for "Recepcionado por"
    const staffSelect = document.getElementById('reg-input-staff');
    if (staffSelect) {
        const allStaff = [
            ...(window.staffDatabase.guias || []),
            ...(window.staffDatabase.recepcion || []),
            ...(window.staffDatabase.capitanes || [])
        ];
        const staffNames = [...new Set(allStaff.map(s => s.nombre))].sort((a,b) => a.localeCompare(b));
        staffSelect.innerHTML = '<option value="">— Seleccionar personal —</option>' +
            staffNames.map(name => `<option value="${name}">${name}</option>`).join('');
    }

    if (ticketId) {
        window.loadRegTicketForEdit(ticketId);
    } else {
        window.resetRegForm();
    }

    window.switchRegTab('form');
    modal.classList.remove('hidden');
    window.updateRegLivePreview();
};

// Close the Modal
window.closeRegMaintenanceModal = function() {
    const modal = document.getElementById('reg-maintenance-modal');
    if (modal) modal.classList.add('hidden');
    const sres = document.getElementById('reg-crm-search-results');
    if (sres) sres.classList.add('hidden');
};

// Switch Tabs: 'form' (Form & Preview) | 'history' (History List)
window.switchRegTab = function(tabName) {
    const formTab = document.getElementById('reg-tab-form');
    const histTab = document.getElementById('reg-tab-history');
    const btnForm = document.getElementById('reg-btn-tab-form');
    const btnHist = document.getElementById('reg-btn-tab-history');

    if (tabName === 'history') {
        if (formTab) formTab.classList.add('hidden');
        if (histTab) histTab.classList.remove('hidden');
        if (btnForm) {
            btnForm.className = "px-4 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all";
        }
        if (btnHist) {
            btnHist.className = "px-4 py-2 text-xs font-black rounded-xl bg-cyan-600 text-white shadow-sm transition-all";
        }
        window.renderRegHistoryList();
    } else {
        if (formTab) formTab.classList.remove('hidden');
        if (histTab) histTab.classList.add('hidden');
        if (btnForm) {
            btnForm.className = "px-4 py-2 text-xs font-black rounded-xl bg-cyan-600 text-white shadow-sm transition-all";
        }
        if (btnHist) {
            btnHist.className = "px-4 py-2 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all";
        }
    }
};

// Reset Form to New Ticket
window.resetRegForm = function() {
    window.activeRegTicketId = null;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayIso = `${yyyy}-${mm}-${dd}`;

    // Target completion: +7 days
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextYyyy = nextWeek.getFullYear();
    const nextMm = String(nextWeek.getMonth() + 1).padStart(2, '0');
    const nextDd = String(nextWeek.getDate()).padStart(2, '0');
    const nextWeekIso = `${nextYyyy}-${nextMm}-${nextDd}`;

    // Auto-generate ticket code
    const ticketSeq = (window.regServiceList.length + 1).toString().padStart(3, '0');
    const ticketCode = `REG-${yyyy.toString().slice(-2)}-${ticketSeq}`;

    document.getElementById('reg-input-ticket-id').value = ticketCode;
    document.getElementById('reg-input-date-entry').value = todayIso;
    document.getElementById('reg-input-date-pickup').value = nextWeekIso;
    document.getElementById('reg-input-status').value = 'Pendiente';
    
    // Client info
    document.getElementById('reg-input-name').value = '';
    document.getElementById('reg-input-phone').value = '';
    document.getElementById('reg-input-email').value = '';
    document.getElementById('reg-input-dni').value = '';
    document.getElementById('reg-crm-search-input').value = '';

    // Gear info
    document.getElementById('reg-input-brand').value = '';
    document.getElementById('reg-input-1st-stage').value = '';
    document.getElementById('reg-input-2nd-stage').value = '';
    document.getElementById('reg-input-octopus').value = '';
    document.getElementById('reg-input-staff').value = '';

    // Checkboxes Services
    const serviceCheckboxes = [
        'srv-annual', 'srv-ip-adj', 'srv-ultrasonic',
        'srv-hoses', 'srv-spool', 'srv-o2'
    ];
    serviceCheckboxes.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = (id === 'srv-annual');
    });
    
    // Clear dynamic custom tasks
    const customContainer = document.getElementById('reg-custom-tasks-list');
    if (customContainer) customContainer.innerHTML = '';

    // Symptoms
    document.getElementById('reg-input-symptoms').value = '';

    window.updateRegLivePreview();
};

// Dynamic Custom Work Tasks Handler
window.addRegCustomTask = function(val = '') {
    const container = document.getElementById('reg-custom-tasks-list');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 reg-custom-task-row';
    row.innerHTML = `
        <input type="text" value="${val ? String(val).replace(/"/g, '&quot;') : ''}" class="reg-custom-task-input w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500" placeholder="Escribe el trabajo específico a realizar..." oninput="window.updateRegLivePreview()">
        <button type="button" onclick="this.closest('.reg-custom-task-row').remove(); window.updateRegLivePreview();" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0" title="Eliminar este trabajo">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
    `;
    container.appendChild(row);
    if (!val) {
        const input = row.querySelector('input');
        if (input) input.focus();
    }
    window.updateRegLivePreview();
};

// Load Ticket for Editing
window.loadRegTicketForEdit = function(ticketId) {
    const ticket = window.regServiceList.find(t => t.id === ticketId);
    if (!ticket) return;

    window.activeRegTicketId = ticket.id;

    document.getElementById('reg-input-ticket-id').value = ticket.ticketCode || ticket.id;
    document.getElementById('reg-input-date-entry').value = ticket.dateEntry || '';
    document.getElementById('reg-input-date-pickup').value = ticket.datePickup || '';
    document.getElementById('reg-input-status').value = ticket.status || 'Pendiente';
    
    // Client info
    document.getElementById('reg-input-name').value = ticket.clientName || '';
    document.getElementById('reg-input-phone').value = ticket.clientPhone || '';
    document.getElementById('reg-input-email').value = ticket.clientEmail || '';
    document.getElementById('reg-input-dni').value = ticket.clientDni || '';

    // Gear info (Marca, 1ª Etapa, 2ª Etapa, Octopus)
    document.getElementById('reg-input-brand').value = ticket.brand || '';
    document.getElementById('reg-input-1st-stage').value = ticket.firstStage || ticket.serial1 || ticket.model || '';
    document.getElementById('reg-input-2nd-stage').value = ticket.secondStage || ticket.serial2 || '';
    document.getElementById('reg-input-octopus').value = ticket.octopus || '';
    document.getElementById('reg-input-staff').value = ticket.staff || '';

    // Services
    const srvs = ticket.services || {};
    document.getElementById('srv-annual').checked = !!srvs['annual'];
    document.getElementById('srv-ip-adj').checked = !!srvs['ip-adj'];
    document.getElementById('srv-ultrasonic').checked = !!srvs['ultrasonic'];
    document.getElementById('srv-hoses').checked = !!srvs['hoses'];
    document.getElementById('srv-spool').checked = !!srvs['spool'];
    document.getElementById('srv-o2').checked = !!srvs['o2'];

    // Dynamic custom tasks
    const customContainer = document.getElementById('reg-custom-tasks-list');
    if (customContainer) {
        customContainer.innerHTML = '';
        const customTasks = ticket.customTasks || (ticket.services?.customTasks || (srvs.other ? [srvs.other] : []));
        if (Array.isArray(customTasks)) {
            customTasks.forEach(task => {
                if (task && typeof task === 'string') window.addRegCustomTask(task);
            });
        }
    }

    // Symptoms
    document.getElementById('reg-input-symptoms').value = ticket.symptoms || '';

    window.switchRegTab('form');
    window.updateRegLivePreview();
};

// Live Search for Customers from CRM
window.searchRegCustomer = function(query) {
    const resultsContainer = document.getElementById('reg-crm-search-results');
    if (!resultsContainer) return;
    
    const trimmed = (query || '').trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.add('hidden');
        return;
    }

    if (typeof customerDatabase === 'undefined' || !Array.isArray(customerDatabase)) {
        resultsContainer.classList.add('hidden');
        return;
    }

    const matches = customerDatabase.filter(c => {
        const full = typeof window.combineFirstAndLastName === 'function' 
            ? window.combineFirstAndLastName(c.nombre, c.apellido).toLowerCase() 
            : `${c.nombre || ''} ${c.apellido || ''}`.toLowerCase();
        const dni = (c.dni || '').toLowerCase();
        const phone = (c.telefono || c.phone || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        return full.includes(trimmed) || dni.includes(trimmed) || phone.includes(trimmed) || email.includes(trimmed);
    }).slice(0, 6);

    if (matches.length === 0) {
        resultsContainer.innerHTML = `<div class="p-3 text-xs text-slate-400 italic">No se encontraron clientes coincidentes</div>`;
        resultsContainer.classList.remove('hidden');
        return;
    }

    resultsContainer.innerHTML = matches.map(c => {
        const fullName = typeof window.combineFirstAndLastName === 'function'
            ? window.combineFirstAndLastName(c.nombre, c.apellido)
            : `${c.nombre || ''} ${c.apellido || ''}`.trim();
        const phone = c.telefono || c.phone || '---';
        const dni = c.dni || '---';
        const email = c.email || '';
        return `
        <div onclick='window.selectRegCustomer(${JSON.stringify({ nombre: fullName, phone: phone === '---' ? '' : phone, dni: dni === '---' ? '' : dni, email: email }).replace(/'/g, "&#39;")})'
             class="p-2.5 hover:bg-cyan-50 cursor-pointer border-b border-slate-100 last:border-0 flex items-center justify-between transition-colors">
            <div>
                <div class="text-xs font-black text-slate-800">${fullName}</div>
                <div class="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                    <span>📞 ${phone}</span>
                    <span>🆔 ${dni}</span>
                </div>
            </div>
            <span class="text-[10px] font-bold text-cyan-600 bg-cyan-100/60 px-2 py-0.5 rounded-full">Rellenar</span>
        </div>
        `;
    }).join('');
    resultsContainer.classList.remove('hidden');
};

// Select Customer from CRM Auto-fill
window.selectRegCustomer = function(customer) {
    if (!customer) return;
    document.getElementById('reg-input-name').value = customer.nombre || '';
    document.getElementById('reg-input-phone').value = customer.phone || '';
    document.getElementById('reg-input-email').value = customer.email || '';
    document.getElementById('reg-input-dni').value = customer.dni || '';
    document.getElementById('reg-crm-search-input').value = '';
    
    const resultsContainer = document.getElementById('reg-crm-search-results');
    if (resultsContainer) resultsContainer.classList.add('hidden');
    
    window.updateRegLivePreview();
};

// Helper: Format European Date
function formatEuropeanDate(dateStr) {
    if (!dateStr) return '---';
    const norm = typeof window.normalizeDateStr === 'function' ? window.normalizeDateStr(dateStr) : dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
        const [y, m, d] = norm.split('-');
        return `${d}/${m}/${y}`;
    }
    return dateStr;
}

// Update Live A4 Sheet Preview
window.updateRegLivePreview = function() {
    const ticketCode = document.getElementById('reg-input-ticket-id').value || 'REG-26-001';
    const dateEntry = document.getElementById('reg-input-date-entry').value;
    const datePickup = document.getElementById('reg-input-date-pickup').value;
    const staff = document.getElementById('reg-input-staff').value || 'Personal Mangamar';
    const status = document.getElementById('reg-input-status').value || 'Pendiente';

    const clientName = document.getElementById('reg-input-name').value || '---';
    const clientPhone = document.getElementById('reg-input-phone').value || '---';
    const clientEmail = document.getElementById('reg-input-email').value || '---';
    const clientDni = document.getElementById('reg-input-dni').value || '---';

    const brand = document.getElementById('reg-input-brand').value || '---';
    const stage1 = document.getElementById('reg-input-1st-stage').value || '---';
    const stage2 = document.getElementById('reg-input-2nd-stage').value || '---';
    const octopus = document.getElementById('reg-input-octopus').value || '---';

    // Services checklist
    const sAnnual = document.getElementById('srv-annual')?.checked;
    const sIp = document.getElementById('srv-ip-adj')?.checked;
    const sUltra = document.getElementById('srv-ultrasonic')?.checked;
    const sHoses = document.getElementById('srv-hoses')?.checked;
    const sSpool = document.getElementById('srv-spool')?.checked;
    const sO2 = document.getElementById('srv-o2')?.checked;

    const symptoms = document.getElementById('reg-input-symptoms')?.value || 'Sin incidencias previas reportadas por el cliente.';

    // Render Preview DOM Elements
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setText('prev-ticket-code', ticketCode);
    setText('prev-ticket-code-bot', ticketCode);
    setText('prev-date-entry', formatEuropeanDate(dateEntry));
    setText('prev-date-entry-bot', formatEuropeanDate(dateEntry));
    setText('prev-date-pickup', formatEuropeanDate(datePickup));
    setText('prev-date-pickup-bot', formatEuropeanDate(datePickup));
    setText('prev-staff', staff);
    setText('prev-status', status);

    setText('prev-client-name', clientName);
    setText('prev-client-name-bot', clientName);
    setText('prev-client-phone', clientPhone);
    setText('prev-client-phone-bot', clientPhone);
    setText('prev-client-email', clientEmail);
    setText('prev-client-dni', clientDni);

    setText('prev-brand', brand);
    setText('prev-brand-bot', brand);
    setText('prev-1st-stage', stage1);
    setText('prev-2nd-stage', stage2);
    setText('prev-octopus', octopus);

    // Bottom slip gear summary
    const gearParts = [];
    if (stage1 && stage1 !== '---') gearParts.push(`1ª: ${stage1}`);
    if (stage2 && stage2 !== '---') gearParts.push(`2ª: ${stage2}`);
    if (octopus && octopus !== '---') gearParts.push(`Octo: ${octopus}`);
    setText('prev-gear-bot', gearParts.length > 0 ? gearParts.join(' • ') : 'Regulador Completo');

    // Render Services in Preview
    const srvList = [];
    if (sAnnual) srvList.push('Revisión Anual Completa (Kit + Ultrasonidos + IP)');
    if (sIp) srvList.push('Ajuste Presión Intermedia / Flujo');
    if (sUltra) srvList.push('Limpieza Ultrasonidos');
    if (sHoses) srvList.push('Sustitución de Latiguillos');
    if (sSpool) srvList.push('Junta Spool / Manómetro');
    if (sO2) srvList.push('Servicio Oxígeno / O2 Clean');

    // Dynamic custom tasks
    const customInputs = document.querySelectorAll('.reg-custom-task-input');
    customInputs.forEach(input => {
        const val = input.value.trim();
        if (val) srvList.push(val);
    });

    const srvContainer = document.getElementById('prev-services-list');
    if (srvContainer) {
        srvContainer.innerHTML = srvList.length > 0
            ? srvList.map(s => `<li class="flex items-start gap-1.5"><span class="text-cyan-700 font-bold flex-shrink-0">☑</span><span>${s}</span></li>`).join('')
            : '<li class="text-slate-400 italic">Revisión general estándar</li>';
    }

    setText('prev-symptoms', symptoms);
};

// Save Service Ticket to Firestore
window.saveRegServiceTicket = async function() {
    const clientName = document.getElementById('reg-input-name').value.trim();
    const clientPhone = document.getElementById('reg-input-phone').value.trim();

    if (!clientName || !clientPhone) {
        if (typeof showAppAlert === 'function') {
            showAppAlert("El nombre del cliente y el teléfono son campos obligatorios.");
        } else {
            alert("El nombre del cliente y el teléfono son campos obligatorios.");
        }
        return;
    }

    const brand = document.getElementById('reg-input-brand').value.trim();
    if (!brand) {
        if (typeof showAppAlert === 'function') {
            showAppAlert("La marca del regulador es un campo obligatorio.");
        } else {
            alert("La marca del regulador es un campo obligatorio.");
        }
        return;
    }

    const ticketCode = document.getElementById('reg-input-ticket-id').value.trim();
    const dateEntry = document.getElementById('reg-input-date-entry').value;
    const datePickup = document.getElementById('reg-input-date-pickup').value;
    const status = document.getElementById('reg-input-status').value;
    const staff = document.getElementById('reg-input-staff').value;

    const clientEmail = document.getElementById('reg-input-email').value.trim();
    const clientDni = document.getElementById('reg-input-dni').value.trim();

    const firstStage = document.getElementById('reg-input-1st-stage').value.trim();
    const secondStage = document.getElementById('reg-input-2nd-stage').value.trim();
    const octopus = document.getElementById('reg-input-octopus').value.trim();

    const customTasks = [];
    const customInputs = document.querySelectorAll('.reg-custom-task-input');
    customInputs.forEach(input => {
        const val = input.value.trim();
        if (val) customTasks.push(val);
    });

    const services = {
        'annual': document.getElementById('srv-annual').checked,
        'ip-adj': document.getElementById('srv-ip-adj').checked,
        'ultrasonic': document.getElementById('srv-ultrasonic').checked,
        'hoses': document.getElementById('srv-hoses').checked,
        'spool': document.getElementById('srv-spool').checked,
        'o2': document.getElementById('srv-o2').checked,
        'customTasks': customTasks
    };

    const symptoms = document.getElementById('reg-input-symptoms').value.trim();

    const ticketId = window.activeRegTicketId || `REG_${Date.now()}`;
    const timestamp = Date.now();

    const ticketData = {
        id: ticketId,
        ticketCode: ticketCode || ticketId,
        dateEntry,
        datePickup,
        status,
        staff,
        clientName,
        clientPhone,
        clientEmail,
        clientDni,
        brand,
        firstStage,
        secondStage,
        octopus,
        services,
        symptoms,
        updatedAt: timestamp
    };

    if (!window.activeRegTicketId) {
        ticketData.createdAt = timestamp;
        window.regServiceList.unshift(ticketData);
        window.activeRegTicketId = ticketId;
    } else {
        const idx = window.regServiceList.findIndex(t => t.id === ticketId);
        if (idx !== -1) {
            window.regServiceList[idx] = { ...window.regServiceList[idx], ...ticketData };
        } else {
            window.regServiceList.unshift(ticketData);
        }
    }

    try {
        if (typeof db !== 'undefined' && db) {
            await db.collection(INTERNAL_DB).doc('reg_maintenance').set({
                tickets: window.regServiceList,
                lastUpdated: timestamp
            });
        }
    } catch (err) {
        console.warn("Error persisting regulator service ticket:", err);
    }

    if (typeof showToast === 'function') {
        showToast("Ficha de regulador guardada con éxito");
    }
    window.renderRegHistoryList();
};

// Print / PDF Export
window.printRegService = function() {
    // Validate mandatory fields first
    const clientName = document.getElementById('reg-input-name').value.trim();
    const clientPhone = document.getElementById('reg-input-phone').value.trim();
    if (!clientName || !clientPhone) {
        if (typeof showAppAlert === 'function') {
            showAppAlert("Completa el nombre y teléfono del cliente antes de imprimir.");
        } else {
            alert("Completa el nombre y teléfono del cliente antes de imprimir.");
        }
        return;
    }

    window.updateRegLivePreview();

    const ticketCode = document.getElementById('reg-input-ticket-id').value.trim() || 'REG-26-001';
    const formattedCode = ticketCode.startsWith('REG-') ? `20${ticketCode.slice(4)}` : ticketCode;
    const cleanClient = clientName.replace(/[^\w\s-]/gi, '').trim();
    
    // Save original title and set specific filename title for browser PDF save
    const originalTitle = document.title;
    document.title = `Reg Maintenance ${formattedCode}${cleanClient ? ' - ' + cleanClient : ''}`;

    const printStyle = document.createElement('style');
    printStyle.id = 'reg-print-style';
    printStyle.innerHTML = `
        @media print {
            @page {
                size: A4 portrait;
                margin: 0.4cm 0.5cm;
            }
            html, body {
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                overflow: hidden !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            body > *:not(#reg-maintenance-modal) {
                display: none !important;
            }
            #reg-maintenance-modal {
                position: static !important;
                background: none !important;
                display: block !important;
                padding: 0 !important;
                width: 100% !important;
                height: 100% !important;
                overflow: hidden !important;
                z-index: 99999 !important;
            }
            #reg-maintenance-modal > div {
                box-shadow: none !important;
                border: none !important;
                height: 100% !important;
                max-width: 100% !important;
                border-radius: 0 !important;
                display: block !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            #reg-maintenance-modal-header,
            #reg-form-inputs-container,
            #reg-tab-history {
                display: none !important;
            }
            #reg-tab-form {
                display: block !important;
                overflow: hidden !important;
                padding: 0 !important;
                margin: 0 !important;
                background: transparent !important;
            }
            #reg-tab-form > div {
                padding: 0 !important;
                background: transparent !important;
            }
            #reg-service-printable-sheet {
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                width: 100% !important;
                max-width: 100% !important;
                height: 270mm !important;
                max-height: 272mm !important;
                min-height: auto !important;
                margin: 0 !important;
                padding: 0.2cm 0.3cm !important;
                box-shadow: none !important;
                border: none !important;
                box-sizing: border-box !important;
                font-size: 10px !important;
                line-height: 1.25 !important;
                page-break-inside: avoid !important;
                page-break-before: avoid !important;
                page-break-after: avoid !important;
                overflow: hidden !important;
            }
            #prev-ticket-code, #prev-ticket-code-bot {
                color: #000000 !important;
                font-weight: 900 !important;
            }
        }
    `;
    document.head.appendChild(printStyle);

    const cleanupPrint = () => {
        const s = document.getElementById('reg-print-style');
        if (s) s.remove();
        document.title = originalTitle;
        window.removeEventListener('afterprint', cleanupPrint);
    };

    window.addEventListener('afterprint', cleanupPrint);
    window.print();
    setTimeout(cleanupPrint, 2500);
};

// Render Ticket History List with colored full cards
window.renderRegHistoryList = function() {
    const listContainer = document.getElementById('reg-history-container');
    if (!listContainer) return;

    const searchQ = (document.getElementById('reg-history-search')?.value || '').trim().toLowerCase();
    const filterStatus = document.getElementById('reg-history-filter-status')?.value || 'ALL';

    const filtered = window.regServiceList.filter(t => {
        if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
        if (!searchQ) return true;
        const text = `${t.ticketCode || ''} ${t.clientName || ''} ${t.clientPhone || ''} ${t.clientDni || ''} ${t.brand || ''} ${t.model || ''}`.toLowerCase();
        return text.includes(searchQ);
    });

    // Update counter
    const countEl = document.getElementById('reg-history-count');
    if (countEl) countEl.innerText = `${filtered.length} órdenes`;

    if (filtered.length === 0) {
        listContainer.innerHTML = `
        <div class="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <svg class="w-12 h-12 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <div class="text-sm font-bold text-slate-600">No hay órdenes de mantenimiento registradas</div>
            <div class="text-xs text-slate-400 mt-1">Crea una nueva ficha desde la pestaña "Nueva Ficha".</div>
        </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map(t => {
        let theme = {
            card: 'bg-amber-50/90 border-amber-300',
            icon: 'bg-amber-100 text-amber-800 border-amber-300',
            ticketTag: 'bg-amber-100/90 text-amber-900 border-amber-300',
            badge: 'bg-amber-500 text-white border-amber-600 shadow-sm',
            select: 'bg-white/90 border-amber-300 text-amber-900 focus:ring-amber-500',
            btnEdit: 'bg-amber-100/80 text-amber-900 border-amber-300 hover:bg-amber-200',
            btnPrint: 'bg-white/90 text-amber-900 border-amber-300 hover:bg-amber-100'
        };

        if (t.status === 'En Taller') {
            theme = {
                card: 'bg-blue-50/90 border-blue-300',
                icon: 'bg-blue-100 text-blue-800 border-blue-300',
                ticketTag: 'bg-blue-100/90 text-blue-900 border-blue-300',
                badge: 'bg-blue-600 text-white border-blue-700 shadow-sm',
                select: 'bg-white/90 border-blue-300 text-blue-900 focus:ring-blue-500',
                btnEdit: 'bg-blue-100/80 text-blue-900 border-blue-300 hover:bg-blue-200',
                btnPrint: 'bg-white/90 text-blue-900 border-blue-300 hover:bg-blue-100'
            };
        } else if (t.status === 'Listo para Recoger') {
            theme = {
                card: 'bg-emerald-50/90 border-emerald-300',
                icon: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                ticketTag: 'bg-emerald-100/90 text-emerald-900 border-emerald-300',
                badge: 'bg-emerald-600 text-white border-emerald-700 shadow-sm',
                select: 'bg-white/90 border-emerald-300 text-emerald-900 focus:ring-emerald-500',
                btnEdit: 'bg-emerald-100/80 text-emerald-900 border-emerald-300 hover:bg-emerald-200',
                btnPrint: 'bg-white/90 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
            };
        } else if (t.status === 'Entregado') {
            theme = {
                card: 'bg-slate-100/90 border-slate-300 opacity-80 hover:opacity-100',
                icon: 'bg-slate-200 text-slate-700 border-slate-300',
                ticketTag: 'bg-slate-200 text-slate-800 border-slate-300',
                badge: 'bg-slate-600 text-white border-slate-700 shadow-sm',
                select: 'bg-white/90 border-slate-300 text-slate-800 focus:ring-slate-500',
                btnEdit: 'bg-slate-200/80 text-slate-800 border-slate-300 hover:bg-slate-300',
                btnPrint: 'bg-white/90 text-slate-700 border-slate-300 hover:bg-slate-200'
            };
        }

        return `
        <div class="p-4 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${theme.card}">
            <div class="flex items-start gap-3.5">
                <div class="w-11 h-11 rounded-xl border flex items-center justify-center font-black text-xs shrink-0 shadow-inner ${theme.icon}">
                    🤿
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-xs font-black px-2 py-0.5 rounded border ${theme.ticketTag}">${t.ticketCode || t.id}</span>
                        <span class="text-sm font-black text-slate-800">${t.clientName}</span>
                        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${theme.badge}">${t.status || 'Pendiente'}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-bold mt-1.5">
                        <span>📞 ${t.clientPhone}</span>
                        <span>🎛️ ${t.brand || ''}${t.firstStage || t.model ? ' ' + (t.firstStage || t.model) : ''}${t.secondStage ? ' • 2ª: ' + t.secondStage : ''}${t.octopus ? ' • Octo: ' + t.octopus : ''}</span>
                        <span>📅 Entrada: ${formatEuropeanDate(t.dateEntry)}</span>
                        ${t.datePickup ? `<span>🏁 Previsto: ${formatEuropeanDate(t.datePickup)}</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="flex items-center gap-2 shrink-0 self-end md:self-center">
                <select onchange="window.updateRegStatus('${t.id}', this.value)" class="text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer focus:ring-1 border ${theme.select}">
                    <option value="Pendiente" ${t.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="En Taller" ${t.status === 'En Taller' ? 'selected' : ''}>En Taller</option>
                    <option value="Listo para Recoger" ${t.status === 'Listo para Recoger' ? 'selected' : ''}>Listo para Recoger</option>
                    <option value="Entregado" ${t.status === 'Entregado' ? 'selected' : ''}>Entregado</option>
                </select>
                <button onclick="window.openRegMaintenanceModal('${t.id}')" class="px-3 py-1.5 rounded-lg text-xs font-black transition-colors flex items-center gap-1 shadow-sm border ${theme.btnEdit}">
                    ✏️ Ver / Editar
                </button>
                <button onclick="window.loadRegTicketForEdit('${t.id}'); window.printRegService();" class="px-3 py-1.5 rounded-lg text-xs font-black transition-colors flex items-center gap-1 shadow-sm border ${theme.btnPrint}" title="Imprimir PDF">
                    🖨️ PDF
                </button>
                <button onclick="window.deleteRegTicket('${t.id}')" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar orden">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>
        `;
    }).join('');
};

// Update Ticket Status Quick Action
window.updateRegStatus = async function(ticketId, newStatus) {
    const ticket = window.regServiceList.find(t => t.id === ticketId);
    if (!ticket) return;
    ticket.status = newStatus;
    ticket.updatedAt = Date.now();

    try {
        if (typeof db !== 'undefined' && db) {
            await db.collection(INTERNAL_DB).doc('reg_maintenance').set({
                tickets: window.regServiceList,
                lastUpdated: Date.now()
            });
        }
    } catch (e) {
        console.warn("Error updating status:", e);
    }
    window.renderRegHistoryList();
    if (typeof showToast === 'function') {
        showToast(`Estado actualizado: ${newStatus}`);
    }
};

// Delete Ticket
window.deleteRegTicket = function(ticketId) {
    const ticket = window.regServiceList.find(t => t.id === ticketId);
    if (!ticket) return;

    if (typeof showAppConfirm === 'function') {
        showAppConfirm(`¿Eliminar la orden de revisión ${ticket.ticketCode || ticket.id} de ${ticket.clientName}?`, async () => {
            window.regServiceList = window.regServiceList.filter(t => t.id !== ticketId);
            try {
                if (typeof db !== 'undefined' && db) {
                    await db.collection(INTERNAL_DB).doc('reg_maintenance').set({
                        tickets: window.regServiceList,
                        lastUpdated: Date.now()
                    });
                }
            } catch (e) {
                console.warn("Error deleting ticket:", e);
            }
            window.renderRegHistoryList();
            if (typeof showToast === 'function') showToast("Orden eliminada");
        });
    } else {
        if (confirm(`¿Eliminar la orden de revisión de ${ticket.clientName}?`)) {
            window.regServiceList = window.regServiceList.filter(t => t.id !== ticketId);
            window.renderRegHistoryList();
        }
    }
};

// Initialize DB listener on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initRegMaintenanceDB);
} else {
    window.initRegMaintenanceDB();
}
