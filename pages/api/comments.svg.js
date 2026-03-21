import { getComments } from '../../lib/db';
import fs from 'fs';
import path from 'path';

function escapeXML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  const intervals = [
    { label: 'y', seconds: 31536000 },
    { label: 'mo', seconds: 2592000 },
    { label: 'w', seconds: 604800 },
    { label: 'd', seconds: 86400 },
    { label: 'h', seconds: 3600 },
    { label: 'm', seconds: 60 },
  ];
  for (const { label, seconds: sec } of intervals) {
    const count = Math.floor(seconds / sec);
    if (count >= 1) return `${count}${label}`;
  }
  return 'now';
}

function approximateTextWidth(text, fontSize = 12) {
  const wideCharRegex = /[^\u0000-\u00ff]/g;
  const wideChars = (text.match(wideCharRegex) || []).length;
  const narrowChars = text.length - wideChars;
  return (wideChars * fontSize) + (narrowChars * (fontSize * 0.55));
}

const ALLOWED_EXTS = new Set(['.png', '.gif', '.jpg', '.jpeg', '.webp']);

function getEmojiMap() {
  try {
    const dir = path.join(process.cwd(), 'public', 'emojis');
    if (!fs.existsSync(dir)) return {};
    const files = fs.readdirSync(dir);
    const map = {};

    files.forEach(file => {
      const ext = path.extname(file).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) return;
      const name = path.basename(file, ext);
      const filePath = path.join(dir, file);
      const data = fs.readFileSync(filePath);
      const mime = ext === '.jpg' ? 'image/jpeg' : `image/${ext.replace('.', '')}`;
      map[name] = `data:${mime};base64,${data.toString('base64')}`;
    });

    return map;
  } catch (err) {
    return {};
  }
}

