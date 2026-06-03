const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

c = c.replace(
    "if (post.media_urls && post.media_urls.length > 0) {",
    "if (post.media_url) {"
);

c = c.replace(
    "const url = post.media_urls[0];",
    "const url = post.media_url;"
);

c = c.replace(
    "if (url.match(/\\.(mp4|webm)$/i)) {",
    "if (url.match(/\\.(mp4|webm)$/i) || post.media_type === 'video') {"
);

c = c.replace(
    "$('pd-caption').textContent = post.caption || '';",
    `$('pd-caption').textContent = post.caption || '';
        
        if (post.location) {
            const locEl = $('pd-location');
            if (locEl) {
                locEl.textContent = '📍 ' + post.location;
                locEl.classList.remove('hidden');
            }
        } else {
            const locEl = $('pd-location');
            if (locEl) locEl.classList.add('hidden');
        }`
);

fs.writeFileSync('public/app.js', c);
console.log('App fixed AGAIN!');
