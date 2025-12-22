export function fullInternalReport({ org, email, results, qualitative }) {
  return `
ORG: ${org}
RESPONDENT: ${email}

OVERALL SCORE: ${results.overall} (${results.band})

DIMENSION SCORES:
${Object.entries(results.dimScores)
  .map(([k,v]) => `${k}: ${v}`)
  .join('\n')}

TOP STRENGTHS:
${results.top.map(([k,v]) => `${k}: ${v}`).join('\n')}

LOWEST SCORES:
${results.bottom.map(([k,v]) => `${k}: ${v}`).join('\n')}

QUALITATIVE RESPONSES:
${JSON.stringify(qualitative, null, 2)}
`;
}

export function customerSummaryReport({ org, results }) {
  return `
Thank you for completing the Augment Executive Leadership Team Index™

Organization: ${org}

OVERALL SCORE:
${results.overall} / 5.00 (${results.band})

TOP STRENGTHS:
${results.top.map(([k,v]) => `• ${k} (${v})`).join('\n')}

TOP OPPORTUNITIES:
${results.bottom.map(([k,v]) => `• ${k} (${v})`).join('\n')}

Your full qualitative report will be delivered separately.
`;
}
