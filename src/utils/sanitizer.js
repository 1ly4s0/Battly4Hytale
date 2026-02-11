const { logger } = require('./logger');


const PURIFY_CONFIG = {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div'],

    ALLOWED_ATTR: ['href', 'title', 'class'],

    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,

    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']
};


function sanitizeHTML(dirty) {
    if (!dirty || typeof dirty !== 'string') {
        return '';
    }

    if (typeof window !== 'undefined' && window.DOMPurify) {
        return window.DOMPurify.sanitize(dirty, PURIFY_CONFIG);
    }

    return dirty
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}


function createSafeElement(tag, content = '', attributes = {}) {
    const element = document.createElement(tag);

    if (content) {
        const sanitized = sanitizeHTML(content);
        element.innerHTML = sanitized;
    }

    const safeAttributes = ['class', 'id', 'title', 'href', 'target', 'rel'];
    for (const [key, value] of Object.entries(attributes)) {
        if (safeAttributes.includes(key)) {
            if (key === 'href') {
                try {
                    const url = new URL(value);
                    if (url.protocol === 'http:' || url.protocol === 'https:') {
                        element.setAttribute(key, value);
                        if (attributes.target === '_blank') {
                            element.setAttribute('rel', 'noopener noreferrer');
                        }
                    }
                } catch (e) {
                    logger.warn('URL invÃ¡lida ignorada:', value);
                }
            } else {
                element.setAttribute(key, String(value));
            }
        }
    }

    return element;
}


function sanitizeURL(url, allowedDomains = []) {
    try {
        const urlObj = new URL(url);

        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            return null;
        }

        if (allowedDomains.length > 0) {
            const hostname = urlObj.hostname.toLowerCase();
            const isAllowed = allowedDomains.some(domain =>
                hostname === domain || hostname.endsWith('.' + domain)
            );

            if (!isAllowed) {
                logger.warn(`Dominio no permitido: ${hostname}`);
                return null;
            }
        }

        return urlObj.href;
    } catch (e) {
        logger.error('URL invÃ¡lida:', e);
        return null;
    }
}


function sanitizeNewsItem(newsItem) {
    if (!newsItem || typeof newsItem !== 'object') {
        return null;
    }

    return {
        title: sanitizeHTML(newsItem.title || ''),
        summary: sanitizeHTML(newsItem.summary || ''),
        link: sanitizeURL(newsItem.link, ['hytale.com', 'launcher.hytale.com']) || '#',
        image: sanitizeURL(newsItem.image, ['hytale.com', 'launcher.hytale.com']) || null,
        date: newsItem.date || ''
    };
}


function clearContainer(container) {
    if (container) {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sanitizeHTML,
        createSafeElement,
        sanitizeURL,
        sanitizeNewsItem,
        clearContainer,
        PURIFY_CONFIG
    };
}
