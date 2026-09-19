// ==========================================
// BONOS DE REGALO MANAGER MODULE
// ==========================================

window.bonosCache = [];
let bonosUnsubscribe = null;

// Ensure Firestore is accessible
const getBonosDb = () => {
    if (typeof db !== 'undefined') return db;
    if (window.db) return window.db;
    if (typeof firebase !== 'undefined' && firebase.firestore) return firebase.firestore();
    return null;
};

window.openBonosManagerModal = function() {
    const modal = document.getElementById('bonos-manager-modal');
    if (modal) modal.classList.remove('hidden');
    loadBonos();
};

window.closeBonosManagerModal = function() {
    const modal = document.getElementById('bonos-manager-modal');
    if (modal) modal.classList.add('hidden');
    if (bonosUnsubscribe) {
        bonosUnsubscribe();
        bonosUnsubscribe = null;
    }
};

function loadBonos() {
    const database = getBonosDb();
    if (!database) {
        console.error("Firestore DB not found for bonos-manager.");
        return;
    }
    
    document.getElementById('bonos-count-indicator').innerText = 'Cargando bonos...';
    
    if (bonosUnsubscribe) bonosUnsubscribe();
    
    bonosUnsubscribe = database.collection('mangamar_bonos')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            window.bonosCache = [];
            snapshot.forEach(doc => {
                window.bonosCache.push({ id: doc.id, ...doc.data() });
            });
            window.renderBonosList();
        }, error => {
            console.error("Error fetching bonos:", error);
            if(window.showAppAlert) window.showAppAlert("⚠️ Error cargando Bonos de Regalo: " + error.message);
        });
}

