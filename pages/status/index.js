import { useState, useEffect } from 'react';

const getTimeAgo = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };
  for (const [unit, sec] of Object.entries(intervals)) {
    const count = Math.floor(seconds / sec);
    if (count >= 1) return `${count}${unit[0]}`;
  }
  return 'Now';
};

export default function StatusPage() {
  const [statusList, setStatusList] = useState([]);
  const [name, setName] = useState('lucy');
  const [message, setMessage] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [emojiMap, setEmojiMap] = useState({});
  const [emojiList, setEmojiList] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStatusEmojiPicker, setShowStatusEmojiPicker] = useState(false);
  const [statusEmojiName, setStatusEmojiName] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [showAvatarUploader, setShowAvatarUploader] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const MAX_CHARS = 140;
  const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
  const MAX_AVATAR_MB = 5;
  const AVATAR_STORAGE_KEY = 'status_avatar_data';
  const STATUS_EMOJI_KEY = 'status_emoji_name';

  const refreshStatus = async () => {
    const res = await fetch('/api/status.json');
    const data = await res.json();
    setStatusList(data.status || []);
  };

  useEffect(() => {
    refreshStatus().catch(console.error);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedAvatar = window.localStorage.getItem(AVATAR_STORAGE_KEY);
      if (storedAvatar) setAvatarDataUrl(storedAvatar);
    } catch (err) {
      // ignore storage errors
    }
    try {
      const storedEmoji = window.localStorage.getItem(STATUS_EMOJI_KEY);
      if (storedEmoji) setStatusEmojiName(storedEmoji);
    } catch (err) {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (avatarDataUrl) {
        window.localStorage.setItem(AVATAR_STORAGE_KEY, avatarDataUrl);
      } else {
        window.localStorage.removeItem(AVATAR_STORAGE_KEY);
      }
    } catch (err) {
      // ignore storage errors
    }
  }, [avatarDataUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (statusEmojiName) {
        window.localStorage.setItem(STATUS_EMOJI_KEY, statusEmojiName);
      } else {
        window.localStorage.removeItem(STATUS_EMOJI_KEY);
      }
    } catch (err) {
      // ignore storage errors
    }
  }, [statusEmojiName]);

  useEffect(() => {
    fetch('/api/status/me')
      .then(res => res.json())
      .then(data => setIsAuthed(Boolean(data.authed)))
      .catch(() => setIsAuthed(false));
  }, []);

  useEffect(() => {
    fetch('/api/emojis')
      .then(res => res.json())
      .then(data => {
        const map = {};
        (data.emojis || []).forEach(e => {
          map[e.name] = e.url;
        });
        setEmojiMap(map);
        setEmojiList(data.emojis || []);
      })
      .catch(() => {
        setEmojiMap({});
        setEmojiList([]);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthed) return;
    const trimmedName = name.trim().slice(0, 30);
    const trimmedMessage = message.trim().slice(0, MAX_CHARS);
    if (!trimmedName || !trimmedMessage) return;
    const nameWithStatusEmoji = statusEmojiName
      ? `:${statusEmojiName}: ${trimmedName}`
      : trimmedName;

    await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameWithStatusEmoji,
        message: trimmedMessage,
        avatar_url: avatarDataUrl || null,
      }),
    });

    await refreshStatus();
    setMessage('');
    setCharCount(0);
    setShowEmojiPicker(false);
    setShowStatusEmojiPicker(false);
  };

  const insertEmoji = (emojiName) => {
    setMessage(current => `:${emojiName}: ${current}`.trimStart());
  };

  const setStatusEmoji = (emojiName) => {
    setStatusEmojiName(emojiName);
    setShowStatusEmojiPicker(false);
  };

  const handleAvatarFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_AVATAR_BYTES) {
      alert(`Avatar too large. Max ${MAX_AVATAR_MB}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setAvatarDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const renderWithEmojis = (text) => {
    const parts = [];
    const regex = /:([a-zA-Z0-9_+\-]+):/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const emojiName = match[1];
      const emojiUrl = emojiMap[emojiName];
      if (emojiUrl) {
        parts.push(
          <img
            key={`emoji-${emojiName}-${key++}`}
            src={emojiUrl}
            alt={emojiName}
            className="emoji-inline"
            style={{ width: 16, height: 16, verticalAlign: 'text-bottom', margin: '0 2px' }}
          />
        );
      } else {
        parts.push(match[0]);
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  return (
    <div id="MainCore" className="crt">
      <style jsx global>{`
        @font-face {
          font-family: 'smalle';
          src: url(https://files.catbox.moe/5vgwr0.ttf) format('truetype');
        }
        :root {
          --panel: #d4d4d4;
          --panel-lite: #f2f2f2;
          --ink: #303030;
          --border: #000;
          --grid: #969696;
          --link: #0400ff;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background-image: url(background.gif);
          background-color: #f0efed;
          overflow-y: scroll;
          cursor: url(https://cur.cursors-4u.net/mechanics/mec-5/mec443.cur), auto;
          font-family: "MS UI Gothic", "MS PGothic", sans-serif;
          color: var(--ink);
        }
        .crt::before {
          content: " ";
          display: block;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
            linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
          background-size: 100% 2px, 3px 100%;
          z-index: 9999;
          pointer-events: none;
        }
        .container {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 10px;
          margin: 0 auto;
          padding: 160px 10px 40px;
          min-height: 100vh;
          box-sizing: border-box;
          z-index: 2;
        }
        .header {
          position: absolute;
          top: 0;
          left: 50%;
          margin-top: 10px;
          transform: translateX(-50%);
          width: 1050px;
          max-width: calc(100% - 20px);
          height: 150px;
          background-color: var(--panel);
          border: 1px solid var(--border);
          background-image: url(https://kaththingy.neocities.org/ImgStorage/background.jpg);
          background-position: 50%;
        }
        #Left-column {
          margin: 3px;
          width: 220px;
          padding: 10px;
          background-image: url(https://kaththingy.neocities.org/ImgStorage/halftone_1768490195.png);
          background-size: 150px;
          background-color: var(--panel);
          border: 1px solid var(--border);
          font-size: 14px;
          line-height: 1.4;
          word-break: break-word;
        }
        #holder {
          margin: 5px;
          width: 680px;
          max-width: 100%;
          padding: 10px;
          background: var(--panel);
          border: 1px solid var(--border);
          font-size: 14px;
        }
        h1 {
          color: var(--ink);
          font-size: 24px;
          text-align: center;
          font-family: 'smalle', "MS UI Gothic", sans-serif;
          margin: 10px 0 4px 0;
        }
        hr {
          display: block;
          margin: 0.5em auto;
          color: gray;
          overflow: hidden;
          border-style: inset;
          border-width: 1px;
        }
        .panel-title {
          font-family: 'smalle', "MS UI Gothic", sans-serif;
          font-size: 20px;
          margin: 2px 0 8px;
          text-align: center;
        }
        .comment-rules {
          border: 1px solid var(--grid);
          padding: 8px;
          background: #efefef;
          margin-bottom: 10px;
        }
        .comment-rules ul { margin: 0; padding-left: 18px; }
        label {
          display: block;
          margin-bottom: 4px;
          font-weight: 700;
          font-size: 14px;
        }
        .name-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
          margin-bottom: 6px;
        }
        input, textarea {
          width: 100%;
          padding: 8px;
          margin-bottom: 8px;
          background: #fff;
          border: 1px solid #5e5e5e;
          color: #000;
          font-family: "MS UI Gothic", "MS PGothic", sans-serif;
          font-size: 14px;
          outline: none;
        }
        textarea {
          resize: none;
          max-height: 160px;
          overflow-y: auto;
        }
        button {
          padding: 4px 18px;
          background: var(--panel-lite);
          color: #000;
          border: 1px solid #000;
          font-family: "MS UI Gothic", "MS PGothic", sans-serif;
          cursor: pointer;
          border-color: #5e5e5e;
          box-shadow: inset 13px 0px 6px -10px rgba(66, 66, 66, 0.2),
            inset -13px 0px 6px -10px rgba(66, 66, 66, 0.56),
            inset 0px 13px 6px -10px #ffffff,
            inset 0px -13px 6px -10px rgba(66, 66, 66, 0.38);
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .form-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .emoji-toggle {
          font-size: 12px;
          padding: 2px 10px;
        }
        .emoji-panel {
          border: 1px solid #5e5e5e;
          background: #f2f2f2;
          padding: 6px;
          margin-bottom: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-height: 140px;
          overflow-y: auto;
        }
        .emoji-item {
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #9a9a9a;
          background: #fff;
          padding: 0;
          cursor: pointer;
        }
        .emoji-item img {
          width: 16px;
          height: 16px;
          display: block;
        }
        .emoji-inline {
          display: inline-block;
          position: relative;
          z-index: 2;
        }
        .status-emoji-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 4px 0 8px;
        }
        .status-emoji-preview {
          width: 18px;
          height: 18px;
          border: 1px solid #777;
          background: #fff;
          object-fit: contain;
        }
        .status-emoji-clear {
          font-size: 12px;
          padding: 2px 8px;
        }
        .avatar-button {
          font-size: 12px;
          padding: 2px 10px;
        }
        .avatar-drop {
          border: 1px solid #5e5e5e;
          background: #f2f2f2;
          padding: 10px;
          margin-bottom: 8px;
          text-align: center;
          font-size: 12px;
          box-shadow: inset 13px 0px 6px -10px rgba(66, 66, 66, 0.2),
            inset -13px 0px 6px -10px rgba(66, 66, 66, 0.2),
            inset 0px 13px 6px -10px #ffffff;
        }
        .avatar-drop input[type="file"] {
          font-family: "MS UI Gothic", "MS PGothic", sans-serif;
          font-size: 12px;
        }
        .avatar-preview {
          width: 32px;
          height: 32px;
          border: 1px solid #777;
          background: #fff;
          object-fit: cover;
        }
        .status-card {
          border: 1px solid var(--grid);
          padding: 8px;
          margin-bottom: 8px;
          background: #f7f7f7;
        }
        .status-author {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .status-time {
          font-size: 12px;
          color: #4a4a4a;
        }
        .MenuBox {
          border: 1px solid #5e5e5e;
          background: #f2f2f2;
          padding: 8px;
        }
        .about-photo {
          width: 100%;
          height: auto;
          border: 1px solid #5e5e5e;
          background: #fff;
          margin-bottom: 8px;
          display: block;
        }
      `}</style>
      <div className="header" />
      <div className="container">
        <aside id="Left-column">
          <img className="about-photo" src="/pfpp.jpg" alt="lucy" />
          <div className="MenuBox">
            <div className="panel-title">about me</div>
            <div>heey! i'm lucy, this is my status page</div>
          </div>
        </aside>
        <main id="holder">
          <h1>status</h1>
          <hr />
          <div className="comment-rules">
            <ul>
              <li>Only me can post here.</li>
            </ul>
          </div>
          <section>
            <div className="panel-title">Post a Status</div>
            <form onSubmit={handleSubmit} autoComplete="off">
              <div className="name-row">
                <div>
                  <label>Your Name</label>
                  <input
                    type="text" value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={30} required />
                  <div className="status-emoji-row">
                    <button
                      type="button"
                      className="emoji-toggle"
                      onClick={() => setShowStatusEmojiPicker(current => !current)}
                      disabled={emojiList.length === 0 || !isAuthed}
                    >
                      {emojiList.length === 0 ? 'No emojis found' : 'Status Emoji'}
                    </button>
                    {statusEmojiName && emojiMap[statusEmojiName] && (
                      <img
                        className="status-emoji-preview"
                        src={emojiMap[statusEmojiName]}
                        alt={statusEmojiName}
                      />
                    )}
                    {statusEmojiName && (
                      <button
                        type="button"
                        className="status-emoji-clear"
                        onClick={() => setStatusEmojiName('')}
                        disabled={!isAuthed}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    className="avatar-button"
                    onClick={() => setShowAvatarUploader(current => !current)}
                    disabled={!isAuthed}
                  >
                    Avatar
                  </button>
                  {avatarDataUrl && (
                    <img className="avatar-preview" src={avatarDataUrl} alt="avatar" />
                  )}
                </div>
              </div>
              {showAvatarUploader && (
                <div
                  className="avatar-drop"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    handleAvatarFile(file);
                  }}
                >
                  Drop image here or (max 5MB)
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleAvatarFile(e.target.files?.[0])}
                    style={{ display: 'block', margin: '6px auto 0' }}
                    disabled={!isAuthed}
                  />
                </div>
              )}
              {showStatusEmojiPicker && (
                <div className="emoji-panel">
                  {emojiList.map(emoji => (
                    <button
                      key={`status-${emoji.name}`}
                      type="button"
                      className="emoji-item"
                      title={`:${emoji.name}:`}
                      onClick={() => setStatusEmoji(emoji.name)}
                    >
                      <img src={emoji.url} alt={emoji.name} />
                    </button>
                  ))}
                </div>
              )}
              <label>Status</label>
              <textarea
                value={message}
                onChange={e => { setMessage(e.target.value); setCharCount(e.target.value.length); }}
                maxLength={MAX_CHARS}
                rows={3}
                required
                disabled={!isAuthed}
              />
              <div className="form-actions">
                <div className="char-count">{charCount}/{MAX_CHARS}</div>
                <button
                  type="button"
                  className="emoji-toggle"
                  onClick={() => setShowEmojiPicker(current => !current)}
                  disabled={emojiList.length === 0 || !isAuthed}
                >
                  {emojiList.length === 0 ? 'No emojis found' : 'Emojis'}
                </button>
              </div>
              {showEmojiPicker && (
                <div className="emoji-panel">
                  {emojiList.map(emoji => (
                    <button
                      key={emoji.name}
                      type="button"
                      className="emoji-item"
                      title={`:${emoji.name}:`}
                      onClick={() => insertEmoji(emoji.name)}
                    >
                      <img src={emoji.url} alt={emoji.name} />
                    </button>
                  ))}
                </div>
              )}
              <button type="submit" disabled={!isAuthed}>Post Status</button>
            </form>
          </section>
          <hr />
          <section>
            <div className="panel-title">Latest Status</div>
            {statusList.length === 0 ? (
              <div className="status-card">No status yet.</div>
            ) : (
              statusList.map(s => (
                <div key={s.id || s.created_at} className="status-card">
                  <div className="status-author">
                    {s.avatar_url && (
                      <img className="avatar-preview" src={s.avatar_url} alt="avatar" />
                    )}
                    {renderWithEmojis(s.name)}
                  </div>
                  <div>{renderWithEmojis(s.message)}</div>
                  <div className="status-time">{getTimeAgo(s.created_at)}</div>
                </div>
              ))
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
