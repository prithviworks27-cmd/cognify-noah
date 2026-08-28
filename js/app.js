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

        if (window.lucide) window.lucide.createIcons();
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
        this.isWarpTransition = true;
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
            this.isWarpTransition = false;

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

        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (viewName === 'landing' && window.audioVisualizer) {
            window.audioVisualizer.moveToContainer('ultronCanvasContainer');
        }

        if (viewName === 'student-kiosk') {
            await this.renderSubjectAndPapers();
        } else if (viewName === 'staff-dashboard') {
            await this.renderStaffDashboard();
        }

        if (window.lucide) window.lucide.createIcons();
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
        const currentUser = window.authManager.getCurrentUser();
        const userBadge = document.getElementById('userAuthBadge');
        const roleBtn = document.getElementById('switchRoleBtn');

        if (userBadge) {
            if (window.authManager.isAdmin()) {
                userBadge.innerHTML = `
                    <span class="w-2 h-2 rounded-full bg-[var(--muted)]"></span>
                    <span class="font-bold text-[var(--muted)]">Admin Mode</span>
                `;
                userBadge.className = "flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--border)] border border-[var(--border)] text-xs font-mono";
            } else {
                userBadge.innerHTML = `
                    <span class="w-2 h-2 rounded-full bg-[var(--muted)]"></span>
                    <span>Student: <strong>${currentUser.studentName}</strong> (${currentUser.gradeLevel})</span>
                `;
                userBadge.className = "flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--border)] border border-[var(--border)] text-xs text-[var(--muted)] font-mono";
            }
        }

        if (roleBtn) {
            roleBtn.innerText = window.authManager.isAdmin() ? "Switch to Student" : "Admin Login";
        }

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
        const toggleAuthModeBtn = document.getElementById('toggleAuthModeBtn');
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

        if (toggleAuthModeBtn) {
            toggleAuthModeBtn.addEventListener('click', () => {
                const isAdminFormVisible = !adminLoginForm.classList.contains('hidden');
                if (isAdminFormVisible) {
                    this.showAuthForm('student-login');
                    toggleAuthModeBtn.innerText = "Need Admin Access? Sign in as Admin";
                } else {
                    this.showAuthForm('admin');
                    toggleAuthModeBtn.innerText = "Sign in as Student instead";
                }
            });
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
        const toggleAuthModeBtn = document.getElementById('toggleAuthModeBtn');

        this.lastFocusedBeforeModal = document.activeElement;
        authModal.classList.remove('hidden');
        if (defaultMode === 'admin') {
            this.showAuthForm('admin');
            toggleAuthModeBtn.innerText = "Sign in as Student instead";
        } else {
            this.showAuthForm('student-login');
            toggleAuthModeBtn.innerText = "Need Admin Access? Sign in as Admin";
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
            dropZone.classList.add('border-[var(--border)]', 'bg-[var(--border)]/50');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-[var(--border)]', 'bg-[var(--border)]/50');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-[var(--border)]', 'bg-[var(--border)]/50');
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
                <div class="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-2">
                    <div class="flex items-center justify-between text-xs font-mono">
                        <span class="text-[var(--muted)] font-bold">NOAH Question ${idx + 1}:</span>
                        <span class="px-2 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--muted)] font-mono text-[10px]">Topic: ${q.topicTag}</span>
                    </div>
                    <p class="text-sm text-[var(--fg)] font-medium">${q.text}</p>
                    <div class="text-xs text-[var(--muted)] font-mono">
                        <span>Extracted Keywords: </span><span class="text-[var(--fg)] font-bold">${q.keywords.join(', ')}</span>
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
                    <div class="p-8 rounded-xl bg-[var(--surface-sunken)] border border-dashed border-[var(--border)] text-center col-span-full">
                        <i data-lucide="file-question" class="w-12 h-12 text-[var(--muted)] mx-auto mb-3"></i>
                        <h4 class="text-lg font-bold text-[var(--fg)] mb-1">No Active Papers Found for ${userGrade}</h4>
                        <p class="text-xs text-[var(--muted)]">Log in as Admin to upload a PDF or Photo test paper for ${userGrade}.</p>
                    </div>
                `;
            } else {
                studentPapersList.innerHTML = gradePapers.map(paper => `
                    <div class="glass-card p-6 rounded-xl border border-[var(--border)] hover:border-[var(--border)] transition duration-300 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-xs px-2.5 py-1 rounded bg-[var(--border)] text-[var(--muted)] font-mono border border-[var(--border)] font-bold">${paper.gradeLevel}</span>
                                <span class="text-xs text-[var(--muted)] font-mono">${paper.questions.length} Oral Questions</span>
                            </div>
                            <h4 class="text-xl font-bold text-[var(--fg)] mb-2">${paper.title}</h4>
                        </div>
                        <button onclick="app.launchFullKioskExam('${paper.id}')" class="mt-6 w-full btn-ultron py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
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

        await this.renderStudentHistory();

        if (window.lucide) window.lucide.createIcons();
    }

    async renderStudentHistory() {
        const results = await window.dataStore.getResultsForStudent();
        const container = document.getElementById('studentPastResultsList');

        if (container) {
            if (results.length === 0) {
                container.innerHTML = `<p class="text-xs text-[var(--muted)] italic">No past oral exam attempts recorded yet.</p>`;
            } else {
                container.innerHTML = results.map(r => `
                    <div class="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
                        <div>
                            <h5 class="text-sm font-bold text-[var(--fg)]">${r.testTitle}</h5>
                            <span class="text-xs text-[var(--muted)] font-mono">${r.date}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-lg font-black ${r.score >= 60 ? 'text-[var(--success)]' : 'text-[var(--muted)]'}">${r.score}%</span>
                            <span class="block text-[10px] uppercase font-mono text-[var(--muted)]">${r.status}</span>
                        </div>
                    </div>
                `).join('');
            }
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
        const pct = (qIndex + 1) / paper.questions.length;
        // Animates via transform (compositor-only) instead of width, which
        // would trigger layout/paint on every frame alongside the particle canvas.
        this.motionAnimate(document.getElementById('kioskProgressBar'), { scaleX: pct }, { duration: 0.4, ease: 'easeOut' });

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
        transcriptBox.innerHTML = `<span class="text-[var(--accent)] font-bold animate-pulse">[NOAH Core] Evaluating response for conceptual completeness & full explanation...</span><br/><span class="text-[var(--fg)]">${transcript || '[No audible input]'}</span>`;
        
        if (window.audioVisualizer) {
            window.audioVisualizer.setMode('listening');
        }

        setTimeout(async () => {
            let gradeResult;
            try {
                gradeResult = await window.dataStore.gradeAnswer(paper.id, qIndex, transcript);
            } catch (err) {
                gradeResult = {
                    status: 'incorrect',
                    score: 0,
                    maxScore: question.points || 10,
                    feedback: 'NOAH could not reach the grading service. This answer was marked incorrect — please continue.',
                    topicTag: question.topicTag || 'General Knowledge'
                };
            }

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
                gradeResult.status === 'correct' ? 'bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]' :
                gradeResult.status === 'partially_correct' ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]' :
                'bg-[var(--border)] border-[var(--border)] text-[var(--muted)]'
            }`;
            feedbackAlert.innerHTML = `
                <div class="font-bold flex items-center gap-2 mb-1">
                    <span>NOAH Verdict:</span>
                    <span class="uppercase tracking-wider text-xs px-2 py-0.5 rounded font-mono ${ gradeResult.status === 'correct' ? 'bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30' : gradeResult.status === 'partially_correct' ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30' : 'bg-[var(--muted)]/20 text-[var(--muted)] border border-[var(--border)]' }">${gradeResult.status.replace('_', ' ')} (+${gradeResult.score} pts)</span>
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

    async finishKioskExamSession() {
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

        await window.dataStore.saveResult(resultRecord);

        document.getElementById('noahFullScreenKiosk').classList.add('hidden');
        if (window.audioVisualizer) {
            window.audioVisualizer.moveToContainer('ultronCanvasContainer');
        }

        await this.switchView('student-kiosk');
        document.getElementById('studentDetailStep').classList.add('hidden');
        document.getElementById('examResultStep').classList.remove('hidden');

        document.getElementById('resultStudentName').innerText = resultRecord.studentName;
        document.getElementById('resultPaperTitle').innerText = resultRecord.testTitle;
        document.getElementById('resultScoreDisplay').innerText = `${resultRecord.score}%`;
        document.getElementById('resultStatusBadge').innerText = resultRecord.status;
        document.getElementById('resultStatusBadge').className = `px-3 py-1 rounded-full text-xs font-mono font-bold ${
            resultRecord.status === 'Pass' ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30' : 'bg-[var(--border)] text-[var(--muted)] border border-[var(--border)]'
        }`;

        document.getElementById('resultCorrectCount').innerText = correctCount;
        document.getElementById('resultPartialCount').innerText = partialCount;
        document.getElementById('resultWrongCount').innerText = wrongCount;

        const topicContainer = document.getElementById('resultStrugglingTopics');
        if (resultRecord.strugglingTopics.length > 0) {
            topicContainer.innerHTML = resultRecord.strugglingTopics.map(t => `
                <span class="px-3 py-1 rounded-lg bg-[var(--border)] border border-[var(--border)] text-[var(--muted)] text-xs font-mono">${t}</span>
            `).join('');
        } else {
            topicContainer.innerHTML = `<span class="text-xs text-[var(--success)] font-mono">None! Exceptional mastery across all question topics.</span>`;
        }

        document.getElementById('resultPronunciationNote').innerText = resultRecord.pronunciationNote;

        if (window.voiceEngine) {
            window.voiceEngine.speak(`Examination complete, ${resultRecord.studentName}. Your result has been uploaded to the institute dashboard.`);
        }

        await this.renderSubjectAndPapers();
        await this.renderStaffDashboard();
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
    async renderStaffDashboard() {
        if (!window.authManager.isAdmin()) return;
        const [results, papers] = await Promise.all([
            window.dataStore.getResults(),
            window.dataStore.getTestPapers()
        ]);

        const totalTests = results.length;
        const avgScore = totalTests > 0 ? Math.round(results.reduce((acc, r) => acc + r.score, 0) / totalTests) : 0;
        const flaggedCount = results.filter(r => r.pronunciationNote.includes('FLAGGED') || r.status === 'Needs Review').length;

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
                        <td colspan="6" class="py-8 text-center text-[var(--muted)] italic text-sm">
                            No test papers yet. Upload one above to get started.
                        </td>
                    </tr>
                `;
            } else {
                papersTbody.innerHTML = papers.map(p => `
                    <tr class="border-b border-[var(--border)] hover:bg-[var(--surface-sunken)] transition">
                        <td class="py-3 px-4 font-semibold text-[var(--fg)]">${p.title}</td>
                        <td class="py-3 px-4 text-sm text-[var(--fg)]">${subjectsById[p.subjectId] || '—'}</td>
                        <td class="py-3 px-4 text-xs text-[var(--muted)] font-mono">${p.gradeLevel}</td>
                        <td class="py-3 px-4 text-xs text-[var(--muted)]">${p.questions.length}</td>
                        <td class="py-3 px-4">
                            <span class="px-2.5 py-1 rounded-full text-xs font-mono ${ p.active ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30' : 'bg-[var(--border)] text-[var(--muted)] border border-[var(--border)]' }">${p.active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td class="py-3 px-4 text-right">
                            <button data-delete-paper="${p.id}" class="px-3 py-1.5 rounded-lg bg-[var(--border)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--muted)] text-xs font-semibold transition">
                                Remove
                            </button>
                        </td>
                    </tr>
                `).join('');
            }
        }

        const tbody = document.getElementById('staffResultsTbody');
        if (tbody) {
            if (results.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="py-8 text-center text-[var(--muted)] italic text-sm">
                            No student oral test submissions recorded yet. Upload a PDF or Photo test paper above to start!
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = results.map(r => `
                    <tr class="border-b border-[var(--border)] hover:bg-[var(--surface-sunken)] transition">
                        <td class="py-3 px-4 font-semibold text-[var(--fg)]">${r.studentName} <span class="block text-xs font-normal text-[var(--muted)]">${r.studentId} (${r.gradeLevel})</span></td>
                        <td class="py-3 px-4 text-sm text-[var(--fg)]">${r.testTitle}</td>
                        <td class="py-3 px-4 text-xs text-[var(--muted)] font-mono">${r.date}</td>
                        <td class="py-3 px-4 font-bold ${r.score >= 80 ? 'text-[var(--success)]' : r.score >= 60 ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}">${r.score}%</td>
                        <td class="py-3 px-4">
                            <span class="px-2.5 py-1 rounded-full text-xs font-mono ${ r.status === 'Pass' ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30' : 'bg-[var(--border)] text-[var(--muted)] border border-[var(--border)]' }">${r.status}</span>
                        </td>
                        <td class="py-3 px-4 text-xs text-[var(--muted)]">${r.strugglingTopics.join(', ') || 'None'}</td>
                        <td class="py-3 px-4 text-xs ${r.pronunciationNote.includes('FLAGGED') ? 'text-[var(--muted)] font-bold' : 'text-[var(--muted)]'}">${r.pronunciationNote}</td>
                    </tr>
                `).join('');
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
