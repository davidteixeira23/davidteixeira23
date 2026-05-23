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
  const W = 800, H = 260;
  const PIE_CX = 590, PIE_CY = 130, PIE_R = 90;

  // Fatias do gráfico de pizza
  function polarToXY(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }

  let slices = '';
  let legendItems = '';
  let startAngle = 0;

  languages.forEach((lang, i) => {
    const sweep = (lang.pct / 100) * 360;
    const endAngle = startAngle + sweep;
    const [x1, y1] = polarToXY(PIE_CX, PIE_CY, PIE_R, startAngle);
    const [x2, y2] = polarToXY(PIE_CX, PIE_CY, PIE_R, endAngle);
    const large = sweep > 180 ? 1 : 0;

    slices += `<path d="M${PIE_CX},${PIE_CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${PIE_R},${PIE_R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z"
      fill="${lang.color}" stroke="#161b22" stroke-width="2"/>`;

    // Label de porcentagem dentro da fatia
    const midAngle = startAngle + sweep / 2;
    const [lx, ly] = polarToXY(PIE_CX, PIE_CY, PIE_R * 0.65, midAngle);
    if (lang.pct >= 7) {
      slices += `<text x="${lx.toFixed(2)}" y="${(ly + 4).toFixed(2)}" text-anchor="middle"
        font-family="monospace" font-size="11" fill="#fff" font-weight="bold">${lang.pct}%</text>`;
    }

    // Legenda lateral (coluna dupla)
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const lx2 = 420 + col * 110;
    const ly2 = 60 + row * 26;
    legendItems += `
      <rect x="${lx2}" y="${ly2 - 9}" width="10" height="10" rx="2" fill="${lang.color}"/>
      <text x="${lx2 + 14}" y="${ly2}" font-family="monospace" font-size="12" fill="#8b949e">${lang.name} ${lang.pct}%</text>`;

    startAngle = endAngle;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#161b22"/>
      <stop offset="100%" style="stop-color:#0d1117"/>
    </linearGradient>
  </defs>

  <!-- fundo -->
  <rect width="${W}" height="${H}" rx="12" fill="url(#cardBg)" stroke="#30363d" stroke-width="1"/>

  <!-- título -->
  <text x="24" y="36" font-family="monospace" font-size="14" fill="#58a6ff" font-weight="bold">⚡ GitHub Stats — davidteixeira23</text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="#21262d" stroke-width="1"/>

  <!-- métricas: 3 cards -->
  <!-- Total de Commits -->
  <rect x="24" y="62" width="160" height="72" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="104" y="88" text-anchor="middle" font-family="monospace" font-size="11" fill="#8b949e">Total de Commits</text>
  <text x="104" y="116" text-anchor="middle" font-family="monospace" font-size="26" fill="#3fb950" font-weight="bold">${totalCommits}</text>

  <!-- Streak Atual -->
  <rect x="200" y="62" width="160" height="72" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="280" y="88" text-anchor="middle" font-family="monospace" font-size="11" fill="#8b949e">🔥 Streak Atual</text>
  <text x="280" y="116" text-anchor="middle" font-family="monospace" font-size="26" fill="#f78166" font-weight="bold">${currentStreak} dias</text>

  <!-- Streak Mais Longo -->
  <rect x="376" y="62" width="160" height="72" rx="8" fill="#0d1117" stroke="#21262d" stroke-width="1"/>
  <text x="456" y="88" text-anchor="middle" font-family="monospace" font-size="11" fill="#8b949e">🏆 Streak Recorde</text>
  <text x="456" y="116" text-anchor="middle" font-family="monospace" font-size="26" fill="#e3b341" font-weight="bold">${longestStreak} dias</text>

  <!-- Commits por linguagem (tabela) -->
  <text x="24" y="162" font-family="monospace" font-size="12" fill="#8b949e">Linguagens</text>
  ${languages.map((lang, i) => `
  <rect x="24" y="${175 + i * 12}" width="8" height="8" rx="2" fill="${lang.color}"/>
  <text x="36" y="${183 + i * 12}" font-family="monospace" font-size="11" fill="#c9d1d9">${lang.name}</text>
  <text x="160" y="${183 + i * 12}" text-anchor="end" font-family="monospace" font-size="11" fill="#8b949e">${lang.pct}%</text>`).join('')}

  <!-- Gráfico de pizza -->
  <text x="${PIE_CX}" y="32" text-anchor="middle" font-family="monospace" font-size="12" fill="#8b949e">Distribuição</text>
  ${slices}
  ${legendItems}

  <!-- rodapé -->
  <text x="${W - 16}" y="${H - 10}" text-anchor="end" font-family="monospace" font-size="10" fill="#484f58">Atualizado automaticamente via GitHub Actions</text>
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
