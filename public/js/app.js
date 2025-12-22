// ----- IMPORT DIMENSIONS -----
import { DIMENSIONS } from './dimensions.js';

// ----- CONFIG -----
const SCALE_LABELS = { min: 'Rarely', max: 'Distinctive strength' };
const WEBHOOK_URL = ""; // Optional webhook URL

// ----- RENDER QUESTIONS -----
const qRoot = document.getElementById('questions');

DIMENSIONS.forEach((dim, dIdx) => {
  const container = document.createElement('div');
  container.className = 'card';
  container.innerHTML = `
    <div class="dim-title">
      <h2>${dIdx + 1}. ${dim.title}</h2>
      <span class="pill">Team rating</span>
    </div>
    <div class="likert" id="likert-${dim.key}"></div>
    <div class="grid">
      <label>${dim.prompts[0]}
        <textarea data-prompt="${dim.key}-0"></textarea>
      </label>
      <label>${dim.prompts[1]}
        <textarea data-prompt="${dim.key}-1"></textarea>
      </label>
    </div>
  `;
  qRoot.appendChild(container);

  const likert = container.querySelector(`#likert-${dim.key}`);
  dim.items.forEach((text, i) => {
    const id = `${dim.key}-${i}`;
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <div>${dIdx + 1}.${i + 1} ${text}</div>
      <div class="scale" role="group" aria-label="Scale">
        ${[1, 2, 3, 4, 5].map(val => `
          <label>
            <input type="radio" name="${id}" value="${val}" required>
            <span>${val}</span>
          </label>
        `).join('')}
        <span class="muted" style="margin-left:auto">${SCALE_LABELS.min} ↔ ${SCALE_LABELS.max}</span>
      </div>
    `;
    likert.appendChild(item);
  });
});

// ----- SCORING FUNCTION -----
function score(data) {
  const dimScores = {};
  DIMENSIONS.forEach(dim => {
    const vals = dim.items.map((_, i) => Number(data.ratings[`${dim.key}-${i}`] || 0)).filter(v => v > 0);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    dimScores[dim.key] = Number.isFinite(avg) ? Number(avg.toFixed(2)) : 0;
  });

  const overall = Number((Object.values(dimScores).reduce((a, b) => a + b, 0) / DIMENSIONS.length).toFixed(2));

  function band(v) {
    if (v >= 4.2) return { label: 'Strong', cls: 'b-green' };
    if (v >= 3.6) return { label: 'Stable', cls: 'b-yellow' };
    if (v >= 3.0) return { label: 'Develop', cls: 'b-orange' };
    return { label: 'Risk', cls: 'b-red' };
  }

  const pairs = Object.entries(dimScores);
  const top = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const low = [...pairs].sort((a, b) => a[1] - b[1]).slice(0, 3);

  return { dimScores, overall, band, top, low };
}

// ----- RENDER SNAPSHOT -----
function renderSnapshot(org, results) {
  const nameByKey = Object.fromEntries(DIMENSIONS.map(d => [d.key, d.title]));
  const snap = document.getElementById('snapshot');
  const band = results.band(results.overall);

  const rows = Object.entries(results.dimScores).map(([k, v]) => {
    const b = results.band(v);
    return `<tr><td>${nameByKey[k]}</td><td>${v.toFixed(2)}</td><td><span class="badge ${b.cls}">${b.label}</span></td></tr>`;
  }).join('');

  function list(items) {
    return items.map(([k, v]) => `<li>${nameByKey[k]} — <strong>${v.toFixed(2)}</strong></li>`).join('');
  }

  snap.style.display = 'block';
  snap.innerHTML = `
    <h2>Initial Snapshot Report — ${org || 'Leadership Team'}</h2>
    <div class="notice">
      This is an immediate quantitative snapshot. Augment will deliver the full report to the email provided.
    </div>
    <h3>Overall Team Score: ${results.overall.toFixed(2)} / 5.00 <span class="badge ${band.cls}">${band.label}</span></h3>
    <table class="table">
      <thead><tr><th>Dimension</th><th>Score</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="grid">
      <div class="card">
        <h3>Top Strengths</h3>
        <ul>${list(results.top)}</ul>
      </div>
      <div class="card">
        <h3>Top Opportunities</h3>
        <ul>${list(results.low)}</ul>
      </div>
    </div>
    <p class="muted">Banding: 4.2+ Strong · 3.6–4.1 Stable · 3.0–3.5 Develop · &lt;3.0 Risk</p>
  `;
}

// ----- SUBMIT HANDLER -----
// Submit form
document.getElementById('submitBtn').addEventListener('click', async () => {
  const org = document.querySelector('input[name="org"]').value.trim();
  const email = document.querySelector('input[name="email"]').value.trim();

  const ratings = {};
  DIMENSIONS.forEach(dim => dim.items.forEach((_,i)=>{
    const name = `${dim.key}-${i}`;
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    ratings[name] = checked ? checked.value : undefined;
  }));

  const qualitative = {};
  document.querySelectorAll('textarea[data-prompt]').forEach(t => qualitative[t.dataset.prompt] = t.value.trim());
  qualitative['protect'] = document.getElementById('protect').value.trim();
  qualitative['accelerate'] = document.getElementById('accelerate').value.trim();

  // Send to server
  try {
    const res = await fetch('/send-email', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ org, email, ratings, qualitative })
    });
    const data = await res.json();
    if(data.success) alert('Email sent!');
    else alert('Email failed: ' + data.error);
  } catch(err) {
    alert('Error: ' + err.message);
  }
});
