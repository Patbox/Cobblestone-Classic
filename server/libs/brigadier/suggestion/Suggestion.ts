import { StringRange } from '../index.ts';

export class Suggestion {
    private range: StringRange;
    private text: string;
    private tooltip?: string;

    constructor(range: StringRange, text: string, tooltip?: string) {
        this.range = range;
        this.text = text;
        this.tooltip = tooltip;
    }

    getRange() {
        return this.range;
    }

    getText() {
        return this.text;
    }

    getTooltip() {
        return this.tooltip;
    }

    apply(input: string): string {
        if (this.range.getStart() == 0 && this.range.getEnd() === input.length) {
            return this.text;
        }
        let result = "";
        if (this.range.getStart() > 0) {
            result += input.substring(0, this.range.getStart());
        }
        result += this.text;
        if (this.range.getEnd() < input.length) {
            result += input.substring(this.range.getEnd());
        }
        return result;
    }

    expand(command: string, range: StringRange): Suggestion {
        if (range === this.range) {
            return this;
        }
        let result = "";
        if (range.getStart() < this.range.getStart()) {
            result += command.substring(range.getStart(), this.range.getStart());
        }
        result += this.text;
        if (range.getEnd() > this.range.getEnd()) {
            result += command.substring(this.range.getEnd(), range.getEnd());
        }
        return new Suggestion(range, result, this.tooltip);
    }
}
