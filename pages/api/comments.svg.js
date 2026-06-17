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
  const padding = 12;
  const nameSize = 12;
  const msgSize = 11;
  const lineHeight = 15;
  const emojiSize = 12;
  const avatarSize = 26;
  const replyAvatarSize = 20;
  const avatarGap = 8;
  const cardGap = 8;
  const replyIndent = 22;

  const parentComments = comments.filter(c => !c.parent_id);
  const repliesByParent = comments
    .filter(c => c.parent_id)
    .reduce((acc, r) => {
      (acc[r.parent_id] = acc[r.parent_id] || []).push(r);
      return acc;
    }, {});
  Object.values(repliesByParent).forEach(list => {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  });

  let y = padding + nameSize + 8;
  const threadCurves = []; // curvas reddit, desenhadas DEPOIS (por baixo dos cards)
  const renderedLines = [];

  // desenha um comentario. retorna a posicao do centro-base do avatar (pra ligar curvas).
  function drawComment(comment, opts) {
    const isReply = opts.isReply;
    const leftBase = padding + (isReply ? replyIndent : 0);
    const avSize = isReply ? replyAvatarSize : avatarSize;
    const cardLeft = leftBase - 6;
    const cardRight = width - padding + 6;
    const cardWidth = cardRight - cardLeft;

    const timeAgo = formatTimeAgo(comment.created_at);
    const name = escapeXML(comment.name);
    const messageTokens = tokenizeWithEmojis(comment.message || '', emojiMap);

    const textStartX = leftBase + avSize + avatarGap;
    const maxTextWidth = width - padding - textStartX;
    const wrapped = wrapTokens(messageTokens, maxTextWidth, msgSize, emojiSize);
    const blockHeight = (lineHeight * (wrapped.length + 1)) + 14;
    const blockTop = y - nameSize - 8;

    renderedLines.push(`<rect x="${cardLeft}" y="${blockTop}" width="${cardWidth}" height="${blockHeight}" rx="${isReply ? 10 : 12}" class="${isReply ? 'card reply' : 'card'}" />`);

    const avatarY = y - nameSize - 1;
    const cx = leftBase + avSize / 2;
    const cy = avatarY + avSize / 2;
    if (comment.avatar_url) {
      const clipId = `clip${blockTop}_${isReply ? 'r' : 'p'}`;
      renderedLines.push(`<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${avSize / 2}" /></clipPath>`);
      renderedLines.push(`<image href="${comment.avatar_url}" x="${leftBase}" y="${avatarY}" width="${avSize}" height="${avSize}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />`);
    } else {
      const initial = escapeXML((comment.name || '?').trim().charAt(0).toUpperCase() || '?');
      renderedLines.push(`<circle cx="${cx}" cy="${cy}" r="${avSize / 2}" class="avatarbg" />`);
      renderedLines.push(`<text x="${cx}" y="${cy + 4}" class="avatarinitial" text-anchor="middle">${initial}</text>`);
    }

    renderedLines.push(`<text x="${textStartX}" y="${y}" class="name" style="font-size:${isReply ? nameSize - 1 : nameSize}px;">${name}</text>`);
    const nameWidth = approximateTextWidth(comment.name || '', nameSize);
    renderedLines.push(`<text x="${textStartX + nameWidth + 6}" y="${y}" class="date" style="font-size:9px;">· ${timeAgo}</text>`);

    y += lineHeight;
    wrapped.forEach((lineTokens) => {
      renderedLines.push(renderLineTokens(lineTokens, textStartX, y, msgSize, emojiSize));
      y += lineHeight;
    });
    y += cardGap + 8;

    // retorna info do avatar pra ligar as curvas da thread
    return { avatarBottomX: cx, avatarBottomY: cy + avSize / 2, avatarCenterX: cx };
  }

  parentComments.forEach((parent) => {
    const parentInfo = drawComment(parent, { isReply: false });
    const replies = repliesByParent[parent.id] || [];

    replies.forEach((reply) => {
      // antes de desenhar o reply, calcula onde o avatar dele vai ficar
      const replyAvatarCenterY = y - nameSize - 1 + replyAvatarSize / 2;
      const replyAvatarLeftX = padding + replyIndent; // borda esquerda do avatar do reply

      // curva estilo reddit: desce reto do centro do avatar do pai e curva pra direita
      const startX = parentInfo.avatarCenterX;
      const turnY = replyAvatarCenterY;
      const endX = replyAvatarLeftX - 3;
      const radius = 8;
      const d = `M ${startX} ${parentInfo.avatarBottomY + 2} `
        + `L ${startX} ${turnY - radius} `
        + `Q ${startX} ${turnY} ${startX + radius} ${turnY} `
        + `L ${endX} ${turnY}`;
      threadCurves.push(`<path d="${d}" class="threadcurve" fill="none" />`);

      drawComment(reply, { isReply: true });
    });
  });

  const height = Math.max(120, y + 4);

  // curvas primeiro (por baixo), depois os cards/textos por cima
  const allShapes = threadCurves.join('\n') + '\n' + renderedLines.join('\n');

  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <style>
    <![CDATA[
    .name { font-family: "Segoe UI", "Helvetica Neue", sans-serif; fill: #15202b; font-weight: 700; }
    .date { font-family: "Segoe UI", "Helvetica Neue", sans-serif; fill: #5b6b7a; }
    .msg  { font-family: "Segoe UI", "Helvetica Neue", sans-serif; fill: #2a3a47; }
    .more { font-family: "Segoe UI", "Helvetica Neue", sans-serif; fill: #5b6b7a; }
    .card { fill: rgba(255,255,255,0.55); stroke: rgba(120,90,70,0.22); stroke-width: 1; }
    .card.reply { fill: rgba(255,255,255,0.40); }
    .threadcurve { stroke: rgba(120,90,70,0.40); stroke-width: 2; stroke-linecap: round; }
    .avatarbg { fill: rgba(160,57,58,0.85); }
    .avatarinitial { font-family: "Segoe UI", sans-serif; font-weight: 700; font-size: 12px; fill: #ffffff; }

    @media (prefers-color-scheme: dark) {
      .name { fill: #f4ece4; }
      .date { fill: #c2a08b; }
      .msg  { fill: #e6d8ca; }
      .more { fill: #c2a08b; }
      .card { fill: rgba(227,174,138,0.10); stroke: rgba(227,174,138,0.22); }
      .card.reply { fill: rgba(227,174,138,0.06); }
      .threadcurve { stroke: rgba(227,174,138,0.40); }
      .avatarbg { fill: rgba(227,174,138,0.85); }
      .avatarinitial { fill: #16100d; }
    }
    ]]>
  </style>
  ${allShapes}
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache, max-age=0');
  res.status(200).send(svg);
}
