/**
 * Cognify - NOAH Document Parser & OCR Engine
 * Extracts text and question structures from PDF and Photo/Image test papers
 */

class DocumentParser {
    constructor() {
        this.initPdfJs();
    }

    initPdfJs() {
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    async parseFile(file) {
        const fileType = file.type || '';
        const fileName = file.name || '';
        
        let extractedText = '';

        if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
            extractedText = await this.extractTextFromPdf(file);
        } else if (fileType.includes('image') || fileName.match(/\.(png|jpe?g|webp|bmp)$/i)) {
            extractedText = await this.extractTextFromImage(file);
        } else {
            // Text or fallback file
            extractedText = await file.text();
        }

        return this.parseQuestionsFromText(extractedText, fileName);
    }

    async extractTextFromPdf(file) {
        if (!window.pdfjsLib) {
            console.warn('PDF.js not loaded. Reading plain text stream fallback.');
            return await file.text();
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += `\n--- Page ${pageNum} ---\n` + pageText;
            }

            return fullText;
        } catch (err) {
            console.error('PDF parsing error:', err);
            return await file.text();
        }
    }

    async extractTextFromImage(file) {
        if (!window.Tesseract) {
            console.warn('Tesseract OCR library not loaded. Creating placeholder question prompt.');
            return `Question 1: What is the main subject covered in this uploaded test paper image (${file.name})?\nQuestion 2: Explain the primary concept depicted in the diagram.`;
        }

        try {
            const worker = await window.Tesseract.createWorker('eng');
            const imageUrl = URL.createObjectURL(file);
            const ret = await worker.recognize(imageUrl);
            await worker.terminate();
            URL.revokeObjectURL(imageUrl);

            return ret.data.text;
        } catch (err) {
            console.error('OCR Error:', err);
            return `Question 1: Explain the scientific principles shown in ${file.name}.\nQuestion 2: State the definition of key terms listed in the paper.`;
        }
    }

    parseQuestionsFromText(rawText, fileName) {
        if (!rawText || rawText.trim().length === 0) {
            rawText = "1. State the main definition of the topic in your own words.\n2. Explain the process step by step.";
        }

        // Split text by common question delimiters: "Q1.", "Question 1", "1.", "2.", "3.", etc.
        const lines = rawText.split('\n');
        const rawQuestions = [];
        let currentQ = '';

        const qRegex = /^(Q\d+[:.]?|Question\s*\d+[:.]?|\d+[\.\)])\s*(.*)/i;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('---')) return;

            const match = trimmed.match(qRegex);
            if (match) {
                if (currentQ) rawQuestions.push(currentQ);
                currentQ = match[2] || trimmed;
            } else if (currentQ) {
                currentQ += ' ' + trimmed;
            } else {
                currentQ = trimmed;
            }
        });

        if (currentQ) rawQuestions.push(currentQ);

        // Filter and sanitize questions
        const structuredQuestions = rawQuestions
            .filter(q => q.trim().length > 8)
            .map((qText, idx) => {
                const cleanText = qText.replace(/^[0-9\.\)\s:]+/, '').trim();
                const keywords = this.generateKeywords(cleanText);
                return {
                    id: `q_parsed_${idx + 1}`,
                    text: cleanText.length > 5 ? cleanText : `Question ${idx + 1}: Explain the concept in your own words.`,
                    acceptedAnswers: [cleanText.toLowerCase().replace(/[^\w\s]/gi, '')],
                    keywords: keywords,
                    topicTag: this.inferTopic(cleanText, fileName),
                    points: 10
                };
            });

        // Fallback if parsing produced no valid questions
        if (structuredQuestions.length === 0) {
            structuredQuestions.push({
                id: 'q_parsed_1',
                text: `State the key concepts described in the uploaded test paper (${fileName}).`,
                acceptedAnswers: ['key concepts', 'main topic', 'definition'],
                keywords: ['concepts', 'main', 'definition'],
                topicTag: 'General Subject',
                points: 10
            });
        }

        return {
            title: fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ') + " Oral Exam",
            questions: structuredQuestions
        };
    }

    generateKeywords(text) {
        const stopWords = new Set(['what', 'is', 'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'explain', 'describe', 'state', 'how', 'does', 'why']);
        const words = text.toLowerCase().replace(/[^\w\s]/gi, '').split(/\s+/);
        const filtered = words.filter(w => w.length > 3 && !stopWords.has(w));
        return Array.from(new Set(filtered)).slice(0, 5);
    }

    inferTopic(text, fileName) {
        const lower = (text + ' ' + fileName).toLowerCase();
        if (lower.includes('plant') || lower.includes('photosynthesis') || lower.includes('bio')) return 'Plant Biology & Environment';
        if (lower.includes('sun') || lower.includes('planet') || lower.includes('solar') || lower.includes('space')) return 'Solar System & Space';
        if (lower.includes('math') || lower.includes('equation') || lower.includes('fraction') || lower.includes('number')) return 'Mathematics & Numbers';
        if (lower.includes('force') || lower.includes('energy') || lower.includes('motion') || lower.includes('matter')) return 'Physical Science';
        return 'General Studies';
    }
}

window.documentParser = new DocumentParser();
