/**
 * MANGAMAR OPERATIONS - PROJECT MANAGEMENT MODULE
 * Monday.com / Kanban style project and task management
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'mangamar_projects_cache';
    let projectsList = [];
    let currentView = 'table'; // 'table' or 'board'
    let currentFilter = {
        search: '',
        category: 'ALL',
        status: 'ALL',
        assignee: 'ALL',
        priority: 'ALL'
    };
    let activeEditingProjectId = null;

    // Categories and their color themes
    const CATEGORIES = [
        { id: 'Barcos', label: 'Barcos & Flota', color: 'border-l-sky-500 text-sky-700 bg-sky-50', badge: 'bg-sky-100 text-sky-800' },
        { id: 'Compresores', label: 'Compresores & Aire', color: 'border-l-indigo-500 text-indigo-700 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-800' },
        { id: 'Taller', label: 'Taller & Equipos', color: 'border-l-cyan-500 text-cyan-700 bg-cyan-50', badge: 'bg-cyan-100 text-cyan-800' },
        { id: 'Local', label: 'Local & Instalaciones', color: 'border-l-amber-500 text-amber-700 bg-amber-50', badge: 'bg-amber-100 text-amber-800' },
        { id: 'Tienda', label: 'Tienda & Stock', color: 'border-l-emerald-500 text-emerald-700 bg-emerald-50', badge: 'bg-emerald-100 text-emerald-800' },
        { id: 'Admin', label: 'Gestión & Admin', color: 'border-l-purple-500 text-purple-700 bg-purple-50', badge: 'bg-purple-100 text-purple-800' }
    ];

    // Status definitions (Monday.com style)
    const STATUSES = {
        'por_empezar': { label: 'Por Empezar', bg: 'bg-slate-400', text: 'text-white', lightBg: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-400' },
        'en_progreso': { label: 'En Progreso', bg: 'bg-blue-500', text: 'text-white', lightBg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
        'en_espera':   { label: 'En Espera', bg: 'bg-amber-500', text: 'text-white', lightBg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
        'completado':  { label: 'Completado', bg: 'bg-emerald-500', text: 'text-white', lightBg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' }
    };

    // Priority definitions
    const PRIORITIES = {
        'urgente': { label: 'Urgente', bg: 'bg-rose-500 text-white', lightBg: 'bg-rose-50 text-rose-700 border-rose-200', icon: '🔥' },
        'alta':    { label: 'Alta', bg: 'bg-orange-500 text-white', lightBg: 'bg-orange-50 text-orange-700 border-orange-200', icon: '⚡' },
        'media':   { label: 'Media', bg: 'bg-sky-500 text-white', lightBg: 'bg-sky-50 text-sky-700 border-sky-200', icon: '🔹' },
        'baja':    { label: 'Baja', bg: 'bg-slate-300 text-slate-700', lightBg: 'bg-slate-50 text-slate-600 border-slate-200', icon: '⚪' }
    };

    // Helper to get staff list
    function getAllStaffList() {
        if (typeof staffDatabase === 'undefined') return [];
        const caps = (staffDatabase.capitanes || []).map(s => ({ ...s, role: 'Capitán' }));
        const guias = (staffDatabase.guias || []).map(s => ({ ...s, role: 'Guía' }));
        const recep = (staffDatabase.recepcion || []).map(s => ({ ...s, role: 'Recepción' }));
        return [...caps, ...guias, ...recep].sort((a,b) => a.nombre.localeCompare(b.nombre));
    }

    function getStaffAvatarUrl(name) {
        if (!name) return '';
        const all = getAllStaffList();
        const found = all.find(s => s.nombre.toLowerCase().trim() === name.toLowerCase().trim());
        return found && found.foto ? found.foto : '';
    }

    // Initialize & Firestore Sync
    function initProjectsSync() {
        try {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                projectsList = JSON.parse(cached);
            }
        } catch (e) {
            console.warn("Error reading local projects cache:", e);
        }

        if (typeof db !== 'undefined' && db.collection) {
            db.collection("mangamar_projects").onSnapshot(snapshot => {
                const list = [];
                snapshot.forEach(doc => {
                    list.push({ id: doc.id, ...doc.data() });
                });
                
                // Sort by creation or updated date
                list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
                projectsList = list;
                
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(projectsList));
                } catch(e) {}

                // If currently visible, re-render
                const modal = document.getElementById('project-manager-modal');
                if (modal && !modal.classList.contains('hidden')) {
                    renderProjectsUI();
                }
            }, err => {
                console.error("Firestore projects sync error:", err);
            });
        }
    }

    // Save project to Firestore & Local
    async function saveProjectToStorage(proj) {
        if (!proj.id) proj.id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        proj.updatedAt = Date.now();
        if (!proj.createdAt) proj.createdAt = Date.now();

        // Update local memory
        const idx = projectsList.findIndex(p => p.id === proj.id);
        if (idx >= 0) projectsList[idx] = proj;
        else projectsList.unshift(proj);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(projectsList));
        } catch (e) {}

        if (typeof db !== 'undefined' && db.collection) {
            await db.collection("mangamar_projects").doc(proj.id).set(proj, { merge: true });
        }
        renderProjectsUI();
    }

    async function deleteProjectFromStorage(id) {
        projectsList = projectsList.filter(p => p.id !== id);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(projectsList));
        } catch(e) {}

        if (typeof db !== 'undefined' && db.collection) {
            await db.collection("mangamar_projects").doc(id).delete();
        }
        renderProjectsUI();
    }

    // Open & Close Main Project Manager Modal
    window.openProjectManagerModal = function() {
        const modal = document.getElementById('project-manager-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        renderProjectsUI();
    };

    window.closeProjectManagerModal = function() {
        const modal = document.getElementById('project-manager-modal');
        if (modal) modal.classList.add('hidden');
    };

    // Switch View (Table vs Board)
    window.switchProjectsView = function(view) {
        currentView = view;
        const btnTable = document.getElementById('btn-proj-view-table');
        const btnBoard = document.getElementById('btn-proj-view-board');

        if (btnTable && btnBoard) {
            if (view === 'table') {
                btnTable.className = 'px-3 py-1.5 rounded-lg text-xs font-black bg-white text-slate-800 shadow-xs border border-slate-200 flex items-center gap-1.5';
                btnBoard.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center gap-1.5 transition-colors';
            } else {
                btnBoard.className = 'px-3 py-1.5 rounded-lg text-xs font-black bg-white text-slate-800 shadow-xs border border-slate-200 flex items-center gap-1.5';
                btnTable.className = 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center gap-1.5 transition-colors';
            }
        }
        renderProjectsUI();
    };

    // Filter Handlers
    window.handleProjectsFilterChange = function() {
        currentFilter.search = (document.getElementById('proj-filter-search')?.value || '').toLowerCase().trim();
        currentFilter.category = document.getElementById('proj-filter-category')?.value || 'ALL';
        currentFilter.status = document.getElementById('proj-filter-status')?.value || 'ALL';
        currentFilter.assignee = document.getElementById('proj-filter-assignee')?.value || 'ALL';
        currentFilter.priority = document.getElementById('proj-filter-priority')?.value || 'ALL';
        renderProjectsUI();
    };

    function getFilteredProjects() {
        return projectsList.filter(p => {
            if (currentFilter.category !== 'ALL' && p.category !== currentFilter.category) return false;
            if (currentFilter.status !== 'ALL' && p.status !== currentFilter.status) return false;
            if (currentFilter.priority !== 'ALL' && p.priority !== currentFilter.priority) return false;
            if (currentFilter.assignee !== 'ALL') {
                const assigned = Array.isArray(p.assignedTo) ? p.assignedTo : [p.assignedTo];
                if (!assigned.includes(currentFilter.assignee)) return false;
            }
            if (currentFilter.search) {
                const text = `${p.title || ''} ${p.description || ''} ${(Array.isArray(p.assignedTo) ? p.assignedTo.join(' ') : p.assignedTo) || ''}`.toLowerCase();
                if (!text.includes(currentFilter.search)) return false;
            }
            return true;
        });
    }

    // Main Render Controller
    window.renderProjectsUI = function() {
        const container = document.getElementById('project-manager-content');
        if (!container) return;

        // Populate Assignee Filter Options if empty
        const selAssignee = document.getElementById('proj-filter-assignee');
        if (selAssignee && selAssignee.options.length <= 1) {
            const staffList = getAllStaffList();
            staffList.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.nombre;
                opt.textContent = s.nombre;
                selAssignee.appendChild(opt);
            });
        }

        // Summary Counters
        const totalCount = projectsList.length;
        const inProgressCount = projectsList.filter(p => p.status === 'en_progreso').length;
        const waitingCount = projectsList.filter(p => p.status === 'en_espera').length;
        const doneCount = projectsList.filter(p => p.status === 'completado').length;

        const elTotal = document.getElementById('proj-count-total');
        const elProgress = document.getElementById('proj-count-progress');
        const elWaiting = document.getElementById('proj-count-waiting');
        const elDone = document.getElementById('proj-count-done');
        if (elTotal) elTotal.textContent = totalCount;
        if (elProgress) elProgress.textContent = inProgressCount;
        if (elWaiting) elWaiting.textContent = waitingCount;
        if (elDone) elDone.textContent = doneCount;

        const filtered = getFilteredProjects();

        if (currentView === 'table') {
            container.innerHTML = renderTableView(filtered);
        } else {
            container.innerHTML = renderBoardView(filtered);
        }
    };

    // ==========================================
    // VIEW 1: MONDAY.COM STYLE INTERACTIVE TABLE
    // ==========================================
    function renderTableView(projects) {
        if (projects.length === 0 && projectsList.length === 0) {
            return `
                <div class="py-16 text-center">
                    <div class="w-16 h-16 bg-orange-100 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                    </div>
                    <h3 class="text-base font-black text-slate-800">No hay proyectos todavía</h3>
                    <p class="text-xs text-slate-500 mt-1">Crea tu primer proyecto o tarea para gestionar el mantenimiento y operaciones.</p>
                    <button onclick="window.openProjectEditModal()" class="mt-4 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black shadow-md transition-all">
                        + Nuevo Proyecto
                    </button>
                </div>
            `;
        }

        // Group by Category
        return CATEGORIES.map(cat => {
            const catProjects = projects.filter(p => (p.category || 'Taller') === cat.id);
            if (catProjects.length === 0 && currentFilter.category !== 'ALL' && currentFilter.category !== cat.id) {
                return '';
            }

            return `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
                    <!-- Group Header -->
                    <div class="p-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                        <div class="flex items-center gap-2.5">
                            <span class="w-3 h-3 rounded-full ${cat.color.split(' ')[0].replace('border-l-', 'bg-')}"></span>
                            <h4 class="text-xs font-black text-slate-800 tracking-tight uppercase">${cat.label}</h4>
                            <span class="text-[11px] font-black px-2 py-0.5 rounded-full ${cat.badge}">${catProjects.length}</span>
                        </div>
                    </div>

                    <!-- Table -->
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr class="border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider bg-white">
                                    <th class="py-2.5 px-4 min-w-[280px]">Elemento / Tarea</th>
                                    <th class="py-2.5 px-3 min-w-[140px] text-center">Responsable</th>
                                    <th class="py-2.5 px-3 min-w-[130px] text-center">Estado</th>
                                    <th class="py-2.5 px-3 min-w-[110px] text-center">Prioridad</th>
                                    <th class="py-2.5 px-3 min-w-[120px] text-center">Fecha Límite</th>
                                    <th class="py-2.5 px-3 min-w-[110px] text-center">Coste (€)</th>
                                    <th class="py-2.5 px-3 w-16 text-center"></th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${catProjects.map(p => renderTableRow(p)).join('')}
                                
                                <!-- Quick Inline Add Row -->
                                <tr class="bg-slate-50/40 hover:bg-slate-50 transition-colors">
                                    <td colspan="7" class="py-2 px-4">
                                        <div class="flex items-center gap-2">
                                            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                            <input type="text" 
                                                id="quick-add-input-${cat.id}"
                                                placeholder="+ Añadir nueva tarea a ${cat.label} (Presiona Enter)..." 
                                                onkeydown="if(event.key==='Enter') window.quickAddProject('${cat.id}', this.value); if(event.key==='Escape') this.value='';"
                                                class="w-full bg-transparent border-none text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-0">
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderTableRow(p) {
        const statusObj = STATUSES[p.status] || STATUSES['por_empezar'];
        const priorityObj = PRIORITIES[p.priority] || PRIORITIES['media'];
        const assignedName = Array.isArray(p.assignedTo) ? p.assignedTo[0] : p.assignedTo;
        const avatarUrl = getStaffAvatarUrl(assignedName);

        // Subtasks progress
        const subtasks = p.subtasks || [];
        const completedSubtasks = subtasks.filter(s => s.completed).length;
        const hasSubtasks = subtasks.length > 0;

        // Due date styling
        let dateDisplay = '—';
        let dateClass = 'text-slate-500';
        if (p.dueDate) {
            const todayStr = new Date().toISOString().substring(0, 10);
            if (p.dueDate < todayStr && p.status !== 'completado') {
                dateClass = 'text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200';
                dateDisplay = `⚠️ ${p.dueDate}`;
            } else if (p.dueDate === todayStr) {
                dateClass = 'text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200';
                dateDisplay = `Hoy`;
            } else {
                dateDisplay = p.dueDate;
            }
        }

        const costDisplay = (p.budgetActual || p.budgetEstimated) ? `${p.budgetActual || p.budgetEstimated} €` : '—';

        return `
            <tr class="hover:bg-slate-50/80 transition-colors group">
                <!-- Title & Subtasks -->
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                        <button onclick="window.toggleProjectComplete('${p.id}')" class="w-4 h-4 rounded border ${p.status === 'completado' ? 'bg-emerald-500 border-emerald-600 text-white' : 'border-slate-300 hover:border-emerald-500'} flex items-center justify-center transition-colors">
                            ${p.status === 'completado' ? '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : ''}
                        </button>
                        <span onclick="window.openProjectEditModal('${p.id}')" class="font-bold text-slate-800 hover:text-orange-600 cursor-pointer transition-colors ${p.status === 'completado' ? 'line-through text-slate-400' : ''}">
                            ${escapeHtml(p.title || 'Sin Título')}
                        </span>
                        ${hasSubtasks ? `
                            <span onclick="window.openProjectEditModal('${p.id}')" class="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer">
                                ☑️ ${completedSubtasks}/${subtasks.length}
                            </span>
                        ` : ''}
                    </div>
                </td>

                <!-- Assignee -->
                <td class="py-2 px-3 text-center">
                    <div class="inline-flex items-center justify-center">
                        ${assignedName ? `
                            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px]" title="${assignedName}">
                                ${avatarUrl ? `<img src="${avatarUrl}" class="w-4 h-4 rounded-full object-cover">` : `<div class="w-4 h-4 rounded-full bg-orange-200 text-orange-800 text-[9px] font-black flex items-center justify-center">${assignedName.charAt(0)}</div>`}
                                <span>${assignedName}</span>
                            </div>
                        ` : `
                            <button onclick="window.openProjectEditModal('${p.id}')" class="w-7 h-7 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-orange-400 hover:text-orange-500 flex items-center justify-center transition-colors" title="Asignar responsable">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                            </button>
                        `}
                    </div>
                </td>

                <!-- Status (Monday.com pill) -->
                <td class="py-2 px-3 text-center">
                    <button onclick="window.cycleProjectStatus('${p.id}')" class="w-full py-1.5 px-2 rounded-lg font-black text-xs ${statusObj.bg} ${statusObj.text} shadow-xs hover:opacity-90 transition-all cursor-pointer truncate" title="Haz clic para cambiar estado">
                        ${statusObj.label}
                    </button>
                </td>

                <!-- Priority -->
                <td class="py-2 px-3 text-center">
                    <button onclick="window.cycleProjectPriority('${p.id}')" class="w-full py-1.5 px-2 rounded-lg font-black text-xs ${priorityObj.bg} shadow-xs hover:opacity-90 transition-all cursor-pointer truncate" title="Haz clic para cambiar prioridad">
                        ${priorityObj.icon} ${priorityObj.label}
                    </button>
                </td>

                <!-- Due Date -->
                <td class="py-2 px-3 text-center">
                    <span class="text-xs font-semibold ${dateClass}">${dateDisplay}</span>
                </td>

                <!-- Cost -->
                <td class="py-2 px-3 text-center font-bold text-slate-700">
                    ${costDisplay}
                </td>

                <!-- Actions -->
                <td class="py-2 px-3 text-center">
                    <div class="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="window.openProjectEditModal('${p.id}')" class="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors" title="Editar">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                        <button onclick="window.confirmDeleteProject('${p.id}')" class="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors" title="Eliminar">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    // ==========================================
    // VIEW 2: KANBAN BOARD VIEW
    // ==========================================
    function renderBoardView(projects) {
        const columns = [
            { id: 'por_empezar', label: 'Por Empezar', color: 'border-slate-400 bg-slate-50', headerBg: 'bg-slate-200 text-slate-700' },
            { id: 'en_progreso', label: 'En Progreso', color: 'border-blue-500 bg-blue-50/40', headerBg: 'bg-blue-500 text-white' },
            { id: 'en_espera',   label: 'En Espera / Piezas', color: 'border-amber-500 bg-amber-50/40', headerBg: 'bg-amber-500 text-white' },
            { id: 'completado',  label: 'Completado', color: 'border-emerald-500 bg-emerald-50/40', headerBg: 'bg-emerald-500 text-white' }
        ];

        return `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                ${columns.map(col => {
                    const colProjects = projects.filter(p => (p.status || 'por_empezar') === col.id);
                    return `
                        <div class="bg-slate-100 rounded-2xl border border-slate-200 flex flex-col max-h-[75vh] overflow-hidden shadow-xs">
                            <!-- Column Header -->
                            <div class="p-3 ${col.headerBg} flex items-center justify-between font-black text-xs uppercase tracking-tight shrink-0 shadow-xs">
                                <span>${col.label}</span>
                                <span class="px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px]">${colProjects.length}</span>
                            </div>

                            <!-- Cards List -->
                            <div class="p-3 space-y-3 overflow-y-auto flex-1">
                                ${colProjects.map(p => renderKanbanCard(p)).join('')}
                                
                                ${colProjects.length === 0 ? `
                                    <div class="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400 font-bold">
                                        Sin tareas
                                    </div>
                                ` : ''}
                            </div>

                            <!-- Quick Add Button at Bottom of Column -->
                            <div class="p-2 border-t border-slate-200 bg-slate-50 shrink-0">
                                <button onclick="window.openProjectEditModal(null, { status: '${col.id}' })" class="w-full py-1.5 px-2 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 flex items-center justify-center gap-1 transition-colors">
                                    <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                    <span>Añadir tarea</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderKanbanCard(p) {
        const catObj = CATEGORIES.find(c => c.id === p.category) || CATEGORIES[2];
        const priorityObj = PRIORITIES[p.priority] || PRIORITIES['media'];
        const assignedName = Array.isArray(p.assignedTo) ? p.assignedTo[0] : p.assignedTo;
        const avatarUrl = getStaffAvatarUrl(assignedName);

        const subtasks = p.subtasks || [];
        const completedSubtasks = subtasks.filter(s => s.completed).length;

        return `
            <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-2.5 cursor-pointer" onclick="window.openProjectEditModal('${p.id}')">
                <!-- Header: Category & Priority -->
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${catObj.badge}">
                        ${catObj.label}
                    </span>
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${priorityObj.lightBg}">
                        ${priorityObj.icon} ${priorityObj.label}
                    </span>
                </div>

                <!-- Title -->
                <h5 class="text-xs font-black text-slate-800 leading-tight">
                    ${escapeHtml(p.title || 'Sin Título')}
                </h5>

                <!-- Description Snippet if present -->
                ${p.description ? `
                    <p class="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        ${escapeHtml(p.description)}
                    </p>
                ` : ''}

                <!-- Subtasks progress bar if any -->
                ${subtasks.length > 0 ? `
                    <div class="space-y-1">
                        <div class="flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span>Subtareas</span>
                            <span>${completedSubtasks}/${subtasks.length}</span>
                        </div>
                        <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: ${(completedSubtasks / subtasks.length) * 100}%"></div>
                        </div>
                    </div>
                ` : ''}

                <!-- Footer: Assignee, Due Date & Stage Shift -->
                <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <div class="flex items-center gap-1.5">
                        ${assignedName ? `
                            ${avatarUrl ? `<img src="${avatarUrl}" class="w-5 h-5 rounded-full object-cover" title="${assignedName}">` : `<div class="w-5 h-5 rounded-full bg-orange-200 text-orange-800 text-[10px] font-black flex items-center justify-center" title="${assignedName}">${assignedName.charAt(0)}</div>`}
                            <span class="text-slate-600 font-bold text-[10px]">${assignedName}</span>
                        ` : `
                            <span class="text-slate-400 italic text-[10px]">Sin asignar</span>
                        `}
                    </div>

                    ${p.dueDate ? `
                        <span class="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                            <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            ${p.dueDate.substring(5)}
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // ==========================================
    // QUICK INLINE ACTIONS & EDIT MODAL
    // ==========================================
    window.quickAddProject = function(categoryId, title) {
        if (!title || !title.trim()) return;
        const newProj = {
            title: title.trim(),
            category: categoryId,
            status: 'por_empezar',
            priority: 'media',
            assignedTo: '',
            dueDate: '',
            budgetEstimated: 0,
            budgetActual: 0,
            subtasks: [],
            description: ''
        };
        saveProjectToStorage(newProj);
    };

    window.toggleProjectComplete = function(id) {
        const p = projectsList.find(x => x.id === id);
        if (!p) return;
        p.status = p.status === 'completado' ? 'por_empezar' : 'completado';
        saveProjectToStorage(p);
    };

    window.cycleProjectStatus = function(id) {
        const p = projectsList.find(x => x.id === id);
        if (!p) return;
        const statusKeys = Object.keys(STATUSES);
        const currentIdx = statusKeys.indexOf(p.status || 'por_empezar');
        const nextIdx = (currentIdx + 1) % statusKeys.length;
        p.status = statusKeys[nextIdx];
        saveProjectToStorage(p);
    };

    window.cycleProjectPriority = function(id) {
        const p = projectsList.find(x => x.id === id);
        if (!p) return;
        const priorityKeys = Object.keys(PRIORITIES);
        const currentIdx = priorityKeys.indexOf(p.priority || 'media');
        const nextIdx = (currentIdx + 1) % priorityKeys.length;
        p.priority = priorityKeys[nextIdx];
        saveProjectToStorage(p);
    };

    window.confirmDeleteProject = function(id) {
        if (confirm("¿Estás seguro de que deseas eliminar este proyecto/tarea?")) {
            deleteProjectFromStorage(id);
        }
    };

    // Open Edit Detail Modal
    window.openProjectEditModal = function(id = null, defaults = {}) {
        activeEditingProjectId = id;
        const modal = document.getElementById('project-edit-modal');
        if (!modal) return;

        let p = id ? projectsList.find(x => x.id === id) : null;
        if (!p) {
            p = {
                id: '',
                title: defaults.title || '',
                category: defaults.category || 'Taller',
                status: defaults.status || 'por_empezar',
                priority: defaults.priority || 'media',
                assignedTo: defaults.assignedTo || '',
                dueDate: defaults.dueDate || '',
                budgetEstimated: defaults.budgetEstimated || '',
                budgetActual: defaults.budgetActual || '',
                description: defaults.description || '',
                subtasks: []
            };
        }

        document.getElementById('proj-edit-modal-title').textContent = id ? 'Editar Proyecto / Tarea' : 'Nuevo Proyecto';
        document.getElementById('proj-field-id').value = p.id || '';
        document.getElementById('proj-field-title').value = p.title || '';
        document.getElementById('proj-field-category').value = p.category || 'Taller';
        document.getElementById('proj-field-status').value = p.status || 'por_empezar';
        document.getElementById('proj-field-priority').value = p.priority || 'media';
        document.getElementById('proj-field-duedate').value = p.dueDate || '';
        document.getElementById('proj-field-budget-est').value = p.budgetEstimated || '';
        document.getElementById('proj-field-budget-act').value = p.budgetActual || '';
        document.getElementById('proj-field-desc').value = p.description || '';

        // Populate Assignee Select
        const selAssignee = document.getElementById('proj-field-assignee');
        if (selAssignee) {
            selAssignee.innerHTML = '<option value="">Sin Asignar</option>';
            getAllStaffList().forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.nombre;
                opt.textContent = `${s.nombre} (${s.role})`;
                if (s.nombre === p.assignedTo) opt.selected = true;
                selAssignee.appendChild(opt);
            });
        }

        // Render Subtasks list
        window.activeEditingSubtasks = Array.isArray(p.subtasks) ? JSON.parse(JSON.stringify(p.subtasks)) : [];
        renderSubtasksInModal();

        modal.classList.remove('hidden');
    };

    window.closeProjectEditModal = function() {
        const modal = document.getElementById('project-edit-modal');
        if (modal) modal.classList.add('hidden');
    };

    function renderSubtasksInModal() {
        const container = document.getElementById('proj-subtasks-container');
        if (!container) return;

        container.innerHTML = (window.activeEditingSubtasks || []).map((sub, idx) => `
            <div class="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <input type="checkbox" ${sub.completed ? 'checked' : ''} onchange="window.activeEditingSubtasks[${idx}].completed = this.checked; renderSubtasksInModal();" class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer">
                <span class="flex-1 text-xs font-bold ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}">${escapeHtml(sub.text)}</span>
                <button type="button" onclick="window.activeEditingSubtasks.splice(${idx}, 1); renderSubtasksInModal();" class="text-slate-400 hover:text-rose-600 p-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
        `).join('') || '<div class="text-xs text-slate-400 italic py-1">No hay subtareas añadidas.</div>';
    }

    window.addSubtaskFromInput = function() {
        const input = document.getElementById('proj-new-subtask-input');
        if (!input || !input.value.trim()) return;
        if (!window.activeEditingSubtasks) window.activeEditingSubtasks = [];
        window.activeEditingSubtasks.push({
            id: 'st_' + Date.now(),
            text: input.value.trim(),
            completed: false
        });
        input.value = '';
        renderSubtasksInModal();
    };

    window.saveProjectFromModal = async function(event) {
        if (event) event.preventDefault();

        const id = document.getElementById('proj-field-id').value;
        const title = document.getElementById('proj-field-title').value.trim();
        if (!title) {
            alert("Por favor ingresa un título para el proyecto.");
            return;
        }

        const projectData = {
            id: id || null,
            title: title,
            category: document.getElementById('proj-field-category').value,
            status: document.getElementById('proj-field-status').value,
            priority: document.getElementById('proj-field-priority').value,
            assignedTo: document.getElementById('proj-field-assignee').value,
            dueDate: document.getElementById('proj-field-duedate').value,
            budgetEstimated: parseFloat(document.getElementById('proj-field-budget-est').value) || 0,
            budgetActual: parseFloat(document.getElementById('proj-field-budget-act').value) || 0,
            description: document.getElementById('proj-field-desc').value.trim(),
            subtasks: window.activeEditingSubtasks || []
        };

        await saveProjectToStorage(projectData);
        closeProjectEditModal();
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // Auto boot sync
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProjectsSync);
    } else {
        initProjectsSync();
    }

})();
