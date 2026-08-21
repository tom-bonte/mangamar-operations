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
    document.getElementById('reg-input-brand').value = 'Aqualung';
    document.getElementById('reg-input-model').value = '';
    document.getElementById('reg-input-conn').value = 'DIN';
    document.getElementById('reg-input-serial1').value = '';
    document.getElementById('reg-input-serial2').value = '';
    document.getElementById('reg-input-staff').value = '';

    // Checkboxes Components
    const compCheckboxes = [
        'comp-1st', 'comp-2nd-main', 'comp-2nd-octo',
        'comp-spg', 'comp-bcd', 'comp-dry', 'comp-tx', 'comp-bag'
    ];
    compCheckboxes.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = (id === 'comp-1st' || id === 'comp-2nd-main' || id === 'comp-2nd-octo' || id === 'comp-spg' || id === 'comp-bcd');
    });
    document.getElementById('comp-other').value = '';

    // Checkboxes Services
    const serviceCheckboxes = [
        'srv-annual', 'srv-ip-adj', 'srv-ultrasonic',
        'srv-hoses', 'srv-mouthpiece', 'srv-spool', 'srv-o2'
    ];
    serviceCheckboxes.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = (id === 'srv-annual');
    });
    document.getElementById('srv-other').value = '';

    // Notes
    document.getElementById('reg-input-symptoms').value = '';
    document.getElementById('reg-input-budget').value = '';
    document.getElementById('reg-input-initial-notes').value = '';
    document.getElementById('reg-input-tech-notes').value = '';
    document.getElementById('reg-input-final-ip').value = '9.5';

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

    // Gear info
    document.getElementById('reg-input-brand').value = ticket.brand || 'Aqualung';
    document.getElementById('reg-input-model').value = ticket.model || '';
    document.getElementById('reg-input-conn').value = ticket.connection || 'DIN';
    document.getElementById('reg-input-serial1').value = ticket.serial1 || '';
    document.getElementById('reg-input-serial2').value = ticket.serial2 || '';
    document.getElementById('reg-input-staff').value = ticket.staff || '';

    // Components
    const comps = ticket.components || {};
    document.getElementById('comp-1st').checked = !!comps['1st'];
    document.getElementById('comp-2nd-main').checked = !!comps['2nd-main'];
    document.getElementById('comp-2nd-octo').checked = !!comps['2nd-octo'];
    document.getElementById('comp-spg').checked = !!comps['spg'];
    document.getElementById('comp-bcd').checked = !!comps['bcd'];
    document.getElementById('comp-dry').checked = !!comps['dry'];
    document.getElementById('comp-tx').checked = !!comps['tx'];
    document.getElementById('comp-bag').checked = !!comps['bag'];
    document.getElementById('comp-other').value = comps['other'] || '';

    // Services
    const srvs = ticket.services || {};
    document.getElementById('srv-annual').checked = !!srvs['annual'];
    document.getElementById('srv-ip-adj').checked = !!srvs['ip-adj'];
    document.getElementById('srv-ultrasonic').checked = !!srvs['ultrasonic'];
    document.getElementById('srv-hoses').checked = !!srvs['hoses'];
    document.getElementById('srv-mouthpiece').checked = !!srvs['mouthpiece'];
    document.getElementById('srv-spool').checked = !!srvs['spool'];
    document.getElementById('srv-o2').checked = !!srvs['o2'];
    document.getElementById('srv-other').value = srvs['other'] || '';

    // Notes
    document.getElementById('reg-input-symptoms').value = ticket.symptoms || '';
    document.getElementById('reg-input-budget').value = ticket.budget || '';
    document.getElementById('reg-input-initial-notes').value = ticket.initialNotes || '';
    document.getElementById('reg-input-tech-notes').value = ticket.techNotes || '';
    document.getElementById('reg-input-final-ip').value = ticket.finalIp || '9.5';

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

    const brand = document.getElementById('reg-input-brand').value || 'Aqualung';
    const model = document.getElementById('reg-input-model').value || '---';
    const conn = document.getElementById('reg-input-conn').value || 'DIN';
    const serial1 = document.getElementById('reg-input-serial1').value || '---';
    const serial2 = document.getElementById('reg-input-serial2').value || '---';

    // Components checklist
    const c1st = document.getElementById('comp-1st').checked;
    const c2ndMain = document.getElementById('comp-2nd-main').checked;
    const c2ndOcto = document.getElementById('comp-2nd-octo').checked;
    const cSpg = document.getElementById('comp-spg').checked;
    const cBcd = document.getElementById('comp-bcd').checked;
    const cDry = document.getElementById('comp-dry').checked;
    const cTx = document.getElementById('comp-tx').checked;
    const cBag = document.getElementById('comp-bag').checked;
    const cOther = document.getElementById('comp-other').value.trim();

    // Services checklist
    const sAnnual = document.getElementById('srv-annual').checked;
    const sIp = document.getElementById('srv-ip-adj').checked;
    const sUltra = document.getElementById('srv-ultrasonic').checked;
    const sHoses = document.getElementById('srv-hoses').checked;
    const sMouth = document.getElementById('srv-mouthpiece').checked;
    const sSpool = document.getElementById('srv-spool').checked;
    const sO2 = document.getElementById('srv-o2').checked;
    const sOther = document.getElementById('srv-other').value.trim();

    const symptoms = document.getElementById('reg-input-symptoms').value || 'Sin incidencias previas reportadas por el cliente.';
    const budget = document.getElementById('reg-input-budget').value;
    const initialNotes = document.getElementById('reg-input-initial-notes').value || 'Revisión visual estándar.';
    const techNotes = document.getElementById('reg-input-tech-notes').value || '';
    const finalIp = document.getElementById('reg-input-final-ip').value || '9.5';

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
    setText('prev-model', model);
    setText('prev-model-bot', model);
    setText('prev-conn', conn);
    setText('prev-serial1', serial1);
    setText('prev-serial2', serial2);

    // Render Components Badges in Preview
    const compList = [];
    if (c1st) compList.push('1ª Etapa');
    if (c2ndMain) compList.push('2ª Etapa Principal');
    if (c2ndOcto) compList.push('Octopus / Auxiliar');
    if (cSpg) compList.push('Manómetro / SPG');
    if (cBcd) compList.push('Latiguillo Jacket');
    if (cDry) compList.push('Latiguillo Seco');
    if (cTx) compList.push('Transmisor');
    if (cBag) compList.push('Bolsa Regulador');
    if (cOther) compList.push(cOther);

    const compContainer = document.getElementById('prev-components-list');
    if (compContainer) {
        compContainer.innerHTML = compList.length > 0
            ? compList.map(c => `<span class="inline-block bg-slate-100 text-slate-800 border border-slate-200 text-[10px] font-bold px-2 py-0.5 rounded">✓ ${c}</span>`).join(' ')
            : '<span class="text-slate-400 italic text-[10px]">No especificado</span>';
    }

    const compContainerBot = document.getElementById('prev-components-list-bot');
    if (compContainerBot) {
        compContainerBot.innerHTML = compList.length > 0 ? compList.join(' • ') : 'Regulador Completo';
    }

    // Render Services in Preview
    const srvList = [];
    if (sAnnual) srvList.push('Revisión Anual Completa (Kit + Ultrasonidos + IP)');
    if (sIp) srvList.push('Calibración Presión Intermedia / Flujo Libre');
    if (sUltra) srvList.push('Limpieza Ultrasonidos');
    if (sHoses) srvList.push('Sustitución de Latiguillos');
    if (sMouth) srvList.push('Cambio de Boquilla');
    if (sSpool) srvList.push('Sustitución Spool Manómetro');
    if (sO2) srvList.push('Servicio Oxígeno / Nitrox');
    if (sOther) srvList.push(sOther);

    const srvContainer = document.getElementById('prev-services-list');
    if (srvContainer) {
        srvContainer.innerHTML = srvList.length > 0
            ? srvList.map(s => `<li class="flex items-start gap-1.5"><span class="text-cyan-700 font-bold">☑</span><span>${s}</span></li>`).join('')
            : '<li class="text-slate-400 italic">Revisión general estándar</li>';
    }

    setText('prev-symptoms', symptoms);
    setText('prev-budget', budget ? `${budget} € (Avisar si supera)` : 'Tarifa estándar Mangamar');
    setText('prev-initial-notes', initialNotes);
    setText('prev-tech-notes', techNotes || 'Pendiente de inspección técnica en banco de pruebas.');
    setText('prev-final-ip', `${finalIp} bar`);
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

    const ticketCode = document.getElementById('reg-input-ticket-id').value.trim();
    const dateEntry = document.getElementById('reg-input-date-entry').value;
    const datePickup = document.getElementById('reg-input-date-pickup').value;
    const status = document.getElementById('reg-input-status').value;
    const staff = document.getElementById('reg-input-staff').value;

    const clientEmail = document.getElementById('reg-input-email').value.trim();
    const clientDni = document.getElementById('reg-input-dni').value.trim();

    const brand = document.getElementById('reg-input-brand').value;
    const model = document.getElementById('reg-input-model').value.trim();
    const connection = document.getElementById('reg-input-conn').value;
    const serial1 = document.getElementById('reg-input-serial1').value.trim();
    const serial2 = document.getElementById('reg-input-serial2').value.trim();

    const components = {
        '1st': document.getElementById('comp-1st').checked,
        '2nd-main': document.getElementById('comp-2nd-main').checked,
        '2nd-octo': document.getElementById('comp-2nd-octo').checked,
        'spg': document.getElementById('comp-spg').checked,
        'bcd': document.getElementById('comp-bcd').checked,
        'dry': document.getElementById('comp-dry').checked,
        'tx': document.getElementById('comp-tx').checked,
        'bag': document.getElementById('comp-bag').checked,
        'other': document.getElementById('comp-other').value.trim()
    };

    const services = {
        'annual': document.getElementById('srv-annual').checked,
        'ip-adj': document.getElementById('srv-ip-adj').checked,
        'ultrasonic': document.getElementById('srv-ultrasonic').checked,
        'hoses': document.getElementById('srv-hoses').checked,
        'mouthpiece': document.getElementById('srv-mouthpiece').checked,
        'spool': document.getElementById('srv-spool').checked,
        'o2': document.getElementById('srv-o2').checked,
        'other': document.getElementById('srv-other').value.trim()
    };

    const symptoms = document.getElementById('reg-input-symptoms').value.trim();
    const budget = document.getElementById('reg-input-budget').value.trim();
    const initialNotes = document.getElementById('reg-input-initial-notes').value.trim();
    const techNotes = document.getElementById('reg-input-tech-notes').value.trim();
    const finalIp = document.getElementById('reg-input-final-ip').value.trim();

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
        model,
        connection,
        serial1,
        serial2,
        components,
        services,
        symptoms,
        budget,
        initialNotes,
        techNotes,
        finalIp,
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

    const printStyle = document.createElement('style');
    printStyle.id = 'reg-print-style';
    printStyle.innerHTML = `
        @media print {
            @page {
                size: A4 portrait;
                margin: 0;
            }
            body > *:not(#reg-maintenance-modal) {
                display: none !important;
            }
            body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
            }
            #reg-maintenance-modal {
                position: static !important;
                background: none !important;
                display: block !important;
                padding: 0 !important;
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
                z-index: 99999 !important;
            }
            #reg-maintenance-modal > div {
                box-shadow: none !important;
                border: none !important;
                height: auto !important;
                max-width: 100% !important;
                border-radius: 0 !important;
                display: block !important;
            }
            #reg-maintenance-modal-header,
            #reg-form-inputs-container,
            #reg-tab-history {
                display: none !important;
            }
            #reg-tab-form {
                display: block !important;
                overflow: visible !important;
                padding: 0 !important;
            }
            #reg-service-printable-sheet {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 !important;
                padding: 1.2cm 1.4cm !important;
                box-shadow: none !important;
                border: none !important;
                box-sizing: border-box !important;
                page-break-inside: avoid !important;
            }
        }
    `;
    document.head.appendChild(printStyle);
    window.print();
    setTimeout(() => {
        const s = document.getElementById('reg-print-style');
        if (s) s.remove();
    }, 1000);
};

