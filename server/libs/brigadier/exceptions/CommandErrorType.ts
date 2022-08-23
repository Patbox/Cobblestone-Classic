import { CommandSyntaxError, StringReader } from '../index.ts';

type CommandErrorFunction = (...args: any[]) => string;

export class CommandErrorType {
    private func: CommandErrorFunction
    constructor(func: CommandErrorFunction) {
        this.func = func;
    }

    create(...args: any[]): CommandSyntaxError {
        const message = this.func(...args);
        return new CommandSyntaxError(message);
    }

    createWithContext(reader: StringReader, ...args: any[]): CommandSyntaxError {
        const message = this.func(...args);
        return new CommandSyntaxError(message, reader.getString(), reader.getCursor());
    }
}
