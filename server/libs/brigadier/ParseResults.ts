import {
    CommandContextBuilder,
    StringReader,
    CommandNode,
    CommandSyntaxError
} from "./index.ts";

export class ParseResults<S> {
    private context: CommandContextBuilder<S>;
    private reader: StringReader;
    private errors: Map<CommandNode<S>, CommandSyntaxError>;

    constructor(context: CommandContextBuilder<S>, reader: StringReader, errors: Map<CommandNode<S>, CommandSyntaxError>) {
        this.context = context;
        this.reader = reader;
        this.errors = errors;
    }

    getContext(): CommandContextBuilder<S> {
        return this.context;
    }

    getReader(): StringReader {
        return this.reader;
    }

    getErrors(): Map<CommandNode<S>, CommandSyntaxError> {
        return this.errors;
    }
}
