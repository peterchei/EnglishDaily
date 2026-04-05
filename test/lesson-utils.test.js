'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildTTSScript, parseTelegramSummary, escapeMarkdownV2, getPreviouslyTaughtWords, fetchBBCNewsContext } = require('../lib/lesson-utils');

// ── Shared fixture ────────────────────────────────────────────────────────────
const SAMPLE_MARKDOWN = `# Daily English Lesson - 2026-02-27

## 1. **Resilient** (Adjective)
**Pronunciation:** /rɪˈzɪliənt/
**Definition:** Able to recover quickly from difficult conditions.
**Cantonese Meaning:** 有韌性的；能快速復原的

**Example 1:**
She is remarkably resilient and bounced back after the setback.
**Cantonese Example 1:**
她非常有韌性，在挫折後迅速恢復。

**Example 2:**
The resilient economy recovered faster than expected.
**Cantonese Example 2:**
具韌性的經濟比預期更快復甦。

## 2. **Persevere** (Verb)
**Pronunciation:** /ˌpɜːsɪˈvɪə/
**Definition:** Continue doing something despite difficulty or delay.
**Cantonese Meaning:** 堅持；不放棄

**Example 1:**
You must persevere even when the task feels impossible.
**Cantonese Example 1:**
即使任務看似不可能，你也必須堅持。

**Example 2:**
He persevered with his studies and eventually passed the exam.
**Cantonese Example 2:**
他堅持學習，最終通過了考試。

## 3. **Nuance** (Noun)
**Pronunciation:** /ˈnjuːɑːns/
**Definition:** A subtle difference in meaning, expression, or sound.
**Cantonese Meaning:** 細微差別；微妙之處

**Example 1:**
There is an important nuance between being confident and being arrogant.
**Cantonese Example 1:**
自信和傲慢之間有一個重要的細微差別。

**Example 2:**
Her writing captures the nuances of everyday London life.
**Cantonese Example 2:**
她的寫作捕捉了倫敦日常生活的細微之處。
`;

// ── escapeMarkdownV2 ──────────────────────────────────────────────────────────
describe('escapeMarkdownV2', () => {
    test('escapes hyphens in dates', () => {
        assert.equal(escapeMarkdownV2('2026-02-28'), '2026\\-02\\-28');
    });

    test('escapes dots', () => {
        assert.equal(escapeMarkdownV2('Hello.'), 'Hello\\.');
    });

    test('escapes exclamation marks', () => {
        assert.equal(escapeMarkdownV2('Great!'), 'Great\\!');
    });

    test('escapes parentheses', () => {
        assert.equal(escapeMarkdownV2('(noun)'), '\\(noun\\)');
    });

    test('escapes underscores', () => {
        assert.equal(escapeMarkdownV2('some_var'), 'some\\_var');
    });

    test('leaves Chinese characters untouched', () => {
        assert.equal(escapeMarkdownV2('有韌性的'), '有韌性的');
    });

    test('leaves plain English words untouched', () => {
        assert.equal(escapeMarkdownV2('Resilient'), 'Resilient');
    });

    test('handles empty string', () => {
        assert.equal(escapeMarkdownV2(''), '');
    });
});

