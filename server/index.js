import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import sgMail from '@sendgrid/mail';
import PDFDocument from 'pdfkit';
import fs from 'fs';
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
   PDF REPORT GENERATION
========================= */

function generatePDFReport(org, email, ratings, qualitative, results) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Augment Leadership Report - ${org}`,
        Author: 'Augment Leadership Survey',
        Subject: 'Leadership Team Assessment Report',
        Keywords: 'leadership, assessment, performance, team',
        CreationDate: new Date()
      }
    });

    const chunks = [];
    
    // Collect PDF data
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Add header
    doc.fillColor('#1a237e')
       .fontSize(24)
       .font('Helvetica-Bold')
       .text('Augment Leadership Survey', { align: 'center' });
    
    doc.moveDown(0.5);
    doc.fillColor('#333')
       .fontSize(18)
       .text('Full Assessment Report', { align: 'center' });
    
    doc.moveDown(1);
    doc.fillColor('#444')
       .fontSize(14)
       .font('Helvetica')
       .text(`Organization: ${org}`, { align: 'left' });
    doc.text(`Submitted by: ${email}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Time: ${new Date().toLocaleTimeString()}`);
    
    doc.moveDown(1.5);

    // Overall Score Section
    const overallBand = results.band(results.overall);
    const bandColors = {
      strong: '#4CAF50',
      stable: '#2196F3',
      develop: '#FF9800',
      risk: '#F44336'
    };

    doc.fillColor('#1a237e')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('Overall Assessment', { underline: true });
    
    doc.moveDown(0.5);
    doc.fillColor('#333')
       .fontSize(36)
       .font('Helvetica-Bold')
       .text(`Score: ${results.overall.toFixed(2)}`, { align: 'left' });
    
    doc.fillColor(bandColors[overallBand.cls] || '#666')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`Band: ${overallBand.label}`, { align: 'left' });
    
    doc.moveDown(1.5);

    // Dimension Scores Table
    doc.fillColor('#1a237e')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('Dimension Scores', { underline: true });
    
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 350;
    const col3 = 450;
    
    doc.fillColor('#1a237e')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Dimension', col1, tableTop)
       .text('Score', col2, tableTop)
       .text('Band', col3, tableTop);
    
    doc.moveDown(0.5);
    
    // Table rows
    let y = doc.y;
    const nameByKey = Object.fromEntries(DIMENSIONS.map(d => [d.key, d.title]));
    const entries = Object.entries(results.dimScores);
    
    entries.forEach(([key, score], index) => {
      const band = results.band(score);
      
      // Check if we need a new page before adding content
      if (y > 700) {  // Leave some room for footer
        doc.addPage();
        y = 50;
      }
      
      doc.fillColor('#333')
         .fontSize(11)
         .font('Helvetica')
         .text(nameByKey[key] || key, col1, y);
      
      doc.text(score.toFixed(2), col2, y);
      
      doc.fillColor(bandColors[band.cls] || '#666')
         .font('Helvetica-Bold')
         .text(band.label, col3, y);
      
      y += 25;
    });
    
    // Reset y position for next content
    doc.y = y;
    doc.moveDown(2);

    // Qualitative Responses Section
    if (qualitative && Object.keys(qualitative).length > 0) {
      // Add page if needed
      if (doc.y > 700) {
        doc.addPage();
      }
      
      doc.fillColor('#1a237e')
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('Qualitative Responses', { underline: true });
      
      doc.moveDown(1);
      
      let qy = doc.y;
      Object.entries(qualitative).forEach(([question, answer], index) => {
        if (answer && answer.trim()) {
          // Check if we need a new page
          if (qy > 700) {
            doc.addPage();
            qy = 50;
          }
          
          doc.fillColor('#1a237e')
             .fontSize(12)
             .font('Helvetica-Bold')
             .text(`Q${index + 1}: ${question}`, { continued: false });
          
          qy = doc.y; // Update y position
          
          // Measure answer height
          const answerHeight = doc.heightOfString(answer, {
            width: 500,
            lineGap: 2
          });
          
          // Check if answer fits on current page
          if (qy + answerHeight > 750) {
            doc.addPage();
            qy = 50;
          }
          
          doc.fillColor('#333')
             .fontSize(11)
             .font('Helvetica')
             .text(answer, {
               width: 500,
               align: 'left',
               lineGap: 2
             });
          
          qy = doc.y + 15; // Update y position for next question
          doc.moveDown(1);
        }
      });
    }

    // Raw Ratings Data
    if (ratings && Object.keys(ratings).length > 0) {
      // Add page if needed
      if (doc.y > 700) {
        doc.addPage();
      }
      
      doc.fillColor('#1a237e')
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('Detailed Rating Data', { underline: true });
      
      doc.moveDown(1);
      doc.fillColor('#333')
         .fontSize(10)
         .font('Helvetica');
      
      let ry = doc.y;
      Object.entries(ratings).forEach(([key, value], index) => {
        // Check if we need a new page
        if (ry > 750) {
          doc.addPage();
          ry = 50;
        }
        
        doc.text(`${key}:`, 50, ry);
        doc.text(`${value}`, 250, ry);
        
        ry += 15;
      });
    }

    // IMPORTANT: Get page range BEFORE ending the document
    const pageRange = doc.bufferedPageRange();
    const totalPages = pageRange ? pageRange.count : 0;
    
    if (totalPages > 0) {
      // Add footer to each page
      for (let i = 0; i < totalPages; i++) {
        try {
          doc.switchToPage(i);
          doc.fillColor('#666')
             .fontSize(8)
             .font('Helvetica')
             .text(
               `Page ${i + 1} of ${totalPages} • Augment Leadership Survey • Confidential`,
               50,
               doc.page.height - 30,
               { align: 'center' }
             );
        } catch (err) {
          console.warn(`Could not add footer to page ${i}:`, err.message);
        }
      }
    }

    doc.end();
  });
}

/* =========================
   EMAIL CONTENT HELPERS (unchanged)
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
    // Generate PDF
    const pdfBuffer = await generatePDFReport(org, email, ratings, qualitative, results);
    const pdfBase64 = pdfBuffer.toString('base64');
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeOrgName = org.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    /* ADMIN FULL REPORT AS PDF */
    await sgMail.send({
      to: process.env.ADMIN_EMAIL,
      from: process.env.FROM_EMAIL,
      subject: `FULL REPORT — ${org}`,
      text: 'Full PDF report attached.',
      attachments: [
        {
          content: pdfBase64,
          filename: `leadership-report-${safeOrgName}-${timestamp}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment',
          content_id: `report_${Date.now()}`
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

    console.log(`✅ Emails sent for ${org} (PDF report generated)`);
    res.json({ success: true });

  } catch (err) {
    console.error('❌ Error:', err);

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
  console.log(` Server running on port ${PORT}`);
  console.log(`Environment: ${isProduction ? 'Production' : 'Development'}`);
  console.log(`Email via SendGrid API`);
  console.log(`PDF reports enabled with pdfkit`);
});