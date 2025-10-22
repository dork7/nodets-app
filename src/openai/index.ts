import OpenAI from 'openai';

const openai = new OpenAI({
 baseURL: 'https://openrouter.ai/api/v1',
 apiKey: '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',
});

export async function callAI(params: string) {
 const completion = await openai.chat.completions.create({
  model: 'openai/gpt-4o', // or any model listed on OpenRouter
  messages: [{ role: 'user', content: params }],
 });

 console.log(completion.choices[0].message);
 return completion.choices[0].message;
}