// ── parseTelegramSummary ──────────────────────────────────────────────────────
describe('parseTelegramSummary', () => {
    test('includes the date in the header (escaped for MarkdownV2)', () => {
        const result = parseTelegramSummary(SAMPLE_MARKDOWN, '2026-02-27');
        // Hyphens in dates must be escaped as \- for Telegram MarkdownV2
        assert.ok(result.includes('2026\\-02\\-27'), 'Header should contain the escaped date');
    });

    test('does not contain unescaped hyphens in the date', () => {
        const result = parseTelegramSummary(SAMPLE_MARKDOWN, '2026-02-27');
        // The raw date '2026-02-27' must not appear unescaped
        assert.ok(!result.includes('2026-02-27'), 'Raw unescaped date must not be present');
    });

    test('lists every word', () => {
        const result = parseTelegramSummary(SAMPLE_MARKDOWN, '2026-02-27');
        assert.ok(result.includes('Resilient'),  'Should include word 1');
        assert.ok(result.includes('Persevere'),  'Should include word 2');
        assert.ok(result.includes('Nuance'),     'Should include word 3');
    });

    test('includes Cantonese meanings', () => {
        const result = parseTelegramSummary(SAMPLE_MARKDOWN, '2026-02-27');
        assert.ok(result.includes('有韌性的'),  'Should include Cantonese for Resilient');
        assert.ok(result.includes('堅持'),      'Should include Cantonese for Persevere');
        assert.ok(result.includes('細微差別'),  'Should include Cantonese for Nuance');
    });

    test('numbers words starting from 1 (dots escaped for MarkdownV2)', () => {
        const result = parseTelegramSummary(SAMPLE_MARKDOWN, '2026-02-27');
        assert.ok(result.includes('1\\.'), 'Should have item 1 with escaped dot');
        assert.ok(result.includes('2\\.'), 'Should have item 2 with escaped dot');
        assert.ok(result.includes('3\\.'), 'Should have item 3 with escaped dot');
        assert.ok(!result.match(/(?<!\\)\d+\./), 'No unescaped numbered dots');
    });

    test('ends with the closing message', () => {
        const result = parseTelegramSummary(SAMPLE_MARKDOWN, '2026-02-27');
        assert.ok(result.includes('dashboard has been updated'), 'Should end with closing line');
    });

    test('does not include Cantonese example sentences', () => {
        const result = parseTelegramSummary(SAMPLE_MARKDOWN, '2026-02-27');
        assert.ok(!result.includes('她非常有韌性'), 'Should not include example sentence translations');
    });

    test('handles markdown with no words gracefully', () => {
        const result = parseTelegramSummary('# Daily English Lesson - 2026-02-27\n\nNo words here.', '2026-02-27');
        assert.ok(result.includes('2026\\-02\\-27'), 'Header still present with escaped date');
        assert.ok(!result.includes('undefined'), 'Should not contain "undefined"');
    });

    test('uses different date when passed (escaped)', () => {
        const result = parseTelegramSummary(SAMPLE_MARKDOWN, '2099-12-31');
        assert.ok(result.includes('2099\\-12\\-31'),  'Should use the provided date (escaped)');
        assert.ok(!result.includes('2026\\-02\\-27'), 'Should not use the fixture date');
    });
});

// ── buildTTSScript ────────────────────────────────────────────────────────────
describe('buildTTSScript', () => {
    test('starts with greeting', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(result.startsWith('Hello everyone!'), 'Should open with greeting');
    });

    test('mentions total word count', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(result.includes('3 words'), 'Should mention 3 words for 3-word lesson');
    });

    test('labels each word with its number', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(result.includes('Word 1: Resilient'), 'Should label word 1');
        assert.ok(result.includes('Word 2: Persevere'), 'Should label word 2');
        assert.ok(result.includes('Word 3: Nuance'),    'Should label word 3');
    });

    test('does not include IPA pronunciation notation', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(!result.includes('rɪˈzɪliənt'), 'Should not include IPA for Resilient');
        assert.ok(!result.includes('pɜːsɪˈvɪə'),  'Should not include IPA for Persevere');
        assert.ok(!result.includes('njuːɑːns'),    'Should not include IPA for Nuance');
    });

    test('includes English definitions', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(result.includes('recover quickly from difficult conditions'), 'Should include definition');
    });

    test('includes the first English example sentence', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(result.includes('remarkably resilient and bounced back'), 'Should include example 1');
    });

    test('excludes Cantonese text', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(!result.includes('她非常有韌性'),  'Should not contain Cantonese example');
        assert.ok(!result.includes('有韌性的'),      'Should not contain Cantonese meaning');
        assert.ok(!result.includes('廣東話'),        'Should not contain section labels');
    });

    test('strips markdown bold markers', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(!result.includes('**'), 'Should contain no ** bold markers');
        assert.ok(!result.includes('*'),  'Should contain no * italic markers');
    });

    test('ends with closing sign-off', () => {
        const result = buildTTSScript(SAMPLE_MARKDOWN);
        assert.ok(result.includes("That's all for today's lesson"), 'Should end with sign-off');
    });

    test('handles single-word lesson (singular grammar)', () => {
        const singleWord = `# Daily English Lesson - 2026-02-27

## 1. **Ephemeral** (Adjective)
**Pronunciation:** /ɪˈfemərəl/
**Definition:** Lasting for a very short time.
**Cantonese Meaning:** 短暫的

**Example 1:**
Fame can be ephemeral.
**Cantonese Example 1:**
名聲可以是短暫的。

**Example 2:**
The beauty of cherry blossoms is ephemeral.
**Cantonese Example 2:**
櫻花之美是短暫的。
`;
        const result = buildTTSScript(singleWord);
        assert.ok(result.includes('1 word'), 'Should use singular "word" for one item');
    });

    test('handles empty markdown without throwing', () => {
        assert.doesNotThrow(() => buildTTSScript(''), 'Should not throw on empty input');
        assert.doesNotThrow(() => buildTTSScript('# Title only'), 'Should not throw on title-only input');
    });
});

