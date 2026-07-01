/**
 * @file contacts-manager.js
 * @description Controller for the admin-only Important Contacts (Contactos Importantes) feature.
 */

window.contactsDatabase = [];
window.contactsSearchQuery = '';
window.contactsCategoryFilter = '';
window.contactsSortBy = 'name_asc';
window.contactsUnsubscribe = null;
window.activeContactNoteId = null;

// Initialize Firestore Listener for Contacts
window.initContactsListener = function() {
    if (window.contactsUnsubscribe) {
        window.contactsUnsubscribe();
    }

    // Unsubscribe if user logs out or is staff
    if (window.isStaffLoggedIn) {
        window.contactsDatabase = [];
        return;
    }

    window.contactsUnsubscribe = db.collection('mangamar_contacts').onSnapshot((snapshot) => {
        const contacts = [];
        snapshot.forEach((doc) => {
            contacts.push({ id: doc.id, ...doc.data() });
        });

        // Sort alphabetically by name by default
        contacts.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        window.contactsDatabase = contacts;

        // Redraw list if open
        const modal = document.getElementById('contacts-modal');
        if (modal && !modal.classList.contains('hidden')) {
            window.renderContactsList();
        }
    }, (err) => {
        console.error("Error subscribing to contacts:", err);
    });
};

// Open the Contacts modal
window.openContactsModal = function() {
    if (window.isStaffLoggedIn) {
        showToast("Acceso denegado: Solo administradores.");
        return;
    }

    // Subscribe if not already subscribed
    if (!window.contactsUnsubscribe) {
        window.initContactsListener();
    }

    document.getElementById('contacts-modal').classList.remove('hidden');
    window.contactsSearchQuery = '';
    window.contactsCategoryFilter = '';
    document.getElementById('contacts-search-input').value = '';
    document.getElementById('contacts-category-select').value = '';

    window.renderContactsList();
};

// Close Contacts modal
window.closeContactsModal = function() {
    document.getElementById('contacts-modal').classList.add('hidden');
};

