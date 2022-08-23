import { CommandErrorType } from '../index.ts';

const CONTEXT_AMOUNT = 10;

export class CommandSyntaxError extends Error {
    private input?: string;
    private cursor: number;

    constructor(message: string, input?: string, cursor?: number) {
        super(message);
        Object.setPrototypeOf(this, CommandSyntaxError.prototype);
        this.input = input;
        this.cursor = cursor || 0;

        if (this.input && this.cursor >= 0) {
            this.message += ` at position ${cursor}: `;
            const cursor2 = Math.min(this.input.length, this.cursor);
            this.message += this.cursor > CONTEXT_AMOUNT ? "..." : "";
            this.message += this.input.substring(Math.max(0, cursor2 - CONTEXT_AMOUNT), cursor2);
            this.message += "<--[HERE]";
        }
    }

    static DOUBLE_TOO_SMALL = new CommandErrorType((found, min) => `Double must not be less than ${min}, found ${found}`);
    static DOUBLE_TOO_BIG = new CommandErrorType((found, max) => `Double must not be more than ${max}, found ${found}`);
    static FLOAT_TOO_SMALL = new CommandErrorType((found, min) => `Float must not be less than ${min}, found ${found}`);
    static FLOAT_TOO_BIG = new CommandErrorType((found, max) => `Float must not be more than ${max}, found ${found}`);
    static INTEGER_TOO_SMALL = new CommandErrorType((found, min) => `Integer must not be less than ${min}, found ${found}`);
    static INTEGER_TOO_BIG = new CommandErrorType((found, max) => `Integer must not be more than ${max}, found ${found}`);
    static LONG_TOO_SMALL = new CommandErrorType((found, min) => `Long must not be less than ${min}, found ${found}`);
    static LONG_TOO_BIG = new CommandErrorType((found, max) => `Long must not be more than ${max}, found ${found}`);
    static LITERAL_INCORRECT = new CommandErrorType((expected) => `Expected literal ${expected}`);

    static READER_EXPECTED_START_OF_QUOTE = new CommandErrorType(() => `Expected quote to start a string`);
    static READER_EXPECTED_END_OF_QUOTE = new CommandErrorType(() => `Unclosed quoted string`);
    static READER_INVALID_ESCAPE = new CommandErrorType((character) => `Invalid escape sequence '${character}' in quoted string`);
    static READER_INVALID_BOOL = new CommandErrorType((value) => `Invalid bool, expected true or false but found '${value}'`);
    static READER_EXPECTED_BOOL = new CommandErrorType(() => `Expected bool`);
    static READER_INVALID_INT = new CommandErrorType((value) => `Invalid integer '${value}'`);
    static READER_EXPECTED_INT = new CommandErrorType(() => `Expected integer`);
    static READER_INVALID_FLOAT = new CommandErrorType((value) => `Invalid float '${value}'`);
    static READER_EXPECTED_FLOAT = new CommandErrorType(() => `Expected float`);

    static DISPATCHER_UNKNOWN_COMMAND = new CommandErrorType(() => `Unknown Command`);
    static DISPATCHER_UNKNOWN_ARGUMENT = new CommandErrorType(() => `Incorrect argument for command`);
    static DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR = new CommandErrorType(() => `Expected whitespace to end one argument, but found trailing data`);
    static DISPATCHER_PARSE_ERROR = new CommandErrorType((message) => `Could not parse command: ${message}`);
}
