const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Parser = require('rss-parser'); // For RSS feeds

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors());

// In-memory placeholder for database interactions
const db = {
    userPreferences: {},
    usageLogs: [],
};

// --- API Endpoints ---
app.route('/api/user-preferences/:userId')
    .get((req, res) => {
        const prefs = db.userPreferences[req.params.userId];
        if (prefs) res.json(prefs);
        else res.status(404).json({ message: "Preferences not found." });
    })
    .post((req, res) => {
        db.userPreferences[req.params.userId] = req.body;
        res.status(200).json({ message: 'Preferences saved.' });
    });

app.post('/api/log-usage', (req, res) => {
    const logEntry = { ...req.body, timestamp: new Date().toISOString() };
    db.usageLogs.push(logEntry);
    console.log('Usage logged:', logEntry);
    res.status(200).json({ message: 'Usage logged.' });
});

app.post('/api/sos', (req, res) => {
    console.log('SOS Alert Received:', req.body);
    res.status(200).json({ message: 'SOS alert processed.' });
});

app.get('/api/news', async (req, res) => {
    console.log("Fetching news from RSS feed...");
    const parser = new Parser();
    const feedUrl = 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms';
    
    try {
        const feed = await parser.parseURL(feedUrl);
        
        const articles = feed.items.slice(0, 5).map(item => ({
            title: item.title,
            source: { name: item.creator || 'The Times of India' }
        }));

        console.log("Successfully fetched and parsed RSS feed.");
        res.json({ status: "ok", articles });

    } catch (error) {
        console.error('Error fetching or parsing RSS feed:', error);
        res.status(500).json({ status: "error", message: 'Could not fetch news feed.' });
    }
});

app.get('/api/predictive-shortcut/:userId', async (req, res) => {
    const { userId } = req.params;
    const { profileType } = req.query;
    if (!profileType) {
        return res.status(200).json({ message: 'No prediction available: profile not provided.' });
    }
    try {
        const mlResponse = await fetch('http://127.0.0.1:5001/predict-shortcut', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, profileType })
        });
        if (!mlResponse.ok) throw new Error('ML service returned an error.');
        res.json(await mlResponse.json());
    } catch (error) {
        res.status(500).json({ message: 'Could not get prediction.' });
    }
});

app.post('/api/image-to-speech', async (req, res) => {
    console.log('Received image for analysis...');
    try {
        const mlResponse = await fetch('http://127.0.0.1:5001/api/image-to-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        if (!mlResponse.ok) {
            const errorBody = await mlResponse.text();
            throw new Error(`ML service error: ${errorBody}`);
        }
        res.json(await mlResponse.json());
    } catch (error) {
        console.error('Error proxying to ML service:', error.message);
        res.status(500).json({ message: 'Could not analyze image.' });
    }
});

app.post('/api/read-document', async (req, res) => {
    console.log('Received document image for OCR...');
    try {
        const mlResponse = await fetch('http://127.0.0.1:5001/api/read-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        if (!mlResponse.ok) {
            const errorBody = await mlResponse.text();
            throw new Error(`OCR service error: ${errorBody}`);
        }
        res.json(await mlResponse.json());
    } catch (error) {
        console.error('Error proxying to OCR service:', error.message);
        res.status(500).json({ message: 'Could not read document.' });
    }
});

app.post('/api/text-translator', async (req, res) => {
    console.log('Received image for translation pipeline...');
    const { imageData, language } = req.body;
    try {
        const ocrResponse = await fetch('http://127.0.0.1:5001/api/read-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData })
        });
        if (!ocrResponse.ok) throw new Error('OCR step failed.');
        const ocrData = await ocrResponse.json();
        const originalText = ocrData.text;

        if (!originalText || originalText.startsWith("No readable text")) {
             return res.json({ original: originalText, translated: "No text to translate." });
        }

        const translateResponse = await fetch('http://127.0.0.1:5001/api/translate-text', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ text: originalText, target_lang: language })
        });
        if (!translateResponse.ok) throw new Error('Translation step failed.');
        const translateData = await translateResponse.json();
        
        console.log("Translation pipeline successful.");
        res.json({ original: originalText, translated: translateData.translated_text });

    } catch (error) {
        console.error('Error in translation pipeline:', error.message);
        res.status(500).json({ message: 'Could not translate the document.' });
    }
});

