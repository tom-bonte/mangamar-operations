window.selectedGuestsForGroup = [];
// ==========================================
// 6. GROUP LINKING LOGIC (CROSS-BOAT)
// ==========================================

function getContrastYIQ(hexcolor){
    if(!hexcolor) return 'white';
    if (hexcolor.startsWith('bg-')) return 'white'; 
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c+c).join('');
    var r = parseInt(hexcolor.substr(0,2),16);
    var g = parseInt(hexcolor.substr(2,2),16);
    var b = parseInt(hexcolor.substr(4,2),16);
    var yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? '#0f172a' : '#ffffff';
}

const twToHex = {
    'bg-red-500 text-white': '#ef4444', 'bg-blue-500 text-white': '#3b82f6', 'bg-emerald-500 text-white': '#10b981',
    'bg-purple-500 text-white': '#a855f7', 'bg-pink-500 text-white': '#ec4899', 'bg-orange-500 text-white': '#f97316',
    'bg-teal-500 text-white': '#14b8a6', 'bg-indigo-500 text-white': '#6366f1', 'bg-fuchsia-500 text-white': '#d946ef',
    'bg-cyan-500 text-white': '#06b6d4', 'bg-yellow-400 text-slate-800': '#facc15', 'bg-slate-700 text-white': '#334155',
    'bg-white text-slate-800': '#ffffff'
};

