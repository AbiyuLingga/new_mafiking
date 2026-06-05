const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');
const sourceDbPath = process.env.SOURCE_DB ||
  path.join(projectRoot, '..', 'Mafiking', 'db', 'database.sqlite');
const outputPath = process.env.OUTPUT ||
  path.join(projectRoot, 'db', 'question-bank.json');

if (!fs.existsSync(sourceDbPath)) {
  console.error(`Source database not found: ${sourceDbPath}`);
  process.exit(1);
}

const db = new Database(sourceDbPath, { readonly: true, fileMustExist: true });

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function tableColumns(tableName) {
  return new Set(
    db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
      .all()
      .map((column) => column.name)
  );
}

function selectRows({ table, columns, orderBy }) {
  const availableColumns = tableColumns(table);
  const selectedColumns = columns.map((column) => {
    if (availableColumns.has(column.name)) {
      return `${quoteIdentifier(column.name)} AS ${quoteIdentifier(column.name)}`;
    }
    return `${column.fallback} AS ${quoteIdentifier(column.name)}`;
  });

  return db.prepare(`
    SELECT ${selectedColumns.join(', ')}
    FROM ${quoteIdentifier(table)}
    ORDER BY ${orderBy}
  `).all();
}

const questionBank = {
  exportedAt: new Date().toISOString(),
  source: path.relative(projectRoot, sourceDbPath),
  chapters: selectRows({
    table: 'chapters',
    columns: [
      { name: 'id', fallback: 'NULL' },
      { name: 'title', fallback: "''" },
      { name: 'icon', fallback: "''" },
      { name: 'sort_order', fallback: '0' },
      { name: 'mapel', fallback: "'Matematika'" },
      { name: 'semester', fallback: '1' },
      { name: 'description', fallback: "''" },
      { name: 'est', fallback: "''" },
      { name: 'topics', fallback: "'[]'" }
    ],
    orderBy: 'sort_order, id'
  }),
  subtopics: selectRows({
    table: 'subtopics',
    columns: [
      { name: 'id', fallback: 'NULL' },
      { name: 'chapter_id', fallback: 'NULL' },
      { name: 'slug', fallback: "''" },
      { name: 'title', fallback: "''" },
      { name: 'icon', fallback: "''" },
      { name: 'description', fallback: "''" },
      { name: 'sort_order', fallback: '0' }
    ],
    orderBy: 'chapter_id, sort_order, id'
  }),
  problems: selectRows({
    table: 'problems',
    columns: [
      { name: 'id', fallback: 'NULL' },
      { name: 'subtopic_id', fallback: 'NULL' },
      { name: 'question_text', fallback: "''" },
      { name: 'question_display', fallback: "''" },
      { name: 'answer_display', fallback: "''" },
      { name: 'acceptable_answers', fallback: "'[]'" },
      { name: 'difficulty', fallback: "'Easy'" },
      { name: 'question_type', fallback: "'open'" },
      { name: 'mc_options', fallback: "'[]'" },
      { name: 'image_url', fallback: "''" },
      { name: 'image_alt', fallback: "''" },
      { name: 'sort_order', fallback: '0' },
      { name: 'created_at', fallback: 'NULL' }
    ],
    orderBy: 'subtopic_id, sort_order, id'
  }),
  problem_steps: selectRows({
    table: 'problem_steps',
    columns: [
      { name: 'id', fallback: 'NULL' },
      { name: 'problem_id', fallback: 'NULL' },
      { name: 'step_order', fallback: '0' },
      { name: 'title', fallback: "''" },
      { name: 'content', fallback: "''" },
      { name: 'why', fallback: "''" },
      { name: 'intuition', fallback: "''" },
      { name: 'mistakes', fallback: "''" },
      { name: 'mistake_result', fallback: "''" }
    ],
    orderBy: 'problem_id, step_order, id'
  })
};

db.close();

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(questionBank, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  output: outputPath,
  counts: {
    chapters: questionBank.chapters.length,
    subtopics: questionBank.subtopics.length,
    problems: questionBank.problems.length,
    problem_steps: questionBank.problem_steps.length
  }
}, null, 2));
