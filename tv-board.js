// ==========================================
// 13. MODERN TV DASHBOARD ENGINE (ROW-BASED + GROUPED)
// ==========================================

window.openTVView = function() {
    const container = document.getElementById('tv-content-grid');
    const dateHeader = document.getElementById('tv-date-header');
    container.innerHTML = '';
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateHeader.innerText = currentDate.toLocaleDateString('es-ES', options).toUpperCase();

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const targetDateStr = `${year}-${month}-${day}`;

    const todaysTrips = getMergedTrips(mergedAllocations.filter(t => t.date === targetDateStr));

    TIMES.forEach(time => {
        // A. Time Sidebar Label
        const timeLabel = document.createElement('div');
        timeLabel.className = "flex items-center justify-center";
        timeLabel.innerHTML = `<span class="text-6xl font-black text-orange-500 tracking-tighter rotate-[-90deg] origin-center whitespace-nowrap drop-shadow-sm">${time}</span>`;
        container.appendChild(timeLabel);

        // B. Render Ares and Kaiser
        ['ares', 'kaiser'].forEach(boatId => {
            const trip = todaysTrips.find(t => t.assignedBoat === boatId && t.time === time);
            
            if (trip) {
                const siteColorFull = SITE_COLORS[trip.site] || 'bg-slate-100 text-slate-500 border border-slate-200';
                // Convert typical full dark mode definitions into strict light badges if needed, but since generic fallback is light, just use it
                const siteColor = siteColorFull.replace('bg-slate-800 text-slate-300 border-slate-700', 'bg-slate-100 text-slate-500 border border-slate-200');
                const totalDivers = trip.guests ? trip.guests.length : 0;
                
                let groupsHtml = '';
                // NEW: Iterate through groups to keep divers under their guide
                (trip.groups || []).forEach(group => {
                    const groupGuide = (group.guide || 'POR ASIGNAR').toUpperCase();
                    const groupGuests = group.guests || [];
                    
                    if (groupGuests.length > 0 || group.guide) {
                        groupsHtml += `
                        <div class="mb-4 last:mb-0">
                            <div class="flex items-center gap-2 mb-2 pb-1 border-b border-slate-100">
                                <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                <span class="text-sm font-black text-orange-600 uppercase tracking-widest">${groupGuide}</span>
                            </div>
                            <div class="space-y-1.5 pl-2">
                                ${groupGuests.map(g => {
                                    const fullGas = g.gas || '15L Aire';
                                    const isNx = fullGas.includes('EAN');
                                    return `
                                    <div class="flex justify-between items-center py-1">
                                        <span class="text-xl font-black text-slate-700 uppercase tracking-tight truncate pr-4">${g.nombre}</span>
                                        <span class="tv-gas-badge ${isNx ? 'tv-gas-nitrox' : 'tv-gas-air'}">${fullGas}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>`;
                    }
                });

                const cardHtml = `
                <div class="tv-card rounded-3xl overflow-hidden flex flex-col border border-orange-200 bg-orange-50 shadow-xl min-h-[300px]">
                    <div class="p-4 bg-orange-100/50 flex justify-between items-center border-b border-orange-200">
                        <div class="inline-block px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest shadow-sm ${siteColor}">
                            ${trip.site || 'DESTINO POR CONFIRMAR'}
                        </div>
                        <div class="px-3 py-1 bg-blue-50 border border-blue-100 rounded-full bg-white shadow-sm">
                            <span class="text-blue-600 font-black text-xs uppercase">${totalDivers} BUZOS</span>
                        </div>
                    </div>
                    
                    <div class="p-6 flex-1">
                        ${groupsHtml || '<div class="text-orange-300 text-sm font-bold mt-2 text-center uppercase tracking-widest">Sin clientes asignados</div>'}
                    </div>
                </div>`;
                
                const cardDiv = document.createElement('div');
                cardDiv.innerHTML = cardHtml;
                container.appendChild(cardDiv.firstElementChild);
            } else {
                const emptySlot = document.createElement('div');
                emptySlot.className = "rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center min-h-[300px] bg-slate-50/50";
                emptySlot.innerHTML = `<span class="text-slate-300 font-black text-xl uppercase tracking-widest">Sin Salida</span>`;
                container.appendChild(emptySlot);
            }
        });
    });

    document.getElementById('tv-view-modal').classList.remove('hidden');
}