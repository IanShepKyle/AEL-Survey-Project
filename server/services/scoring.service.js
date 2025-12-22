import { DIMENSIONS } from '../shared/dimensions.js';

export function scoreSurvey(ratings) {
  const dimScores = {};

  DIMENSIONS.forEach(dim => {
    const values = dim.items.map((_, i) =>
      Number(ratings[`${dim.key}-${i}`])
    ).filter(v => !isNaN(v));

    const avg = values.reduce((a,b)=>a+b,0) / values.length;
    dimScores[dim.key] = Number(avg.toFixed(2));
  });

  const overall =
    Object.values(dimScores).reduce((a,b)=>a+b,0) / DIMENSIONS.length;

  const band = v => {
    if (v >= 4.2) return 'Strong';
    if (v >= 3.6) return 'Stable';
    if (v >= 3.0) return 'Develop';
    return 'Risk';
  };

  const ranked = Object.entries(dimScores)
    .sort((a,b)=>b[1]-a[1]);

  return {
    dimScores,
    overall: Number(overall.toFixed(2)),
    band: band(overall),
    top: ranked.slice(0,3),
    bottom: ranked.slice(-3)
  };
}