// ── getPreviouslyTaughtWords ─────────────────────────────────────────────────
describe('getPreviouslyTaughtWords', () => {
    test('extracts words from lesson files', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-test-'));
        fs.writeFileSync(path.join(tmpDir, 'vocabulary_2026-01-01.md'), SAMPLE_MARKDOWN);
        try {
            const words = getPreviouslyTaughtWords(tmpDir);
            assert.ok(words.includes('resilient'), 'Should include resilient (lowercased)');
            assert.ok(words.includes('persevere'), 'Should include persevere');
            assert.ok(words.includes('nuance'), 'Should include nuance');
            assert.equal(words.length, 3, 'Should find exactly 3 words');
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    test('returns sorted unique list', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-test-'));
        fs.writeFileSync(path.join(tmpDir, 'vocabulary_2026-01-01.md'), SAMPLE_MARKDOWN);
        fs.writeFileSync(path.join(tmpDir, 'vocabulary_2026-01-02.md'), SAMPLE_MARKDOWN);
        try {
            const words = getPreviouslyTaughtWords(tmpDir);
            assert.equal(words.length, 3, 'Duplicates should be removed');
            assert.deepEqual(words, [...words].sort(), 'Should be sorted');
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    test('scans subdirectories', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-test-'));
        const subDir = path.join(tmpDir, '2026-01');
        fs.mkdirSync(subDir);
        fs.writeFileSync(path.join(subDir, 'vocabulary_2026-01-01.md'), SAMPLE_MARKDOWN);
        try {
            const words = getPreviouslyTaughtWords(tmpDir);
            assert.ok(words.length > 0, 'Should find words in subdirectories');
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    test('returns empty array for empty directory', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-test-'));
        try {
            const words = getPreviouslyTaughtWords(tmpDir);
            assert.deepEqual(words, []);
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    test('ignores non-vocabulary files', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-test-'));
        fs.writeFileSync(path.join(tmpDir, 'README.md'), '## 1. **FakeWord** (Noun)\n');
        try {
            const words = getPreviouslyTaughtWords(tmpDir);
            assert.deepEqual(words, [], 'Should not pick up words from non-vocabulary files');
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });
});

// ── fetchBBCNewsContext ──────────────────────────────────────────────────────
describe('fetchBBCNewsContext', () => {
    test('returns a string', async () => {
        const result = await fetchBBCNewsContext();
        assert.equal(typeof result, 'string', 'Should return a string');
    });

    test('does not throw on network errors', async () => {
        // fetchBBCNewsContext should handle errors gracefully
        await assert.doesNotReject(() => fetchBBCNewsContext(), 'Should not reject');
    });
});
