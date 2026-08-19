/**
 * Cognify - NOAH Voice Engine
 * Manages SpeechSynthesis (Ultron Persona TTS) and SpeechRecognition (STT + retry logic)
 */

class VoiceEngine {
    constructor() {
        this.synth = window.speechSynthesis;
        this.recognition = null;
        this.isListening = false;
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
        this.recognition.continuous = false;
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

    listen({ onInterim, onResult, onError, onNoSpeech, timeoutMs = 12000 }) {
        if (!this.recognition) {
            if (onError) onError('Speech recognition is not supported on this browser. Please use text input below.');
            return;
        }

        this.stopSpeaking();

        let finalTranscript = '';
        let hasSpoken = false;
        let timeoutTimer = null;

        this.recognition.onstart = () => {
            this.isListening = true;
            if (window.audioVisualizer) window.audioVisualizer.setMode('listening');

            // Set timeout for silent response
            timeoutTimer = setTimeout(() => {
                if (this.isListening && !hasSpoken) {
                    this.stopListening();
                    if (onNoSpeech) onNoSpeech();
                }
            }, timeoutMs);
        };

        this.recognition.onresult = (event) => {
            hasSpoken = true;
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (onInterim) onInterim(interimTranscript || finalTranscript);
        };

        this.recognition.onerror = (event) => {
            this.isListening = false;
            if (timeoutTimer) clearTimeout(timeoutTimer);
            if (window.audioVisualizer) window.audioVisualizer.setMode('idle');
            if (onError) onError(event.error);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (timeoutTimer) clearTimeout(timeoutTimer);
            if (window.audioVisualizer) window.audioVisualizer.setMode('idle');
            
            if (finalTranscript.trim()) {
                if (onResult) onResult(finalTranscript.trim());
            } else if (!hasSpoken && onNoSpeech) {
                onNoSpeech();
            }
        };

        try {
            this.recognition.start();
        } catch (e) {
            console.warn('Recognition start exception:', e);
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            if (window.audioVisualizer) window.audioVisualizer.setMode('idle');
        }
    }
}

window.voiceEngine = new VoiceEngine();
