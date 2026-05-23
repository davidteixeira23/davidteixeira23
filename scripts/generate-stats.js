const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
const fs = require('fs');

const USERNAME = process.env.GITHUB_USERNAME || 'davidteixeira23';
const TOKEN = process.env.GITHUB_TOKEN;

const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// Cores por linguagem
const LANG_COLORS = {
  'Java': '#e07b39',
  'JavaScript': '#f0c020',
  'PHP': '#7F52FF',
  'HTML': '#e34f26',
  'CSS': '#1572B6',
  'Kotlin': '#A97BFF',
  'C++': '#00599C',
  'Python': '#3572A5',
  'TypeScript': '#2b7489',
  'Shell': '#89e051',
  'Other': '#73726c',
};

function color(lang) {
  return LANG_COLORS[lang] || LANG_COLORS['Other'];
}

// ─── Busca dados via GraphQL ────────────────────────────────────────────────
async function fetchStats() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          nodes {
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges { size node { name } }
            }
            defaultBranchRef {
              target {
                ... on Commit {
                  history(first: 1) { totalCount }
                }
              }
            }
          }
        }
        contributionsCollection {
          totalCommitContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });

  const json = await res.json();
  if (json.errors) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }
  return json.data.user;
}

// ─── Calcula streak ─────────────────────────────────────────────────────────
function calcStreaks(calendar) {
  const days = calendar.weeks.flatMap(w => w.contributionDays)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (day.contributionCount > 0) {
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      if (day.date !== today) tempStreak = 0;
    }
  }

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.date === today && day.contributionCount === 0) continue;
    if (day.contributionCount > 0) currentStreak++;
    else break;
  }

  return { currentStreak, longestStreak };
}

// ─── Agrega linguagens ───────────────────────────────────────────────────────
function aggregateLanguages(repos) {
  const totals = {};
  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      const lang = edge.node.name;
      totals[lang] = (totals[lang] || 0) + edge.size;
    }
  }

  if (totals['HTML'] || totals['CSS']) {
    totals['HTML/CSS'] = (totals['HTML'] || 0) + (totals['CSS'] || 0);
    delete totals['HTML'];
    delete totals['CSS'];
  }

  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const total = sorted.reduce((s, [, v]) => s + v, 0);
  return sorted.map(([name, size]) => ({
    name,
    pct: Math.round((size / total) * 100),
    color: LANG_COLORS[name] || LANG_COLORS['Other'],
  }));
}

