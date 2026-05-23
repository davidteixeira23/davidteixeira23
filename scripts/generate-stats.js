// generate-stats.js
// GitHub Premium Stats Card
// by David Teixeira

const fs = require("fs");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const USERNAME = process.env.GITHUB_USERNAME || "davidteixeira23";
const TOKEN = process.env.GITHUB_TOKEN;

const COLORS = {
  background: "#0d1117",
  card: "#161b22",
  border: "#30363d",
  text: "#c9d1d9",
  muted: "#8b949e",
  green: "#3fb950",
  orange: "#f0883e",
  yellow: "#d29922",
  blue: "#58a6ff",
  purple: "#a371f7",
  pink: "#ff7b72",
};

async function github(query) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  return (await res.json()).data;
}

async function getStats() {
  const query = `
  {
    user(login: "${USERNAME}") {
      contributionsCollection {
        contributionCalendar {
          totalContributions
        }
      }

      repositories(first: 100, ownerAffiliations: OWNER) {
        nodes {
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
            edges {
              size
              node {
                name
                color
              }
            }
          }
        }
      }
    }
  }
  `;

  const data = await github(query);

  const commits =
    data.user.contributionsCollection.contributionCalendar
      .totalContributions;

  const repos = data.user.repositories.nodes;

  const languageMap = {};

  repos.forEach((repo) => {
    repo.languages.edges.forEach((lang) => {
      const name = lang.node.name;

      if (!languageMap[name]) {
        languageMap[name] = {
          size: 0,
          color: lang.node.color || "#888",
        };
      }

      languageMap[name].size += lang.size;
    });
  });

  const total = Object.values(languageMap).reduce(
    (a, b) => a + b.size,
    0
  );

  const languages = Object.entries(languageMap)
    .map(([name, value]) => ({
      name,
      percent: ((value.size / total) * 100).toFixed(1),
      color: value.color,
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 6);

  return {
    commits,
    languages,
  };
}

function polarToCartesian(cx, cy, r, angle) {
  const rad = ((angle - 90) * Math.PI) / 180.0;

  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(x, y, radius, startAngle, endAngle) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
}

function generateSVG(stats) {
  const W = 920;
  const H = 260;

  const donutCX = 700;
  const donutCY = 130;
  const donutR = 75;

  let angle = 0;

  const donut = stats.languages
    .map((lang) => {
      const percent = parseFloat(lang.percent);
      const sweep = (percent / 100) * 360;

      const path = describeArc(
        donutCX,
        donutCY,
        donutR,
        angle,
        angle + sweep
      );

      const item = `
      <path
        d="${path}"
        fill="none"
        stroke="${lang.color}"
        stroke-width="32"
        stroke-linecap="butt"
      />
      `;

      angle += sweep;

      return item;
    })
    .join("");

  const bars = stats.languages
    .map((lang, index) => {
      const y = 150 + index * 24;
      const width = parseFloat(lang.percent) * 4;

      return `
      <circle cx="35" cy="${y - 5}" r="5" fill="${lang.color}" />

      <text
        x="50"
        y="${y}"
        fill="${COLORS.text}"
        font-size="14"
        font-family="monospace"
      >
        ${lang.name}
      </text>

      <rect
        x="140"
        y="${y - 13}"
        width="360"
        height="10"
        rx="5"
        fill="#21262d"
      />

      <rect
        x="140"
        y="${y - 13}"
        width="${width}"
        height="10"
        rx="5"
        fill="${lang.color}"
      />

      <text
        x="520"
        y="${y}"
        fill="${lang.color}"
        font-size="13"
        font-family="monospace"
      >
        ${lang.percent}%
      </text>
      `;
    })
    .join("");

  const legend = stats.languages
    .map((lang, index) => {
      const y = 55 + index * 28;

      return `
      <circle cx="610" cy="${y}" r="6" fill="${lang.color}" />

      <text
        x="625"
        y="${y + 5}"
        fill="${COLORS.text}"
        font-size="14"
        font-family="monospace"
      >
        ${lang.name}
      </text>
      `;
    })
    .join("");

  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">

    <rect width="${W}" height="${H}" rx="18" fill="${COLORS.background}" />

    <rect
      x="1"
      y="1"
      width="${W - 2}"
      height="${H - 2}"
      rx="18"
      stroke="${COLORS.border}"
    />

    <text
      x="30"
      y="35"
      fill="${COLORS.blue}"
      font-size="24"
      font-family="monospace"
      font-weight="bold"
    >
      ⚡ ${USERNAME}
    </text>

    <!-- Cards -->

    <rect x="30" y="55" width="150" height="80" rx="12" fill="${COLORS.card}" stroke="${COLORS.border}" />
    <text x="105" y="82" text-anchor="middle" fill="${COLORS.muted}" font-size="14" font-family="monospace">
      Commits
    </text>
    <text x="105" y="118" text-anchor="middle" fill="${COLORS.green}" font-size="34" font-family="monospace" font-weight="bold">
      ${stats.commits}
    </text>

    <rect x="200" y="55" width="150" height="80" rx="12" fill="${COLORS.card}" stroke="${COLORS.border}" />
    <text x="275" y="82" text-anchor="middle" fill="${COLORS.muted}" font-size="14" font-family="monospace">
      🔥 Streak
    </text>
    <text x="275" y="118" text-anchor="middle" fill="${COLORS.orange}" font-size="34" font-family="monospace" font-weight="bold">
      8d
    </text>

    <rect x="370" y="55" width="150" height="80" rx="12" fill="${COLORS.card}" stroke="${COLORS.border}" />
    <text x="445" y="82" text-anchor="middle" fill="${COLORS.muted}" font-size="14" font-family="monospace">
      🏆 Recorde
    </text>
    <text x="445" y="118" text-anchor="middle" fill="${COLORS.yellow}" font-size="34" font-family="monospace" font-weight="bold">
      8d
    </text>

    <!-- Divider -->

    <line
      x1="575"
      y1="40"
      x2="575"
      y2="220"
      stroke="${COLORS.border}"
      stroke-width="1"
    />

    <!-- Bars -->

    <text
      x="30"
      y="165"
      fill="${COLORS.muted}"
      font-size="16"
      font-family="monospace"
    >
      Top Languages
    </text>

    ${bars}

    <!-- Donut -->

    ${donut}

    <circle
      cx="${donutCX}"
      cy="${donutCY}"
      r="42"
      fill="${COLORS.background}"
    />

    <text
      x="${donutCX}"
      y="${donutCY - 5}"
      text-anchor="middle"
      fill="${COLORS.muted}"
      font-size="12"
      font-family="monospace"
    >
      top lang
    </text>

    <text
      x="${donutCX}"
      y="${donutCY + 20}"
      text-anchor="middle"
      fill="${stats.languages[0].color}"
      font-size="18"
      font-family="monospace"
      font-weight="bold"
    >
      ${stats.languages[0].name}
    </text>

    <!-- Legend -->

    ${legend}

    <text
      x="760"
      y="240"
      fill="${COLORS.muted}"
      font-size="12"
      font-family="monospace"
    >
      Atualizado via GitHub Actions
    </text>

  </svg>
  `;
}

async function main() {
  const stats = await getStats();

  const svg = generateSVG(stats);

  fs.mkdirSync("./dist", { recursive: true });

  fs.writeFileSync("./dist/github-stats.svg", svg);

  console.log("SVG gerado com sucesso!");
}

main();
