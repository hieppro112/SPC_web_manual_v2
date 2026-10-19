// Practice quiz — English. The guide documents themselves exist only in Vietnamese (vi.ts);
// the English version is produced by automatic translation. "Review" links open the
// Vietnamese original with ?lang=en, which shows its English translation.
import type { GuideQuiz } from './types.ts';

export const en: GuideQuiz = {
  title: 'Practice: Getting to know KVH IT Docs',
  docTitles: {
    'guide-vi-01-bat-dau': '1. Getting started with KVH IT Docs',
    'guide-vi-02-doc-tai-lieu': '2. Reading and sharing documents',
    'guide-vi-03-bai-kiem-tra': '3. Taking quizzes',
    'guide-vi-04-soan-tai-lieu': '4. Writing documents (Editors)',
    'guide-vi-05-cac-loai-khoi': '5. Block types, images, diagrams, charts',
  },
  questions: [
    { type: 'truefalse', text: 'You must sign in to read published documents.', options: ['True', 'False'], correct: [1], doc: 'guide-vi-01-bat-dau' },
    { type: 'single', text: 'What happens if you search "may in" without Vietnamese accents?', options: ['Documents containing "máy in" are still found', 'Nothing is found because accents are missing', 'An error is shown'], correct: [0], doc: 'guide-vi-01-bat-dau' },
    { type: 'single', text: 'What is the quickest way to open a document at a machine on the shop floor?', options: ['Print the QR code from the "Share" dialog and stick it on the machine', 'Email it to each person', 'Copy the link by hand'], correct: [0], doc: 'guide-vi-02-doc-tai-lieu' },
    { type: 'multiple', text: 'What can the AI assistant do?', options: ['Summarize the document you are reading', 'Answer with links to the source documents', 'Edit the document for you'], correct: [0, 1], doc: 'guide-vi-02-doc-tai-lieu' },
    { type: 'truefalse', text: 'A "Practice" quiz can be taken any number of times and does not save scores.', options: ['True', 'False'], correct: [0], doc: 'guide-vi-03-bai-kiem-tra' },
    { type: 'single', text: 'An editor saved a wrong change to a document. What should they do?', options: ['Open "History" and restore the previous version', 'Delete the document and rewrite it', 'Nothing can be done'], correct: [0], doc: 'guide-vi-04-soan-tai-lieu' },
    { type: 'multiple', text: 'Which ways can add an image to a document?', options: ['Paste with Ctrl + V', 'Scan the QR code and take the photo with a phone', 'Read the file name to the AI assistant'], correct: [0, 1], doc: 'guide-vi-05-cac-loai-khoi' },
  ],
};
