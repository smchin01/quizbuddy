const STATE_KEY = 'qb_v1_state';

let allQuestions = [];
let state = { mastered: new Set(), review: new Set() };
let session = null;

// ── State ──────────────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { mastered: new Set(p.mastered || []), review: new Set(p.review || []) };
    }
  } catch {}
  return { mastered: new Set(), review: new Set() };
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    mastered: [...state.mastered],
    review:   [...state.review],
  }));
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ── Question pool ──────────────────────────────────────────────────────────────

function getPool() {
  // Mastered questions are skipped entirely
  const reviewQs   = allQuestions.filter(q => state.review.has(q.id) && !state.mastered.has(q.id));
  const untouchedQs = allQuestions.filter(q => !state.mastered.has(q.id) && !state.review.has(q.id));
  return { reviewQs, untouchedQs };
}

function buildQuiz(count) {
  const { untouchedQs } = getPool();
  return shuffle(untouchedQs).slice(0, count);
}

// ── Home screen ────────────────────────────────────────────────────────────────

function renderHome() {
  const { reviewQs, untouchedQs } = getPool();
  const available = untouchedQs.length;

  document.getElementById('stat-total').textContent     = allQuestions.length;
  document.getElementById('stat-mastered').textContent  = state.mastered.size;
  document.getElementById('stat-review').textContent    = reviewQs.length;
  document.getElementById('stat-remaining').textContent = untouchedQs.length;

  const countInput = document.getElementById('quiz-count');
  countInput.max   = available || 1;
  countInput.value = Math.min(parseInt(countInput.value, 10) || 20, available || 1);

  document.getElementById('available-label').textContent = available === 0
    ? (reviewQs.length > 0
      ? 'No new questions available. Use In Review to practice flagged questions.'
      : 'All questions mastered! Reset to practice again.')
    : `${available} new question${available === 1 ? '' : 's'} available`;

  document.getElementById('start-btn').disabled = available === 0;

  // Wire stat card click handlers
  const masteredCard  = document.getElementById('stat-mastered').closest('.stat-card');
  const reviewCard    = document.getElementById('stat-review').closest('.stat-card');
  const remainingCard = document.getElementById('stat-remaining').closest('.stat-card');

  setCardHandler(masteredCard,  state.mastered.size > 0  ? showMasteredList              : null, '📋 View list');
  setCardHandler(reviewCard,    reviewQs.length > 0      ? () => startFilteredQuiz('review')    : null, '▶ Quiz these');
  setCardHandler(remainingCard, untouchedQs.length > 0   ? () => startFilteredQuiz('untouched') : null, '▶ Quiz these');

  show('screen-home');
}

function setCardHandler(card, handler, tipText) {
  card.onclick = handler || null;
  card.classList.toggle('clickable', !!handler);
  let tip = card.querySelector('.card-tip');
  if (handler) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'card-tip'; card.appendChild(tip); }
    tip.textContent = tipText;
  } else if (tip) {
    tip.remove();
  }
}

// ── Mastered list ──────────────────────────────────────────────────────────────

function showMasteredList() {
  const mastered = allQuestions.filter(q => state.mastered.has(q.id));
  document.getElementById('list-title').textContent = 'Mastered Questions';
  document.getElementById('list-count').textContent = `${mastered.length} question${mastered.length !== 1 ? 's' : ''}`;

  const container = document.getElementById('list-items');
  container.innerHTML = '';
  mastered.forEach((q, i) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    const answerOptions = q.answers.map(letter =>
      `<div class="list-answer-option"><span class="option-letter correct">${letter}</span><span class="option-text">${q.options[letter] || ''}</span></div>`
    ).join('');
    div.innerHTML = `
      <div class="list-item-meta">Q${i + 1} &nbsp;·&nbsp; Set ${q.set}, #${q.srcQ}</div>
      <div class="list-item-question">${q.question}</div>
      <div class="list-answer-block">${answerOptions}</div>`;
    container.appendChild(div);
  });
  show('screen-list');
}

// ── Filtered quiz (review or untouched only) ───────────────────────────────────