// Converts a group name into a hex color
function getGroupColorClass(groupName) {
    let hex = null;
    if (window.globalGroups && groupName) {
        const currentDate = (window.activeBoatItem && window.activeBoatItem.date) ? window.activeBoatItem.date : '';
        const grp = (window.globalGroups || []).find(g => 
            g.name.toLowerCase() === groupName.toLowerCase() &&
            (!currentDate || (g.startDate && g.endDate && currentDate >= g.startDate && currentDate <= g.endDate))
        ) || (window.globalGroups || []).find(g => g.name.toLowerCase() === groupName.toLowerCase());
        if (grp && grp.color) hex = grp.color;
    }
    if (!hex) {
        const colors = ['#ef4444', '#3b82f6', '#10b981', '#a855f7', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#d946ef', '#06b6d4'];
        let hash = 0;
        const nameStr = groupName || 'anon';
        for (let i = 0; i < nameStr.length; i++) hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
        hex = colors[Math.abs(hash) % colors.length];
    }
    if (twToHex[hex]) hex = twToHex[hex]; 
    return hex;
}

// Track the currently selected manual group color (null = auto)
window._selectedGroupColor = null;

window.selectGroupColor = function(colorValue) {
    window._selectedGroupColor = colorValue;
    const picker = document.getElementById('group-color-picker');
    const preview = document.getElementById('group-color-preview');
    if (colorValue) {
        if(picker) picker.value = colorValue;
        if(preview) {
            preview.style.background = colorValue;
            preview.style.color = getContrastYIQ(colorValue);
            preview.innerText = 'Color Seleccionado';
        }
    } else {
        if(picker) picker.value = '#3b82f6';
        if(preview) {
            preview.style.background = '#f1f5f9'; 
            preview.style.color = '#94a3b8'; 
            preview.innerText = 'Automático';
        }
    }
};

function toggleGuestSelection(groupIndex, guestIndex) {
    if(!window.isLoggedIn) return;
    const idx = window.selectedGuestsForGroup.findIndex(s => s.groupIndex === groupIndex && s.guestIndex === guestIndex);
    if (idx > -1) window.selectedGuestsForGroup.splice(idx, 1);
    else window.selectedGuestsForGroup.push({groupIndex, guestIndex});
    renderGroups();
}

// Scans the whole day to see if a specific diver already belongs to a group on another boat
function findActiveTagForGuest(guestDni, guestName) {
    if(!guestDni && !guestName) return null;
    let foundTag = null;
    
    // A valid full name should contain at least two space-separated words
    const isFullName = (name) => {
        if (!name) return false;
        const parts = name.trim().split(/\s+/);
        return parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0;
    };
    
    const currentDate = (window.activeBoatItem && window.activeBoatItem.date) ? window.activeBoatItem.date : '';
    
    // 1. Check Global Groups over active date range
    if (currentDate && window.globalGroups && window.globalGroups.length > 0) {
        const activeGlobalGroup = window.globalGroups.find(g => {
            if (g.startDate && g.endDate && currentDate >= g.startDate && currentDate <= g.endDate) {
                if (guestDni && g.members && g.members.some(m => m && window.isSameDni(m, guestDni))) return true;
                if (guestName && isFullName(guestName) && g.members && g.members.some(m => m && typeof m === 'string' && m.toLowerCase() === guestName.toLowerCase())) return true;
            }
            return false;
        });
        if (activeGlobalGroup) return activeGlobalGroup.name;
    }
    
    // 2. Fallback: Check local trips for same day
    if (currentDate) {
        const todaysTrips = (window.mergedAllocations || []).filter(t => t.date === currentDate);
        todaysTrips.forEach(t => {
            if(t.guests) t.guests.forEach(g => {
                if (g.bookingTag) {
                    if (guestDni && g.dni && window.isSameDni(g.dni, guestDni)) foundTag = g.bookingTag;
                    else if (guestName && isFullName(guestName) && g.nombre && g.nombre.toLowerCase() === guestName.toLowerCase()) foundTag = g.bookingTag;
                }
            });
        });
    }
    return foundTag;
}

window.openGroupLinkModal = function(editGroupIdOrName = null, isNavBackForward = false, isBackgroundRefresh = false) {
    const modalEl = document.getElementById('group-link-modal');
    const isCurrentlyOpen = modalEl && !modalEl.classList.contains('hidden');

    if (!isCurrentlyOpen) {
        window._groupSearchQuery = '';
    }

    if (typeof window.recordModalHistory === 'function' && !isNavBackForward && !isCurrentlyOpen) {
        window.recordModalHistory({ type: 'group', args: [editGroupIdOrName], isNavBackForward: false });
    }

    let editGroupId = null;
    let editGroupName = null;
    let existingGlobal = null;

    if (editGroupIdOrName) {
        if (editGroupIdOrName.startsWith('grp_')) {
            editGroupId = editGroupIdOrName;
            existingGlobal = (window.globalGroups || []).find(g => g.id === editGroupId);
            if (existingGlobal) {
                editGroupName = existingGlobal.name;
            }
        } else {
            editGroupName = editGroupIdOrName;
            const currentDate = (window.activeBoatItem && window.activeBoatItem.date) ? window.activeBoatItem.date : '';
            existingGlobal = (window.globalGroups || []).find(g => 
                g.name.toLowerCase() === editGroupName.toLowerCase() &&
                (!currentDate || (g.startDate && g.endDate && currentDate >= g.startDate && currentDate <= g.endDate))
            ) || (window.globalGroups || []).find(g => g.name.toLowerCase() === editGroupName.toLowerCase());
            if (existingGlobal) {
                editGroupId = existingGlobal.id;
            }
        }
    }

    window._editingGroupId = editGroupId;
    window._editingGroupName = editGroupName;

    const nameInput = document.getElementById('group-name-input');
    if (nameInput && (!isBackgroundRefresh || document.activeElement !== nameInput)) {
        nameInput.value = editGroupName || '';
    }
    
    let defaultRange = activeBoatItem && activeBoatItem.date ? [activeBoatItem.date, activeBoatItem.date] : [];
    
    // Check if we are creating/assigning or just managing
    const isCreationMode = window.selectedGuestsForGroup.length > 0;
    
    const colorSection = document.getElementById('group-color-section');
    const creationBadge = document.getElementById('group-modal-creation-badge');
    const membersContainer = document.getElementById('group-members-container');
    const emptyText = document.getElementById('group-detail-empty-text');
    const creationOptions = document.getElementById('group-creation-options');
    const activeGroupsContainer = document.getElementById('active-groups-container');
    
    if (creationBadge) creationBadge.classList.toggle('hidden', !isCreationMode);
    if (creationOptions) creationOptions.classList.toggle('hidden', !isCreationMode);
    if (activeGroupsContainer) activeGroupsContainer.classList.toggle('hidden', isCreationMode);
    
    // Always show color section when looking at details/creation
    if (colorSection) colorSection.classList.remove('hidden');
    
    if (emptyText) {
        emptyText.innerText = isCreationMode 
            ? "Escribe el nombre del nuevo grupo o selecciona uno de la lista para asignar a los buceadores." 
            : "Selecciona un grupo para ver detalles, editar información o gestionar a sus miembros.";
    }

    // Helper: convert yyyy-mm-dd storage format to dd/mm/yyyy display format
    const toDisplayDate = (s) => {
        if (!s) return '';
        const p = s.split('-');
        if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
        return s;
    };

    if (existingGlobal && existingGlobal.startDate && existingGlobal.endDate) {
        defaultRange = [toDisplayDate(existingGlobal.startDate), toDisplayDate(existingGlobal.endDate)];
    } else {
        defaultRange = [toDisplayDate(activeBoatItem.date), toDisplayDate(activeBoatItem.date)];
    }

    if (!isBackgroundRefresh) {
        if (existingGlobal) {
            window.selectGroupColor(existingGlobal.color || null);
        } else {
            window.selectGroupColor(window._selectedGroupColor || null);
        }
    }
    
    // Only hide the members container if we are creating a brand new group that doesn't exist yet
    if (membersContainer) membersContainer.classList.toggle('hidden', isCreationMode && !existingGlobal);

    if (!isBackgroundRefresh || !window.groupFlatpickr) {
        if (window.groupFlatpickr) window.groupFlatpickr.destroy();
        window.groupFlatpickr = flatpickr("#group-date-range", {
            mode: "range",
            dateFormat: "d/m/Y",
            defaultDate: defaultRange,
            locale: {
                firstDayOfWeek: 1,
                rangeSeparator: " hasta ",
                weekdays: { shorthand: ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"], longhand: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] },
                months: { shorthand: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"], longhand: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"] }
            }
        });
    }


    // 1. Render Suggested Groups (Left Side)
    const activeGroups = (window.globalGroups || []).filter(g => {
        const currentDate = activeBoatItem.date;
        return currentDate >= g.startDate && currentDate <= g.endDate;
    });
    
    // Sort active groups by name
    activeGroups.sort((a, b) => a.name.localeCompare(b.name));
    
    const listHtml = activeGroups.map(groupObj => {
        const tag = groupObj.name;
        const bgColor = getGroupColorClass(tag);
        const textColor = getContrastYIQ(bgColor);
        const isSelected = window._editingGroupId 
            ? window._editingGroupId === groupObj.id 
            : (editGroupName && editGroupName.toLowerCase() === tag.toLowerCase());
        
        // Fetch group members names & DNIs for searching
        let memberNames = [];
        let memberDnis = [];
        (groupObj.members || []).forEach(mDni => {
            memberDnis.push(mDni);
            const cx = (customerDatabase || []).find(c => window.isSameDni(c.dni, mDni));
            if (cx) {
                const fullName = getFullName(cx);
                if (fullName) memberNames.push(fullName);
            }
            const isTemp = String(mDni).toLowerCase().startsWith('temp_');
            if (isTemp && groupObj.manualNames) {
                const matchedKey = Object.keys(groupObj.manualNames).find(k => k.toLowerCase() === String(mDni).toLowerCase());
                if (matchedKey) memberNames.push(groupObj.manualNames[matchedKey]);
            }
        });
        const dataGroupName = tag.replace(/"/g, '&quot;');
        const dataMemberNames = memberNames.join(' | ').replace(/"/g, '&quot;');
        const dataMemberDnis = memberDnis.join(' | ').replace(/"/g, '&quot;');

        return `<button onclick="window.openGroupLinkModal('${groupObj.id}')" data-search-group-name="${dataGroupName}" data-search-member-names="${dataMemberNames}" data-search-member-dnis="${dataMemberDnis}" class="group-list-item-btn w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center justify-between group ${isSelected ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-100 hover:border-slate-300 bg-white shadow-xs'}" style="border-left: 6px solid ${bgColor}">
            <div>
                <div class="text-sm font-black text-slate-800">${tag}</div>
                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Click para gestionar</div>
            </div>
            <svg class="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7"></path></svg>
        </button>`;
    }).join('') || '<div class="text-xs font-bold text-slate-400 italic p-4 text-center">No hay grupos activos para esta fecha</div>';
    
    const listEl = document.getElementById('active-groups-list');
    if (listEl) listEl.innerHTML = listHtml;
    
    const listCreationEl = document.getElementById('active-groups-list-creation');
    if (listCreationEl) listCreationEl.innerHTML = listHtml;

    // 2. Render Detail View (Right Side)
    const emptyState = document.getElementById('group-detail-empty');
    const contentState = document.getElementById('group-detail-content');
    const memberListEl = document.getElementById('group-members-list');
    const memberCountEl = document.getElementById('group-member-count');
    const addAllBtn = document.getElementById('add-all-group-btn');

    const targetIdx = (typeof window._activeSearchGroupIdx !== 'undefined') ? window._activeSearchGroupIdx : 0;
    const targetLabel = `Base ${targetIdx + 1}`;
    
    const indicator = document.getElementById('group-target-indicator');
    if (indicator) indicator.innerText = `Añadiendo a: Base ${targetIdx + 1}`;

    if (existingGlobal || isCreationMode) {
        emptyState.classList.add('hidden');
        contentState.classList.remove('hidden');
        
        if (existingGlobal) {
            memberCountEl.innerText = existingGlobal.members.length;
            
            addAllBtn.innerHTML = `Añadir Todo al Barco`;
            addAllBtn.onclick = () => window.addAllGroupToBoat(existingGlobal.id);

            memberListEl.innerHTML = (existingGlobal.members || []).map(mDni => {
                const cx = (customerDatabase || []).find(c => window.isSameDni(c.dni, mDni));
                const isTemp = String(mDni).toLowerCase().startsWith('temp_');
                let fullName = cx ? getFullName(cx) : null;
                if (!fullName && isTemp && existingGlobal.manualNames) {
                    const matchedKey = Object.keys(existingGlobal.manualNames).find(k => k.toLowerCase() === String(mDni).toLowerCase());
                    if (matchedKey) fullName = existingGlobal.manualNames[matchedKey];
                }
                if (!fullName) fullName = mDni;
                const subtitle = isTemp ? 'Buceador Manual' : mDni;
                
                const isOnBoat = activeBoatItem.groups.some(grp => grp.guests.some(gst => (gst.dni && window.isSameDni(gst.dni, mDni)) || (!gst.dni && gst.tempId && gst.tempId.toLowerCase() === String(mDni).toLowerCase()) || (!gst.dni && gst.nombre && gst.nombre.toLowerCase() === String(mDni).toLowerCase())));

                const safeFullName = (fullName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const safeGroupName = (existingGlobal.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const safeDni = (mDni || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                return `
                <div class="flex items-center justify-between bg-slate-50 hover:bg-white p-4 rounded-2xl border border-slate-100 transition-all group/item shadow-sm">
                    <div class="flex-1 min-w-0 pr-6">
                        <div class="text-base font-black text-slate-800 truncate">${fullName}</div>
                        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">${subtitle}</div>
                    </div>
                    <div class="flex items-center gap-3">
                        ${isOnBoat ? 
                            `<button onclick="window.removeDiverFromBoatByDni('${safeDni}')" class="px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700 hover:border-red-200 rounded-xl text-[10px] font-black uppercase shadow-sm border border-emerald-200 transition-all group/badge" title="Quitar del barco actual">
                                <span class="group-hover/badge:hidden">En Barco</span>
                                <span class="hidden group-hover/badge:inline">Quitar</span>
                             </button>` :
                            `<button onclick="window.addDiverToBoat('${safeDni}', '${safeGroupName}')" class="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg active:scale-95" title="Añadir al barco">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                             </button>`
                        }
                        <div class="w-px h-6 bg-slate-200 ml-1"></div>
                        <button onclick="window.promptRemoveGlobalGroupMember('${existingGlobal.id}', '${safeDni}', '${safeFullName}')" class="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Desvincular definitivamente del Grupo">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"></path></svg>
                        </button>
                    </div>
                </div>`;
            }).join('') || '<div class="text-xs font-bold text-slate-400 italic p-8 text-center">Este grupo no tiene miembros</div>';
        }
    } else {
        emptyState.classList.remove('hidden');
        contentState.classList.add('hidden');
    }
    
    // UI state updates based on if we are editing or creating
    const nameLabel = document.getElementById('group-name-label');
    if (nameLabel) {
        if (isCreationMode) {
            nameLabel.innerText = existingGlobal ? "Añadir a Grupo Existente" : "Nombre del Grupo Nuevo";
        } else {
            nameLabel.innerText = existingGlobal ? "Renombrar Grupo" : "Nombre del Grupo";
        }
    }
    
    const delBtn = document.getElementById('btn-delete-group-main');
    // Hide delete button in creation mode to prevent accidental deletion while assigning
    if (delBtn) delBtn.classList.toggle('hidden', !existingGlobal || isCreationMode);

    document.getElementById('group-link-modal').classList.remove('hidden');
    if (isNavBackForward) {
        if (typeof window.hideAllNavModals === 'function') window.hideAllNavModals('group-link-modal');
    }
    
    // Synchronize and apply search filter
    const activeQuery = window._groupSearchQuery || '';
    const searchInput = document.getElementById('group-search-input');
    const searchInputCreation = document.getElementById('group-search-input-creation');
    if (searchInput) searchInput.value = activeQuery;
    if (searchInputCreation) searchInputCreation.value = activeQuery;
    
    if (typeof window.filterGroupsList === 'function') {
        window.filterGroupsList(activeQuery);
    }
    
    if (!isBackgroundRefresh && !editGroupName) setTimeout(() => nameInput.focus(), 100);
}

// Scans today's manifests (and the current activeBoatItem) to find if this diver
// has course/deposit/insurance data set anywhere for today
function findExistingDiverData(dniOrName) {
    if (!dniOrName) return null;
    const searchVal = String(dniOrName).toLowerCase();

    // 1. Check the CURRENT active trip first (other bases on this same boat)
    for (const group of (activeBoatItem.groups || [])) {
        if (!group.guests) continue;
        const match = group.guests.find(g => {
            if (String(dniOrName).toLowerCase().startsWith('temp_')) return g.tempId && g.tempId.toLowerCase() === String(dniOrName).toLowerCase();
            return (g.dni && window.isSameDni(g.dni, dniOrName)) || (!g.dni && g.nombre && g.nombre.toLowerCase() === searchVal);
        });
        if (match) {
            const cleanCourse = match.baseCourse || (match.course ? match.course.split(' | ')[0].trim() : null);
            let displayBadge = match.courseBadge;
            
            // If we have a clean course, regenerate the short badge without comments
            if (cleanCourse) {
                displayBadge = window.getAbbreviatedCourseName(cleanCourse);
            }

            return {
                originalName: match.nombre,
                baseCourse: cleanCourse,
                course: cleanCourse,
                courseBadge: displayBadge,
                coursePrice: match.coursePrice || 0,
            localDeposit: match.localDeposit || 0,
            hasPaid: match.hasPaid || false,
            insurance: match.insurance || null,
            rental: match.rental || 0,
            gas: match.gas || '15L Aire',
            computer: match.computer || 0,
            computerPrice: match.computerPrice || 0,
            note: match.note || ''
            };
        }
    }
    // 2. Check other trips today (mergedAllocations)
    const today = activeBoatItem.date;
    const trips = mergedAllocations.filter(t => t.date === today);
    for (const trip of trips) {
        if (!trip.groups) continue;
        for (const group of trip.groups) {
            if (!group.guests) continue;
            const match = group.guests.find(g => {
                if (String(dniOrName).toLowerCase().startsWith('temp_')) return g.tempId && g.tempId.toLowerCase() === String(dniOrName).toLowerCase();
                return (g.dni && window.isSameDni(g.dni, dniOrName)) || (!g.dni && g.nombre && g.nombre.toLowerCase() === searchVal);
            });
            if (match) {
                const cleanCourse = match.baseCourse || (match.course ? match.course.split(' | ')[0].trim() : null);
                let displayBadge = match.courseBadge;
                
                // If we have a clean course, regenerate the short badge without comments
                if (cleanCourse) {
                    displayBadge = window.getAbbreviatedCourseName(cleanCourse);
                }

                return {
                    originalName: match.nombre,
                    baseCourse: cleanCourse,
                    course: cleanCourse,
                    courseBadge: displayBadge,
                    coursePrice: match.coursePrice || 0,
                localDeposit: match.localDeposit || 0,
                hasPaid: match.hasPaid || false,
                insurance: match.insurance || null,
                rental: match.rental || 0,
                gas: match.gas || '15L Aire',
                computer: match.computer || 0,
                computerPrice: match.computerPrice || 0,
                    note: match.note || ''
                };
            }
        }
    }

    // 3. Check if they have a pending certification globally
    if (window.globalPendingCerts) {
        // Try exact DNI match first (since globalPendingCerts keys are DNIs)
        let pendingCerts = window.globalPendingCerts.get(dniOrName);
        
        // If not found by DNI, try to find by name from customerDatabase
        if (!pendingCerts && typeof customerDatabase !== 'undefined') {
            const cx = customerDatabase.find(c => c.nombre && c.nombre.toLowerCase() === searchVal);
            if (cx && cx.dni) pendingCerts = window.globalPendingCerts.get(cx.dni);
        }

        if (pendingCerts && pendingCerts.length > 0) {
            const cleanCourse = pendingCerts[0];
            
            let displayBadge = window.getAbbreviatedCourseName(cleanCourse);

            return {
                originalName: null,
                baseCourse: cleanCourse,
                course: cleanCourse,
                courseBadge: displayBadge,
                coursePrice: (window.PRICES && window.PRICES[cleanCourse]) ? window.PRICES[cleanCourse] : 0,
                localDeposit: 0,
                hasPaid: false,
                insurance: 'INC',
                rental: 'INC',
                gas: '15L Aire',
                computer: 'INC',
                computerPrice: 0,
                note: ''
            };
        }
    }

    return null;
}

window.addDiverToBoat = function(identifier, groupTag, targetGroupIdx) {
    if (targetGroupIdx === undefined) {
        targetGroupIdx = (typeof window._activeSearchGroupIdx !== 'undefined') ? window._activeSearchGroupIdx : 0;
    }
    const strIdentifier = String(identifier);
    const searchVal = strIdentifier.toLowerCase();

    const alreadyOn = activeBoatItem.groups.some(grp => grp.guests.some(gst => 
        (gst.dni && window.isSameDni(gst.dni, strIdentifier)) || 
        (!gst.dni && gst.tempId && gst.tempId.toLowerCase() === searchVal) ||
        (!gst.dni && gst.nombre && gst.nombre.toLowerCase() === searchVal)
    ));
    if (alreadyOn) return;

    let cx = (customerDatabase || []).find(c => c.dni && window.isSameDni(c.dni, strIdentifier));
    if (!cx) cx = (customerDatabase || []).find(c => c.nombre && getFullName(c).toLowerCase() === searchVal);

    const existingData = findExistingDiverData(strIdentifier);
    let guest;

    if (cx) {
        const fullName = getFullName(cx);
        let localIns = 0;
        if (existingData && existingData.insurance !== undefined && existingData.insurance !== null) {
            localIns = existingData.insurance;
        } else if (cx.insurance) {
            const insObj = cx.insurance;
            const expiry = insObj.expiry ? window.normalizeDateStr(insObj.expiry) : '';
            const activeDate = activeBoatItem ? activeBoatItem.date : '';
            if (expiry && expiry >= activeDate) {
                localIns = insObj.type || 0;
            }
        }

        guest = {
            dni: cx.dni || '',
            nombre: fullName,
            telefono: cx.telefono || '',
            email: cx.email || '',
            insurance: localIns,
            titulacion: cx.titulacion || '',
            rental: existingData ? (existingData.rental || 0) : 0,
            gas: '15L Aire',
            computer: existingData ? (existingData.computer || 0) : 0,
            computerPrice: existingData ? (existingData.computerPrice || 0) : 0,
            isManual: false,
            hasPaid: existingData ? existingData.hasPaid : false,
            paymentStatus: 'pending',
            bookingTag: groupTag,
            date: activeBoatItem.date
        };
    } else {
        let properName = (existingData && existingData.originalName && !existingData.originalName.toLowerCase().startsWith('temp_')) ? existingData.originalName : null;
        if (!properName && strIdentifier.toLowerCase().startsWith('temp_') && groupTag) {
            const grp = (window.globalGroups || []).find(g => g.name.toLowerCase() === groupTag.toLowerCase() || g.id === groupTag);
            if (grp && grp.manualNames) {
                const matchedKey = Object.keys(grp.manualNames).find(k => k.toLowerCase() === strIdentifier.toLowerCase());
                if (matchedKey) {
                    properName = grp.manualNames[matchedKey];
                }
            }
        }
        if (!properName) {
            properName = strIdentifier.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        const tempId = strIdentifier.toLowerCase().startsWith('temp_') ? strIdentifier.toLowerCase() : ('temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
        
        let localIns = 0;
        if (existingData && existingData.insurance !== undefined && existingData.insurance !== null) {
            localIns = existingData.insurance;
        }

        guest = {
            dni: '',
            nombre: properName,
            telefono: '',
            email: '',
            insurance: localIns,
            titulacion: '',
            rental: existingData ? (existingData.rental || 0) : 0,
            gas: '15L Aire',
            computer: existingData ? (existingData.computer || 0) : 0,
            computerPrice: existingData ? (existingData.computerPrice || 0) : 0,
            isManual: true,
            tempId: tempId,
            hasPaid: existingData ? existingData.hasPaid : false,
            paymentStatus: 'pending',
            bookingTag: groupTag,
            date: activeBoatItem.date
        };
    }

    if (existingData && existingData.course) {
        guest.baseCourse = existingData.baseCourse || existingData.course;
        guest.course = existingData.course;
        guest.courseBadge = existingData.courseBadge;
        guest.coursePrice = existingData.coursePrice;
        guest.insurance = 'INC';
    }
    // NOTE: localDeposit is intentionally NOT copied — it is per-booking, not a per-day preference.
    if (existingData && existingData.note) guest.note = existingData.note;

    if (!activeBoatItem.groups[targetGroupIdx]) {
        while(activeBoatItem.groups.length <= targetGroupIdx) {
            activeBoatItem.groups.push({ guide: '', guests: [] });
        }
    }
    activeBoatItem.groups[targetGroupIdx].guests.push(guest);
    
    // Stretch the group's dates if needed!
    const grpObj = (window.globalGroups || []).find(g => g.name === groupTag);
    if (grpObj) {
        let groupNeedsSave = false;
        if (activeBoatItem.date < grpObj.startDate) { grpObj.startDate = activeBoatItem.date; groupNeedsSave = true; }
        if (activeBoatItem.date > grpObj.endDate) { grpObj.endDate = activeBoatItem.date; groupNeedsSave = true; }
        if (groupNeedsSave && window.saveGlobalGroup) window.saveGlobalGroup(grpObj);
    }
    
    triggerAutoSave();
    showToast(`✅ ${guest.nombre} añadido`);
    renderGroups();
    window.openGroupLinkModal(groupTag);
}

window.removeDiverFromBoatByDni = function(identifier) {
    if (!activeBoatItem) return;
    const strIdentifier = String(identifier).toLowerCase();
    
    for (let i = 0; i < activeBoatItem.groups.length; i++) {
        for (let j = 0; j < activeBoatItem.groups[i].guests.length; j++) {
            const gst = activeBoatItem.groups[i].guests[j];
            if ((gst.dni && window.isSameDni(gst.dni, identifier)) || 
                (!gst.dni && gst.tempId && gst.tempId.toLowerCase() === strIdentifier) ||
                (!gst.dni && gst.nombre && gst.nombre.toLowerCase() === strIdentifier)) {
                activeBoatItem.groups[i].guests.splice(j, 1);
                triggerAutoSave();
                if (typeof updateModalSubtitle === 'function') updateModalSubtitle();
                renderGroups();
                window.openGroupLinkModal(window._editingGroupId || window._editingGroupName);
                showToast("Buceador quitado del barco");
                return;
            }
        }
    }
}

window.addAllGroupToBoat = function(groupId, targetGroupIdx) {
    if (targetGroupIdx === undefined) {
        targetGroupIdx = (typeof window._activeSearchGroupIdx !== 'undefined') ? window._activeSearchGroupIdx : 0;
    }
    const grp = (window.globalGroups || []).find(g => g.id === groupId);
    if (!grp) return;
    
    let addedCount = 0;
    grp.members.forEach(memberId => {
        const strMemberId = String(memberId);
        const searchVal = strMemberId.toLowerCase();
        const alreadyOn = activeBoatItem.groups.some(g => g.guests.some(gst => (gst.dni && window.isSameDni(gst.dni, strMemberId)) || (!gst.dni && gst.nombre && gst.nombre.toLowerCase() === searchVal)));
        
        if (!alreadyOn) {
            let cx = customerDatabase.find(c => c.dni && window.isSameDni(c.dni, strMemberId));
            if (!cx) cx = customerDatabase.find(c => c.nombre && getFullName(c).toLowerCase() === searchVal);

            const existingData = findExistingDiverData(strMemberId);
            let guest;

            if (cx) {
                const fullName = getFullName(cx);
                let localIns = 0;
                if (existingData && existingData.insurance !== undefined && existingData.insurance !== null) {
                    localIns = existingData.insurance;
                } else if (cx.insurance) {
                    const insObj = cx.insurance;
                    const expiry = insObj.expiry ? window.normalizeDateStr(insObj.expiry) : '';
                    const activeDate = activeBoatItem ? activeBoatItem.date : '';
                    if (expiry && expiry >= activeDate) {
                        localIns = insObj.type || 0;
                    }
                }
                guest = {
                    dni: cx.dni || '',
                    nombre: fullName,
                    telefono: cx.telefono || '',
                    email: cx.email || '',
                    insurance: localIns,
                    titulacion: cx.titulacion || '',
                    rental: existingData ? (existingData.rental || 0) : 0,
                    gas: '15L Aire',
                    computer: existingData ? (existingData.computer || 0) : 0,
                    computerPrice: existingData ? (existingData.computerPrice || 0) : 0,
                    isManual: false,
                    hasPaid: existingData ? existingData.hasPaid : false,
                    paymentStatus: 'pending',
                    bookingTag: grp.name,
                    date: activeBoatItem.date
                };
            } else {
                const tempId = strMemberId.toLowerCase().startsWith('temp_') ? strMemberId.toLowerCase() : ('temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
                let properName = (existingData && existingData.originalName && !existingData.originalName.toLowerCase().startsWith('temp_')) ? existingData.originalName : null;
                if (!properName && strMemberId.toLowerCase().startsWith('temp_') && grp.manualNames) {
                    const matchedKey = Object.keys(grp.manualNames).find(k => k.toLowerCase() === strMemberId.toLowerCase());
                    if (matchedKey) {
                        properName = grp.manualNames[matchedKey];
                    }
                }
                if (!properName) {
                    properName = !strMemberId.toLowerCase().startsWith('temp_')
                        ? strMemberId.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                        : 'Buceador Manual';
                }
                let localIns = 0;
                if (existingData && existingData.insurance !== undefined && existingData.insurance !== null) {
                    localIns = existingData.insurance;
                }
                guest = {
                    dni: '',
                    nombre: properName,
                    telefono: '',
                    email: '',
                    insurance: localIns,
                    titulacion: '',
                    rental: existingData ? (existingData.rental || 0) : 0,
                    gas: '15L Aire',
                    computer: existingData ? (existingData.computer || 0) : 0,
                    computerPrice: existingData ? (existingData.computerPrice || 0) : 0,
                    isManual: true,
                    tempId: tempId,
                    hasPaid: existingData ? existingData.hasPaid : false,
                    paymentStatus: 'pending',
                    bookingTag: grp.name,
                    date: activeBoatItem.date
                };
            }

            if (existingData && existingData.course) {
                guest.baseCourse = existingData.baseCourse || existingData.course;
                guest.course = existingData.course;
                guest.courseBadge = existingData.courseBadge;
                guest.coursePrice = existingData.coursePrice;
                guest.insurance = 'INC';
            }
            // NOTE: localDeposit is intentionally NOT copied — it is per-booking, not a per-day preference.
            if (existingData && existingData.note) guest.note = existingData.note;

            if (!activeBoatItem.groups[targetGroupIdx]) {
                while(activeBoatItem.groups.length <= targetGroupIdx) {
                    activeBoatItem.groups.push({ guide: '', guests: [] });
                }
            }
            activeBoatItem.groups[targetGroupIdx].guests.push(guest);
            addedCount++;
        }
    });

    if (addedCount > 0) {
        // Automatically stretch the group's date range to encompass this new boat!
        let groupNeedsSave = false;
        if (activeBoatItem.date < grp.startDate) { grp.startDate = activeBoatItem.date; groupNeedsSave = true; }
        if (activeBoatItem.date > grp.endDate) { grp.endDate = activeBoatItem.date; groupNeedsSave = true; }
        if (groupNeedsSave && window.saveGlobalGroup) window.saveGlobalGroup(grp);

        triggerAutoSave();
        showToast(`✅ ${addedCount} buceadores añadidos`);
        renderGroups();
        window.openGroupLinkModal(grp.id);
    } else {
        showToast("ℹ️ Todos los miembros ya están en el barco");
    }
}

window.removeGlobalGroupMember = async function(groupId, memberId) {
    const grp = window.globalGroups.find(g => g.id === groupId);
    if (!grp) return;
    
    // Remove their bookingTag from the boat so they don't stay green!
    if (activeBoatItem && activeBoatItem.groups) {
        activeBoatItem.groups.forEach(g => {
            g.guests.forEach(gst => {
                if (gst.bookingTag && gst.bookingTag.toLowerCase() === grp.name.toLowerCase()) {
                    if ((gst.dni && window.isSameDni(gst.dni, memberId)) || (!gst.dni && gst.nombre && gst.nombre.toLowerCase() === String(memberId).toLowerCase())) {
                        delete gst.bookingTag;
                    }
                }
            });
        });
        triggerAutoSave();
    }
    
    grp.members = grp.members.filter(m => !window.isSameDni(m, memberId));
    
    if (grp.members.length === 0) {
        window.globalGroups = window.globalGroups.filter(g => g.id !== groupId);
        window.openGroupLinkModal(null, true); // reset modal to clean state since group is gone
        if (window.deleteGlobalGroup) window.deleteGlobalGroup(groupId).catch(console.error);
    } else {
        window.openGroupLinkModal(grp.name, true);
        if (window.saveGlobalGroup) window.saveGlobalGroup(grp).catch(console.error);
    }
}

window.promptRemoveGlobalGroupMember = function(groupId, memberId, memberName) {
    document.getElementById('group-remove-confirm-name').innerText = memberName;
    document.getElementById('group-remove-confirm-modal').classList.remove('hidden');
    document.getElementById('btn-confirm-group-remove').onclick = () => {
        document.getElementById('group-remove-confirm-modal').classList.add('hidden');
        window.removeGlobalGroupMember(groupId, memberId);
    };
};

async function confirmGroupLink(groupName) {
    const finalName = groupName ? groupName.trim() : '';
    
    if (!finalName) {
        if (typeof showAppAlert === 'function') showAppAlert("Por favor, introduce un Nombre del Grupo para continuar.");
        else alert("Por favor, introduce un Nombre del Grupo para continuar.");
        return;
    }
    
    // --- GLOBAL GROUP LOGIC ---
    const rangeStr = document.getElementById('group-date-range').value || '';
    let startDate = '';
    let endDate = '';
    
    // Helper: convert dd/mm/yyyy display format → yyyy-mm-dd storage format
    const toStorageDate = (s) => {
        if (!s) return '';
        // Already yyyy-mm-dd?
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // dd/mm/yyyy
        const p = s.split('/');
        if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
        return s;
    };

    if (rangeStr) {
        const dates = rangeStr.split(' hasta ');
        startDate = toStorageDate(dates[0] || '');
        endDate = toStorageDate(dates[1] || dates[0] || '');
    } else {
        startDate = activeBoatItem.date;
        endDate = activeBoatItem.date;
    }
    
    if (startDate && endDate) {
        let groupObj;
        
        if (window._editingGroupId) {
            groupObj = window.globalGroups.find(g => g.id === window._editingGroupId);
        } else if (window._editingGroupName) {
            groupObj = window.globalGroups.find(g => g.name.toLowerCase() === window._editingGroupName.toLowerCase());
        }
        
        if (groupObj) {
            // If they changed the name, update it and update activeBoatItem
            if (groupObj.name.toLowerCase() !== finalName.toLowerCase()) {
                activeBoatItem.groups.forEach(g => {
                    g.guests.forEach(gst => {
                        if (gst.bookingTag && gst.bookingTag.toLowerCase() === groupObj.name.toLowerCase()) {
                            gst.bookingTag = finalName;
                        }
                    });
                });
                groupObj.name = finalName;
            }
        }
        
        if (!groupObj) {
            // Only find an existing group with the same name if the dates overlap
            groupObj = window.globalGroups.find(g => 
                g.name.toLowerCase() === finalName.toLowerCase() &&
                (g.startDate && g.endDate && startDate <= g.endDate && endDate >= g.startDate)
            );
        }
        
        if (!groupObj) {
            groupObj = { id: 'grp_' + Date.now(), name: finalName, startDate: startDate, endDate: endDate, members: [] };
            if (window.globalGroups) window.globalGroups.push(groupObj);
        } else {
            if (window._editingGroupId && groupObj.id === window._editingGroupId) {
                // EXPLICIT EDIT MODE: Overwrite the dates with the exact selection from the picker
                groupObj.startDate = startDate;
                groupObj.endDate = endDate;
            } else {
                // ASSIGNMODE: Only expand dates, never shrink them accidentally
                if (startDate < groupObj.startDate) groupObj.startDate = startDate;
                if (endDate > groupObj.endDate) groupObj.endDate = endDate;
            }
        }
        
        // Save manually chosen color if set
        if (window._selectedGroupColor) {
            groupObj.color = window._selectedGroupColor;
        } else if (!groupObj.color) {
            delete groupObj.color; // keep auto if nothing selected
        }
        
        window.selectedGuestsForGroup.forEach(s => {
            const guest = activeBoatItem.groups[s.groupIndex].guests[s.guestIndex];
            if (guest.dni) {
                const normDni = window.normalizeDni(guest.dni);
                const hasDni = groupObj.members.some(m => window.isSameDni(m, normDni));
                if (!hasDni) {
                    groupObj.members.push(normDni);
                }
            } else if (!guest.dni) {
                const manualId = (guest.tempId ? guest.tempId.toLowerCase() : null) || (guest.nombre ? guest.nombre.toLowerCase() : null);
                if (manualId && !groupObj.members.includes(manualId)) {
                    groupObj.members.push(manualId);
                    if (guest.tempId && guest.nombre) {
                        groupObj.manualNames = groupObj.manualNames || {};
                        groupObj.manualNames[manualId] = guest.nombre;
                    }
                }
            }
        });
        
        if (window.saveGlobalGroup) window.saveGlobalGroup(groupObj);
        
        window.selectedGuestsForGroup.forEach(s => {
            activeBoatItem.groups[s.groupIndex].guests[s.guestIndex].bookingTag = finalName;
        });
        
        window.selectedGuestsForGroup = []; 
        renderGroups(); 
        triggerAutoSave();
        window.openGroupLinkModal(groupObj.id, true); // Keep the window open and reload it by ID
        if (typeof showToast === 'function') showToast("✅ Grupo guardado");
    }
}

window.unlinkSelected = async function() {
    let tagsToCheck = new Set();
    
    for (let s of window.selectedGuestsForGroup) {
        const guest = activeBoatItem.groups[s.groupIndex].guests[s.guestIndex];
        if (guest.bookingTag) {
            tagsToCheck.add(guest.bookingTag);
            const currentDate = activeBoatItem.date;
            const globalGroup = (window.globalGroups || []).find(g => 
                g.name.toLowerCase() === guest.bookingTag.toLowerCase() &&
                (!currentDate || (g.startDate && g.endDate && currentDate >= g.startDate && currentDate <= g.endDate))
            ) || (window.globalGroups || []).find(g => g.name.toLowerCase() === guest.bookingTag.toLowerCase());
            
            if (globalGroup && guest.dni) {
                globalGroup.members = globalGroup.members.filter(m => !window.isSameDni(m, guest.dni));
            }
        }
        delete guest.bookingTag;
    }

    for (let tagName of tagsToCheck) {
        const currentDate = activeBoatItem.date;
        const globalGroup = (window.globalGroups || []).find(g => 
            g.name.toLowerCase() === tagName.toLowerCase() &&
            (!currentDate || (g.startDate && g.endDate && currentDate >= g.startDate && currentDate <= g.endDate))
        ) || (window.globalGroups || []).find(g => g.name.toLowerCase() === tagName.toLowerCase());
        
        if (globalGroup) {
            if (globalGroup.members.length === 0) {
                if (window.deleteGlobalGroup) await window.deleteGlobalGroup(globalGroup.id);
            } else {
                if (window.saveGlobalGroup) await window.saveGlobalGroup(globalGroup);
            }
        }
    }

    window.selectedGuestsForGroup = []; // Clear selection
    const modal = document.getElementById('group-link-modal');
    if (modal) modal.classList.add('hidden');
    renderGroups();
    triggerAutoSave();
}

window.searchGroupCustomers = function(query) {
    if (typeof getGlobalDropdown !== 'function') return;
    const dropdown = getGlobalDropdown();
    const originalQuery = query.trim();
    const normQuery = window.normalizeSearchString(query);
    if (normQuery.length < 2) { dropdown.classList.add('hidden'); return; }

    const results = customerDatabase.filter(c => {
        const fullName = window.normalizeSearchString(getFullName(c));
        const apodoMatch = c.apodo && window.normalizeSearchString(c.apodo).includes(normQuery);
        return fullName.includes(normQuery) || apodoMatch || window.checkDniMatch(c.dni, normQuery);
    });

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="px-4 py-3 text-sm text-slate-500 italic">No encontrado.<br><span class="text-xs">Presiona <b>Enter</b> para añadir manualmente.</span></div>`;
        dropdown.classList.remove('hidden');
    } else {
        dropdown.innerHTML = results.map(c => {
            const fullName = getFullName(c);
            const encodedData = encodeURIComponent(JSON.stringify(c));
            return `<div class="px-4 py-3 bg-white hover:bg-blue-50 cursor-pointer text-sm font-bold text-slate-800 global-ac-item" onmousedown="window.selectGroupCustomer('${encodedData}')">${fullName}<div class="text-xs text-slate-500 font-medium">${c.titulacion || ''} • ${c.dni || ''}</div></div>`;
        }).join('');
        dropdown.classList.remove('hidden');
    }

    const inputEl = document.getElementById('group-add-member-input');
    const rect = inputEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + window.scrollY}px`;
    dropdown.style.left = `${rect.left + window.scrollX}px`;
    dropdown.style.width = `${rect.width}px`;
};

window.selectGroupCustomer = async function(encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const input = document.getElementById('group-add-member-input');
    if (input) input.value = getFullName(data);
    if (typeof getGlobalDropdown === 'function') getGlobalDropdown().classList.add('hidden');
    
    if (!window._editingGroupId && !window._editingGroupName) return;
    const grp = (window.globalGroups || []).find(g => g.id === window._editingGroupId) ||
                (window.globalGroups || []).find(g => g.name.toLowerCase() === (window._editingGroupName || '').toLowerCase());
    if (!grp) return;
    
    // Normalize DNI if present, otherwise fallback to name
    const matchedId = data.dni ? window.normalizeDni(data.dni) : data.nombre;
    
    const hasMember = grp.members.some(m => {
        if (data.dni) return window.isSameDni(m, data.dni);
        return m.toLowerCase() === matchedId.toLowerCase();
    });
    
    if (!hasMember) {
        grp.members.push(matchedId);
        if (window.saveGlobalGroup) await window.saveGlobalGroup(grp);
        
        // Sync to active boat manifest so color applies immediately
        if (typeof activeBoatItem !== 'undefined' && activeBoatItem && activeBoatItem.groups) {
            let updated = false;
            activeBoatItem.groups.forEach(g => {
                g.guests.forEach(gst => {
                    if ((gst.dni && window.isSameDni(gst.dni, matchedId)) || (!gst.dni && gst.nombre && gst.nombre.toLowerCase() === String(matchedId).toLowerCase())) {
                        gst.bookingTag = grp.name;
                        updated = true;
                    }
                });
            });
            if (updated) {
                if (typeof triggerAutoSave === 'function') triggerAutoSave();
                if (typeof renderGroups === 'function') renderGroups();
            }
        }

        if (input) input.value = '';
        window.openGroupLinkModal(grp.id);
    } else {
        if (typeof showToast === 'function') showToast("ℹ️ Ya está en el grupo");
    }
};

window.addMemberToGlobalGroup = async function() {
    if (!window._editingGroupId && !window._editingGroupName) return;
    const input = document.getElementById('group-add-member-input');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    
    const grp = (window.globalGroups || []).find(g => g.id === window._editingGroupId) ||
                (window.globalGroups || []).find(g => g.name.toLowerCase() === (window._editingGroupName || '').toLowerCase());
    if (!grp) return;
    
    let matchedId = val;
    const lowerVal = val.toLowerCase();
    
    const cxByDni = (window.customerDatabase || []).find(c => c.dni && window.isSameDni(c.dni, val));
    if (cxByDni) {
        matchedId = window.normalizeDni(cxByDni.dni);
    } else {
        const cxByName = (window.customerDatabase || []).find(c => c.nombre && c.nombre.toLowerCase() === lowerVal);
        if (cxByName) {
            matchedId = cxByName.dni ? window.normalizeDni(cxByName.dni) : cxByName.nombre;
        }
    }

    if (matchedId && !matchedId.toLowerCase().startsWith('temp_') && matchedId.match(/^[0-9xyzXYZ]/)) {
        matchedId = window.normalizeDni(matchedId);
    }
    
    const hasMember = grp.members.some(m => {
        return window.isSameDni(m, matchedId) || m.toLowerCase() === matchedId.toLowerCase();
    });
    
    if (!hasMember) {
        grp.members.push(matchedId);
        if (window.saveGlobalGroup) await window.saveGlobalGroup(grp);
        
        // Sync to active boat manifest so color applies immediately
        if (typeof activeBoatItem !== 'undefined' && activeBoatItem && activeBoatItem.groups) {
            let updated = false;
            activeBoatItem.groups.forEach(g => {
                g.guests.forEach(gst => {
                    if ((gst.dni && window.isSameDni(gst.dni, matchedId)) || (!gst.dni && gst.nombre && gst.nombre.toLowerCase() === String(matchedId).toLowerCase())) {
                        gst.bookingTag = grp.name;
                        updated = true;
                    }
                });
            });
            if (updated) {
                if (typeof triggerAutoSave === 'function') triggerAutoSave();
                if (typeof renderGroups === 'function') renderGroups();
            }
        }

        input.value = '';
        window.openGroupLinkModal(grp.id);
    } else {
        if (typeof showToast === 'function') showToast("ℹ️ Ya está en el grupo");
    }
}

window.openDeleteGroupModal = function() {
    if (!window._editingGroupId && !window._editingGroupName) return;
    const grp = (window.globalGroups || []).find(g => g.id === window._editingGroupId) ||
                (window.globalGroups || []).find(g => g.name.toLowerCase() === (window._editingGroupName || '').toLowerCase());
    if (!grp) return;
    
    const nameSpan = document.getElementById('delete-group-name');
    if (nameSpan) nameSpan.innerText = grp.name;
    
    const modal = document.getElementById('delete-group-modal');
    const content = document.getElementById('delete-group-modal-content');
    
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    });
}

window.executeDeleteGlobalGroup = async function() {
    if (!window._editingGroupId && !window._editingGroupName) return;
    const grp = (window.globalGroups || []).find(g => g.id === window._editingGroupId) ||
                (window.globalGroups || []).find(g => g.name.toLowerCase() === (window._editingGroupName || '').toLowerCase());
    if (!grp) return;
    
    // Disband: remove bookingTag from guests on the boat
    activeBoatItem.groups.forEach(g => {
        g.guests.forEach(gst => {
            if (gst.bookingTag && gst.bookingTag.toLowerCase() === grp.name.toLowerCase()) {
                delete gst.bookingTag;
            }
        });
    });
    
    const groupId = grp.id;
    // Optimistic UI updates
    window.globalGroups = window.globalGroups.filter(g => g.id !== groupId);
    
    const modal = document.getElementById('delete-group-modal');
    if (modal) modal.classList.add('hidden');
    
    window.openGroupLinkModal(null, true); // reset to empty state
    renderGroups();
    triggerAutoSave();
    if (typeof showToast === 'function') showToast("✅ Grupo eliminado");
    
    // Async network call
    if (window.deleteGlobalGroup) {
        window.deleteGlobalGroup(groupId).catch(console.error);
    }
}

window.filterGroupsList = function(query) {
    window._groupSearchQuery = query || '';
    const lowerQuery = window._groupSearchQuery.toLowerCase().trim();
    
    // Sync the two search bars
    const searchInput = document.getElementById('group-search-input');
    const searchInputCreation = document.getElementById('group-search-input-creation');
    if (searchInput && searchInput.value !== window._groupSearchQuery) {
        searchInput.value = window._groupSearchQuery;
    }
    if (searchInputCreation && searchInputCreation.value !== window._groupSearchQuery) {
        searchInputCreation.value = window._groupSearchQuery;
    }

    const buttons = document.querySelectorAll('.group-list-item-btn');
    buttons.forEach(btn => {
        if (!lowerQuery) {
            btn.classList.remove('hidden');
            return;
        }
        
        const grpName = (btn.dataset.searchGroupName || '').toLowerCase();
        const memNames = (btn.dataset.searchMemberNames || '').toLowerCase();
        const memDnis = (btn.dataset.searchMemberDnis || '').toLowerCase();
        
        const isMatch = grpName.includes(lowerQuery) || 
                        memNames.includes(lowerQuery) || 
                        memDnis.includes(lowerQuery);
                        
        if (isMatch) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });
};