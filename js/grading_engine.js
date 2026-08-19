/**
 * Cognify - NOAH Grading Engine
 * Evaluates spoken transcripts for conceptual completeness, semantic accuracy, and full explanatory detail.
 */

class GradingEngine {
    constructor() {}

    evaluateAnswer(question, transcript) {
        if (!transcript || transcript.trim().length === 0) {
            return {
                status: 'incorrect',
                score: 0,
                maxScore: question.points || 10,
                confidence: 0,
                feedback: 'No response received. Question marked as incorrect.',
                matchedKeywords: [],
                missingKeywords: question.keywords || [],
                topicTag: question.topicTag || 'General Knowledge'
            };
        }

        const cleanTranscript = transcript.toLowerCase().replace(/[^\w\s]/gi, '').trim();
        const words = cleanTranscript.split(/\s+/).filter(Boolean);
        const keywords = question.keywords || [];
        const acceptedAnswers = question.acceptedAnswers || [];

        // 1. Check for single-word / lazy answers (e.g. student just says "malaria")
        if (words.length < 3) {
            return {
                status: 'incorrect',
                score: 0,
                maxScore: question.points || 10,
                confidence: 0.1,
                feedback: `Incomplete response. Simply stating the term "${cleanTranscript}" is insufficient. You must provide a full spoken explanation.`,
                matchedKeywords: keywords.filter(kw => cleanTranscript.includes(kw.toLowerCase())),
                missingKeywords: keywords,
                topicTag: question.topicTag || 'General Knowledge'
            };
        }

        // 2. Keyword Matching & Coverage
        const matchedKeywords = [];
        const missingKeywords = [];

        keywords.forEach(kw => {
            const cleanKw = kw.toLowerCase();
            if (cleanTranscript.includes(cleanKw)) {
                matchedKeywords.push(kw);
            } else {
                missingKeywords.push(kw);
            }
        });

        const keywordCoverageRatio = keywords.length > 0 ? (matchedKeywords.length / keywords.length) : 0;

        // 3. Phrase & Explanation Completeness Check
        let highestSimilarityRatio = 0;
        acceptedAnswers.forEach(ans => {
            const cleanAns = ans.toLowerCase().replace(/[^\w\s]/gi, '').trim();
            const ansWords = cleanAns.split(/\s+/).filter(Boolean);

            // Calculate Jaccard word overlap ratio
            const transSet = new Set(words);
            const ansSet = new Set(ansWords);
            const intersection = ansWords.filter(w => transSet.has(w)).length;
            const similarity = intersection / Math.max(ansWords.length, 1);
            
            highestSimilarityRatio = Math.max(highestSimilarityRatio, similarity);
        });

        // Check if student used explanatory structure (e.g. "is a", "caused by", "used to", "means", "defined as", "process of")
        const explanatoryPhrases = ['is a', 'is an', 'are', 'caused by', 'used to', 'means', 'defined as', 'process of', 'refers to', 'occurs when', 'equal to', 'equals', 'result of', 'due to'];
        const hasExplanatoryStructure = explanatoryPhrases.some(phrase => cleanTranscript.includes(phrase));

        // Combined Quality Score
        const combinedScore = (keywordCoverageRatio * 0.5) + (highestSimilarityRatio * 0.3) + (hasExplanatoryStructure ? 0.2 : 0);

        let status = 'incorrect';
        let score = 0;
        let feedback = '';

        // Strict Criteria for Full Credit: Must have good keyword coverage, reasonable length (>= 5 words), and explanatory structure
        if (combinedScore >= 0.55 && words.length >= 4 && (keywordCoverageRatio >= 0.5 || highestSimilarityRatio >= 0.5)) {
            status = 'correct';
            score = question.points || 10;
            feedback = `Affirmative. Precise and complete response. You correctly defined the concept including ${matchedKeywords.slice(0, 3).join(', ') || 'essential parameters'}.`;
        } else if (matchedKeywords.length > 0 || words.length >= 4) {
            status = 'partially_correct';
            score = Math.round((question.points || 10) * 0.5);
            feedback = `Partially correct. You identified key terms like ${matchedKeywords.join(', ') || 'some concepts'}, but your explanation lacked full detail regarding ${missingKeywords.slice(0, 2).join(' or ') || 'the complete definition'}.`;
        } else {
            status = 'incorrect';
            score = 0;
            feedback = `Incorrect response. Essential explanatory details and key parameters like ${keywords.slice(0, 2).join(', ')} were missing.`;
        }

        return {
            status,
            score,
            maxScore: question.points || 10,
            confidence: parseFloat(combinedScore.toFixed(2)),
            feedback,
            matchedKeywords,
            missingKeywords,
            topicTag: question.topicTag || 'General Knowledge'
        };
    }
}

window.gradingEngine = new GradingEngine();