function startFilteredQuiz(type) {
  const { reviewQs, untouchedQs } = getPool();
  const pool = type === 'review' ? reviewQs : untouchedQs;
  if (pool.length === 0) return;

  const questions = shuffle(pool);
  session = {
    questions,
    current:     0,
    userAnswers: questions.map(() => []),
    correct:     questions.map(() => null),
  };
  renderQuestion();
  show('screen-quiz');
}

// ── Quiz screen ────────────────────────────────────────────────────────────────

function startQuiz() {
  const raw   = parseInt(document.getElementById('quiz-count').value, 10);
  const count = Math.max(1, raw || 1);
  const questions = buildQuiz(count);
  if (questions.length === 0) return;

  session = {
    questions,
    current:     0,
    userAnswers: questions.map(() => []),  // selected letters per question
    correct:     questions.map(() => null), // null=unanswered, true/false after submit
  };

  renderQuestion();
  show('screen-quiz');
}

function renderQuestion() {
  const { questions, current, userAnswers, correct } = session;
  const q          = questions[current];
  const total      = questions.length;
  const submitted  = correct[current] !== null;
  const isInReview = state.review.has(q.id);
  const selected   = userAnswers[current];

  // Progress
  document.getElementById('progress-bar').style.width = `${(current / total) * 100}%`;
  document.getElementById('progress-text').textContent = `Question ${current + 1} of ${total}`;

  // Review badge
  document.getElementById('review-badge').style.display = isInReview ? 'inline-block' : 'none';

  // Source reference, so the question can be looked up in the raw exam/solution text files
  document.getElementById('source-ref').textContent = `Set ${q.set}, #${q.srcQ}`;

  // Multi-select hint
  const multiHint = document.getElementById('multi-hint');
  if (q.multiSelect) {
    const need = q.answers.length;
    multiHint.textContent = `Select ${need} answer${need > 1 ? 's' : ''}`;
    multiHint.style.display = 'block';
  } else {
    multiHint.style.display = 'none';
  }

  // Question text
  document.getElementById('question-text').textContent = q.question;

  // Options
  const optionsEl = document.getElementById('options-list');
  optionsEl.innerHTML = '';
  Object.entries(q.options).forEach(([letter, text]) => {
    const isSelected = selected.includes(letter);
    const isCorrect  = q.answers.includes(letter);

    const li = document.createElement('li');
    li.className = 'option';
    if (submitted) li.classList.add('submitted');
    if (!submitted && isSelected) li.classList.add('selected');

    if (submitted) {
      if (isCorrect && isSelected)  li.classList.add('correct'); // right pick
      else if (!isCorrect && isSelected) li.classList.add('wrong');   // wrong pick
      else if (isCorrect && !isSelected) li.classList.add('missed');  // missed correct
    }

    li.innerHTML = `<span class="option-letter">${letter}</span><span class="option-text">${text}</span>`;
    if (!submitted) li.addEventListener('click', () => toggleOption(letter));
    optionsEl.appendChild(li);
  });

  // Feedback banner + explanation
  const feedback = document.getElementById('feedback');
  const explanationEl = document.getElementById('explanation');
  if (submitted) {
    feedback.className = `feedback ${correct[current] ? 'correct' : 'wrong'}`;
    feedback.textContent = correct[current]
      ? `✓ Correct!  Answer: ${q.answers.join(', ')}`
      : `✗ Incorrect.  Correct answer: ${q.answers.join(', ')}`;
    feedback.style.display = 'block';
    if (q.explanation) {
      // Strip trailing separator lines left by the parser
      const cleaned = q.explanation.replace(/\s*[-=_]{3,}\s*$/gm, '').trim();
      explanationEl.textContent = cleaned;
      explanationEl.style.display = cleaned ? 'block' : 'none';
    } else {
      explanationEl.style.display = 'none';
    }
  } else {
    feedback.style.display = 'none';
    explanationEl.style.display = 'none';
  }

  // Submit / Next buttons
  const submitBtn = document.getElementById('submit-btn');
  const nextBtn   = document.getElementById('next-btn');
  submitBtn.style.display  = submitted ? 'none' : 'inline-flex';
  submitBtn.disabled       = selected.length === 0;
  nextBtn.style.display    = submitted ? 'inline-flex' : 'none';
  nextBtn.textContent      = current === total - 1 ? 'Finish Quiz' : 'Next Question';
}

