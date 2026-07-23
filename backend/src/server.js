import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3333);
createApp().listen(port, () => console.log(`JRDEV1 API escutando em http://localhost:${port}`));
