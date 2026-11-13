/**
 * 极简英文 · 听与练 (Minimal English Listener)
 * Core Application Logic
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
    const item = {
      id,
      blob,
      filename,
      type: blob.type,
      updatedAt: Date.now()
    };
    store.put(item);
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
    lastPosition: 0,
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
    lastPosition: 0,
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

// ==================== 3. APP STATE & INITIALIZATION ====================
class ListenerApp {
  constructor() {
    this.lessons = this.loadLessons();
    this.vocabList = this.loadVocab();
    this.settings = this.loadSettings();

    this.currentLesson = null;
    this.currentSentenceIndex = -1;
    this.dictationIndex = 0;

    // Player state
    this.audio = document.getElementById('native-audio');
    this.isPlaying = false;
    this.isSingleLoop = false;
    this.abLoop = { active: false, a: null, b: null };
    this.isAutoPausing = false;
    this.autoPauseTimer = null;
    this.lastTriggeredSentenceIndex = -1;
    this.blobUrlCache = null;

    // Word lookup cache
    this.dictCache = {};

    this.initDOM();
    this.bindEvents();
    this.applySettings();

    // Select initial lesson
    const savedLessonId = this.settings.currentLessonId;
    const initialLesson = this.lessons.find(l => l.id === savedLessonId) || this.lessons[0];
    if (initialLesson) {
      this.switchLesson(initialLesson.id, false);
    }

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
      console.warn('Failed to load lessons from storage:', e);
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
      fontSize: 18,
      speed: 1.0,
      autoPause: false,
      autoPauseSeconds: 2,
      rewindStep: 5,
      showTrans: true,
      studyMode: 'contrast',
      currentLessonId: 'lesson_1'
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
    // Navigation
    this.navTabs = document.querySelectorAll('.nav-tab');
    this.viewPanels = document.querySelectorAll('.view-panel');
    this.modeTabs = document.querySelectorAll('.mode-tab');

    // Controls
    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.iconPlay = document.getElementById('icon-play');
    this.iconPause = document.getElementById('icon-pause');
    this.btnRewind = document.getElementById('btn-rewind');
    this.btnForward = document.getElementById('btn-forward');
    this.btnSingleLoop = document.getElementById('btn-single-loop');
    this.btnAbLoop = document.getElementById('btn-ab-loop');
    this.abLoopLabel = document.getElementById('ab-loop-label');
    this.btnSpeedPicker = document.getElementById('btn-speed-picker');
    this.speedMenu = document.getElementById('speed-dropdown-menu');
    this.currentSpeedLabel = document.getElementById('current-speed-label');
    this.btnAutoPause = document.getElementById('btn-auto-pause');

    // Timeline
    this.timelineTrack = document.getElementById('timeline-track');
    this.timelineProgress = document.getElementById('timeline-progress');
    this.timelineBuffered = document.getElementById('timeline-buffered');
    this.timelineThumb = document.getElementById('timeline-thumb');
    this.timelineAbSegment = document.getElementById('timeline-ab-segment');
    this.timeCurrent = document.getElementById('time-current');
    this.timeDuration = document.getElementById('time-duration');
    this.sentenceJumpHint = document.getElementById('sentence-jump-hint');

    // Study View
    this.studyTitle = document.getElementById('study-title');
    this.studyCategory = document.getElementById('study-category');
    this.studySourceType = document.getElementById('study-source-type');
    this.studyDurationBadge = document.getElementById('study-duration-badge');
    this.sentencesList = document.getElementById('sentences-list');
    this.btnToggleTrans = document.getElementById('btn-toggle-translation');
    this.transToggleLabel = document.getElementById('trans-toggle-label');
    this.modeTipText = document.getElementById('mode-tip-text');

    // Dictation View
    this.dictationWorkspace = document.getElementById('dictation-workspace');
    this.dictationStepIndicator = document.getElementById('dictation-step-indicator');
    this.dictationInput = document.getElementById('dictation-input');
    this.btnCheckDictation = document.getElementById('btn-check-dictation');
    this.btnNextDictation = document.getElementById('btn-next-dictation');
    this.btnDictationReplay = document.getElementById('btn-dictation-replay');
    this.btnDictationHint = document.getElementById('btn-dictation-hint');
    this.dictationDiffPanel = document.getElementById('dictation-diff-panel');
    this.diffContent = document.getElementById('diff-content');
    this.diffAccuracyBadge = document.getElementById('diff-accuracy-badge');
    this.diffOriginalTrans = document.getElementById('diff-original-trans');

    // Modals
    this.modalEdit = document.getElementById('modal-edit-lesson');
    this.modalWord = document.getElementById('modal-word-lookup');
    this.modalSettings = document.getElementById('modal-settings');

    // Forms
    this.formEdit = document.getElementById('form-edit-lesson');
    this.editAudioFile = document.getElementById('edit-audio-file');
    this.fileDropZone = document.getElementById('file-drop-zone');
    this.fileDropText = document.getElementById('file-drop-text');

    this.pendingAudioBlob = null;
    this.pendingAudioFilename = null;
  }

  // ==================== 4. EVENT BINDINGS ====================
  bindEvents() {
    // Navigation Tabs
    this.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.getAttribute('data-view');
        this.switchView(view);
      });
    });

    document.getElementById('brand-logo').addEventListener('click', () => {
      this.switchView('study');
    });

    // Mode Tabs
    this.modeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode');
        this.switchStudyMode(mode);
      });
    });

    // Audio Playback Events
    this.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    this.btnRewind.addEventListener('click', () => this.seekBy(-this.settings.rewindStep));
    this.btnForward.addEventListener('click', () => this.seekBy(this.settings.rewindStep));
    this.btnSingleLoop.addEventListener('click', () => this.toggleSingleLoop());
    this.btnAbLoop.addEventListener('click', () => this.handleAbLoopClick());

    // Speed picker
    this.btnSpeedPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('show');
    });

    document.querySelectorAll('.speed-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const rate = parseFloat(opt.getAttribute('data-rate'));
        this.setPlaybackRate(rate);
        this.speedMenu.classList.remove('show');
      });
    });

    document.addEventListener('click', () => {
      this.speedMenu.classList.remove('show');
    });

    // Auto-pause toggle
    this.btnAutoPause.addEventListener('click', () => {
      this.settings.autoPause = !this.settings.autoPause;
      this.saveSettings();
      this.updateAutoPauseButton();
      this.showToast(this.settings.autoPause ? `已开启句末停顿 (${this.settings.autoPauseSeconds}秒)` : '已关闭句末停顿');
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

    // Dictation events
    this.btnCheckDictation.addEventListener('click', () => this.checkDictationDiff());
    this.btnNextDictation.addEventListener('click', () => this.nextDictationSentence());
    this.btnDictationReplay.addEventListener('click', () => this.replayCurrentDictationSentence());
    this.btnDictationHint.addEventListener('click', () => this.showDictationHint());

    // Translation toggle
    this.btnToggleTrans.addEventListener('click', () => {
      this.settings.showTrans = !this.settings.showTrans;
      this.saveSettings();
      this.applyTranslationVisibility();
    });

    // Edit Lesson & Transcript
    document.getElementById('btn-add-quick').addEventListener('click', () => this.openEditModal());
    document.getElementById('btn-add-lesson').addEventListener('click', () => this.openEditModal());
    document.getElementById('btn-edit-current-lesson').addEventListener('click', () => {
      if (this.currentLesson) this.openEditModal(this.currentLesson);
    });

    document.getElementById('btn-close-edit-modal').addEventListener('click', () => this.closeEditModal());
    document.getElementById('btn-cancel-edit-lesson').addEventListener('click', () => this.closeEditModal());
    this.formEdit.addEventListener('submit', (e) => this.handleSaveLesson(e));

    // Audio source tab switcher in modal
    document.querySelectorAll('.source-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const src = tab.getAttribute('data-source');
        document.getElementById('panel-source-file').style.display = src === 'file' ? 'block' : 'none';
        document.getElementById('panel-source-url').style.display = src === 'url' ? 'block' : 'none';
        document.getElementById('panel-source-tts').style.display = src === 'tts' ? 'block' : 'none';
      });
    });

    // File Drop Zone
    this.fileDropZone.addEventListener('click', () => this.editAudioFile.click());
    this.editAudioFile.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

    this.fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.fileDropZone.classList.add('dragover');
    });
    this.fileDropZone.addEventListener('dragleave', () => this.fileDropZone.classList.remove('dragover'));
    this.fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.fileDropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    // Quick tools in edit modal
    document.getElementById('btn-tool-format').addEventListener('click', () => this.formatTranscriptInput());
    document.getElementById('btn-tool-sample').addEventListener('click', () => this.insertSampleTranscript());

    // Settings Modal
    document.getElementById('btn-settings-open').addEventListener('click', () => this.openSettingsModal());
    document.getElementById('btn-close-settings-modal').addEventListener('click', () => this.closeSettingsModal());
    document.getElementById('btn-theme-toggle').addEventListener('click', () => this.toggleTheme());

    // Theme & Font in Settings
    document.querySelectorAll('.theme-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-theme-val');
        this.setTheme(val);
      });
    });

    document.querySelectorAll('.font-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-font-val');
        this.setFont(val);
      });
    });

    // Font size slider
    const fontSizeSlider = document.getElementById('setting-font-size');
    const fontSizeIndicator = document.getElementById('font-size-indicator');
    fontSizeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      this.settings.fontSize = val;
      fontSizeIndicator.textContent = `${val}px`;
      document.documentElement.style.setProperty('--article-font-size', `${val}px`);
      this.saveSettings();
    });

    // Auto pause seconds
    const autoPauseSelect = document.getElementById('setting-auto-pause-sec');
    autoPauseSelect.addEventListener('change', (e) => {
      this.settings.autoPauseSeconds = parseInt(e.target.value);
      this.saveSettings();
    });

    // Rewind step
    const rewindStepSelect = document.getElementById('setting-rewind-step');
    rewindStepSelect.addEventListener('change', (e) => {
      this.settings.rewindStep = parseInt(e.target.value);
      document.getElementById('rewind-step-label').textContent = `${this.settings.rewindStep}s`;
      document.getElementById('forward-step-label').textContent = `${this.settings.rewindStep}s`;
      this.saveSettings();
    });

    // Backup & Restore
    document.getElementById('btn-backup-export').addEventListener('click', () => this.exportBackup());
    const backupInput = document.getElementById('backup-file-input');
    document.getElementById('btn-backup-import-trigger').addEventListener('click', () => backupInput.click());
    backupInput.addEventListener('change', (e) => this.importBackup(e));
    document.getElementById('btn-reset-demos').addEventListener('click', () => this.resetToDefaults());

    // Library Search & Filter
    document.getElementById('library-search-input').addEventListener('input', (e) => {
      this.renderLibrary(e.target.value);
    });

    document.querySelectorAll('#library-filter-pills .pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#library-filter-pills .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.renderLibrary(document.getElementById('library-search-input').value, pill.getAttribute('data-filter'));
      });
    });

    // Vocab actions
    document.getElementById('vocab-search-input').addEventListener('input', (e) => {
      this.renderVocabList(e.target.value);
    });
    document.getElementById('btn-export-vocab').addEventListener('click', () => this.exportVocab());
    document.getElementById('btn-clear-vocab').addEventListener('click', () => this.clearVocab());

    // Word Lookup Modal
    document.getElementById('modal-word-lookup').addEventListener('click', (e) => {
      if (e.target === this.modalWord) this.modalWord.classList.remove('show');
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  // ==================== 5. VIEW & MODE SWITCHING ====================
  switchView(viewName) {
    this.navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
    });
    this.viewPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    if (viewName === 'study' && this.currentLesson) {
      this.renderStudyView();
    } else if (viewName === 'library') {
      this.renderLibrary();
    } else if (viewName === 'vocab') {
      this.renderVocabList();
    }
  }

  switchStudyMode(modeName) {
    this.settings.studyMode = modeName;
    this.saveSettings();

    this.modeTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-mode') === modeName);
    });

    // Update Mode Tip Banner
    if (modeName === 'contrast') {
      this.modeTipText.textContent = '精听对照模式：随音频高亮同步推进，点击任意句子即可单句重放，轻点单词即刻查词发音。';
      this.dictationWorkspace.style.display = 'none';
      document.querySelectorAll('.sentence-card').forEach(c => c.classList.remove('blind-mode'));
    } else if (modeName === 'blind') {
      this.modeTipText.textContent = '磨耳朵盲听模式：原文已遮蔽，锻炼听辨抓词能力。听到不确定的句子，轻触即可揭晓对照！';
      this.dictationWorkspace.style.display = 'none';
      document.querySelectorAll('.sentence-card').forEach(c => c.classList.add('blind-mode'));
    } else if (modeName === 'dictation') {
      this.modeTipText.textContent = '听写核对模式：逐句边听边键入英文，点击「核对对照」即可自动检测正确率、漏词与拼写差异！';
      this.dictationWorkspace.style.display = 'block';
      document.querySelectorAll('.sentence-card').forEach(c => c.classList.remove('blind-mode'));
      this.initDictationForCurrentSentence();
    }
  }

  // ==================== 6. AUDIO PLAYBACK & TIMELINE ====================
  async switchLesson(lessonId, autoPlay = false) {
    const lesson = this.lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    this.currentLesson = lesson;
    this.settings.currentLessonId = lessonId;
    this.saveSettings();

    // Revoke previous blob url
    if (this.blobUrlCache) {
      URL.revokeObjectURL(this.blobUrlCache);
      this.blobUrlCache = null;
    }

    this.currentSentenceIndex = -1;
    this.dictationIndex = 0;
    this.clearAbLoop();

    // Prepare audio src
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

    this.renderStudyView();

    if (autoPlay) {
      this.playAudio();
    } else {
      this.updatePlayPauseUI(false);
    }
  }

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
      console.warn('Play interrupted or failed:', err);
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

  seekBy(deltaSeconds) {
    const target = Math.max(0, Math.min(this.audio.duration || 0, this.audio.currentTime + deltaSeconds));
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

    if (sent.startTime !== undefined && !isNaN(sent.startTime)) {
      this.seekTo(sent.startTime);
    }
    this.playAudio();
    this.highlightSentence(index, true);

    if (this.settings.studyMode === 'dictation') {
      this.initDictationForCurrentSentence();
    }
  }

  toggleSingleLoop() {
    this.isSingleLoop = !this.isSingleLoop;
    this.btnSingleLoop.classList.toggle('active', this.isSingleLoop);
    this.showToast(this.isSingleLoop ? '已开启单句循环复读' : '已关闭单句循环');
  }

  handleAbLoopClick() {
    const curTime = this.audio.currentTime;
    if (!this.abLoop.active) {
      // Set Point A
      this.abLoop.active = true;
      this.abLoop.a = curTime;
      this.abLoop.b = null;
      this.abLoopLabel.textContent = `A:${this.formatTime(curTime)}`;
      this.btnAbLoop.classList.add('active');
      this.showToast(`已标记 A 点: ${this.formatTime(curTime)}，再次点击标记 B 点`);
    } else if (this.abLoop.a !== null && this.abLoop.b === null) {
      // Set Point B
      if (curTime <= this.abLoop.a) {
        this.showToast('B 点必须在 A 点之后', 'warning');
        return;
      }
      this.abLoop.b = curTime;
      this.abLoopLabel.textContent = `[A-B]`;
      this.updateAbSegmentVisual();
      this.showToast(`已开启 A-B 循环 (${this.formatTime(this.abLoop.a)} - ${this.formatTime(this.abLoop.b)})`);
    } else {
      // Clear A-B Loop
      this.clearAbLoop();
      this.showToast('已取消 A-B 循环');
    }
  }

  clearAbLoop() {
    this.abLoop = { active: false, a: null, b: null };
    this.abLoopLabel.textContent = 'A-B';
    this.btnAbLoop.classList.remove('active');
    this.timelineAbSegment.style.display = 'none';
  }

  updateAbSegmentVisual() {
    if (this.abLoop.a !== null && this.abLoop.b !== null && this.audio.duration) {
      const dur = this.audio.duration;
      const left = (this.abLoop.a / dur) * 100;
      const width = ((this.abLoop.b - this.abLoop.a) / dur) * 100;
      this.timelineAbSegment.style.left = `${left}%`;
      this.timelineAbSegment.style.width = `${width}%`;
      this.timelineAbSegment.style.display = 'block';
    }
  }

  setPlaybackRate(rate) {
    this.audio.playbackRate = rate;
    this.settings.speed = rate;
    this.currentSpeedLabel.textContent = `${rate}x`;
    document.querySelectorAll('.speed-opt').forEach(opt => {
      opt.classList.toggle('active', parseFloat(opt.getAttribute('data-rate')) === rate);
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
    this.studyDurationBadge.textContent = this.formatTime(dur);
  }

  onTimeUpdate() {
    const curTime = this.audio.currentTime;
    const dur = this.audio.duration || 1;

    // Timeline bar
    const pct = Math.min(100, (curTime / dur) * 100);
    this.timelineProgress.style.width = `${pct}%`;
    this.timelineThumb.style.left = `${pct}%`;
    this.timeCurrent.textContent = this.formatTime(curTime);

    // Check A-B Loop
    if (this.abLoop.active && this.abLoop.a !== null && this.abLoop.b !== null) {
      if (curTime >= this.abLoop.b) {
        this.audio.currentTime = this.abLoop.a;
        return;
      }
    }

    // Find current sentence by time
    if (!this.currentLesson || !this.currentLesson.sentences.length) return;
    const sents = this.currentLesson.sentences;
    let foundIndex = -1;

    for (let i = 0; i < sents.length; i++) {
      const s = sents[i];
      if (curTime >= s.startTime && curTime < s.endTime) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== -1) {
      // Check single loop
      if (this.isSingleLoop) {
        const curSent = sents[foundIndex];
        if (curTime >= curSent.endTime - 0.15) {
          this.audio.currentTime = curSent.startTime;
          return;
        }
      }

      // Check auto-pause on sentence boundary
      if (this.settings.autoPause && !this.isAutoPausing && this.isPlaying) {
        const curSent = sents[foundIndex];
        if (curTime >= curSent.endTime - 0.25 && this.lastTriggeredSentenceIndex !== foundIndex) {
          this.lastTriggeredSentenceIndex = foundIndex;
          this.triggerSentenceAutoPause(foundIndex);
          return;
        }
      }

      if (foundIndex !== this.currentSentenceIndex) {
        this.currentSentenceIndex = foundIndex;
        this.highlightSentence(foundIndex, false);
      }
    }
  }

  triggerSentenceAutoPause(sentenceIndex) {
    this.isAutoPausing = true;
    this.pauseAudio();
    this.showToast(`句末停顿中 (${this.settings.autoPauseSeconds}秒)...`, 'info');

    this.autoPauseTimer = setTimeout(() => {
      this.isAutoPausing = false;
      this.autoPauseTimer = null;
      if (!this.isPlaying) {
        this.playAudio();
      }
    }, this.settings.autoPauseSeconds * 1000);
  }

  updateBufferProgress() {
    if (this.audio.buffered && this.audio.buffered.length > 0 && this.audio.duration) {
      const bufferedEnd = this.audio.buffered.end(this.audio.buffered.length - 1);
      const pct = (bufferedEnd / this.audio.duration) * 100;
      this.timelineBuffered.style.width = `${pct}%`;
    }
  }

  bindTimelineScrubbing() {
    let isDragging = false;

    const getScrubTime = (e) => {
      const rect = this.timelineTrack.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * (this.audio.duration || 0);
    };

    const onStart = (e) => {
      isDragging = true;
      const time = getScrubTime(e);
      this.seekTo(time);
    };

    const onMove = (e) => {
      if (!isDragging) return;
      const time = getScrubTime(e);
      this.seekTo(time);
    };

    const onEnd = () => {
      if (isDragging) isDragging = false;
    };

    this.timelineTrack.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    this.timelineTrack.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  updatePlayPauseUI(playing) {
    this.iconPlay.style.display = playing ? 'none' : 'block';
    this.iconPause.style.display = playing ? 'block' : 'none';
  }

  updateAutoPauseButton() {
    this.btnAutoPause.classList.toggle('active', this.settings.autoPause);
  }

  // ==================== 7. TRANSCRIPT RENDERING & CONTRAST MODES ====================
  renderStudyView() {
    if (!this.currentLesson) return;
    const lesson = this.currentLesson;

    this.studyTitle.textContent = lesson.title;
    this.studyCategory.textContent = lesson.category || '听力精选';
    this.studySourceType.textContent = lesson.audioSourceType === 'file' ? '本地音频' : (lesson.audioSourceType === 'builtin' ? '示范原声' : '网络音频');
    this.studyDurationBadge.textContent = this.formatTime(lesson.duration || 0);

    // Sentence cards
    this.sentencesList.innerHTML = '';
    const isBlindMode = this.settings.studyMode === 'blind';

    lesson.sentences.forEach((sent, idx) => {
      const card = document.createElement('div');
      card.className = `sentence-card ${isBlindMode ? 'blind-mode' : ''}`;
      card.id = `sentence-card-${idx}`;
      card.dataset.index = idx;

      // Header row
      const header = document.createElement('div');
      header.className = 'sentence-header';

      const timeBtn = document.createElement('button');
      timeBtn.className = 'time-stamp-btn';
      timeBtn.innerHTML = `<span>▶</span> ${this.formatTime(sent.startTime)}`;
      timeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.playSentence(idx);
      });

      const actions = document.createElement('div');
      actions.className = 'sentence-actions';

      // Repeat sentence button
      const loopBtn = document.createElement('button');
      loopBtn.className = 'sentence-action-btn';
      loopBtn.title = '单句复读';
      loopBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`;
      loopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.isSingleLoop = true;
        this.btnSingleLoop.classList.add('active');
        this.playSentence(idx);
        this.showToast('已锁定单句复读');
      });

      // TTS voice pronunciation
      const voiceBtn = document.createElement('button');
      voiceBtn.className = 'sentence-action-btn';
      voiceBtn.title = '朗读此句';
      voiceBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
      voiceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.speakText(sent.text);
      });

      actions.appendChild(loopBtn);
      actions.appendChild(voiceBtn);
      header.appendChild(timeBtn);
      header.appendChild(actions);

      // English Sentence (word tokens)
      const enDiv = document.createElement('div');
      enDiv.className = 'sentence-en';
      enDiv.innerHTML = this.tokenizeSentence(sent.text, sent);

      // Chinese translation
      const zhDiv = document.createElement('div');
      zhDiv.className = `sentence-zh ${this.settings.showTrans ? '' : 'hidden'}`;
      zhDiv.textContent = sent.trans || '';

      card.appendChild(header);
      card.appendChild(enDiv);
      if (sent.trans) card.appendChild(zhDiv);

      // Click card in blind mode reveals/toggles
      card.addEventListener('click', () => {
        if (this.settings.studyMode === 'blind') {
          card.classList.toggle('revealed');
        } else {
          this.playSentence(idx);
        }
      });

      this.sentencesList.appendChild(card);
    });

    // Bind clickable word tokens
    this.bindWordTokens();

    this.applyTranslationVisibility();
  }

  tokenizeSentence(text, contextSentence) {
    // Splits by spaces and punctuation while keeping words clickable
    const regex = /([a-zA-Z0-9'-]+|[^a-zA-Z0-9\s]+|\s+)/g;
    const parts = text.match(regex) || [text];

    return parts.map(part => {
      if (/^[a-zA-Z0-9'-]+$/.test(part)) {
        const cleanWord = part.toLowerCase();
        const isSaved = this.vocabList.some(v => v.word.toLowerCase() === cleanWord);
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
        this.openWordLookup(word, ctx);
      });
    });
  }

  highlightSentence(index, scrollIntoView = false) {
    document.querySelectorAll('.sentence-card').forEach((card, idx) => {
      card.classList.toggle('active-sentence', idx === index);
    });

    if (this.currentLesson && this.currentLesson.sentences[index]) {
      this.sentenceJumpHint.textContent = `句 ${index + 1} / ${this.currentLesson.sentences.length}`;
    }

    if (scrollIntoView) {
      const activeCard = document.getElementById(`sentence-card-${index}`);
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  applyTranslationVisibility() {
    document.querySelectorAll('.sentence-zh').forEach(el => {
      el.classList.toggle('hidden', !this.settings.showTrans);
    });
    this.transToggleLabel.textContent = this.settings.showTrans ? '隐藏译文' : '显示译文';
  }

  // ==================== 8. DICTATION MODE & WORD-LEVEL DIFF ====================
  initDictationForCurrentSentence() {
    if (!this.currentLesson || !this.currentLesson.sentences.length) return;
    const idx = this.dictationIndex;
    const sent = this.currentLesson.sentences[idx];
    if (!sent) return;

    this.dictationStepIndicator.textContent = `第 ${idx + 1} / ${this.currentLesson.sentences.length} 句`;
    this.dictationInput.value = '';
    this.dictationDiffPanel.style.display = 'none';
    this.dictationInput.focus();
  }

  replayCurrentDictationSentence() {
    this.playSentence(this.dictationIndex);
  }

  showDictationHint() {
    const sent = this.currentLesson.sentences[this.dictationIndex];
    if (!sent) return;
    const words = sent.text.trim().split(/\s+/);
    const hints = words.map(w => w.charAt(0) + '_'.repeat(Math.max(1, w.length - 1))).join(' ');
    this.showToast(`提示首字母: ${hints}`, 'info');
  }

  nextDictationSentence() {
    if (!this.currentLesson) return;
    if (this.dictationIndex < this.currentLesson.sentences.length - 1) {
      this.dictationIndex++;
      this.initDictationForCurrentSentence();
      this.playSentence(this.dictationIndex);
    } else {
      this.showToast('🎉 恭喜！当前素材全部句子听写完成！');
    }
  }

  checkDictationDiff() {
    const sent = this.currentLesson.sentences[this.dictationIndex];
    if (!sent) return;

    const userInput = this.dictationInput.value.trim();
    if (!userInput) {
      this.showToast('请先输入你听到的英文句子', 'warning');
      return;
    }

    const originalText = sent.text.trim();
    const diffResult = this.computeWordDiff(userInput, originalText);

    this.diffContent.innerHTML = diffResult.html;
    this.diffAccuracyBadge.textContent = `准确率: ${diffResult.accuracy}% (${diffResult.correctWords}/${diffResult.totalWords} 词)`;
    this.diffOriginalTrans.textContent = `参考译文：${sent.trans || '（无中文）'}`;
    this.dictationDiffPanel.style.display = 'block';
  }

  computeWordDiff(userStr, origStr) {
    const cleanOrig = origStr.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
    const cleanUser = userStr.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "").toLowerCase().split(/\s+/).filter(Boolean);

    const origTokens = origStr.split(/(\s+)/);
    let matchedCount = 0;
    const htmlTokens = [];

    // Simple robust word-by-word sequence diff
    let uIdx = 0;
    for (let i = 0; i < origTokens.length; i++) {
      const token = origTokens[i];
      if (/^\s+$/.test(token)) {
        htmlTokens.push(token);
        continue;
      }

      const stripped = token.replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "").toLowerCase();
      if (uIdx < cleanUser.length && cleanUser[uIdx] === stripped) {
        matchedCount++;
        htmlTokens.push(`<span class="diff-correct">${token}</span>`);
        uIdx++;
      } else if (uIdx < cleanUser.length && cleanUser.slice(uIdx, uIdx + 3).includes(stripped)) {
        // User typed an extra or typo word before this
        const advance = cleanUser.slice(uIdx, uIdx + 3).indexOf(stripped);
        for (let k = 0; k < advance; k++) {
          htmlTokens.push(`<span class="diff-typo">${cleanUser[uIdx + k]}</span> `);
        }
        uIdx += advance;
        matchedCount++;
        htmlTokens.push(`<span class="diff-correct">${token}</span>`);
        uIdx++;
      } else {
        htmlTokens.push(`<span class="diff-missing">${token}</span>`);
      }
    }

    const totalWords = Math.max(1, cleanOrig.length);
    const accuracy = Math.min(100, Math.round((matchedCount / totalWords) * 100));

    return {
      html: htmlTokens.join(''),
      accuracy,
      correctWords: matchedCount,
      totalWords
    };
  }

  // ==================== 9. TRANSCRIPT PARSER & SAVER ====================
  openEditModal(lesson = null) {
    const titleEl = document.getElementById('edit-lesson-modal-title');
    const idInput = document.getElementById('edit-lesson-id');
    const titleInput = document.getElementById('edit-title');
    const catInput = document.getElementById('edit-category');
    const transcriptInput = document.getElementById('edit-transcript');
    const notesInput = document.getElementById('edit-notes');
    const audioUrlInput = document.getElementById('edit-audio-url');

    this.pendingAudioBlob = null;
    this.pendingAudioFilename = null;
    this.fileDropText.textContent = '点击或将音频文件拖放到此处';

    if (lesson) {
      titleEl.textContent = '编辑听力素材与原文';
      idInput.value = lesson.id;
      titleInput.value = lesson.title;
      catInput.value = lesson.category || '日常学习';
      notesInput.value = lesson.notes || '';
      audioUrlInput.value = lesson.audioSourceType === 'url' ? lesson.audioUrl : '';

      // Reconstruct transcript text from sentences
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
      audioUrlInput.value = '';
      transcriptInput.value = '';
    }

    this.modalEdit.classList.add('show');
  }

  closeEditModal() {
    this.modalEdit.classList.remove('show');
  }

  handleFileSelect(file) {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|aac|ogg|webm)$/i.test(file.name)) {
      this.showToast('请选择有效的音频文件 (MP3, M4A, WAV等)', 'warning');
      return;
    }
    this.pendingAudioBlob = file;
    this.pendingAudioFilename = file.name;
    this.fileDropText.textContent = `已选择音频: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    this.showToast('音频已加载，点击保存后将安全存入本地数据库');
  }

  formatTranscriptInput() {
    const textarea = document.getElementById('edit-transcript');
    const text = textarea.value.trim();
    if (!text) return;

    const parsed = this.parseTranscript(text);
    const formatted = parsed.map(s => {
      const timeTag = s.startTime !== undefined ? `[${this.formatLrcTime(s.startTime)}] ` : '';
      return s.trans ? `${timeTag}${s.text}\n${s.trans}` : `${timeTag}${s.text}`;
    }).join('\n\n');

    textarea.value = formatted;
    this.showToast('已完成智能断句与排版规范化');
  }

  insertSampleTranscript() {
    const textarea = document.getElementById('edit-transcript');
    textarea.value = `[00:00.00] Continuous effort is the key to unlocking our potential.
持续不断的努力是开启我们潜能的钥匙。

[00:06.50] When practicing English listening, patience and consistency make all the difference.
练习英语听力时，耐心与恒心决定了一切。

[00:14.20] Read along with the transcript first, then challenge yourself with blind listening.
先对照原文阅读磨耳朵，然后再尝试遮蔽原文进行盲听挑战。`;
    this.showToast('已填入标准示范格式听力原文');
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

      // Check if line is Chinese translation for previous English line
      const isChinese = /[\u4e00-\u9fa5]/.test(lineText) && !/^[a-zA-Z]/.test(lineText);

      if (isChinese && pendingEn) {
        sentences.push({
          id: `s_${sentences.length + 1}`,
          startTime: pendingStartTime,
          endTime: pendingStartTime + 5.0, // default placeholder
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
        pendingStartTime = startTime !== null ? startTime : (sentences.length * 6.0);
      }
    }

    if (pendingEn) {
      sentences.push({
        id: `s_${sentences.length + 1}`,
        startTime: pendingStartTime,
        endTime: pendingStartTime + 6.0,
        text: pendingEn,
        trans: ''
      });
    }

    // Adjust end times to follow next sentence's start time
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
    const id = document.getElementById('edit-lesson-id').value;
    const title = document.getElementById('edit-title').value.trim();
    const category = document.getElementById('edit-category').value.trim() || '日常听力';
    const transcriptRaw = document.getElementById('edit-transcript').value.trim();
    const notes = document.getElementById('edit-notes').value.trim();
    const urlInput = document.getElementById('edit-audio-url').value.trim();

    const activeSourceTab = document.querySelector('.source-tab.active').getAttribute('data-source');

    if (!title || !transcriptRaw) {
      this.showToast('请填写标题和听力原文', 'warning');
      return;
    }

    const sentences = this.parseTranscript(transcriptRaw);
    if (!sentences.length) {
      this.showToast('未能解析出有效句子，请检查原文格式', 'warning');
      return;
    }

    let lessonId = id || `lesson_${Date.now()}`;
    let existingLesson = this.lessons.find(l => l.id === lessonId);

    let audioSourceType = activeSourceTab;
    let audioBlobId = existingLesson ? existingLesson.audioBlobId : null;
    let audioUrl = existingLesson ? existingLesson.audioUrl : '';

    if (activeSourceTab === 'file' && this.pendingAudioBlob) {
      audioBlobId = `audio_blob_${Date.now()}`;
      await saveAudioBlob(audioBlobId, this.pendingAudioBlob, this.pendingAudioFilename);
      audioSourceType = 'file';
    } else if (activeSourceTab === 'url') {
      audioUrl = urlInput;
      audioSourceType = 'url';
    } else if (activeSourceTab === 'tts') {
      audioSourceType = 'tts';
    }

    const lessonData = {
      id: lessonId,
      title,
      category,
      audioSourceType: audioBlobId ? 'file' : audioSourceType,
      audioBlobId,
      audioUrl,
      duration: existingLesson ? existingLesson.duration : (sentences.length * 6),
      lastPosition: 0,
      favorite: existingLesson ? existingLesson.favorite : false,
      completed: false,
      updatedAt: Date.now(),
      sentences,
      notes
    };

    if (existingLesson) {
      const idx = this.lessons.findIndex(l => l.id === lessonId);
      this.lessons[idx] = lessonData;
    } else {
      this.lessons.unshift(lessonData);
    }

    this.saveLessonsToStorage();
    this.closeEditModal();
    this.showToast('听力素材与原文已成功保存！');

    // Switch to this lesson and open Study view
    await this.switchLesson(lessonId, false);
    this.switchView('study');
    this.renderLibrary();
  }

  // ==================== 10. LIBRARY VIEW ====================
  renderLibrary(searchQuery = '', filterType = 'all') {
    const grid = document.getElementById('library-cards-grid');
    grid.innerHTML = '';

    const query = searchQuery.trim().toLowerCase();
    const filtered = this.lessons.filter(item => {
      // Query filter
      const matchesSearch = !query ||
        item.title.toLowerCase().includes(query) ||
        (item.category && item.category.toLowerCase().includes(query)) ||
        item.sentences.some(s => s.text.toLowerCase().includes(query) || (s.trans && s.trans.includes(query)));

      // Type filter
      let matchesType = true;
      if (filterType === 'favorite') matchesType = item.favorite;
      else if (filterType === 'completed') matchesType = item.completed;
      else if (filterType === 'in_progress') matchesType = !item.completed;

      return matchesSearch && matchesType;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          <p style="font-size: 16px; margin-bottom: 8px;">没有找到匹配的听力素材</p>
          <button class="btn-primary btn-sm" id="btn-empty-add">+ 立即添加新素材</button>
        </div>
      `;
      const btn = document.getElementById('btn-empty-add');
      if (btn) btn.addEventListener('click', () => this.openEditModal());
      return;
    }

    filtered.forEach(lesson => {
      const card = document.createElement('div');
      card.className = 'lesson-card';

      const snippet = lesson.sentences && lesson.sentences[0] ? lesson.sentences[0].text : '（暂无原文）';

      card.innerHTML = `
        <div class="lesson-card-top">
          <div class="lesson-card-meta">
            <span class="badge category-badge">${this.escapeHtml(lesson.category || '精选')}</span>
            <button class="btn-subtle btn-sm fav-toggle-btn" title="收藏">
              ${lesson.favorite ? '★' : '☆'}
            </button>
          </div>
          <h3 class="lesson-card-title">${this.escapeHtml(lesson.title)}</h3>
          <p class="lesson-card-snippet">${this.escapeHtml(snippet)}</p>
        </div>
        <div class="lesson-card-footer">
          <span class="lesson-card-stats">${lesson.sentences ? lesson.sentences.length : 0} 句 · ${this.formatTime(lesson.duration || 0)}</span>
          <div class="lesson-card-actions">
            <button class="btn-subtle btn-sm edit-lesson-btn" title="编辑原文">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-subtle btn-sm delete-lesson-btn" title="删除素材">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;

      // Click card to open in Study view
      card.addEventListener('click', (e) => {
        if (e.target.closest('.lesson-card-actions') || e.target.closest('.fav-toggle-btn')) return;
        this.switchLesson(lesson.id, false);
        this.switchView('study');
      });

      // Toggle favorite
      card.querySelector('.fav-toggle-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        lesson.favorite = !lesson.favorite;
        this.saveLessonsToStorage();
        this.renderLibrary(searchQuery, filterType);
      });

      // Edit lesson
      card.querySelector('.edit-lesson-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditModal(lesson);
      });

      // Delete lesson
      card.querySelector('.delete-lesson-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`确定删除《${lesson.title}》吗？`)) {
          this.deleteLesson(lesson.id);
        }
      });

      grid.appendChild(card);
    });
  }

  async deleteLesson(lessonId) {
    const lesson = this.lessons.find(l => l.id === lessonId);
    if (lesson && lesson.audioBlobId) {
      await deleteAudioBlob(lesson.audioBlobId);
    }
    this.lessons = this.lessons.filter(l => l.id !== lessonId);
    this.saveLessonsToStorage();
    this.showToast('已删除听力素材');

    if (this.currentLesson && this.currentLesson.id === lessonId) {
      if (this.lessons.length > 0) {
        this.switchLesson(this.lessons[0].id, false);
      }
    }
    this.renderLibrary();
  }

  // ==================== 11. WORD LOOKUP & VOCABULARY ====================
  async openWordLookup(rawWord, contextSentence) {
    const word = rawWord.toLowerCase().replace(/[^a-z0-9'-]/g, '');
    if (!word) return;

    const wordEl = document.getElementById('popup-word-text');
    const phoneticEl = document.getElementById('popup-word-phonetic');
    const meaningsEl = document.getElementById('popup-word-meanings');
    const ctxEl = document.getElementById('popup-sentence-ctx');
    const saveBtn = document.getElementById('btn-save-to-vocab');

    wordEl.textContent = word;
    phoneticEl.textContent = '...';
    meaningsEl.innerHTML = '<div class="meaning-item loading">🔍 正在查询释义与英英音标...</div>';
    ctxEl.textContent = `“${contextSentence}”`;

    // Speak button
    document.getElementById('btn-speak-word').onclick = () => {
      this.speakText(word);
    };

    this.modalWord.classList.add('show');

    // Fetch definition
    const def = await this.fetchWordDefinition(word);
    phoneticEl.textContent = def.phonetic ? `/${def.phonetic}/` : '';
    meaningsEl.innerHTML = '';

    if (def.meanings && def.meanings.length) {
      def.meanings.forEach(m => {
        const item = document.createElement('div');
        item.className = 'meaning-item';
        item.innerHTML = `<strong>${m.partOfSpeech || ''}</strong> ${m.definition || ''}`;
        meaningsEl.appendChild(item);
      });
    } else {
      meaningsEl.innerHTML = '<div class="meaning-item">常用英文词汇，可加入生词本复习。</div>';
    }

    const isAlreadySaved = this.vocabList.some(v => v.word.toLowerCase() === word);
    saveBtn.innerHTML = isAlreadySaved ? '✓ 已在生词本中' : '加入生词本';
    saveBtn.disabled = isAlreadySaved;

    saveBtn.onclick = () => {
      this.addWordToVocab({
        word,
        phonetic: def.phonetic || '',
        meaning: def.meanings && def.meanings[0] ? def.meanings[0].definition : '',
        contextSentence,
        sourceLessonTitle: this.currentLesson ? this.currentLesson.title : '',
        date: Date.now()
      });
      saveBtn.innerHTML = '✓ 已在生词本中';
      saveBtn.disabled = true;
      this.showToast(`已将 "${word}" 加入生词本`);
    };
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
      console.warn('Dictionary API request failed:', e);
    }

    // Fallback definition
    return {
      phonetic: '',
      meanings: [{ partOfSpeech: 'n./v.', definition: '英文听力核心词汇' }]
    };
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
      this.renderStudyView(); // updates highlighted words in sentences
    }
  }

  renderVocabList(searchQuery = '') {
    const list = document.getElementById('vocab-list');
    list.innerHTML = '';
    this.updateVocabBadge();

    const query = searchQuery.trim().toLowerCase();
    const filtered = this.vocabList.filter(v => {
      return !query || v.word.toLowerCase().includes(query) || (v.meaning && v.meaning.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>暂无生词记录</p>
          <p style="font-size: 12.5px; margin-top: 4px;">在精听对照模式下轻点句子中的任意单词，即可将其加入生词本</p>
        </div>
      `;
      return;
    }

    filtered.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'vocab-card';

      card.innerHTML = `
        <div class="vocab-card-header">
          <div class="vocab-head-left">
            <span class="vocab-word">${this.escapeHtml(item.word)}</span>
            ${item.phonetic ? `<span class="vocab-phonetic">/${this.escapeHtml(item.phonetic)}/</span>` : ''}
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn-icon btn-sm speak-vocab-btn" title="发音">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            </button>
            <button class="btn-subtle btn-sm del-vocab-btn" title="移除生词">✕</button>
          </div>
        </div>
        ${item.meaning ? `<div class="vocab-meaning">${this.escapeHtml(item.meaning)}</div>` : ''}
        ${item.contextSentence ? `<div class="vocab-context">“${this.escapeHtml(item.contextSentence)}”</div>` : ''}
      `;

      card.querySelector('.speak-vocab-btn').addEventListener('click', () => {
        this.speakText(item.word);
      });

      card.querySelector('.del-vocab-btn').addEventListener('click', () => {
        this.vocabList = this.vocabList.filter(v => v.word !== item.word);
        this.saveVocabToStorage();
        this.renderVocabList(searchQuery);
        this.renderStudyView();
      });

      list.appendChild(card);
    });
  }

  updateVocabBadge() {
    const badge = document.getElementById('vocab-count-badge');
    badge.textContent = this.vocabList.length;
  }

  exportVocab() {
    if (!this.vocabList.length) {
      this.showToast('生词本为空，无需导出', 'info');
      return;
    }
    const txt = this.vocabList.map(v => `${v.word}\t${v.phonetic || ''}\t${v.meaning || ''}\t${v.contextSentence || ''}`).join('\n');
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    this.downloadBlob(blob, `Minimal_English_Vocab_${this.formatDate(Date.now())}.txt`);
    this.showToast('生词本已导出为文本文件');
  }

  clearVocab() {
    if (!this.vocabList.length) return;
    if (confirm('确定清空生词本中的所有单词吗？')) {
      this.vocabList = [];
      this.saveVocabToStorage();
      this.renderVocabList();
      this.renderStudyView();
      this.showToast('生词本已清空');
    }
  }

  // ==================== 12. BACKUP & RESTORE ====================
  openSettingsModal() {
    this.modalSettings.classList.add('show');
  }

  closeSettingsModal() {
    this.modalSettings.classList.remove('show');
  }

  exportBackup() {
    const backupData = {
      app: 'MinimalEnglishListener',
      version: 1,
      exportTime: Date.now(),
      lessons: this.lessons,
      vocabList: this.vocabList,
      settings: this.settings
    };
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    this.downloadBlob(blob, `Minimal_Listener_Backup_${this.formatDate(Date.now())}.json`);
    this.showToast('完整备份文件已成功导出！');
  }

  importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.lessons && Array.isArray(data.lessons)) {
          this.lessons = data.lessons;
          this.saveLessonsToStorage();
        }
        if (data.vocabList && Array.isArray(data.vocabList)) {
          this.vocabList = data.vocabList;
          this.saveVocabToStorage();
        }
        if (data.settings) {
          this.settings = { ...this.settings, ...data.settings };
          this.saveSettings();
          this.applySettings();
        }
        this.showToast('备份恢复成功！');
        this.closeSettingsModal();
        this.renderLibrary();
        this.renderVocabList();
        if (this.lessons[0]) this.switchLesson(this.lessons[0].id, false);
      } catch (err) {
        this.showToast('备份文件格式错误，导入失败', 'danger');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  resetToDefaults() {
    if (confirm('确定重新加载默认示范听力素材吗？')) {
      this.lessons = JSON.parse(JSON.stringify(DEFAULT_LESSONS));
      this.saveLessonsToStorage();
      this.switchLesson(this.lessons[0].id, false);
      this.renderLibrary();
      this.closeSettingsModal();
      this.showToast('已重置为官方示范素材');
    }
  }

  // ==================== 13. SETTINGS & STYLES ====================
  applySettings() {
    this.setTheme(this.settings.theme);
    this.setFont(this.settings.font);

    // Font size
    document.documentElement.style.setProperty('--article-font-size', `${this.settings.fontSize}px`);
    document.getElementById('setting-font-size').value = this.settings.fontSize;
    document.getElementById('font-size-indicator').textContent = `${this.settings.fontSize}px`;

    // Speed
    this.setPlaybackRate(this.settings.speed);

    // Rewind step
    document.getElementById('setting-rewind-step').value = this.settings.rewindStep;
    document.getElementById('rewind-step-label').textContent = `${this.settings.rewindStep}s`;
    document.getElementById('forward-step-label').textContent = `${this.settings.rewindStep}s`;

    // Auto pause
    this.updateAutoPauseButton();
    document.getElementById('setting-auto-pause-sec').value = this.settings.autoPauseSeconds;

    // Study mode
    this.switchStudyMode(this.settings.studyMode || 'contrast');
  }

  setTheme(themeName) {
    this.settings.theme = themeName;
    document.body.setAttribute('data-theme', themeName);
    document.querySelectorAll('.theme-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-theme-val') === themeName);
    });
    this.saveSettings();
  }

  toggleTheme() {
    const cycle = { warm: 'light', light: 'dark', dark: 'warm' };
    this.setTheme(cycle[this.settings.theme] || 'warm');
    this.showToast(`已切换主题: ${this.settings.theme === 'warm' ? '暖阳纸' : (this.settings.theme === 'light' ? '极简白' : '深邃夜')}`);
  }

  setFont(fontName) {
    this.settings.font = fontName;
    document.body.setAttribute('data-font', fontName);
    document.querySelectorAll('.font-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-font-val') === fontName);
    });
    this.saveSettings();
  }

  // ==================== 14. KEYBOARD SHORTCUTS & HELPERS ====================
  handleKeyboardShortcuts(e) {
    // If typing in input or textarea, skip player shortcuts
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
      if (this.currentSentenceIndex !== -1) {
        this.playSentence(this.currentSentenceIndex);
      }
    } else if (e.key === 'l' || e.key === 'L') {
      this.toggleSingleLoop();
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  formatLrcTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00.00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  formatDate(timestamp) {
    const d = new Date(timestamp);
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

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2400);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('SW registration skipped or failed:', err);
      });
    }
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  window.app = new ListenerApp();
});
