const https = require('https');

const dnis = ['Z2551893W', '592412078616'];

dnis.forEach(dni => {
    const url = `https://firestore.googleapis.com/v1/projects/reserva-marina-cdp/databases/(default)/documents/mangamar_customers/${dni}`;
    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log(`\n=== Customer: ${dni} ===`);
                if (json.fields) {
                    for (const field in json.fields) {
                        console.log(`  ${field}:`, JSON.stringify(json.fields[field]));
                    }
                } else {
                    console.log("No fields found (document might not exist or be empty):", json);
                }
            } catch (e) {
                console.error("Error parsing JSON:", e);
            }
        });
    });
});