// Render Ticket History List
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
        let statusBadge = 'bg-amber-100 text-amber-800 border-amber-300';
        if (t.status === 'En Taller') statusBadge = 'bg-blue-100 text-blue-800 border-blue-300';
        if (t.status === 'Listo para Recoger') statusBadge = 'bg-emerald-100 text-emerald-800 border-emerald-300';
        if (t.status === 'Entregado') statusBadge = 'bg-slate-100 text-slate-600 border-slate-300';

        return `
        <div class="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-start gap-3.5">
                <div class="w-11 h-11 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-600 flex items-center justify-center font-black text-xs shrink-0 shadow-inner">
                    🤿
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-xs font-black text-cyan-700 bg-cyan-100/50 px-2 py-0.5 rounded border border-cyan-200">${t.ticketCode || t.id}</span>
                        <span class="text-sm font-black text-slate-800">${t.clientName}</span>
                        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${statusBadge}">${t.status || 'Pendiente'}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-bold mt-1.5">
                        <span>📞 ${t.clientPhone}</span>
                        <span>🎛️ ${t.brand || ''} ${t.model || ''} (${t.connection || 'DIN'})</span>
                        <span>📅 Entrada: ${formatEuropeanDate(t.dateEntry)}</span>
                        ${t.datePickup ? `<span>🏁 Previsto: ${formatEuropeanDate(t.datePickup)}</span>` : ''}
                    </div>
                </div>
            </div>
            
            <div class="flex items-center gap-2 shrink-0 self-end md:self-center">
                <select onchange="window.updateRegStatus('${t.id}', this.value)" class="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 outline-none cursor-pointer focus:ring-1 focus:ring-cyan-500">
                    <option value="Pendiente" ${t.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="En Taller" ${t.status === 'En Taller' ? 'selected' : ''}>En Taller</option>
                    <option value="Listo para Recoger" ${t.status === 'Listo para Recoger' ? 'selected' : ''}>Listo para Recoger</option>
                    <option value="Entregado" ${t.status === 'Entregado' ? 'selected' : ''}>Entregado</option>
                </select>
                <button onclick="window.openRegMaintenanceModal('${t.id}')" class="px-3 py-1.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-lg text-xs font-black hover:bg-cyan-100 transition-colors flex items-center gap-1 shadow-sm">
                    ✏️ Ver / Editar
                </button>
                <button onclick="window.loadRegTicketForEdit('${t.id}'); window.printRegService();" class="px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-black hover:bg-slate-200 transition-colors flex items-center gap-1 shadow-sm" title="Imprimir PDF">
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
