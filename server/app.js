import express from 'express'

const app = express()

app.use(express.json())
app.use(express.static('public'))

app.post('/api/submit', (req, res) => {
  console.log('Submission received:', req.body)
  res.json({ success: true })
})

export default app
