const https = require('https');

const url = 'https://firestore.googleapis.com/v1/projects/reserva-marina-cdp/databases/(default)/documents/mangamar_monthly/2026-05';

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            const allocations = json.fields.allocations.mapValue.fields;
            
            console.log("=== ALLOCATIONS FOR 2026-05-01 ===");
            for (const key in allocations) {
                const trip = allocations[key].mapValue.fields;
                const date = trip.date.stringValue;
                if (date === '2026-05-01') {
                    const time = trip.time.stringValue;
                    const boat = trip.assignedBoat.stringValue;
                    const site = trip.site.stringValue;
                    console.log(`\nTrip ID: ${key} | Boat: ${boat} | Time: ${time} | Site: ${site}`);
                    
                    const groups = trip.groups.arrayValue.values || [];
                    groups.forEach((g, gIdx) => {
                        const groupFields = g.mapValue.fields;
                        const guide = groupFields.guide ? groupFields.guide.stringValue : 'None';
                        const guests = groupFields.guests.arrayValue.values || [];
                        console.log(`  Group ${gIdx + 1} (Guide: ${guide}):`);
                        guests.forEach((gst, gstIdx) => {
                            const gf = gst.mapValue.fields;
                            const name = gf.nombre ? gf.nombre.stringValue : 'No Name';
                            const dni = gf.dni ? gf.dni.stringValue : 'No DNI';
                            const paymentStatus = gf.paymentStatus ? gf.paymentStatus.stringValue : 'none';
                            const paymentMethod = gf.paymentMethod ? gf.paymentMethod.stringValue : 'none';
                            const localDeposit = gf.localDeposit ? (gf.localDeposit.doubleValue || gf.localDeposit.integerValue || gf.localDeposit.stringValue) : 'none';
                            const localDepositC = gf.localDepositC ? gf.localDepositC.booleanValue : 'none';
                            console.log(`    Guest ${gstIdx + 1}: ${name} (${dni}) | paymentStatus: ${paymentStatus} | paymentMethod: ${paymentMethod} | localDeposit: ${localDeposit} | localDepositC: ${localDepositC}`);
                        });
                    });
                }
            }
        } catch (e) {
            console.error("Error parsing JSON or structure:", e);
            console.log("Raw response (truncated):", data.substring(0, 1000));
        }
    });
}).on('error', (err) => {
    console.error("HTTP Error:", err);
});
