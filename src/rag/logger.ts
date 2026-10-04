import { pino } from 'pino';

// Not the `logger` from '@/server': the ingestion worker runs as its own process
// and importing the server module would boot the whole Express app there.
export const ragLogger = pino({ name: 'rag' });
