export const name = 'getTime';
export const handler = async () => ({ time: new Date().toISOString() });
