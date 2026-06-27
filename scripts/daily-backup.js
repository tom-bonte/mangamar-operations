const { google } = require('googleapis');
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin SDK using service account credentials from ENV
const firebaseKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
admin.initializeApp({
    credential: admin.credential.cert(firebaseKey)
});
const db = admin.firestore();

// 2. Initialize Google Drive API Client using service account credentials from ENV
const driveKey = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY);
const auth = google.auth.fromJSON(driveKey);
auth.scopes = ['https://www.googleapis.com/auth/drive'];
const drive = google.drive({ version: 'v3', auth });

const DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID; // The folder ID of "maganmar app archives"
const MANGAMAR_CODE = "M";

const MONTHS_SPANISH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_SPANISH_FULL = [
    '01_Enero', '02_Febrero', '03_Marzo', '04_Abril', '05_Mayo', '06_Junio',
    '07_Julio', '08_Agosto', '09_Septiembre', '10_Octubre', '11_Noviembre', '12_Diciembre'
];

async function getOrCreateFolder(folderName, parentId) {
    const q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const response = await drive.files.list({
        q: q,
        spaces: 'drive',
        fields: 'files(id, name)'
    });
    
    const files = response.data.files;
    if (files && files.length > 0) {
        console.log(`Found existing month folder: ${folderName} (ID: ${files[0].id})`);
        return files[0].id;
    }
    
    console.log(`Creating folder: ${folderName}...`);
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
    };
    
    const file = await drive.files.create({
        resource: fileMetadata,
        fields: 'id'
    });
    
    console.log(`Created folder: ${folderName} (ID: ${file.data.id})`);
    return file.data.id;
}

async function uploadFile(filename, content, folderId) {
    const fileMetadata = {
        name: filename,
        parents: [folderId]
    };
    
    const media = {
        mimeType: 'text/csv',
        body: content
    };
    
    const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id'
    });
    
    console.log(`File uploaded successfully (ID: ${response.data.id})`);
    return response.data.id;
}

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
        const today = new Date();
        const year = today.getFullYear();
        
        console.log(`Starting backup for year ${year}...`);
        
        const csvContent = await generateYearCsv(year);
        
        const monthIndex = today.getMonth();
        const monthFolderName = `${year}-${String(monthIndex + 1).padStart(2, '0')}_${MONTHS_SPANISH_FULL[monthIndex].split('_')[1]}`;
        
        // Find or create month folder
        const monthFolderId = await getOrCreateFolder(monthFolderName, DRIVE_ROOT_FOLDER_ID);
        
        // Build filename (e.g., 25-aug-backup.csv)
        const dayStr = String(today.getDate()).padStart(2, '0');
        const monthShort = MONTHS_SPANISH_SHORT[monthIndex];
        const filename = `${dayStr}-${monthShort}-backup.csv`;
        
        console.log(`Uploading file ${filename} to folder ${monthFolderName}...`);
        await uploadFile(filename, csvContent, monthFolderId);
        
        console.log("BACKUP COMPLETED SUCCESSFULLY!");
    } catch (e) {
        console.error("Backup failed:", e);
        process.exit(1);
    }
}

run();
