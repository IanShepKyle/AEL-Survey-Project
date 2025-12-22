import { score } from '../services/scoring.service.js'
import { sendReportEmail } from '../services/email.service.js'

export async function submitSurvey(req, res) {
  try {
    const { org, email, ratings, qualitative } = req.body

    if (!org || !email || !ratings) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const results = score({ ratings })

    await sendReportEmail({
      to: email,
      org,
      results,
      qualitative
    })

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
}
