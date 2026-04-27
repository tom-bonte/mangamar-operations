// ==========================================
// 10. DYNAMIC PRICING ENGINE
// ==========================================

let isPriceEditMode = false;
let activePriceTab = "Inmersiones";
let dynamicPrices = [];

// Base defaults pulled directly from your official screenshots
const DEFAULT_PRICES = [
    // Inmersiones
    { category: "Inmersiones", name: "Inmersión Local (Cala)", price: 40 },
    { category: "Inmersiones", name: "Inmersión Reserva Marina", price: 44 },
    { category: "Inmersiones", name: "Inmersión Naranjito", price: 45 },
    { category: "Inmersiones", name: "Inmersión Bajo de Fuera", price: 50 },
    { category: "Inmersiones", name: "Inmersión Nocturna (Mín 4 pax)", price: 60 },
    { category: "Inmersiones", name: "Guía Privado (Extra por grupo)", price: 35 },
    { category: "Inmersiones", name: "Guía Personal (Solo 1 persona)", price: 75 },
    { category: "Inmersiones", name: "Inmersión con Scooter - Handicap", price: 20 },
    { category: "Inmersiones", name: "Inmersión con Scooter", price: 40 },

    // Tasas (Para Bonos / Extras)
    { category: "Tasas", name: "Tasa Reserva Marina", price: 5 },
    { category: "Tasas", name: "Tasa Bajo de Fuera", price: 10 },

    // Bonos
    { category: "Bonos", name: "Bono 10 inmersiones", price: 399 },

    // Cursos
    { category: "Cursos", name: "DSD (Bautismo) desde Playa", price: 75 },
    { category: "Cursos", name: "DSD (Bautismo) desde Barco", price: 85 },
    { category: "Cursos", name: "DSD con 2 Inmersiones (Playa + Barco)", price: 125 },
    { category: "Cursos", name: "Refresh (Buceo + Seguro)", price: 65 },
    { category: "Cursos", name: "Reactivate", price: 275 },
    { category: "Cursos", name: "Open Water Diver (OWC)", price: 495 },
    { category: "Cursos", name: "Open Water Referral", price: 375 },
    { category: "Cursos", name: "Scuba Diver Course (SDC)", price: 375 },
    { category: "Cursos", name: "Adventure Diver Course", price: 300 },
    { category: "Cursos", name: "Advanced Open Water (AOWC)", price: 449 },
    { category: "Cursos", name: "AOWC + Nitrox", price: 599 },
    { category: "Cursos", name: "Rescate", price: 375 },
    { category: "Cursos", name: "Rescate + EFR", price: 495 },
    { category: "Cursos", name: "TEC40", price: 495 },

    // Especialidades
    { category: "Especialidades", name: "Adaptive (2 dives)", price: 300 },
    { category: "Especialidades", name: "Boat Diver (2 dives)", price: 145 },
    { category: "Especialidades", name: "Coral Reef (Dry Course)", price: 150 },
    { category: "Especialidades", name: "Deep (3 dives)", price: 295 },
    { category: "Especialidades", name: "Dive Against Debris (2 dives)", price: 145 },
    { category: "Especialidades", name: "DPV (2 dives)", price: 225 },
    { category: "Especialidades", name: "Drift (2 dives)", price: 250 },
    { category: "Especialidades", name: "DrySuit (2 dives)", price: 250 },
    { category: "Especialidades", name: "DSMB (2 dives)", price: 250 },
    { category: "Especialidades", name: "Emergency Oxygen Provider", price: 199 },
    { category: "Especialidades", name: "Fish ID (2 dives)", price: 195 },
    { category: "Especialidades", name: "Full Face Mask (2 dives)", price: 250 },
    { category: "Especialidades", name: "Navigation (3 dives)", price: 295 },
    { category: "Especialidades", name: "Night Dive (3 dives)", price: 400 },
    { category: "Especialidades", name: "Nitrox (Dry Course)", price: 225 },
    { category: "Especialidades", name: "PPB (2 dives)", price: 239 },
    { category: "Especialidades", name: "Self Reliant (3 dives)", price: 400 },
    { category: "Especialidades", name: "Search & Recovery (3 dives)", price: 295 },
    { category: "Especialidades", name: "Search & Recovery (4 dives)", price: 350 },
    { category: "Especialidades", name: "Sidemount (3 dives)", price: 400 },
    { category: "Especialidades", name: "Shark Aware (2 dives)", price: 195 },
    { category: "Especialidades", name: "UW Imaging (2 dives)", price: 250 },
    { category: "Especialidades", name: "Wreck (3 dives)", price: 295 },
    { category: "Especialidades", name: "Wreck (4 dives)", price: 350 },

    // Alquiler y Extras
    { category: "Alquiler y Extras", name: "Suplemento Nitrox", price: 7 },
    { category: "Alquiler y Extras", name: "Carga de Aire", price: 12 },
    { category: "Alquiler y Extras", name: "Nitrox filling to go", price: 12 },
    { category: "Alquiler y Extras", name: "Alquiler: 1 Pieza (Traje, BCD, Reg)", price: 10 },
    { category: "Alquiler y Extras", name: "Alquiler: 1 Pieza Ligera (Aletas, Tubo, Máscara)", price: 5 },
    { category: "Alquiler y Extras", name: "Alquiler: Equipo Completo", price: 15 },
    { category: "Alquiler y Extras", name: "Alquiler: Ordenador", price: 7 },
    { category: "Alquiler y Extras", name: "Alquiler: Equipo Completo (3 días/2 buceos día)", price: 60 },
    { category: "Alquiler y Extras", name: "Alquiler: Traje Seco (Curso / día)", price: 25 },
    { category: "Alquiler y Extras", name: "Alquiler: Traje Seco (Fun Dives / buceo)", price: 25 },
    { category: "Alquiler y Extras", name: "Pérdida de Peso (por kg)", price: 10 },
    { category: "Alquiler y Extras", name: "Bolsillo de Peso", price: 5 },
    { category: "Alquiler y Extras", name: "Seguro 1 Día", price: 10 },
    { category: "Alquiler y Extras", name: "Seguro 1 Semana (DAN)", price: 18 },
    { category: "Alquiler y Extras", name: "Seguro 1 Mes", price: 24 },
    { category: "Alquiler y Extras", name: "Seguro 1 Año", price: 45 }
];

