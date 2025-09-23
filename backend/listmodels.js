const fetch = require('node-fetch');

const apiKey = 'AIzaSyDFR-X4UgOxgWwOEqfkiyzxDF3a8WZUtrE'; // replace with your actual key

async function listModels() {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    console.log(data);
}

listModels();
