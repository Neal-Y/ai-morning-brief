import { handle } from 'hono/vercel'
import app from '../src/api/app.js'

export const config = {
  runtime: 'nodejs20.x',
}

export default handle(app)
