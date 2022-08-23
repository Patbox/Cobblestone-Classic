import { ArgumentType, StringReader, CommandErrorType } from "../index.ts";

export abstract class NumberArgumentType<N extends number | BigInt = number> extends ArgumentType<N> {
    private minimum: N;
    private maximum: N;

    constructor(minimum: N, maximum: N) {
        super();
        this.minimum = minimum;
        this.maximum = maximum;
    }

    getMinimum(): N {
        return this.minimum;
    }

    getMaximum(): N {
        return this.maximum;
    }

    parse(reader: StringReader): N {
        const start = reader.getCursor();
        const result = this.readNumber(reader);
        if (result < this.minimum) {
            reader.setCursor(start);
            throw this.getTooSmallError().createWithContext(reader, result, this.minimum);
        } else if (result > this.maximum) {
            reader.setCursor(start);
            throw this.getTooBigError().createWithContext(reader, result, this.maximum);
        }
        return result;
    }

    abstract readNumber(reader: StringReader): N;

    abstract getTooSmallError(): CommandErrorType;

    abstract getTooBigError(): CommandErrorType;
}
