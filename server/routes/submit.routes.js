import express from 'express'
import { submitSurvey } from '../controllers/submit.controller.js'

const router = express.Router()

router.post('/submit', submitSurvey)

export default router
