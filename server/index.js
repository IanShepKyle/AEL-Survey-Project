import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import nodemailer from 'nodemailer';
import { DIMENSIONS } from '../public/js/dimensions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Helper function to calculate scores
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

// Generate HTML email content
function generateEmailHTML(org, results) {
  const nameByKey = Object.fromEntries(DIMENSIONS.map(d => [d.key, d.title]));
  const band = results.band(results.overall);
  
  const rows = Object.entries(results.dimScores).map(([k, v]) => {
    const b = results.band(v);
    return `<tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${nameByKey[k]}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${v.toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">
        <span style="background-color: ${getBandColor(b.cls)}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
          ${b.label}
        </span>
      </td>
    </tr>`;
  }).join('');
  
  function list(items) {
    return items.map(([k, v]) => 
      `<li style="margin-bottom: 8px;">${nameByKey[k]} — <strong>${v.toFixed(2)}</strong></li>`
    ).join('');
  }
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .card { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .notice { background-color: #e7f3ff; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; }
        .muted { color: #666; font-size: 14px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin-top: 0;">Augment Leadership Survey</h1>
          <h2>Initial Snapshot Report — ${org || 'Leadership Team'}</h2>
        </div>
        
        <div class="notice">
          <strong>Thank you for completing the survey.</strong> This is an immediate quantitative snapshot. 
          Augment will deliver the full report — integrating your qualitative responses — within 48 hours.
        </div>
        
        <h3>Overall Team Score: ${results.overall.toFixed(2)} / 5.00 
          <span class="badge" style="background-color: ${getBandColor(band.cls)};">${band.label}</span>
        </h3>
        
        <table class="table">
          <thead>
            <tr>
              <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Dimension</th>
              <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Score</th>
              <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        
        <div class="grid">
          <div class="card">
            <h3 style="margin-top: 0;">Top Strengths</h3>
            <ul style="padding-left: 20px; margin-bottom: 0;">${list(results.top)}</ul>
          </div>
          <div class="card">
            <h3 style="margin-top: 0;">Top Opportunities</h3>
            <ul style="padding-left: 20px; margin-bottom: 0;">${list(results.low)}</ul>
          </div>
        </div>
        
        <p class="muted">
          <strong>Banding Guide:</strong><br>
          <span style="color: #4CAF50;">4.2+ Strong</span> · 
          <span style="color: #2196F3;">3.6–4.1 Stable</span> · 
          <span style="color: #FF9800;">3.0–3.5 Develop</span> · 
          <span style="color: #F44336;">&lt;3.0 Risk</span>
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px;">
          This report was generated by Augment's Leadership Assessment Tool.<br>
          For questions, contact ${process.env.REPLY_TO_EMAIL || 'support@augment.com'}
        </p>
      </div>
    </body>
    </html>
  `;
}

// Generate plain text fallback
function generateEmailText(org, results) {
  const nameByKey = Object.fromEntries(DIMENSIONS.map(d => [d.key, d.title]));
  const band = results.band(results.overall);
  
  let text = `AUGMENT LEADERSHIP SURVEY - INITIAL SNAPSHOT REPORT\n`;
  text += `==============================================\n\n`;
  text += `Organization: ${org || 'Leadership Team'}\n\n`;
  text += `Thank you for completing the survey. This is an immediate quantitative snapshot.\n`;
  text += `Augment will deliver the full report — integrating your qualitative responses — within 48 hours.\n\n`;
  text += `OVERALL TEAM SCORE: ${results.overall.toFixed(2)} / 5.00 [${band.label}]\n\n`;
  text += `DIMENSION SCORES:\n`;
  
  Object.entries(results.dimScores).forEach(([k, v]) => {
    const b = results.band(v);
    text += `  ${nameByKey[k]}: ${v.toFixed(2)} [${b.label}]\n`;
  });
  
  text += `\nTOP STRENGTHS:\n`;
  results.top.forEach(([k, v]) => {
    text += `  • ${nameByKey[k]}: ${v.toFixed(2)}\n`;
  });
  
  text += `\nTOP OPPORTUNITIES:\n`;
  results.low.forEach(([k, v]) => {
    text += `  • ${nameByKey[k]}: ${v.toFixed(2)}\n`;
  });
  
  text += `\nBANDING GUIDE:\n`;
  text += `  4.2+ Strong | 3.6–4.1 Stable | 3.0–3.5 Develop | <3.0 Risk\n\n`;
  text += `For questions, contact ${process.env.REPLY_TO_EMAIL || 'support@augment.com'}`;
  
  return text;
}

// Helper function for band colors
function getBandColor(cls) {
  const colors = {
    'strong': '#4CAF50',
    'stable': '#2196F3',
    'develop': '#FF9800',
    'risk': '#F44336'
  };
  return colors[cls] || '#666';
}

function formatReportAsText(org, email, ratings, qualitative) {
  const timestamp = new Date().toLocaleString();
  
  let text = `AUGMENT LEADERSHIP SURVEY - FULL REPORT\n`;
  text += `========================================\n\n`;
  text += `Organization: ${org}\n`;
  text += `Submitted by: ${email}\n`;
  text += `Date: ${timestamp}\n\n`;
  text += `========================================\n`;
  text += `QUANTITATIVE RATINGS\n`;
  text += `========================================\n\n`;
  
  // Format quantitative ratings
  if (typeof ratings === 'object' && ratings !== null) {
    if (ratings.overall !== undefined) {
      text += `Overall Score: ${ratings.overall.toFixed(2)}\n`;
    }
    
    Object.entries(ratings).forEach(([key, value]) => {
      if (key !== 'overall' && key !== 'timestamp') {
        if (typeof value === 'number') {
          text += `${key}: ${value.toFixed(2)}\n`;
        } else if (Array.isArray(value)) {
          text += `${key}: [${value.map(v => v.toFixed(2)).join(', ')}]\n`;
        } else if (typeof value === 'object') {
          text += `${key}:\n`;
          Object.entries(value).forEach(([subKey, subValue]) => {
            text += `  ${subKey}: ${typeof subValue === 'number' ? subValue.toFixed(2) : subValue}\n`;
          });
        }
      }
    });
  }
  
  text += `\n========================================\n`;
  text += `QUALITATIVE RESPONSES\n`;
  text += `========================================\n\n`;
  
  // Format qualitative responses
  if (qualitative && typeof qualitative === 'object') {
    Object.entries(qualitative).forEach(([question, response]) => {
      if (response && response.trim()) {
        text += `Q: ${question}\n`;
        text += `A: ${response}\n\n`;
        text += `-`.repeat(40) + `\n\n`;
      }
    });
  } else {
    text += `No qualitative responses provided.\n\n`;
  }
  
  text += `========================================\n`;
  text += `REPORT END\n`;
  text += `========================================\n`;
  
  return text;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.post('/send-email', async (req, res) => {
  const { org, email, ratings, qualitative } = req.body;
  
  // Validate required fields
  if (!email || !email.includes('@')) {
    return res.status(400).json({ 
      success: false, 
      error: 'Valid email address is required' 
    });
  }
  
  if (!org || org.trim().length < 2) {
    return res.status(400).json({ 
      success: false, 
      error: 'Organization name is required' 
    });
  }
  
  // Calculate scores from ratings
  const results = calculateScores(ratings);
  
  // Configure transporter based on environment
  const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: parseInt(process.env.SMTP_PORT) === 465, // true for SSL, false for TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  // Fallback for development if SMTP env vars aren't set
  if (!isProduction && (!process.env.SMTP_HOST || !process.env.SMTP_USER)) {
    console.warn('⚠️ Using Mailtrap sandbox for development');
    smtpConfig.host = "sandbox.smtp.mailtrap.io";
    smtpConfig.port = 2525;
    smtpConfig.secure = false;
    smtpConfig.auth = {
      user: "e91b6286f55633",
      pass: "899528f6d2ff58"
    };
  }

  const transporter = nodemailer.createTransport(smtpConfig);

  try {
    // Test SMTP connection
    await transporter.verify();
    console.log('✅ SMTP server is ready to send emails');

    // Internal full report as formatted text file
    await transporter.sendMail({
      from: `"AEL Survey" <${process.env.FROM_EMAIL || 'no-reply@augment.com'}>`,
      to: process.env.ADMIN_EMAIL,
      replyTo: process.env.REPLY_TO_EMAIL || email,
      subject: `FULL REPORT — ${org}`,
      text: `Full report for ${org} is attached as a text file.\n\nSubmitted by: ${email}`,
      attachments: [
        {
          filename: `report-${org.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.txt`,
          content: formatReportAsText(org, email, ratings, qualitative),
          contentType: 'text/plain'
        }
      ]
    });

    // Customer summary with formatted HTML
    await transporter.sendMail({
      from: `"Augment" <${process.env.FROM_EMAIL || 'no-reply@augment.com'}>`,
      to: email,
      replyTo: process.env.REPLY_TO_EMAIL || 'support@augment.com',
      subject: `Your Leadership Team Snapshot: ${org}`,
      html: generateEmailHTML(org, results),
      text: generateEmailText(org, results)
    });

    console.log(`✅ Emails sent successfully to ${email} and ${process.env.ADMIN_EMAIL}`);
    res.json({ 
      success: true, 
      message: 'Email sent successfully' 
    });
  } catch (err) {
    console.error('❌ Email sending error:', err);
    
    // Provide more user-friendly error messages
    let errorMessage = 'Failed to send email';
    if (err.code === 'EAUTH') {
      errorMessage = 'Email configuration error. Please contact support.';
    } else if (err.code === 'EENVELOPE') {
      errorMessage = 'Invalid email address. Please check the email and try again.';
    } else if (err.code === 'ECONNECTION') {
      errorMessage = 'Email service temporarily unavailable. Please try again later.';
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: isProduction ? undefined : err.message // Hide details in production
    });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${isProduction ? 'Production' : 'Development'}`);
  if (!isProduction) {
    console.log(`📧 Development SMTP: Mailtrap sandbox`);
  } else if (process.env.SMTP_HOST) {
    console.log(`📧 Production SMTP: ${process.env.SMTP_HOST}`);
  } else {
    console.warn('⚠️ No SMTP configuration found! Emails will not work.');
  }
});