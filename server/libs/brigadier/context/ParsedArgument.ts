import { StringRange } from '../index.ts';

export class ParsedArgument<T> {
    private range: StringRange;
    private result: T;
    
    constructor(start: number, end: number, result: T) {
        this.range = new StringRange(start, end);
        this.result = result;
    }

    getRange(): StringRange {
        return this.range;
    }

    getResult(): T {
        return this.result;
    }
}
