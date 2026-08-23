/**
 * Cognify - NOAH Data Store
 * Talks to the real backend API for accounts, test papers, and student results.
 * Subjects stay a static local reference list (not user data).
 */

const INITIAL_SUBJECTS = [
    { id: 'sci-05', name: 'Science & Environment', code: 'SCI05', icon: 'zap' },
    { id: 'math-05', name: 'Mathematics', code: 'MTH05', icon: 'cpu' },
    { id: 'eng-05', name: 'English & Grammar', code: 'ENG05', icon: 'book' },
    { id: 'sst-05', name: 'Social Studies', code: 'SST05', icon: 'globe' }
];

const TOKEN_KEY = 'cognify_token';

class DataStore {
    getToken() {
        // sessionStorage, not localStorage: cleared when the tab/browser closes,
        // so every fresh visit requires logging in again instead of silently
        // resuming whoever was last logged in on that machine.
        return sessionStorage.getItem(TOKEN_KEY);
    }

    setToken(token) {
        sessionStorage.setItem(TOKEN_KEY, token);
    }

    clearToken() {
        sessionStorage.removeItem(TOKEN_KEY);
    }

    async _fetch(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api${path}`, { ...options, headers });
        if (!res.ok) {
            let message = res.statusText;
            try {
                const data = await res.json();
                message = data.detail || message;
            } catch (e) {
                // response wasn't JSON — keep the status text
            }
            throw new Error(message);
        }
        if (res.status === 204) return null;
        return res.json();
    }

    // --- Subjects ---
    getSubjects() {
        return INITIAL_SUBJECTS;
    }

    // --- Test Papers ---
    getTestPapers() {
        return this._fetch('/papers');
    }

    getPapersForGrade(gradeLevel) {
        const qs = gradeLevel ? `?grade_level=${encodeURIComponent(gradeLevel)}` : '';
        return this._fetch(`/papers${qs}`);
    }

    getTestPaperById(id) {
        return this._fetch(`/papers/${id}`);
    }

    saveTestPaper(paper) {
        return this._fetch('/papers', { method: 'POST', body: JSON.stringify(paper) });
    }

    deleteTestPaper(id) {
        return this._fetch(`/papers/${id}`, { method: 'DELETE' });
    }

    // Grading happens server-side — the rubric never has to reach the browser.
    gradeAnswer(paperId, questionIndex, transcript) {
        return this._fetch(`/papers/${paperId}/questions/${questionIndex}/grade`, {
            method: 'POST',
            body: JSON.stringify({ transcript })
        });
    }

    // --- Student Test Results ---
    getResults() {
        return this._fetch('/results');
    }

    getResultsForStudent() {
        return this._fetch('/results/mine');
    }

    saveResult(result) {
        return this._fetch('/results', { method: 'POST', body: JSON.stringify(result) });
    }
}

window.dataStore = new DataStore();
