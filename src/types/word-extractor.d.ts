// word-extractor ships without type declarations; only the API used by extractText is typed.
declare module 'word-extractor' {
 interface WordDocument {
  getBody(): string;
  getFootnotes(): string;
  getEndnotes(): string;
 }

 export default class WordExtractor {
  extract(source: string | Buffer): Promise<WordDocument>;
 }
}
