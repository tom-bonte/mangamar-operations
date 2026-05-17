// ==========================================
// 10. DYNAMIC PRICING ENGINE
// ==========================================

let isPriceEditMode = false;
let activePriceTab = "Inmersiones";
window.dynamicPrices = []; // Globalized for visibility across all modules
let originalPricesSnapshot = []; // Stores prices before entering edit mode

let pricingListenerUnsubscribe = null;

async function loadPrices() {
    return new Promise((resolve) => {
        if (pricingListenerUnsubscribe) {
            // Already listening, just resolve immediately
            resolve();
            return;
        }
        
        pricingListenerUnsubscribe = db.collection('mangamar_settings').doc('pricing').onSnapshot(async (doc) => {
            if (doc.exists && doc.data().items) {
                window.dynamicPrices = doc.data().items;
            } else {
                window.dynamicPrices = [];
            }
            
            if (window.dynamicPrices.length > 0 && !window.dynamicPrices.some(p => p.name === 'Snorkeling')) {
                window.dynamicPrices.push({ category: 'Snorkeling', name: 'Snorkeling', price: 40 });
                db.collection('mangamar_settings').doc('pricing').set({ items: window.dynamicPrices });
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
    originalPricesSnapshot = JSON.parse(JSON.stringify(window.dynamicPrices));
    renderPriceModal();
}

window.cancelPriceEdit = function() {
    isPriceEditMode = false;
    window.dynamicPrices = JSON.parse(JSON.stringify(originalPricesSnapshot));
    renderPriceModal(); // Revert unsaved changes
}

window.switchPriceTab = function(category) {
    activePriceTab = category;
    renderPriceModal();
}

window.addNewPriceItem = function() {
    window.dynamicPrices.push({ category: activePriceTab, name: "Nuevo Ítem", price: 0 });
    renderPriceModal();
    // Scroll to bottom
    const container = document.getElementById('price-content-container');
    setTimeout(() => container.scrollTop = container.scrollHeight, 50);
}

window.deletePriceItem = function(index) {
    showAppConfirm("¿Eliminar este ítem de la lista?", () => {
        window.dynamicPrices.splice(index, 1);
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
    if(field === 'price' || field === 'tasa') window.dynamicPrices[index][field] = parseFloat(value) || 0;
    else window.dynamicPrices[index][field] = value;
}

window.handleCategoryChange = function(index, selectEl) {
    if(selectEl.value === '_new') {
        showAppPrompt("Nombre de la nueva categoría:", "", (newCat) => {
            if(newCat && newCat.trim()) {
                window.dynamicPrices[index].category = newCat.trim();
                activePriceTab = newCat.trim();
            }
            renderPriceModal();
        });
    } else {
        window.dynamicPrices[index].category = selectEl.value;
        renderPriceModal();
    }
}

window.savePrices = async function() {
    try {
        await db.collection('mangamar_settings').doc('pricing').set({ items: window.dynamicPrices });
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
    let categories = [...new Set(window.dynamicPrices.map(p => p.category))];
    if(!categories.includes(activePriceTab) && categories.length > 0) activePriceTab = categories[0];
    if(categories.length === 0) categories = ["General"];

    tabsContainer.innerHTML = categories.map(cat => `
        <button onclick="switchPriceTab('${cat}')" class="pb-3 px-3 text-sm font-black border-b-[3px] transition-all whitespace-nowrap ${activePriceTab === cat ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-400 hover:text-slate-600'}">${cat}</button>
    `).join('');

    if (isPriceEditMode) {
        editActions.classList.remove('hidden');
        editBtn.classList.add('hidden');
        
        let html = `<div class="space-y-3">`;
        window.dynamicPrices.forEach((item, index) => {
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
                <div class="flex w-full sm:w-auto gap-2 items-center">
                    <div class="relative flex items-center shrink-0" title="Precio Base">
                        <input type="number" value="${item.price}" onchange="updatePriceItem(${index}, 'price', this.value)" class="w-24 px-3 py-2 pl-7 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-800 focus:ring-2 focus:ring-orange-500 outline-none">
                        <span class="absolute left-3 text-slate-400 font-bold">€</span>
                    </div>
                    
                    ${activePriceTab === 'Inmersiones' ? `
                    <div class="relative flex items-center shrink-0" title="Tasa (Solo para Inmersiones)">
                        <input type="number" value="${item.tasa || 0}" onchange="updatePriceItem(${index}, 'tasa', this.value)" class="w-20 px-3 py-2 pl-7 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-amber-700 focus:ring-2 focus:ring-amber-500 outline-none">
                        <span class="absolute left-3 text-amber-300 font-bold text-[10px]">T</span>
                    </div>` : ''}

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
        window.dynamicPrices.filter(p => p.category === activePriceTab).forEach(item => {
            html += `
            <div class="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-orange-200 transition-all">
                <span class="font-bold text-slate-700 text-sm">${item.name}</span>
                <div class="flex items-center gap-2">
                    ${item.tasa ? `<span class="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">+ ${item.tasa}€ Tasa</span>` : ''}
                    <span class="font-black text-slate-800 bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg border border-orange-100">${item.price} €</span>
                </div>
            </div>
            `;
        });
        if(window.dynamicPrices.filter(p => p.category === activePriceTab).length === 0) {
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
        const temp = window.dynamicPrices[index];
        window.dynamicPrices[index] = window.dynamicPrices[targetIndex];
        window.dynamicPrices[targetIndex] = temp;
        renderPriceModal();
    }
}