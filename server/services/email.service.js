import sgMail from '@sendgrid/mail'
import fs from 'fs'
import path from 'path'

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

export async function sendReportEmail({ to, org, results }) {
  const templatePath = path.resolve(
    'server/templates/report.email.html'
  )

  let html = fs.readFileSync(templatePath, 'utf8')

  html = html
    .replace('{{ORG}}', org)
    .replace('{{OVERALL}}', results.overall)
    .replace('{{BAND}}', results.band(results.overall))

  await sgMail.send({
    to,
    from: process.env.FROM_EMAIL,
    subject: `Your Leadership Team Index — ${org}`,
    html
  })
}
