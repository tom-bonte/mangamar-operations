// ==========================================
// 4. STAFF MANAGEMENT
// ==========================================
window.staffSortConfig = { guias: 'name' };

window.sortStaff = function(type, criteria) {
    staffSortConfig[type] = criteria;
    
    if (type === 'guias') {
        const btnName = document.getElementById('sort-guias-name');
        const btnRole = document.getElementById('sort-guias-role');
        if (btnName && btnRole) {
            if (criteria === 'name') {
                btnName.className = "px-2 py-1 text-[9px] font-black rounded-sm bg-orange-100 text-orange-700 transition-colors shadow-sm";
                btnRole.className = "px-2 py-1 text-[9px] font-bold rounded-sm text-slate-500 hover:text-orange-600 transition-colors";
            } else {
                btnRole.className = "px-2 py-1 text-[9px] font-black rounded-sm bg-orange-100 text-orange-700 transition-colors shadow-sm";
                btnName.className = "px-2 py-1 text-[9px] font-bold rounded-sm text-slate-500 hover:text-orange-600 transition-colors";
            }
        }
    }
    renderStaffView();
};

function renderStaffView() {
    const capList = document.getElementById('staff-captains-list');
    const guideList = document.getElementById('staff-guides-list');
    if(!capList || !guideList) return;

    // Helper to extract nice initials from their name
    const getInitials = (name) => {
        const p = name.trim().split(' ');
        return p.length > 1 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
    };

    const buildRow = (person, type, index) => {
        const isCap = type === 'capitanes';
        const avatarColor = isCap ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600';
        const hoverBorder = isCap ? 'hover:border-blue-300' : 'hover:border-amber-300';
        
        return `
        <div class="group flex justify-between items-center p-3 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md ${hoverBorder} transition-all cursor-default relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-1 ${isCap ? 'bg-blue-500' : 'bg-amber-500'} opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            ${(() => {
                let roleBadge = '';
                if (!isCap && person.role) {
                    let badgeColor = 'bg-amber-100 text-amber-600 border border-amber-200';
                    if (person.role === 'Instructor') badgeColor = 'bg-emerald-100 text-emerald-600 border border-emerald-200';
                    if (person.role === 'Externo') badgeColor = 'bg-purple-100 text-purple-600 border border-purple-200';
                    roleBadge = `<span class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${badgeColor}">${person.role}</span>`;
                }
                return `
                <div class="flex items-center gap-3 pl-1">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${avatarColor} shadow-inner shrink-0">
                        ${getInitials(person.nombre)}
                    </div>
                    <div class="flex flex-col justify-center min-w-0">
                        <div class="flex items-center gap-2">
                            <div class="font-bold text-slate-800 text-sm leading-tight truncate">${person.nombre}</div>
                            <div class="text-[10px] text-slate-400 font-mono tracking-widest uppercase flex items-center gap-1 shrink-0">
                                <svg class="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"></path></svg>
                                ${person.dni}
                            </div>
                        </div>
                        ${roleBadge ? `<div class="mt-1 flex items-start">${roleBadge}</div>` : ''}
                    </div>
                </div>
                `;
            })()}
            
            <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white pl-2">
                <button onclick="openEditStaffModal('${type}', ${index})" class="w-8 h-8 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Editar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                <button onclick="removeStaff('${type}', ${index})" class="w-8 h-8 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Eliminar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            </div>
        </div>
        `;
    };

    // Sort Capitanes automatically by name
    const caps = [...(staffDatabase.capitanes || [])].sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    // Sort Guias by selected criteria
    const guides = [...(staffDatabase.guias || [])].sort((a, b) => {
        if (window.staffSortConfig && window.staffSortConfig.guias === 'role') {
            const roleA = a.role || 'Guía';
            const roleB = b.role || 'Guía';
            
            // Priority Weights: Instructor (1) -> Guía (2) -> Externo (3)
            const roleWeight = { 'Instructor': 1, 'Guía': 2, 'Externo': 3 };
            const weightA = roleWeight[roleA] || 4;
            const weightB = roleWeight[roleB] || 4;
            
            // If they have different roles, sort by role. If same role, fall through to Alphabetical
            if (weightA !== weightB) return weightA - weightB;
        }
        return a.nombre.localeCompare(b.nombre);
    });

    // IMPORTANT: We use indexOf() to ensure the Edit/Delete functions still point to the exact 
    // real object in the database, even though we shuffled the display array!
    capList.innerHTML = caps.map((p) => {
        const originalIdx = staffDatabase.capitanes.indexOf(p);
        return buildRow(p, 'capitanes', originalIdx);
    }).join('');
    
    guideList.innerHTML = guides.map((p) => {
        const originalIdx = staffDatabase.guias.indexOf(p);
        return buildRow(p, 'guias', originalIdx);
    }).join('');

    // Update the counters in the new UI headers
    const capCountEl = document.getElementById('count-capitanes');
    const guideCountEl = document.getElementById('count-guias');
    if(capCountEl) capCountEl.innerText = caps.length;
    if(guideCountEl) guideCountEl.innerText = guides.length;
}
async function addStaff(type) {
    const nameInput = document.getElementById(type === 'capitanes' ? 'new-cap-name' : 'new-guide-name');
    const dniInput = document.getElementById(type === 'capitanes' ? 'new-cap-dni' : 'new-guide-dni');
    if(!nameInput.value || !dniInput.value) { showAppAlert("Rellena nombre y DNI"); return; }
    if(!staffDatabase[type]) staffDatabase[type] = [];
    
    let newPerson = { nombre: nameInput.value.trim(), dni: dniInput.value.trim() };
    if (type === 'guias') {
        const roleInput = document.getElementById('new-guide-role');
        newPerson.role = roleInput ? roleInput.value : 'Guía';
    }
    
    staffDatabase[type].push(newPerson);
    nameInput.value = ''; dniInput.value = '';
    await db.collection(INTERNAL_DB).doc('staff').set(staffDatabase);
}
async function removeStaff(type, index) {
    showAppConfirm("¿Eliminar este miembro del staff?", async () => {
        staffDatabase[type].splice(index, 1);
        await db.collection(INTERNAL_DB).doc('staff').set(staffDatabase);
    });
}

// STAFF EDIT MODAL LOGIC
let editingStaffInfo = null;
function openEditStaffModal(type, index) {
    editingStaffInfo = { type, index };
    const person = staffDatabase[type][index];
    document.getElementById('edit-staff-name').value = person.nombre;
    document.getElementById('edit-staff-dni').value = person.dni;
    
    const roleContainer = document.getElementById('edit-staff-role-container');
    if (type === 'guias') {
        roleContainer.classList.remove('hidden');
        document.getElementById('edit-staff-role').value = person.role || 'Guía';
    } else {
        roleContainer.classList.add('hidden');
    }
    
    document.getElementById('edit-staff-modal').classList.remove('hidden');
}
async function saveStaffEdit() {
    if(!editingStaffInfo) return;
    const { type, index } = editingStaffInfo;
    const newName = document.getElementById('edit-staff-name').value.trim();
    const newDni = document.getElementById('edit-staff-dni').value.trim();
    if(!newName || !newDni) { showAppAlert("Rellena nombre y DNI"); return; }
    
    let updatedPerson = { nombre: newName, dni: newDni };
    if (type === 'guias') {
        updatedPerson.role = document.getElementById('edit-staff-role').value;
    }
    
    staffDatabase[type][index] = updatedPerson;
    await db.collection(INTERNAL_DB).doc('staff').set(staffDatabase);
    document.getElementById('edit-staff-modal').classList.add('hidden');
    renderStaffView(); showToast("Staff actualizado");
}