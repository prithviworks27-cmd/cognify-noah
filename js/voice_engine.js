/**
 * Cognify - NOAH Voice Engine
 * Manages SpeechSynthesis (Ultron Persona TTS) and continuous SpeechRecognition
 * (STT) that stays open across pauses for a whole answer window.
 */

class VoiceEngine {
    constructor() {
        this.synth = window.speechSynthesis;
        this.recognition = null;
        this.isListening = false;
        this._cap = null;
        this.isSpeaking = false;
        this.audioContext = null;
        this.selectedVoice = null;

        // Configuration for Ultron persona voice
        this.pitch = 0.65; // Deep robotic pitch
        this.rate = 0.92;  // Measured, deliberate speed

        this.initVoices();
        this.initRecognition();
    }

    initVoices() {
        if (!this.synth) return;
        const loadVoices = () => {
            const voices = this.synth.getVoices();
            // Prefer deep male or robotic English voices if available
            this.selectedVoice = voices.find(v => 
                (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Male') || v.lang.startsWith('en')) &&
                !v.name.includes('Female')
            ) || voices[0] || null;
        };

        loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = loadVoices;
        }
    }

    initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('SpeechRecognition API not supported in this browser. Fallback input available.');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
    }

    speak(text, onEndCallback, onStartCallback) {
        if (!this.synth) {
            if (onEndCallback) onEndCallback();
            return;
        }

        this.stopSpeaking();

        // Standardize Ultron opening if applicable
        const utterance = new SpeechSynthesisUtterance(text);
        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
        }
        utterance.pitch = this.pitch;
        utterance.rate = this.rate;

        utterance.onstart = () => {
            this.isSpeaking = true;
            if (window.audioVisualizer) window.audioVisualizer.setMode('speaking');
            if (onStartCallback) onStartCallback();
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            if (window.audioVisualizer) window.audioVisualizer.setMode('idle');
            if (onEndCallback) onEndCallback();
        };

        utterance.onerror = (err) => {
            console.error('Speech synthesis error:', err);
            this.isSpeaking = false;
            if (window.audioVisualizer) window.audioVisualizer.setMode('idle');
            if (onEndCallback) onEndCallback();
        };

        this.synth.speak(utterance);
    }

    stopSpeaking() {
        if (this.synth && this.synth.speaking) {
            this.synth.cancel();
            this.isSpeaking = false;
            if (window.audioVisualizer) window.audioVisualizer.setMode('idle');
        }
    }

    // --- Answer capture ---------------------------------------------------
    // Keeps the mic open for as long as the caller wants (the exam gives each
    // question a fixed window). Browsers end a recognition session on their
    // own after silence or a time cap, so a session that ends while capture
    // is still wanted is simply restarted and its text carried forward.
    //
    //   onInterim(fullTextSoFar)  — every time the running transcript changes
    //   onProblem(kind, message)  — 'blocked' | 'no-mic' (fatal) | 'unstable'
    //                               | 'network' (recoverable)
    // Returns false when this browser has no speech recognition at all.
    startCapture({ onInterim, onProblem } = {}) {
        if (!this.recognition) return false;
        this.stopSpeaking();
        this.cancelCapture();

        this._cap = {
            active: true,
            stopping: false,
            committed: '',
            sessionText: '',
            problems: 0,
            fastRestarts: 0,
            lastStart: 0,
            onInterim,
            onProblem,
            waiters: []
        };
        this._openSession();
        return true;
    }

    _join(a, b) {
        return [a, b].map(t => (t || '').trim()).filter(Boolean).join(' ');
    }

    _captureText() {
        return this._cap ? this._join(this._cap.committed, this._cap.sessionText) : '';
    }

    _openSession() {
        const cap = this._cap;
        const rec = this.recognition;
        if (!cap || !cap.active) return;

        rec.onstart = () => {
            this.isListening = true;
            if (window.audioVisualizer) window.audioVisualizer.setMode('listening');
        };

        rec.onresult = (event) => {
            if (this._cap !== cap) return;
            // With continuous=true, event.results holds every result of this
            // session (finals plus the trailing interim).
            cap.sessionText = Array.from(event.results).map(r => r[0].transcript).join(' ');
            if (cap.onInterim) cap.onInterim(this._captureText());
        };

        rec.onerror = (event) => {
            if (this._cap !== cap) return;
            const err = event.error;
            if (err === 'no-speech' || err === 'aborted') return;
            if (err === 'not-allowed' || err === 'service-not-allowed') {
                cap.active = false;
                if (cap.onProblem) cap.onProblem('blocked', 'Microphone access is blocked. Allow it in your browser, or type your answer below.');
            } else if (err === 'audio-capture') {
                cap.active = false;
                if (cap.onProblem) cap.onProblem('no-mic', 'No microphone was found. Type your answer below.');
            } else {
                cap.problems++;
                if (cap.onProblem) cap.onProblem('network', 'The speech service dropped out; retrying.');
            }
        };

        rec.onend = () => {
            this.isListening = false;
            if (window.audioVisualizer) window.audioVisualizer.setMode('idle');
            if (this._cap !== cap) return;

            // Carry this session's text forward whether we restart or stop.
            cap.committed = this._join(cap.committed, cap.sessionText);
            cap.sessionText = '';

            if (cap.active && !cap.stopping) {
                const now = Date.now();
                cap.fastRestarts = now - cap.lastStart < 700 ? cap.fastRestarts + 1 : 0;
                if (cap.fastRestarts > 8) {
                    cap.active = false;
                    if (cap.onProblem) cap.onProblem('unstable', 'The microphone keeps cutting out. Type your answer below.');
                    return;
                }
                setTimeout(() => this._startRecognition(cap), 120);
                return;
            }

            const text = this._captureText();
            cap.waiters.splice(0).forEach(resolve => resolve(text));
        };

        this._startRecognition(cap);
    }

    _startRecognition(cap) {
        if (this._cap !== cap || !cap.active) return;
        cap.lastStart = Date.now();
        try {
            this.recognition.start();
        } catch (e) {
            // InvalidStateError: either a session is already running (fine),
            // or a previous one is still winding down after abort() — in
            // which case try again shortly.
            if (!this.isListening) setTimeout(() => this._startRecognition(cap), 250);
        }
    }

    // Ends the capture and resolves with everything heard, including text the
    // browser was still finalizing when the window closed.
    finishCapture() {
        const cap = this._cap;
        if (!cap) return Promise.resolve('');
        cap.active = false;
        cap.stopping = true;

        return new Promise((resolve) => {
            const done = () => resolve(this._captureText());
            if (!this.isListening) {
                done();
                return;
            }
            cap.waiters.push(resolve);
            try { this.recognition.stop(); } catch (e) { done(); return; }
            // Safety net so a browser that never fires onend can't hang the exam.
            setTimeout(() => { if (cap.waiters.length) { cap.waiters.splice(0).forEach(r => r(this._captureText())); } }, 1500);
        });
    }

    // Drops the capture without reporting anything (exam closed, tab left).
    cancelCapture() {
        const cap = this._cap;
        if (cap) {
            cap.active = false;
            cap.stopping = true;
            cap.waiters.splice(0).forEach(resolve => resolve(''));
        }
        this._cap = null;
        if (this.recognition) {
            try { this.recognition.abort(); } catch (e) { /* not running */ }
        }
        this.isListening = false;
        if (window.audioVisualizer) window.audioVisualizer.setMode('idle');
    }

    // Kept as the single "make sure the mic is off" call used on exam exit.
    stopListening() {
        this.cancelCapture();
    }
}

window.voiceEngine = new VoiceEngine();
