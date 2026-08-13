import re
import json
import os

EXTRACTED_DIR = 'extracted'
OUTPUT_FILE = os.path.join('data', 'questions.json')

def parse_exam_block(block_text):
    block_text = block_text.strip()
    if not block_text:
        return None

    # Remove "Question #M" header line
    block_text = re.sub(r'^Question\s+#\d+\s*\n', '', block_text).strip()

    # Locate option lines: A. B. C. D. E. at start of line
    option_re = re.compile(r'^([A-E])\.\s', re.MULTILINE)
    option_starts = list(option_re.finditer(block_text))

    if not option_starts:
        return None

    question_text = ' '.join(block_text[:option_starts[0].start()].split())

    options = {}
    for i, m in enumerate(option_starts):
        letter = m.group(1)
        start = m.end()
        end = option_starts[i + 1].start() if i + 1 < len(option_starts) else len(block_text)
        options[letter] = ' '.join(block_text[start:end].split())

    # Match "(Choose two.)" or "(Choose two)" — period before ) is optional
    multi = bool(re.search(r'\(Choose \w+\.?\)', question_text, re.IGNORECASE))
    expected = 1
    if multi:
        m2 = re.search(r'\(Choose (\w+)\.?\)', question_text, re.IGNORECASE)
        if m2:
            word = m2.group(1).lower()
            expected = {'two': 2, '2': 2, 'three': 3, '3': 3, 'four': 4, '4': 4, 'five': 5, '5': 5}.get(word, 2)

    return {'question': question_text, 'options': options, 'multiSelect': multi, 'expectedCount': expected}


def extract_solution(sol_block, expected_count):
    """Return (answer_letters, explanation) by splitting the block into paragraphs."""
    # Each blank line starts a new paragraph
    paragraphs = re.split(r'\n[ \t]*\n', sol_block.strip())

    answer_re  = re.compile(r'^([A-E])[.)]\s', re.MULTILINE)
    # Capture full answer list: "Answer: B, D" or "Answer: B and D"
    header_re  = re.compile(r'^Answers?:\s*([A-E](?:\s*[,/]\s*[A-E])*)', re.MULTILINE | re.IGNORECASE)
    sep_re     = re.compile(r'^[-=_]{3,}$')

    answers = []
    seen = set()
    last_answer_para = -1

    for i, para in enumerate(paragraphs):
        found = False
        for m in answer_re.finditer(para):
            letter = m.group(1)
            if letter not in seen:
                seen.add(letter)
                answers.append(letter)
                found = True
        for m in header_re.finditer(para):
            for letter in re.findall(r'[A-E]', m.group(1)):
                if letter not in seen:
                    seen.add(letter)
                    answers.append(letter)
                    found = True
        if found:
            last_answer_para = i

    # Everything after the last answer paragraph is the explanation
    explanation = ''
    if last_answer_para >= 0:
        parts = []
        for para in paragraphs[last_answer_para + 1:]:
            p = para.strip()
            if sep_re.match(p) or not p:
                continue
            parts.append(p)
        explanation = '\n\n'.join(parts)
    # Strip trailing separator lines from explanation
    explanation = re.sub(r'\s*[-=_]{3,}\s*$', '', explanation).strip()

    if expected_count == 1:
        answers = answers[:1]
    else:
        answers = answers[:expected_count]

    return answers, explanation


def split_blocks(content):
    delimiter = re.compile(
        r'=====\s*Set Question\s+(\d+)\s+\(Source Question\s+#(\d+)\)\s*====='
    )
    parts = delimiter.split(content)
    blocks = {}
    for i in range(1, len(parts), 3):
        set_q = int(parts[i])
        src_q = parts[i + 1].strip()
        block = parts[i + 2]
        blocks[set_q] = (src_q, block)
    return blocks


def parse_set(set_num):
    exam_path = os.path.join(EXTRACTED_DIR, f'exam_set_{set_num:02d}.txt')
    sol_path = os.path.join(EXTRACTED_DIR, f'solution_set_{set_num:02d}.txt')

    with open(exam_path, 'r', encoding='utf-8', errors='replace') as f:
        exam_content = f.read()
    with open(sol_path, 'r', encoding='utf-8', errors='replace') as f:
        sol_content = f.read()

    exam_blocks = split_blocks(exam_content)
    sol_blocks = split_blocks(sol_content)

    questions = []
    for set_q_num in sorted(exam_blocks.keys()):
        src_q, exam_block = exam_blocks[set_q_num]
        parsed = parse_exam_block(exam_block)
        if not parsed:
            print(f'  SKIP: set {set_num:02d} Q{set_q_num} (no options found)')
            continue

        expected = parsed['expectedCount']
        _, sol_block = sol_blocks.get(set_q_num, (None, ''))
        answers, explanation = extract_solution(sol_block or '', expected)

        if not answers:
            print(f'  WARN: no answer for set {set_num:02d} Q{set_q_num} (src #{src_q})')

        questions.append({
            'id': f's{set_num:02d}q{set_q_num:03d}',
            'set': set_num,
            'setQ': set_q_num,
            'srcQ': src_q,
            'question': parsed['question'],
            'options': parsed['options'],
            'answers': answers,
            'multiSelect': parsed['multiSelect'],
            'explanation': explanation,
        })

    return questions


def main():
    all_q = []
    for n in range(1, 11):
        print(f'Parsing set {n:02d}...')
        qs = parse_set(n)
        all_q.extend(qs)
        print(f'  {len(qs)} questions')

    os.makedirs('data', exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_q, f, ensure_ascii=False, indent=2)
    print(f'\nTotal: {len(all_q)} questions -> {OUTPUT_FILE}')


if __name__ == '__main__':
    main()
