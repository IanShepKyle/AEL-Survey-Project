import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import sgMail from '@sendgrid/mail';
import { DIMENSIONS } from '../public/js/dimensions.js';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

/* =========================
   SCORE CALCULATION
========================= */

function calculateScores(ratings) {
  const dimensionScores = {};
  let totalScore = 0;
  let totalQuestions = 0;

  DIMENSIONS.forEach(dim => {
    let sum = 0;
    let count = 0;

    dim.items.forEach((_, index) => {
      const key = `${dim.key}-${index}`;
      const value = Number(ratings[key]);

      if (!isNaN(value)) {
        sum += value;
        count++;
        totalScore += value;
        totalQuestions++;
      }
    });

    dimensionScores[dim.key] = count ? sum / count : 0;
  });

  const overall = totalQuestions ? totalScore / totalQuestions : 0;

  const sorted = Object.entries(dimensionScores)
    .sort((a, b) => b[1] - a[1]);

  const band = score => {
    if (score >= 4.2) return { label: 'Strong', cls: 'strong' };
    if (score >= 3.6) return { label: 'Stable', cls: 'stable' };
    if (score >= 3.0) return { label: 'Develop', cls: 'develop' };
    return { label: 'Risk', cls: 'risk' };
  };

  return {
    overall,
    dimScores: dimensionScores,
    top: sorted.slice(0, 2),
    low: sorted.slice(-2),
    band
  };
}

/* =========================
   EMAIL CONTENT HELPERS
========================= */

function getBandColor(cls) {
  return {
    strong: '#4CAF50',
    stable: '#2196F3',
    develop: '#FF9800',
    risk: '#F44336'
  }[cls] || '#666';
}

function generateEmailHTML(org, results) {
  const nameByKey = Object.fromEntries(DIMENSIONS.map(d => [d.key, d.title]));
  const band = results.band(results.overall);

  const rows = Object.entries(results.dimScores).map(([k, v]) => {
    const b = results.band(v);
    return `
      <tr>
        <td>${nameByKey[k]}</td>
        <td>${v.toFixed(2)}</td>
        <td>
          <span style="background:${getBandColor(b.cls)};color:#fff;padding:4px 8px;border-radius:4px;">
            ${b.label}
          </span>
        </td>
      </tr>`;
  }).join('');

  return `
    <h1>Augment High Performance Index</h1>
    <h2>${org}</h2>
    <h3>
      Overall Score: ${results.overall.toFixed(2)}
      <span style="background:${getBandColor(band.cls)};color:#fff;padding:4px 8px;">
        ${band.label}
      </span>
    </h3>
    <table border="1" cellpadding="8">${rows}</table>
  `;
}

function generateEmailText(org, results) {
  let text = `AUGMENT LEADERSHIP SURVEY\n\n`;
  text += `Organization: ${org}\n`;
  text += `Overall Score: ${results.overall.toFixed(2)}\n\n`;

  Object.entries(results.dimScores).forEach(([k, v]) => {
    const b = results.band(v);
    text += `${k}: ${v.toFixed(2)} (${b.label})\n`;
  });

  return text;
}

function formatReportAsText(org, email, ratings, qualitative) {
  const timestamp = new Date().toLocaleString();

  let text = `AUGMENT LEADERSHIP SURVEY - FULL REPORT\n`;
  text += `========================================\n\n`;
  text += `Organization: ${org}\n`;
  text += `Submitted by: ${email}\n`;
  text += `Date: ${timestamp}\n\n`;

  text += `QUANTITATIVE RATINGS\n`;
  Object.entries(ratings || {}).forEach(([k, v]) => {
    text += `${k}: ${JSON.stringify(v)}\n`;
  });

  text += `\nQUALITATIVE RESPONSES\n`;
  Object.entries(qualitative || {}).forEach(([q, a]) => {
    if (a && a.trim()) {
      text += `Q: ${q}\nA: ${a}\n\n`;
    }
  });

  return text;
}

/* =========================
   ROUTES
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.post('/send-email', async (req, res) => {
  const { org, email, ratings, qualitative } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }

  if (!org || org.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Organization required' });
  }

  const results = calculateScores(ratings);

  try {
    /* ADMIN FULL REPORT */
    await sgMail.send({
      to: process.env.ADMIN_EMAIL,
      from: process.env.FROM_EMAIL,
      subject: `FULL REPORT — ${org}`,
      text: 'Full report attached.',
      attachments: [
        {
          content: Buffer.from(
            formatReportAsText(org, email, ratings, qualitative)
          ).toString('base64'),
          filename: `report-${Date.now()}.txt`,
          type: 'text/plain',
          disposition: 'attachment'
        }
      ]
    });

    /* USER SUMMARY */
    await sgMail.send({
      to: email,
      from: process.env.FROM_EMAIL,
      subject: `Your Leadership Team Snapshot — ${org}`,
      html: generateEmailHTML(org, results),
      text: generateEmailText(org, results)
    });

    console.log(`✅ Emails sent for ${org}`);
    res.json({ success: true });

  } catch (err) {
    console.error('❌ SendGrid error:', err);

    res.status(500).json({
      success: false,
      error: 'Email service temporarily unavailable'
    });
  }
});

/* =========================
   HEALTH CHECK
========================= */

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/* =========================
   SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${isProduction ? 'Production' : 'Development'}`);
  console.log(`📧 Email via SendGrid API`);
});
