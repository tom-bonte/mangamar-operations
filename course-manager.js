// --- COURSE / TITULACION ENGINE ---
window.activeTitTemp = { baseCourse: '', coursePrice: 0, isCustom: false };
let activeTitGroup = null;
let activeTitGuest = null;

window.switchTitTab = function(tabName) {
    ['Cursos', 'Especialidades', 'Snorkeling', 'Personalizado'].forEach(name => {
        const btn = document.getElementById(`tit-tab-${name}`);
        if (btn) {
            if (name === tabName) btn.className = 'pb-3 text-sm font-black text-pink-600 border-b-[3px] border-pink-600 transition-all whitespace-nowrap';
            else btn.className = 'pb-3 text-sm font-bold text-slate-500 border-b-[3px] border-transparent hover:text-slate-800 transition-all whitespace-nowrap';
        }
    });

    const listContainer = document.getElementById('tit-list-container');
    const customContainer = document.getElementById('tit-custom-container');

    if (tabName === 'Personalizado') {
        listContainer.classList.add('hidden');
        customContainer.classList.remove('hidden');
        activeTitTemp.isCustom = true;
        document.getElementById('tit-custom-name').value = activeTitTemp.baseCourse || '';
        document.getElementById('tit-custom-price').value = activeTitTemp.coursePrice || 0;
    } else {
        listContainer.classList.remove('hidden');
        customContainer.classList.add('hidden');
        activeTitTemp.isCustom = false;
        
        const items = typeof dynamicPrices !== 'undefined' ? dynamicPrices.filter(p => {
            if (!p.category) return false;
            const cat = p.category.toLowerCase().trim();
            if (tabName === 'Cursos') return cat.startsWith('curso');
            if (tabName === 'Especialidades') return cat.startsWith('especialidad');
            return cat === tabName.toLowerCase().trim();
        }) : [];
        listContainer.innerHTML = items.map(item => {
            const isSelected = activeTitTemp.baseCourse && item.name && activeTitTemp.baseCourse.trim().toLowerCase() === item.name.trim().toLowerCase();
            const baseClass = isSelected 
                ? "border-pink-500 bg-pink-50 ring-2 ring-pink-200" 
                : "border-slate-100 bg-white hover:border-pink-300 hover:bg-pink-50";
            const textClass = isSelected ? "text-pink-700" : "text-slate-700 group-hover:text-pink-700";
            const priceClass = isSelected ? "bg-pink-200 text-pink-800 border-pink-300" : "bg-slate-50 text-slate-500 group-hover:bg-pink-100 border-slate-100 group-hover:border-pink-200";
            
            return `
            <button onclick="selectTitCourse('${item.name.replace(/'/g, "\\'")}', ${item.price})" class="w-full flex justify-between items-center p-3 border rounded-xl transition-all group shadow-sm ${baseClass}">
                <span class="font-bold text-sm text-left leading-tight pr-4 ${textClass}">${item.name}</span>
                <span class="font-black text-xs px-3 py-1.5 rounded-lg border shrink-0 ${priceClass}">${item.price} €</span>
            </button>
            `;
        }).join('');
    }
    
    updateQuickButtonsHighlight();
};

window.updateQuickButtonsHighlight = function() {
    const quickMap = {
        'DSD': activeBoatItem.assignedBoat === 'shore' ? "DSD (Bautismo) desde Playa" : "DSD (Bautismo) desde Barco",
        'OWc': "Open Water Diver (OWC)",
        'AOWc': "Advanced Open Water (AOWC)",
        'Resc': "Rescate",
        'Snorkel': "Snorkeling"
    };
    ['DSD', 'OWc', 'AOWc', 'Resc', 'Snorkel'].forEach(id => {
        const btn = document.getElementById(`tit-quick-${id}`);
        if (btn) {
            if (activeTitTemp.baseCourse && quickMap[id] && activeTitTemp.baseCourse.trim().toLowerCase() === quickMap[id].trim().toLowerCase()) {
                if (id === 'Snorkel') {
                    btn.className = "py-2 bg-blue-500 text-white font-black text-sm rounded-xl transition-colors shadow-md";
                } else {
                    btn.className = "py-2 bg-pink-500 text-white font-black text-sm rounded-xl transition-colors shadow-md";
                }
            } else {
                if (id === 'Snorkel') {
                    btn.className = "py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-black text-sm rounded-xl transition-colors border border-blue-200 shadow-sm";
                } else {
                    btn.className = "py-2 bg-pink-50 text-pink-600 hover:bg-pink-100 font-black text-sm rounded-xl transition-colors border border-pink-200 shadow-sm";
                }
            }
        }
    });
};

window.selectTitCourse = function(name, price) {
    activeTitTemp.baseCourse = name;
    activeTitTemp.coursePrice = price;
    activeTitTemp.isCustom = false;
    
    const currentTab = document.querySelector('[id^="tit-tab-"].text-pink-600').id.replace('tit-tab-', '');
    switchTitTab(currentTab);
};

window.selectQuickCourse = function(type) {
    let mappedName = type;
    if (type === 'DSD') mappedName = activeBoatItem.assignedBoat === 'shore' ? "DSD (Bautismo) desde Playa" : "DSD (Bautismo) desde Barco";
    else if (type === 'OWc') mappedName = "Open Water Diver (OWC)";
    else if (type === 'AOWc') mappedName = "Advanced Open Water (AOWC)";
    else if (type === 'Resc') mappedName = "Rescate";
    else if (type === 'Snorkel') mappedName = "Snorkeling";

    const foundItem = typeof dynamicPrices !== 'undefined' ? dynamicPrices.find(p => p.name && p.name.trim().toLowerCase() === mappedName.trim().toLowerCase()) : null;
    let price = foundItem ? foundItem.price : 0;

    selectTitCourse(mappedName, price);
};

