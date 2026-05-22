// ==========================================
// 13. MODERN TV DASHBOARD ENGINE (ROW-BASED + GROUPED)
// ==========================================

window.openTVView = function() {
    // Build content first
    window._buildTVContent();

    document.getElementById('tv-view-modal').classList.remove('hidden');
    setTimeout(window.adjustCardScaling, 50);

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

    // Helper: find the immediate previous trip with content on the same day for a boat
    const getPreviousTripWithContent = (boatId, currentTime) => {
        const timeIdx = TIMES.indexOf(currentTime);
        if (timeIdx <= 0) return null;
        for (let i = timeIdx - 1; i >= 0; i--) {
            const prevTime = TIMES[i];
            const prevTrip = todaysTrips.find(t => t.assignedBoat === boatId && t.time === prevTime);
            if (tripHasContent(prevTrip)) {
                return prevTrip;
            }
        }
        return null;
    };

    // Helper: format time values to standard HH:MM
    const formatTimeToHHMM = (timeStr) => {
        if (!timeStr) return '';
        let normalized = timeStr.trim().replace(/[\.,\s]+/g, ':');
        if (!normalized.includes(':')) {
            if (normalized.length === 3) {
                normalized = '0' + normalized.substring(0, 1) + ':' + normalized.substring(1);
            } else if (normalized.length === 4) {
                normalized = normalized.substring(0, 2) + ':' + normalized.substring(2);
            }
        }
        const parts = normalized.split(':');
        if (parts.length >= 2) {
            let hr = parts[0].trim().padStart(2, '0');
            let min = parts[1].trim().padEnd(2, '0').substring(0, 2);
            if (/^\d+$/.test(hr) && /^\d+$/.test(min)) {
                return `${hr}:${min}`;
            }
        }
        return normalized;
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
                                        const isSnorkel = (g.baseCourse === "Snorkeling" || g.courseBadge === "Snorkel" || (g.baseCourse && g.baseCourse.toLowerCase().includes("snorkel")) || (g.course && g.course.toLowerCase().includes("snorkel")));
                                        const fullGas    = g.gas || '15L Aire';
                                        const isNx       = !isSnorkel && fullGas.includes('EAN');
                                        let displayGas   = 'Aire';
                                        let badgeClass   = 'tv-gas-air';

                                        if (isSnorkel) {
                                            displayGas = 'Snorkel';
                                            badgeClass = 'tv-gas-snorkel';
                                        } else if (isNx) {
                                            displayGas = fullGas.replace(/EAN\s*(\d+)/i, '$1%');
                                            badgeClass = 'tv-gas-nitrox';
                                        }

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
                                            <span class="tv-gas-badge ${badgeClass}" style="font-size:1.35rem;font-weight:900;padding:5px 14px;min-width:130px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;border-radius:12px">${displayGas}</span>
                                        </div>`;
                                    }).join('');

                                    return `${wrapStart}${guestsHtml}${wrapEnd}`;
                                }).join('')}
                            </div>
                        </div>`;
                    }
                });

                let prevTripHtml = '';
                const prevTrip = getPreviousTripWithContent(boatId, time);
                if (prevTrip && window.appSettings && window.appSettings.showTVRadioTimes !== false) {
                    const prevSiteColorFull = SITE_COLORS[prevTrip.site] || 'bg-slate-100 text-slate-500 border border-slate-200';
                    const prevSiteColor = prevSiteColorFull.replace('bg-slate-800 text-slate-300 border-slate-700', 'bg-slate-100 text-slate-500 border border-slate-200');
                    
                    prevTripHtml = `
                    <div class="p-6 bg-orange-100/25 border-t border-orange-200 flex flex-col gap-4 shrink-0">
                        <div class="flex items-center justify-between">
                            <span class="text-xl font-black text-orange-800 uppercase tracking-wider">SALIDA ANTERIOR (${prevTrip.time})</span>
                            <span class="px-4 py-2 rounded-xl text-lg font-black uppercase tracking-wider shadow-sm ${prevSiteColor}">
                                ${prevTrip.site || 'CONFIRMAR'}
                            </span>
                        </div>
                        <div class="grid grid-cols-3 gap-4 text-center">
                            <div class="flex flex-col items-center justify-center py-3 px-2 rounded-2xl border-2 transition-all duration-200 ${prevTrip.timeSaliendo ? 'bg-orange-500/10 border-orange-500/30 text-orange-700 font-black shadow-sm' : 'bg-slate-200/50 border-slate-300/40 text-slate-400 font-bold'}" title="Saliendo">
                                <span class="text-xs font-black uppercase tracking-wider mb-1.5 opacity-80">Saliendo</span>
                                <div class="flex items-center gap-1.5 text-2xl font-black leading-none">
                                    <span>🕒</span>
                                    <span>${formatTimeToHHMM(prevTrip.timeSaliendo) || '--:--'}</span>
                                </div>
                            </div>
                            <div class="flex flex-col items-center justify-center py-3 px-2 rounded-2xl border-2 transition-all duration-200 ${prevTrip.timeBuzosAgua ? 'bg-sky-500/10 border-sky-500/30 text-sky-700 font-black shadow-sm' : 'bg-slate-200/50 border-slate-300/40 text-slate-400 font-bold'}" title="Buzos en Agua">
                                <span class="text-xs font-black uppercase tracking-wider mb-1.5 opacity-80">En Agua</span>
                                <div class="flex items-center gap-1.5 text-2xl font-black leading-none">
                                    <span>🕒</span>
                                    <span>${formatTimeToHHMM(prevTrip.timeBuzosAgua) || '--:--'}</span>
                                </div>
                            </div>
                            <div class="flex flex-col items-center justify-center py-3 px-2 rounded-2xl border-2 transition-all duration-200 ${prevTrip.timeVolviendo ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 font-black shadow-sm' : 'bg-slate-200/50 border-slate-300/40 text-slate-400 font-bold'}" title="Volviendo a Puerto">
                                <span class="text-xs font-black uppercase tracking-wider mb-1.5 opacity-80">Regreso</span>
                                <div class="flex items-center gap-1.5 text-2xl font-black leading-none">
                                    <span>🕒</span>
                                    <span>${formatTimeToHHMM(prevTrip.timeVolviendo) || '--:--'}</span>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }

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
                    ${prevTripHtml}
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

    // Run scaling adjustment after DOM attachment
    setTimeout(window.adjustCardScaling, 0);
}

// Dynamic scaling for TV cards so they always fit perfectly in the viewport height
window.adjustCardScaling = function() {
    const scrollContainer = document.getElementById('tv-scroll-container');
    if (!scrollContainer) return;

    // Budget height: clientHeight of scrollContainer minus vertical padding (96px for py-12)
    const budget = scrollContainer.clientHeight - 96;
    if (budget <= 0) {
        // If not loaded/visible yet, retry shortly
        setTimeout(window.adjustCardScaling, 100);
        return;
    }

    const cards = document.querySelectorAll('.tv-card');
    cards.forEach(card => {
        // Reset zoom first to capture true natural height
        card.style.zoom = '1';
        
        // Measure natural scroll height
        const naturalHeight = card.scrollHeight;
        if (naturalHeight > budget) {
            // Calculate proportional scale factor, clamp to 0.5 minimum
            const zoomVal = Math.max(0.5, budget / naturalHeight);
            card.style.zoom = zoomVal.toFixed(3);
        }
    });
};

// Listen to window resizing to dynamically scale cards in real-time
window.addEventListener('resize', () => {
    const tvModal = document.getElementById('tv-view-modal');
    if (tvModal && !tvModal.classList.contains('hidden')) {
        window.adjustCardScaling();
    }
});