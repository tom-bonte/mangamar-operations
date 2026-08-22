/**
 * @file tank-inventory.js
 * @description Mangamar Dive Center - Tank & Cylinder Inventory Management Engine
 */

window.tankInventoryList = [];
window.activeTankEditId = null;
window.tankInventoryFilter = {
    search: '',
    type: 'ALL',
    status: 'ALL',
    inventoryOnly: 'ALL'
};

// Initial Seed Data extracted from Mangamar Google Sheet
window.INITIAL_TANK_DATA = [
    { id: 'TNK_001', sello: '22', status: 'Operativa', type: '12L ACERO (alto)', serial: 'CCX027', valve: '', hydroDate: '2022-07', lastPainted: '', inInventory: true },
    { id: 'TNK_002', sello: '23', status: 'Operativa', type: '12L ACERO (alto)', serial: 'BNZ007', valve: '', hydroDate: '2022-07', lastPainted: '', inInventory: true },
    { id: 'TNK_003', sello: '1', status: 'Operativa', type: '12L ACERO AIRE', serial: '12495461', valve: '', hydroDate: '2024-02', lastPainted: '', inInventory: true },
    { id: 'TNK_004', sello: '2', status: 'Testing', type: '12L ACERO AIRE', serial: '12850894', valve: '61.06-11', hydroDate: '2026-04', lastPainted: '', inInventory: true },
    { id: 'TNK_005', sello: '4', status: 'Operativa', type: '12L ACERO AIRE', serial: '12184450', valve: '', hydroDate: '2024-02', lastPainted: '', inInventory: true },
    { id: 'TNK_006', sello: '5', status: 'Operativa', type: '12L ACERO AIRE', serial: '12115741', valve: '', hydroDate: '2024-02', lastPainted: '', inInventory: true },
    { id: 'TNK_007', sello: '6', status: 'Operativa', type: '12L ACERO AIRE', serial: '13923066', valve: '', hydroDate: '', lastPainted: '', inInventory: false },
    { id: 'TNK_008', sello: '7', status: 'Testing', type: '12L ACERO AIRE', serial: '12881647', valve: 'F00413', hydroDate: '2026-04', lastPainted: '', inInventory: true },
    { id: 'TNK_009', sello: '8', status: 'Operativa', type: '12L ACERO AIRE', serial: '13923071', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_010', sello: '9', status: 'Testing', type: '12L ACERO AIRE', serial: '12495475', valve: 'H04535', hydroDate: '2026-04', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_011', sello: '10', status: 'Testing', type: '12L ACERO AIRE', serial: '13922976', valve: 'H04516', hydroDate: '2026-04', lastPainted: '', inInventory: true },
    { id: 'TNK_012', sello: '11', status: 'Operativa', type: '12L ACERO AIRE', serial: '12881643', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_013', sello: '12', status: 'Operativa', type: '12L ACERO AIRE', serial: '13923015', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_014', sello: '13', status: 'Operativa', type: '12L ACERO AIRE', serial: '13923037', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_015', sello: '14', status: 'Operativa', type: '12L ACERO AIRE', serial: '13923067', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_016', sello: '15', status: 'Operativa', type: '12L ACERO AIRE', serial: '13922972', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_017', sello: '16', status: 'Operativa', type: '12L ACERO AIRE', serial: '13923031', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_018', sello: '17', status: 'Operativa', type: '12L ACERO AIRE', serial: '13923063', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_019', sello: '18', status: 'Operativa', type: '12L ACERO AIRE', serial: '19/0095/035', valve: '', hydroDate: '2022-06', lastPainted: '', inInventory: true },
    { id: 'TNK_020', sello: '19', status: 'Testing', type: '12L ACERO AIRE', serial: '13923060', valve: 'H04533', hydroDate: '2026-04', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_021', sello: '20', status: 'Operativa', type: '12L ACERO AIRE', serial: '19/0095/040', valve: '', hydroDate: '2022-06', lastPainted: '', inInventory: true },
    { id: 'TNK_022', sello: '21', status: 'Testing', type: '12L ACERO AIRE', serial: '13923066', valve: 'H04521', hydroDate: '', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_023', sello: '22', status: 'Operativa', type: '12L ACERO AIRE', serial: '13410677', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_024', sello: '53', status: 'Testing', type: '12L ACERO AIRE', serial: '12495462', valve: 'F00482', hydroDate: '2026-04', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_025', sello: '1', status: 'Operativa', type: '12L ACERO EANx', serial: '12495461', valve: '', hydroDate: '', lastPainted: '', inInventory: false },
    { id: 'TNK_026', sello: '2', status: 'Rechazada', type: '12L ACERO EANx', serial: '12184435', valve: 'D02284', hydroDate: '2022-06', lastPainted: '', inInventory: true },
    { id: 'TNK_027', sello: '3', status: 'Operativa', type: '12L ACERO EANx', serial: '12115713', valve: '', hydroDate: '', lastPainted: '', inInventory: true },
    { id: 'TNK_028', sello: '4', status: 'Operativa', type: '12L ACERO EANx', serial: '13923069', valve: '', hydroDate: '2022-06', lastPainted: '', inInventory: true },
    { id: 'TNK_029', sello: '5', status: 'Operativa', type: '12L ACERO EANx', serial: '13922975', valve: '', hydroDate: '2022-06', lastPainted: '', inInventory: true },
    { id: 'TNK_030', sello: '6', status: 'Testing', type: '12L ACERO EANx', serial: '13922977', valve: 'H04637', hydroDate: '2026-04', lastPainted: 'Painting', inInventory: true },
    { id: 'TNK_031', sello: '7', status: 'Operativa', type: '12L ACERO EANx', serial: '19/0095/038', valve: '', hydroDate: '2022-06', lastPainted: '', inInventory: true },
    { id: 'TNK_032', sello: '8', status: 'Operativa', type: '12L ACERO EANx', serial: '13922973', valve: '', hydroDate: '2022-06', lastPainted: '', inInventory: true },
    { id: 'TNK_033', sello: '9', status: 'Operativa', type: '12L ACERO EANx', serial: '13923001', valve: '', hydroDate: '2022-06', lastPainted: '', inInventory: true },
    { id: 'TNK_034', sello: '1', status: 'Operativa', type: '12L ALU', serial: '30180', valve: '', hydroDate: '2022-09', lastPainted: '', inInventory: true },
    { id: 'TNK_035', sello: '2', status: 'Operativa', type: '12L ALU', serial: '30181', valve: '', hydroDate: '2022-09', lastPainted: '', inInventory: true },
    { id: 'TNK_036', sello: '3', status: 'Operativa', type: '12L ALU', serial: '30182', valve: '', hydroDate: '2022-09', lastPainted: '', inInventory: false }
];

// Initialize Firestore Listener
window.initTankInventoryDB = function() {
    if (typeof db === 'undefined' || !db) return;
    try {
        db.collection(INTERNAL_DB).doc('tank_inventory').onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                window.tankInventoryList = data.tanks || [];
            } else {
                // Initialize with seed data if doc doesn't exist yet
                window.tankInventoryList = [...window.INITIAL_TANK_DATA];
                db.collection(INTERNAL_DB).doc('tank_inventory').set({
                    tanks: window.tankInventoryList,
                    lastUpdated: Date.now()
                });
            }
            window.renderTankInventoryUI();
        }, err => {
            console.warn("Tank inventory db sync warning:", err);
            if (window.tankInventoryList.length === 0) {
                window.tankInventoryList = [...window.INITIAL_TANK_DATA];
                window.renderTankInventoryUI();
            }
        });
    } catch(e) {
        console.warn("Error initializing tank inventory db:", e);
        if (window.tankInventoryList.length === 0) {
            window.tankInventoryList = [...window.INITIAL_TANK_DATA];
            window.renderTankInventoryUI();
        }
    }
};

