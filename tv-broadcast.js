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
// Each station keeps its established first broadcast, then continues with
// other archival media already carried by this TV instead of looping one clip.
const VHF_PROGRAMS = new Map([
  [2,[0,3,1,2]], [4,[1,2,0,3]], [7,[2,1,3,0]],
  [9,[3,0,2,1]], [13,[4,3,2,1]],
]);
const UHF_STATIONS = [
  { at: .18, playlist: [2,1,0,3] },
  { at: .51, playlist: [3,0,1,2] },
  { at: .82, playlist: [4,3,2,1], news: true },
];
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));

export function createTVBroadcast({ canvas, context, texture, screenMaterial, drawStatic }) {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.autoplay = true;
  video.loop = false;
  video.preload = 'auto';
  video.muted = true; // Browsers allow silent autoplay; sound needs a click.
  video.volume = 0.35;
  video.style.display = 'none';
  video.setAttribute('aria-hidden', 'true');
  document.body.appendChild(video);

  let vhf = 2;
  let uhf = 0;
  let band = 'vhf';
  let activeProgram = null;
  let activeStation = null;
  let playlist = [];
  let playlistIndex = 0;
  let newsMode = false;
  let signalStrength = 1;
  let brightness = .7;
  let volume = 0;
  let audioUnlocked = false;
  let powered = false;
  let state = 'loading';
  let burstUntil = 0;
  let transitionUntil = 0;
  let lastFrame = 0;
  let sourceVersion = 0;
  let disposed = false;
  let noiseContext = null;
  let noiseGain = null;
  let noiseSource = null;
  let headlines = [];
  let newsError = false;
  let newsFetchedAt = 0;
  let newsStart = 0;

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
    label(text === 'TUNING...' ? band.toUpperCase() : tuningLabel());
    texture.needsUpdate = true;
  }

  function tuningLabel() {
    return band === 'vhf' ? `VHF ${vhf}` : `UHF ${Math.round(14 + uhf * 55)}`;
  }

  function reception() {
    if (band === 'vhf') {
      const programs = VHF_PROGRAMS.get(vhf);
      return { station: programs ? `vhf-${vhf}` : null, playlist: programs || [],
        news: vhf === 13, strength: programs ? 1 : 0 };
    }
    const station = UHF_STATIONS.reduce((best, item) =>
      Math.abs(item.at - uhf) < Math.abs(best.at - uhf) ? item : best);
    const distance = Math.abs(station.at - uhf);
    return { station: distance < .105 ? `uhf-${station.at}` : null,
      playlist: distance < .105 ? station.playlist : [], news: !!station.news,
      strength: distance < .105 ? Math.pow(1 - distance / .105, 1.35) : 0 };
  }

  function applyBrightness() {
    const level = powered ? brightness : 0;
    screenMaterial.color.setScalar(level);
    screenMaterial.emissive.setScalar(level);
    screenMaterial.emissiveIntensity = powered ? .72 : 0;
  }

  function ensureReceptionNoise() {
    if (noiseContext || disposed) return;
    try {
      noiseContext = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = noiseContext.createBuffer(1, noiseContext.sampleRate, noiseContext.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      noiseSource = noiseContext.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;
      const filter = noiseContext.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 3600;
      noiseGain = noiseContext.createGain();
      noiseGain.gain.value = 0;
      noiseSource.connect(filter).connect(noiseGain).connect(noiseContext.destination);
      noiseSource.start();
    } catch {
      noiseContext?.close().catch(() => {});
      noiseContext = null; noiseGain = null; noiseSource = null;
    }
  }

  function applyAudio() {
    video.muted = !powered || !audioUnlocked || volume === 0 || signalStrength < .025 ||
      performance.now() < transitionUntil;
    video.volume = Math.min(1, volume * signalStrength);
    if (noiseGain && noiseContext) {
      const noisy = activeProgram === null || state !== 'playing' ? 1 : 1 - signalStrength;
      const target = powered && !document.hidden && audioUnlocked ?
        volume * Math.min(.075, noisy * .035 + (performance.now() < transitionUntil ? .04 : 0)) : 0;
      noiseGain.gain.setTargetAtTime(target, noiseContext.currentTime, .025);
    }
  }

  function play() {
    if (!powered || activeProgram === null || disposed) return;
    const version = sourceVersion;
    const attempt = video.play();
    if (attempt) attempt.catch(() => {
      if (version === sourceVersion && powered) {
        // Keep the picture moving when the browser refuses unmuted autoplay.
        audioUnlocked = false;
        applyAudio();
        video.play().catch(() => {
          if (version === sourceVersion) { state = 'blocked'; status('CLICK TV TO PLAY'); }
        });
      }
    });
  }

  function stopSource() {
    sourceVersion++;
    video.pause();
    video.removeAttribute('src');
    video.load();
    activeProgram = null;
    activeStation = null;
    playlist = [];
    newsMode = false;
    state = 'static';
  }

  function loadProgram(program) {
    sourceVersion++;
    video.pause();
    activeProgram = program;
    state = 'loading';
    video.src = CHANNELS[activeProgram].url;
    video.load();
    play();
  }

  function tune(forceTransition = true) {
    if (!powered || disposed) return;
    const next = reception();
    signalStrength = next.strength;
    if (forceTransition || next.station !== activeStation)
      transitionUntil = performance.now() + 260;
    if (next.station !== activeStation) {
      if (next.station === null) {
        stopSource();
      } else {
        activeStation = next.station;
        playlist = next.playlist;
        playlistIndex = 0;
        newsMode = next.news;
        loadProgram(playlist[0]);
        if (newsMode) { newsStart = performance.now(); fetchNews(); }
      }
    }
    applyAudio();
  }

  const onPlaying = () => { if (powered && activeProgram !== null) state = 'playing'; };
  const onError = () => {
    if (powered) { state = 'error'; status('NO SIGNAL'); }
  };
  const onStalled = () => {
    if (powered && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      state = 'loading'; status('TUNING...');
    }
  };
  const onEnded = () => {
    if (!powered || !playlist.length) return;
    playlistIndex = (playlistIndex + 1) % playlist.length;
    transitionUntil = performance.now() + 320;
    loadProgram(playlist[playlistIndex]);
    applyAudio();
  };
  video.addEventListener('playing', onPlaying);
  video.addEventListener('error', onError);
  video.addEventListener('stalled', onStalled);
  video.addEventListener('ended', onEnded);

  function powerOn() {
    if (powered) return;
    powered = true;
    screenMaterial.emissiveMap = texture;
    screenMaterial.needsUpdate = true;
    applyBrightness();
    tune();
  }

  function powerOff() {
    if (!powered) return;
    powered = false;
    stopSource();
    signalStrength = 0;
    screenMaterial.emissiveMap = null;
    screenMaterial.needsUpdate = true;
    drawStatic();
    applyBrightness();
    applyAudio();
  }

  function setVHF(value) {
    const next = Math.max(1, Math.min(14, Math.round(Number(value) || 1)));
    if (next === vhf && ((next === 1 && !powered) || (next !== 1 && powered))) return;
    vhf = next;
    band = vhf === 14 ? 'uhf' : 'vhf';
    if (vhf === 1) powerOff();
    else if (!powered) powerOn();
    else tune();
  }

  function setUHF(value) {
    uhf = clamp(value);
    if (band === 'uhf' && powered) tune(false);
  }

  function setVolume(value) {
    volume = clamp(value);
    audioUnlocked = true; // A physical or keyboard control supplied the gesture.
    ensureReceptionNoise();
    if (noiseContext?.state === 'suspended') noiseContext.resume().catch(() => {});
    applyAudio();
    play();
  }

  function setBrightness(value) {
    brightness = clamp(value);
    applyBrightness();
  }

  function engage() {
    if (volume > 0) {
      audioUnlocked = true; ensureReceptionNoise();
      if (noiseContext?.state === 'suspended') noiseContext.resume().catch(() => {});
    }
    applyAudio(); play();
  }
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

  function drawReceptionNoise(amount) {
    const w = canvas.width, h = canvas.height;
    const count = Math.round(4 + amount * 34);
    for (let i = 0; i < count; i++) {
      const y = Math.random() * h;
      context.fillStyle = Math.random() < .5 ?
        `rgba(245,248,239,${amount * .65})` : `rgba(3,9,8,${amount * .9})`;
      context.fillRect(0, y, w, 1 + Math.random() * amount * 9);
    }
    if (amount > .35 && Math.random() < amount * .45) {
      const y = Math.random() * h;
      context.drawImage(canvas, 0, y, w, 10, (Math.random() - .5) * 35, y, w, 10);
    }
  }

  function update(now) {
    if (!powered || now - lastFrame < 40) return false;
    lastFrame = now;
    applyAudio();
    if (activeProgram !== null && state === 'playing' && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (signalStrength < 1) drawReceptionNoise(1 - signalStrength);
        if (newsMode) {
          const headline = headlines.length ? headlines[Math.floor((now - newsStart) / 18000) % headlines.length] :
            (newsError ? 'NEWS FEED UNAVAILABLE' : 'FETCHING BBC WORLD NEWS...');
          const ticker = `BBC NEWS: ${headline}`;
          context.fillStyle = 'rgba(0,0,0,.85)';
          context.fillRect(0, canvas.height - 24, canvas.width, 24);
          context.fillStyle = '#e6e8d9';
          context.font = 'bold 10px monospace';
          const x = canvas.width - ((now - newsStart) % 18000) * .06;
          context.save();
          context.beginPath();
          context.rect(0, canvas.height - 24, canvas.width, 24);
          context.clip();
          context.fillText(ticker, x, canvas.height - 8);
          context.restore();
          context.fillStyle = 'rgba(0,0,0,.78)';
          context.fillRect(0, 0, canvas.width, 15);
          context.fillStyle = '#eee9da';
          context.font = 'bold 9px monospace';
          context.fillText('LIVE HEADLINES / 1962 ARCHIVE FILM', 6, 11);
        } else {
          label(`${tuningLabel()}  ${CHANNELS[activeProgram].label}`);
        }
      } catch {
        state = 'error'; status('NO SIGNAL');
      }
    } else {
      drawStatic();
      label(`${tuningLabel()}  ${state === 'error' ? 'NO SIGNAL' : activeProgram === null ? 'NO SIGNAL' : 'TUNING...'}`);
    }
    if (now < transitionUntil) drawReceptionNoise(.85);
    if (now < burstUntil) drawGlitch(now);
    texture.needsUpdate = true;
    return true;
  }

  const onVisibility = () => {
    if (document.hidden) video.pause(); else play();
    applyAudio();
  };
  const onPageShow = () => { if (!disposed) { play(); applyAudio(); } };
  const onPageHide = event => {
    if (event.persisted) {
      video.pause();
      if (noiseGain) noiseGain.gain.value = 0;
    } else dispose();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopSource();
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('error', onError);
    video.removeEventListener('stalled', onStalled);
    video.removeEventListener('ended', onEnded);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('pagehide', onPageHide);
    video.remove();
    if (noiseSource) noiseSource.stop();
    noiseContext?.close().catch(() => {});
    noiseSource = null; noiseGain = null; noiseContext = null;
  }

  return {
    powerOn, powerOff, setVHF, setUHF, setVolume, setBrightness,
    engage, glitch, update, dispose,
    get state() { return state; },
    get vhf() { return vhf; },
    get uhf() { return uhf; },
    get band() { return band; },
    get volume() { return volume; },
    get brightness() { return brightness; },
    get signalStrength() { return signalStrength; },
    get noiseLevel() { return noiseGain?.gain.value || 0; },
    get activeProgram() { return activeProgram; },
    get video() { return video; },
  };
}
