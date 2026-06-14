const assert = require('node:assert/strict');

const {
  assignAppendSortOrders,
  detectUploadKind,
  normalizeDeepSeekDraft,
  normalizeQuestionsForCommit,
} = require('../../server/ai/admin-import');

function mockFile(originalname, mimetype, body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return { originalname, mimetype, buffer, size: buffer.length };
}

function run() {
  const pdf = mockFile('paket-soal.pdf', 'application/pdf', '%PDF-1.7\nbody');
  assert.equal(detectUploadKind(pdf), 'pdf');

  const docx = mockFile('paket-soal.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert.equal(detectUploadKind(docx), 'docx');

  assert.throws(
    () => detectUploadKind(mockFile('script.exe', 'application/octet-stream', 'MZ...')),
    /hanya mendukung/i
  );

  const draft = normalizeDeepSeekDraft({
    document_kind: 'questions_only',
    source_summary: '2 soal integral',
    questions: [
      {
        question_display: '∫ 2x (x²+1)³ dx',
        answer_display: '(x²+1)⁴/4 + C',
        mc_options: ['(x²+1)⁴/4 + C', '(x²+1)³/3 + C'],
        steps: [{ title: 'Substitusi', content: 'u=x²+1' }],
      },
    ],
  }, 7);
  assert.equal(draft.questions[0].subtopic_id, 7);
  assert.equal(draft.questions[0].difficulty, 'Easy');
  assert.equal(draft.questions[0].question_type, 'mc');
  assert.equal(draft.questions[0].steps[0].why, '');

  assert.throws(
    () => normalizeQuestionsForCommit(7, [{
      question_display: '∫ x dx',
      answer_display: 'x²/2 + C',
      question_type: 'mc',
      mc_options: [],
    }]),
    /pilihan jawaban/i
  );

  const commitQuestions = normalizeQuestionsForCommit(7, [{
    question_display: '∫ x dx',
    answer_display: 'x²/2 + C',
    question_type: 'mc',
    mc_options: ['x²/2 + C', 'x² + C', '1/x + C', 'ln x + C'],
  }]);
  assert.equal(commitQuestions[0].acceptable_answers[0], 'x²/2 + C');
  assert.equal(commitQuestions[0].steps.length, 0);

  const appended = assignAppendSortOrders(7, [
    { source_index: 1, subtopic_id: 7, sort_order: 1, question_display: 'File Soal 1' },
    { source_index: 2, subtopic_id: 7, sort_order: 2, question_display: 'File Soal 2' },
    { source_index: 1, subtopic_id: 8, sort_order: 1, question_display: 'File lain Soal 1' },
  ], (subtopicId) => ({ 7: 3, 8: 10 }[subtopicId] || 0));
  assert.deepEqual(appended.map((question) => ({
    source_index: question.source_index,
    subtopic_id: question.subtopic_id,
    sort_order: question.sort_order,
  })), [
    { source_index: 1, subtopic_id: 7, sort_order: 4 },
    { source_index: 2, subtopic_id: 7, sort_order: 5 },
    { source_index: 1, subtopic_id: 8, sort_order: 11 },
  ]);
}

run();
console.log('admin import tests passed');
