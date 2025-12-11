export class CustomError extends Error {
 message: string;
 stack: any;

 constructor({ message, stack }: { message: string; stack: string }) {
  super(message);
  this.message = message;
  this.stack = stack;
 }
}
