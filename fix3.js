const fs = require('fs');
let c = fs.readFileSync('public/app.js', 'utf8');

const regex = /if \(post\.location\) \{[\s\S]*?\} else \{[\s\S]*?\}\s*if \(post\.location\) \{[\s\S]*?\} else \{[\s\S]*?\}/;

const replacement = `if (post.location) {
            const locEl = $('pd-location');
            if (locEl) {
                locEl.textContent = '\\uD83D\\uDCCD ' + post.location;
                locEl.classList.remove('hidden');
            }
        } else {
            const locEl = $('pd-location');
            if (locEl) locEl.classList.add('hidden');
        }`;

c = c.replace(regex, replacement);

fs.writeFileSync('public/app.js', c);
console.log("App fixed number 3!");