window.updateTempCustom = function() {
    activeTitTemp.baseCourse = document.getElementById('tit-custom-name').value.trim();
    activeTitTemp.coursePrice = parseFloat(document.getElementById('tit-custom-price').value) || 0;
    updateQuickButtonsHighlight();
};

window.openTitPopup = function(event, groupIndex, guestIndex) {
    activeTitGroup = groupIndex;
    activeTitGuest = guestIndex;
    const guest = activeBoatItem.groups[groupIndex].guests[guestIndex];
    
    activeTitTemp = {
        baseCourse: guest.baseCourse || '',
        coursePrice: guest.coursePrice || 0,
        isCustom: false
    };

    let existingDetail = '';
    if (guest.course && guest.course.includes(' | ')) {
        existingDetail = guest.course.split(' | ')[1];
    }
    document.getElementById('tit-course-detail').value = existingDetail;
    
    const popup = document.getElementById('tit-popup');
    popup.classList.remove('hidden');
    
    let tabToOpen = 'Cursos';
    if (activeTitTemp.baseCourse) {
        const found = typeof dynamicPrices !== 'undefined' ? dynamicPrices.find(p => p.name && p.name.trim().toLowerCase() === activeTitTemp.baseCourse.trim().toLowerCase()) : null;
        if (found) {
            const cat = found.category ? found.category.toLowerCase().trim() : '';
            if (cat.startsWith('especialidad')) tabToOpen = 'Especialidades';
            else if (cat === 'snorkeling') tabToOpen = 'Snorkeling';
            else if (cat.startsWith('curso')) tabToOpen = 'Cursos';
        } else if (activeTitTemp.baseCourse !== '') {
            tabToOpen = 'Personalizado';
        }
    }
    switchTitTab(tabToOpen); 
};

window.saveTitCourse = function() {
    const detail = document.getElementById('tit-course-detail').value.trim();
    if (!detail) {
        executeTitCourseSave(false);
        return;
    }

    if (activeTitGroup === null || activeTitGuest === null) return;
    
    // Find how many OTHER guests in the SAME group have a course
    let otherStudents = 0;
    if (activeBoatItem && activeBoatItem.groups[activeTitGroup] && activeBoatItem.groups[activeTitGroup].guests) {
        activeBoatItem.groups[activeTitGroup].guests.forEach((g, idx) => {
            if (idx !== activeTitGuest && g.baseCourse) {
                otherStudents++;
            }
        });
    }

    if (otherStudents > 0) {
        document.getElementById('tit-popup').classList.add('hidden');
        document.getElementById('tit-confirm-students-count').innerText = otherStudents;
        document.getElementById('tit-confirm-modal').classList.remove('hidden');
    } else {
        executeTitCourseSave(false);
    }
};

window.executeTitCourseSave = function(applyToAll = false) {
    if (activeTitGroup === null || activeTitGuest === null) return;
    const guest = activeBoatItem.groups[activeTitGroup].guests[activeTitGuest];
    
    if (activeTitTemp.isCustom) updateTempCustom(); 
    
    if (!activeTitTemp.baseCourse) {
        showAppAlert("Selecciona o escribe un curso primero.");
        return;
    }

    let detail = document.getElementById('tit-course-detail').value.trim();
    let baseName = activeTitTemp.baseCourse;
    
    let displayBadge = window.getAbbreviatedCourseName(baseName);

    const isStandard = detail && /\b\d+\s*(inmersi[oó]n|inmersiones|inm|dives|dive)s?\b/i.test(detail);

    guest.baseCourse = baseName;
    guest.course = detail ? `${baseName} | ${detail}` : baseName;
    guest.courseBadge = (detail && !isStandard) ? `${displayBadge} (${detail})` : displayBadge;
    guest.coursePrice = activeTitTemp.coursePrice;
    
    guest.rental = 'INC';
    guest.insurance = 'INC';
    guest.computer = 'INC';
    guest.computerPrice = 0;

    if (applyToAll && detail) {
        activeBoatItem.groups[activeTitGroup].guests.forEach((g, idx) => {
            if (idx !== activeTitGuest && g.baseCourse) {
                const theirBaseName = g.baseCourse;
                let theirDisplayBadge = window.getAbbreviatedCourseName(theirBaseName);

                g.course = `${theirBaseName} | ${detail}`;
                g.courseBadge = (detail && !isStandard) ? `${theirDisplayBadge} (${detail})` : theirDisplayBadge;
            }
        });
    }

    document.getElementById('tit-popup').classList.add('hidden');
    const confirmModal = document.getElementById('tit-confirm-modal');
    if (confirmModal) confirmModal.classList.add('hidden');
    
    renderGroups();
    triggerAutoSave();
};

window.clearTitCourse = function() {
    if (activeTitGroup === null || activeTitGuest === null) return;
    const guest = activeBoatItem.groups[activeTitGroup].guests[activeTitGuest];
    
    delete guest.course;
    delete guest.baseCourse;
    delete guest.courseBadge;
    delete guest.coursePrice;
    if (guest.rental === 'INC') guest.rental = 0;
    if (guest.insurance === 'INC') guest.insurance = 0;
    if (guest.computer === 'INC') {
        guest.computer = 0;
        guest.computerPrice = 0;
    }
    
    document.getElementById('tit-popup').classList.add('hidden');
    renderGroups();
    triggerAutoSave();
};
