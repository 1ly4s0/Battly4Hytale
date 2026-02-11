const axios = require('axios');
const { logger } = require('../utils/logger');

async function fetchHytaleNews() {
    try {
        const response = await axios.get('https://launcher.hytale.com/launcher-feed/release/feed.json', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://hytale.com',
                'Origin': 'https://hytale.com'
            },
            timeout: 5000
        });

        const items = response.data.forEach ? response.data : (response.data.articles || response.data.news || []);

        const newsArray = Array.isArray(items) ? items : [];

        return newsArray.slice(0, 6).map(item => ({
            title: item.title,
            summary: item.short_text || item.description || '',
            link: item.url || item.dest_url,
            image: item.image_url ? `https://launcher.hytale.com/launcher-feed/release/${item.image_url}` : null
        }));

    } catch (error) {
        logger.error("Error fetching news:", error.message);
        return [];
    }
}

module.exports = { fetchHytaleNews };
