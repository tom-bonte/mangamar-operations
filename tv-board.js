// ==========================================
// 13. MODERN TV DASHBOARD ENGINE (ROW-BASED + GROUPED)
// ==========================================

window.openTVView = function() {
    // Build content first
    window._buildTVContent();

    document.getElementById('tv-view-modal').classList.remove('hidden');

    // START TV CLOCK
    if (window.tvClockInterval) clearInterval(window.tvClockInterval);
    window.tvClockInterval = setInterval(() => {
        const clockEl = document.getElementById('tv-clock');
        if (!clockEl || document.getElementById('tv-view-modal').classList.contains('hidden')) {
            clearInterval(window.tvClockInterval);
            return;
        }
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);

    // LIVE ARRIVED REFRESH: Re-render the content grid every 8s to show checkmark changes
    if (window.tvArrivedRefreshInterval) clearInterval(window.tvArrivedRefreshInterval);
    window.tvArrivedRefreshInterval = setInterval(() => {
        if (document.getElementById('tv-view-modal').classList.contains('hidden')) {
            clearInterval(window.tvArrivedRefreshInterval);
            return;
        }
        // Rebuild content grid while preserving scroll position
        const container = document.getElementById('tv-content-grid');
        if (container) {
            const scrollTop = container.scrollTop;
            window._buildTVContent();
            container.scrollTop = scrollTop;
        }
    }, 8000);
}

// Core render function — builds the content grid from in-memory trip data
window._buildTVContent = function() {
    const container = document.getElementById('tv-content-grid');
    if (!container) return;

    container.innerHTML = '';

    const year  = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day   = String(currentDate.getDate()).padStart(2, '0');
    const targetDateStr = `${year}-${month}-${day}`;

    const todaysTrips = getMergedTrips(mergedAllocations.filter(t => t.date === targetDateStr));

    // Helper: count ONLY from groups (prevents double-counting Visor flat list + groups)
    const countGuests = trip => {
        const fromGroups = (trip.groups || []).reduce((sum, g) => sum + (g.guests || []).length, 0);
        return fromGroups > 0 ? fromGroups : (trip.guests || []).length;
    };

    // Helper: does this trip have any real content to show?
    const tripHasContent = trip => {
        if (!trip) return false;
        return (trip.groups || []).some(g => (g.guests || []).length > 0 || g.guide || g.apoyo);
    };

    // Build the ordered list of active time slots so we can find the "previous" one
    const activeSlots = TIMES.filter(time => {
        const a = todaysTrips.find(t => t.assignedBoat === 'ares'   && t.time === time);
        const k = todaysTrips.find(t => t.assignedBoat === 'kaiser' && t.time === time);
        return tripHasContent(a) || tripHasContent(k);
    });

    activeSlots.forEach((time, slotIdx) => {
        const aresTrip   = todaysTrips.find(t => t.assignedBoat === 'ares'   && t.time === time);
        const kaiserTrip = todaysTrips.find(t => t.assignedBoat === 'kaiser' && t.time === time);

        // CREATE A SNAP ROW WRAPPER
        // min-h-full ensures each row takes up at least the visible height of the bottom panel
        // snap-start tells the browser to align this row's top to the container's top
        const rowWrapper = document.createElement('div');
        rowWrapper.className = "grid grid-cols-[120px_1fr_1fr] gap-x-8 items-stretch min-h-full snap-start py-12 border-b border-slate-100 last:border-0 shrink-0";

        // Build a lookup: diver NAME (normalised) → previous boat label
        // (only relevant for slots after the first)
        const prevDivers = new Map(); // normalised name → 'Ares' | 'Kaiser'
        if (slotIdx > 0) {
            const prevTime = activeSlots[slotIdx - 1];
            ['ares', 'kaiser'].forEach(bId => {
                const prevTrip = todaysTrips.find(t => t.assignedBoat === bId && t.time === prevTime);
                if (prevTrip) {
                    (prevTrip.groups || []).forEach(g => {
                        (g.guests || []).forEach(guest => {
                            const key = (guest.nombre || '').trim().toUpperCase();
                            if (key) prevDivers.set(key, bId === 'ares' ? 'Ares' : 'Kaiser');
                        });
                    });
                }
            });
        }

        // ── A. Time Sidebar Label ──────────────────────────────────────
        const timeLabel = document.createElement('div');
        timeLabel.className = 'flex items-center justify-center self-stretch';
        timeLabel.innerHTML = `<span class="text-6xl font-black text-orange-500 tracking-tighter rotate-[-90deg] origin-center whitespace-nowrap drop-shadow-sm">${time}</span>`;
        rowWrapper.appendChild(timeLabel);

        // ── B. Ares + Kaiser ───────────────────────────────────────────
        ['ares', 'kaiser'].forEach(boatId => {
            const trip      = (boatId === 'ares') ? aresTrip : kaiserTrip;
            const hasContent = tripHasContent(trip);

            if (hasContent) {
                const siteColorFull = SITE_COLORS[trip.site] || 'bg-slate-100 text-slate-500 border border-slate-200';
                const siteColor = siteColorFull.replace('bg-slate-800 text-slate-300 border-slate-700', 'bg-slate-100 text-slate-500 border border-slate-200');
                const totalDivers = countGuests(trip);

                let groupsHtml = '';
                (trip.groups || []).forEach(group => {
                    const guideFirst = (group.guide || 'POR ASIGNAR').split(' ')[0];
                    const guideLabel = guideFirst.charAt(0).toUpperCase() + guideFirst.slice(1);
                    const supportFirst = (group.apoyo || '').split(' ')[0];
                    const supportLabel = supportFirst ? supportFirst.charAt(0).toUpperCase() + supportFirst.slice(1) : '';
                    const groupGuests = group.guests || [];

                    if (groupGuests.length > 0 || group.guide || group.apoyo) {
                        // Cluster guests by bookingTag so we can wrap them in subtle boxes
                        const clusters = [];
                        let currentCluster = null;
                        
                        groupGuests.forEach(g => {
                            const tag = g.bookingTag || 'NONE';
                            if (!currentCluster || currentCluster.tag !== tag) {
                                currentCluster = { tag: tag, guests: [] };
                                clusters.push(currentCluster);
                            }
                            currentCluster.guests.push(g);
                        });

                        groupsHtml += `
                        <div class="mb-5 last:mb-0">
                            <div class="flex items-center gap-2 mb-2 pb-1 border-b border-slate-200">
                                <svg class="w-5 h-5 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                                </svg>
                                <div class="flex items-baseline flex-wrap gap-x-1.5">
                                    <span class="text-2xl font-black text-orange-600 uppercase tracking-wider">${guideLabel}</span>
                                    ${supportLabel ? `<span class="text-orange-500 font-black text-2xl mx-1">+</span><span class="text-2xl font-black text-orange-600 uppercase tracking-wider">${supportLabel}</span><span class="text-2xl font-normal text-orange-600 uppercase tracking-wider ml-1">(Apoyo)</span>` : ''}
                                </div>
                            </div>
                            <div class="space-y-1">
                                ${clusters.map(cluster => {
                                    let wrapStart = '<div class="px-3 py-0.5">';
                                    let wrapEnd = '</div>';
                                    
                                    if (cluster.tag !== 'NONE' && typeof getGroupColorClass === 'function') {
                                        const hexColor = getGroupColorClass(cluster.tag);
                                        if (hexColor && hexColor !== '#ffffff') {
                                            const r = parseInt(hexColor.slice(1, 3), 16) || 0;
                                            const gHex = parseInt(hexColor.slice(3, 5), 16) || 0;
                                            const b = parseInt(hexColor.slice(5, 7), 16) || 0;
                                            wrapStart = `<div class="px-3 py-1.5 mb-1.5 rounded-2xl" style="background-color: rgba(${r},${gHex},${b},0.15); box-shadow: inset 0 0 0 1.5px rgba(${r},${gHex},${b},0.30);">`;
                                        }
                                    }

                                    const guestsHtml = cluster.guests.map(g => {
                                        const fullGas    = g.gas || '15L Aire';
                                        const isNx       = fullGas.includes('EAN');
                                        const displayGas = isNx 
                                            ? fullGas.replace(/EAN\s*(\d+)/i, '$1%') 
                                            : 'Aire';

                                        const nameKey    = (g.nombre || '').trim().toUpperCase();
                                        const prevBoat   = prevDivers.get(nameKey);
                                        const returnBadge = prevBoat
                                            ? `<span style="font-size:1.0rem;font-weight:900;color:#c2410c;background:#fff7ed;border:1.5px solid #fb923c;border-radius:8px;padding:2px 8px;margin-left:8px;white-space:nowrap">↩ ${prevBoat}</span>`
                                            : '';

                                        // Arrived checkmark badge
                                        const arrivedBadge = g.arrived
                                            ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;background:#10b981;border:2px solid #059669;margin-right:12px;flex-shrink:0;box-shadow:0 0 0 4px rgba(16,185,129,0.2)"><svg style="width:1.1rem;height:1.1rem" fill="none" stroke="white" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg></span>`
                                            : `<span style="display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;background:transparent;border:2px solid #e2e8f0;margin-right:12px;flex-shrink:0;"></span>`;

                                        return `
                                        <div class="flex justify-between items-center py-1">
                                            <div class="flex items-center min-w-0 pr-2">
                                                ${arrivedBadge}
                                                <span class="text-[22px] font-black text-slate-700 uppercase tracking-tight truncate">${g.nombre}</span>
                                                ${returnBadge}
                                            </div>
                                            <span class="tv-gas-badge ${isNx ? 'tv-gas-nitrox' : 'tv-gas-air'}" style="font-size:1.35rem;font-weight:900;padding:5px 14px;min-width:130px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;border-radius:12px">${displayGas}</span>
                                        </div>`;
                                    }).join('');

                                    return `${wrapStart}${guestsHtml}${wrapEnd}`;
                                }).join('')}
                            </div>
                        </div>`;
                    }
                });

                const cardHtml = `
                <div class="tv-card rounded-3xl overflow-hidden flex flex-col border border-orange-200 bg-orange-50 shadow-xl">
                    <div class="p-5 bg-orange-100/60 flex justify-between items-center border-b border-orange-200">
                        <div class="inline-block px-5 py-3 rounded-xl text-2xl font-black uppercase tracking-widest shadow-sm ${siteColor}">
                            ${trip.site || 'DESTINO POR CONFIRMAR'}
                        </div>
                        <div class="px-4 py-2 bg-white border border-blue-100 rounded-full shadow-sm">
                            <span class="text-blue-600 font-black text-lg uppercase">${totalDivers} BUZOS</span>
                        </div>
                    </div>
                    <div class="p-6 flex-1">
                        ${groupsHtml || '<div class="text-orange-300 text-base font-bold mt-2 text-center uppercase tracking-widest">Sin clientes asignados</div>'}
                    </div>
                </div>`;

                const cardDiv = document.createElement('div');
                cardDiv.innerHTML = cardHtml;
                rowWrapper.appendChild(cardDiv.firstElementChild);

            } else {
                // Empty / missing boat — minimal placeholder
                const emptySlot = document.createElement('div');
                emptySlot.className = 'rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center min-h-[80px] bg-slate-50/50';
                emptySlot.innerHTML = `<span class="text-slate-300 font-black text-xl uppercase tracking-widest">Sin Salida</span>`;
                rowWrapper.appendChild(emptySlot);
            }
        });

        container.appendChild(rowWrapper);
    });
}