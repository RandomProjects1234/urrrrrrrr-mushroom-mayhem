import { CONFIG, MUSHROOMS, cleanName, clamp } from './config.js';

const $ = id => document.getElementById(id);
const node = (tag, className, value) => {
  const el = document.createElement(tag); if (className) el.className = className;
  if (value !== undefined) el.textContent = value; return el;
};
export const hexColor = color => `#${color.toString(16).padStart(6, '0')}`;

export class UI {
  constructor(audio) {
    this.audio = audio; this.handlers = new Map(); this.screen = 'menu'; this.feedItems = [];
    this.settings = { volume: 45, sensitivity: 100, quality: 'high', reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
    try {
      const stored = JSON.parse(localStorage.getItem('urrr-settings') || 'null');
      if (stored && typeof stored === 'object') {
        if (Number.isFinite(stored.volume)) this.settings.volume = clamp(stored.volume, 0, 100);
        if (Number.isFinite(stored.sensitivity)) this.settings.sensitivity = clamp(stored.sensitivity, 20, 200);
        if (['low', 'high'].includes(stored.quality)) this.settings.quality = stored.quality;
        if (typeof stored.reduceMotion === 'boolean') this.settings.reduceMotion = stored.reduceMotion;
      }
      $('display-name').value = cleanName(localStorage.getItem('urrr-name') || 'Boot Enjoyer');
    } catch { /* Storage is optional in private/restricted browsing. */ }
    this.bind(); this.renderSettings();
    $('mobile-notice').hidden = !(matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);
    for (const data of Object.values(MUSHROOMS)) {
      const item = node('div'); const title = node('b', '', `${data.symbol} ${data.name}`); title.style.color = hexColor(data.color);
      item.append(title, node('p', '', data.detail)); $('mushroom-guide').append(item);
    }
  }
  on(type, callback) { this.handlers.set(type, callback); }
  emit(type, data) { this.handlers.get(type)?.(data); }
  name() {
    const name = cleanName($('display-name').value); $('display-name').value = name;
    try { localStorage.setItem('urrr-name', name); } catch { /* Optional. */ }
    return name;
  }
  bind() {
    const click = (id, handler) => $(id).addEventListener('click', () => { this.audio.unlock(); this.audio.play('click'); handler(); });
    click('host', () => this.emit('host', this.name()));
    click('practice', () => this.emit('practice', this.name()));
    click('join-open', () => { this.name(); $('join-dialog').showModal(); $('join-code').focus(); });
    click('help-open', () => $('help-dialog').showModal());
    click('settings-open', () => $('settings-dialog').showModal());
    click('start', () => this.emit('start'));
    click('replay', () => this.emit('start'));
    for (const id of ['leave-lobby', 'leave-results', 'leave-game']) click(id, () => this.emit('leave'));
    click('capture', () => this.emit('capture'));
    click('pause-open', () => this.pause());
    click('resume', () => { $('pause-dialog').close(); this.emit('capture'); });
    click('pause-settings', () => { $('pause-dialog').close(); $('settings-dialog').showModal(); });
    click('copy-code', async () => {
      const code = $('room-code').textContent;
      try { await navigator.clipboard.writeText(code); this.toast('ROOM CODE COPIED. Send it to your fellow boot enthusiasts.'); }
      catch {
        const range = document.createRange(); range.selectNodeContents($('room-code'));
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        this.toast('Code selected. Press Ctrl+C (or Cmd+C) to copy.');
      }
    });
    $('join-form').addEventListener('submit', event => {
      event.preventDefault(); this.audio.unlock(); this.emit('join', { name: this.name(), room: $('join-code').value });
    });
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    for (const id of ['volume', 'sensitivity', 'quality', 'reduce-motion']) {
      $(id).addEventListener('input', () => {
        this.settings = { volume: Number($('volume').value), sensitivity: Number($('sensitivity').value),
          quality: $('quality').value, reduceMotion: $('reduce-motion').checked };
        this.renderSettings(); this.emit('settings', this.settings);
        try { localStorage.setItem('urrr-settings', JSON.stringify(this.settings)); } catch { /* Optional. */ }
      });
    }
  }
  renderSettings() {
    for (const key of ['volume', 'sensitivity', 'quality']) $(key).value = this.settings[key];
    $('reduce-motion').checked = this.settings.reduceMotion;
    $('volume-value').textContent = `${this.settings.volume}%`;
    $('sensitivity-value').textContent = `${(this.settings.sensitivity / 100).toFixed(1)}×`;
    document.body.classList.toggle('reduced-motion', this.settings.reduceMotion);
    this.audio.setVolume(this.settings.volume / 100);
  }
  busy(active, joining = false) {
    const buttons = joining ? ['join-submit'] : ['host', 'join-open', 'practice'];
    for (const id of buttons) $(id).disabled = active;
    if (joining) $('join-submit').textContent = active ? 'FINDING YOUR FOREST…' : 'ENTER THE FOREST →';
    else $('host').replaceChildren(document.createTextNode(active ? 'GROWING A ROOM…' : 'HOST GAME'), node('span', '', '↗'));
  }
  show(screen) {
    this.screen = screen;
    for (const name of ['menu', 'lobby', 'hud', 'results']) $(name).hidden = name !== screen;
    $('brand-bar').hidden = screen === 'hud'; $('footer').hidden = screen === 'hud';
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    if (screen !== 'hud') document.exitPointerLock?.();
    if (screen === 'menu') this.busy(false);
    if (screen === 'hud') { $('event-feed').replaceChildren(); $('capture').hidden = false; }
  }
  lobby(players, room, host, localId, hostId, practice = false) {
    if (this.screen !== 'lobby') this.show('lobby');
    $('room-code').textContent = practice ? 'SOLO PRACTICE' : room;
    $('copy-code').hidden = practice;
    $('lobby-count').textContent = `${players.length} / ${CONFIG.maxPlayers}`;
    $('lobby-players').replaceChildren();
    for (let i = 0; i < CONFIG.maxPlayers; i++) {
      const p = players[i], row = node('div', `lobby-player${p ? '' : ' waiting'}`);
      const swatch = node('span', 'swatch'); if (p) swatch.style.background = hexColor(p.color);
      row.append(swatch, node('span', '', p ? `${p.name}${p.id === localId ? ' (you)' : ''}` : 'Waiting…'));
      if (p?.id === hostId) row.append(node('span', 'host-tag', 'HOST'));
      $('lobby-players').append(row);
    }
    $('start').disabled = !host; $('start').textContent = host ? 'START THE MAYHEM ↗' : 'WAITING FOR HOST…';
    $('lobby-hint').textContent = practice ? 'A solo sandbox with the same game rules. Host a room from the menu to invite friends.'
      : host ? 'Send friends this page’s URL and the room code. Keep this tab open while hosting.' : 'You’re connected. The host will start the match.';
    $('hud-room').textContent = practice ? 'SOLO PRACTICE' : room;
  }
  updateHUD(state, localId, time, nearby) {
    const seconds = Math.ceil(state.remaining);
    $('timer').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const p = state.players.find(p => p.id === localId); if (!p) return;
    $('health').textContent = Array.from({ length: 3 }, (_, i) => i < p.health ? '♥' : '♡').join(' ');
    $('tnt-count').textContent = `× ${p.tnt}`; $('score').textContent = p.score.toLocaleString();
    $('held').textContent = p.held ? MUSHROOMS[p.held].name : 'EMPTY';
    $('held').style.color = p.held ? hexColor(MUSHROOMS[p.held].color) : '#98a88c';
    $('buff').textContent = p.nextBlast ? `NEXT TNT: ${MUSHROOMS[p.nextBlast].name}` : p.speedUntil > time ? `SPEED ${Math.ceil(p.speedUntil - time)}s` : '';
    const active = p.urrrUntil > time, percent = Math.floor(p.meter);
    $('meter-fill').style.width = `${active ? 100 : percent}%`;
    $('meter-number').textContent = active ? `${Math.ceil(p.urrrUntil - time)}s` : `${percent}%`;
    $('meter-box').classList.toggle('ready', percent === 100 && !active); $('meter-box').classList.toggle('active', active);
    $('meter-caption').textContent = active ? 'URRRR MODE. THESE BOOTS HAVE NO BUSINESS BEING THIS BIG.' : percent === 100 ? 'PRESS R — URRRRRRRRRRRRRRRRRRRRRR' : 'CAUSE CHAOS. FILL METER. LOSE ALL COMMON SENSE.';
    $('respawn').hidden = p.health > 0;
    $('respawn-time').textContent = `Respawning in ${Math.max(1, Math.ceil(p.respawnAt - time))}…`;
    $('capture').hidden = !!document.pointerLockElement || p.health <= 0;
    $('interact-prompt').hidden = !nearby || p.health <= 0;
    if (nearby) $('interact-prompt').textContent = nearby.kind === 'ammo' ? 'E — COLLECT TNT ×3'
      : `E — ${MUSHROOMS[nearby.type].name} MUSHROOM`;
    $('player-list').replaceChildren();
    for (const player of [...state.players].sort((a, b) => b.score - a.score)) {
      const row = node('div', player.id === localId ? 'you' : ''); const swatch = node('span', 'swatch');
      swatch.style.background = hexColor(player.color);
      row.append(swatch, node('span', '', player.name), node('b', '', player.score)); $('player-list').append(row);
    }
  }
  results(data, host) {
    this.show('results'); $('winner').textContent = `${data.players[0]?.name || 'Nobody'} is the most irresponsible person in the forest.`;
    $('scoreboard').replaceChildren();
    data.players.forEach((player, index) => {
      const row = node('div', 'score-row'), swatch = node('span', 'swatch'); swatch.style.background = hexColor(player.color);
      row.append(node('span', 'rank', String(index + 1).padStart(2, '0')), swatch, node('span', '', player.name),
        node('b', 'score-value', player.score.toLocaleString()), node('span', 'kills', `${player.kills} YEETS`)); $('scoreboard').append(row);
    });
    $('awards').replaceChildren();
    for (const [title, name] of data.awards) {
      const award = node('div', 'award'); award.append(node('b', '', title), node('span', '', name)); $('awards').append(award);
    }
    $('replay').disabled = !host; $('replay').textContent = host ? 'PLAY AGAIN ↗' : 'WAITING FOR HOST…';
    $('replay-hint').textContent = host ? 'Same room. Same friends. Even worse decisions.' : 'The host controls the next round. Your connection stays open.';
  }
  pause() {
    if (this.screen !== 'hud' || document.querySelector('dialog[open]')) return;
    document.exitPointerLock?.(); $('pause-dialog').showModal(); this.emit('release');
  }
  toast(message, error = false) {
    $('toast').textContent = message; $('toast').hidden = false; $('toast').classList.toggle('error', error);
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 10000 : 6000);
  }
  feed(message) {
    const item = node('div', '', message); $('event-feed').prepend(item);
    while ($('event-feed').children.length > 4) $('event-feed').lastChild.remove();
    setTimeout(() => item.remove(), 5000);
  }
  urrrBanner() {
    if (this.settings.reduceMotion) return;
    $('urrr-banner').hidden = false; clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { $('urrr-banner').hidden = true; }, 1800);
  }
}