function getBase64PublicImage(fileName) {
  try {
    const filePath = path.join(process.cwd(), 'public', fileName);
    const data = fs.readFileSync(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === '.jpg' ? 'image/jpeg' : `image/${ext.replace('.', '')}`;
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch (err) {
    return '';
  }
}

function tokenizeWithEmojis(text, emojiMap) {
  const tokens = [];
  const regex = /:([a-zA-Z0-9_+\-]+):/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const name = match[1];
    const emoji = emojiMap[name];
    if (emoji) {
      tokens.push({ type: 'emoji', name, value: emoji });
    } else {
      tokens.push({ type: 'text', value: match[0] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

function splitTextToken(token) {
  return token.value.split(/(\s+)/).filter(Boolean).map(part => ({
    type: 'text',
    value: part,
  }));
}

function wrapTokens(tokens, maxWidth, fontSize, emojiSize) {
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  const pushLine = () => {
    lines.push(currentLine);
    currentLine = [];
    currentWidth = 0;
  };

  tokens.forEach(token => {
    const parts = token.type === 'text' ? splitTextToken(token) : [token];

    parts.forEach(part => {
      const partWidth = part.type === 'emoji'
        ? emojiSize
        : approximateTextWidth(part.value, fontSize);

      if (currentWidth + partWidth > maxWidth && currentLine.length > 0) {
        pushLine();
      }
      currentLine.push(part);
      currentWidth += partWidth;
    });
  });

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

function renderLineTokens(tokens, x, y, fontSize, emojiSize) {
  let cursorX = x;
  let textBuffer = '';
  const textSegments = [];
  const emojiSegments = [];

  const flushText = () => {
    if (!textBuffer) return;
    const safe = escapeXML(textBuffer);
    textSegments.push({ x: cursorX, text: safe });
    cursorX += approximateTextWidth(textBuffer, fontSize);
    textBuffer = '';
  };

  tokens.forEach((token) => {
    if (token.type === 'emoji') {
      flushText();
      emojiSegments.push({ x: cursorX, href: token.value });
      cursorX += emojiSize;
    } else {
      textBuffer += token.value;
    }
  });

  flushText();

  let output = '';
  textSegments.forEach((seg) => {
    output += `<text x="${seg.x}" y="${y}" class="msg" style="font-size:${fontSize}px;">${seg.text}</text>`;
  });
  emojiSegments.forEach((seg) => {
    output += `<image href="${seg.href}" x="${seg.x}" y="${y - emojiSize + 2}" width="${emojiSize}" height="${emojiSize}" />`;
  });
  return output;
}

export default async function handler(req, res) {
  let comments = [];
  try {
    comments = await getComments(50) || [];
  } catch (err) {
    console.error('ERROR in comments.svg:', err);
  }

  const emojiMap = getEmojiMap();

  const sizeParam = String(req.query?.size || '');
  const isMobile = sizeParam === 'mobile' || String(req.query?.mobile || '') === '1';
  const width = isMobile ? 301 : 228;
  const height = 266;
  const padding = 10;
  const nameSize = 12;
  const msgSize = 11;
  const lineHeight = 14;
  const emojiSize = 12;
  const avatarSize = 18;
  const avatarGap = 6;
  const maxComments = 6;
  const backgroundUrl = getBase64PublicImage('background.png');

  const parentComments = comments.filter(c => !c.parent_id);
  const totalComments = parentComments.length;
  const limitedComments = parentComments.slice(0, maxComments);

  let y = padding + nameSize + 6;
  const renderedLines = [];

  limitedComments.forEach((comment) => {
    const timeAgo = formatTimeAgo(comment.created_at);
    const name = escapeXML(comment.name);
    const messageTokens = tokenizeWithEmojis(comment.message || '', emojiMap);

    const hasAvatar = Boolean(comment.avatar_url);
    const textStartX = hasAvatar ? padding + avatarSize + avatarGap : padding;
    const maxTextWidth = width - (padding * 2) - (hasAvatar ? (avatarSize + avatarGap) : 0);
    const wrapped = wrapTokens(messageTokens, maxTextWidth, msgSize, emojiSize);
    const blockHeight = (lineHeight * (wrapped.length + 1)) + 10;
    const blockTop = y - nameSize - 6;

    renderedLines.push(`<rect x="${padding - 4}" y="${blockTop}" width="${width - (padding * 2) + 8}" height="${blockHeight}" rx="3" fill="#383838" opacity="0.9" />`);

    if (hasAvatar) {
      const avatarY = y - nameSize;
      renderedLines.push(
        `<image href="${comment.avatar_url}" x="${padding}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" />`
      );
    }

    renderedLines.push(`<text x="${textStartX}" y="${y}" class="name" style="font-size:${nameSize}px;">${name}</text>`);
    renderedLines.push(`<text x="${width - padding}" y="${y}" class="date" style="font-size:9px;" text-anchor="end">${timeAgo}</text>`);

    y += lineHeight;

    wrapped.forEach((lineTokens) => {
      if (y > height - padding) return;
      renderedLines.push(renderLineTokens(lineTokens, textStartX, y, msgSize, emojiSize));
      y += lineHeight;
    });

    y += 6;
  });

  if (totalComments > maxComments && y < height - 6) {
    renderedLines.push(
      `<text x="${padding}" y="${height - 6}" class="more" style="font-size:9px;">and more ${totalComments - maxComments} comments</text>`
    );
  }

  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  ${backgroundUrl ? `<image href="${backgroundUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />` : ''}
  <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(0,0,0,0.45)" />
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="rgba(20,20,20,0.75)" stroke="#5e5e5e" />
  <style>
    <![CDATA[
    .name { font-family: "MS UI Gothic", sans-serif; fill: #e0e0e0; font-weight: bold; }
    .date { font-family: monospace; fill: #9aa0a6; }
    .msg { font-family: "MS UI Gothic", sans-serif; fill: #d5d5d5; }
    .more { font-family: monospace; fill: #b0b0b0; }
    ]]>
  </style>
  ${renderedLines.join('\n')}
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache, max-age=0');
  res.status(200).send(svg);
}