window.renderBonosList = function() {
    const container = document.getElementById('bonos-list-container');
    const searchTerm = (document.getElementById('bonos-search-input')?.value || '').toLowerCase();
    const filter = document.getElementById('bonos-filter-select')?.value || 'all';
    
    if (!container) return;
    
    container.innerHTML = '';
    
    const now = new Date();
    
    let filteredBonos = window.bonosCache.filter(b => {
        // Search
        const searchMatch = (b.buyerName || '').toLowerCase().includes(searchTerm) || 
                            (b.buyerDni || '').toLowerCase().includes(searchTerm) ||
                            (b.recipientName || '').toLowerCase().includes(searchTerm) ||
                            (b.activity || '').toLowerCase().includes(searchTerm) ||
                            (b.id || '').toLowerCase().includes(searchTerm);
        if (!searchMatch) return false;
        
        // Expiry calculation
        const expiryDate = b.expiryDate ? new Date(b.expiryDate) : null;
        const isExpired = expiryDate && expiryDate < now;
        
        // Filter
        if (filter === 'active') return !b.isUsed && b.isPaid && !isExpired;
        if (filter === 'unpaid') return !b.isPaid && !b.isUsed && !isExpired;
        if (filter === 'used') return b.isUsed;
        if (filter === 'expired') return isExpired && !b.isUsed;
        
        return true; // 'all'
    });
    
    document.getElementById('bonos-count-indicator').innerText = `${filteredBonos.length} ${filteredBonos.length === 1 ? 'bono' : 'bonos'}`;
    
    if (filteredBonos.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold">No se encontraron bonos de regalo con los filtros actuales.</div>`;
        return;
    }
    
    filteredBonos.forEach(b => {
        const expiryDate = b.expiryDate ? new Date(b.expiryDate) : null;
        const isExpired = expiryDate && expiryDate < now;
        
        // Theme logic
        let cardTheme = 'bg-white border-slate-200';
        let statusBadge = '';
        
        if (b.isUsed) {
            cardTheme = 'bg-slate-100 border-slate-300 opacity-70';
            statusBadge = `<span class="px-2 py-1 bg-slate-600 text-white rounded text-[10px] font-black uppercase shadow-sm flex items-center gap-1">✅ USADO</span>`;
        } else if (isExpired) {
            cardTheme = 'bg-red-50 border-red-200 opacity-80';
            statusBadge = `<span class="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-black uppercase shadow-sm">⚠️ CADUCADO</span>`;
        } else if (!b.isPaid) {
            cardTheme = 'bg-orange-50 border-orange-200';
            statusBadge = `<span class="px-2 py-1 bg-orange-500 text-white rounded text-[10px] font-black uppercase shadow-sm">⏳ Pendiente Pago</span>`;
        } else {
            cardTheme = 'bg-emerald-50 border-emerald-200';
            statusBadge = `<span class="px-2 py-1 bg-emerald-500 text-white rounded text-[10px] font-black uppercase shadow-sm flex items-center gap-1">✓ DISPONIBLE</span>`;
        }

        const div = document.createElement('div');
        div.className = `p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${cardTheme}`;
        
        div.innerHTML = `
            <div class="flex items-start gap-3 flex-1 min-w-0">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center font-black text-2xl shrink-0 ${b.isUsed ? 'bg-slate-200 grayscale' : 'bg-white shadow-inner'}">
                    🎁
                </div>
                <div class="min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-mono text-[10px] font-black px-2 py-0.5 rounded border border-slate-300 text-slate-500 bg-white shadow-sm">${b.id.substring(0,8).toUpperCase()}</span>
                        <h4 class="text-sm font-black text-slate-800 truncate">${b.recipientName || 'Sin destinatario'}</h4>
                        ${statusBadge}
                    </div>
                    <div class="text-xs text-slate-600 font-bold flex flex-col gap-0.5">
                        <span class="text-fuchsia-700 truncate">Comprador: <span class="text-slate-800">${b.buyerName || '?'} ${b.buyerDni ? '('+b.buyerDni+')' : ''}</span></span>
                        ${b.buyerEmail ? `<span class="truncate text-slate-500">Email: ${b.buyerEmail}</span>` : ''}
                        ${b.buyerPhone ? `<span class="truncate text-slate-500">Tel: ${b.buyerPhone}</span>` : ''}
                        <span class="truncate text-slate-700 mt-1">Actividad: ${b.activity || 'No especificada'}</span>
                        <span class="text-[10px] text-slate-400">Válido hasta: ${b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('es-ES') : '-'}</span>
                    </div>
                </div>
            </div>
            
            <div class="flex flex-col gap-2 shrink-0 border-l border-slate-200 pl-4">
                <div class="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                    <label class="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" ${b.isPaid ? 'checked' : ''} onchange="window.toggleBonoStatus('${b.id}', 'isPaid', this.checked)" class="w-4 h-4 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500">
                        <span class="text-[10px] font-black uppercase text-slate-600">Pagado</span>
                    </label>
                    <div class="w-px h-4 bg-slate-200"></div>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" ${b.isUsed ? 'checked' : ''} onchange="window.toggleBonoStatus('${b.id}', 'isUsed', this.checked)" class="w-4 h-4 text-slate-600 rounded border-slate-300 focus:ring-slate-500">
                        <span class="text-[10px] font-black uppercase text-slate-600">Usado</span>
                    </label>
                </div>
                <div class="flex items-center gap-2 justify-end">
                    <button onclick="window.openBonoEditorModal('${b.id}')" class="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-fuchsia-600 text-xs font-black transition-colors shadow-sm flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        Editar
                    </button>
                    <button onclick="window.generateBonoPdf('${b.id}')" class="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-fuchsia-50 hover:text-fuchsia-600 text-xs font-black transition-colors shadow-sm flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                        PDF
                    </button>
                    <button onclick="window.generateBonoPng('${b.id}')" class="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-blue-50 hover:text-blue-600 text-xs font-black transition-colors shadow-sm flex items-center gap-1 ml-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> PNG </button>
                    <button onclick="window.deleteBono('${b.id}')" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors ml-1" title="Eliminar bono">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
};

// ==========================================
// EDITOR MODAL LOGIC
// ==========================================

window.openBonoEditorModal = function(bonoId = null) {
    const modal = document.getElementById('bono-editor-modal');
    if (!modal) return;
    
    // Reset Form
    document.getElementById('bono-id-input').value = '';
    
    // CRM Search reset
    const searchInput = document.getElementById('bono-crm-search-input');
    if (searchInput) searchInput.value = '';
    const resultsContainer = document.getElementById('bono-crm-search-results');
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.add('hidden');
    }

    document.getElementById('bono-buyer-input').value = '';
    document.getElementById('bono-buyer-dni-input').value = '';
    document.getElementById('bono-email-input').value = '';
    document.getElementById('bono-phone-input').value = '';
    document.getElementById('bono-recipient-input').value = '';
    document.getElementById('bono-activity-input').value = '';
    
    document.getElementById('bono-paid-check').checked = false;
    document.getElementById('bono-used-check').checked = false;
    
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('bono-purchase-date').value = todayStr;
    
    // Default Expiry (1 year from today)
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    document.getElementById('bono-expiry-date').value = nextYear.toISOString().split('T')[0];
    
    if (bonoId) {
        document.getElementById('bono-editor-title').innerText = "Editar Bono de Regalo";
        const b = window.bonosCache.find(x => x.id === bonoId);
        if (b) {
            document.getElementById('bono-id-input').value = b.id;
            document.getElementById('bono-buyer-input').value = b.buyerName || '';
            document.getElementById('bono-buyer-dni-input').value = b.buyerDni || '';
            document.getElementById('bono-email-input').value = b.buyerEmail || '';
            document.getElementById('bono-phone-input').value = b.buyerPhone || '';
            document.getElementById('bono-recipient-input').value = b.recipientName || '';
            document.getElementById('bono-activity-input').value = b.activity || '';
            
            document.getElementById('bono-paid-check').checked = b.isPaid || false;
            document.getElementById('bono-used-check').checked = b.isUsed || false;
            
            if (b.purchaseDate) document.getElementById('bono-purchase-date').value = b.purchaseDate;
            if (b.expiryDate) document.getElementById('bono-expiry-date').value = b.expiryDate;
        }
    } else {
        document.getElementById('bono-editor-title').innerText = "Nuevo Bono de Regalo";
    }
    
    modal.classList.remove('hidden');
};

window.closeBonoEditorModal = function() {
    const modal = document.getElementById('bono-editor-modal');
    if (modal) modal.classList.add('hidden');
};

window.saveBono = async function() {
    const database = getBonosDb();
    if (!database) return;
    
    const id = document.getElementById('bono-id-input').value;
    const buyerName = document.getElementById('bono-buyer-input').value.trim();
    const buyerDni = document.getElementById('bono-buyer-dni-input').value.trim();
    const buyerEmail = document.getElementById('bono-email-input').value.trim();
    const buyerPhone = document.getElementById('bono-phone-input').value.trim();
    const recipientName = document.getElementById('bono-recipient-input').value.trim();
    const activity = document.getElementById('bono-activity-input').value.trim();
    const notes = "";
    const purchaseDate = document.getElementById('bono-purchase-date').value;
    const expiryDate = document.getElementById('bono-expiry-date').value;
    const isPaid = document.getElementById('bono-paid-check').checked;
    const isUsed = document.getElementById('bono-used-check').checked;
    
    if (!buyerName || !recipientName || !activity) {
        if(window.showAppAlert) window.showAppAlert("⚠️ Por favor, rellena el comprador, el destinatario y la actividad.");
        return;
    }
    
    const bonoData = {
        buyerName,
        buyerDni,
        buyerEmail,
        buyerPhone,
        recipientName,
        activity,
        notes,
        purchaseDate,
        expiryDate,
        isPaid,
        isUsed
    };
    
    try {
        if (id) {
            // Optimistic UI Update & Close
            const existingIdx = window.bonosCache.findIndex(b => b.id === id);
            if (existingIdx >= 0) window.bonosCache[existingIdx] = { ...window.bonosCache[existingIdx], ...bonoData };
            window.closeBonoEditorModal();
            window.renderBonosList();
            
            // Background save
            database.collection('mangamar_bonos').doc(id).update({
                ...bonoData,
                updatedAt: new Date().toISOString()
            }).catch(err => {
                console.error("Error updating bono:", err);
                if(window.showAppAlert) window.showAppAlert("⚠️ Error guardando el bono en segundo plano.");
            });
        } else {
            // Optimistic UI Update & Close
            const newId = database.collection('mangamar_bonos').doc().id;
            const newBono = {
                ...bonoData,
                createdAt: new Date().toISOString()
            };
            
            window.bonosCache.unshift({ id: newId, ...newBono });
            window.closeBonoEditorModal();
            window.renderBonosList();
            
            // Background save
            database.collection('mangamar_bonos').doc(newId).set(newBono).catch(err => {
                console.error("Error creating bono:", err);
                if(window.showAppAlert) window.showAppAlert("⚠️ Error creando el bono en segundo plano.");
            });
        }
    } catch(err) {
        console.error("Error saving bono:", err);
        if(window.showAppAlert) window.showAppAlert("⚠️ Error al guardar el bono.");
    }
};

window.deleteBono = async function(id) {
    if (window.showAppConfirm) {
        window.showAppConfirm("¿Estás seguro de que deseas eliminar este bono de regalo? Esta acción no se puede deshacer.", async () => {
            const database = getBonosDb();
            if (!database) return;
            
            try {
                await database.collection('mangamar_bonos').doc(id).delete();
            } catch (err) {
                console.error("Error deleting bono:", err);
                if(window.showAppAlert) window.showAppAlert("⚠️ Error al eliminar el bono.");
            }
        });
    } else {
        if (!confirm("¿Estás seguro de que deseas eliminar este bono de regalo? Esta acción no se puede deshacer.")) {
            return;
        }
        const database = getBonosDb();
        if (!database) return;
        
        try {
            await database.collection('mangamar_bonos').doc(id).delete();
        } catch (err) {
            console.error("Error deleting bono:", err);
            if(window.showAppAlert) window.showAppAlert("⚠️ Error al eliminar el bono.");
        }
    }
};

window.toggleBonoStatus = async function(id, field, value) {
    const database = getBonosDb();
    if (!database) return;
    try {
        await database.collection('mangamar_bonos').doc(id).update({
            [field]: value,
            updatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error("Error toggling bono status:", err);
        if(window.showAppAlert) window.showAppAlert("⚠️ Error al actualizar el estado del bono.");
    }
};

window.handleBuyerDniChange = function(dni) {
    if (!dni || !window.customerDatabase) return;
    
    const normDni = window.normalizeDni ? window.normalizeDni(dni) : dni.toLowerCase().trim();
    const isSameDni = window.isSameDni || ((a, b) => a.toLowerCase().trim() === b.toLowerCase().trim());
    
    const match = window.customerDatabase.find(c => c.dni && isSameDni(c.dni, normDni));
    
    if (match) {
        window.selectBonoCustomer(
            match.dni,
            window.getFullName ? window.getFullName(match) : match.nombre,
            match.email,
            match.telefono
        );
    }
};

window.searchBonoCustomer = function(query) {
    const resultsContainer = document.getElementById('bono-crm-search-results');
    if (!resultsContainer || !window.customerDatabase) return;
    
    if (!query || query.length < 2) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.add('hidden');
        return;
    }
    
    const normQuery = query.toLowerCase().trim();
    const isSameDni = window.isSameDni || ((a, b) => a.toLowerCase().trim() === b.toLowerCase().trim());
    const getFullName = window.getFullName || (c => c.nombre || '');
    
    const results = window.customerDatabase.filter(c => {
        const fullName = getFullName(c).toLowerCase();
        return fullName.includes(normQuery) || (c.dni && c.dni.toLowerCase().includes(normQuery));
    }).slice(0, 5); // top 5 results
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="p-3 text-xs text-slate-500 text-center">No hay coincidencias</div>';
        resultsContainer.classList.remove('hidden');
        return;
    }
    
    resultsContainer.innerHTML = results.map(c => {
        const name = getFullName(c);
        const dni = c.dni || '';
        const email = c.email || '';
        const phone = c.telefono || '';
        
        return `<div class="p-3 border-b border-slate-100 hover:bg-fuchsia-50 cursor-pointer transition-colors" 
                    onclick="window.selectBonoCustomer('${dni}', '${name.replace(/'/g, "\\'")}', '${email.replace(/'/g, "\\'")}', '${phone.replace(/'/g, "\\'")}')">
            <div class="text-sm font-bold text-slate-800">${name}</div>
            <div class="text-xs font-bold text-slate-500 font-mono">${dni}</div>
        </div>`;
    }).join('');
    
    resultsContainer.classList.remove('hidden');
};

window.selectBonoCustomer = function(dni, name, email, phone) {
    const searchInput = document.getElementById('bono-crm-search-input');
    const resultsContainer = document.getElementById('bono-crm-search-results');
    
    if (searchInput) searchInput.value = name;
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.add('hidden');
    }
    
    document.getElementById('bono-buyer-dni-input').value = dni || '';
    document.getElementById('bono-buyer-input').value = name || '';
    
    const emailInput = document.getElementById('bono-email-input');
    const phoneInput = document.getElementById('bono-phone-input');
    
    if (emailInput && email && !emailInput.value) emailInput.value = email;
    if (phoneInput && phone && !phoneInput.value) phoneInput.value = phone;
};

// ==========================================
// VOUCHER HTML->PDF GENERATOR
// ==========================================


function drawBonoCanvas(bonoId, callback) {
    const b = window.bonosCache.find(x => x.id === bonoId);
    if (!b) return;
    
    const expDateStr = b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('es-ES') : 'N/A';
    const code = b.id.substring(0,8).toUpperCase();
    
    const capitalize = (str) => {
        if (!str) return '';
        return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    };
    
    const recipientName = capitalize(b.recipientName);
    const buyerName = capitalize(b.buyerName);
    
    const canvas = document.createElement('canvas');
    const w = 1890;
    const h = 908;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    
    const radius = 40;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();
    
    const bgImg = new Image();
    bgImg.crossOrigin = 'anonymous';
    bgImg.onload = () => {
        const imgRatio = bgImg.width / bgImg.height;
        const canvasRatio = w / h;
        let drawW = w;
        let drawH = h;
        let dx = 0;
        let dy = 0;
        
        if (imgRatio > canvasRatio) {
            drawW = h * imgRatio;
            dx = (w - drawW) / 2;
        } else {
            drawH = w / imgRatio;
            dy = (h - drawH) / 2;
        }
        
        ctx.drawImage(bgImg, dx, dy, drawW, drawH);
        
        const grd = ctx.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, 'transparent');
        grd.addColorStop(0.45, 'rgba(15, 23, 42, 0.7)');
        grd.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        
        const contentX = w * 0.45;
        const contentW = w * 0.55;
        
        ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
        ctx.fillRect(contentX, 0, contentW, h);
        
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(contentX, 0);
        ctx.lineTo(contentX, h);
        ctx.stroke();
        
        const padX = 90;
        const padY = 70;
        const startX = contentX + padX;
        
        ctx.fillStyle = '#f97316';
        ctx.font = '900 64px "Outfit", sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('MANGAMAR', startX, padY);
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 28px "Outfit", sans-serif';
        ctx.fillText('D I V E   C E N T E R', startX, padY + 70);
        
        ctx.fillStyle = 'white';
        ctx.font = '900 56px "Outfit", sans-serif';
        const h1Y = padY + 180;
        ctx.fillText('BONO DE REGALO', startX, h1Y);
        
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(startX, h1Y + 70);
        ctx.lineTo(startX + 480, h1Y + 70);
        ctx.stroke();
        
        const boxDraw = (bx, by, bw, bh, label, value, isActivity) => {
            ctx.fillStyle = isActivity ? 'rgba(249, 115, 22, 0.1)' : 'rgba(255,255,255,0.05)';
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 24);
            ctx.fill();
            
            ctx.strokeStyle = isActivity ? 'rgba(249, 115, 22, 0.3)' : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = '#94a3b8';
            ctx.font = '700 20px "Outfit", sans-serif';
            ctx.fillText(label, bx + 32, by + 24);
            
            ctx.fillStyle = isActivity ? '#f97316' : 'white';
            ctx.font = (isActivity ? '800 40px ' : '600 30px ') + '"Outfit", sans-serif';
            ctx.fillText(value, bx + 32, by + 56);
        };
        
        boxDraw(startX, h1Y + 120, contentW - padX*2, 110, 'EXPERIENCIA / ACTIVIDAD', b.activity, true);
        
        const halfBox = (contentW - padX*2 - 40) / 2;
        boxDraw(startX, h1Y + 260, halfBox, 110, 'PARA (DESTINATARIO)', recipientName, false);
        boxDraw(startX + halfBox + 40, h1Y + 260, halfBox, 110, 'DE PARTE DE', buyerName, false);
        
        const footY = h - padY - 100;
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(startX, footY);
        ctx.lineTo(w - padX, footY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 22px "Outfit", sans-serif';
        ctx.fillText('Condiciones: Imprescindible reserva previa. Válido por 1', startX, footY + 40);
        ctx.fillText('año desde su emisión.', startX, footY + 70);
        ctx.fillText('Tel: +34 656 555 444 • www.mangamar.es • Cabo de Palos', startX, footY + 100);
        
        const vBoxW = 220;
        const vBoxH = 100;
        const vBoxX = w - padX - vBoxW;
        const vBoxY = footY + 30;
        
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(vBoxX, vBoxY, vBoxW, vBoxH, 20);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#f97316';
        ctx.font = '800 20px "Outfit", sans-serif';
        ctx.fillText('VÁLIDO HASTA', vBoxX + 20, vBoxY + 20);
        
        ctx.fillStyle = 'white';
        ctx.font = '900 22px "Outfit", sans-serif';
        ctx.fillText(expDateStr, vBoxX + 20, vBoxY + 50);
        
        ctx.fillStyle = '#64748b';
        ctx.font = '400 18px monospace';
        ctx.fillText('REF: ' + code, vBoxX + 20, vBoxY + 80);
        
        callback(canvas.toDataURL('image/png', 1.0), recipientName, code);
    };
    
    bgImg.src = 'bono-bg.jpg';
}

window.generateBonoPng = function(bonoId) {
    drawBonoCanvas(bonoId, (dataUrl, recipientName, code) => {
        const link = document.createElement('a');
        link.download = `Bono_Mangamar_${recipientName.replace(/\s+/g, '_')}_${code}.png`;
        link.href = dataUrl;
        link.click();
    });
};

window.generateBonoPdf = function(bonoId) {
    drawBonoCanvas(bonoId, (dataUrl) => {
        let iframe = document.getElementById('bono-print-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'bono-print-iframe';
            iframe.style.position = 'absolute';
            iframe.style.width = '0px';
            iframe.style.height = '0px';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);
        }
        
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @media print {
                    @page { size: landscape; margin: 0; }
                    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
                    img { width: 250mm; height: 120mm; object-fit: contain; }
                }
                body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f8fafc; }
                img { width: 250mm; height: 120mm; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
            </style>
        </head>
        <body>
            <img src="${dataUrl}" />
        </body>
        </html>
        `;

        iframe.srcdoc = htmlContent;
        
        setTimeout(() => {
            iframe.contentWindow.print();
        }, 500);
    });
};

