/**
 * Cognify - NOAH Main Application Controller (v4.0)
 * Manages full-screen NOAH particle kiosk, role auth permissions, document uploads, and cinematic Ultron video rush login transition.
 */

class AppController {
    constructor() {
        this.currentView = 'landing';
        this.widgetOpen = false;
        
        // Student Exam Session State
        this.examSession = {
            active: false,
            studentName: '',
            studentId: '',
            gradeLevel: '',
            selectedPaper: null,
            currentQuestionIndex: 0,
            attemptId: null,
            retriesForCurrentQ: 0,
            maxRetries: 2,
            startTime: null
        };

        this.pendingParsedPaper = null;

        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    async init() {
        // Wait for any stored login token to be validated against the backend
        // before binding events or rendering anything auth-dependent.
        await window.authManager.ready;

        this.bindNavigationEvents();
        this.bindMobileNavToggle();
        this.bindAuthEvents();
        this.bindWidgetEvents();
        this.bindExamEvents();
        this.bindAdminEvents();
        this.bindFileUploadEvents();

        this.updateUserAuthHeaderUI();
        await this.renderSubjectAndPapers();
        await this.renderStaffDashboard();

        this.setActiveNav(this.currentView);
        this.revealIn(document.getElementById(`view-${this.currentView}`));
    }

    // Escapes anything user- or admin-supplied before it is interpolated
    // into an innerHTML template (names, paper titles, transcripts, topics).
    esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
    }

    // Staggered spring cascade for everything marked [data-reveal] inside
    // `root`. Transform/opacity only; skipped entirely under reduced motion
    // or when Motion failed to load, so content is never left hidden.
    revealIn(root) {
        if (!root || !window.Motion || this.prefersReducedMotion()) return;
        const items = root.querySelectorAll('[data-reveal]');
        if (!items.length) return;
        window.Motion.animate(
            items,
            { opacity: [0, 1], y: [16, 0] },
            { type: 'spring', stiffness: 100, damping: 20, delay: window.Motion.stagger(0.07) }
        );
    }

    setActiveNav(viewName) {
        document.querySelectorAll('[data-view-target]').forEach(btn => {
            if (btn.getAttribute('data-view-target') === viewName) {
                btn.setAttribute('aria-current', 'page');
            } else {
                btn.removeAttribute('aria-current');
            }
        });
    }

    // Respects the same reduced-motion preference audioVisualizer.js already
    // applies to the particle system, for every Motion-driven UI animation.
    prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // Thin wrapper around window.Motion.animate(): jumps straight to the
    // final frame when Motion failed to load (CDN down) or the user prefers
    // reduced motion, so every call site gets a consistent `.finished`
    // promise to await instead of guessing a matching setTimeout duration.
    motionAnimate(el, keyframes, options) {
        if (!window.Motion) {
            const finalState = {};
            for (const key in keyframes) {
                const val = keyframes[key];
                finalState[key] = Array.isArray(val) ? val[val.length - 1] : val;
            }
            Object.assign(el.style, finalState);
            return { finished: Promise.resolve() };
        }
        if (this.prefersReducedMotion()) {
            return window.Motion.animate(el, keyframes, { ...options, duration: 0 });
        }
        return window.Motion.animate(el, keyframes, options);
    }

    // --- Cinematic Login Rush Transition ---
    playCinematicLoginTransition(targetView, onComplete) {
        const heroContent = document.getElementById('landingHeroContent');
        const authModal = document.getElementById('authModal');

        if (authModal) authModal.classList.add('hidden');

        // Fade + scale out the hero text while NOAH's particle swarm expands.
        if (heroContent) {
            heroContent.style.pointerEvents = 'none';
            this.motionAnimate(heroContent, { opacity: [1, 0], scale: [1, 1.1] }, { duration: 0.5, ease: 'easeIn' });
        }

        // The particle expansion (bloom explosion) drives the actual timing
        // of this sequence via its own onComplete callback, instead of a
        // second, independently-guessed setTimeout racing against it.
        const finishSequence = () => {
            this.switchView(targetView);

            if (heroContent) {
                heroContent.style.pointerEvents = '';
                this.motionAnimate(heroContent, { opacity: [0, 1], scale: [1.1, 1] }, { duration: 0.5, ease: 'easeOut' });
            }
            if (onComplete) onComplete();
        };

        if (window.audioVisualizer) {
            window.audioVisualizer.triggerHyperDriveExpansion(finishSequence);
        } else {
            finishSequence();
        }
    }

