const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'presets.json');

app.use(cors());
app.use(express.json());

// Basic Auth Middleware
app.use((req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    // Benutzername: admin, Passwort: vom User gewünscht
    if (login === 'admin' && password === 'nuxy') {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Nux Hydrate LED Simulator"');
    res.status(401).send('Authentifizierung erforderlich.');
});

app.use(express.static('public'));

const readPresets = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading presets.json:', err);
        return { notification: [], error: [], system: [] };
    }
};

const writePresets = (presets) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(presets, null, 2), 'utf8');
};

app.get('/api/presets', (req, res) => {
    const presets = readPresets();
    res.json(presets);
});

app.post('/api/presets', (req, res) => {
    const { category, variant } = req.body;
    
    if (!category || !variant) {
        return res.status(400).json({ error: 'Missing category or variant data' });
    }

    const presets = readPresets();
    if (!presets[category]) {
        presets[category] = [];
    }

    // Check if ID exists to overwrite (edit mode)
    let found = false;
    for (let cat in presets) {
        const idx = presets[cat].findIndex(v => v.id === variant.id);
        if (idx > -1) {
            // Remove from old location (in case category changed)
            presets[cat].splice(idx, 1);
            found = true;
            break;
        }
    }

    // Always push to the target category
    presets[category].push(variant);
    writePresets(presets);
    
    res.json({ success: true, message: found ? 'Preset aktualisiert' : 'Preset gespeichert', variant });
});

app.delete('/api/presets/:category/:id', (req, res) => {
    const { category, id } = req.params;
    const presets = readPresets();

    if (!presets[category]) {
        return res.status(404).json({ error: 'Kategorie nicht gefunden' });
    }

    const initialLength = presets[category].length;
    presets[category] = presets[category].filter(v => v.id !== id);

    if (presets[category].length === initialLength) {
        return res.status(404).json({ error: 'Preset nicht gefunden' });
    }

    // Wenn die Kategorie leer ist, können wir sie optional löschen, 
    // aber wir lassen sie leer stehen für die UI.
    writePresets(presets);
    
    res.json({ success: true, message: 'Preset gelöscht' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`LED Simulator backend running on http://0.0.0.0:${PORT}`);
});
