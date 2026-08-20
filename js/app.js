/**
 * Cognify - NOAH Main Application Controller (v4.0)
 * Manages full-screen NOAH particle kiosk, role auth permissions, document uploads, and cinematic Ultron video rush login transition.
 */

class AppController {
    constructor() {
        this.currentView = 'landing';
        this.widgetOpen = false;
        this.isWarpTransition = false;
        
        // Student Exam Session State
        this.examSession = {
            active: false,
            studentName: '',
            studentId: '',
            gradeLevel: '',
            selectedPaper: null,
            currentQuestionIndex: 0,
            answers: [],
            retriesForCurrentQ: 0,
            maxRetries: 2,
            startTime: null
        };

        this.pendingParsedPaper = null;

        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    init() {
        this.bindNavigationEvents();
        this.bindAuthEvents();
        this.bindWidgetEvents();
        this.bindExamEvents();
        this.bindAdminEvents();
        this.bindFileUploadEvents();
        this.bindBackgroundVideoLoop();

        this.updateUserAuthHeaderUI();
        this.renderSubjectAndPapers();
        this.renderStaffDashboard();

        if (window.lucide) window.lucide.createIcons();
    }

    // --- Background Video Levitating Loop Handler ---
    bindBackgroundVideoLoop() {
        const bgVideo = document.getElementById('bgUltronVideo');
        if (bgVideo) {
            bgVideo.addEventListener('timeupdate', () => {
                // Loop the levitating hovering sequence (0.0s to 3.8s) while on landing page before login
                if (!this.isWarpTransition && bgVideo.currentTime >= 3.8) {
                    bgVideo.currentTime = 0;
                    bgVideo.play();
                }
            });
        }
    }

    // --- Cinematic Login Rush Transition ---
    playCinematicLoginTransition(targetView, onComplete) {
        this.isWarpTransition = true;
        const bgVideo = document.getElementById('bgUltronVideo');
        const heroContent = document.getElementById('landingHeroContent');
        const authModal = document.getElementById('authModal');

        if (authModal) authModal.classList.add('hidden');

        // 1. Video jumps to 3.9s and plays forward as Ultron rushes towards the screen!
        if (bgVideo) {
            bgVideo.currentTime = 3.9;
            bgVideo.play();
        }

        // 2. Expand NOAH 3D particle swarm with Unreal Bloom explosion
        if (window.audioVisualizer) {
            window.audioVisualizer.triggerHyperDriveExpansion();
        }

        // 3. Fade out hero text
        if (heroContent) {
            heroContent.classList.add('opacity-0', 'scale-110', 'pointer-events-none');
        }

        // 4. After 1.3 seconds, transition to the respective Student/Admin view
        setTimeout(() => {
            this.switchView(targetView);
            this.isWarpTransition = false;

            if (heroContent) {
                heroContent.classList.remove('opacity-0', 'scale-110', 'pointer-events-none');
            }
            if (bgVideo) {
                bgVideo.currentTime = 0;
            }
            if (onComplete) onComplete();
        }, 1300);
    }

    // --- Navigation & View Switching ---
    switchView(viewName) {
        if (viewName === 'staff-dashboard' && !window.authManager.isAdmin()) {
            this.openAuthModal('admin');
            return;
        }

        this.currentView = viewName;
        document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));

        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) {
            targetView.classList.remove('hidden');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (viewName === 'landing' && window.audioVisualizer) {
            window.audioVisualizer.moveToContainer('ultronCanvasContainer');
        }

        if (viewName === 'student-kiosk') {
            this.renderSubjectAndPapers();
        } else if (viewName === 'staff-dashboard') {
            this.renderStaffDashboard();
        }

        if (window.lucide) window.lucide.createIcons();
    }

    bindNavigationEvents() {
        document.querySelectorAll('[data-view-target]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-view-target');
                if (this.currentView === 'landing' && (target === 'student-kiosk' || target === 'staff-dashboard')) {
                    this.playCinematicLoginTransition(target);
                } else {
                    this.switchView(target);
                }
            });
        });
    }

    // --- Auth UI Management ---
    updateUserAuthHeaderUI() {
        const currentUser = window.authManager.getCurrentUser();
        const userBadge = document.getElementById('userAuthBadge');
        const roleBtn = document.getElementById('switchRoleBtn');

        if (userBadge) {
            if (window.authManager.isAdmin()) {
                userBadge.innerHTML = `
                    <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span class="font-bold text-cyan-300">Admin Mode</span>
                `;
                userBadge.className = "flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-xs font-mono";
            } else {
                userBadge.innerHTML = `
                    <span class="w-2 h-2 rounded-full bg-blue-400"></span>
                    <span>Student: <strong>${currentUser.studentName}</strong> (${currentUser.gradeLevel})</span>
                `;
                userBadge.className = "flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/60 border border-blue-500/40 text-xs text-blue-300 font-mono";
            }
        }

        if (roleBtn) {
            roleBtn.innerText = window.authManager.isAdmin() ? "Switch to Student" : "Admin Login";
        }
    }

    bindAuthEvents() {
        const switchRoleBtn = document.getElementById('switchRoleBtn');
        const authModal = document.getElementById('authModal');
        const closeAuthModal = document.getElementById('closeAuthModalBtn');
        const studentLoginForm = document.getElementById('studentLoginForm');
        const adminLoginForm = document.getElementById('adminLoginForm');
        const toggleAuthModeBtn = document.getElementById('toggleAuthModeBtn');

        if (switchRoleBtn) {
            switchRoleBtn.addEventListener('click', () => {
                if (window.authManager.isAdmin()) {
                    window.authManager.logout();
                    this.updateUserAuthHeaderUI();
                    this.switchView('landing');
                    alert('Switched to Student Mode.');
                } else {
                    this.openAuthModal('admin');
                }
            });
        }

        if (closeAuthModal) {
            closeAuthModal.addEventListener('click', () => {
                authModal.classList.add('hidden');
            });
        }

        if (toggleAuthModeBtn) {
            toggleAuthModeBtn.addEventListener('click', () => {
                const isAdminFormVisible = !adminLoginForm.classList.contains('hidden');
                if (isAdminFormVisible) {
                    adminLoginForm.classList.add('hidden');
                    studentLoginForm.classList.remove('hidden');
                    toggleAuthModeBtn.innerText = "Need Admin Access? Sign in as Admin";
                } else {
                    studentLoginForm.classList.add('hidden');
                    adminLoginForm.classList.remove('hidden');
                    toggleAuthModeBtn.innerText = "Sign in as Student instead";
                }
            });
        }

        if (studentLoginForm) {
            studentLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const name = document.getElementById('authStudentName').value.trim();
                const id = document.getElementById('authStudentId').value.trim();
                const grade = document.getElementById('authStudentGrade').value;

                window.authManager.loginAsStudent(name, id, grade);
                this.updateUserAuthHeaderUI();
                
                // Trigger Cinematic Ultron Rush Video + Particle Warp Transition!
                this.playCinematicLoginTransition('student-kiosk');
            });
        }

        if (adminLoginForm) {
            adminLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const passkey = document.getElementById('authAdminPasskey').value.trim();
                const res = window.authManager.loginAsAdmin(passkey);
                if (res.success) {
                    this.updateUserAuthHeaderUI();
                    
                    // Trigger Cinematic Ultron Rush Video + Particle Warp Transition!
                    this.playCinematicLoginTransition('staff-dashboard');
                } else {
                    alert(res.message);
                }
            });
        }
    }

    openAuthModal(defaultMode = 'student') {
        const authModal = document.getElementById('authModal');
        const studentLoginForm = document.getElementById('studentLoginForm');
        const adminLoginForm = document.getElementById('adminLoginForm');
        const toggleAuthModeBtn = document.getElementById('toggleAuthModeBtn');

        authModal.classList.remove('hidden');
        if (defaultMode === 'admin') {
            studentLoginForm.classList.add('hidden');
            adminLoginForm.classList.remove('hidden');
            toggleAuthModeBtn.innerText = "Sign in as Student instead";
        } else {
            adminLoginForm.classList.add('hidden');
            studentLoginForm.classList.remove('hidden');
            toggleAuthModeBtn.innerText = "Need Admin Access? Sign in as Admin";
        }
    }

    // --- PDF & Photo File Upload Events ---
    bindFileUploadEvents() {
        const dropZone = document.getElementById('pdfPhotoDropZone');
        const fileInput = document.getElementById('pdfPhotoFileInput');
        const publishParsedPaperBtn = document.getElementById('publishParsedPaperBtn');

        if (!dropZone || !fileInput) return;

        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-500', 'bg-blue-950/20');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-blue-500', 'bg-blue-950/20');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-blue-950/20');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleFileSelected(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.handleFileSelected(e.target.files[0]);
            }
        });

        if (publishParsedPaperBtn) {
            publishParsedPaperBtn.addEventListener('click', () => {
                if (!this.pendingParsedPaper) return;
                
                const customTitle = document.getElementById('parsedPaperTitleInput').value.trim();
                const customGrade = document.getElementById('parsedPaperGradeSelect').value;
                const customSubject = document.getElementById('parsedPaperSubjectSelect').value;

                const finalPaper = {
                    id: 'paper-' + Date.now(),
                    subjectId: customSubject,
                    title: customTitle || this.pendingParsedPaper.title,
                    gradeLevel: customGrade,
                    active: true,
                    durationMinutes: 10,
                    questions: this.pendingParsedPaper.questions
                };

                window.dataStore.saveTestPaper(finalPaper);
                alert(`Paper "${finalPaper.title}" (${finalPaper.questions.length} questions) published to ${customGrade} students successfully!`);

                document.getElementById('extractedQuestionsPreviewContainer').classList.add('hidden');
                this.pendingParsedPaper = null;
                fileInput.value = '';

                this.renderSubjectAndPapers();
                this.renderStaffDashboard();
            });
        }
    }

    async handleFileSelected(file) {
        const statusBox = document.getElementById('fileParsingStatus');
        statusBox.classList.remove('hidden');
        statusBox.innerText = `NOAH is processing and OCR-parsing document "${file.name}"... Please wait.`;

        try {
            const parsedData = await window.documentParser.parseFile(file);
            this.pendingParsedPaper = parsedData;

            statusBox.classList.add('hidden');

            const previewContainer = document.getElementById('extractedQuestionsPreviewContainer');
            previewContainer.classList.remove('hidden');

            document.getElementById('parsedPaperTitleInput').value = parsedData.title;
            
            const qList = document.getElementById('extractedQuestionsList');
            qList.innerHTML = parsedData.questions.map((q, idx) => `
                <div class="p-4 rounded-xl bg-gray-950 border border-gray-800 space-y-2">
                    <div class="flex items-center justify-between text-xs font-mono">
                        <span class="text-blue-400 font-bold">NOAH Question ${idx + 1}:</span>
                        <span class="px-2 py-0.5 rounded bg-gray-900 text-cyan-300 font-mono text-[10px]">Topic: ${q.topicTag}</span>
                    </div>
                    <p class="text-sm text-white font-medium">${q.text}</p>
                    <div class="text-xs text-gray-400 font-mono">
                        <span>Extracted Keywords: </span><span class="text-gray-300 font-bold">${q.keywords.join(', ')}</span>
                    </div>
                </div>
            `).join('');

            if (window.lucide) window.lucide.createIcons();
        } catch (err) {
            console.error('File parse error:', err);
            statusBox.innerText = `Error parsing file: ${err.message}`;
        }
    }

    // --- Floating Widget Handlers ---
    bindWidgetEvents() {
        const toggleBtn = document.getElementById('widgetToggleBtn');
        const widgetWindow = document.getElementById('noahWidgetWindow');
        const closeBtn = document.getElementById('widgetCloseBtn');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.widgetOpen = !this.widgetOpen;
                if (this.widgetOpen) {
                    widgetWindow.classList.remove('hidden', 'scale-95', 'opacity-0');
                    widgetWindow.classList.add('scale-100', 'opacity-100');
                    if (window.voiceEngine) {
                        window.voiceEngine.speak("Greetings. I am NOAH. Select your paper to begin your examination.");
                    }
                } else {
                    widgetWindow.classList.add('scale-95', 'opacity-0');
                    setTimeout(() => widgetWindow.classList.add('hidden'), 200);
                    if (window.voiceEngine) window.voiceEngine.stopSpeaking();
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.widgetOpen = false;
                widgetWindow.classList.add('scale-95', 'opacity-0');
                setTimeout(() => widgetWindow.classList.add('hidden'), 200);
                if (window.voiceEngine) window.voiceEngine.stopSpeaking();
            });
        }
    }

    // --- Subject & Paper Rendering for Logged-In Student ---
    renderSubjectAndPapers() {
        const currentUser = window.authManager.getCurrentUser();
        const userGrade = currentUser.gradeLevel || 'Class 5';

        const gradePapers = window.dataStore.getPapersForGrade(userGrade);
        const widgetSelect = document.getElementById('widgetPaperSelect');
        const studentPapersList = document.getElementById('studentAssignedPapersList');

        document.getElementById('displayStudentName').innerText = currentUser.studentName || 'Student';
        document.getElementById('displayStudentGrade').innerText = currentUser.gradeLevel || 'Class 5';
        document.getElementById('displayStudentId').innerText = currentUser.studentId || 'STU-5001';

        if (studentPapersList) {
            if (gradePapers.length === 0) {
                studentPapersList.innerHTML = `
                    <div class="p-8 rounded-2xl bg-gray-900/60 border border-dashed border-gray-800 text-center col-span-full">
                        <i data-lucide="file-question" class="w-12 h-12 text-gray-600 mx-auto mb-3"></i>
                        <h4 class="text-lg font-bold text-gray-300 mb-1">No Active Papers Found for ${userGrade}</h4>
                        <p class="text-xs text-gray-500">Log in as Admin to upload a PDF or Photo test paper for ${userGrade}.</p>
                    </div>
                `;
            } else {
                studentPapersList.innerHTML = gradePapers.map(paper => `
                    <div class="glass-card p-6 rounded-2xl border border-blue-500/30 hover:border-blue-500 transition duration-300 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-xs px-2.5 py-1 rounded bg-blue-950 text-blue-400 font-mono border border-blue-500/30 font-bold">${paper.gradeLevel}</span>
                                <span class="text-xs text-gray-400 font-mono">${paper.questions.length} Oral Questions</span>
                            </div>
                            <h4 class="text-xl font-bold text-white mb-2">${paper.title}</h4>
                        </div>
                        <button onclick="app.launchFullKioskExam('${paper.id}')" class="mt-6 w-full btn-ultron py-3 rounded-xl font-bold text-white text-sm shadow-lg flex items-center justify-center gap-2">
                            <i data-lucide="play" class="w-4 h-4 fill-current"></i>
                            <span>Start Full-Screen Exam</span>
                        </button>
                    </div>
                `).join('');
            }
        }

        if (widgetSelect) {
            widgetSelect.innerHTML = `<option value="">-- Choose Test Paper --</option>` + gradePapers.map(p => `
                <option value="${p.id}">${p.title} (${p.gradeLevel})</option>
            `).join('');
        }

        this.renderStudentHistory();

        if (window.lucide) window.lucide.createIcons();
    }

    renderStudentHistory() {
        const currentUser = window.authManager.getCurrentUser();
        const results = window.dataStore.getResultsForStudent(currentUser.studentId);
        const container = document.getElementById('studentPastResultsList');

        if (container) {
            if (results.length === 0) {
                container.innerHTML = `<p class="text-xs text-gray-500 italic">No past oral exam attempts recorded yet.</p>`;
            } else {
                container.innerHTML = results.map(r => `
                    <div class="p-4 rounded-xl bg-gray-950 border border-gray-800 flex items-center justify-between">
                        <div>
                            <h5 class="text-sm font-bold text-white">${r.testTitle}</h5>
                            <span class="text-xs text-gray-500 font-mono">${r.date}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-lg font-black ${r.score >= 60 ? 'text-emerald-400' : 'text-blue-400'}">${r.score}%</span>
                            <span class="block text-[10px] uppercase font-mono text-gray-400">${r.status}</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    // --- FULL-SCREEN NOAH PARTICLE KIOSK ENGINE ---
    launchFullKioskExam(paperId) {
        const paper = window.dataStore.getTestPaperById(paperId);
        if (!paper) {
            alert('Paper not found.');
            return;
        }

        const currentUser = window.authManager.getCurrentUser();
        this.examSession = {
            active: true,
            studentName: currentUser.studentName || 'Student',
            studentId: currentUser.studentId || 'STU-5001',
            gradeLevel: currentUser.gradeLevel || 'Class 5',
            selectedPaper: paper,
            currentQuestionIndex: 0,
            answers: [],
            retriesForCurrentQ: 0,
            maxRetries: 2,
            startTime: new Date()
        };

        const kioskOverlay = document.getElementById('noahFullScreenKiosk');
        kioskOverlay.classList.remove('hidden');

        if (window.audioVisualizer) {
            window.audioVisualizer.moveToContainer('fullKioskParticleContainer');
        }

        this.deliverKioskQuestion();
    }

    deliverKioskQuestion() {
        const paper = this.examSession.selectedPaper;
        const qIndex = this.examSession.currentQuestionIndex;
        const question = paper.questions[qIndex];
        this.examSession.retriesForCurrentQ = 0;

        document.getElementById('kioskPaperTitle').innerText = paper.title;
        document.getElementById('kioskQuestionCounter').innerText = `Question ${qIndex + 1} of ${paper.questions.length}`;
        const pct = ((qIndex + 1) / paper.questions.length) * 100;
        document.getElementById('kioskProgressBar').style.width = `${pct}%`;

        document.getElementById('kioskQuestionText').innerText = question.text;
        document.getElementById('kioskTranscriptBox').innerText = 'Awaiting your spoken response...';
        document.getElementById('kioskFeedbackAlert').classList.add('hidden');

        if (window.voiceEngine) {
            window.voiceEngine.speak(question.text, () => {
                setTimeout(() => this.triggerKioskOralCapture(), 600);
            });
        }
    }

    triggerKioskOralCapture() {
        const transcriptBox = document.getElementById('kioskTranscriptBox');
        transcriptBox.innerText = 'NOAH is listening... Speak your answer now.';

        if (!window.voiceEngine) return;

        window.voiceEngine.listen({
            onInterim: (text) => {
                transcriptBox.innerText = `[Listening...] ${text}`;
            },
            onResult: (finalText) => {
                transcriptBox.innerText = finalText;
                this.processKioskAnswer(finalText);
            },
            onNoSpeech: () => {
                this.handleKioskAudioRetry();
            },
            onError: (err) => {
                console.warn('Speech error:', err);
                this.handleKioskAudioRetry();
            }
        });
    }

    handleKioskAudioRetry() {
        this.examSession.retriesForCurrentQ++;

        if (this.examSession.retriesForCurrentQ <= this.examSession.maxRetries) {
            const retryMsg = "The answer was not audible properly, please narrate it again.";
            document.getElementById('kioskTranscriptBox').innerText = `[Notice] ${retryMsg} (Attempt ${this.examSession.retriesForCurrentQ}/${this.examSession.maxRetries})`;

            if (window.voiceEngine) {
                window.voiceEngine.speak(retryMsg, () => {
                    setTimeout(() => this.triggerKioskOralCapture(), 500);
                });
            }
        } else {
            const msg = "Max audio retries reached. Moving to fallback evaluation.";
            document.getElementById('kioskTranscriptBox').innerText = msg;
            this.processKioskAnswer("", true);
        }
    }

    // --- PROCESS ANSWER WITH 2.5-SECOND DELIBERATE EVALUATION PAUSE ---
    processKioskAnswer(transcript, isAudioFlagged = false) {
        const paper = this.examSession.selectedPaper;
        const qIndex = this.examSession.currentQuestionIndex;
        const question = paper.questions[qIndex];

        const transcriptBox = document.getElementById('kioskTranscriptBox');
        transcriptBox.innerHTML = `<span class="text-amber-400 font-bold animate-pulse">[NOAH Core] Evaluating response for conceptual completeness & full explanation...</span><br/><span class="text-gray-300">${transcript || '[No audible input]'}</span>`;
        
        if (window.audioVisualizer) {
            window.audioVisualizer.setMode('listening');
        }

        setTimeout(() => {
            const gradeResult = window.gradingEngine.evaluateAnswer(question, transcript);

            this.examSession.answers.push({
                questionId: question.id,
                questionText: question.text,
                transcript: transcript || '[No audible response detected]',
                gradeResult,
                retryCount: this.examSession.retriesForCurrentQ,
                isAudioFlagged: isAudioFlagged || this.examSession.retriesForCurrentQ > 1
            });

            const feedbackAlert = document.getElementById('kioskFeedbackAlert');
            feedbackAlert.classList.remove('hidden');
            feedbackAlert.className = `p-4 rounded-xl border mb-4 transition-all ${
                gradeResult.status === 'correct' ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300' :
                gradeResult.status === 'partially_correct' ? 'bg-amber-950/60 border-amber-500/50 text-amber-300' :
                'bg-blue-950/60 border-blue-500/50 text-blue-300'
            }`;
            feedbackAlert.innerHTML = `
                <div class="font-bold flex items-center gap-2 mb-1">
                    <span>NOAH Verdict:</span>
                    <span class="uppercase tracking-wider text-xs px-2 py-0.5 rounded font-mono ${
                        gradeResult.status === 'correct' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                        gradeResult.status === 'partially_correct' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                        'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    }">${gradeResult.status.replace('_', ' ')} (+${gradeResult.score} pts)</span>
                </div>
                <p class="text-sm">${gradeResult.feedback}</p>
            `;

            if (window.voiceEngine) {
                window.voiceEngine.speak(gradeResult.feedback, () => {
                    setTimeout(() => this.advanceKioskQuestion(), 1500);
                });
            } else {
                setTimeout(() => this.advanceKioskQuestion(), 2500);
            }
        }, 2500);
    }

    advanceKioskQuestion() {
        const paper = this.examSession.selectedPaper;
        if (this.examSession.currentQuestionIndex + 1 < paper.questions.length) {
            this.examSession.currentQuestionIndex++;
            this.deliverKioskQuestion();
        } else {
            this.finishKioskExamSession();
        }
    }

    finishKioskExamSession() {
        this.examSession.active = false;

        let totalScore = 0;
        let maxScore = 0;
        let correctCount = 0;
        let partialCount = 0;
        let wrongCount = 0;
        const strugglingTopics = new Set();
        let totalRetries = 0;

        this.examSession.answers.forEach(ans => {
            totalScore += ans.gradeResult.score;
            maxScore += ans.gradeResult.maxScore;
            totalRetries += ans.retryCount;

            if (ans.gradeResult.status === 'correct') correctCount++;
            else if (ans.gradeResult.status === 'partially_correct') {
                partialCount++;
                strugglingTopics.add(ans.gradeResult.topicTag);
            } else {
                wrongCount++;
                strugglingTopics.add(ans.gradeResult.topicTag);
            }
        });

        const finalScorePct = Math.round((totalScore / Math.max(maxScore, 1)) * 100);

        let pronunciationNote = "Vocal clarity and pacing within expected parameters.";
        if (totalRetries >= 3) {
            pronunciationNote = "FLAGGED: Low audio clarity / multiple retries triggered during spoken responses.";
        } else if (totalRetries >= 1) {
            pronunciationNote = "Soft clarity note: Slight background noise or soft enunciation detected.";
        }

        const resultRecord = {
            id: 'res-' + Date.now(),
            studentId: this.examSession.studentId,
            studentName: this.examSession.studentName,
            gradeLevel: this.examSession.gradeLevel,
            subjectId: this.examSession.selectedPaper.subjectId,
            testTitle: this.examSession.selectedPaper.title,
            date: new Date().toISOString().slice(0, 16).replace('T', ' '),
            score: finalScorePct,
            maxScore: 100,
            correctCount,
            partialCount,
            wrongCount,
            strugglingTopics: Array.from(strugglingTopics),
            pronunciationNote,
            status: finalScorePct >= 60 ? 'Pass' : 'Needs Review'
        };

        window.dataStore.saveResult(resultRecord);

        document.getElementById('noahFullScreenKiosk').classList.add('hidden');
        if (window.audioVisualizer) {
            window.audioVisualizer.moveToContainer('ultronCanvasContainer');
        }

        this.switchView('student-kiosk');
        document.getElementById('studentDetailStep').classList.add('hidden');
        document.getElementById('examResultStep').classList.remove('hidden');

        document.getElementById('resultStudentName').innerText = resultRecord.studentName;
        document.getElementById('resultPaperTitle').innerText = resultRecord.testTitle;
        document.getElementById('resultScoreDisplay').innerText = `${resultRecord.score}%`;
        document.getElementById('resultStatusBadge').innerText = resultRecord.status;
        document.getElementById('resultStatusBadge').className = `px-3 py-1 rounded-full text-xs font-mono font-bold ${
            resultRecord.status === 'Pass' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 'bg-blue-950 text-blue-400 border border-blue-500/40'
        }`;

        document.getElementById('resultCorrectCount').innerText = correctCount;
        document.getElementById('resultPartialCount').innerText = partialCount;
        document.getElementById('resultWrongCount').innerText = wrongCount;

        const topicContainer = document.getElementById('resultStrugglingTopics');
        if (resultRecord.strugglingTopics.length > 0) {
            topicContainer.innerHTML = resultRecord.strugglingTopics.map(t => `
                <span class="px-3 py-1 rounded-lg bg-blue-950/60 border border-blue-500/40 text-blue-300 text-xs font-mono">${t}</span>
            `).join('');
        } else {
            topicContainer.innerHTML = `<span class="text-xs text-emerald-400 font-mono">None! Exceptional mastery across all question topics.</span>`;
        }

        document.getElementById('resultPronunciationNote').innerText = resultRecord.pronunciationNote;

        if (window.voiceEngine) {
            window.voiceEngine.speak(`Examination complete, ${resultRecord.studentName}. Your result has been uploaded to the institute dashboard.`);
        }

        this.renderSubjectAndPapers();
        this.renderStaffDashboard();
    }

    bindExamEvents() {
        const kioskMicSpeakBtn = document.getElementById('kioskMicSpeakBtn');
        const kioskSubmitTextBtn = document.getElementById('kioskSubmitTextBtn');
        const exitKioskBtn = document.getElementById('exitKioskBtn');

        if (kioskMicSpeakBtn) {
            kioskMicSpeakBtn.addEventListener('click', () => {
                this.triggerKioskOralCapture();
            });
        }

        if (kioskSubmitTextBtn) {
            kioskSubmitTextBtn.addEventListener('click', () => {
                const val = document.getElementById('kioskTextInput').value.trim();
                if (!val) return;
                this.processKioskAnswer(val);
                document.getElementById('kioskTextInput').value = '';
            });
        }

        if (exitKioskBtn) {
            exitKioskBtn.addEventListener('click', () => {
                if (confirm("Are you sure you want to exit the oral examination? Progress will be cancelled.")) {
                    document.getElementById('noahFullScreenKiosk').classList.add('hidden');
                    if (window.audioVisualizer) {
                        window.audioVisualizer.moveToContainer('ultronCanvasContainer');
                    }
                    if (window.voiceEngine) window.voiceEngine.stopSpeaking();
                }
            });
        }
    }

    // --- Staff Admin Dashboard Rendering ---
    renderStaffDashboard() {
        const results = window.dataStore.getResults();
        const papers = window.dataStore.getTestPapers();

        const totalTests = results.length;
        const avgScore = totalTests > 0 ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / totalTests) : 0;
        const flaggedCount = results.filter(r => r.pronunciationNote.includes('FLAGGED') || r.status === 'Needs Review').length;

        document.getElementById('kpiTotalTests').innerText = totalTests;
        document.getElementById('kpiAvgScore').innerText = `${avgScore}%`;
        document.getElementById('kpiFlaggedStudents').innerText = flaggedCount;
        document.getElementById('kpiActivePapers').innerText = papers.filter(p => p.active).length;

        const tbody = document.getElementById('staffResultsTbody');
        if (tbody) {
            if (results.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="py-8 text-center text-gray-500 italic text-sm">
                            No student oral test submissions recorded yet. Upload a PDF or Photo test paper above to start!
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = results.map(r => `
                    <tr class="border-b border-gray-800/60 hover:bg-gray-900/40 transition">
                        <td class="py-3 px-4 font-semibold text-white">${r.studentName} <span class="block text-xs font-normal text-gray-500">${r.studentId} (${r.gradeLevel})</span></td>
                        <td class="py-3 px-4 text-sm text-gray-300">${r.testTitle}</td>
                        <td class="py-3 px-4 text-xs text-gray-400 font-mono">${r.date}</td>
                        <td class="py-3 px-4 font-bold ${r.score >= 80 ? 'text-emerald-400' : r.score >= 60 ? 'text-amber-400' : 'text-blue-400'}">${r.score}%</td>
                        <td class="py-3 px-4">
                            <span class="px-2.5 py-1 rounded-full text-xs font-mono ${
                                r.status === 'Pass' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30' : 'bg-blue-950/60 text-blue-400 border border-blue-500/30'
                            }">${r.status}</span>
                        </td>
                        <td class="py-3 px-4 text-xs text-gray-400">${r.strugglingTopics.join(', ') || 'None'}</td>
                        <td class="py-3 px-4 text-xs ${r.pronunciationNote.includes('FLAGGED') ? 'text-blue-400 font-bold' : 'text-gray-400'}">${r.pronunciationNote}</td>
                    </tr>
                `).join('');
            }
        }
    }

    bindAdminEvents() {
        const exportCsvBtn = document.getElementById('exportCsvBtn');

        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => {
                const results = window.dataStore.getResults();
                if (results.length === 0) {
                    alert('No student results available to export.');
                    return;
                }
                let csvContent = "data:text/csv;charset=utf-8,Student Name,Student ID,Grade,Test Title,Date,Score,Status,Struggling Topics,Pronunciation Note\n";
                results.forEach(r => {
                    csvContent += `"${r.studentName}","${r.studentId}","${r.gradeLevel}","${r.testTitle}","${r.date}",${r.score},"${r.status}","${r.strugglingTopics.join('; ')}","${r.pronunciationNote}"\n`;
                });

                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `Cognify_NOAH_Student_Results_${Date.now()}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    }
}

window.app = new AppController();
