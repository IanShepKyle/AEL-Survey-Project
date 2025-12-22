import { DIMENSIONS } from '../../public/js/dimensions.js';

export function buildReportHTML({ org, scores, qualitative }) {
  const rows = DIMENSIONS.map(d => `
    <tr>
      <td>${d.title}</td>
      <td>${scores.dimScores[d.key]}</td>
    </tr>
  `).join('');

  return `
    <h2>Augment Executive Leadership Team Index™</h2>
    <p><strong>Organization:</strong> ${org}</p>

    <h3>Overall Score: ${scores.overall} / 5.0</h3>

    <table border="1" cellpadding="8" cellspacing="0">
      <tr><th>Dimension</th><th>Score</th></tr>
      ${rows}
    </table>

    <h3>Qualitative Insights</h3>
    <p><strong>Protect:</strong><br>${qualitative.protect || '(none)'}</p>
    <p><strong>Accelerate:</strong><br>${qualitative.accelerate || '(none)'}</p>
  `;
}
