/**
 * 极简英文 · 听与练 (Minimal English Listener)
 * Pure & Distraction-Free Application Logic
 */

// ==================== 1. INDEXEDDB AUDIO STORAGE ====================
const DB_NAME = 'MinimalEnglishListenerDB';
const DB_VERSION = 1;
const STORE_NAME = 'audio_files';

function openAudioDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveAudioBlob(id, blob, filename) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ id, blob, filename, type: blob.type, updatedAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAudioBlob(id) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteAudioBlob(id) {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// ==================== 2. DEFAULT DEMO LESSONS ====================
const DEFAULT_LESSONS = [
  {
    id: "lesson_1",
    title: "The Art of Active Listening (倾听的艺术)",
    category: "哲理美文",
    audioSourceType: "builtin",
    audioUrl: "sample_lesson1.mp3",
    audioBlobId: null,
    duration: 26.22,
    favorite: true,
    completed: false,
    updatedAt: Date.now(),
    sentences: [
      {
        id: "s_1",
        startTime: 0.0,
        endTime: 5.52,
        text: "To listen well is as powerful a means of influence as to talk well.",
        trans: "善于倾听和善于言辞具有同等强大的感染力。"
      },
      {
        id: "s_2",
        startTime: 5.52,
        endTime: 11.6,
        text: "True listening requires patience, curiosity, and an open heart.",
        trans: "真正的倾听需要耐心、好奇心和开放的心胸。"
      },
      {
        id: "s_3",
        startTime: 11.6,
        endTime: 19.34,
        text: "When you listen with focused attention, you notice the subtle nuances in pronunciation and tone.",
        trans: "当你全神贯注地倾听时，你会注意到发音与语调中的微妙细节。"
      },
      {
        id: "s_4",
        startTime: 19.34,
        endTime: 26.22,
        text: "Small daily habits of active listening will quietly transform your English fluency.",
        trans: "每天坚持主动精听的微小习惯，会悄然重塑你的英语流利度。"
      }
    ],
    notes: "倾听的4个要点，重点练习弱读与连读"
  },
  {
    id: "lesson_2",
    title: "Airport Travel & Check-in (实用日常 · 机场值机)",
    category: "日常生活",
    audioSourceType: "builtin",
    audioUrl: "sample_lesson2.mp3",
    audioBlobId: null,
    duration: 27.98,
    favorite: false,
    completed: false,
    updatedAt: Date.now() - 3600000,
    sentences: [
      {
        id: "s_1",
        startTime: 0.0,
        endTime: 6.64,
        text: "Excuse me, could you tell me where I can check in for flight BA two four nine?",
        trans: "打扰一下，请问我在哪里可以办理英国航空 BA249 航班的值机手续？"
      },
      {
        id: "s_2",
        startTime: 6.64,
        endTime: 15.18,
        text: "Sure thing! Economy check-in is at counter C twelve, just past the security checkpoint.",
        trans: "没问题！经济舱值机在 C12 柜台，就在安检通道的正前方。"
      },
      {
        id: "s_3",
        startTime: 15.18,
        endTime: 21.8,
        text: "Thank you so much. Do I need to weigh my carry-on bag here as well?",
        trans: "非常感谢。请问我的随身行李也需要在这里称重吗？"
      },
      {
        id: "s_4",
        startTime: 21.8,
        endTime: 27.98,
        text: "Only if it looks oversized. Have a wonderful and safe flight today!",
        trans: "只有看起来超规时才需要。祝您今天旅途愉快、飞行平安！"
      }
    ],
    notes: "机场出行高频日常对话，适合影子跟读与听写"
  }
];

// ==================== 3. APP LOGIC ====================
class ListenerApp {
  constructor() {
    this.lessons = this.loadLessons();
    this.vocabList = this.loadVocab();
    this.settings = this.loadSettings();

    this.currentLesson = null;
    this.currentSentenceIndex = -1;
    this.dictationIndex = 0;

    // Player state
    this.audio = document.getElementById('nativeAudio');
    this.isPlaying = false;
    this.loopMode = 'single'; // 'none' | 'single' | 'ab'
    this.abLoop = { active: false, a: null, b: null };
    this.isAutoPausing = false;
    this.autoPauseTimer = null;
    this.lastSentenceAutoPaused = -1;
    this.blobUrlCache = null;

    // Dict cache
    this.dictCache = {};

    this.initDOM();
    this.bindEvents();
    this.applySettings();

    this.renderLibrary();
    this.renderVocabList();
    this.registerServiceWorker();
  }

  loadLessons() {
    try {
      const data = localStorage.getItem('minimal_listener_lessons');
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load lessons:', e);
    }
    this.saveLessonsToStorage(DEFAULT_LESSONS);
    return JSON.parse(JSON.stringify(DEFAULT_LESSONS));
  }

  saveLessonsToStorage(lessons) {
    localStorage.setItem('minimal_listener_lessons', JSON.stringify(lessons || this.lessons));
  }

  loadVocab() {
    try {
      const data = localStorage.getItem('minimal_listener_vocab');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  saveVocabToStorage() {
    localStorage.setItem('minimal_listener_vocab', JSON.stringify(this.vocabList));
    this.updateVocabBadge();
  }

  loadSettings() {
    const defaults = {
      theme: 'warm',
      font: 'serif',
      fontSize: 19,
      speed: 1.0,
      autoPauseSec: 2,
      rewindStep: 5,
      showTrans: true,
      blindMode: false
    };
    try {
      const saved = localStorage.getItem('minimal_listener_settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch (e) {
      return defaults;
    }
  }

  saveSettings() {
    localStorage.setItem('minimal_listener_settings', JSON.stringify(this.settings));
  }

  initDOM() {
    // Containers
    this.appContainer = document.getElementById('appContainer');
    this.listenerContainer = document.getElementById('listenerContainer');

    // Bottom Navigation (Main Screen)
    this.navItems = document.querySelectorAll('.bottom-nav .nav-item');
    this.viewPanels = document.querySelectorAll('.view-panel');

    // Immersive Header Elements
    this.btnListenerBack = document.getElementById('btnListenerBack');
    this.listenerHeaderTitle = document.getElementById('listenerHeaderTitle');
    this.btnToggleBlind = document.getElementById('btnToggleBlind');
    this.blindModeLabel = document.getElementById('blindModeLabel');
    this.btnToggleTrans = document.getElementById('btnToggleTrans');
    this.btnToggleDictation = document.getElementById('btnToggleDictation');
    this.btnEditCurrent = document.getElementById('btnEditCurrent');
    this.sentencesStream = document.getElementById('sentencesStream');

    // Bottom Player Controls
    this.btnPlayPause = document.getElementById('btnPlayPause');
    this.iconPlay = document.getElementById('iconPlay');
    this.iconPause = document.getElementById('iconPause');
    this.btnRewind = document.getElementById('btnRewind');
    this.btnForward = document.getElementById('btnForward');
    this.btnLoopMode = document.getElementById('btnLoopMode');
    this.loopModeIcon = document.getElementById('loopModeIcon');
    this.loopModeText = document.getElementById('loopModeText');
    this.btnSpeedPicker = document.getElementById('btnSpeedPicker');
    this.speedMenu = document.getElementById('speedMenu');
    this.speedValueLabel = document.getElementById('speedValueLabel');

    // Timeline Scrubber
    this.timelineBar = document.getElementById('timelineBar');
    this.timelineProgress = document.getElementById('timelineProgress');
    this.timelineBuffered = document.getElementById('timelineBuffered');
    this.timelineThumb = document.getElementById('timelineThumb');
    this.timelineAb = document.getElementById('timelineAb');
    this.timeCurrent = document.getElementById('timeCurrent');
    this.timeDuration = document.getElementById('timeDuration');

    // Dictation Bottom Sheet
    this.dictationBackdrop = document.getElementById('dictationBackdrop');
    this.dictationSheet = document.getElementById('dictationSheet');
    this.dictationStepBadge = document.getElementById('dictationStepBadge');
    this.dictationTextarea = document.getElementById('dictationTextarea');
    this.btnDictationCheck = document.getElementById('btnDictationCheck');
    this.btnDictationNext = document.getElementById('btnDictationNext');
    this.btnDictationReplay = document.getElementById('btnDictationReplay');
    this.btnDictationClose = document.getElementById('btnDictationClose');
    this.dictationDiffBox = document.getElementById('dictationDiffBox');
    this.diffViewContent = document.getElementById('diffViewContent');
    this.diffViewTrans = document.getElementById('diffViewTrans');
    this.diffScoreBadge = document.getElementById('diffScoreBadge');

    // Word Bottom Sheet
    this.wordBackdrop = document.getElementById('wordBackdrop');
    this.wordBottomSheet = document.getElementById('wordBottomSheet');
    this.sheetWordTitle = document.getElementById('sheetWordTitle');
    this.sheetWordPhonetic = document.getElementById('sheetWordPhonetic');
    this.sheetWordMeanings = document.getElementById('sheetWordMeanings');
    this.sheetSentenceCtx = document.getElementById('sheetSentenceCtx');
    this.btnSpeakWord = document.getElementById('btnSpeakWord');
    this.btnSaveToVocab = document.getElementById('btnSaveToVocab');

    // Modal
    this.modalEditLesson = document.getElementById('modalEditLesson');
    this.formEditLesson = document.getElementById('formEditLesson');
    this.fileDropZone = document.getElementById('fileDropZone');
    this.fileDropText = document.getElementById('fileDropText');
    this.editAudioFile = document.getElementById('editAudioFile');

    this.pendingAudioBlob = null;
    this.pendingAudioFilename = null;
  }

  // ==================== 4. EVENT BINDINGS ====================
  bindEvents() {
    // Bottom Navigation (Main Screen)
    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetTab = item.getAttribute('data-tab');
        this.switchMainTab(targetTab);
      });
    });

    // Main Header
    document.getElementById('btnQuickTheme').addEventListener('click', () => this.toggleTheme());
    document.getElementById('btnNewLesson').addEventListener('click', () => this.openEditModal());

    // Immersive Header Actions
    this.btnListenerBack.addEventListener('click', () => this.closeImmersiveReader());
    this.btnToggleBlind.addEventListener('click', () => this.toggleBlindMode());
    this.btnToggleTrans.addEventListener('click', () => this.toggleTranslation());
    this.btnToggleDictation.addEventListener('click', () => this.openDictationSheet());
    this.btnEditCurrent.addEventListener('click', () => {
      if (this.currentLesson) this.openEditModal(this.currentLesson);
    });

    // Audio Playback Controls
    this.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    this.btnRewind.addEventListener('click', () => this.seekBy(-this.settings.rewindStep));
    this.btnForward.addEventListener('click', () => this.seekBy(this.settings.rewindStep));
    this.btnLoopMode.addEventListener('click', () => this.cycleLoopMode());

    // Speed Picker
    this.btnSpeedPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('show');
    });

    document.querySelectorAll('.speed-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const rate = parseFloat(item.getAttribute('data-rate'));
        this.setPlaybackRate(rate);
        this.speedMenu.classList.remove('show');
      });
    });

    document.addEventListener('click', () => {
      this.speedMenu.classList.remove('show');
    });

    // Timeline Scrubbing
    this.bindTimelineScrubbing();

    // Native Audio Events
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('play', () => this.onAudioPlay());
    this.audio.addEventListener('pause', () => this.onAudioPause());
    this.audio.addEventListener('ended', () => this.onAudioEnded());
    this.audio.addEventListener('loadedmetadata', () => this.onAudioMetadataLoaded());
    this.audio.addEventListener('progress', () => this.updateBufferProgress());

    // Dictation Sheet Events
    this.btnDictationClose.addEventListener('click', () => this.closeDictationSheet());
    this.dictationBackdrop.addEventListener('click', () => this.closeDictationSheet());
    this.btnDictationReplay.addEventListener('click', () => this.replayCurrentSentence());
    this.btnDictationCheck.addEventListener('click', () => this.checkDictationDiff());
    this.btnDictationNext.addEventListener('click', () => this.nextDictationSentence());

    // Word Sheet Events
    this.wordBackdrop.addEventListener('click', () => this.closeWordSheet());

    // Edit Lesson Modal
    document.getElementById('btnCloseEditModal').addEventListener('click', () => this.closeEditModal());
    document.getElementById('btnCancelEditLesson').addEventListener('click', () => this.closeEditModal());
    this.formEditLesson.addEventListener('submit', (e) => this.handleSaveLesson(e));

    // Audio Source Tabs in Modal
    document.querySelectorAll('.source-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const src = tab.getAttribute('data-source');
        document.getElementById('panelSourceFile').style.display = src === 'file' ? 'block' : 'none';
        document.getElementById('panelSourceUrl').style.display = src === 'url' ? 'block' : 'none';
        document.getElementById('panelSourceTts').style.display = src === 'tts' ? 'block' : 'none';
      });
    });

    // File Drag & Drop
    this.fileDropZone.addEventListener('click', () => this.editAudioFile.click());
    this.editAudioFile.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
    this.fileDropZone.addEventListener('dragover', (e) => { e.preventDefault(); this.fileDropZone.classList.add('dragover'); });
    this.fileDropZone.addEventListener('dragleave', () => this.fileDropZone.classList.remove('dragover'));
    this.fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.fileDropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) this.handleFileSelect(e.dataTransfer.files[0]);
    });

    // Quick Tools in Modal
    document.getElementById('btnToolFormat').addEventListener('click', () => this.formatTranscriptInput());
    document.getElementById('btnToolSample').addEventListener('click', () => this.insertSampleTranscript());

    // Settings Controls
    document.querySelectorAll('.theme-pill').forEach(btn => {
      btn.addEventListener('click', () => this.setTheme(btn.getAttribute('data-theme-val')));
    });

    document.querySelectorAll('.font-pill').forEach(btn => {
      btn.addEventListener('click', () => this.setFont(btn.getAttribute('data-font-val')));
    });

    const fontSlider = document.getElementById('fontSizeSlider');
    const fontDisplay = document.getElementById('fontSizeDisplay');
    fontSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      this.settings.fontSize = val;
      fontDisplay.textContent = `${val}px`;
      document.documentElement.style.setProperty('--article-font-size', `${val}px`);
      this.saveSettings();
    });

    document.getElementById('settingAutoPauseSec').addEventListener('change', (e) => {
      this.settings.autoPauseSec = parseInt(e.target.value);
      this.saveSettings();
    });

    document.getElementById('settingRewindStep').addEventListener('change', (e) => {
      this.settings.rewindStep = parseInt(e.target.value);
      document.getElementById('pRewindLabel').textContent = `${this.settings.rewindStep}s`;
      document.getElementById('pForwardLabel').textContent = `${this.settings.rewindStep}s`;
      this.saveSettings();
    });

    // Backup & Restore
    document.getElementById('btnBackupExport').addEventListener('click', () => this.exportBackup());
    const backupInput = document.getElementById('backupFileInput');
    document.getElementById('btnBackupImportTrigger').addEventListener('click', () => backupInput.click());
    backupInput.addEventListener('change', (e) => this.importBackup(e));
    document.getElementById('btnResetDemos').addEventListener('click', () => this.resetToDefaults());

    // Search & Filter
    document.getElementById('librarySearchInput').addEventListener('input', (e) => this.renderLibrary(e.target.value));
    document.querySelectorAll('#libraryFilterPills .pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#libraryFilterPills .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.renderLibrary(document.getElementById('librarySearchInput').value, pill.getAttribute('data-filter'));
      });
    });

    // Vocab actions
    document.getElementById('vocabSearchInput').addEventListener('input', (e) => this.renderVocabList(e.target.value));
    document.getElementById('btnExportVocab').addEventListener('click', () => this.exportVocab());
    document.getElementById('btnClearVocab').addEventListener('click', () => this.clearVocab());

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  // ==================== 5. NAVIGATION & IMMERSIVE READER ====================
  switchMainTab(targetTabId) {
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === targetTabId);
    });
    this.viewPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === targetTabId);
    });

    if (targetTabId === 'viewLibrary') this.renderLibrary();
    if (targetTabId === 'viewVocab') this.renderVocabList();
  }

  async openImmersiveReader(lessonId) {
    const lesson = this.lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    this.currentLesson = lesson;
    this.listenerHeaderTitle.textContent = lesson.title;

    // Load audio
    if (this.blobUrlCache) {
      URL.revokeObjectURL(this.blobUrlCache);
      this.blobUrlCache = null;
    }

    let audioSrc = '';
    if (lesson.audioSourceType === 'builtin') {
      audioSrc = lesson.audioUrl;
    } else if (lesson.audioSourceType === 'file' && lesson.audioBlobId) {
      const blob = await getAudioBlob(lesson.audioBlobId);
      if (blob) {
        this.blobUrlCache = URL.createObjectURL(blob);
        audioSrc = this.blobUrlCache;
      }
    } else if (lesson.audioSourceType === 'url') {
      audioSrc = lesson.audioUrl;
    }

    if (audioSrc) {
      this.audio.src = audioSrc;
      this.audio.load();
    }

    this.currentSentenceIndex = -1;
    this.dictationIndex = 0;
    this.renderSentencesStream();

    this.listenerContainer.classList.add('active');
    this.listenerContainer.scrollTop = 0;
  }

  closeImmersiveReader() {
    this.pauseAudio();
    this.listenerContainer.classList.remove('active');
    this.closeDictationSheet();
    this.closeWordSheet();
  }

  // ==================== 6. CLEAN SENTENCE RENDERING ====================
  renderSentencesStream() {
    if (!this.currentLesson) return;
    this.sentencesStream.innerHTML = '';

    const isBlind = this.settings.blindMode;

    this.currentLesson.sentences.forEach((sent, idx) => {
      const block = document.createElement('div');
      block.className = `sentence-block ${isBlind ? 'blind-mode' : ''}`;
      block.id = `sentence-block-${idx}`;
      block.dataset.index = idx;

      // English text with word tokens
      const enDiv = document.createElement('div');
      enDiv.className = 'sentence-text';
      enDiv.innerHTML = this.tokenizeSentence(sent.text);

      // Chinese translation
      const zhDiv = document.createElement('div');
      zhDiv.className = `sentence-trans ${this.settings.showTrans ? '' : 'hidden'}`;
      zhDiv.textContent = sent.trans || '';

      block.appendChild(enDiv);
      if (sent.trans) block.appendChild(zhDiv);

      // Click behavior
      block.addEventListener('click', (e) => {
        if (e.target.closest('.word-token')) return; // handled by word lookup
        if (this.settings.blindMode) {
          block.classList.toggle('revealed');
        } else {
          this.playSentence(idx);
        }
      });

      this.sentencesStream.appendChild(block);
    });

    this.bindWordTokens();
  }

  tokenizeSentence(text) {
    const regex = /([a-zA-Z0-9'-]+|[^a-zA-Z0-9\s]+|\s+)/g;
    const parts = text.match(regex) || [text];

    return parts.map(part => {
      if (/^[a-zA-Z0-9'-]+$/.test(part)) {
        const clean = part.toLowerCase();
        const isSaved = this.vocabList.some(v => v.word.toLowerCase() === clean);
        return `<span class="word-token ${isSaved ? 'saved-vocab' : ''}" data-word="${part}" data-ctx="${this.escapeHtml(text)}">${part}</span>`;
      }
      return this.escapeHtml(part);
    }).join('');
  }

  bindWordTokens() {
    document.querySelectorAll('.word-token').forEach(token => {
      token.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = token.getAttribute('data-word');
        const ctx = token.getAttribute('data-ctx');
        this.openWordSheet(word, ctx);
      });
    });
  }

  highlightSentence(index, scroll = false) {
    document.querySelectorAll('.sentence-block').forEach((b, idx) => {
      b.classList.toggle('active-sentence', idx === index);
    });

    if (scroll) {
      const activeEl = document.getElementById(`sentence-block-${index}`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // ==================== 7. TOGGLES (BLIND / TRANS) ====================
  toggleBlindMode() {
    this.settings.blindMode = !this.settings.blindMode;
    this.saveSettings();

    this.btnToggleBlind.classList.toggle('active', this.settings.blindMode);
    this.blindModeLabel.textContent = this.settings.blindMode ? '👁️ 对照' : '🙈 盲听';

    document.querySelectorAll('.sentence-block').forEach(b => {
      b.classList.toggle('blind-mode', this.settings.blindMode);
      b.classList.remove('revealed');
    });

    this.showToast(this.settings.blindMode ? '已开启磨耳朵盲听（轻触句子揭晓）' : '已切换回精听对照');
  }

  toggleTranslation() {
    this.settings.showTrans = !this.settings.showTrans;
    this.saveSettings();

    this.btnToggleTrans.classList.toggle('active', this.settings.showTrans);
    document.querySelectorAll('.sentence-trans').forEach(el => {
      el.classList.toggle('hidden', !this.settings.showTrans);
    });

    this.showToast(this.settings.showTrans ? '已显示译文' : '已隐藏译文');
  }

  // ==================== 8. AUDIO ENGINE & SCRUBBING ====================
  togglePlayPause() {
    if (this.isPlaying) {
      this.pauseAudio();
    } else {
      this.playAudio();
    }
  }

  playAudio() {
    this.audio.play().then(() => {
      this.isPlaying = true;
      this.updatePlayPauseUI(true);
    }).catch(err => {
      console.warn('Playback error:', err);
      this.updatePlayPauseUI(false);
    });
  }

  pauseAudio() {
    this.audio.pause();
    this.isPlaying = false;
    this.updatePlayPauseUI(false);
    if (this.autoPauseTimer) {
      clearTimeout(this.autoPauseTimer);
      this.autoPauseTimer = null;
    }
  }

  seekBy(delta) {
    const target = Math.max(0, Math.min(this.audio.duration || 0, this.audio.currentTime + delta));
    this.audio.currentTime = target;
  }

  seekTo(seconds) {
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, seconds));
    }
  }

  playSentence(index) {
    if (!this.currentLesson || !this.currentLesson.sentences[index]) return;
    const sent = this.currentLesson.sentences[index];
    this.currentSentenceIndex = index;
    this.dictationIndex = index;

    if (sent.startTime !== undefined) {
      this.seekTo(sent.startTime);
    }
    this.playAudio();
    this.highlightSentence(index, true);

    if (this.dictationSheet.classList.contains('active')) {
      this.updateDictationUI();
    }
  }

  replayCurrentSentence() {
    if (this.currentSentenceIndex !== -1) {
      this.playSentence(this.currentSentenceIndex);
    } else {
      this.playSentence(0);
    }
  }

  cycleLoopMode() {
    if (this.loopMode === 'single') {
      this.loopMode = 'ab';
      this.handleAbLoopTrigger();
    } else if (this.loopMode === 'ab') {
      this.loopMode = 'none';
      this.clearAbLoop();
      this.loopModeIcon.textContent = '➡️';
      this.loopModeText.textContent = '顺序';
      this.btnLoopMode.classList.remove('active');
      this.showToast('循环模式：顺序播放');
    } else {
      this.loopMode = 'single';
      this.clearAbLoop();
      this.loopModeIcon.textContent = '🔁';
      this.loopModeText.textContent = '单句';
      this.btnLoopMode.classList.add('active');
      this.showToast('循环模式：单句循环');
    }
  }

  handleAbLoopTrigger() {
    const curTime = this.audio.currentTime;
    if (!this.abLoop.active) {
      this.abLoop.active = true;
      this.abLoop.a = curTime;
      this.abLoop.b = null;
      this.loopModeIcon.textContent = 'A-';
      this.loopModeText.textContent = this.formatTime(curTime);
      this.btnLoopMode.classList.add('active');
      this.showToast(`已设置 A 点: ${this.formatTime(curTime)}，再次点击设置 B 点`);
    } else if (this.abLoop.a !== null && this.abLoop.b === null) {
      if (curTime <= this.abLoop.a) {
        this.showToast('B 点必须在 A 点之后', 'warning');
        return;
      }
      this.abLoop.b = curTime;
      this.loopModeIcon.textContent = '🔂';
      this.loopModeText.textContent = 'A-B';
      this.updateAbVisual();
      this.showToast(`已开启 A-B 循环 (${this.formatTime(this.abLoop.a)} - ${this.formatTime(this.abLoop.b)})`);
    }
  }

  clearAbLoop() {
    this.abLoop = { active: false, a: null, b: null };
    this.timelineAb.style.display = 'none';
  }

  updateAbVisual() {
    if (this.abLoop.a !== null && this.abLoop.b !== null && this.audio.duration) {
      const dur = this.audio.duration;
      const left = (this.abLoop.a / dur) * 100;
      const width = ((this.abLoop.b - this.abLoop.a) / dur) * 100;
      this.timelineAb.style.left = `${left}%`;
      this.timelineAb.style.width = `${width}%`;
      this.timelineAb.style.display = 'block';
    }
  }

  setPlaybackRate(rate) {
    this.audio.playbackRate = rate;
    this.settings.speed = rate;
    this.speedValueLabel.textContent = `${rate}x`;
    document.querySelectorAll('.speed-item').forEach(el => {
      el.classList.toggle('active', parseFloat(el.getAttribute('data-rate')) === rate);
    });
    this.saveSettings();
  }

  onAudioPlay() {
    this.isPlaying = true;
    this.updatePlayPauseUI(true);
  }

  onAudioPause() {
    this.isPlaying = false;
    this.updatePlayPauseUI(false);
  }

  onAudioEnded() {
    this.isPlaying = false;
    this.updatePlayPauseUI(false);
    if (this.currentLesson) {
      this.currentLesson.completed = true;
      this.saveLessonsToStorage();
    }
  }

  onAudioMetadataLoaded() {
    const dur = this.audio.duration || 0;
    this.timeDuration.textContent = this.formatTime(dur);
    if (this.currentLesson && (!this.currentLesson.duration || this.currentLesson.duration <= 0)) {
      this.currentLesson.duration = dur;
      this.saveLessonsToStorage();
    }
  }

  onTimeUpdate() {
    const curTime = this.audio.currentTime;
    const dur = this.audio.duration || 1;

    // Timeline bar
    const pct = Math.min(100, (curTime / dur) * 100);
    this.timelineProgress.style.width = `${pct}%`;
    this.timelineThumb.style.left = `${pct}%`;
    this.timeCurrent.textContent = this.formatTime(curTime);

    // A-B loop check
    if (this.loopMode === 'ab' && this.abLoop.active && this.abLoop.a !== null && this.abLoop.b !== null) {
      if (curTime >= this.abLoop.b) {
        this.audio.currentTime = this.abLoop.a;
        return;
      }
    }

    if (!this.currentLesson || !this.currentLesson.sentences.length) return;
    const sents = this.currentLesson.sentences;
    let found = -1;

    for (let i = 0; i < sents.length; i++) {
      if (curTime >= sents[i].startTime && curTime < sents[i].endTime) {
        found = i;
        break;
      }
    }

    if (found !== -1) {
      // Single loop check
      if (this.loopMode === 'single') {
        const curSent = sents[found];
        if (curTime >= curSent.endTime - 0.15) {
          this.audio.currentTime = curSent.startTime;
          return;
        }
      }

      // Auto pause check
      if (this.settings.autoPauseSec > 0 && !this.isAutoPausing && this.isPlaying) {
        const curSent = sents[found];
        if (curTime >= curSent.endTime - 0.25 && this.lastSentenceAutoPaused !== found) {
          this.lastSentenceAutoPaused = found;
          this.triggerSentenceAutoPause(found);
          return;
        }
      }

      if (found !== this.currentSentenceIndex) {
        this.currentSentenceIndex = found;
        this.highlightSentence(found, false);
      }
    }
  }

  triggerSentenceAutoPause(idx) {
    this.isAutoPausing = true;
    this.pauseAudio();
    this.showToast(`跟读停顿 (${this.settings.autoPauseSec}秒)...`, 'info');

    this.autoPauseTimer = setTimeout(() => {
      this.isAutoPausing = false;
      this.autoPauseTimer = null;
      if (!this.isPlaying) this.playAudio();
    }, this.settings.autoPauseSec * 1000);
  }

  updateBufferProgress() {
    if (this.audio.buffered && this.audio.buffered.length > 0 && this.audio.duration) {
      const bEnd = this.audio.buffered.end(this.audio.buffered.length - 1);
      const pct = (bEnd / this.audio.duration) * 100;
      this.timelineBuffered.style.width = `${pct}%`;
    }
  }

  bindTimelineScrubbing() {
    let dragging = false;

    const getTime = (e) => {
      const rect = this.timelineBar.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const ratio = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      return ratio * (this.audio.duration || 0);
    };

    const start = (e) => { dragging = true; this.seekTo(getTime(e)); };
    const move = (e) => { if (dragging) this.seekTo(getTime(e)); };
    const end = () => { dragging = false; };

    this.timelineBar.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    this.timelineBar.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
  }

  updatePlayPauseUI(playing) {
    this.iconPlay.style.display = playing ? 'none' : 'block';
    this.iconPause.style.display = playing ? 'block' : 'none';
  }

  // ==================== 9. DICTATION DRAWER ====================
  openDictationSheet() {
    this.dictationBackdrop.classList.add('active');
    this.dictationSheet.classList.add('active');
    this.updateDictationUI();
  }

  closeDictationSheet() {
    this.dictationBackdrop.classList.remove('active');
    this.dictationSheet.classList.remove('active');
  }

  updateDictationUI() {
    if (!this.currentLesson || !this.currentLesson.sentences.length) return;
    const sent = this.currentLesson.sentences[this.dictationIndex];
    if (!sent) return;

    this.dictationStepBadge.textContent = `句 ${this.dictationIndex + 1}/${this.currentLesson.sentences.length}`;
    this.dictationTextarea.value = '';
    this.dictationDiffBox.style.display = 'none';
    this.dictationTextarea.focus();
  }

  nextDictationSentence() {
    if (!this.currentLesson) return;
    if (this.dictationIndex < this.currentLesson.sentences.length - 1) {
      this.dictationIndex++;
      this.updateDictationUI();
      this.playSentence(this.dictationIndex);
    } else {
      this.showToast('🎉 全部句子听写完成！');
    }
  }

  checkDictationDiff() {
    const sent = this.currentLesson.sentences[this.dictationIndex];
    if (!sent) return;

    const input = this.dictationTextarea.value.trim();
    if (!input) {
      this.showToast('请先输入你听到的句子', 'warning');
      return;
    }

    const diff = this.computeWordDiff(input, sent.text);
    this.diffViewContent.innerHTML = diff.html;
    this.diffScoreBadge.textContent = `准确率: ${diff.accuracy}%`;
    this.diffViewTrans.textContent = `参考译文：${sent.trans || '（无中文）'}`;
    this.dictationDiffBox.style.display = 'block';
  }

  computeWordDiff(userStr, origStr) {
    const cleanOrig = origStr.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
    const cleanUser = userStr.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "").toLowerCase().split(/\s+/).filter(Boolean);

    const origTokens = origStr.split(/(\s+)/);
    let matched = 0;
    const htmlTokens = [];

    let uIdx = 0;
    for (let i = 0; i < origTokens.length; i++) {
      const token = origTokens[i];
      if (/^\s+$/.test(token)) {
        htmlTokens.push(token);
        continue;
      }
      const stripped = token.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "").toLowerCase();
      if (uIdx < cleanUser.length && cleanUser[uIdx] === stripped) {
        matched++;
        htmlTokens.push(`<span class="diff-correct">${token}</span>`);
        uIdx++;
      } else if (uIdx < cleanUser.length && cleanUser.slice(uIdx, uIdx + 3).includes(stripped)) {
        const adv = cleanUser.slice(uIdx, uIdx + 3).indexOf(stripped);
        for (let k = 0; k < adv; k++) {
          htmlTokens.push(`<span class="diff-typo">${cleanUser[uIdx + k]}</span> `);
        }
        uIdx += adv;
        matched++;
        htmlTokens.push(`<span class="diff-correct">${token}</span>`);
        uIdx++;
      } else {
        htmlTokens.push(`<span class="diff-missing">${token}</span>`);
      }
    }

    const total = Math.max(1, cleanOrig.length);
    const accuracy = Math.min(100, Math.round((matched / total) * 100));

    return { html: htmlTokens.join(''), accuracy };
  }

  // ==================== 10. WORD INSPECTOR BOTTOM SHEET ====================
  async openWordSheet(rawWord, contextSentence) {
    const word = rawWord.toLowerCase().replace(/[^a-z0-9'-]/g, '');
    if (!word) return;

    this.sheetWordTitle.textContent = word;
    this.sheetWordPhonetic.textContent = '...';
    this.sheetWordMeanings.innerHTML = '<div class="meaning-item loading">查询释义中...</div>';
    this.sheetSentenceCtx.textContent = `“${contextSentence}”`;

    this.btnSpeakWord.onclick = () => this.speakText(word);

    this.wordBackdrop.classList.add('active');
    this.wordBottomSheet.classList.add('active');

    const def = await this.fetchWordDefinition(word);
    this.sheetWordPhonetic.textContent = def.phonetic ? `/${def.phonetic}/` : '';
    this.sheetWordMeanings.innerHTML = '';

    if (def.meanings && def.meanings.length) {
      def.meanings.forEach(m => {
        const el = document.createElement('div');
        el.className = 'meaning-item';
        el.innerHTML = `<strong>${m.partOfSpeech || ''}</strong> ${m.definition || ''}`;
        this.sheetWordMeanings.appendChild(el);
      });
    } else {
      this.sheetWordMeanings.innerHTML = '<div class="meaning-item">常用听力生词，可加入生词本复习。</div>';
    }

    const isSaved = this.vocabList.some(v => v.word.toLowerCase() === word);
    this.btnSaveToVocab.textContent = isSaved ? '✓ 已在生词本中' : '加入生词本';
    this.btnSaveToVocab.disabled = isSaved;

    this.btnSaveToVocab.onclick = () => {
      this.addWordToVocab({
        word,
        phonetic: def.phonetic || '',
        meaning: def.meanings && def.meanings[0] ? def.meanings[0].definition : '',
        contextSentence,
        date: Date.now()
      });
      this.btnSaveToVocab.textContent = '✓ 已在生词本中';
      this.btnSaveToVocab.disabled = true;
      this.showToast(`"${word}" 已加入生词本`);
    };
  }

  closeWordSheet() {
    this.wordBackdrop.classList.remove('active');
    this.wordBottomSheet.classList.remove('active');
  }

  async fetchWordDefinition(word) {
    if (this.dictCache[word]) return this.dictCache[word];
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data[0]) {
          const entry = data[0];
          const phonetic = entry.phonetic || (entry.phonetics && entry.phonetics.find(p => p.text)?.text?.replace(/\//g, '')) || '';
          const meanings = (entry.meanings || []).slice(0, 3).map(m => ({
            partOfSpeech: m.partOfSpeech,
            definition: m.definitions && m.definitions[0] ? m.definitions[0].definition : ''
          }));
          const result = { phonetic, meanings };
          this.dictCache[word] = result;
          return result;
        }
      }
    } catch (e) {
      console.warn('Word fetch error:', e);
    }
    return { phonetic: '', meanings: [{ partOfSpeech: 'n./v.', definition: '核心词汇' }] };
  }

  speakText(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-US';
      utter.rate = this.settings.speed || 1.0;
      window.speechSynthesis.speak(utter);
    }
  }

  addWordToVocab(item) {
    if (!this.vocabList.some(v => v.word.toLowerCase() === item.word.toLowerCase())) {
      this.vocabList.unshift(item);
      this.saveVocabToStorage();
      this.renderSentencesStream();
    }
  }

  // ==================== 11. LIBRARY & EDIT MODAL ====================
  renderLibrary(search = '', filter = 'all') {
    const list = document.getElementById('lessonListContainer');
    list.innerHTML = '';

    const query = search.trim().toLowerCase();
    const filtered = this.lessons.filter(item => {
      const matchesQ = !query ||
        item.title.toLowerCase().includes(query) ||
        (item.category && item.category.toLowerCase().includes(query)) ||
        item.sentences.some(s => s.text.toLowerCase().includes(query) || (s.trans && s.trans.includes(query)));

      let matchesF = true;
      if (filter === 'favorite') matchesF = item.favorite;
      else if (filter === 'completed') matchesF = item.completed;
      else if (filter === 'in_progress') matchesF = !item.completed;

      return matchesQ && matchesF;
    });

    document.getElementById('libraryTotalCount').textContent = `${this.lessons.length} 篇`;
    document.getElementById('lessonCountBadge').textContent = `${this.lessons.length} 篇`;

    if (filtered.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:var(--text-muted);">
          <p style="font-size:15px; margin-bottom:10px;">没有找到匹配的听力素材</p>
          <button class="btn-primary btn-sm" id="btnEmptyAdd">+ 存第一篇听力</button>
        </div>
      `;
      const b = document.getElementById('btnEmptyAdd');
      if (b) b.addEventListener('click', () => this.openEditModal());
      return;
    }

    filtered.forEach(lesson => {
      const card = document.createElement('div');
      card.className = 'lesson-card';
      const snippet = lesson.sentences && lesson.sentences[0] ? lesson.sentences[0].text : '（暂无原文）';

      card.innerHTML = `
        <div class="lesson-card-header">
          <span class="lesson-badge">${this.escapeHtml(lesson.category || '日常学习')}</span>
          <span class="lesson-meta-text">${lesson.sentences ? lesson.sentences.length : 0} 句 · ${this.formatTime(lesson.duration || 0)}</span>
        </div>
        <h3 class="lesson-title-text">${this.escapeHtml(lesson.title)}</h3>
        <p class="lesson-snippet">${this.escapeHtml(snippet)}</p>
      `;

      card.addEventListener('click', () => {
        this.openImmersiveReader(lesson.id);
      });

      list.appendChild(card);
    });
  }

  openEditModal(lesson = null) {
    const titleEl = document.getElementById('editLessonModalTitle');
    const idInput = document.getElementById('editLessonId');
    const titleInput = document.getElementById('editTitle');
    const catInput = document.getElementById('editCategory');
    const transcriptInput = document.getElementById('editTranscript');
    const notesInput = document.getElementById('editNotes');
    const urlInput = document.getElementById('editAudioUrl');

    this.pendingAudioBlob = null;
    this.pendingAudioFilename = null;
    this.fileDropText.textContent = '点击或拖放音频文件 (MP3, M4A, WAV)';

    if (lesson) {
      titleEl.textContent = '编辑听力素材与原文';
      idInput.value = lesson.id;
      titleInput.value = lesson.title;
      catInput.value = lesson.category || '日常学习';
      notesInput.value = lesson.notes || '';
      urlInput.value = lesson.audioSourceType === 'url' ? lesson.audioUrl : '';

      const lines = lesson.sentences.map(s => {
        const timeTag = s.startTime !== undefined ? `[${this.formatLrcTime(s.startTime)}] ` : '';
        return s.trans ? `${timeTag}${s.text}\n${s.trans}` : `${timeTag}${s.text}`;
      });
      transcriptInput.value = lines.join('\n');
    } else {
      titleEl.textContent = '新增听力素材与原文';
      idInput.value = '';
      titleInput.value = '';
      catInput.value = '日常学习';
      notesInput.value = '';
      urlInput.value = '';
      transcriptInput.value = '';
    }

    this.modalEditLesson.classList.add('show');
  }

  closeEditModal() {
    this.modalEditLesson.classList.remove('show');
  }

  handleFileSelect(file) {
    if (!file) return;
    this.pendingAudioBlob = file;
    this.pendingAudioFilename = file.name;
    this.fileDropText.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    this.showToast('音频已加载，点击保存将存入本地数据库');
  }

  formatTranscriptInput() {
    const textarea = document.getElementById('editTranscript');
    const text = textarea.value.trim();
    if (!text) return;
    const parsed = this.parseTranscript(text);
    textarea.value = parsed.map(s => {
      const timeTag = s.startTime !== undefined ? `[${this.formatLrcTime(s.startTime)}] ` : '';
      return s.trans ? `${timeTag}${s.text}\n${s.trans}` : `${timeTag}${s.text}`;
    }).join('\n\n');
    this.showToast('智能断句完成');
  }

  insertSampleTranscript() {
    const textarea = document.getElementById('editTranscript');
    textarea.value = `[00:00.00] Consistent daily listening will quietly transform your fluency.
每日坚持听力练习，将悄然重塑你的语言直觉。

[00:06.50] Focus on connected speech, linking words, and tone.
重点关注连读、弱读与语调的变化。`;
    this.showToast('已填入示范模板');
  }

  parseTranscript(raw) {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const sentences = [];
    const lrcRegex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;

    let pendingEn = null;
    let pendingStartTime = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = lrcRegex.exec(line);
      lrcRegex.lastIndex = 0;

      let lineText = line;
      let startTime = null;

      if (match) {
        const mins = parseInt(match[1]);
        const secs = parseInt(match[2]);
        const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3)) : 0;
        startTime = mins * 60 + secs + ms / 1000;
        lineText = line.replace(/\[\d{1,2}:\d{1,2}(?:\.\d{1,3})?\]/g, '').trim();
      }

      const isChinese = /[\u4e00-\u9fa5]/.test(lineText) && !/^[a-zA-Z]/.test(lineText);

      if (isChinese && pendingEn) {
        sentences.push({
          id: `s_${sentences.length + 1}`,
          startTime: pendingStartTime,
          endTime: pendingStartTime + 5.0,
          text: pendingEn,
          trans: lineText
        });
        pendingEn = null;
      } else {
        if (pendingEn) {
          sentences.push({
            id: `s_${sentences.length + 1}`,
            startTime: pendingStartTime,
            endTime: pendingStartTime + 5.0,
            text: pendingEn,
            trans: ''
          });
        }
        pendingEn = lineText;
        pendingStartTime = startTime !== null ? startTime : (sentences.length * 5.0);
      }
    }

    if (pendingEn) {
      sentences.push({
        id: `s_${sentences.length + 1}`,
        startTime: pendingStartTime,
        endTime: pendingStartTime + 5.0,
        text: pendingEn,
        trans: ''
      });
    }

    for (let j = 0; j < sentences.length - 1; j++) {
      if (sentences[j + 1].startTime > sentences[j].startTime) {
        sentences[j].endTime = sentences[j + 1].startTime;
      } else {
        sentences[j].endTime = sentences[j].startTime + 5.0;
      }
    }

    return sentences;
  }

  async handleSaveLesson(e) {
    e.preventDefault();
    const id = document.getElementById('editLessonId').value;
    const title = document.getElementById('editTitle').value.trim();
    const category = document.getElementById('editCategory').value.trim() || '日常学习';
    const raw = document.getElementById('editTranscript').value.trim();
    const notes = document.getElementById('editNotes').value.trim();
    const url = document.getElementById('editAudioUrl').value.trim();

    const activeSrcTab = document.querySelector('.source-tab.active').getAttribute('data-source');
    if (!title || !raw) {
      this.showToast('请填写标题和听力原文', 'warning');
      return;
    }

    const sentences = this.parseTranscript(raw);
    let lessonId = id || `lesson_${Date.now()}`;
    let existing = this.lessons.find(l => l.id === lessonId);

    let audioSourceType = activeSrcTab;
    let audioBlobId = existing ? existing.audioBlobId : null;
    let audioUrl = existing ? existing.audioUrl : '';

    if (activeSrcTab === 'file' && this.pendingAudioBlob) {
      audioBlobId = `audio_blob_${Date.now()}`;
      await saveAudioBlob(audioBlobId, this.pendingAudioBlob, this.pendingAudioFilename);
      audioSourceType = 'file';
    } else if (activeSrcTab === 'url') {
      audioUrl = url;
    }

    const lessonData = {
      id: lessonId,
      title,
      category,
      audioSourceType: audioBlobId ? 'file' : audioSourceType,
      audioBlobId,
      audioUrl,
      duration: existing ? existing.duration : (sentences.length * 5),
      favorite: existing ? existing.favorite : false,
      completed: false,
      updatedAt: Date.now(),
      sentences,
      notes
    };

    if (existing) {
      const idx = this.lessons.findIndex(l => l.id === lessonId);
      this.lessons[idx] = lessonData;
    } else {
      this.lessons.unshift(lessonData);
    }

    this.saveLessonsToStorage();
    this.closeEditModal();
    this.showToast('听力素材与原文已保存！');
    this.renderLibrary();

    // Immediately open in immersive reader
    this.openImmersiveReader(lessonId);
  }

  // ==================== 12. VOCAB & SETTINGS ====================
  renderVocabList(search = '') {
    const list = document.getElementById('vocabListContainer');
    list.innerHTML = '';
    this.updateVocabBadge();

    const query = search.trim().toLowerCase();
    const filtered = this.vocabList.filter(v => !query || v.word.toLowerCase().includes(query) || (v.meaning && v.meaning.toLowerCase().includes(query)));

    document.getElementById('vocabTotalCount').textContent = `${this.vocabList.length} 词`;

    if (filtered.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:50px 20px; color:var(--text-muted);">
          <p>暂无生词记录</p>
          <p style="font-size:12.5px; margin-top:4px;">在精听时轻点任意单词，即可将其加入生词本</p>
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'vocab-card';
      card.innerHTML = `
        <div class="vocab-head">
          <div>
            <span class="vocab-word">${this.escapeHtml(item.word)}</span>
            ${item.phonetic ? `<span class="vocab-phonetic">/${this.escapeHtml(item.phonetic)}/</span>` : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-subtle btn-sm spk-btn" title="发音">🔊</button>
            <button class="btn-subtle btn-sm del-btn" title="移除">✕</button>
          </div>
        </div>
        ${item.meaning ? `<div class="vocab-meaning">${this.escapeHtml(item.meaning)}</div>` : ''}
        ${item.contextSentence ? `<div class="vocab-context">“${this.escapeHtml(item.contextSentence)}”</div>` : ''}
      `;

      card.querySelector('.spk-btn').addEventListener('click', () => this.speakText(item.word));
      card.querySelector('.del-btn').addEventListener('click', () => {
        this.vocabList = this.vocabList.filter(v => v.word !== item.word);
        this.saveVocabToStorage();
        this.renderVocabList(search);
        this.renderSentencesStream();
      });

      list.appendChild(card);
    });
  }

  updateVocabBadge() {
    const badge = document.getElementById('vocabBadgeCount');
    if (this.vocabList.length > 0) {
      badge.textContent = this.vocabList.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  exportVocab() {
    if (!this.vocabList.length) return;
    const txt = this.vocabList.map(v => `${v.word}\t${v.phonetic || ''}\t${v.meaning || ''}\t${v.contextSentence || ''}`).join('\n');
    this.downloadBlob(new Blob([txt], { type: 'text/plain;charset=utf-8' }), `Vocab_${this.formatDate(Date.now())}.txt`);
    this.showToast('生词本已导出');
  }

  clearVocab() {
    if (!this.vocabList.length) return;
    if (confirm('确定清空所有生词吗？')) {
      this.vocabList = [];
      this.saveVocabToStorage();
      this.renderVocabList();
      this.renderSentencesStream();
      this.showToast('生词已清空');
    }
  }

  exportBackup() {
    const data = { app: 'MinimalEnglishListener', lessons: this.lessons, vocabList: this.vocabList, settings: this.settings };
    this.downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `Listener_Backup_${this.formatDate(Date.now())}.json`);
    this.showToast('备份已导出');
  }

  importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const d = JSON.parse(event.target.result);
        if (d.lessons) { this.lessons = d.lessons; this.saveLessonsToStorage(); }
        if (d.vocabList) { this.vocabList = d.vocabList; this.saveVocabToStorage(); }
        this.renderLibrary();
        this.renderVocabList();
        this.showToast('备份导入恢复成功！');
      } catch (err) {
        this.showToast('文件格式有误', 'danger');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  resetToDefaults() {
    if (confirm('确定恢复默认官方示范听力素材吗？')) {
      this.lessons = JSON.parse(JSON.stringify(DEFAULT_LESSONS));
      this.saveLessonsToStorage();
      this.renderLibrary();
      this.showToast('已重置为官方示范素材');
    }
  }

  applySettings() {
    this.setTheme(this.settings.theme);
    this.setFont(this.settings.font);

    document.documentElement.style.setProperty('--article-font-size', `${this.settings.fontSize}px`);
    document.getElementById('fontSizeSlider').value = this.settings.fontSize;
    document.getElementById('fontSizeDisplay').textContent = `${this.settings.fontSize}px`;

    this.setPlaybackRate(this.settings.speed);

    document.getElementById('settingAutoPauseSec').value = this.settings.autoPauseSec;
    document.getElementById('settingRewindStep').value = this.settings.rewindStep;
    document.getElementById('pRewindLabel').textContent = `${this.settings.rewindStep}s`;
    document.getElementById('pForwardLabel').textContent = `${this.settings.rewindStep}s`;
  }

  setTheme(theme) {
    this.settings.theme = theme;
    document.body.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-pill').forEach(b => b.classList.toggle('active', b.getAttribute('data-theme-val') === theme));
    this.saveSettings();
  }

  toggleTheme() {
    const cycle = { warm: 'light', light: 'dark', dark: 'warm' };
    this.setTheme(cycle[this.settings.theme] || 'warm');
    this.showToast(`主题切换为: ${this.settings.theme === 'warm' ? '暖阳纸' : (this.settings.theme === 'light' ? '极简白' : '深邃夜')}`);
  }

  setFont(font) {
    this.settings.font = font;
    document.body.setAttribute('data-font', font);
    document.querySelectorAll('.font-pill').forEach(b => b.classList.toggle('active', b.getAttribute('data-font-val') === font));
    this.saveSettings();
  }

  handleKeyboardShortcuts(e) {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.togglePlayPause();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      this.seekBy(-this.settings.rewindStep);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      this.seekBy(this.settings.rewindStep);
    } else if (e.key === 'r' || e.key === 'R') {
      this.replayCurrentSentence();
    }
  }

  formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  formatLrcTime(sec) {
    if (isNaN(sec) || sec < 0) return '00:00.00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  formatDate(t) {
    const d = new Date(t);
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(-8px)';
      t.style.transition = 'all 0.2s ease';
      setTimeout(() => t.remove(), 200);
    }, 2000);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new ListenerApp();
});
