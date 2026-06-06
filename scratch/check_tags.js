const fs = require('fs');
const html = fs.readFileSync('/Users/tombonte/Library/CloudStorage/Dropbox/Tom/Dive Instructor Tom/MangamarApp/Mangamar Ops/index.html', 'utf8');

// A simple stack-based parser to trace div/main/section/header tags
const lines = html.split('\n');
const stack = [];

lines.forEach((line, index) => {
    const lineNum = index + 1;
    // Find all opening and closing tags for div, main, aside, header, section, button
    const tagRegex = /<\/?(div|main|aside|header|section|button)(?:\s|>)/g;
    let match;
    while ((match = tagRegex.exec(line)) !== null) {
        const fullTag = match[0];
        const isClosing = fullTag.startsWith('</');
        const tagName = match[1];
        
        if (!isClosing) {
            stack.push({ tag: tagName, line: lineNum, content: line.trim().substring(0, 80) });
        } else {
            if (stack.length === 0) {
                console.log(`Error: Extra closing tag </${tagName}> on line ${lineNum}`);
            } else {
                const last = stack.pop();
                if (last.tag !== tagName) {
                    console.log(`Mismatch: Opened <${last.tag}> on line ${last.line} ("${last.content}") but closed with </${tagName}> on line ${lineNum}`);
                }
            }
        }
    }
});

if (stack.length > 0) {
    console.log(`\nUnclosed tags remaining in stack:`);
    stack.forEach(item => {
        console.log(`Line ${item.line}: <${item.tag}> ("${item.content}")`);
    });
} else {
    console.log("No mismatched or unclosed tags found!");
}