let pricingListenerUnsubscribe = null;

async function loadPrices() {
    return new Promise((resolve) => {
        if (pricingListenerUnsubscribe) {
            // Already listening, just resolve immediately
            resolve();
            return;
        }
        
        pricingListenerUnsubscribe = db.collection('mangamar_settings').doc('pricing').onSnapshot(async (doc) => {
            if (doc.exists && doc.data().items && doc.data().items.length > 0) {
                dynamicPrices = doc.data().items;
            } else {
                // Initialize defaults only if the database is completely empty
                dynamicPrices = JSON.parse(JSON.stringify(DEFAULT_PRICES));
                try {
                    await db.collection('mangamar_settings').doc('pricing').set({ items: dynamicPrices });
                } catch(e) { console.error("Error setting default prices", e); }
            }
            
            // Re-render UI if modal is currently open
            if (typeof renderPriceModal === 'function' && document.getElementById('price-list-modal') && !document.getElementById('price-list-modal').classList.contains('hidden')) {
                renderPriceModal();
            }
            resolve();
        });
    });
}

window.openPriceModal = function() {
    isPriceEditMode = false;
    renderPriceModal();
    document.getElementById('price-list-modal').classList.remove('hidden');
}

window.closePriceModal = function() {
    document.getElementById('price-list-modal').classList.add('hidden');
}

window.togglePriceEditMode = function() {
    isPriceEditMode = true;
    renderPriceModal();
}

window.cancelPriceEdit = function() {
    isPriceEditMode = false;
    loadPrices().then(() => renderPriceModal()); // Revert unsaved changes
}

window.switchPriceTab = function(category) {
    activePriceTab = category;
    renderPriceModal();
}

window.addNewPriceItem = function() {
    dynamicPrices.push({ category: activePriceTab, name: "Nuevo Ítem", price: 0 });
    renderPriceModal();
    // Scroll to bottom
    const container = document.getElementById('price-content-container');
    setTimeout(() => container.scrollTop = container.scrollHeight, 50);
}

window.deletePriceItem = function(index) {
    showAppConfirm("¿Eliminar este ítem de la lista?", () => {
        dynamicPrices.splice(index, 1);
        renderPriceModal();
    });
}

// --- CUSTOM PROMPT MODAL LOGIC ---
let pendingPromptAction = null;

window.showAppPrompt = function(msg, defaultText, action) {
    document.getElementById('custom-prompt-msg').innerText = msg;
    const input = document.getElementById('custom-prompt-input');
    input.value = defaultText || '';
    pendingPromptAction = action;
    document.getElementById('custom-prompt-modal').classList.remove('hidden');
    // Auto-focus the input box so you can start typing immediately
    setTimeout(() => input.focus(), 50);
}

window.closeAppPrompt = function() {
    document.getElementById('custom-prompt-modal').classList.add('hidden');
    pendingPromptAction = null;
}

window.confirmAppPrompt = function() {
    const val = document.getElementById('custom-prompt-input').value;
    if(pendingPromptAction) pendingPromptAction(val);
    closeAppPrompt();
}

window.updatePriceItem = function(index, field, value) {
    if(field === 'price') dynamicPrices[index][field] = parseFloat(value) || 0;
    else dynamicPrices[index][field] = value;
}

window.handleCategoryChange = function(index, selectEl) {
    if(selectEl.value === '_new') {
        showAppPrompt("Nombre de la nueva categoría:", "", (newCat) => {
            if(newCat && newCat.trim()) {
                dynamicPrices[index].category = newCat.trim();
                activePriceTab = newCat.trim();
            }
            renderPriceModal();
        });
    } else {
        dynamicPrices[index].category = selectEl.value;
        renderPriceModal();
    }
}

window.savePrices = async function() {
    try {
        await db.collection('mangamar_settings').doc('pricing').set({ items: dynamicPrices });
        isPriceEditMode = false;
        showToast("Tarifas guardadas en la nube correctamente.");
        renderPriceModal();
    } catch(e) {
        console.error(e);
        showAppAlert("Error al guardar las tarifas.");
    }
}

