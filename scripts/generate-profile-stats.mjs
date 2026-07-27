import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.PROFILE_USERNAME || "nassimfatnassi1999";
const token = process.env.GITHUB_TOKEN;
const apiHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${username}-profile-readme`,
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const languageColors = {
  TypeScript: "#3178c6",
  Dart: "#00b4ab",
  Shell: "#89e051",
  Go: "#00add8",
  HCL: "#844fba",
  Java: "#b07219",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Swift: "#f05138",
  C: "#555555",
  CSS: "#563d7c",
  HTML: "#e34c26",
};

const themes = {
  light: {
    background: "#ffffff",
    border: "#d0d7de",
    heading: "#1f2328",
    text: "#59636e",
    value: "#0969da",
    track: "#eaeef2",
  },
  dark: {
    background: "#0d1117",
    border: "#30363d",
    heading: "#f0f6fc",
    text: "#8b949e",
    value: "#58a6ff",
    track: "#21262d",
  },
};

async function fetchJson(url, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: apiHeaders });
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status}: ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderSvg({ profile, repositories, languages, themeName }) {
  const theme = themes[themeName];
  const totalBytes = languages.reduce(
    (sum, language) => sum + language.bytes,
    0,
  );
  const topLanguages = languages.slice(0, 6);
  const stars = repositories.reduce(
    (sum, repository) => sum + repository.stargazers_count,
    0,
  );
  const forks = repositories.reduce(
    (sum, repository) => sum + repository.forks_count,
    0,
  );
  const updated = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date());
  const stats = [
    ["Public repositories", profile.public_repos],
    ["Stars earned", stars],
    ["Repository forks", forks],
    ["Followers", profile.followers],
  ];

  const statMarkup = stats
    .map(([label, value], index) => {
      const x = index % 2 === 0 ? 38 : 248;
      const y = index < 2 ? 124 : 218;
      return `
        <text x="${x}" y="${y - 28}" class="label">${escapeXml(label)}</text>
        <text x="${x}" y="${y + 12}" class="value">${escapeXml(value)}</text>`;
    })
    .join("");

  const languageMarkup = topLanguages
    .map((language, index) => {
      const percentage = totalBytes ? (language.bytes / totalBytes) * 100 : 0;
      const y = 88 + index * 34;
      const width = Math.max(3, Math.round(245 * (percentage / 100)));
      const color = languageColors[language.name] || "#8b949e";
      return `
        <circle cx="508" cy="${y - 4}" r="5" fill="${color}" />
        <text x="522" y="${y}" class="language">${escapeXml(language.name)}</text>
        <text x="918" y="${y}" text-anchor="end" class="percent">${percentage.toFixed(1)}%</text>
        <rect x="650" y="${y - 12}" width="245" height="8" rx="4" fill="${theme.track}" />
        <rect x="650" y="${y - 12}" width="${width}" height="8" rx="4" fill="${color}" />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="300" viewBox="0 0 960 300" role="img" aria-labelledby="title description">
  <title id="title">GitHub statistics and top languages for ${escapeXml(username)}</title>
  <desc id="description">Official public GitHub data, generated on ${escapeXml(updated)}.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { fill: ${theme.heading}; font-size: 22px; font-weight: 600; }
    .subtitle, .label, .percent { fill: ${theme.text}; font-size: 13px; }
    .value { fill: ${theme.value}; font-size: 32px; font-weight: 700; }
    .language { fill: ${theme.heading}; font-size: 14px; font-weight: 500; }
  </style>
  <rect x="1" y="1" width="958" height="298" rx="14" fill="${theme.background}" stroke="${theme.border}" />
  <text x="32" y="42" class="title">GitHub Stats</text>
  <text x="496" y="42" class="title">Top Languages</text>
  <text x="32" y="65" class="subtitle">Official public data · Updated ${escapeXml(updated)}</text>
  <line x1="466" y1="28" x2="466" y2="272" stroke="${theme.border}" />
  ${statMarkup}
  ${languageMarkup}
</svg>
`;
}

const profile = await fetchJson(`https://api.github.com/users/${username}`);
const allRepositories = await fetchJson(
  `https://api.github.com/users/${username}/repos?per_page=100&type=owner&sort=updated`,
);
const repositories = allRepositories.filter(
  (repository) => !repository.fork && !repository.archived,
);

const languageMaps = await mapWithConcurrency(
  repositories,
  5,
  async (repository) => {
    try {
      return await fetchJson(repository.languages_url);
    } catch {
      return repository.language ? { [repository.language]: 1 } : {};
    }
  },
);

const languageTotals = new Map();
for (const languageMap of languageMaps) {
  for (const [name, bytes] of Object.entries(languageMap)) {
    languageTotals.set(name, (languageTotals.get(name) || 0) + bytes);
  }
}

const languages = [...languageTotals.entries()]
  .map(([name, bytes]) => ({ name, bytes }))
  .sort((a, b) => b.bytes - a.bytes);

await mkdir("assets", { recursive: true });
for (const themeName of Object.keys(themes)) {
  await writeFile(
    `assets/profile-overview-${themeName}.svg`,
    renderSvg({ profile, repositories, languages, themeName }),
    "utf8",
  );
}

console.log(`Generated profile statistics for ${username}.`);