app.post('/api/text-to-icon', async (req, res) => {
    console.log('Received text for icon conversion...');
    try {
        const mlResponse = await fetch('http://127.0.0.1:5001/api/text-to-icon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        if (!mlResponse.ok) {
            const errorBody = await mlResponse.text();
            console.error('Text-to-Icon service error:', errorBody);
            throw new Error('Text-to-Icon service returned an error.');
        }
        const iconData = await mlResponse.json();
        console.log('Sending icons to frontend:', iconData.icons);
        res.json(iconData);
    } catch (error) {
        console.error('Error proxying to Text-to-Icon service:', error.message);
        res.status(500).json({ message: 'Could not convert text to icons.' });
    }
});

app.post('/api/voice-command', async (req, res) => {
    console.log('Received voice command for recognition...');
    try {
        const mlResponse = await fetch('http://127.0.0.1:5001/api/recognize-command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        if (!mlResponse.ok) {
            const errorBody = await mlResponse.text();
            console.error('Command recognition service error:', errorBody);
            throw new Error('Command recognition service returned an error.');
        }
        const intentData = await mlResponse.json();
        console.log('Sending intent to frontend:', intentData.intent);
        res.json(intentData);
    } catch (error) {
        console.error('Error proxying to Command recognition service:', error.message);
        res.status(500).json({ message: 'Could not recognize command.' });
    }
});

app.post('/api/sign-to-speech', async (req, res) => {
    console.log('Received sign language frame for analysis...');
    try {
        const mlResponse = await fetch('http://127.0.0.1:5001/api/sign-to-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        if (!mlResponse.ok) {
            const errorBody = await mlResponse.text();
            console.error('Sign recognition service error:', errorBody);
            throw new Error('Sign recognition service returned an error.');
        }
        const signData = await mlResponse.json();
        res.json(signData);
    } catch (error) {
        console.error('Error proxying to sign recognition service:', error.message);
        res.status(500).json({ message: 'Could not recognize sign.' });
    }
});

app.post('/api/get-directions', async (req, res) => {
    const apiKey = '3a1e3ad0-ecf0-4d85-a33c-b2835b02e125';
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) return res.status(400).json({ message: 'Missing coordinates' });
    const destination = '13.1311,75.3335';
    const origin = `${latitude},${longitude}`;
    const url = `https://graphhopper.com/api/1/route?point=${origin}&point=${destination}&vehicle=foot&instructions=true&key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data.paths || data.paths.length === 0) throw new Error('No route found');
        const steps = data.paths[0].instructions.map(step => ({
            instruction: step.text,
            distance: `${Math.round(step.distance)} m`,
            icon: getGraphHopperIcon(step.sign)
        }));
        res.json({ steps });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Could not fetch directions.' });
    }
});

function getGraphHopperIcon(sign) {
    switch(sign) {
        case -3: case -2: return '←';
        case -1: return '↖';
        case 1: return '↗';
        case 2: case 3: return '→';
        case 4: return '★';
        case 6: return '🔄';
        default: return '↑';
    }
}

app.post('/api/voice-assistant', async (req, res) => {
    const apiKey1 = 'AIzaSyDFR-X4UgOxgWwOEqfkiyzxDF3a8WZUtrE';
    if (!apiKey1) {
        console.error("Gemini error: API key is missing.");
        return res.status(500).json({ message: 'Server configuration error: Gemini API key not set.' });
    }
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ message: 'No query provided.' });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey1}`;
    const systemInstruction = `You are ALLABLE, a friendly and helpful voice assistant. It is currently Wednesday, September 24, 2025 at 1:11 AM in Kalya, Karnataka, India. Keep your answers concise, clear, and easy to understand.`;
    const payload = { contents: [{ role: "user", parts: [{ text: query }] }], systemInstruction: { role: "system", parts: [{ text: systemInstruction }] }, generationConfig: { temperature: 0.7, maxOutputTokens: 100, } };
    try {
        const geminiResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            throw new Error(`Gemini API Error: ${errorBody}`);
        }
        const geminiData = await geminiResponse.json();
        const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't find an answer to that.";
        res.json({ answer });
    } catch (error) {
        console.error("Error contacting Gemini API:", error.message);
        res.status(500).json({ message: "Sorry, I couldn't process your request." });
    }
});
const path = require('path');

app.listen(PORT, () => {
    console.log(`Node.js server running on http://localhost:${PORT}`);
});