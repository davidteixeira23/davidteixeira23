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
  'Java':       '#e07b39',
  'JavaScript': '#f0c020',
  'PHP':        '#7F52FF',
  'HTML':       '#e34f26',
  'CSS':        '#1572B6',
  'Kotlin':     '#A97BFF',
  'C++':        '#00599C',
  'Python':     '#3572A5',
  'TypeScript': '#2b7489',
  'Shell':      '#89e051',
  'Other':      '#73726c',
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
      // não quebra streak no dia de hoje (pode commitar mais tarde)
      if (day.date !== today) tempStreak = 0;
    }
  }

  // streak atual: conta de trás para frente
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.date === today && day.contributionCount === 0) continue; // pula hoje se vazio
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

  // Simplifica HTML/CSS
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
  // Dois cards lado a lado: esquerdo (stats) + direito (donut)
  const W = 700, H = 220;
  const DONUT_CX = 530, DONUT_CY = 110, DONUT_R = 80, DONUT_INNER = 48;

  function polarToXY(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  // Gera arcos do donut
  let arcs = '';
  let startAngle = 0;
  languages.forEach((lang) => {
    const sweep = (lang.pct / 100) * 360;
    // evita arco de 360 graus exato (bug SVG)
    const safeSweep = sweep >= 360 ? 359.99 : sweep;
    const endAngle = startAngle + safeSweep;
    const [x1, y1] = polarToXY(DONUT_CX, DONUT_CY, DONUT_R, startAngle);
    const [x2, y2] = polarToXY(DONUT_CX, DONUT_CY, DONUT_R, endAngle);
    const [ix1, iy1] = polarToXY(DONUT_CX, DONUT_CY, DONUT_INNER, endAngle);
    const [ix2, iy2] = polarToXY(DONUT_CX, DONUT_CY, DONUT_INNER, startAngle);
    const large = safeSweep > 180 ? 1 : 0;
    arcs += `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${DONUT_R},${DONUT_R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${DONUT_INNER},${DONUT_INNER} 0 ${large} 0 ${ix2.toFixed(2)},${iy2.toFixed(2)} Z" fill="${lang.color}" stroke="#0d1117" stroke-width="2"/>`;
    startAngle += safeSweep;
  });

  // Legenda à esquerda do donut (vertical)
  const LEG_X = 408;
  const LEG_Y_START = DONUT_CY - ((languages.length - 1) * 22) / 2;
  let legend = '';
  languages.forEach((lang, i) => {
    const ly = LEG_Y_START + i * 22;
    legend += `
      <rect x="${LEG_X}" y="${ly - 9}" width="10" height="10" rx="3" fill="${lang.color}"/>
      <text x="${LEG_X + 15}" y="${ly}" font-family="monospace" font-size="12" fill="#c9d1d9">${lang.name}</text>
      <text x="${LEG_X + 110}" y="${ly}" text-anchor="end" font-family="monospace" font-size="12" fill="${lang.color}" font-weight="bold">${lang.pct}%</text>`;
  });

  // top language para centro do donut
  const topLang = languages[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#161b22"/>
      <stop offset="100%" style="stop-color:#0d1117"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" rx="14" fill="url(#bg)" stroke="#30363d" stroke-width="1"/>

  <!-- LADO ESQUERDO: título + 3 métricas + barra de linguagens -->
  <text x="20" y="30" font-family="monospace" font-size="13" fill="#58a6ff" font-weight="bold">⚡ davidteixeira23</text>
  <line x1="20" y1="40" x2="390" y2="40" stroke="#21262d" stroke-width="1"/>

  <!-- 3 cards de métricas -->
  <rect x="20" y="50" width="108" height="58" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="74" y="68" text-anchor="middle" font-family="monospace" font-size="10" fill="#8b949e">Commits</text>
  <text x="74" y="96" text-anchor="middle" font-family="monospace" font-size="22" fill="#3fb950" font-weight="bold">${totalCommits}</text>

  <rect x="140" y="50" width="108" height="58" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="194" y="68" text-anchor="middle" font-family="monospace" font-size="10" fill="#8b949e">🔥 Streak</text>
  <text x="194" y="96" text-anchor="middle" font-family="monospace" font-size="22" fill="#f78166" font-weight="bold">${currentStreak}d</text>

  <rect x="260" y="50" width="108" height="58" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="314" y="68" text-anchor="middle" font-family="monospace" font-size="10" fill="#8b949e">🏆 Recorde</text>
  <text x="314" y="96" text-anchor="middle" font-family="monospace" font-size="22" fill="#e3b341" font-weight="bold">${longestStreak}d</text>

  <!-- Barras de linguagens -->
  <text x="20" y="130" font-family="monospace" font-size="10" fill="#8b949e">Top Languages</text>
  ${languages.map((lang, i) => {
    const barW = Math.round(lang.pct * 3.4);
    return `
  <rect x="20" y="${142 + i * 16}" width="8" height="8" rx="2" fill="${lang.color}"/>
  <text x="32" y="${151 + i * 16}" font-family="monospace" font-size="10" fill="#8b949e">${lang.name}</text>
  <rect x="110" y="${143 + i * 16}" width="${barW}" height="6" rx="3" fill="${lang.color}" opacity="0.7"/>
  <text x="375" y="${151 + i * 16}" text-anchor="end" font-family="monospace" font-size="10" fill="${lang.color}" font-weight="bold">${lang.pct}%</text>`;
  }).join('')}

  <!-- divisor vertical -->
  <line x1="398" y1="16" x2="398" y2="${H - 16}" stroke="#21262d" stroke-width="1"/>

  <!-- LADO DIREITO: donut + legenda -->
  ${arcs}

  <!-- círculo interno (buraco do donut) -->
  <circle cx="${DONUT_CX}" cy="${DONUT_CY}" r="${DONUT_INNER - 1}" fill="#0d1117"/>

  <!-- texto no centro do donut -->
  <text x="${DONUT_CX}" y="${DONUT_CY - 6}" text-anchor="middle" font-family="monospace" font-size="10" fill="#8b949e">top lang</text>
  <text x="${DONUT_CX}" y="${DONUT_CY + 10}" text-anchor="middle" font-family="monospace" font-size="12" fill="${topLang.color}" font-weight="bold">${topLang.name}</text>
  <text x="${DONUT_CX}" y="${DONUT_CY + 24}" text-anchor="middle" font-family="monospace" font-size="11" fill="${topLang.color}">${topLang.pct}%</text>

  ${legend}

  <!-- rodapé -->
  <text x="${W - 12}" y="${H - 8}" text-anchor="end" font-family="monospace" font-size="9" fill="#484f58">Atualizado via GitHub Actions</text>
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
