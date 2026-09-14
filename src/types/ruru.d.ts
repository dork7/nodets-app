declare module 'ruru/server' {
 export interface RuruServerConfig {
  endpoint?: string;
  [key: string]: unknown;
 }

 export function ruruHTML(config: RuruServerConfig): string;
}