window.renderPriceModal = function() {
    const tabsContainer = document.getElementById('price-tabs-container');
    const contentContainer = document.getElementById('price-content-container');
    const editActions = document.getElementById('price-edit-actions');
    const editBtn = document.getElementById('btn-edit-prices');
    
    // Extract Unique Categories for Tabs
    let categories = [...new Set(dynamicPrices.map(p => p.category))];
    if(!categories.includes(activePriceTab) && categories.length > 0) activePriceTab = categories[0];
    if(categories.length === 0) categories = ["General"];

    tabsContainer.innerHTML = categories.map(cat => `
        <button onclick="switchPriceTab('${cat}')" class="pb-3 px-3 text-sm font-black border-b-[3px] transition-all whitespace-nowrap ${activePriceTab === cat ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-400 hover:text-slate-600'}">${cat}</button>
    `).join('');

    if (isPriceEditMode) {
        editActions.classList.remove('hidden');
        editBtn.classList.add('hidden');
        
        let html = `<div class="space-y-3">`;
        dynamicPrices.forEach((item, index) => {
            if(item.category !== activePriceTab) return;
            
            const catOptions = categories.map(c => `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`).join('');
            
            html += `
            <div class="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <div class="flex w-full sm:flex-1 gap-2 items-center">
                    <div class="flex flex-col gap-0.5 shrink-0">
                        <button onclick="movePriceItem(${index}, -1)" class="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-100 rounded border border-slate-100 transition-colors flex items-center justify-center h-5 w-6"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 15l7-7 7 7"></path></svg></button>
                        <button onclick="movePriceItem(${index}, 1)" class="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-100 rounded border border-slate-100 transition-colors flex items-center justify-center h-5 w-6"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg></button>
                    </div>
                    <button onclick="deletePriceItem(${index})" class="text-slate-300 hover:text-red-500 transition-colors p-2 bg-slate-50 rounded-lg border border-slate-100 shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                    <input type="text" value="${item.name}" onchange="updatePriceItem(${index}, 'name', this.value)" class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:ring-2 focus:ring-orange-500 outline-none">
                </div>
                <div class="flex w-full sm:w-auto gap-2">
                    <div class="relative flex items-center shrink-0">
                        <input type="number" value="${item.price}" onchange="updatePriceItem(${index}, 'price', this.value)" class="w-24 px-3 py-2 pl-7 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-800 focus:ring-2 focus:ring-orange-500 outline-none">
                        <span class="absolute left-3 text-slate-400 font-bold">€</span>
                    </div>
                    <select onchange="handleCategoryChange(${index}, this)" class="w-full sm:w-36 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-orange-500 truncate">
                        ${catOptions}
                        <option value="_new">+ Nueva Cat...</option>
                    </select>
                </div>
            </div>
            `;
        });
        html += `</div>`;
        contentContainer.innerHTML = html;
        
    } else {
        editActions.classList.add('hidden');
        editBtn.classList.remove('hidden');
        
        let html = `<div class="space-y-2">`;
        dynamicPrices.filter(p => p.category === activePriceTab).forEach(item => {
            html += `
            <div class="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-orange-200 transition-all">
                <span class="font-bold text-slate-700 text-sm">${item.name}</span>
                <span class="font-black text-slate-800 bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg border border-orange-100">${item.price} €</span>
            </div>
            `;
        });
        if(dynamicPrices.filter(p => p.category === activePriceTab).length === 0) {
            html += `<div class="text-center text-slate-400 italic py-8">Categoría vacía</div>`;
        }
        html += `</div>`;
        contentContainer.innerHTML = html;
    }
}

// --- CUSTOM MODAL & ITEM SORTING LOGIC ---
let pendingConfirmAction = null;

window.showAppConfirm = function(msg, action) {
    document.getElementById('custom-confirm-msg').innerText = msg;
    pendingConfirmAction = action;
    document.getElementById('custom-confirm-modal').classList.remove('hidden');
}

window.closeAppConfirm = function() {
    document.getElementById('custom-confirm-modal').classList.add('hidden');
    pendingConfirmAction = null;
}

window.confirmAppConfirm = function() {
    if(pendingConfirmAction) pendingConfirmAction();
    closeAppConfirm();
}

window.movePriceItem = function(index, direction) {
    const currentCat = dynamicPrices[index].category;
    let targetIndex = -1;

    // Find the nearest item in the SAME category to swap with
    if (direction === -1) { // UP
        for (let i = index - 1; i >= 0; i--) {
            if (dynamicPrices[i].category === currentCat) { targetIndex = i; break; }
        }
    } else { // DOWN
        for (let i = index + 1; i < dynamicPrices.length; i++) {
            if (dynamicPrices[i].category === currentCat) { targetIndex = i; break; }
        }
    }

    if (targetIndex !== -1) {
        const temp = dynamicPrices[index];
        dynamicPrices[index] = dynamicPrices[targetIndex];
        dynamicPrices[targetIndex] = temp;
        renderPriceModal();
    }
}