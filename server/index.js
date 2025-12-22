import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, '../public')));
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- Email transporter ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// --- Helper: format reports ---
function buildFullReport({ org, email, ratings, qualitative }) {
  return `
ORG: ${org}
RESPONDENT: ${email}

=== RATINGS ===
${JSON.stringify(ratings, null, 2)}

=== QUALITATIVE ===
${JSON.stringify(qualitative, null, 2)}
`;
}

function buildShortReport({ org }) {
  return `
Thank you for completing the Augment Executive Leadership Team Index™.

Organization: ${org}

Your full qualitative and quantitative report will be reviewed by Augment.
You’ll receive follow-up insights shortly.
`;
}

// --- Submission endpoint ---
app.post('/send-email', async (req, res) => {
  const payload = req.body;

  try {
    // 1️⃣ Internal (FULL report)
    await transporter.sendMail({
      from: `"AEL Survey" <${process.env.SMTP_USER}>`,
      to: process.env.INTERNAL_REPORT_EMAIL,
      subject: `NEW AEL Submission — ${payload.org}`,
      text: buildFullReport(payload),
    });

    // 2️⃣ Customer (SHORT report)
    await transporter.sendMail({
      from: `"Augment Solutions" <${process.env.SMTP_USER}>`,
      to: payload.email,
      subject: `Your AEL Snapshot — ${payload.org}`,
      text: buildShortReport(payload),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running at http://localhost:${process.env.PORT || 3000}`);
});