// Open the Tank Inventory Modal
window.openTankInventoryModal = function() {
    const modal = document.getElementById('tank-inventory-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    window.renderTankInventoryUI();
};

// Close Modal
window.closeTankInventoryModal = function() {
    const modal = document.getElementById('tank-inventory-modal');
    if (modal) modal.classList.add('hidden');
};

// Save Tank Inventory to Firestore
window.saveTankInventoryDB = async function() {
    try {
        if (typeof db !== 'undefined' && db) {
            await db.collection(INTERNAL_DB).doc('tank_inventory').set({
                tanks: window.tankInventoryList,
                lastUpdated: Date.now()
            });
        }
    } catch(e) {
        console.error("Error saving tank inventory:", e);
    }
};

// Render Main Tank Inventory UI
window.renderTankInventoryUI = function() {
    const tbody = document.getElementById('tank-inventory-tbody');
    if (!tbody) return;

    const list = window.tankInventoryList || [];

    // Calculate Summary Stats
    const totalTanks = list.length;
    const countInInventory = list.filter(t => t.inInventory).length;
    const countOperative = list.filter(t => (t.status || 'Operativa') === 'Operativa').length;
    const countTesting = list.filter(t => t.status === 'Testing').length;
    const countPainting = list.filter(t => t.status === 'Painting' || t.lastPainted === 'Painting').length;
    const countRejected = list.filter(t => t.status === 'Rechazada').length;

    // Update KPI counters in DOM
    const setStat = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };
    setStat('stat-tank-total', totalTanks);
    setStat('stat-tank-inventory', countInInventory);
    setStat('stat-tank-operative', countOperative);
    setStat('stat-tank-testing', countTesting);
    setStat('stat-tank-painting', countPainting);
    setStat('stat-tank-rejected', countRejected);

    // Apply Filters & Search
    const searchVal = (document.getElementById('tank-filter-search')?.value || '').trim().toLowerCase();
    const typeVal = document.getElementById('tank-filter-type')?.value || 'ALL';
    const statusVal = document.getElementById('tank-filter-status')?.value || 'ALL';
    const invVal = document.getElementById('tank-filter-inventory')?.value || 'ALL';

    const filtered = list.filter(t => {
        if (searchVal) {
            const matchSello = String(t.sello || '').toLowerCase().includes(searchVal);
            const matchSerial = String(t.serial || '').toLowerCase().includes(searchVal);
            const matchValve = String(t.valve || '').toLowerCase().includes(searchVal);
            const matchType = String(t.type || '').toLowerCase().includes(searchVal);
            if (!matchSello && !matchSerial && !matchValve && !matchType) return false;
        }

        if (typeVal !== 'ALL') {
            const tType = String(t.type || '').toLowerCase();
            if (typeVal === '12L_AIRE' && (!tType.includes('12l') || !tType.includes('aire') || tType.includes('eanx'))) return false;
            if (typeVal === '12L_EANX' && !tType.includes('eanx')) return false;
            if (typeVal === '12L_ALTO' && !tType.includes('alto')) return false;
            if (typeVal === 'ALU' && !tType.includes('alu')) return false;
            if (typeVal === '15L' && !tType.includes('15l')) return false;
            if (typeVal === '18L' && !tType.includes('18l')) return false;
        }

        if (statusVal !== 'ALL') {
            const st = t.status || 'Operativa';
            if (statusVal === 'Painting') {
                if (st !== 'Painting' && t.lastPainted !== 'Painting') return false;
            } else if (st !== statusVal) {
                return false;
            }
        }

        if (invVal === 'IN_INV' && !t.inInventory) return false;
        if (invVal === 'NOT_INV' && t.inInventory) return false;

        return true;
    });

    // Populate Table
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-12 text-slate-400 font-bold italic">
                    No se encontraron botellas con los filtros seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map((t) => {
        const isEanx = String(t.type || '').toUpperCase().includes('EANX');
        const isAlu = String(t.type || '').toUpperCase().includes('ALU');
        const isAlto = String(t.type || '').toUpperCase().includes('ALTO');

        // Type badge styling
        let typeBadge = 'bg-slate-100 text-slate-700 border-slate-200';
        if (isEanx) {
            typeBadge = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-black';
        } else if (isAlu) {
            typeBadge = 'bg-sky-100 text-sky-800 border-sky-300 font-black';
        } else if (isAlto) {
            typeBadge = 'bg-indigo-100 text-indigo-800 border-indigo-300 font-black';
        }

        // Status badge & select styling
        let statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        const st = t.status || 'Operativa';
        if (st === 'Testing') {
            statusClass = 'bg-amber-100 text-amber-900 border-amber-300 font-black';
        } else if (st === 'Painting') {
            statusClass = 'bg-sky-100 text-sky-900 border-sky-300 font-black';
        } else if (st === 'Rechazada') {
            statusClass = 'bg-rose-100 text-rose-900 border-rose-300 font-black';
        }

        // Hydro date format & check expiration
        let hydroDisplay = t.hydroDate || '<span class="text-slate-300 italic">Sin fecha</span>';
        let hydroClass = 'text-slate-700 font-mono';
        if (t.hydroDate) {
            const parts = t.hydroDate.split('-');
            if (parts.length === 2) {
                const yr = parseInt(parts[0], 10);
                const mo = parseInt(parts[1], 10);
                const expDate = new Date(yr, mo, 1);
                const now = new Date();
                if (expDate < now) {
                    hydroClass = 'text-rose-600 font-black bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200';
                    hydroDisplay = `⚠️ ${t.hydroDate} (Caducada)`;
                } else {
                    hydroClass = 'text-emerald-700 font-black bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200';
                }
            }
        }

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                <!-- Sello -->
                <td class="py-2.5 px-3 text-center">
                    <span class="inline-block px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-mono font-black text-xs shadow-xs">
                        ${t.sello || '—'}
                    </span>
                </td>

                <!-- Status Quick Dropdown -->
                <td class="py-2.5 px-3">
                    <select onchange="window.updateTankStatus('${t.id}', this.value)" class="text-xs font-black px-2.5 py-1 rounded-xl border cursor-pointer outline-none transition-all shadow-xs ${statusClass}">
                        <option value="Operativa" ${st === 'Operativa' ? 'selected' : ''}>🟢 Operativa</option>
                        <option value="Testing" ${st === 'Testing' ? 'selected' : ''}>🟡 Testing / Inspección</option>
                        <option value="Painting" ${st === 'Painting' ? 'selected' : ''}>🔵 En Pintura</option>
                        <option value="Rechazada" ${st === 'Rechazada' ? 'selected' : ''}>🔴 Rechazada / Baja</option>
                    </select>
                </td>

                <!-- Tipo -->
                <td class="py-2.5 px-3">
                    <span class="inline-block px-2 py-0.5 rounded-md border text-xs ${typeBadge}">
                        ${t.type || '12L ACERO AIRE'}
                    </span>
                </td>

                <!-- No. Serie -->
                <td class="py-2.5 px-3">
                    <span class="font-mono font-black text-xs text-slate-800 tracking-tight">
                        ${t.serial || '—'}
                    </span>
                </td>

                <!-- Grifería -->
                <td class="py-2.5 px-3">
                    <span class="font-mono font-bold text-xs text-slate-600">
                        ${t.valve || '—'}
                    </span>
                </td>

                <!-- Fecha Hidrostática -->
                <td class="py-2.5 px-3">
                    <span class="${hydroClass}">
                        ${hydroDisplay}
                    </span>
                </td>

                <!-- Last Painted / Mantenimiento -->
                <td class="py-2.5 px-3 text-xs text-slate-600 font-bold">
                    ${t.lastPainted ? `<span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-black">🎨 ${t.lastPainted}</span>` : '—'}
                </td>

                <!-- En Inventario (Checkbox) -->
                <td class="py-2.5 px-3 text-center">
                    <input type="checkbox" onchange="window.toggleTankInventory('${t.id}', this.checked)" ${t.inInventory ? 'checked' : ''} class="w-4 h-4 text-cyan-600 rounded border-slate-300 focus:ring-cyan-500 cursor-pointer">
                </td>

                <!-- Actions -->
                <td class="py-2.5 px-3 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="window.openEditTankModal('${t.id}')" class="p-1.5 text-slate-500 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors" title="Editar datos de botella">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button onclick="window.deleteTank('${t.id}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Eliminar botella">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

// Quick Status Update
window.updateTankStatus = function(tankId, newStatus) {
    const tank = window.tankInventoryList.find(t => t.id === tankId);
    if (!tank) return;
    tank.status = newStatus;
    window.renderTankInventoryUI();
    window.saveTankInventoryDB();
};

// Quick Inventory Checkbox Toggle
window.toggleTankInventory = function(tankId, isChecked) {
    const tank = window.tankInventoryList.find(t => t.id === tankId);
    if (!tank) return;
    tank.inInventory = isChecked;
    window.renderTankInventoryUI();
    window.saveTankInventoryDB();
};

// Open Modal to Add/Edit Tank
window.openEditTankModal = function(tankId = null) {
    window.activeTankEditId = tankId;
    const modal = document.getElementById('tank-edit-modal');
    if (!modal) return;

    const titleEl = document.getElementById('tank-edit-modal-title');

    if (tankId) {
        const tank = window.tankInventoryList.find(t => t.id === tankId);
        if (!tank) return;
        if (titleEl) titleEl.innerText = `Editar Botella #${tank.sello} (${tank.serial})`;

        document.getElementById('tank-input-sello').value = tank.sello || '';
        document.getElementById('tank-input-type').value = tank.type || '12L ACERO AIRE';
        document.getElementById('tank-input-serial').value = tank.serial || '';
        document.getElementById('tank-input-valve').value = tank.valve || '';
        document.getElementById('tank-input-status').value = tank.status || 'Operativa';
        document.getElementById('tank-input-hydro').value = tank.hydroDate || '';
        document.getElementById('tank-input-paint').value = tank.lastPainted || '';
        document.getElementById('tank-input-inventory').checked = tank.inInventory !== false;
    } else {
        if (titleEl) titleEl.innerText = 'Registrar Nueva Botella';
        document.getElementById('tank-input-sello').value = '';
        document.getElementById('tank-input-type').value = '12L ACERO AIRE';
        document.getElementById('tank-input-serial').value = '';
        document.getElementById('tank-input-valve').value = '';
        document.getElementById('tank-input-status').value = 'Operativa';
        document.getElementById('tank-input-hydro').value = '';
        document.getElementById('tank-input-paint').value = '';
        document.getElementById('tank-input-inventory').checked = true;
    }

    modal.classList.remove('hidden');
};

// Close Edit Modal
window.closeEditTankModal = function() {
    const modal = document.getElementById('tank-edit-modal');
    if (modal) modal.classList.add('hidden');
};

// Save Tank from Form
window.saveTankForm = function() {
    const sello = document.getElementById('tank-input-sello').value.trim();
    const type = document.getElementById('tank-input-type').value.trim();
    const serial = document.getElementById('tank-input-serial').value.trim();
    const valve = document.getElementById('tank-input-valve').value.trim();
    const status = document.getElementById('tank-input-status').value;
    const hydroDate = document.getElementById('tank-input-hydro').value.trim();
    const lastPainted = document.getElementById('tank-input-paint').value.trim();
    const inInventory = document.getElementById('tank-input-inventory').checked;

    if (!serial && !sello) {
        if (typeof showAppAlert === 'function') {
            showAppAlert("Indica al menos el Sello o el Número de Serie de la botella.");
        } else {
            alert("Indica al menos el Sello o el Número de Serie de la botella.");
        }
        return;
    }

    if (window.activeTankEditId) {
        const tank = window.tankInventoryList.find(t => t.id === window.activeTankEditId);
        if (tank) {
            tank.sello = sello;
            tank.type = type;
            tank.serial = serial;
            tank.valve = valve;
            tank.status = status;
            tank.hydroDate = hydroDate;
            tank.lastPainted = lastPainted;
            tank.inInventory = inInventory;
            tank.updatedAt = Date.now();
        }
    } else {
        const newTank = {
            id: `TNK_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            sello,
            type,
            serial,
            valve,
            status,
            hydroDate,
            lastPainted,
            inInventory,
            createdAt: Date.now()
        };
        window.tankInventoryList.push(newTank);
    }

    window.closeEditTankModal();
    window.renderTankInventoryUI();
    window.saveTankInventoryDB();
};

// Delete Tank
window.deleteTank = function(tankId) {
    const tank = window.tankInventoryList.find(t => t.id === tankId);
    if (!tank) return;

    const confirmMsg = `¿Eliminar la botella Sello #${tank.sello} (Serie: ${tank.serial}) del inventario?`;
    if (typeof showAppConfirm === 'function') {
        showAppConfirm(confirmMsg, () => {
            window.tankInventoryList = window.tankInventoryList.filter(t => t.id !== tankId);
            window.renderTankInventoryUI();
            window.saveTankInventoryDB();
        });
    } else if (confirm(confirmMsg)) {
        window.tankInventoryList = window.tankInventoryList.filter(t => t.id !== tankId);
        window.renderTankInventoryUI();
        window.saveTankInventoryDB();
    }
};

// Bulk Import from Google Sheets / Excel
window.openTankImportModal = function() {
    const modal = document.getElementById('tank-import-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeTankImportModal = function() {
    const modal = document.getElementById('tank-import-modal');
    if (modal) modal.classList.add('hidden');
};

window.processBulkTankPaste = function() {
    const textarea = document.getElementById('tank-bulk-import-text');
    if (!textarea) return;

    const raw = textarea.value.trim();
    if (!raw) return;

    const lines = raw.split(/\r?\n/);
    let importedCount = 0;

    lines.forEach(line => {
        if (!line.trim()) return;
        const cols = line.includes('\t') ? line.split('\t') : line.split(',');
        if (cols.length < 2) return;

        // Skip header line if pasted
        const firstCol = cols[0].trim().toLowerCase();
        if (firstCol.includes('sello') || firstCol.includes('status') || firstCol.includes('tipo')) return;

        const sello = cols[0] ? cols[0].trim() : '';
        const statusRaw = cols[1] ? cols[1].trim() : 'Operativa';
        let status = 'Operativa';
        if (statusRaw.toLowerCase().includes('test')) status = 'Testing';
        else if (statusRaw.toLowerCase().includes('paint')) status = 'Painting';
        else if (statusRaw.toLowerCase().includes('rechaz')) status = 'Rechazada';

        const type = cols[2] ? cols[2].trim() : '12L ACERO AIRE';
        const serial = cols[3] ? cols[3].trim() : '';
        const valve = cols[4] ? cols[4].trim() : '';
        const hydroDate = cols[5] ? cols[5].trim() : '';
        const lastPainted = cols[6] ? cols[6].trim() : '';
        const inInvRaw = cols[7] ? cols[7].trim().toLowerCase() : 'true';
        const inInventory = !(inInvRaw === 'false' || inInvRaw === '0' || inInvRaw === 'no');

        if (serial || sello) {
            window.tankInventoryList.push({
                id: `TNK_${Date.now()}_${Math.floor(Math.random()*10000)}`,
                sello,
                status,
                type,
                serial,
                valve,
                hydroDate,
                lastPainted,
                inInventory,
                createdAt: Date.now()
            });
            importedCount++;
        }
    });

    textarea.value = '';
    window.closeTankImportModal();
    window.renderTankInventoryUI();
    window.saveTankInventoryDB();

    if (typeof showAppAlert === 'function') {
        showAppAlert(`Se han importado ${importedCount} botellas correctamente.`);
    } else {
        alert(`Se han importado ${importedCount} botellas correctamente.`);
    }
};

// Print / Export Tank Inventory Table
window.printTankInventory = function() {
    window.print();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initTankInventoryDB);
} else {
    window.initTankInventoryDB();
}