function toggleOption(letter) {
  const { questions, current, userAnswers } = session;
  const q        = questions[current];
  const selected = userAnswers[current];

  if (q.multiSelect) {
    const idx = selected.indexOf(letter);
    if (idx === -1) selected.push(letter);
    else selected.splice(idx, 1);
  } else {
    // Single-select: replace selection
    userAnswers[current] = selected[0] === letter ? [] : [letter];
  }
  renderQuestion();
}

function submitAnswer() {
  const { questions, current, userAnswers } = session;
  const q        = questions[current];
  const selected = [...userAnswers[current]].sort();
  const expected = [...q.answers].sort();
  const isCorrect = selected.length === expected.length && selected.every((v, i) => v === expected[i]);

  session.correct[current] = isCorrect;

  if (isCorrect) {
    state.mastered.add(q.id);
    state.review.delete(q.id);
  } else if (!state.mastered.has(q.id)) {
    state.review.add(q.id);
  }

  saveState();
  renderQuestion();
}

function nextQuestion() {
  if (session.current === session.questions.length - 1) {
    renderResults();
  } else {
    session.current++;
    renderQuestion();
  }
}

function quitQuiz() {
  if (confirm('Quit this quiz? Your progress so far has been saved.')) renderHome();
}

// ── Results screen ─────────────────────────────────────────────────────────────

function renderResults() {
  const { questions, userAnswers, correct } = session;
  const numCorrect = correct.filter(Boolean).length;
  const total      = questions.length;
  const pct        = Math.round((numCorrect / total) * 100);

  document.getElementById('score-display').textContent = `${numCorrect} / ${total}`;
  const pctEl = document.getElementById('score-pct');
  pctEl.textContent  = `${pct}%`;
  pctEl.className    = `score-pct ${pct >= 70 ? 'score-pass' : 'score-fail'}`;

  const { reviewQs, untouchedQs } = getPool();
  document.getElementById('result-review').textContent    = reviewQs.length;
  document.getElementById('result-remaining').textContent = untouchedQs.length;

  const breakdown = document.getElementById('breakdown');
  breakdown.innerHTML = '';
  questions.forEach((q, i) => {
    const ok  = correct[i];
    const div = document.createElement('div');
    div.className = `breakdown-item ${ok ? 'correct' : 'wrong'}`;
    div.innerHTML = `
      <div class="breakdown-header">
        <span class="breakdown-num">Q${i + 1} &nbsp;·&nbsp; Set ${q.set}, #${q.srcQ}</span>
        <span class="breakdown-result">${ok ? '✓ Correct' : '✗ Wrong'}</span>
      </div>
      <div class="breakdown-question">${q.question}</div>
      <div class="breakdown-answers">
        <span class="your-answer">Your answer: <strong>${userAnswers[i].sort().join(', ') || '—'}</strong></span>
        ${!ok ? `<span class="correct-answer">Correct: <strong>${q.answers.join(', ')}</strong></span>` : ''}
      </div>`;
    breakdown.appendChild(div);
  });

  show('screen-results');
}

// ── Reset ──────────────────────────────────────────────────────────────────────

function resetAll() {
  if (!confirm('Reset all progress? Mastered and Review lists will be cleared.')) return;
  state = { mastered: new Set(), review: new Set() };
  saveState();
  renderHome();
}

// ── Boot ───────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('data/questions.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Skip questions with no recorded answer key
    allQuestions = data.filter(q => q.answers && q.answers.length > 0);
    state = loadState();
    renderHome();
  } catch (e) {
    const el = document.getElementById('screen-home');
    el.innerHTML = `
      <div class="container" style="text-align:center;padding:4rem 2rem">
        <h2 style="color:#e74c3c;margin-bottom:1rem">Failed to load questions</h2>
        <p>Make sure <code>data/questions.json</code> exists in the repo.</p>
        <p style="color:#999;margin-top:.5rem;font-size:.9rem">${e.message}</p>
      </div>`;
    show('screen-home');
  }
}

init();
