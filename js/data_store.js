/**
 * Cognify - NOAH Data Store
 * Clean data store with localStorage management for subjects, test papers, student results, and user authentication sessions.
 */

const INITIAL_SUBJECTS = [
    { id: 'sci-05', name: 'Science & Environment', code: 'SCI05', icon: 'zap' },
    { id: 'math-05', name: 'Mathematics', code: 'MTH05', icon: 'cpu' },
    { id: 'eng-05', name: 'English & Grammar', code: 'ENG05', icon: 'book' },
    { id: 'sst-05', name: 'Social Studies', code: 'SST05', icon: 'globe' }
];

class DataStore {
    constructor() {
        this.init();
    }

    init() {
        if (!localStorage.getItem('cognify_subjects')) {
            localStorage.setItem('cognify_subjects', JSON.stringify(INITIAL_SUBJECTS));
        }
        if (!localStorage.getItem('cognify_test_papers')) {
            localStorage.setItem('cognify_test_papers', JSON.stringify([]));
        }
        if (!localStorage.getItem('cognify_results')) {
            localStorage.setItem('cognify_results', JSON.stringify([]));
        }
        if (!localStorage.getItem('cognify_auth_session')) {
            // Default demo student session for Class 5
            const defaultSession = {
                role: 'student',
                studentName: 'Alex Mercer',
                studentId: 'STU-5001',
                gradeLevel: 'Class 5'
            };
            localStorage.setItem('cognify_auth_session', JSON.stringify(defaultSession));
        }
    }

    // --- Subjects ---
    getSubjects() {
        return JSON.parse(localStorage.getItem('cognify_subjects')) || INITIAL_SUBJECTS;
    }

    // --- Test Papers ---
    getTestPapers() {
        return JSON.parse(localStorage.getItem('cognify_test_papers')) || [];
    }

    getPapersForGrade(gradeLevel) {
        const papers = this.getTestPapers();
        if (!gradeLevel) return papers.filter(p => p.active);
        return papers.filter(p => p.active && (p.gradeLevel.toLowerCase() === gradeLevel.toLowerCase() || p.gradeLevel === 'All Grades'));
    }

    getTestPaperById(id) {
        const papers = this.getTestPapers();
        return papers.find(p => p.id === id);
    }

    saveTestPaper(paper) {
        const papers = this.getTestPapers();
        const existingIndex = papers.findIndex(p => p.id === paper.id);
        if (existingIndex >= 0) {
            papers[existingIndex] = paper;
        } else {
            papers.unshift(paper);
        }
        localStorage.setItem('cognify_test_papers', JSON.stringify(papers));
    }

    deleteTestPaper(id) {
        let papers = this.getTestPapers();
        papers = papers.filter(p => p.id !== id);
        localStorage.setItem('cognify_test_papers', JSON.stringify(papers));
    }

    // --- Student Test Results ---
    getResults() {
        return JSON.parse(localStorage.getItem('cognify_results')) || [];
    }

    getResultsForStudent(studentId) {
        const results = this.getResults();
        return results.filter(r => r.studentId === studentId);
    }

    saveResult(result) {
        const results = this.getResults();
        results.unshift(result);
        localStorage.setItem('cognify_results', JSON.stringify(results));
    }

    clearAllResults() {
        localStorage.setItem('cognify_results', JSON.stringify([]));
    }

    // --- Auth Session ---
    getAuthSession() {
        return JSON.parse(localStorage.getItem('cognify_auth_session')) || {
            role: 'student',
            studentName: 'Student',
            studentId: 'STU-5001',
            gradeLevel: 'Class 5'
        };
    }

    setAuthSession(sessionData) {
        localStorage.setItem('cognify_auth_session', JSON.stringify(sessionData));
    }
}

window.dataStore = new DataStore();
