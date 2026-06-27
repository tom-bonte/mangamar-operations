const admin = require('firebase-admin');

// 1. Initialize Firebase Admin SDK using service account credentials from ENV
const firebaseKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
admin.initializeApp({
    credential: admin.credential.cert(firebaseKey)
});
const db = admin.firestore();

const DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID; // The folder ID of "maganmar app archives"
const BACKUP_WEBAPP_URL = process.env.BACKUP_WEBAPP_URL;       // The deployed Apps Script URL
const BACKUP_SECURITY_TOKEN = process.env.BACKUP_SECURITY_TOKEN; // Secret token shared with Apps Script
const MANGAMAR_CODE = "M";

const MONTHS_SPANISH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_SPANISH_FULL = [
    '01_Enero', '02_Febrero', '03_Marzo', '04_Abril', '05_Mayo', '06_Junio',
    '07_Julio', '08_Agosto', '09_Septiembre', '10_Octubre', '11_Noviembre', '12_Diciembre'
];

async function generateYearCsv(year) {
    const monthKeys = [];
    for (let m = 1; m <= 12; m++) {
        monthKeys.push(`${year}-${String(m).padStart(2, '0')}`);
    }

    const allVisorTrips = [];
    const allInternalTrips = [];
    const allTombstones = new Set();

    const fetchPromises = monthKeys.map(async (monthKey) => {
        // Fetch visor bookings
        const visorDoc = await db.collection('reservations_monthly').doc(monthKey).get();
        if (visorDoc.exists) {
            const monthData = visorDoc.data().allocations || {};
            for (const id in monthData) {
                if (monthData[id].center === MANGAMAR_CODE) {
                    if (monthData[id]._deleted) continue;
                    const tripMonth = monthData[id].date ? monthData[id].date.substring(0, 7) : "";
                    if (tripMonth && tripMonth !== monthKey) continue;
                    allVisorTrips.push({ id, ...monthData[id], isVisorTrip: true });
                }
            }
        }

        // Fetch internal bookings
        const internalDoc = await db.collection('mangamar_monthly').doc(monthKey).get();
        if (internalDoc.exists) {
            const monthData = internalDoc.data().allocations || {};
            for (const id in monthData) {
                if (monthData[id]._deleted) {
                    allTombstones.add(id);
                    continue;
                }
                const tripMonth = monthData[id].date ? monthData[id].date.substring(0, 7) : "";
                if (tripMonth && tripMonth !== monthKey) continue;
                allInternalTrips.push({ id, ...monthData[id], isInternalTrip: true });
            }
        }
    });

    await Promise.all(fetchPromises);

    // Apply tombstones
    const filteredVisor = allVisorTrips.filter(t => !allTombstones.has(t.id));
    const filteredInternal = allInternalTrips.filter(t => !allTombstones.has(t.id));

    // Align internal shadows with visor masters
    const visorMap = new Map(filteredVisor.map(t => [t.id, t]));
    const alignedInternal = filteredInternal.map(internal => {
        if (visorMap.has(internal.id)) {
            const visorMaster = visorMap.get(internal.id);
            return {
                ...internal,
                date: visorMaster.date,
                time: visorMaster.time,
                plazas: visorMaster.pax,
                site: visorMaster.site
            };
        }
        return internal;
    });

    // Merge logic
    const combined = [...filteredVisor, ...alignedInternal];
    const deduplicated = new Map();
    combined.forEach(t => {
        if (t.isVisorTrip) {
            deduplicated.set(t.id, { ...t, isVisor: true, originalVisorSite: t.site });
        }
    });
    combined.forEach(t => {
        if (t.isInternalTrip) {
            if (deduplicated.has(t.id)) {
                deduplicated.set(t.id, { ...deduplicated.get(t.id), ...t, isVisor: true });
            } else {
                deduplicated.set(t.id, { ...t, isVisor: false });
            }
        }
    });

    const trips = Array.from(deduplicated.values()).filter(t => t.date);
    trips.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time || '').localeCompare(b.time || '');
    });

    const csvRows = [];
    csvRows.push([
        "Fecha",
        "Barco",
        "Destino",
        "Hora",
        "Guia",
        "Apoyo",
        "Nombre Cliente",
        "DNI",
        "Telefono",
        "Gas",
        "Alquiler",
        "Seguro",
        "Grupo/Reserva",
        "Estado Salida"
    ].map(val => `"${val.replace(/"/g, '""')}"`).join(','));

    trips.forEach(trip => {
        const dateDisplay = trip.date.split('-').reverse().join('/');
        const boatName = (trip.assignedBoat || '').toUpperCase() || 'SIN ASIGNAR';
        const siteName = trip.site || 'Sin Destino';
        const timeVal = trip.time || '';
        const status = trip.cancelled ? 'ANULADA' : 'ACTIVA';

        if (trip.groups && trip.groups.length > 0) {
            trip.groups.forEach(group => {
                const guideName = group.guide || '';
                const apoyoName = group.apoyo || '';

                if (group.guests && group.guests.length > 0) {
                    group.guests.forEach(guest => {
                        const guestName = guest.nombre || '';
                        const guestDni = guest.dni || '';
                        const guestPhone = guest.telefono || '';
                        const guestGas = guest.gas || '15L Aire';

                        let rentalText = 'No';
                        if (guest.rental === 1 || guest.rental === '1') rentalText = 'Sí';
                        else if (guest.rental > 1) rentalText = `Sí (${guest.rental})`;
                        else if (guest.rental === 'INC') rentalText = 'Incluido';

                        let insText = 'No';
                        if (guest.insurance === 1 || guest.insurance === '1') insText = 'Diario';
                        else if (guest.insurance === 2 || guest.insurance === '2') insText = 'Anual';
                        else if (guest.insurance === 'INC') insText = 'Incluido';
                        else if (guest.insurance && typeof guest.insurance === 'string') insText = guest.insurance;

                        const bookingTag = guest.bookingTag || '';

                        csvRows.push([
                            dateDisplay,
                            boatName,
                            siteName,
                            timeVal,
                            guideName,
                            apoyoName,
                            guestName,
                            guestDni,
                            guestPhone,
                            guestGas,
                            rentalText,
                            insText,
                            bookingTag,
                            status
                        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
                    });
                }
            });
        } else if (trip.guests && trip.guests.length > 0) {
            trip.guests.forEach(guest => {
                const guestName = guest.nombre || '';
                const guestDni = guest.dni || '';
                const guestPhone = guest.telefono || '';
                const guestGas = guest.gas || '15L Aire';

                let rentalText = 'No';
                if (guest.rental === 1 || guest.rental === '1') rentalText = 'Sí';
                else if (guest.rental > 1) rentalText = `Sí (${guest.rental})`;
                else if (guest.rental === 'INC') rentalText = 'Incluido';

                let insText = 'No';
                if (guest.insurance === 1 || guest.insurance === '1') insText = 'Diario';
                else if (guest.insurance === 2 || guest.insurance === '2') insText = 'Anual';
                else if (guest.insurance === 'INC') insText = 'Incluido';
                else if (guest.insurance && typeof guest.insurance === 'string') insText = guest.insurance;

                const bookingTag = guest.bookingTag || '';

                csvRows.push([
                    dateDisplay,
                    boatName,
                    siteName,
                    timeVal,
                    '',
                    '',
                    guestName,
                    guestDni,
                    guestPhone,
                    guestGas,
                    rentalText,
                    insText,
                    bookingTag,
                    status
                ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
            });
        }
    });

    return "\uFEFF" + csvRows.join("\n");
}

async function run() {
    try {
        const now = new Date();
        // Shift back by 6 hours so that runs occurring slightly after midnight (due to cron delays or DST shifts)
        // are correctly catalogued under the calendar date that just concluded.
        const today = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        const year = today.getFullYear();
        
        console.log(`Starting backup for year ${year}...`);
        
        const csvContent = await generateYearCsv(year);
        
        const monthIndex = today.getMonth();
        const monthFolderName = `${year}-${String(monthIndex + 1).padStart(2, '0')}_${MONTHS_SPANISH_FULL[monthIndex].split('_')[1]}`;
        
        // Build filename (e.g., 27-jun-backup.csv)
        const dayStr = String(today.getDate()).padStart(2, '0');
        const monthShort = MONTHS_SPANISH_SHORT[monthIndex];
        const filename = `${dayStr}-${monthShort}-backup.csv`;
        
        console.log(`Uploading file ${filename} to folder ${monthFolderName} via Apps Script...`);
        
        const payload = {
            token: BACKUP_SECURITY_TOKEN,
            rootFolderId: DRIVE_ROOT_FOLDER_ID,
            monthFolderName: monthFolderName,
            filename: filename,
            csvContent: csvContent
        };
        
        const response = await fetch(BACKUP_WEBAPP_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.status === 'success') {
            console.log(`BACKUP COMPLETED SUCCESSFULLY! File ID: ${result.fileId}`);
        } else {
            throw new Error(`Google Apps Script reported error: ${result.message}`);
        }
    } catch (e) {
        console.error("Backup failed:", e);
        process.exit(1);
    }
}

run();
