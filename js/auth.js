/**
 * Cognify - NOAH Authentication & Role Manager
 * Real student accounts (email + password) via the backend, plus a
 * server-verified shared admin passkey. No client-side trust of identity.
 */

class AuthManager {
    constructor() {
        this.session = null;
        this.ready = this._restoreSession();
    }

    async _restoreSession() {
        if (!window.dataStore.getToken()) {
            this.session = null;
            return;
        }
        try {
            this.session = await window.dataStore._fetch('/auth/me');
        } catch (e) {
            window.dataStore.clearToken();
            this.session = null;
        }
    }

    getCurrentUser() {
        return this.session;
    }

    isAdmin() {
        return !!(this.session && this.session.role === 'admin');
    }

    isStudent() {
        return !!(this.session && this.session.role === 'student');
    }

    async signupStudent(email, password, name, studentId, gradeLevel) {
        const res = await window.dataStore._fetch('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password,
                student_name: name,
                student_id: studentId,
                grade_level: gradeLevel
            })
        });
        window.dataStore.setToken(res.token);
        this.session = res.user;
        return this.session;
    }

    async loginStudent(email, password) {
        const res = await window.dataStore._fetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        window.dataStore.setToken(res.token);
        this.session = res.user;
        return this.session;
    }

    async loginAsAdmin(passkey) {
        try {
            const res = await window.dataStore._fetch('/auth/admin-login', {
                method: 'POST',
                body: JSON.stringify({ passkey })
            });
            window.dataStore.setToken(res.token);
            this.session = res.user;
            return { success: true, session: this.session };
        } catch (e) {
            return { success: false, message: e.message || 'Invalid Admin Passkey. Please try again.' };
        }
    }

    logout() {
        this.session = null;
        window.dataStore.clearToken();
    }
}

window.authManager = new AuthManager();