// ─── Gera SVG ────────────────────────────────────────────────────────────────
function generateSVG({ totalCommits, currentStreak, longestStreak, languages }) {
  const W = 800, H = 300;
  const PIE_CX = 580, PIE_CY = 135, PIE_R = 60; 
  const DIVIDER_X = 400;

  let slices = '';
  let accumulatedPercentage = 0;
  const circumference = 2 * Math.PI * PIE_R;

  // Renderiza as fatias da rosca usando stroke-dasharray para precisão limpa
  languages.forEach((lang) => {
    if (lang.pct <= 0) return;
    
    const strokeLength = (lang.pct / 100) * circumference;
    const strokeOffset = circumference - (accumulatedPercentage / 100) * circumference;
    
    slices += `
      <circle cx="${PIE_CX}" cy="${PIE_CY}" r="${PIE_R}"
              fill="transparent"
              stroke="${lang.color}"
              stroke-width="28"
              stroke-dasharray="${strokeLength} ${circumference}"
              stroke-dashoffset="${strokeOffset}"
              transform="rotate(-90 ${PIE_CX} ${PIE_CY})" />`;
              
    accumulatedPercentage += lang.pct;
  });

  // Legenda abaixo do gráfico de rosca — Organizada em 2 colunas claras
  const LEG_Y_START = 225;
  const LEG_COL1_X = 440;
  const LEG_COL2_X = 610;
  let legendItems = '';
  
  languages.forEach((lang, i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const lx = col === 0 ? LEG_COL1_X : LEG_COL2_X;
    const ly = LEG_Y_START + row * 18;
    legendItems += `
      <rect x="${lx}" y="${ly - 8}" width="10" height="10" rx="2" fill="${lang.color}"/>
      <text x="${lx + 16}" y="${ly}" font-family="monospace" font-size="11" fill="#8b949e">${lang.name} <tspan fill="#58a6ff" font-weight="bold">${lang.pct}%</tspan></text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#161b22"/>
      <stop offset="100%" style="stop-color:#0d1117"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" rx="12" fill="url(#cardBg)" stroke="#30363d" stroke-width="1"/>

  <text x="24" y="36" font-family="monospace" font-size="14" fill="#58a6ff" font-weight="bold">⚡ Estatísticas do GitHub — ${USERNAME}</text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="#21262d" stroke-width="1"/>

  <line x1="${DIVIDER_X}" y1="56" x2="${DIVIDER_X}" y2="${H - 20}" stroke="#21262d" stroke-width="1"/>

  <rect x="24" y="62" width="112" height="66" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="80" y="84" text-anchor="middle" font-family="monospace" font-size="10" fill="#8b949e">Commits</text>
  <text x="80" y="110" text-anchor="middle" font-family="monospace" font-size="24" fill="#3fb950" font-weight="bold">${totalCommits}</text>

  <rect x="148" y="62" width="112" height="66" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="204" y="84" text-anchor="middle" font-family="monospace" font-size="10" fill="#8b949e">🔥 Streak</text>
  <text x="204" y="110" text-anchor="middle" font-family="monospace" font-size="24" fill="#f78166" font-weight="bold">${currentStreak}d</text>

  <rect x="272" y="62" width="112" height="66" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="328" y="84" text-anchor="middle" font-family="monospace" font-size="10" fill="#8b949e">🏆 Recorde</text>
  <text x="328" y="110" text-anchor="middle" font-family="monospace" font-size="24" fill="#e3b341" font-weight="bold">${longestStreak}d</text>

  <text x="24" y="152" font-family="monospace" font-size="11" fill="#8b949e" font-weight="bold">Top Languages</text>
  <line x1="24" y1="158" x2="380" y2="158" stroke="#21262d" stroke-width="1"/>
  ${languages.map((lang, i) => `
  <rect x="24" y="${168 + i * 20}" width="9" height="9" rx="2" fill="${lang.color}"/>
  <text x="38" y="${178 + i * 20}" font-family="monospace" font-size="12" fill="#c9d1d9">${lang.name}</text>
  <text x="380" y="${178 + i * 20}" text-anchor="end" font-family="monospace" font-size="12" fill="#58a6ff" font-weight="bold">${lang.pct}%</text>
  <rect x="150" y="${171 + i * 20}" width="${Math.round(lang.pct * 1.8)}" height="5" rx="2.5" fill="${lang.color}" opacity="0.8"/>
  `).join('')}

  <text x="${PIE_CX}" y="58" text-anchor="middle" font-family="monospace" font-size="11" fill="#8b949e">Distribuição</text>
  
  <text x="${PIE_CX}" y="${PIE_CY + 4}" text-anchor="middle" font-family="monospace" font-size="12" fill="#8b949e" font-weight="bold">top lang</text>
  
  ${slices}
  ${legendItems}

  <text x="${W - 16}" y="${H - 8}" text-anchor="end" font-family="monospace" font-size="10" fill="#484f58">Atualizado via GitHub Actions</text>
</svg>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Buscando dados de @${USERNAME}...`);
  const user = await fetchStats();

  const contributions = user.contributionsCollection;
  const totalCommits = contributions.totalCommitContributions;
  const { currentStreak, longestStreak } = calcStreaks(contributions.contributionCalendar);
  const languages = aggregateLanguages(user.repositories.nodes);

  console.log(`Commits: ${totalCommits} | Streak: ${currentStreak} | Recorde: ${longestStreak}`);
  console.log('Linguagens:', languages.map(l => `${l.name} ${l.pct}%`).join(', '));

  const svg = generateSVG({ totalCommits, currentStreak, longestStreak, languages });
  fs.writeFileSync('github-stats.svg', svg, 'utf8');
  console.log('✅ github-stats.svg gerado com sucesso!');
}

main().catch(err => { console.error(err); process.exit(1); });