    // --- Navigation & View Switching ---
    async switchView(viewName) {
        if (viewName === 'staff-dashboard' && !window.authManager.isAdmin()) {
            this.openAuthModal('admin');
            return;
        }
        if (viewName === 'student-kiosk' && !window.authManager.isStudent()) {
            this.openAuthModal('student');
            return;
        }

        this.currentView = viewName;
        document.querySelectorAll('.view-panel').forEach(el => el.classList.add('hidden'));

        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) {
            targetView.classList.remove('hidden');
        }

        this.setActiveNav(viewName);
        this.revealIn(targetView);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (viewName === 'landing' && window.audioVisualizer) {
            window.audioVisualizer.moveToContainer('ultronCanvasContainer');
        }

        if (viewName === 'student-kiosk') {
            await this.renderSubjectAndPapers();
        } else if (viewName === 'staff-dashboard') {
            await this.renderStaffDashboard();
        }
    }

    bindNavigationEvents() {
        document.querySelectorAll('[data-view-target]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-view-target');

                const needsStudentAuth = target === 'student-kiosk' && !window.authManager.isStudent();
                const needsAdminAuth = target === 'staff-dashboard' && !window.authManager.isAdmin();
                if (needsStudentAuth || needsAdminAuth) {
                    this.openAuthModal(needsAdminAuth ? 'admin' : 'student');
                    return;
                }

                if (this.currentView === 'landing' && (target === 'student-kiosk' || target === 'staff-dashboard')) {
                    this.playCinematicLoginTransition(target);
                } else {
                    this.switchView(target);
                }
            });
        });
    }

    bindMobileNavToggle() {
        const toggleBtn = document.getElementById('mobileNavToggleBtn');
        const menu = document.getElementById('mobileNavMenu');
        if (!toggleBtn || !menu) return;

        const closeMenu = () => {
            menu.classList.add('hidden');
            toggleBtn.setAttribute('aria-expanded', 'false');
        };

        toggleBtn.addEventListener('click', () => {
            const isOpen = !menu.classList.contains('hidden');
            menu.classList.toggle('hidden', isOpen);
            toggleBtn.setAttribute('aria-expanded', String(!isOpen));
        });

        // Each mobile item already gets its nav behavior from the
        // [data-view-target] listener bound in bindNavigationEvents() above;
        // this just closes the menu afterward so it doesn't stay open across
        // a view switch.
        menu.querySelectorAll('[data-view-target]').forEach(btn => {
            btn.addEventListener('click', closeMenu);
        });

        // Escape closes the menu and returns focus to the toggle button
        // (a keyboard user who opened it via Enter/Space shouldn't lose
        // their place in the page).
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
                closeMenu();
                toggleBtn.focus();
            }
        });

        // Clicking anywhere outside the menu/toggle closes it, matching the
        // disclosure pattern users expect from a mobile nav.
        document.addEventListener('click', (e) => {
            if (menu.classList.contains('hidden')) return;
            if (!menu.contains(e.target) && !toggleBtn.contains(e.target)) closeMenu();
        });
    }

    // --- Auth UI Management ---
    updateUserAuthHeaderUI() {
        // The floating NOAH widget is student-only — only visible while logged in as a student.
        const widgetContainer = document.getElementById('noahWidgetContainer');
        if (widgetContainer) {
            widgetContainer.classList.toggle('hidden', !window.authManager.isStudent());
        }
    }

    bindAuthEvents() {
        const authModal = document.getElementById('authModal');
        const closeAuthModal = document.getElementById('closeAuthModalBtn');
        const studentLoginForm = document.getElementById('studentLoginForm');
        const studentSignupForm = document.getElementById('studentSignupForm');
        const adminLoginForm = document.getElementById('adminLoginForm');
        const showStudentSignupBtn = document.getElementById('showStudentSignupBtn');
        const showStudentLoginBtn = document.getElementById('showStudentLoginBtn');

        if (closeAuthModal) {
            closeAuthModal.addEventListener('click', () => this.closeAuthModal());
        }

        // Clicking the backdrop (not the panel itself) closes the modal.
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) this.closeAuthModal();
        });

        // Escape closes the modal; Tab is trapped inside the panel so focus
        // can't silently leave a fixed, screen-covering overlay.
        document.addEventListener('keydown', (e) => {
            if (authModal.classList.contains('hidden')) return;
            if (e.key === 'Escape') {
                this.closeAuthModal();
            } else if (e.key === 'Tab') {
                this.trapFocus(e, document.getElementById('authModalPanel'));
            }
        });

        if (showStudentSignupBtn) {
            showStudentSignupBtn.addEventListener('click', () => this.showAuthForm('student-signup'));
        }

        if (showStudentLoginBtn) {
            showStudentLoginBtn.addEventListener('click', () => this.showAuthForm('student-login'));
        }

        if (studentLoginForm) {
            studentLoginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('loginStudentEmail').value.trim();
                const password = document.getElementById('loginStudentPassword').value;
                try {
                    await window.authManager.loginStudent(email, password);
                    this.updateUserAuthHeaderUI();
                    this.playCinematicLoginTransition('student-kiosk');
                } catch (err) {
                    alert(err.message || 'Login failed. Please check your email and password.');
                }
            });
        }

        if (studentSignupForm) {
            studentSignupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('signupStudentName').value.trim();
                const email = document.getElementById('signupStudentEmail').value.trim();
                const password = document.getElementById('signupStudentPassword').value;
                const id = document.getElementById('signupStudentId').value.trim();
                const grade = document.getElementById('signupStudentGrade').value;
                try {
                    await window.authManager.signupStudent(email, password, name, id, grade);
                    this.updateUserAuthHeaderUI();
                    this.playCinematicLoginTransition('student-kiosk');
                } catch (err) {
                    alert(err.message || 'Could not create your account. Please try again.');
                }
            });
        }

        if (adminLoginForm) {
            adminLoginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const passkey = document.getElementById('authAdminPasskey').value.trim();
                const res = await window.authManager.loginAsAdmin(passkey);
                if (res.success) {
                    this.updateUserAuthHeaderUI();
                    this.playCinematicLoginTransition('staff-dashboard');
                } else {
                    alert(res.message);
                }
            });
        }
    }

    handleLogout() {
        window.authManager.logout();
        this.updateUserAuthHeaderUI();
        this.switchView('landing');

        // This is a single-page app, so the auth forms are never recreated —
        // without an explicit reset, a logged-out user's email/password stay
        // sitting in the DOM and reopening the modal lets them straight back
        // in with just Enter.
        ['studentLoginForm', 'studentSignupForm', 'adminLoginForm'].forEach(id => {
            const form = document.getElementById(id);
            if (form) form.reset();
        });
    }

    // Shows exactly one of the three auth forms, hiding the other two, and
    // points the dialog's accessible name at that form's own heading so
    // screen readers announce "Student Log In" / "Create Student Account" /
    // "Institute Admin Access" instead of a stale or blank name.
    showAuthForm(mode) {
        document.getElementById('studentLoginForm').classList.toggle('hidden', mode !== 'student-login');
        document.getElementById('studentSignupForm').classList.toggle('hidden', mode !== 'student-signup');
        document.getElementById('adminLoginForm').classList.toggle('hidden', mode !== 'admin');

        const headingIds = { 'student-login': 'authModalHeadingLogin', 'student-signup': 'authModalHeadingSignup', 'admin': 'authModalHeadingAdmin' };
        const panel = document.getElementById('authModalPanel');
        if (panel) panel.setAttribute('aria-labelledby', headingIds[mode]);

        // Move focus to the first field of the now-visible form so keyboard/
        // screen reader users land somewhere useful instead of on a hidden form.
        const firstField = document.querySelector(`#${mode === 'admin' ? 'adminLoginForm' : mode === 'student-signup' ? 'studentSignupForm' : 'studentLoginForm'} input`);
        if (firstField) firstField.focus();
    }

    openAuthModal(defaultMode = 'student') {
        const authModal = document.getElementById('authModal');
        const panel = document.getElementById('authModalPanel');

        this.lastFocusedBeforeModal = document.activeElement;
        authModal.classList.remove('hidden');
        if (defaultMode === 'admin') {
            this.showAuthForm('admin');
        } else {
            this.showAuthForm('student-login');
        }

        this.motionAnimate(authModal, { opacity: [0, 1] }, { duration: 0.2, ease: 'easeOut' });
        this.motionAnimate(panel, { opacity: [0, 1], scale: [0.96, 1] }, { type: 'spring', bounce: 0.2, visualDuration: 0.3 });
    }

    async closeAuthModal() {
        const authModal = document.getElementById('authModal');
        const panel = document.getElementById('authModalPanel');

        await Promise.all([
            this.motionAnimate(authModal, { opacity: [1, 0] }, { duration: 0.15, ease: 'easeIn' }).finished,
            this.motionAnimate(panel, { opacity: [1, 0], scale: [1, 0.96] }, { duration: 0.15, ease: 'easeIn' }).finished
        ]);
        authModal.classList.add('hidden');

        // Return focus to whatever triggered the modal (e.g. the nav button)
        // instead of leaving it on a now-hidden close button.
        if (this.lastFocusedBeforeModal && document.body.contains(this.lastFocusedBeforeModal)) {
            this.lastFocusedBeforeModal.focus();
        }
    }

    // Keeps Tab/Shift+Tab cycling within `container` while a modal is open,
    // since the container sits inside a fixed full-screen overlay that
    // otherwise lets focus escape into content hidden behind it.
    trapFocus(e, container) {
        const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const visible = Array.from(focusable).filter(el => el.offsetParent !== null);
        if (visible.length === 0) return;
        const first = visible[0];
        const last = visible[visible.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
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
            dropZone.classList.add('border-ink!', 'bg-sunken!');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-ink!', 'bg-sunken!');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-ink!', 'bg-sunken!');
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
            publishParsedPaperBtn.addEventListener('click', async () => {
                if (!this.pendingParsedPaper) return;

                const customTitle = document.getElementById('parsedPaperTitleInput').value.trim();
                const customGrade = document.getElementById('parsedPaperGradeSelect').value;
                const customSubject = document.getElementById('parsedPaperSubjectSelect').value;

                const finalPaper = {
                    subjectId: customSubject,
                    title: customTitle || this.pendingParsedPaper.title,
                    gradeLevel: customGrade,
                    active: true,
                    durationMinutes: 10,
                    questions: this.pendingParsedPaper.questions
                };

                try {
                    await window.dataStore.saveTestPaper(finalPaper);
                    alert(`Paper "${finalPaper.title}" (${finalPaper.questions.length} questions) published to ${customGrade} students successfully!`);

                    document.getElementById('extractedQuestionsPreviewContainer').classList.add('hidden');
                    this.pendingParsedPaper = null;
                    fileInput.value = '';

                    await this.renderSubjectAndPapers();
                    await this.renderStaffDashboard();
                } catch (err) {
                    alert(err.message || 'Could not publish this paper.');
                }
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
                <div class="rule-row space-y-2 py-4">
                    <div class="flex items-center justify-between gap-3">
                        <span class="eyebrow">Question ${idx + 1}</span>
                        <span class="pill">${this.esc(q.topicTag)}</span>
                    </div>
                    <p class="text-sm">${this.esc(q.text)}</p>
                    <p class="text-xs text-muted">Keywords: <span class="text-ink-soft">${this.esc(q.keywords.join(', '))}</span></p>
                </div>
            `).join('');

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

        // Animates out then hides — using the animation's own `.finished`
        // promise instead of a setTimeout guessed to match a CSS duration,
        // which previously cut the fade-out short by 100ms.
        const closeWidget = async () => {
            this.widgetOpen = false;
            if (window.voiceEngine) window.voiceEngine.stopSpeaking();
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');

            await this.motionAnimate(widgetWindow, { opacity: [1, 0], scale: [1, 0.95] }, { type: 'spring', bounce: 0.2, visualDuration: 0.2 }).finished;
            widgetWindow.classList.add('hidden');
            if (toggleBtn) toggleBtn.focus();
        };

        if (toggleBtn) {
            toggleBtn.addEventListener('click', async () => {
                this.widgetOpen = !this.widgetOpen;
                if (this.widgetOpen) {
                    widgetWindow.classList.remove('hidden');
                    toggleBtn.setAttribute('aria-expanded', 'true');
                    if (window.voiceEngine) {
                        window.voiceEngine.speak("Greetings. I am NOAH. Select your paper to begin your examination.");
                    }
                    await this.motionAnimate(widgetWindow, { opacity: [0, 1], scale: [0.95, 1] }, { type: 'spring', bounce: 0.2, visualDuration: 0.3 }).finished;
                    if (closeBtn) closeBtn.focus();
                } else {
                    closeWidget();
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', closeWidget);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.widgetOpen) closeWidget();
        });
    }

    // --- Subject & Paper Rendering for Logged-In Student ---
    async renderSubjectAndPapers() {
        const currentUser = window.authManager.getCurrentUser();
        if (!currentUser || currentUser.role !== 'student') return;
        const userGrade = currentUser.gradeLevel || 'Class 5';

        const gradePapers = await window.dataStore.getPapersForGrade(userGrade);
        const widgetSelect = document.getElementById('widgetPaperSelect');
        const studentPapersList = document.getElementById('studentAssignedPapersList');

        document.getElementById('displayStudentName').innerText = currentUser.studentName || 'Student';
        document.getElementById('displayStudentGrade').innerText = currentUser.gradeLevel || 'Class 5';
        document.getElementById('displayStudentId').innerText = currentUser.studentId || 'STU-5001';

        if (studentPapersList) {
            if (gradePapers.length === 0) {
                studentPapersList.innerHTML = `
                    <div class="rounded-panel border border-dashed border-line-strong p-8">
                        <p class="text-base">No active papers for ${this.esc(userGrade)}</p>
                        <p class="mt-1 text-xs text-muted">An admin can upload a PDF or photo test paper for ${this.esc(userGrade)} from the Admin Dashboard.</p>
                    </div>
                `;
            } else {
                studentPapersList.innerHTML = gradePapers.map(paper => `
                    <div data-reveal class="rule-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 py-5">
                        <div class="min-w-0">
                            <p class="text-lg leading-snug">${this.esc(paper.title)}</p>
                            <p class="mt-1 text-xs text-muted">${this.esc(paper.gradeLevel)} · ${paper.questions.length} oral questions</p>
                        </div>
                        <button type="button" data-start-paper="${this.esc(paper.id)}" class="btn btn-primary btn-sm">Start exam</button>
                    </div>
                `).join('');
            }
            this.revealIn(studentPapersList);
        }

        if (widgetSelect) {
            widgetSelect.innerHTML = `<option value="">-- Choose Test Paper --</option>` + gradePapers.map(p => `
                <option value="${this.esc(p.id)}">${this.esc(p.title)} (${this.esc(p.gradeLevel)})</option>
            `).join('');
        }

        await this.renderStudentHistory();

    }

    async renderStudentHistory() {
        const results = await window.dataStore.getResultsForStudent();
        const container = document.getElementById('studentPastResultsList');

        if (container) {
            if (results.length === 0) {
                container.innerHTML = `<p class="rule-row py-5 text-sm text-muted">No oral exams taken yet.</p>`;
            } else {
                container.innerHTML = results.map(r => `
                    <div data-reveal class="rule-row flex items-start justify-between gap-4 py-4">
                        <div class="min-w-0">
                            <p>${this.esc(r.testTitle)}</p>
                            <p class="num mt-0.5 text-xs text-muted">${this.esc(r.date)}</p>
                        </div>
                        <div class="shrink-0 text-right">
                            <p class="num text-xl ${r.score >= 60 ? 'text-ok' : 'text-muted'}">${this.esc(r.score)}%</p>
                            <p class="eyebrow">${this.esc(r.status)}</p>
                        </div>
                    </div>
                `).join('');
            }
            this.revealIn(container);
        }
    }

    // --- FULL-SCREEN NOAH PARTICLE KIOSK ENGINE ---
    async launchFullKioskExam(paperId) {
        let paper;
        try {
            paper = await window.dataStore.getTestPaperById(paperId);
        } catch (err) {
            alert('Paper not found.');
            return;
        }

        let attempt;
        try {
            attempt = await window.dataStore.startAttempt(paperId);
        } catch (err) {
            alert(err.message || 'Could not start this exam. Please try again.');
            return;
        }

        const currentUser = window.authManager.getCurrentUser();
        this.examSession = {
            active: true,
            studentName: currentUser.studentName || 'Student',
            studentId: currentUser.studentId || 'STU-5001',
            gradeLevel: currentUser.gradeLevel || 'Class 5',
            selectedPaper: paper,
            attemptId: attempt.attemptId,
            currentQuestionIndex: 0,
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
        const pct = (qIndex + 1) / paper.questions.length;
        // Animates via transform (compositor-only) instead of width, which
        // would trigger layout/paint on every frame alongside the particle canvas.
        this.motionAnimate(document.getElementById('kioskProgressBar'), { scaleX: pct }, { duration: 0.4, ease: 'easeOut' });

        document.getElementById('kioskQuestionText').innerText = question.text;
        document.getElementById('kioskTranscriptBox').innerText = 'Awaiting your spoken response...';
        document.getElementById('kioskFeedbackAlert').classList.add('hidden');

        if (!window.voiceEngine) return;

        const askQuestion = () => {
            window.voiceEngine.speak(question.text, () => {
                setTimeout(() => this.triggerKioskOralCapture(), 600);
            });
        };

        // Said once, before the first question, on browsers with no
        // SpeechRecognition (Safari, Firefox) — otherwise the student never
        // finds out why the mic never works, since triggerKioskOralCapture()
        // would silently misreport every attempt as an ordinary audio retry.
        if (qIndex === 0 && !window.voiceEngine.recognition) {
            window.voiceEngine.speak(
                "Notice. Voice input is not supported in this browser. Please type each answer in the box provided.",
                askQuestion
            );
        } else {
            askQuestion();
        }
    }

    triggerKioskOralCapture() {
        // A cancelled utterance still fires its "done" callback, so an exit
        // while NOAH is speaking would otherwise restart the mic afterwards.
        if (!this.examSession.active) return;
        const transcriptBox = document.getElementById('kioskTranscriptBox');

        if (!window.voiceEngine || !window.voiceEngine.recognition) {
            transcriptBox.innerText = '[Notice] Voice input is not supported in this browser. Type your answer in the box below.';
            const textInput = document.getElementById('kioskTextInput');
            if (textInput) textInput.focus();
            return;
        }

        transcriptBox.innerText = 'NOAH is listening... Speak your answer now.';

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
            this.processKioskAnswer("");
        }
    }

    // --- PROCESS ANSWER WITH 2.5-SECOND DELIBERATE EVALUATION PAUSE ---
    processKioskAnswer(transcript) {
        const qIndex = this.examSession.currentQuestionIndex;
        const transcriptBox = document.getElementById('kioskTranscriptBox');
        transcriptBox.innerHTML = `<span class="animate-pulse text-accent">[NOAH Core] Evaluating response for conceptual completeness and full explanation...</span><br/><span class="text-ink">${this.esc(transcript || '[No audible input]')}</span>`;
        
        if (window.audioVisualizer) {
            window.audioVisualizer.setMode('listening');
        }

        setTimeout(async () => {
            if (!this.examSession.active) return;
            let gradeResult;
            try {
                gradeResult = await window.dataStore.gradeAnswer(
                    this.examSession.attemptId, qIndex, transcript, this.examSession.retriesForCurrentQ
                );
            } catch (err) {
                // Nothing is graded locally: the server never recorded this
                // answer, so it can't be skipped or scored here.
                if (err.status === 409) {
                    // Server already has this answer (the earlier response was lost).
                    this.advanceKioskQuestion();
                } else if (err.status === 401 || err.status === 403 || err.status === 404) {
                    this.closeKioskOverlay();
                    alert(err.message || 'Your exam session is no longer valid. Please log in and start again.');
                } else {
                    const msg = 'NOAH could not reach the grading service. Please answer this question again.';
                    transcriptBox.innerText = `[Notice] ${msg}`;
                    const askAgain = () => setTimeout(() => this.deliverKioskQuestion(), 800);
                    if (window.voiceEngine) window.voiceEngine.speak(msg, askAgain); else askAgain();
                }
                return;
            }
            if (!this.examSession.active) return;

            const feedbackAlert = document.getElementById('kioskFeedbackAlert');
            feedbackAlert.classList.remove('hidden');
            const tone = gradeResult.status === 'correct'
                ? { box: 'border-ok/30 bg-ok-wash', badge: 'pill pill-ok' }
                : gradeResult.status === 'partially_correct'
                    ? { box: 'border-accent/30 bg-accent-wash', badge: 'pill pill-accent' }
                    : { box: 'border-line bg-sunken', badge: 'pill' };
            feedbackAlert.className = `rounded-xl border p-4 ${tone.box}`;
            feedbackAlert.innerHTML = `
                <p class="mb-2 flex flex-wrap items-center gap-2">
                    <span class="eyebrow">NOAH verdict</span>
                    <span class="${tone.badge}">${this.esc(gradeResult.status.replace('_', ' '))} · +${this.esc(gradeResult.score)} pts</span>
                </p>
                <p class="text-sm text-ink">${this.esc(gradeResult.feedback)}</p>
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
        if (!this.examSession.active) return;
        const paper = this.examSession.selectedPaper;
        if (this.examSession.currentQuestionIndex + 1 < paper.questions.length) {
            this.examSession.currentQuestionIndex++;
            this.deliverKioskQuestion();
        } else {
            this.finishKioskExamSession();
        }
    }

    closeKioskOverlay() {
        document.getElementById('noahFullScreenKiosk').classList.add('hidden');
        if (window.audioVisualizer) {
            window.audioVisualizer.moveToContainer('ultronCanvasContainer');
        }
        if (window.voiceEngine) {
            window.voiceEngine.stopListening();
            window.voiceEngine.stopSpeaking();
        }
    }

    async finishKioskExamSession() {
        this.examSession.active = false;
        if (window.voiceEngine) window.voiceEngine.stopListening();

        // The score, counts, topics and clarity note are all computed by the
        // server from the answers it graded — nothing here is self-reported.
        let resultRecord;
        try {
            resultRecord = await window.dataStore.finishAttempt(this.examSession.attemptId);
        } catch (err) {
            this.closeKioskOverlay();
            alert(err.message || 'Could not save your result. Please try again.');
            return;
        }

        this.closeKioskOverlay();

        await this.switchView('student-kiosk');
        document.getElementById('studentDetailStep').classList.add('hidden');
        document.getElementById('examResultStep').classList.remove('hidden');

        document.getElementById('resultStudentName').innerText = resultRecord.studentName;
        document.getElementById('resultPaperTitle').innerText = resultRecord.testTitle;
        document.getElementById('resultScoreDisplay').innerText = `${resultRecord.score}%`;
        document.getElementById('resultStatusBadge').innerText = resultRecord.status;
        document.getElementById('resultStatusBadge').className = `pill ${resultRecord.status === 'Pass' ? 'pill-ok' : 'pill-bad'}`;

        document.getElementById('resultCorrectCount').innerText = resultRecord.correctCount;
        document.getElementById('resultPartialCount').innerText = resultRecord.partialCount;
        document.getElementById('resultWrongCount').innerText = resultRecord.wrongCount;

        const topicContainer = document.getElementById('resultStrugglingTopics');
        if (resultRecord.strugglingTopics.length > 0) {
            topicContainer.innerHTML = resultRecord.strugglingTopics.map(t => `<span class="pill">${this.esc(t)}</span>`).join('');
        } else {
            topicContainer.innerHTML = `<span class="text-sm text-ok">None. Strong mastery across every question.</span>`;
        }

        document.getElementById('resultPronunciationNote').innerText = resultRecord.pronunciationNote;

        if (window.voiceEngine) {
            window.voiceEngine.speak(`Examination complete, ${resultRecord.studentName}. Your result has been uploaded to the institute dashboard.`);
        }

        await this.renderSubjectAndPapers();
        await this.renderStaffDashboard();
    }

    bindExamEvents() {
        const papersList = document.getElementById('studentAssignedPapersList');
        if (papersList) {
            papersList.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-start-paper]');
                if (btn) this.launchFullKioskExam(btn.dataset.startPaper);
            });
        }

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
                    this.examSession.active = false;
                    this.closeKioskOverlay();
                }
            });
        }
    }

    // --- Staff Admin Dashboard Rendering ---
    async renderStaffDashboard() {
        if (!window.authManager.isAdmin()) return;
        const [results, papers] = await Promise.all([
            window.dataStore.getResults(),
            window.dataStore.getTestPapers()
        ]);

        const totalTests = results.length;
        const avgScore = totalTests > 0 ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / totalTests) : 0;
        const flaggedCount = results.filter(r => (r.pronunciationNote || '').includes('FLAGGED') || r.status === 'Needs Review').length;

        document.getElementById('kpiTotalTests').innerText = totalTests;
        document.getElementById('kpiAvgScore').innerText = `${avgScore}%`;
        document.getElementById('kpiFlaggedStudents').innerText = flaggedCount;
        document.getElementById('kpiActivePapers').innerText = papers.filter(p => p.active).length;

        const subjectsById = Object.fromEntries(window.dataStore.getSubjects().map(s => [s.id, s.name]));
        const papersTbody = document.getElementById('staffPapersTbody');
        if (papersTbody) {
            if (papers.length === 0) {
                papersTbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="py-10 text-center text-sm text-muted">No test papers yet. Upload one above to get started.</td>
                    </tr>
                `;
            } else {
                papersTbody.innerHTML = papers.map(p => `
                    <tr class="border-b border-line transition hover:bg-sunken">
                        <td class="py-4 pr-4">${this.esc(p.title)}</td>
                        <td class="py-4 pr-4 text-muted">${this.esc(subjectsById[p.subjectId] || '—')}</td>
                        <td class="py-4 pr-4 text-muted">${this.esc(p.gradeLevel)}</td>
                        <td class="num py-4 pr-4 text-muted">${p.questions.length}</td>
                        <td class="py-4 pr-4"><span class="pill ${p.active ? 'pill-ok' : ''}">${p.active ? 'Active' : 'Inactive'}</span></td>
                        <td class="py-2 text-right"><button type="button" data-delete-paper="${this.esc(p.id)}" class="btn btn-danger btn-sm">Remove</button></td>
                    </tr>
                `).join('');
            }
        }

        const tbody = document.getElementById('staffResultsTbody');
        if (tbody) {
            if (results.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="py-10 text-center text-sm text-muted">No student submissions yet.</td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = results.map(r => {
                    const note = r.pronunciationNote || '';
                    return `
                    <tr class="border-b border-line transition hover:bg-sunken">
                        <td class="whitespace-nowrap py-4 pr-4">${this.esc(r.studentName)}<span class="block text-xs text-muted">${this.esc(r.studentId)} · ${this.esc(r.gradeLevel)}</span></td>
                        <td class="py-4 pr-4">${this.esc(r.testTitle)}</td>
                        <td class="num py-4 pr-4 text-muted">${this.esc(r.date)}</td>
                        <td class="num py-4 pr-4 ${r.score >= 80 ? 'text-ok' : r.score >= 60 ? 'text-ink' : 'text-muted'}">${this.esc(r.score)}%</td>
                        <td class="py-4 pr-4"><span class="pill ${r.status === 'Pass' ? 'pill-ok' : 'pill-bad'}">${this.esc(r.status)}</span></td>
                        <td class="py-4 pr-4 text-xs text-muted">${this.esc(r.strugglingTopics.join(', ') || 'None')}</td>
                        <td class="py-4 text-xs ${note.includes('FLAGGED') ? 'text-bad' : 'text-muted'}">${this.esc(note)}</td>
                    </tr>`;
                }).join('');
            }
        }
    }

    bindAdminEvents() {
        const exportCsvBtn = document.getElementById('exportCsvBtn');

        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', async () => {
                const results = await window.dataStore.getResults();
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

        const papersTbody = document.getElementById('staffPapersTbody');
        if (papersTbody) {
            papersTbody.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-delete-paper]');
                if (!btn) return;
                const paperId = btn.dataset.deletePaper;
                if (!confirm('Remove this test paper? Students will no longer be able to take it.')) return;
                try {
                    await window.dataStore.deleteTestPaper(paperId);
                    await this.renderStaffDashboard();
                } catch (err) {
                    alert(`Failed to remove paper: ${err.message}`);
                }
            });
        }
    }
}

window.app = new AppController();
