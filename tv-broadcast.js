// One real media element feeds the authored curved TV screen through its
// existing canvas texture. Channel changes reuse the element and texture.
const CHANNELS = [
  {
    label: '1962  TELSTAR NEWSREEL',
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/0/0c/1962-07-12_A_Day_in_History.webm/1962-07-12_A_Day_in_History.webm.240p.vp9.webm',
  },
  {
    label: '1956  EISENHOWER CAMPAIGN',
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/4d/Dwight_Eisenhower_1956_Commercial_-_Cab_Driver_%26_His_Dog_in_DC.webm/Dwight_Eisenhower_1956_Commercial_-_Cab_Driver_%26_His_Dog_in_DC.webm.240p.vp9.webm',
  },
  {
    label: '1970s  NESTLE QUIK',
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/e/ee/1970s_Nestle_Quik_commercial.webm/1970s_Nestle_Quik_commercial.webm.240p.vp9.webm',
  },
  {
    label: '1903  THE GREAT TRAIN ROBBERY',
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/42/The_Great_Train_Robbery_%281903%29_-_yt.webm/The_Great_Train_Robbery_%281903%29_-_yt.webm.240p.vp9.webm',
  },
  {
    label: 'BBC WORLD NEWS / ARCHIVE FILM',
    url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/0/0c/1962-07-12_A_Day_in_History.webm/1962-07-12_A_Day_in_History.webm.240p.vp9.webm',
    news: true,
  },
];

export function createTVBroadcast({ canvas, context, texture, screenMaterial, drawStatic }) {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.autoplay = true;
  video.loop = true;
  video.preload = 'auto';
  video.muted = true; // Browsers allow silent autoplay; sound needs a click.
  video.volume = 0.35;
  video.style.display = 'none';
  video.setAttribute('aria-hidden', 'true');
  document.body.appendChild(video);

  let channel = 0;
  let powered = false;
  let state = 'loading';
  let volumeStep = 0;
  let burstUntil = 0;
  let lastFrame = 0;
  let sourceVersion = 0;
  let headlines = [];
  let newsError = false;
  let newsFetchedAt = 0;

  async function fetchNews() {
    if (Date.now() - newsFetchedAt < 300000) return;
    newsFetchedAt = Date.now();
    try {
      const response = await fetch('/api/news', { cache: 'no-store' });
      if (!response.ok) throw new Error(`News ${response.status}`);
      const data = await response.json();
      headlines = Array.isArray(data.headlines) ? data.headlines.filter(h => typeof h === 'string') : [];
      newsError = !headlines.length;
    } catch {
      headlines = [];
      newsError = true;
    }
  }

  function label(text, y = canvas.height - 11) {
    context.fillStyle = 'rgba(0,0,0,.83)';
    context.fillRect(0, y - 13, canvas.width, 18);
    context.fillStyle = '#e6e8d9';
    context.font = 'bold 10px monospace';
    context.fillText(text, 8, y);
  }

  function status(text) {
    drawStatic();
    if (!powered) return;
    context.fillStyle = 'rgba(1,8,5,.6)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#d9ead9';
    context.font = 'bold 12px monospace';
    context.textAlign = 'center';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    context.textAlign = 'left';
    label(`CH ${channel + 1}  ${CHANNELS[channel].label}`);
    texture.needsUpdate = true;
  }

  function play() {
    if (!powered) return;
    const version = sourceVersion;
    const attempt = video.play();
    if (attempt) attempt.catch(() => {
      if (version === sourceVersion && powered) {
        state = 'blocked';
        status('CLICK TV TO PLAY');
      }
    });
  }

  function tune() {
    sourceVersion++;
    video.pause();
    state = 'loading';
    status('TUNING...');
    video.src = CHANNELS[channel].url;
    video.load();
    play();
    if (CHANNELS[channel].news) fetchNews();
  }

  video.addEventListener('playing', () => { if (powered) state = 'playing'; });
  video.addEventListener('error', () => {
    if (powered) { state = 'error'; status('NO SIGNAL'); }
  });
  video.addEventListener('stalled', () => {
    if (powered && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      state = 'loading'; status('TUNING...');
    }
  });

  function powerOn() {
    if (powered) return;
    powered = true;
    screenMaterial.color.set(0xffffff);
    screenMaterial.emissive.set(0xffffff);
    screenMaterial.emissiveMap = texture;
    screenMaterial.emissiveIntensity = 0.72;
    screenMaterial.needsUpdate = true;
    tune();
  }

  function powerOff() {
    if (!powered) return;
    powered = false;
    sourceVersion++;
    video.pause();
    video.removeAttribute('src');
    video.load();
    screenMaterial.color.set(0x394238);
    screenMaterial.emissive.set(0x1f281e);
    screenMaterial.emissiveMap = null;
    screenMaterial.emissiveIntensity = 0.12;
    screenMaterial.needsUpdate = true;
    drawStatic();
  }

  function nextChannel() {
    channel = (channel + 1) % CHANNELS.length;
    if (powered) tune();
  }

  function turnVolume() {
    volumeStep = (volumeStep + 1) % 5;
    video.muted = volumeStep === 0;
    video.volume = [0, 0.18, 0.35, 0.55, 0.8][volumeStep];
    play(); // This call occurs from the physical dial's user gesture.
  }

  function engage() { play(); }
  function glitch(seconds = 12) { burstUntil = performance.now() + seconds * 1000; }

  function drawGlitch(now) {
    const w = canvas.width, h = canvas.height;
    for (let i = 0; i < 17; i++) {
      const y = Math.random() * h;
      const height = 2 + Math.random() * 22;
      context.fillStyle = Math.random() < .35 ? 'rgba(255,255,255,.85)' : 'rgba(3,18,22,.95)';
      context.fillRect(0, y, w, height);
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try { context.drawImage(video, 0, y, w, height, (Math.random() - .5) * 65, y, w, height); } catch {}
      }
    }
    if (Math.random() < .4) {
      context.fillStyle = 'rgba(255,255,255,.6)';
      context.fillRect(0, 0, w, h);
    }
    label(now % 350 < 170 ? 'SIGNAL OVERRIDE  //  ??' : 'CARRIER LOST  //  07');
  }

  function update(now) {
    if (!powered || now - lastFrame < 40) return;
    lastFrame = now;
    if (state === 'playing' && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (CHANNELS[channel].news) {
          const headline = headlines.length ? headlines[Math.floor(now / 6500) % headlines.length] :
            (newsError ? 'NEWS FEED UNAVAILABLE' : 'FETCHING BBC WORLD NEWS...');
          label(`BBC NEWS: ${headline.slice(0, 37)}`);
          context.fillStyle = 'rgba(0,0,0,.78)';
          context.fillRect(0, 0, canvas.width, 15);
          context.fillStyle = '#eee9da';
          context.font = 'bold 9px monospace';
          context.fillText('LIVE HEADLINES / 1962 ARCHIVE FILM', 6, 11);
        } else {
          label(`CH ${channel + 1}  ${CHANNELS[channel].label}`);
        }
      } catch {
        state = 'error'; status('NO SIGNAL');
      }
    } else if (now < burstUntil) {
      drawStatic();
    } else {
      return;
    }
    if (now < burstUntil) drawGlitch(now);
    texture.needsUpdate = true;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause(); else play();
  });
  window.addEventListener('pagehide', () => { video.pause(); video.removeAttribute('src'); video.load(); });

  return {
    powerOn, powerOff, nextChannel, turnVolume, engage, glitch, update,
    get state() { return state; },
    get channel() { return channel; },
    get volumeStep() { return volumeStep; },
    get video() { return video; },
  };
}