// Renders the list in the contacts table body
window.renderContactsList = function() {
    const tableBody = document.getElementById('contacts-table-body');
    if (!tableBody) return;

    let filtered = [...window.contactsDatabase];

    // Sorting
    filtered.sort((a, b) => {
        if (window.contactsSortBy === 'name_asc') {
            return (a.nombre || '').localeCompare(b.nombre || '');
        } else if (window.contactsSortBy === 'name_desc') {
            return (b.nombre || '').localeCompare(a.nombre || '');
        } else if (window.contactsSortBy === 'date_desc') {
            const dateA = a.dateAdded || '';
            const dateB = b.dateAdded || '';
            return dateB.localeCompare(dateA);
        } else if (window.contactsSortBy === 'date_asc') {
            const dateA = a.dateAdded || '';
            const dateB = b.dateAdded || '';
            return dateA.localeCompare(dateB);
        }
        return 0;
    });

    // Search query filter
    if (window.contactsSearchQuery) {
        const q = window.normalizeSearchString(window.contactsSearchQuery);
        filtered = filtered.filter(c => 
            window.normalizeSearchString(c.nombre || '').includes(q) ||
            window.normalizeSearchString(c.telefono || '').includes(q) ||
            window.normalizeSearchString(c.email || '').includes(q) ||
            window.normalizeSearchString(c.nota || '').includes(q)
        );
    }

    // Category filter
    if (window.contactsCategoryFilter) {
        filtered = filtered.filter(c => c.categoria === window.contactsCategoryFilter);
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="p-8 text-center text-slate-400 font-bold italic text-sm bg-white">
                    No se encontraron contactos importantes.
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = filtered.map(c => {
        const catLabel = c.categoria || 'Sin Categoría';
        let catBadgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
        if (c.categoria === 'Mecánicos') {
            catBadgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
        } else if (c.categoria === 'Puerto Cabo de Palos') {
            catBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        } else if (c.categoria === 'Capitanía') {
            catBadgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
        }

        // Format Date
        let dateStr = c.dateAdded || '---';
        if (dateStr && dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-');
            const months = ['Ene', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            dateStr = `${parseInt(d)}/${months[parseInt(m) - 1]}/${y}`;
        }

        // Format Phone (Always without spaces)
        const cleanPhone = (c.telefono || '').replace(/\s+/g, '');

        // Note cell rendering
        let noteHtml = '';
        if (c.nota && c.nota.trim()) {
            noteHtml = `
                <div class="relative group/note inline-block hover:z-[100]">
                    <button onclick="window.openContactNoteOnlyModal('${c.id}')" class="text-amber-500 hover:text-amber-700 transition-colors">
                        <svg class="w-4 h-4 inline" fill="currentColor" viewBox="0 0 24 24"><path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
                    </button>
                    <div class="absolute top-full right-0 mt-1.5 w-max max-w-[220px] bg-orange-500 text-white text-[10px] font-black rounded-lg px-2.5 py-1.5 shadow-lg opacity-0 group-hover/note:opacity-100 transition-opacity pointer-events-none z-[100] whitespace-pre-wrap break-words border border-orange-600">${c.nota}</div>
                </div>
            `;
        } else {
            noteHtml = `
                <button onclick="window.openContactNoteOnlyModal('${c.id}')" title="Añadir nota" class="text-slate-300 hover:text-amber-500 transition-colors">
                    <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
                </button>
            `;
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 bg-white">
                <td class="px-4 py-3 text-xs">
                    <span class="px-2 py-0.5 border rounded-md font-extrabold uppercase tracking-wide text-[9px] ${catBadgeColor}">
                        ${catLabel}
                    </span>
                </td>
                <td class="px-4 py-3 text-sm font-black text-slate-800 cursor-pointer hover:text-blue-600 transition-colors" onclick="window.copyData('${c.nombre.replace(/'/g, "\\'")}', 'Nombre')">
                    ${c.nombre}
                </td>
                <td class="px-4 py-3 text-xs font-bold text-slate-600 font-mono cursor-pointer hover:text-blue-600 transition-colors" onclick="window.copyData('${cleanPhone}', 'Teléfono')">
                    ${cleanPhone || '---'}
                </td>
                <td class="px-4 py-3 text-xs font-bold text-slate-600 font-mono cursor-pointer hover:text-blue-600 transition-colors" onclick="window.copyData('${c.email || ''}', 'Email')">
                    ${c.email || '---'}
                </td>
                <td class="px-4 py-3 text-xs font-bold text-slate-400 font-mono">
                    ${dateStr}
                </td>
                <td class="px-4 py-3 text-center">
                    ${noteHtml}
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex gap-2 justify-center">
                        <button onclick="window.openContactWizard('${c.id}')" class="text-blue-500 hover:text-blue-700 transition-colors cursor-pointer" title="Editar Contacto">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button onclick="window.deleteContact('${c.id}', '${c.nombre.replace(/'/g, "\\'")}')" class="text-red-500 hover:text-red-700 transition-colors cursor-pointer" title="Eliminar Contacto">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

// Open the Add/Edit wizard
window.openContactWizard = function(contactId = null) {
    const modal = document.getElementById('contact-wizard-modal');
    if (!modal) return;

    // Reset fields
    document.getElementById('wizard-contact-id').value = contactId || '';
    document.getElementById('wizard-contact-nombre').value = '';
    document.getElementById('wizard-contact-telefono').value = '';
    document.getElementById('wizard-contact-email').value = '';
    document.getElementById('wizard-contact-categoria').value = 'Mecánicos';
    document.getElementById('wizard-contact-nota').value = '';
    document.getElementById('wizard-contact-date-added').value = new Date().toISOString().split('T')[0];

    document.getElementById('wizard-title').textContent = contactId ? 'Editar Contacto' : 'Nuevo Contacto';

    if (contactId) {
        const contact = window.contactsDatabase.find(c => c.id === contactId);
        if (contact) {
            document.getElementById('wizard-contact-nombre').value = contact.nombre || '';
            document.getElementById('wizard-contact-telefono').value = contact.telefono || '';
            document.getElementById('wizard-contact-email').value = contact.email || '';
            document.getElementById('wizard-contact-categoria').value = contact.categoria || 'Mecánicos';
            document.getElementById('wizard-contact-nota').value = contact.nota || '';
            document.getElementById('wizard-contact-date-added').value = contact.dateAdded || new Date().toISOString().split('T')[0];
        }
    }

    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('wizard-contact-nombre').focus(), 100);
};

window.closeContactWizard = function() {
    document.getElementById('contact-wizard-modal').classList.add('hidden');
};

// Save Contact
window.saveContact = async function() {
    const id = document.getElementById('wizard-contact-id').value;
    const nombre = document.getElementById('wizard-contact-nombre').value.trim();
    const telefono = document.getElementById('wizard-contact-telefono').value.trim();
    const email = document.getElementById('wizard-contact-email').value.trim();
    const categoria = document.getElementById('wizard-contact-categoria').value;
    const nota = document.getElementById('wizard-contact-nota').value.trim();
    const dateAdded = document.getElementById('wizard-contact-date-added').value;

    if (!nombre) {
        showAppAlert("El nombre es obligatorio.");
        return;
    }

    const payload = {
        nombre,
        telefono,
        email,
        categoria,
        nota,
        dateAdded
    };

    try {
        if (id) {
            await db.collection('mangamar_contacts').doc(id).set(payload, { merge: true });
            showToast("Contacto actualizado con éxito.");
        } else {
            await db.collection('mangamar_contacts').add(payload);
            showToast("Contacto añadido con éxito.");
        }
        window.closeContactWizard();
    } catch (e) {
        console.error("Error saving contact:", e);
        showAppAlert("Error al guardar el contacto.");
    }
};

// Delete Contact
window.deleteContact = function(contactId, name) {
    showAppConfirm(`¿Estás seguro de que deseas eliminar al contacto "${name}"?`, async () => {
        try {
            await db.collection('mangamar_contacts').doc(contactId).delete();
            showToast("Contacto eliminado.");
        } catch (e) {
            console.error("Error deleting contact:", e);
            showAppAlert("Error al eliminar el contacto.");
        }
    });
};

// Note inline editor modal
window.openContactNoteOnlyModal = function(contactId) {
    const modal = document.getElementById('contact-note-modal');
    if (!modal) return;

    window.activeContactNoteId = contactId;
    const contact = window.contactsDatabase.find(c => c.id === contactId);
    
    document.getElementById('contact-note-name').textContent = contact ? contact.nombre : 'Contacto';
    document.getElementById('contact-note-input').value = contact ? (contact.nota || '') : '';
    
    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('contact-note-input').focus(), 100);
};

window.closeContactNoteOnlyModal = function() {
    document.getElementById('contact-note-modal').classList.add('hidden');
    window.activeContactNoteId = null;
};

window.saveContactNoteOnly = async function() {
    if (!window.activeContactNoteId) return;

    const trimmed = document.getElementById('contact-note-input').value.trim();
    try {
        await db.collection('mangamar_contacts').doc(window.activeContactNoteId).set({
            nota: trimmed
        }, { merge: true });
        showToast("Nota guardada.");
        window.closeContactNoteOnlyModal();
    } catch (e) {
        console.error("Error saving contact note:", e);
        showAppAlert("Error al guardar la nota.");
    }
};

// Search & Filter event handlers
window.handleContactsSearch = function(query) {
    window.contactsSearchQuery = query;
    window.renderContactsList();
};

window.handleContactsCategoryFilter = function(category) {
    window.contactsCategoryFilter = category;
    window.renderContactsList();
};

window.handleContactsSort = function(sortBy) {
    window.contactsSortBy = sortBy;
    window.renderContactsList();
};

// Allow Enter (without Shift) to save the note in note-only modal
setTimeout(() => {
    const noteInput = document.getElementById('contact-note-input');
    if (noteInput) {
        noteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.saveContactNoteOnly();
            }
        });
    }
}, 2000);

// Initialize listeners on load if admin
if (!window.isStaffLoggedIn) {
    // Wait for Firestore to load
    setTimeout(() => {
        if (typeof db !== 'undefined') {
            window.initContactsListener();
        }
    }, 1000);
}
