/**
 * Cognify - NOAH Authentication & Role Manager
 * Handles Student Sign-In vs Admin/Staff Login permissions
 */

class AuthManager {
    constructor() {
        this.session = window.dataStore.getAuthSession();
    }

    getCurrentUser() {
        return this.session;
    }

    isAdmin() {
        return this.session && this.session.role === 'admin';
    }

    isStudent() {
        return this.session && this.session.role === 'student';
    }

    loginAsStudent(name, id, gradeLevel) {
        this.session = {
            role: 'student',
            studentName: name || 'Student',
            studentId: id || ('STU-' + Math.floor(1000 + Math.random() * 9000)),
            gradeLevel: gradeLevel || 'Class 5'
        };
        window.dataStore.setAuthSession(this.session);
        return this.session;
    }

    loginAsAdmin(passkey) {
        if (passkey === 'admin' || passkey === 'admin123' || passkey === '1234') {
            this.session = {
                role: 'admin',
                adminName: 'Institute Admin',
                passkey: 'verified'
            };
            window.dataStore.setAuthSession(this.session);
            return { success: true, session: this.session };
        } else {
            return { success: false, message: 'Invalid Admin Passkey. Please try again.' };
        }
    }

    logout() {
        this.loginAsStudent('Alex Mercer', 'STU-5001', 'Class 5');
    }
}

window.authManager = new AuthManager();
